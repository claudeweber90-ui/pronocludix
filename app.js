/* ============ Lucarne — logique d'affichage ============ */

const state = {
  data: null,
  league: 'all',
  sort: 'date',
  q: '',
  combo: [],       // ids
  duel: { i: 0, order: [], answered: false, score: 0, played: 0 },
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pct = (v) => Math.round(v * 100);
const dec = (v) => v.toFixed(2).replace('.', ',');

const DTF = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  timeZone: 'Europe/Paris',
});
const DAYF = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

const fmtDate = (iso) => DTF.format(new Date(iso)).replace('.', '');
const outcomeName = (m, k) => (k === 'H' ? m.home : k === 'A' ? m.away : 'Match nul');
const outcomeCode = (k) => (k === 'H' ? '1' : k === 'A' ? '2' : 'N');

/* ---------------- démarrage ---------------- */
init();

async function init() {
  try {
    const res = await fetch('pronos.json');
    state.data = await res.json();
  } catch (e) {
    $('#matchGrid').innerHTML = '<p class="empty">Impossible de charger les données.</p>';
    return;
  }
  const d = state.data;

  // fraîcheur
  const t = new Date(d.collectedAt);
  $('#freshText').textContent = 'Cotes relevées le ' + DTF.format(t);
  $('#footMeta').innerHTML =
    `Données de cotes&nbsp;: OpticOdds (Pinnacle, DraftKings, FanDuel, BetMGM, Caesars).<br>` +
    `Instantané du ${DTF.format(t)} · ${d.matches.length} matchs · Heures de Paris.`;
  $('#heroCount').textContent = d.matches.length;

  buildTicker();
  buildHeroPanel();
  buildPodium();
  buildLeagueFilter();
  bindFilters();
  render();
  renderCombo();
  buildDuel();
  bindSheet();
}

/* ---------------- chiffres clés ---------------- */
function buildTicker() {
  const m = state.data.matches;
  const banco = m.filter((x) => x.verdictKey === 'banco').length;
  const chaos = m.filter((x) => x.verdictKey === 'chaos').length;
  const val = m.filter((x) => x.value).length;
  const avgMargin = m.reduce((s, x) => s + x.margin, 0) / m.length;
  const items = [
    [m.length, 'matchs analysés sur 6 compétitions'],
    [banco, 'affiches où le favori écrase (≥ 60 %)'],
    [chaos, 'matchs sans favori crédible'],
    [avgMargin.toFixed(1).replace('.', ',') + ' %', 'marge bookmaker moyenne, retirée du calcul'],
  ];
  $('#ticker').innerHTML = items.map(([b, s]) => `<li><b>${b}</b><span>${s}</span></li>`).join('');
  void val;
}

/* ---------------- affiche du moment ---------------- */
function buildHeroPanel() {
  const m = state.data.matches;
  // la plus grosse affiche : somme des probabilités des deux favoris la plus serrée + notoriété = on prend
  // le match le plus incertain parmi ceux dont les deux camps sont proches, en privilégiant le plus proche dans le temps
  const soon = m.slice(0, 24);
  const feat = soon.reduce((a, b) => (b.chaos > a.chaos ? b : a), soon[0]);
  const p = feat.probs;
  $('#heroPanel').innerHTML = `
    <p class="feat__kicker">Le match qui divise</p>
    <p class="feat__teams">
      <span>${feat.home}</span>
      <span class="vs">CONTRE</span>
      <span>${feat.away}</span>
    </p>
    <p class="feat__verdict">${feat.verdict} · surprise ${feat.chaos}/100</p>
    <p class="feat__meta">${feat.league} · ${fmtDate(feat.kickoff)}${feat.venue ? ' · ' + feat.venue : ''}</p>
    <div class="bars" style="margin-top:1.1rem" role="img" aria-label="Probabilités ${pct(p.H)} pour cent domicile, ${pct(p.D)} nul, ${pct(p.A)} extérieur">
      <i class="b-h" style="width:${p.H * 100}%"></i><i class="b-d" style="width:${p.D * 100}%"></i><i class="b-a" style="width:${p.A * 100}%"></i>
    </div>
    <div class="feat__line"><span>${feat.home}</span><b>${pct(p.H)} %</b></div>
    <div class="feat__line" style="border:0;padding-top:.35rem;margin-top:.35rem"><span>Match nul</span><b>${pct(p.D)} %</b></div>
    <div class="feat__line" style="border:0;padding-top:.35rem;margin-top:.35rem"><span>${feat.away}</span><b>${pct(p.A)} %</b></div>
  `;
}

/* ---------------- podium ---------------- */
function buildPodium() {
  const m = state.data.matches;
  const banco = [...m].sort((a, b) => b.confidence - a.confidence)[0];
  const withVal = m.filter((x) => x.value);
  const value = withVal.length ? withVal.sort((a, b) => b.value.edge - a.value.edge)[0] : null;
  const chaos = [...m].sort((a, b) => b.chaos - a.chaos)[0];

  const cards = [
    {
      cls: 'pod--a', tag: 'Le plus verrouillé',
      title: `${banco.home} — ${banco.away}`,
      why: `${outcomeName(banco, banco.pick)} à ${pct(banco.pickProb)} %, et les cinq opérateurs sont d'accord.`,
      num: banco.confidence, unit: 'indice de confiance / 100', id: banco.id,
    },
    value ? {
      cls: 'pod--b', tag: 'La meilleure valeur',
      title: `${value.home} — ${value.away}`,
      why: `${outcomeName(value, value.value.sel)} coté ${dec(value.value.price)} chez ${value.value.book}, au-dessus de sa probabilité honnête.`,
      num: '+' + value.value.edge.toFixed(1).replace('.', ',') + ' %', unit: 'écart à la juste valeur', id: value.id,
    } : {
      cls: 'pod--b', tag: 'La meilleure valeur',
      title: 'Aucun écart exploitable',
      why: 'Sur ce lot de matchs, aucune cote ne dépasse sa probabilité honnête. Le marché est bien serré.',
      num: '0', unit: 'opportunité détectée', id: null,
    },
    {
      cls: 'pod--c', tag: 'Le piège absolu',
      title: `${chaos.home} — ${chaos.away}`,
      why: `Trois issues quasi équiprobables. Le favori théorique plafonne à ${pct(chaos.pickProb)} %.`,
      num: chaos.chaos, unit: 'indice de surprise / 100', id: chaos.id,
    },
  ];

  $('#podiumGrid').innerHTML = cards.map((c) => `
    <article class="pod ${c.cls}" ${c.id ? `data-open="${c.id}" role="button" tabindex="0"` : ''}>
      <p class="pod__tag">${c.tag}</p>
      <h3 class="pod__title">${c.title}</h3>
      <p class="pod__why">${c.why}</p>
      <p class="pod__num">${c.num}<small>${c.unit}</small></p>
    </article>`).join('');
}

/* ---------------- filtres ---------------- */
function buildLeagueFilter() {
  const m = state.data.matches;
  const counts = {};
  m.forEach((x) => (counts[x.leagueKey] = (counts[x.leagueKey] || 0) + 1));
  const opts = [{ key: 'all', name: 'Toutes' }, ...state.data.leagues.filter((l) => counts[l.key])];
  $('#leagueFilter').innerHTML = opts.map((o) => `
    <button class="chip" type="button" data-lg="${o.key}" aria-pressed="${o.key === 'all'}">
      ${o.name}<span class="chip__n">${o.key === 'all' ? m.length : counts[o.key]}</span>
    </button>`).join('');
}

function bindFilters() {
  $('#leagueFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lg]');
    if (!b) return;
    state.league = b.dataset.lg;
    $$('#leagueFilter .chip').forEach((c) => c.setAttribute('aria-pressed', c === b));
    render();
  });
  $('#sortSel').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
  $('#search').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); render(); });
}

function visible() {
  let m = state.data.matches;
  if (state.league !== 'all') m = m.filter((x) => x.leagueKey === state.league);
  if (state.q) m = m.filter((x) => (x.home + ' ' + x.away + ' ' + x.homeFull + ' ' + x.awayFull).toLowerCase().includes(state.q));
  const s = state.sort;
  m = [...m].sort((a, b) =>
    s === 'conf' ? b.confidence - a.confidence :
    s === 'chaos' ? b.chaos - a.chaos :
    s === 'edge' ? (b.value ? b.value.edge : -99) - (a.value ? a.value.edge : -99) :
    a.kickoff.localeCompare(b.kickoff));
  return m;
}

/* ---------------- grille ---------------- */
function render() {
  const m = visible();
  $('#resultCount').textContent =
    m.length + (m.length > 1 ? ' matchs affichés' : ' match affiché') +
    (state.sort === 'date' && m.length ? ' — du ' + DAYF.format(new Date(m[0].kickoff)) + ' au ' + DAYF.format(new Date(m[m.length - 1].kickoff)) : '');
  $('#emptyState').hidden = m.length > 0;
  $('#matchGrid').innerHTML = m.map(cardHTML).join('');
  $$('#matchGrid .card').forEach((c) => {
    c.addEventListener('click', (e) => {
      if (e.target.closest('.card__add')) return;
      openSheet(c.dataset.id);
    });
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter') openSheet(c.dataset.id); });
  });
  $$('#matchGrid .card__add').forEach((b) =>
    b.addEventListener('click', (e) => { e.stopPropagation(); toggleLeg(b.dataset.id); }));
}

function cardHTML(m) {
  const p = m.probs;
  const on = state.combo.includes(m.id);
  const rows = [['H', m.home, m.homeLogo], ['D', 'Match nul', null], ['A', m.away, m.awayLogo]];
  return `
  <article class="card" data-id="${m.id}" tabindex="0" role="button" aria-label="Fiche ${m.home} contre ${m.away}">
    <div class="card__head">
      <span class="lg-badge lg-${m.leagueKey}">${m.league}</span>
      <span>${fmtDate(m.kickoff)}</span>
    </div>
    <div class="card__teams">
      ${rows.map(([k, name, logo]) => `
        <div class="team${k === m.pick ? ' team--fav' : ''}">
          ${logo ? `<img src="${logo}" alt="" loading="lazy" decoding="async" width="22" height="22">`
                 : `<span aria-hidden="true" style="width:22px;text-align:center;color:var(--ink-3);font-weight:700">N</span>`}
          <span>${name}</span>
          <span class="team__pct">${pct(p[k])} %</span>
        </div>`).join('')}
    </div>
    <div class="bars" role="img" aria-label="Répartition des probabilités">
      <i class="b-h" style="width:${p.H * 100}%"></i><i class="b-d" style="width:${p.D * 100}%"></i><i class="b-a" style="width:${p.A * 100}%"></i>
    </div>
    <div class="barkey"><span>1 · ${pct(p.H)}</span><span>N · ${pct(p.D)}</span><span>2 · ${pct(p.A)}</span></div>
    <div class="card__foot">
      <span class="pill pill--${m.verdictKey}">${m.verdict}</span>
      ${m.value ? `<span class="pill pill--value">Valeur +${m.value.edge.toFixed(1).replace('.', ',')} %</span>` : ''}
      <button class="card__add" type="button" data-id="${m.id}" data-on="${on ? 1 : 0}">${on ? '✓ Ajouté' : '+ Combiné'}</button>
      <span class="gauge" title="Indice de confiance">
        <span class="gauge__track"><i class="gauge__fill" style="width:${m.confidence}%"></i></span>${m.confidence}
      </span>
    </div>
  </article>`;
}

/* ---------------- fiche match ---------------- */
function bindSheet() {
  $('#sheet').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  document.addEventListener('click', (e) => {
    const p = e.target.closest('[data-open]');
    if (p) openSheet(p.dataset.open);
  });
  document.addEventListener('keydown', (e) => {
    const p = e.target.closest && e.target.closest('[data-open]');
    if (p && e.key === 'Enter') openSheet(p.dataset.open);
  });
}

function closeSheet() {
  const s = $('#sheet');
  if (!s.hidden) { s.hidden = true; document.body.style.overflow = ''; }
}

function openSheet(id) {
  const m = state.data.matches.find((x) => x.id === id);
  if (!m) return;
  const p = m.probs;
  const colors = { H: 'var(--lime)', D: 'var(--amber)', A: 'var(--coral)' };
  const bestOf = (k) => Math.max(...m.priceTable.map((r) => r[k]));

  const outc = ['H', 'D', 'A'].map((k) => `
    <div class="outc__row">
      <span class="outc__name">${outcomeCode(k)} · ${outcomeName(m, k)}</span>
      <span class="outc__val">${pct(p[k])} % · cote juste ${dec(1 / p[k])} · meilleure ${dec(m.best[k].price)} (${m.best[k].book})</span>
      <span class="outc__bar"><i style="width:${p[k] * 100}%;background:${colors[k]}"></i></span>
    </div>`).join('');

  const g = m.goals, b = m.btts;
  const table = `
    <table class="prices">
      <thead><tr><th>Opérateur</th><th>1</th><th>N</th><th>2</th></tr></thead>
      <tbody>${m.priceTable.map((r) => `
        <tr><td>${r.book}</td>
          <td class="${r.H === bestOf('H') ? 'best' : ''}">${dec(r.H)}</td>
          <td class="${r.D === bestOf('D') ? 'best' : ''}">${dec(r.D)}</td>
          <td class="${r.A === bestOf('A') ? 'best' : ''}">${dec(r.A)}</td></tr>`).join('')}
      </tbody>
    </table>`;

  $('#sheetBody').innerHTML = `
    <div class="sh-head">
      <span class="lg-badge lg-${m.leagueKey}">${m.league}</span>
      <h2 class="sh-title" id="sheetTitle">${m.homeFull}<br><span style="font-size:.62em;color:var(--ink-3)">contre</span><br>${m.awayFull}</h2>
      <p class="sh-sub">${fmtDate(m.kickoff)}${m.venue ? ' · ' + m.venue : ''}${m.neutral ? ' · terrain neutre' : ''}</p>
    </div>

    <div class="callout">
      <b>Lecture&nbsp;:</b> ${readOut(m)}
    </div>

    <section class="sh-block">
      <h4>Probabilités sans marge</h4>
      <div class="outc">${outc}</div>
    </section>

    <section class="sh-block">
      <h4>Les indices</h4>
      <div class="duo">
        <div class="mini"><p class="mini__t">Confiance</p><p class="mini__v">${m.confidence}</p><p class="mini__s">domination du favori corrigée du désaccord entre opérateurs</p></div>
        <div class="mini"><p class="mini__t">Surprise</p><p class="mini__v">${m.chaos}</p><p class="mini__s">plus c'est haut, plus l'issue est ouverte</p></div>
        <div class="mini"><p class="mini__t">Double chance la plus sûre</p><p class="mini__v">${m.doubleChance.key}</p><p class="mini__s">${m.doubleChance.label} · ${pct(m.doubleChance.prob)} %</p></div>
        <div class="mini"><p class="mini__t">Marge retirée</p><p class="mini__v">${m.margin.toFixed(1).replace('.', ',')} %</p><p class="mini__s">commission moyenne des ${m.bookCount} opérateurs</p></div>
      </div>
    </section>

    ${g || b ? `<section class="sh-block">
      <h4>Le scénario des buts</h4>
      <div class="duo">
        ${g ? `<div class="mini"><p class="mini__t">Plus de ${String(g.line).replace('.', ',')} buts</p><p class="mini__v">${pct(g.over)} %</p><p class="mini__s">moins de ${String(g.line).replace('.', ',')} buts&nbsp;: ${pct(g.under)} % · meilleure cote ${dec(g.bestOver)}</p></div>` : ''}
        ${b ? `<div class="mini"><p class="mini__t">Les deux marquent</p><p class="mini__v">${pct(b.yes)} %</p><p class="mini__s">non&nbsp;: ${pct(b.no)} % · meilleure cote ${dec(b.bestYes)}</p></div>` : ''}
      </div>
    </section>` : ''}

    <section class="sh-block">
      <h4>Comparateur de cotes 1 N 2</h4>
      ${table}
      <p class="mini__s" style="margin-top:.7rem">Référence utilisée pour le calcul&nbsp;: ${m.anchor === 'Pinnacle' ? 'Pinnacle, l\'opérateur à faible marge' : 'médiane du marché'}.</p>
    </section>
  `;
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  $('.sheet__x').focus();
}

function readOut(m) {
  const p = m.probs, fav = outcomeName(m, m.pick), pf = pct(m.pickProb);
  let t = '';
  if (m.verdictKey === 'banco') t = `${fav} part largement devant (${pf} %). Le marché ne laisse quasiment pas de place au doute, mais la cote reflète déjà tout&nbsp;: peu de gras à récupérer.`;
  else if (m.verdictKey === 'solide') t = `${fav} tient la corde à ${pf} %, sans être à l'abri. Une issue sur deux échappe encore au favori.`;
  else if (m.verdictKey === 'ouvert') t = `${fav} n'a qu'un léger avantage (${pf} %). Le nul pèse ${pct(p.D)} %, ce qui est beaucoup&nbsp;: le match se joue sur un détail.`;
  else t = `Aucun camp ne dépasse ${pf} %. Statistiquement, c'est presque un tirage à trois faces — le genre d'affiche qu'on regarde plutôt qu'on ne parie.`;
  if (m.value) t += ` Un écart de valeur apparaît sur <b>${outcomeName(m, m.value.sel)}</b>&nbsp;: ${dec(m.value.price)} chez ${m.value.book}, soit ${m.value.edge.toFixed(1).replace('.', ',')} % de mieux que la juste cote.`;
  if (m.spread > 2.2) t += ` À noter&nbsp;: les opérateurs sont nettement en désaccord sur ce match, ce qui abaisse l'indice de confiance.`;
  return t;
}

/* ---------------- combiné ---------------- */
function toggleLeg(id) {
  const i = state.combo.indexOf(id);
  if (i >= 0) state.combo.splice(i, 1);
  else if (state.combo.length < 8) state.combo.push(id);
  render();
  renderCombo();
}

function renderCombo() {
  const legs = state.combo.map((id) => state.data.matches.find((x) => x.id === id)).filter(Boolean);
  const box = $('#comboLegs');
  if (!legs.length) {
    box.innerHTML = '<li class="legs__none">Aucune sélection pour l\'instant.</li>';
    $('#comboTotals').innerHTML = '';
    $('#comboHint').innerHTML = 'Cliquez sur <strong>+ Combiné</strong> sur une carte de match.';
    return;
  }
  $('#comboHint').innerHTML = `${legs.length} sélection${legs.length > 1 ? 's' : ''} — la sélection retenue est toujours l'issue la plus probable du match.`;
  box.innerHTML = legs.map((m) => `
    <li class="leg">
      <span class="leg__sel">${outcomeCode(m.pick)}</span>
      <span class="leg__txt">${m.home} — ${m.away}<small>${outcomeName(m, m.pick)} · ${m.league}</small></span>
      <span class="leg__p">${pct(m.pickProb)} %</span>
      <button class="leg__x" type="button" data-rm="${m.id}" aria-label="Retirer ${m.home} contre ${m.away}">&times;</button>
    </li>`).join('');
  $$('#comboLegs [data-rm]').forEach((b) => b.addEventListener('click', () => toggleLeg(b.dataset.rm)));

  const prob = legs.reduce((s, m) => s * m.pickProb, 1);
  const price = legs.reduce((s, m) => s * m.best[m.pick].price, 1);
  const fairPrice = 1 / prob;
  const edge = price * prob - 1;
  $('#comboTotals').innerHTML = `
    <div class="tot">
      <div><b>${(prob * 100).toFixed(1).replace('.', ',')} %</b><span>chance réelle que tout passe</span></div>
      <div><b>${dec(price)}</b><span>cote combinée au meilleur prix</span></div>
      <div class="tot--edge"><b>${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1).replace('.', ',')} %</b><span>écart à la cote juste (${dec(fairPrice)})</span></div>
    </div>
    <p class="combo__verdict">${comboVerdict(legs.length, prob, edge)}</p>`;
}

function comboVerdict(n, prob, edge) {
  const one = Math.round(1 / prob);
  let t = `Avec ${n} jambe${n > 1 ? 's' : ''}, ce combiné passe environ <strong>une fois sur ${one}</strong>. `;
  if (edge > 0.01) t += `Les meilleures cotes disponibles compensent une partie de la marge — c'est rare, et ça reste fragile&nbsp;: une seule jambe suffit à tout faire tomber.`;
  else if (edge > -0.05) t += `Les marges des opérateurs se cumulent&nbsp;: vous perdez déjà ${Math.abs(edge * 100).toFixed(1).replace('.', ',')} % d'espérance avant même le coup d'envoi.`;
  else t += `Chaque jambe empile sa marge&nbsp;: l'espérance est amputée de ${Math.abs(edge * 100).toFixed(1).replace('.', ',')} %. Mathématiquement, deux paris simples valent mieux.`;
  return t;
}

/* ---------------- duel contre le modèle ---------------- */
function buildDuel() {
  const pool = state.data.matches.filter((m) => m.confidence < 80);
  state.duel.order = pool.map((m) => m.id).sort(() => Math.random() - 0.5).slice(0, 12);
  drawDuel();
}

function drawDuel() {
  const d = state.duel;
  const id = d.order[d.i % d.order.length];
  const m = state.data.matches.find((x) => x.id === id);
  const box = $('#duelBox');
  box.innerHTML = `
    <p class="duel__meta">${m.league} · ${fmtDate(m.kickoff)}</p>
    <p class="duel__q">${m.home} <span style="color:var(--ink-3)">contre</span> ${m.away}</p>
    <p class="duel__meta" style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--ink-2)">À votre avis, quelle issue le marché juge-t-il la plus probable&nbsp;?</p>
    <div class="duel__opts">
      ${['H', 'D', 'A'].map((k) => `
        <button class="duel__opt" type="button" data-k="${k}">
          <b>${outcomeCode(k)}</b><small>${outcomeName(m, k)}</small>
        </button>`).join('')}
    </div>
    <div class="duel__reveal" id="duelReveal"></div>
    <div class="duel__foot">
      <button class="btn btn--ghost" type="button" id="duelNext">Match suivant</button>
      <p class="score">Score&nbsp;: <b id="duelScore">${d.score}</b> pt${d.score > 1 ? 's' : ''} en ${d.played} manche${d.played > 1 ? 's' : ''}</p>
    </div>`;
  $$('#duelBox .duel__opt').forEach((b) => b.addEventListener('click', () => answerDuel(m, b.dataset.k)));
  $('#duelNext').addEventListener('click', () => { state.duel.i++; drawDuel(); });
}

function answerDuel(m, k) {
  const d = state.duel;
  if (d.answered && d.lastId === m.id) return;
  d.answered = true; d.lastId = m.id; d.played++;
  const good = k === m.pick;
  // score de Brier simplifié : on récompense la proximité avec la probabilité réelle
  const pts = Math.max(0, Math.round(m.probs[k] * 100) - 20);
  d.score += pts;

  $$('#duelBox .duel__opt').forEach((b) => {
    const bk = b.dataset.k;
    b.dataset.state = bk === m.pick ? 'win' : bk === k ? 'pick' : 'lose';
  });
  const p = m.probs;
  $('#duelReveal').innerHTML = `
    <div class="duel__bars" role="img" aria-label="Probabilités réelles">
      <i style="width:${p.H * 100}%;background:var(--lime)"></i>
      <i style="width:${p.D * 100}%;background:var(--amber)"></i>
      <i style="width:${p.A * 100}%;background:var(--coral)"></i>
    </div>
    <p class="duel__msg">
      ${good ? '<strong>Vu.</strong> ' : '<strong>Raté.</strong> '}
      Le marché place <strong>${outcomeName(m, m.pick)}</strong> devant à ${pct(m.pickProb)} %
      (1&nbsp;: ${pct(p.H)} % · N&nbsp;: ${pct(p.D)} % · 2&nbsp;: ${pct(p.A)} %).
      Votre choix valait ${pct(p[k])} % — ${pts} point${pts > 1 ? 's' : ''}.
    </p>`;
  $('#duelScore').textContent = d.score;
}
