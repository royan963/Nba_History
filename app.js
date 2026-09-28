// ===================================================================
// UTILITIES
// ===================================================================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function fmtNum(v, decimals = 1) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return Number(v).toFixed(decimals);
}
function fmtInt(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return Number(v).toLocaleString('en-US');
}
function fmtPct(v, decimals = 1) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return (Number(v) * 100).toFixed(decimals) + '%';
}

// rows-of-arrays -> array of objects, using a columns map
function toObjects(payload) {
  const { columns, rows } = payload;
  return rows.map(r => {
    const o = {};
    columns.forEach((c, i) => { o[c] = r[i]; });
    return o;
  });
}

const CAREER = toObjects(PLAYER_CAREER);
const SEASONS = toObjects(PLAYER_SEASONS);
const ERA = ERA_TRENDS; // already array of objects
const TEAMS = TEAM_SEASONS; // already array of objects

// index helpers
const careerById = new Map(CAREER.map(p => [p.player_id, p]));
const seasonsByPlayer = new Map();
SEASONS.forEach(s => {
  if (!seasonsByPlayer.has(s.player_id)) seasonsByPlayer.set(s.player_id, []);
  seasonsByPlayer.get(s.player_id).push(s);
});
seasonsByPlayer.forEach(list => list.sort((a, b) => a.season - b.season));

const teamsByName = new Map();
TEAMS.forEach(t => {
  if (!teamsByName.has(t.team)) teamsByName.set(t.team, []);
  teamsByName.get(t.team).push(t);
});
teamsByName.forEach(list => list.sort((a, b) => a.season - b.season));

const eraBySeason = new Map(ERA.map(e => [e.season, e]));

// ===================================================================
// CHART.JS GLOBAL DEFAULTS — match design system
// ===================================================================
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#b7afa0';
Chart.defaults.borderColor = 'rgba(241,235,224,0.08)';

const PALETTE = {
  amber: '#ff9d2e',
  amberDim: 'rgba(255,157,46,0.15)',
  blue: '#4a8fb8',
  blueDim: 'rgba(74,143,184,0.15)',
  wood: '#d99a5c',
  chalk: '#f1ebe0',
  chalkDim: '#b7afa0',
  grid: 'rgba(241,235,224,0.07)',
};

function baseChartOptions(extra = {}) {
  return Object.assign({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: { color: PALETTE.chalkDim, font: { family: "'JetBrains Mono', monospace", size: 11 }, boxWidth: 12, boxHeight: 12 }
      },
      tooltip: {
        backgroundColor: '#1f1a16',
        borderColor: 'rgba(241,235,224,0.18)',
        borderWidth: 1,
        titleFont: { family: "'JetBrains Mono', monospace", size: 12 },
        bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
        padding: 10,
        titleColor: PALETTE.amber,
        bodyColor: PALETTE.chalk,
      }
    },
    scales: {
      x: { grid: { color: PALETTE.grid }, ticks: { color: PALETTE.chalkDim, font: { size: 11 } } },
      y: { grid: { color: PALETTE.grid }, ticks: { color: PALETTE.chalkDim, font: { size: 11 } } }
    }
  }, extra);
}

// ===================================================================
// TAB NAVIGATION
// ===================================================================
// Scope to the top-level nav row ONLY (#main-tabs) — the Compare view has
// its own inner .tab-btn sub-tabs (Player Comparison / Team Comparison)
// living in a different .tabs container, which must NOT be caught by this
// handler, since they toggle .compare-mode-view, not .view.
$$('#main-tabs > .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('#main-tabs > .tab-btn').forEach(b => b.classList.remove('active'));
    $$('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    $('#view-' + btn.dataset.view).classList.add('active');
    // lazy-init charts on first view
    if (btn.dataset.view === 'evolution') initEvolutionView();
    if (btn.dataset.view === 'leaders') initLeadersView();
    if (btn.dataset.view === 'teams') { initTeamsView(); initTeamMap(); }
    if (btn.dataset.view === 'compare') { initCompareView(); }
  });
});

// ===================================================================
// HERO TICKER — headline all-time facts
// ===================================================================
function renderHeroTicker() {
  const first = ERA[0], last = ERA[ERA.length - 1];
  const peakPace = ERA.reduce((a, b) => (b.pace || 0) > (a.pace || 0) ? b : a);
  const lowPace = ERA.filter(e => e.pace).reduce((a, b) => (b.pace) < (a.pace) ? b : a);
  const top3pa = ERA.reduce((a, b) => (b.x3p_ar || 0) > (a.x3p_ar || 0) ? b : a);
  const topScorer = CAREER.reduce((a, b) => (b.pts || 0) > (a.pts || 0) ? b : a);

  const cells = [
    { label: 'Fastest season', value: `${fmtNum(peakPace.pace, 1)}`, sub: `pace · ${peakPace.season}` },
    { label: 'Slowest season', value: `${fmtNum(lowPace.pace, 1)}`, sub: `pace · ${lowPace.season}` },
    { label: 'Peak 3PT rate', value: fmtPct(top3pa.x3p_ar), sub: `of all shots · ${top3pa.season}` },
    { label: 'All-time scorer', value: topScorer.player, sub: `${fmtInt(topScorer.pts)} pts` },
    { label: 'Seasons tracked', value: ERA.length, sub: `${first.season}–${last.season}` },
  ];

  $('#hero-ticker').innerHTML = cells.map(c => `
    <div class="ticker-cell">
      <span class="t-label">${c.label}</span>
      <div class="t-value">${c.value}</div>
      <div class="t-sub">${c.sub}</div>
    </div>
  `).join('');
}


// ===================================================================
// SCOREBOARD / SEASON SLIDER (signature element)
// ===================================================================
function eraLabel(season) {
  if (season < 1950) return 'BAA Founding Era';
  if (season < 1954) return 'Pre-Shot-Clock Era';
  if (season < 1968) return 'Russell Dynasty Era';
  if (season < 1980) return 'Run-and-Gun Era';
  if (season < 1992) return 'Early 3PT / Showtime Era';
  if (season < 2005) return 'Hand-Check Era';
  if (season < 2015) return 'Pace-and-Space Dawn';
  return 'Three-Point Era';
}

let prevSeasonStats = null;

function renderScoreboard(season) {
  // find nearest available season with data (handles any gaps)
  let e = eraBySeason.get(season);
  if (!e) {
    const seasonsAvail = ERA.map(x => x.season);
    const nearest = seasonsAvail.reduce((a, b) => Math.abs(b - season) < Math.abs(a - season) ? b : a);
    e = eraBySeason.get(nearest);
  }

  $('#sb-season').textContent = e.season;
  $('#sb-era-label').textContent = eraLabel(e.season);

  const slider = $('#season-slider');
  const pct = ((e.season - 1947) / (2026 - 1947)) * 100;
  slider.style.setProperty('--fill', pct + '%');
  if (slider.value != e.season) slider.value = e.season;

  const stats = [
    { label: 'Pace', value: fmtNum(e.pace, 1), unit: 'poss/48', key: 'pace' },
    { label: 'Pts / Game', value: fmtNum(e.pts_per_game, 1), unit: 'pts', key: 'pts_per_game' },
    { label: '3PA Rate', value: fmtPct(e.x3p_ar), unit: '', key: 'x3p_ar' },
    { label: '3P%', value: fmtPct(e.x3p_percent), unit: '', key: 'x3p_percent' },
    { label: 'Off. Rating', value: fmtNum(e.o_rtg, 1), unit: '', key: 'o_rtg' },
    { label: 'True Shooting', value: fmtPct(e.ts_percent), unit: '', key: 'ts_percent' },
  ];

  $('#sb-stats').innerHTML = stats.map(s => {
    let deltaHtml = '';
    if (prevSeasonStats) {
      const prevVal = prevSeasonStats[s.key];
      const curVal = e[s.key];
      if (prevVal != null && curVal != null && prevVal !== 0) {
        const diff = curVal - prevVal;
        const dir = Math.abs(diff) < (Math.abs(prevVal) * 0.001) ? 'flat' : (diff > 0 ? 'up' : 'down');
        const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '·';
        deltaHtml = `<span class="delta ${dir}">${arrow} ${diff > 0 ? '+' : ''}${fmtNum(diff, 2)}</span>`;
      }
    }
    return `<div class="sb-stat">
      <span class="label">${s.label}</span>
      <div class="value">${s.value}<span class="unit">${s.unit}</span></div>
      ${deltaHtml}
    </div>`;
  }).join('');

  prevSeasonStats = e;
}

const slider = $('#season-slider');
slider.addEventListener('input', () => {
  prevSeasonStats = null; // no delta needed on manual scrub for clarity... actually keep continuity
  renderScoreboard(parseInt(slider.value, 10));
});

// Playback
let playInterval = null;
let playing = false;
$('#play-btn').addEventListener('click', () => {
  playing = !playing;
  $('#play-btn').innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
  $('#playback-label').textContent = playing ? 'Playing through history…' : 'Drag the slider — or hit play to watch the league evolve';
  if (playing) {
    if (parseInt(slider.value, 10) >= 2026) slider.value = 1947;
    playInterval = setInterval(() => {
      let v = parseInt(slider.value, 10) + 1;
      if (v > 2026) {
        clearInterval(playInterval);
        playing = false;
        $('#play-btn').innerHTML = '&#9654;';
        $('#playback-label').textContent = 'Drag the slider — or hit play to watch the league evolve';
        return;
      }
      slider.value = v;
      renderScoreboard(v);
    }, 110);
  } else {
    clearInterval(playInterval);
  }
});

// ===================================================================
// OVERVIEW CHART — pace + scoring dual axis
// ===================================================================
let overviewChart = null;
function renderOverviewChart() {
  const labels = ERA.map(e => e.season);
  const ctx = $('#overview-chart').getContext('2d');
  if (overviewChart) overviewChart.destroy();
  overviewChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Pace (poss/48)',
          data: ERA.map(e => e.pace),
          borderColor: PALETTE.blue,
          backgroundColor: PALETTE.blueDim,
          yAxisID: 'y',
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
          fill: true,
        },
        {
          label: 'Points / Game',
          data: ERA.map(e => e.pts_per_game),
          borderColor: PALETTE.amber,
          backgroundColor: PALETTE.amberDim,
          yAxisID: 'y1',
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
          fill: true,
        }
      ]
    },
    options: baseChartOptions({
      scales: {
        x: { grid: { color: PALETTE.grid }, ticks: { color: PALETTE.chalkDim, maxTicksLimit: 12 } },
        y: { position: 'left', grid: { color: PALETTE.grid }, ticks: { color: PALETTE.chalkDim }, title: { display: true, text: 'Pace', color: PALETTE.blue, font: { family: "'JetBrains Mono', monospace", size: 11 } } },
        y1: { position: 'right', grid: { display: false }, ticks: { color: PALETTE.chalkDim }, title: { display: true, text: 'Pts/Game', color: PALETTE.amber, font: { family: "'JetBrains Mono', monospace", size: 11 } } },
      }
    })
  });
}


// ===================================================================
// ERA EVOLUTION VIEW
// ===================================================================
const EVO_STATS = [
  { key: 'pace', label: 'Pace', fmt: v => fmtNum(v, 1) },
  { key: 'pts_per_game', label: 'Points/Game', fmt: v => fmtNum(v, 1) },
  { key: 'o_rtg', label: 'Off. Rating', fmt: v => fmtNum(v, 1) },
  { key: 'x3p_ar', label: '3PA Rate', fmt: v => fmtPct(v) },
  { key: 'x3p_percent', label: '3P%', fmt: v => fmtPct(v) },
  { key: 'fg_percent', label: 'FG%', fmt: v => fmtPct(v) },
  { key: 'ast_per_game', label: 'Assists/Game', fmt: v => fmtNum(v, 1) },
  { key: 'orb_per_game', label: 'Off. Rebounds/Game', fmt: v => fmtNum(v, 1) },
  { key: 'ts_percent', label: 'True Shooting %', fmt: v => fmtPct(v) },
];

let currentEvoStat = 'pace';
let evolutionChart = null;
let evoInitialized = false;

function renderEvoPills() {
  $('#evo-stat-pills').innerHTML = EVO_STATS.map(s =>
    `<button class="pill-btn ${s.key === currentEvoStat ? 'active' : ''}" data-stat="${s.key}">${s.label}</button>`
  ).join('');
  $$('#evo-stat-pills .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentEvoStat = btn.dataset.stat;
      $$('#evo-stat-pills .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderEvolutionChart();
    });
  });
}

function renderEvolutionChart() {
  const stat = EVO_STATS.find(s => s.key === currentEvoStat);
  const labels = ERA.map(e => e.season);
  const data = ERA.map(e => e[currentEvoStat]);
  const ctx = $('#evolution-chart').getContext('2d');
  if (evolutionChart) evolutionChart.destroy();
  evolutionChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: stat.label,
        data,
        borderColor: PALETTE.amber,
        backgroundColor: PALETTE.amberDim,
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 2.5,
        fill: true,
      }]
    },
    options: baseChartOptions({
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1f1a16', borderColor: 'rgba(241,235,224,0.18)', borderWidth: 1,
          titleColor: PALETTE.amber, bodyColor: PALETTE.chalk,
          titleFont: { family: "'JetBrains Mono', monospace", size: 12 },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
          callbacks: {
            label: (ctx) => stat.fmt(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: { grid: { color: PALETTE.grid }, ticks: { color: PALETTE.chalkDim, maxTicksLimit: 14 } },
        y: { grid: { color: PALETTE.grid }, ticks: { color: PALETTE.chalkDim, callback: (v) => stat.fmt(v) } }
      }
    })
  });
}

let threePtChart = null, ortgChart = null;
function renderSmallCharts() {
  const labels = ERA.map(e => e.season);

  const ctx1 = $('#three-pt-chart').getContext('2d');
  if (threePtChart) threePtChart.destroy();
  threePtChart = new Chart(ctx1, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '3PA Rate',
        data: ERA.map(e => e.x3p_ar),
        borderColor: PALETTE.wood,
        backgroundColor: 'rgba(217,154,92,0.12)',
        tension: 0.25, pointRadius: 0, borderWidth: 2, fill: true,
      }]
    },
    options: baseChartOptions({
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtPct(ctx.parsed.y) } } },
      scales: {
        x: { grid: { color: PALETTE.grid }, ticks: { color: PALETTE.chalkDim, maxTicksLimit: 8 } },
        y: { grid: { color: PALETTE.grid }, ticks: { color: PALETTE.chalkDim, callback: v => fmtPct(v, 0) } }
      }
    })
  });

  const ctx2 = $('#ortg-chart').getContext('2d');
  if (ortgChart) ortgChart.destroy();
  ortgChart = new Chart(ctx2, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Off. Rating', data: ERA.map(e => e.o_rtg), borderColor: PALETTE.amber, tension: 0.25, pointRadius: 0, borderWidth: 2 },
        { label: 'Def. Rating', data: ERA.map(e => e.d_rtg), borderColor: PALETTE.blue, tension: 0.25, pointRadius: 0, borderWidth: 2 },
      ]
    },
    options: baseChartOptions({
      scales: {
        x: { grid: { color: PALETTE.grid }, ticks: { color: PALETTE.chalkDim, maxTicksLimit: 8 } },
        y: { grid: { color: PALETTE.grid }, ticks: { color: PALETTE.chalkDim } }
      }
    })
  });
}

function initEvolutionView() {
  if (evoInitialized) return;
  evoInitialized = true;
  renderEvoPills();
  renderEvolutionChart();
  renderSmallCharts();
}


// ===================================================================
// LEADERBOARDS VIEW
// ===================================================================
const LB_STATS = [
  { key: 'pts', label: 'Points' },
  { key: 'trb', label: 'Rebounds' },
  { key: 'ast', label: 'Assists' },
  { key: 'stl', label: 'Steals' },
  { key: 'blk', label: 'Blocks' },
  { key: 'x3p', label: '3-Pointers Made' },
  { key: 'g', label: 'Games Played' },
  { key: 'ppg', label: 'Points / Game (avg)' },
  { key: 'rpg', label: 'Rebounds / Game (avg)' },
  { key: 'apg', label: 'Assists / Game (avg)' },
];

let lbSortKey = 'pts';
let lbSortDir = 'desc';
let lbInitialized = false;

function eraFilterPredicate(eraVal) {
  if (eraVal === 'all') return () => true;
  const [start, end] = eraVal.split('-').map(Number);
  return (p) => p.last_season >= start && p.first_season <= end;
}

function renderLbControls() {
  $('#lb-stat-select').innerHTML = LB_STATS.map(s => `<option value="${s.key}">${s.label}</option>`).join('');
  $('#lb-stat-select').value = lbSortKey;
  $('#lb-stat-select').addEventListener('change', (e) => {
    lbSortKey = e.target.value;
    renderLbTable();
  });
  $('#lb-search').addEventListener('input', renderLbTable);
  $('#lb-era-select').addEventListener('change', renderLbTable);
}

function renderLbTable() {
  const search = $('#lb-search').value.trim().toLowerCase();
  const eraVal = $('#lb-era-select').value;
  const eraPred = eraFilterPredicate(eraVal);

  let rows = CAREER.filter(p => p.g >= 1);
  if (search) rows = rows.filter(p => p.player.toLowerCase().includes(search));
  rows = rows.filter(eraPred);

  rows = rows.slice().sort((a, b) => {
    const av = a[lbSortKey] ?? -Infinity;
    const bv = b[lbSortKey] ?? -Infinity;
    return lbSortDir === 'desc' ? bv - av : av - bv;
  });

  const top = rows.slice(0, 100);

  const cols = [
    { key: 'rank', label: '#' },
    { key: 'player', label: 'Player' },
    { key: 'pos', label: 'Pos' },
    { key: 'first_season', label: 'Span' },
    { key: 'g', label: 'GP' },
    { key: 'pts', label: 'PTS' },
    { key: 'trb', label: 'REB' },
    { key: 'ast', label: 'AST' },
    { key: 'ppg', label: 'PPG' },
  ];

  $('#lb-thead').innerHTML = cols.map(c =>
    `<th data-key="${c.key}" class="${c.key === lbSortKey ? 'sorted' : ''}">${c.label}${c.key === lbSortKey ? (lbSortDir === 'desc' ? ' ↓' : ' ↑') : ''}</th>`
  ).join('');

  $$('#lb-thead th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (key === 'rank' || key === 'player' || key === 'pos') return;
      if (lbSortKey === key) {
        lbSortDir = lbSortDir === 'desc' ? 'asc' : 'desc';
      } else {
        lbSortKey = key;
        lbSortDir = 'desc';
      }
      $('#lb-stat-select').value = LB_STATS.find(s => s.key === lbSortKey) ? lbSortKey : $('#lb-stat-select').value;
      renderLbTable();
    });
  });

  $('#lb-tbody').innerHTML = top.map((p, i) => `
    <tr>
      <td class="rank-cell">${i + 1}</td>
      <td class="name-cell" data-pid="${p.player_id}">${p.player}${p.hof ? '<span class="hof-badge">HOF</span>' : ''}</td>
      <td>${p.pos || '—'}</td>
      <td>${p.first_season}–${p.last_season}</td>
      <td>${fmtInt(p.g)}</td>
      <td>${fmtInt(p.pts)}</td>
      <td>${fmtInt(p.trb)}</td>
      <td>${fmtInt(p.ast)}</td>
      <td>${fmtNum(p.ppg, 1)}</td>
    </tr>
  `).join('');

  $$('#lb-tbody .name-cell').forEach(td => {
    td.addEventListener('click', () => {
      goToPlayer(td.dataset.pid);
    });
  });
}

function initLeadersView() {
  if (lbInitialized) return;
  lbInitialized = true;
  renderLbControls();
  renderLbTable();
}

function goToPlayer(playerId) {
  $$('.tab-btn').forEach(b => b.classList.remove('active'));
  $$('.view').forEach(v => v.classList.remove('active'));
  $('.tab-btn[data-view="players"]').classList.add('active');
  $('#view-players').classList.add('active');
  selectPlayer(playerId);
}


// ===================================================================
// PLAYER EXPLORER VIEW
// ===================================================================
const PLAYER_STAT_OPTIONS = [
  { key: 'pts', label: 'Points/Game' },
  { key: 'trb', label: 'Rebounds/Game' },
  { key: 'ast', label: 'Assists/Game' },
  { key: 'stl', label: 'Steals/Game' },
  { key: 'blk', label: 'Blocks/Game' },
  { key: 'fg_pct', label: 'FG%' },
  { key: 'x3p_pct', label: '3P%' },
  { key: 'mp', label: 'Minutes/Game' },
];
let currentPlayerStat = 'pts';
let playerChart = null;
let currentPlayerId = null;

// notable default list: top 300 by career pts + all HOF
const notablePlayerIds = new Set();
CAREER.slice().sort((a, b) => (b.pts || 0) - (a.pts || 0)).slice(0, 300).forEach(p => notablePlayerIds.add(p.player_id));
CAREER.filter(p => p.hof).forEach(p => notablePlayerIds.add(p.player_id));
const notablePlayers = CAREER.filter(p => notablePlayerIds.has(p.player_id))
  .sort((a, b) => (b.pts || 0) - (a.pts || 0));

function renderPlayerSuggestions() {
  const picks = ['jamesle01', 'jordami01', 'abdulka01', 'birdla01', 'curryst01', 'duncati01'];
  const found = picks.map(id => careerById.get(id)).filter(Boolean);
  $('#player-suggestions').innerHTML = found.map(p =>
    `<button class="pill-btn" data-pid="${p.player_id}">${p.player}</button>`
  ).join('');
  $$('#player-suggestions .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => selectPlayer(btn.dataset.pid));
  });
}

const searchInput = $('#player-search');
const searchResults = $('#player-search-results');

// Strip diacritics for comparison only (display names keep accents) so
// typing "jokic" or "doncic" finds "Jokić" / "Dončić" etc.
function normalizeForSearch(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
const playerSearchKey = new Map(CAREER.map(p => [p.player_id, normalizeForSearch(p.player)]));

searchInput.addEventListener('input', () => {
  const q = normalizeForSearch(searchInput.value.trim());
  if (!q) {
    searchResults.classList.remove('show');
    return;
  }
  let matches;
  if (q.length < 2) {
    matches = notablePlayers.filter(p => playerSearchKey.get(p.player_id).startsWith(q)).slice(0, 12);
  } else {
    matches = CAREER.filter(p => playerSearchKey.get(p.player_id).includes(q)).slice(0, 30);
    matches.sort((a, b) => (b.pts || 0) - (a.pts || 0));
    matches = matches.slice(0, 12);
  }
  if (matches.length === 0) {
    searchResults.innerHTML = `<div class="psr-item" style="cursor:default;color:var(--chalk-dim);">No players found</div>`;
    searchResults.classList.add('show');
    return;
  }
  searchResults.innerHTML = matches.map(p => `
    <div class="psr-item" data-pid="${p.player_id}">
      <span>${p.player}${p.hof ? '<span class="hof-badge">HOF</span>' : ''}</span>
      <span class="psr-meta">${p.first_season}–${p.last_season}</span>
    </div>
  `).join('');
  $$('.psr-item', searchResults).forEach(item => {
    item.addEventListener('click', () => {
      if (!item.dataset.pid) return;
      const player = careerById.get(item.dataset.pid);
      selectPlayer(item.dataset.pid);
      searchInput.value = player ? player.player : '';
      searchResults.classList.remove('show');
    });
  });
  searchResults.classList.add('show');
});

document.addEventListener('click', (e) => {
  if (!searchResults.contains(e.target) && e.target !== searchInput) {
    searchResults.classList.remove('show');
  }
});

function renderPlayerStatPills() {
  $('#pc-stat-pills').innerHTML = PLAYER_STAT_OPTIONS.map(s =>
    `<button class="pill-btn ${s.key === currentPlayerStat ? 'active' : ''}" data-stat="${s.key}">${s.label}</button>`
  ).join('');
  $$('#pc-stat-pills .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPlayerStat = btn.dataset.stat;
      $$('#pc-stat-pills .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPlayerChart(currentPlayerId);
    });
  });
}

function selectPlayer(playerId) {
  const player = careerById.get(playerId);
  if (!player) return;
  currentPlayerId = playerId;

  $('#player-empty').style.display = 'none';
  $('#player-card').classList.add('show');

  $('#pc-name').innerHTML = player.player + (player.hof ? '<span class="hof-badge">Hall of Fame</span>' : '');
  const heightStr = player.ht_in_in ? `${Math.floor(player.ht_in_in / 12)}'${player.ht_in_in % 12}"` : '—';
  $('#pc-meta').textContent = `${player.pos || '—'} · ${player.first_season}–${player.last_season} (${player.seasons_played} seasons) · ${heightStr}${player.wt ? `, ${player.wt} lb` : ''}`;

  const stats = [
    { l: 'Games', v: fmtInt(player.g) },
    { l: 'Points', v: fmtInt(player.pts) },
    { l: 'Rebounds', v: fmtInt(player.trb) },
    { l: 'Assists', v: fmtInt(player.ast) },
    { l: 'PPG', v: fmtNum(player.ppg, 1) },
    { l: 'RPG', v: fmtNum(player.rpg, 1) },
    { l: 'APG', v: fmtNum(player.apg, 1) },
  ];
  $('#pc-stats').innerHTML = stats.map(s => `<div class="ps-cell"><div class="v">${s.v}</div><div class="l">${s.l}</div></div>`).join('');

  renderPlayerStatPills();
  renderPlayerChart(playerId);
  renderAwardsTimeline(playerId);
  renderShotProfile(playerId);
  renderPositionAndPbp(playerId);

  $('#view-players').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const PERCENT_STAT_KEYS = new Set(['fg_pct', 'x3p_pct']);

function formatPlayerStatValue(statKey, rawValue) {
  if (rawValue == null) return '—';
  if (PERCENT_STAT_KEYS.has(statKey)) {
    // raw values are stored as whole percent numbers already (e.g. 39.3),
    // not fractions, per the player_seasons data prep — display at 2 decimals
    // so season-to-season shooting changes are actually visible.
    return rawValue.toFixed(2) + '%';
  }
  return rawValue.toFixed(1);
}

function renderPlayerChart(playerId) {
  const seasons = seasonsByPlayer.get(playerId) || [];
  const statDef = PLAYER_STAT_OPTIONS.find(s => s.key === currentPlayerStat);
  const isPercentStat = PERCENT_STAT_KEYS.has(currentPlayerStat);
  const labels = seasons.map(s => s.season);
  const data = seasons.map(s => s[currentPlayerStat]);

  const ctx = $('#player-chart').getContext('2d');
  if (playerChart) playerChart.destroy();
  playerChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: statDef.label,
        data,
        borderColor: PALETTE.amber,
        backgroundColor: PALETTE.amberDim,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: PALETTE.amber,
        pointHoverRadius: 6,
        borderWidth: 2.5,
        fill: true,
      }]
    },
    options: baseChartOptions({
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1f1a16', borderColor: 'rgba(241,235,224,0.18)', borderWidth: 1,
          titleColor: PALETTE.amber, bodyColor: PALETTE.chalk,
          titleFont: { family: "'JetBrains Mono', monospace", size: 12 },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
          callbacks: {
            label: (ctx) => `${statDef.label}: ${formatPlayerStatValue(currentPlayerStat, ctx.parsed.y)}`,
            afterTitle: (items) => {
              const s = seasons[items[0].dataIndex];
              return `${s.team || ''}${s.age ? ' · age ' + s.age : ''}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: PALETTE.grid }, ticks: { color: PALETTE.chalkDim } },
        y: {
          grid: { color: PALETTE.grid },
          ticks: {
            color: PALETTE.chalkDim,
            callback: (v) => isPercentStat ? v.toFixed(2) + '%' : v
          }
        }
      }
    })
  });
}

renderPlayerSuggestions();


// ===================================================================
// TEAM MAP VIEW (D3 + topojson)
// ===================================================================
const GEO = toObjects(TEAM_GEO); // [{season, franchise, team_name, city, lat, lng, current_name, status, w, l, srs, o_rtg, d_rtg, pace, pts_per_game, playoffs, abbr, primary_color, secondary_color, badge_code}, ...]

// group geo rows by franchise lineage for relocation-path drawing
const geoByFranchise = new Map();
GEO.forEach(g => {
  if (!geoByFranchise.has(g.franchise)) geoByFranchise.set(g.franchise, []);
  geoByFranchise.get(g.franchise).push(g);
});
geoByFranchise.forEach(list => list.sort((a, b) => a.season - b.season));

// unique franchise list with full season span (for "team active in season X" checks)
const franchiseSpans = new Map(); // franchise -> {minSeason, maxSeason, rows: [...]}
geoByFranchise.forEach((rows, franchise) => {
  franchiseSpans.set(franchise, {
    minSeason: rows[0].season,
    maxSeason: rows[rows.length - 1].season,
    rows
  });
});

// distinct cities a franchise has occupied, in chronological order, deduped consecutive repeats
function franchiseCityPath(franchise) {
  const rows = geoByFranchise.get(franchise);
  const path = [];
  rows.forEach(r => {
    const last = path[path.length - 1];
    if (!last || last.city !== r.city) {
      path.push({ city: r.city, lat: r.lat, lng: r.lng, firstSeason: r.season });
    }
  });
  return path;
}

let mapProjection = null;
let mapPath = null;
let mapSvg = null;
let mapInitialized = false;
let mapPlaying = false;
let mapPlayInterval = null;

const MARKER_R_ACTIVE = 14;
const MARKER_R_INACTIVE = 8;

function initTeamMap() {
  if (mapInitialized) return;
  mapInitialized = true;

  const container = document.getElementById('us-map-container');
  const width = 760, height = 460;

  const topo = STATES_TOPOJSON;
  const statesGeo = topojson.feature(topo, topo.objects.states);
  // Exclude Alaska/Hawaii (not adjacent to the mainland) AND outlying
  // territories (Puerto Rico, Guam, etc.) — their far-flung bounding boxes
  // were badly skewing fitExtent's scale calculation for the whole map.
  const EXCLUDE_REGIONS = new Set([
    'Alaska', 'Hawaii', 'American Samoa', 'Guam',
    'Commonwealth of the Northern Mariana Islands',
    'Puerto Rico', 'United States Virgin Islands'
  ]);
  const usMainland = {
    type: 'FeatureCollection',
    features: statesGeo.features.filter(f => !EXCLUDE_REGIONS.has(f.properties.name))
  };

  const canadaTopo = CANADA_TOPOJSON;
  const canadaGeo = topojson.feature(canadaTopo, canadaTopo.objects.canada);

  // Fit to the continental US mainland, reserving headroom above for Canada
  // (which extends naturally from this same projection rather than being
  // independently fit — its full geometry reaches the Arctic and would
  // badly skew the scale if fit directly).
  mapProjection = d3.geoAlbers().fitExtent([[20, 120], [width - 20, height - 20]], usMainland);
  mapPath = d3.geoPath(mapProjection);

  mapSvg = d3.select(container).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('role', 'img')
    .attr('aria-label', 'Map of the United States and Canada showing NBA team locations by season');

  const tooltip = d3.select(container).append('div').attr('class', 'map-tooltip');

  mapSvg.append('g').attr('class', 'canada-layer')
    .append('path')
    .attr('class', 'state-path country-path')
    .attr('d', mapPath(canadaGeo));

  mapSvg.append('g').attr('class', 'states-layer')
    .selectAll('path')
    .data(usMainland.features)
    .join('path')
    .attr('class', 'state-path')
    .attr('d', mapPath);

  mapSvg.append('g').attr('class', 'relocation-layer');
  mapSvg.append('g').attr('class', 'leader-layer');
  mapSvg.append('g').attr('class', 'markers-layer');

  renderMapForSeason(2026, tooltip);

  // wire up controls
  const slider = document.getElementById('map-season-slider');
  slider.addEventListener('input', () => {
    renderMapForSeason(parseInt(slider.value, 10), tooltip);
  });

  document.getElementById('map-play-btn').addEventListener('click', () => {
    mapPlaying = !mapPlaying;
    const btn = document.getElementById('map-play-btn');
    btn.innerHTML = mapPlaying ? '&#10074;&#10074;' : '&#9654;';
    if (mapPlaying) {
      if (parseInt(slider.value, 10) >= 2026) slider.value = 1947;
      mapPlayInterval = setInterval(() => {
        let v = parseInt(slider.value, 10) + 1;
        if (v > 2026) {
          clearInterval(mapPlayInterval);
          mapPlaying = false;
          btn.innerHTML = '&#9654;';
          return;
        }
        slider.value = v;
        renderMapForSeason(v, tooltip);
      }, 200);
    } else {
      clearInterval(mapPlayInterval);
    }
  });

  document.getElementById('map-toggle-map').addEventListener('click', () => setMapViewMode('map'));
  document.getElementById('map-toggle-grid').addEventListener('click', () => setMapViewMode('grid'));
}

function setMapViewMode(mode) {
  document.getElementById('map-toggle-map').classList.toggle('active', mode === 'map');
  document.getElementById('map-toggle-grid').classList.toggle('active', mode === 'grid');
  document.getElementById('map-panel').style.display = mode === 'map' ? 'block' : 'none';
  document.querySelector('.map-legend').style.display = mode === 'map' ? 'flex' : 'none';
  document.getElementById('team-grid').style.display = mode === 'grid' ? 'grid' : 'none';
}

function teamsActiveInSeason(season) {
  const active = [];
  franchiseSpans.forEach((span, franchise) => {
    const row = span.rows.find(r => r.season === season);
    if (row) active.push(row);
  });
  return active;
}

// Group markers that project to (nearly) the same point and fan them out in a
// small circle around the shared point, so co-located franchises (e.g. Lakers
// and Clippers, both in Los Angeles) are each independently visible and clickable.
function layoutMarkers(markerData) {
  // Step 1: exact-duplicate cities (e.g. Lakers & Clippers, both Los Angeles)
  // get fanned into a small ring around their shared true point.
  const SAME_LOCATION_DIST = 6; // px — essentially identical projected point
  const FAN_RADIUS = 24;        // px — ring radius for exact-duplicate clusters

  markerData.forEach(d => {
    const p = mapProjection([d.row.lng, d.row.lat]);
    d.trueX = p ? p[0] : -1000;
    d.trueY = p ? p[1] : -1000;
  });

  const buckets = new Map();
  markerData.forEach((d, i) => {
    const key = `${Math.round(d.trueX / SAME_LOCATION_DIST)}:${Math.round(d.trueY / SAME_LOCATION_DIST)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  });

  buckets.forEach(cluster => {
    if (cluster.length === 1) {
      const d = markerData[cluster[0]];
      d.x = d.trueX;
      d.y = d.trueY;
      return;
    }
    const cx = cluster.reduce((s, i) => s + markerData[i].trueX, 0) / cluster.length;
    const cy = cluster.reduce((s, i) => s + markerData[i].trueY, 0) / cluster.length;
    const clusterSize = cluster.length;
    const radius = clusterSize <= 2 ? FAN_RADIUS : FAN_RADIUS * (1 + (clusterSize - 2) * 0.35);
    cluster.forEach((idx, k) => {
      const angle = (-Math.PI / 2) + (k * 2 * Math.PI / clusterSize);
      const d = markerData[idx];
      d.x = cx + radius * Math.cos(angle);
      d.y = cy + radius * Math.sin(angle);
    });
  });

  // Step 2: gentle iterative repulsion for markers that are simply close
  // together (a dense region like the Northeast corridor or the 1950s
  // Midwest) without being exact duplicates. This nudges any pair still
  // closer than MIN_SEP apart, a little at a time, capped at a few passes
  // so it settles without becoming a runaway physics simulation.
  const MIN_SEP = 38;       // px — minimum comfortable center-to-center spacing
  const PASSES = 40;
  const STEP = 0.5;
  for (let pass = 0; pass < PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < markerData.length; i++) {
      for (let j = i + 1; j < markerData.length; j++) {
        const a = markerData[i], b = markerData[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.01) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); dist = 0.01; }
        if (dist < MIN_SEP) {
          moved = true;
          const push = (MIN_SEP - dist) * STEP;
          const ux = dx / dist, uy = dy / dist;
          a.x -= ux * push / 2; a.y -= uy * push / 2;
          b.x += ux * push / 2; b.y += uy * push / 2;
        }
      }
    }
    if (!moved) break;
  }

  markerData.forEach(d => {
    const moved = Math.abs(d.x - d.trueX) > 1 || Math.abs(d.y - d.trueY) > 1;
    d.offsetFromTrue = moved;
  });

  return markerData;
}

function renderMapForSeason(season, tooltip) {
  document.getElementById('map-sb-season').textContent = season;
  const slider = document.getElementById('map-season-slider');
  if (parseInt(slider.value, 10) !== season) slider.value = season;

  const activeRows = teamsActiveInSeason(season);
  const activeFranchises = new Set(activeRows.map(r => r.franchise));
  document.getElementById('map-sb-count-label').textContent =
    `${activeRows.length} team${activeRows.length === 1 ? '' : 's'} in the league`;

  // relocation paths: accumulate as moves happen chronologically up to `season`
  const relocationLines = [];
  geoByFranchise.forEach((rows, franchise) => {
    const path = franchiseCityPath(franchise);
    if (path.length < 2) return;
    const visiblePath = path.filter(p => p.firstSeason <= season);
    if (visiblePath.length < 2) return;
    for (let i = 0; i < visiblePath.length - 1; i++) {
      relocationLines.push({ from: visiblePath[i], to: visiblePath[i + 1], franchise });
    }
  });

  const relocSel = mapSvg.select('.relocation-layer').selectAll('path').data(relocationLines, (d, i) => i);
  relocSel.join('path')
    .attr('class', 'relocation-path')
    .attr('d', d => {
      const p1 = mapProjection([d.from.lng, d.from.lat]);
      const p2 = mapProjection([d.to.lng, d.to.lat]);
      if (!p1 || !p2) return '';
      const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2 - 18;
      return `M${p1[0]},${p1[1]} Q${mx},${my} ${p2[0]},${p2[1]}`;
    });

  // markers: one per franchise, positioned at its CURRENT location as of `season`
  let markerData = [];
  franchiseSpans.forEach((span, franchise) => {
    const rowsUpToSeason = span.rows.filter(r => r.season <= season);
    if (rowsUpToSeason.length === 0) return; // not founded yet
    const isActive = activeFranchises.has(franchise);
    const lastRow = rowsUpToSeason[rowsUpToSeason.length - 1];
    // only show a "ghost" marker for one season after a franchise's last game —
    // long enough to see where a team went dark, not so long it clutters later eras
    const longDefunct = (!isActive) && (season - lastRow.season > 1);
    if (longDefunct && season > span.maxSeason) return;
    markerData.push({ franchise, row: lastRow, isActive });
  });

  markerData = layoutMarkers(markerData);

  // leader lines: thin connector from fanned position back to true geographic point
  const leaderData = markerData.filter(d => d.offsetFromTrue);
  const leaderSel = mapSvg.select('.leader-layer').selectAll('line').data(leaderData, d => d.franchise);
  leaderSel.join('line')
    .attr('class', 'marker-leader')
    .attr('x1', d => d.trueX).attr('y1', d => d.trueY)
    .attr('x2', d => d.x).attr('y2', d => d.y);

  // marker groups: colored badge circle + abbreviation text, sized/dimmed by active status
  const markerSel = mapSvg.select('.markers-layer').selectAll('g.team-marker').data(markerData, d => d.franchise);

  const markerEnter = markerSel.enter().append('g').attr('class', 'team-marker');
  markerEnter.append('circle').attr('class', 'marker-badge-ring');
  markerEnter.append('circle').attr('class', 'marker-badge-fill');
  markerEnter.append('text').attr('class', 'marker-badge-text');

  const markerMerge = markerEnter.merge(markerSel);

  markerMerge
    .attr('transform', d => `translate(${d.x},${d.y})`)
    .style('opacity', d => d.isActive ? 1 : 0.45)
    .style('cursor', 'pointer')
    .each(function (d) {
      const g = d3.select(this);
      const r = d.isActive ? MARKER_R_ACTIVE : MARKER_R_INACTIVE;
      g.select('.marker-badge-ring')
        .attr('r', r + 1.5)
        .attr('fill', 'none')
        .attr('stroke', d.row.secondary_color)
        .attr('stroke-width', d.isActive ? 1.5 : 1);
      g.select('.marker-badge-fill')
        .attr('r', r)
        .attr('fill', d.row.primary_color);
      g.select('.marker-badge-text')
        .attr('font-size', d.isActive ? 9.5 : 7.5)
        .attr('font-weight', 700)
        .attr('font-family', "'JetBrains Mono', monospace")
        .attr('fill', d.row.secondary_color)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('dy', '0.32em')
        .text(d.row.abbr || d.row.badge_code);
    })
    .on('mouseenter', function (event, d) {
      const r = d.row;
      tooltip.html(`
        <div class="mt-name">${r.team_name}</div>
        <div class="mt-meta">${r.city} · ${r.season}${r.w != null ? ` · ${r.w}-${r.l}` : ''}</div>
        ${d.isActive ? '' : '<div class="mt-meta" style="margin-top:3px;opacity:0.7;">Not active this season</div>'}
      `).style('opacity', 1);
      d3.select(this).raise();
    })
    .on('mousemove', function (event) {
      const [x, y] = d3.pointer(event, document.getElementById('us-map-container'));
      tooltip.style('left', (x + 14) + 'px').style('top', (y - 10) + 'px');
    })
    .on('mouseleave', function () {
      tooltip.style('opacity', 0);
    })
    .on('click', function (event, d) {
      goToTeam(d.franchise);
    });

  markerSel.exit().remove();

  // keep active markers drawn above inactive/ghost markers
  mapSvg.select('.markers-layer').selectAll('g.team-marker').sort((a, b) => (a.isActive === b.isActive) ? 0 : (a.isActive ? 1 : -1));
}

function goToTeam(franchiseName) {
  $$('.tab-btn').forEach(b => b.classList.remove('active'));
  $$('.view').forEach(v => v.classList.remove('active'));
  $('.tab-btn[data-view="teams"]').classList.add('active');
  $('#view-teams').classList.add('active');
  initTeamsView();
  selectTeam(franchiseName);
}


// ===================================================================
// ROSTER BY SEASON (Team Explorer)
// ===================================================================
// Build a season+abbreviation -> franchise bridge from TEAM_GEO (already
// has every historical abbreviation mapped to its franchise lineage), then
// index every individual-team player-season row (excluding 2TM/3TM/etc
// combined rows) by franchise+season for the roster table.
const seasonAbbrToFranchise = new Map();
GEO.forEach(g => {
  seasonAbbrToFranchise.set(`${g.season}:${g.abbr}`, g.franchise);
});

const MULTITEAM_CODES = new Set(['2TM', '3TM', '4TM', '5TM']);
const rosterByFranchiseSeason = new Map(); // "franchise:season" -> [player rows]

SEASONS.forEach(s => {
  if (MULTITEAM_CODES.has(s.team)) return; // skip combined rows; use individual team stints
  const franchise = seasonAbbrToFranchise.get(`${s.season}:${s.team}`);
  if (!franchise) return; // shouldn't happen given full coverage, but fail safe
  const key = `${franchise}:${s.season}`;
  if (!rosterByFranchiseSeason.has(key)) rosterByFranchiseSeason.set(key, []);
  rosterByFranchiseSeason.get(key).push(s);
});

const ROSTER_COLS = [
  { key: 'player', label: 'Player', sortable: false },
  { key: 'pos', label: 'Pos', sortable: false },
  { key: 'age', label: 'Age', sortable: true },
  { key: 'g', label: 'GP', sortable: true },
  { key: 'gs', label: 'GS', sortable: true },
  { key: 'mp', label: 'MIN', sortable: true },
  { key: 'pts', label: 'PTS', sortable: true },
  { key: 'trb', label: 'REB', sortable: true },
  { key: 'ast', label: 'AST', sortable: true },
  { key: 'fg_pct', label: 'FG%', sortable: true, isPct: true },
  { key: 'x3p_pct', label: '3P%', sortable: true, isPct: true },
  { key: 'ft_pct', label: 'FT%', sortable: true, isPct: true },
];

let rosterSortKey = 'pts';
let rosterSortDir = 'desc';
let currentRosterFranchise = null;
let currentRosterSeason = null;
let rosterInitialized = false;

function initRosterForFranchise(franchiseName) {
  const span = franchiseSpans.get(franchiseName);
  if (!span) return;
  currentRosterFranchise = franchiseName;

  const slider = $('#roster-season-slider');
  slider.min = span.minSeason;
  slider.max = span.maxSeason;
  // default to the most recent season with an actual roster (guards against
  // any edge-case season gaps in the underlying team data)
  currentRosterSeason = span.maxSeason;
  slider.value = currentRosterSeason;

  $('#roster-slider-ticks').innerHTML = `<span>${span.minSeason}</span><span>${span.maxSeason}</span>`;

  renderRosterForSeason();

  if (!rosterInitialized) {
    rosterInitialized = true;
    slider.addEventListener('input', () => {
      currentRosterSeason = parseInt(slider.value, 10);
      renderRosterForSeason();
    });
    $('#roster-search').addEventListener('input', renderRosterTable);
  }
}

function renderRosterForSeason() {
  $('#roster-season-label').textContent = currentRosterSeason;
  const span = franchiseSpans.get(currentRosterFranchise);
  const teamRowThisSeason = span.rows.find(r => r.season === currentRosterSeason);
  $('#roster-team-name-label').textContent = teamRowThisSeason ? teamRowThisSeason.team_name : '';
  renderRosterTable();
}

function renderRosterTable() {
  const key = `${currentRosterFranchise}:${currentRosterSeason}`;
  let roster = rosterByFranchiseSeason.get(key) || [];

  const search = $('#roster-search').value.trim().toLowerCase();
  if (search) roster = roster.filter(p => p.player.toLowerCase().includes(search));

  roster = roster.slice().sort((a, b) => {
    const av = a[rosterSortKey] ?? -Infinity;
    const bv = b[rosterSortKey] ?? -Infinity;
    return rosterSortDir === 'desc' ? bv - av : av - bv;
  });

  $('#roster-thead').innerHTML = ROSTER_COLS.map(c =>
    `<th data-key="${c.key}" class="${c.sortable && c.key === rosterSortKey ? 'sorted' : ''}" style="${c.sortable ? '' : 'cursor:default;'}">${c.label}${c.key === rosterSortKey ? (rosterSortDir === 'desc' ? ' \u2193' : ' \u2191') : ''}</th>`
  ).join('');

  $$('#roster-thead th').forEach(th => {
    const col = ROSTER_COLS.find(c => c.key === th.dataset.key);
    if (!col || !col.sortable) return;
    th.addEventListener('click', () => {
      if (rosterSortKey === col.key) {
        rosterSortDir = rosterSortDir === 'desc' ? 'asc' : 'desc';
      } else {
        rosterSortKey = col.key;
        rosterSortDir = 'desc';
      }
      renderRosterTable();
    });
  });

  if (roster.length === 0) {
    $('#roster-tbody').innerHTML = `<tr><td colspan="${ROSTER_COLS.length}"><div class="roster-empty-note">${search ? 'No players match that filter.' : 'No roster data for this season.'}</div></td></tr>`;
    return;
  }

  $('#roster-tbody').innerHTML = roster.map(p => `
    <tr>
      <td class="name-cell" data-pid="${p.player_id}">${p.player}</td>
      <td>${p.pos || '—'}</td>
      <td>${p.age != null ? p.age : '—'}</td>
      <td>${p.g != null ? p.g : '—'}</td>
      <td>${p.gs != null ? p.gs : '—'}</td>
      <td>${fmtNum(p.mp, 1)}</td>
      <td>${fmtNum(p.pts, 1)}</td>
      <td>${fmtNum(p.trb, 1)}</td>
      <td>${fmtNum(p.ast, 1)}</td>
      <td>${p.fg_pct != null ? (p.fg_pct * 100).toFixed(2) + '%' : '—'}</td>
      <td>${p.x3p_pct != null ? (p.x3p_pct * 100).toFixed(2) + '%' : '—'}</td>
      <td>${p.ft_pct != null ? (p.ft_pct * 100).toFixed(2) + '%' : '—'}</td>
    </tr>
  `).join('');

  $$('#roster-tbody .name-cell').forEach(td => {
    td.addEventListener('click', () => {
      goToPlayer(td.dataset.pid);
    });
  });
}


// ===================================================================
// TEAM EXPLORER VIEW (franchise-lineage aware: groups relocated teams together)
// ===================================================================
const TEAM_STAT_OPTIONS = [
  { key: 'w', label: 'Wins' },
  { key: 'srs', label: 'SRS (Strength)' },
  { key: 'o_rtg', label: 'Off. Rating' },
  { key: 'd_rtg', label: 'Def. Rating' },
  { key: 'pace', label: 'Pace' },
  { key: 'pts_per_game', label: 'Points/Game' },
];
let currentTeamStat = 'w';
let teamChart = null;
let currentFranchise = null;
let teamsInitialized = false;

// franchiseSpans / geoByFranchise are defined in app_part7.js (map module) and
// reused here so the grid, map, and detail panel all agree on what a "team" is.

function renderTeamGrid() {
  const franchises = Array.from(franchiseSpans.keys()).sort();
  $('#team-grid').innerHTML = franchises.map(fr => {
    const span = franchiseSpans.get(fr);
    const latestRow = span.rows[span.rows.length - 1];
    const displayName = latestRow.current_name || latestRow.team_name;
    return `<button class="team-chip" data-franchise="${fr}">
      <div class="tc-name">${displayName}</div>
      <div class="tc-meta">${span.minSeason}–${span.maxSeason}${latestRow.status !== 'active' ? ' · defunct' : ''}</div>
    </button>`;
  }).join('');

  $$('#team-grid .team-chip').forEach(chip => {
    chip.addEventListener('click', () => selectTeam(chip.dataset.franchise));
  });
}

function renderTeamStatPills() {
  $('#tc-stat-pills').innerHTML = TEAM_STAT_OPTIONS.map(s =>
    `<button class="pill-btn ${s.key === currentTeamStat ? 'active' : ''}" data-stat="${s.key}">${s.label}</button>`
  ).join('');
  $$('#tc-stat-pills .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTeamStat = btn.dataset.stat;
      $$('#tc-stat-pills .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTeamChart(currentFranchise);
    });
  });
}

function selectTeam(franchiseName) {
  currentFranchise = franchiseName;
  $$('#team-grid .team-chip').forEach(c => c.classList.toggle('active', c.dataset.franchise === franchiseName));

  const span = franchiseSpans.get(franchiseName);
  if (!span) return;
  const list = span.rows;
  const latest = list[list.length - 1];
  const totalSeasons = list.length;
  const playoffSeasons = list.filter(t => t.playoffs).length;
  const displayName = latest.current_name || latest.team_name;

  // build a human-readable lineage string if the franchise changed cities/names
  const cityPath = franchiseCityPath(franchiseName);
  const nameChain = [];
  let lastName = null;
  list.forEach(r => { if (r.team_name !== lastName) { nameChain.push(r.team_name); lastName = r.team_name; } });
  const lineageNote = nameChain.length > 1 ? nameChain.join(' → ') : '';

  $('#team-panel').style.display = 'block';
  $('#tc-name').textContent = displayName;
  $('#tc-meta').innerHTML = `${span.minSeason}–${span.maxSeason} · ${totalSeasons} seasons · ${playoffSeasons} playoff appearances` +
    (latest.status !== 'active' ? ' · <span style="color:var(--chalk-dim)">no longer in the NBA</span>' : ` · currently "${latest.abbr || ''}"`) +
    (lineageNote ? `<br><span style="opacity:0.75;">${lineageNote}</span>` : '');

  renderTeamStatPills();
  renderTeamChart(franchiseName);
  initRosterForFranchise(franchiseName);

  $('#team-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderTeamChart(franchiseName) {
  const span = franchiseSpans.get(franchiseName);
  const list = span.rows;
  const statDef = TEAM_STAT_OPTIONS.find(s => s.key === currentTeamStat);
  const labels = list.map(t => t.season);
  const data = list.map(t => t[currentTeamStat]);

  const ctx = $('#team-chart').getContext('2d');
  if (teamChart) teamChart.destroy();
  teamChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: statDef.label,
        data,
        borderColor: PALETTE.blue,
        backgroundColor: PALETTE.blueDim,
        tension: 0.25,
        pointRadius: 2,
        pointHoverRadius: 6,
        borderWidth: 2.5,
        fill: true,
        segment: {
          borderColor: ctx => {
            const t = list[ctx.p1DataIndex];
            return t && t.playoffs ? PALETTE.amber : PALETTE.blue;
          }
        }
      }]
    },
    options: baseChartOptions({
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1f1a16', borderColor: 'rgba(241,235,224,0.18)', borderWidth: 1,
          titleColor: PALETTE.amber, bodyColor: PALETTE.chalk,
          titleFont: { family: "'JetBrains Mono', monospace", size: 12 },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
          callbacks: {
            afterTitle: (items) => {
              const t = list[items[0].dataIndex];
              return `${t.team_name} (${t.city}) · ${t.w ?? '\u2014'}-${t.l ?? '\u2014'} · ${t.playoffs ? 'Made playoffs' : 'Missed playoffs'}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: PALETTE.grid }, ticks: { color: PALETTE.chalkDim, maxTicksLimit: 14 } },
        y: { grid: { color: PALETTE.grid }, ticks: { color: PALETTE.chalkDim } }
      }
    })
  });
}

function initTeamsView() {
  if (teamsInitialized) return;
  teamsInitialized = true;
  renderTeamGrid();
}

// ===================================================================
// BOOTSTRAP
// ===================================================================
renderHeroTicker();
renderOverviewChart();
renderScoreboard(2026);
document.getElementById('topbar-player-count').textContent = CAREER.length.toLocaleString('en-US');
document.getElementById('player-explorer-count').textContent = CAREER.length.toLocaleString('en-US');


// ===================================================================
// PLAYER DEEP-DIVE: shooting zones, play-by-play, awards (app_part8)
// ===================================================================
const SHOOTING = toObjects(PLAYER_SHOOTING);
const PBP = toObjects(PLAYER_PBP);
const AWARD_SHARES = toObjects(PLAYER_AWARD_SHARES);
const EOS_TEAMS = toObjects(PLAYER_EOS_TEAMS);

const shootingByPlayer = new Map();
SHOOTING.forEach(s => {
  if (!shootingByPlayer.has(s.player_id)) shootingByPlayer.set(s.player_id, []);
  shootingByPlayer.get(s.player_id).push(s);
});
shootingByPlayer.forEach(list => list.sort((a, b) => a.season - b.season));

const pbpByPlayer = new Map();
PBP.forEach(p => {
  if (!pbpByPlayer.has(p.player_id)) pbpByPlayer.set(p.player_id, []);
  pbpByPlayer.get(p.player_id).push(p);
});
pbpByPlayer.forEach(list => list.sort((a, b) => a.season - b.season));

const awardsByPlayer = new Map();
AWARD_SHARES.forEach(a => {
  if (!awardsByPlayer.has(a.player_id)) awardsByPlayer.set(a.player_id, []);
  awardsByPlayer.get(a.player_id).push(a);
});

const eosByPlayer = new Map();
EOS_TEAMS.forEach(e => {
  if (!eosByPlayer.has(e.player_id)) eosByPlayer.set(e.player_id, []);
  eosByPlayer.get(e.player_id).push(e);
});

const LEAGUE_AVG = toObjects(LEAGUE_AVG_SHOOTING);
const leagueAvgBySeason = new Map(LEAGUE_AVG.map(r => [r.season, r]));

const AWARD_LABELS = {
  'nba mvp': 'MVP',
  'nba dpoy': 'Defensive Player of the Year',
  'nba mip': 'Most Improved Player',
  'nba roy': 'Rookie of the Year',
  'nba smoy': 'Sixth Man of the Year',
  'nba clutch_poy': 'Clutch Player of the Year',
  'aba mvp': 'ABA MVP',
  'aba roy': 'ABA Rookie of the Year',
  'baa roy': 'BAA Rookie of the Year',
};

const AWARD_SHORT = {
  'nba mvp': 'MVP',
  'nba dpoy': 'DPOY',
  'nba mip': 'MIP',
  'nba roy': 'ROY',
  'nba smoy': '6MOY',
  'nba clutch_poy': 'Clutch POY',
  'aba mvp': 'ABA MVP',
  'aba roy': 'ABA ROY',
  'baa roy': 'BAA ROY',
};


// ===================================================================
// AWARDS TIMELINE
// ===================================================================
function renderAwardsTimeline(playerId) {
  const shares = awardsByPlayer.get(playerId) || [];
  const eosSelections = eosByPlayer.get(playerId) || [];

  if (shares.length === 0 && eosSelections.length === 0) {
    $('#pc-awards-panel').style.display = 'none';
    return;
  }
  $('#pc-awards-panel').style.display = 'block';

  // merge into one timeline keyed by season
  const bySeasonMap = new Map();
  const touchSeason = (season) => {
    if (!bySeasonMap.has(season)) bySeasonMap.set(season, { wins: [], votes: [], teams: [] });
    return bySeasonMap.get(season);
  };

  shares.forEach(a => {
    const bucket = touchSeason(a.season);
    if (a.winner) {
      bucket.wins.push(a);
    } else if (a.share > 0.05) {
      // only show meaningful voting finishes, not every single vote-getter
      bucket.votes.push(a);
    }
  });

  eosSelections.forEach(e => {
    touchSeason(e.season).teams.push(e);
  });

  const seasons = Array.from(bySeasonMap.keys()).sort((a, b) => b - a); // most recent first

  if (seasons.length === 0) {
    $('#pc-awards-timeline').innerHTML = `<div class="awards-empty">No major awards or All-NBA/All-Defense selections on record.</div>`;
    return;
  }

  $('#pc-awards-timeline').innerHTML = seasons.map(season => {
    const bucket = bySeasonMap.get(season);
    const pills = [];

    bucket.wins.forEach(a => {
      pills.push(`<span class="award-pill won"><span class="award-trophy">🏆</span>${AWARD_LABELS[a.award] || a.award}</span>`);
    });
    bucket.teams.forEach(e => {
      const label = e.team_type === 'All-NBA' ? `All-NBA ${e.team_number} Team`
        : e.team_type === 'All-Defense' ? `All-Defensive ${e.team_number} Team`
        : e.team_type === 'All-Rookie' ? `All-Rookie ${e.team_number} Team`
        : `${e.team_type} ${e.team_number}`;
      pills.push(`<span class="award-pill won">${label}</span>`);
    });
    bucket.votes.forEach(a => {
      const pct = Math.round(a.share * 100);
      pills.push(`<span class="award-pill">${AWARD_SHORT[a.award] || a.award} voting (${pct}% share)</span>`);
    });

    return `<div class="awards-timeline-row">
      <span class="awards-season-tag">${season}</span>
      <div>${pills.join('')}</div>
    </div>`;
  }).join('');
}


// ===================================================================
// SHOT PROFILE: half-court SVG with 6 shooting zones
// ===================================================================
// Court geometry uses standard NBA regulation dimensions (in feet),
// scaled to SVG units. Origin: basket center.
const COURT_SCALE = 10;
const COURT_W = 50 * COURT_SCALE;
const COURT_H = 42 * COURT_SCALE;
const BASKET_X = COURT_W / 2;
const BASKET_Y = 5.25 * COURT_SCALE;

function courtPt(xFt, yFt) {
  return [BASKET_X + xFt * COURT_SCALE, BASKET_Y + yFt * COURT_SCALE];
}

// Heat color scale (cool blue -> green -> amber -> red) for FG%, independent
// of team brand colors so it reads as a neutral analytic scale.
function fgPctColor(pct) {
  if (pct == null) return '#3a3530';
  const t = Math.max(0, Math.min(1, (pct - 0.25) / (0.65 - 0.25)));
  const stops = [
    { t: 0, c: [58, 111, 158] },
    { t: 0.4, c: [106, 138, 90] },
    { t: 0.7, c: [217, 154, 62] },
    { t: 1, c: [224, 82, 74] },
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const span = (hi.t - lo.t) || 1;
  const localT = (t - lo.t) / span;
  const c = lo.c.map((v, i) => Math.round(v + (hi.c[i] - v) * localT));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// Build a closed polygon (as an SVG path) for a ring-wedge: the area between
// r_inner and r_outer, swept from angle a0 to a1 (degrees, 0=along the right
// baseline, 90=straight up the court, 180=along the left baseline).
function ringWedgePath(rInner, rOuter, a0Deg, a1Deg, n = 20) {
  const outer = [];
  const inner = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0Deg + (a1Deg - a0Deg) * i / n) * Math.PI) / 180;
    outer.push(courtPt(rOuter * Math.cos(a), rOuter * Math.sin(a)));
  }
  for (let i = 0; i <= n; i++) {
    const a = ((a1Deg - (a1Deg - a0Deg) * i / n) * Math.PI) / 180;
    inner.push(courtPt(rInner * Math.cos(a), rInner * Math.sin(a)));
  }
  const all = rInner > 0 ? [...outer, ...inner] : [...outer, courtPt(0, 0)];
  return 'M' + all.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L') + ' Z';
}

// Build a closed polygon for a rectangular corner-3 wedge: from the baseline
// up to where the corner line meets the arc, on one side (left=-1, right=1).
function cornerWedgePath(side) {
  const r3 = 23.75, cornerDist = 22;
  const dy = Math.sqrt(r3 * r3 - cornerDist * cornerDist);
  const xNear = side * 18; // inner boundary of the corner wedge (just outside the long-mid zone)
  const xFar = side * 25;  // sideline-ish outer boundary for visual purposes
  const p1 = courtPt(xNear, 0);
  const p2 = courtPt(xFar, 0);
  const p3 = courtPt(xFar, dy);
  const p4 = courtPt(xNear, dy);
  return `M${p1[0]},${p1[1]} L${p2[0]},${p2[1]} L${p3[0]},${p3[1]} L${p4[0]},${p4[1]} Z`;
}

const ZONE_DEFS = [
  { key: 'pct_fga_0_3', pctKey: 'fg_pct_0_3', label: 'Restricted Area', sub: '0-3 ft', rInner: 0, rOuter: 4 },
  { key: 'pct_fga_3_10', pctKey: 'fg_pct_3_10', label: 'Short Range', sub: '3-10 ft', rInner: 4, rOuter: 10 },
  { key: 'pct_fga_10_16', pctKey: 'fg_pct_10_16', label: 'Mid-Range', sub: '10-16 ft', rInner: 10, rOuter: 16 },
  { key: 'pct_fga_16_3p', pctKey: 'fg_pct_16_3p', label: 'Long Mid-Range', sub: '16 ft-3PT', rInner: 16, rOuter: 23 },
  { key: 'pct_fga_3p', pctKey: 'fg_pct_3p', label: 'Three-Point', sub: 'Beyond the arc', rInner: 23, rOuter: 31 },
];

function buildCourtSVG(zoneData) {
  if (!zoneData) return '';

  const lineEls = [];
  // baseline
  lineEls.push(`<line class="court-line" x1="0" y1="${BASKET_Y - 5.25 * COURT_SCALE}" x2="${COURT_W}" y2="${BASKET_Y - 5.25 * COURT_SCALE}"/>`);
  // paint
  // paint corners in court-feet; courtPt's y grows downward in SVG screen-space
  // as yFt decreases (since yFt=19 is further up-court / smaller screen-y), so
  // the corner with the larger yFt is the visually-higher (smaller screen-y) one.
  const paintNear = courtPt(-8, 0), paintFar = courtPt(8, 19);
  const paintX = Math.min(paintNear[0], paintFar[0]);
  const paintY = Math.min(paintNear[1], paintFar[1]);
  const paintW = Math.abs(paintFar[0] - paintNear[0]);
  const paintH = Math.abs(paintFar[1] - paintNear[1]);
  lineEls.push(`<rect class="court-line" x="${paintX}" y="${paintY}" width="${paintW}" height="${paintH}"/>`);
  // free throw circle
  const ftCenter = courtPt(0, 19);
  lineEls.push(`<circle class="court-line" cx="${ftCenter[0]}" cy="${ftCenter[1]}" r="${6 * COURT_SCALE}"/>`);
  // restricted arc
  const raL = courtPt(-4, 0), raR = courtPt(4, 0), raTop = courtPt(0, 4);
  lineEls.push(`<path class="court-line" d="M${raL[0]},${raL[1]} A${4*COURT_SCALE},${4*COURT_SCALE} 0 0 1 ${raR[0]},${raR[1]}"/>`);
  // 3pt line + corners
  const r3 = 23.75, cornerDist = 22;
  const dy3 = Math.sqrt(r3 * r3 - cornerDist * cornerDist);
  const cL0 = courtPt(-cornerDist, 0), cL1 = courtPt(-cornerDist, dy3);
  const cR0 = courtPt(cornerDist, 0), cR1 = courtPt(cornerDist, dy3);
  lineEls.push(`<line class="court-line" x1="${cL0[0]}" y1="${cL0[1]}" x2="${cL1[0]}" y2="${cL1[1]}"/>`);
  lineEls.push(`<line class="court-line" x1="${cR0[0]}" y1="${cR0[1]}" x2="${cR1[0]}" y2="${cR1[1]}"/>`);
  lineEls.push(`<path class="court-line" d="M${cL1[0]},${cL1[1]} A${r3*COURT_SCALE},${r3*COURT_SCALE} 0 0 1 ${cR1[0]},${cR1[1]}"/>`);
  // backboard + rim
  const bbL = courtPt(-3, -0.75), bbR = courtPt(3, -0.75);
  lineEls.push(`<line class="court-line" x1="${bbL[0]}" y1="${bbL[1]}" x2="${bbR[0]}" y2="${bbR[1]}"/>`);
  lineEls.push(`<circle class="court-line" cx="${BASKET_X}" cy="${BASKET_Y}" r="${0.75 * COURT_SCALE}"/>`);

  // interactive zone wedges (full semicircle bands, baseline to baseline)
  const zoneEls = ZONE_DEFS.map(z => {
    const pctFga = zoneData[z.key];
    const fgPct = zoneData[z.pctKey];
    const path = ringWedgePath(z.rInner, z.rOuter, 0, 180);
    const fill = fgPctColor(fgPct);
    const opacity = pctFga != null ? Math.max(0.35, Math.min(0.95, 0.35 + pctFga * 1.3)) : 0.15;
    return `<path class="court-zone" data-zone="${z.label}" data-sub="${z.sub}" data-pct-fga="${pctFga != null ? pctFga : ''}" data-fg-pct="${fgPct != null ? fgPct : ''}" d="${path}" fill="${fill}" fill-opacity="${opacity.toFixed(2)}"/>`;
  });

  // corner-3 overlay wedges (drawn on top, distinguishable via the data's
  // separate corner-3 stats rather than the general 3pt zone underneath)
  const cornerPct = zoneData.corner_3_pct;
  const cornerShare = zoneData.pct_corner_3;
  const cornerFill = fgPctColor(cornerPct);
  const cornerOpacity = cornerShare != null ? Math.max(0.4, Math.min(0.95, 0.4 + cornerShare * 2.2)) : 0.15;
  const cornerEls = [-1, 1].map(side =>
    `<path class="court-zone" data-zone="Corner Three" data-sub="${side < 0 ? 'Left corner' : 'Right corner'}" data-pct-fga="${cornerShare != null ? cornerShare : ''}" data-fg-pct="${cornerPct != null ? cornerPct : ''}" d="${cornerWedgePath(side)}" fill="${cornerFill}" fill-opacity="${cornerOpacity.toFixed(2)}"/>`
  );

  const labelEls = ZONE_DEFS.map((z, i) => {
    const midR = (z.rInner + z.rOuter) / 2;
    const pt = courtPt(0, midR);
    const fgPct = zoneData[z.pctKey];
    return `<text class="court-zone-label" x="${pt[0]}" y="${pt[1] - 3}">${fgPct != null ? (fgPct * 100).toFixed(2) + '%' : '—'}</text>
            <text class="court-zone-sublabel" x="${pt[0]}" y="${pt[1] + 10}">${z.sub}</text>`;
  });

  return `<svg viewBox="0 0 ${COURT_W} ${COURT_H}" xmlns="http://www.w3.org/2000/svg">
    <g class="zones-layer">${zoneEls.join('')}${cornerEls.join('')}</g>
    <g class="lines-layer">${lineEls.join('')}</g>
    <g class="labels-layer">${labelEls.join('')}</g>
  </svg>`;
}


// ===================================================================
// SHOT PROFILE: rendering, interaction, season selector
// ===================================================================
let currentShotSeason = null;
let shotBarChart = null;
let currentShotView = 'court';

function renderShotProfile(playerId) {
  const seasons = shootingByPlayer.get(playerId) || [];

  if (seasons.length === 0) {
    $('#pc-shooting-panel').style.display = 'block';
    $('#pc-shooting-sub').textContent = 'Shot-location tracking by NBA.com begins in the 1996/97 season — not available for this player\u2019s career.';
    $('#pc-shooting-season').innerHTML = '';
    $('#pc-court-container').innerHTML = '<div class="no-data-note">No tracked shooting-zone data for this player.</div>';
    $('#pc-shot-bars-view').innerHTML = '';
    return;
  }

  $('#pc-shooting-panel').style.display = 'block';
  $('#pc-shooting-sub').textContent = 'Shot-location tracking by NBA.com begins in the 1996/97 season. Hover or tap a zone for details.';

  $('#pc-shooting-season').innerHTML = seasons.slice().reverse().map(s =>
    `<option value="${s.season}">${s.season}</option>`
  ).join('');
  currentShotSeason = seasons[seasons.length - 1].season;
  $('#pc-shooting-season').value = currentShotSeason;

  $('#pc-shooting-season').onchange = (e) => {
    currentShotSeason = parseInt(e.target.value, 10);
    renderShotForSeason(playerId);
  };

  renderShotForSeason(playerId);
}

function renderShotForSeason(playerId) {
  const seasons = shootingByPlayer.get(playerId) || [];
  const zoneData = seasons.find(s => s.season === currentShotSeason);
  if (!zoneData) return;

  if (currentShotView === 'court') {
    renderCourtView(zoneData);
  } else {
    renderBarsView(zoneData);
  }
}

function renderCourtView(zoneData) {
  const container = $('#pc-court-container');
  container.innerHTML = buildCourtSVG(zoneData);

  let tooltip = $('.shot-tooltip', container.parentElement);
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'shot-tooltip';
    container.parentElement.style.position = 'relative';
    container.parentElement.appendChild(tooltip);
  }

  $$('.court-zone', container).forEach(zoneEl => {
    zoneEl.addEventListener('mouseenter', (e) => {
      const zone = zoneEl.dataset.zone;
      const sub = zoneEl.dataset.sub;
      const pctFga = zoneEl.dataset.pctFga;
      const fgPct = zoneEl.dataset.fgPct;
      tooltip.innerHTML = `
        <div class="st-zone">${zone}</div>
        <div class="st-row"><span>${sub}</span></div>
        <div class="st-row"><span>FG%</span><b>${fgPct ? fmtPct(parseFloat(fgPct), 2) : '—'}</b></div>
        <div class="st-row"><span>Share of shots</span><b>${pctFga ? fmtPct(parseFloat(pctFga), 2) : '—'}</b></div>
      `;
      tooltip.style.opacity = 1;
    });
    zoneEl.addEventListener('mousemove', (e) => {
      const rect = container.parentElement.getBoundingClientRect();
      tooltip.style.left = (e.clientX - rect.left + 14) + 'px';
      tooltip.style.top = (e.clientY - rect.top - 10) + 'px';
    });
    zoneEl.addEventListener('mouseleave', () => {
      tooltip.style.opacity = 0;
    });
  });
}

function renderBarsView(zoneData) {
  const labels = ZONE_DEFS.map(z => z.sub);
  const fgPcts = ZONE_DEFS.map(z => zoneData[z.pctKey]);
  const shares = ZONE_DEFS.map(z => zoneData[z.key]);

  const leagueRow = leagueAvgBySeason.get(currentShotSeason);
  const leagueFgKeyMap = {
    fg_pct_0_3: 'avg_fg_pct_0_3', fg_pct_3_10: 'avg_fg_pct_3_10',
    fg_pct_10_16: 'avg_fg_pct_10_16', fg_pct_16_3p: 'avg_fg_pct_16_3p',
    fg_pct_3p: 'avg_fg_pct_3p',
  };
  const leagueFgPcts = ZONE_DEFS.map(z => leagueRow ? leagueRow[leagueFgKeyMap[z.pctKey]] : null);
  const leagueShareKeyMap = {
    pct_fga_0_3: 'avg_pct_fga_0_3', pct_fga_3_10: 'avg_pct_fga_3_10',
    pct_fga_10_16: 'avg_pct_fga_10_16', pct_fga_16_3p: 'avg_pct_fga_16_3p',
    pct_fga_3p: 'avg_pct_fga_3p',
  };
  const leagueShares = ZONE_DEFS.map(z => leagueRow ? leagueRow[leagueShareKeyMap[z.key]] : null);

  const ctx = $('#pc-shot-bar-chart').getContext('2d');
  if (shotBarChart) shotBarChart.destroy();
  const datasets = [
    {
      label: 'Player FG%',
      data: fgPcts.map(v => v != null ? v * 100 : null),
      backgroundColor: fgPcts.map(v => fgPctColor(v)),
      yAxisID: 'y',
      borderRadius: 4,
      order: 1,
    },
  ];
  if (leagueRow) {
    datasets.push({
      label: 'League Avg FG%',
      data: leagueFgPcts.map(v => v != null ? v * 100 : null),
      backgroundColor: 'rgba(241,235,224,0.12)',
      borderColor: 'rgba(241,235,224,0.55)',
      borderWidth: 1.5,
      yAxisID: 'y',
      borderRadius: 4,
      order: 2,
    });
  }

  shotBarChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: baseChartOptions({
      plugins: {
        legend: {
          display: !!leagueRow,
          labels: { color: PALETTE.chalkDim, font: { family: "'JetBrains Mono', monospace", size: 11 }, boxWidth: 12, boxHeight: 12 }
        },
        tooltip: {
          backgroundColor: '#1f1a16', borderColor: 'rgba(241,235,224,0.18)', borderWidth: 1,
          titleColor: PALETTE.amber, bodyColor: PALETTE.chalk,
          titleFont: { family: "'JetBrains Mono', monospace", size: 12 },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
          callbacks: {
            label: (ctx) => {
              if (ctx.datasetIndex === 0) {
                return `Player FG%: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(2) + '%' : '—'}`;
              }
              return `League Avg FG%: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(2) + '%' : '—'}`;
            },
            afterLabel: (ctx) => {
              if (ctx.datasetIndex === 0) {
                return `Player share of shots: ${shares[ctx.dataIndex] != null ? (shares[ctx.dataIndex]*100).toFixed(2) + '%' : '—'}`;
              }
              return `League share of shots: ${leagueShares[ctx.dataIndex] != null ? (leagueShares[ctx.dataIndex]*100).toFixed(2) + '%' : '—'}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: PALETTE.chalkDim, font: { size: 10.5 } } },
        y: { grid: { color: PALETTE.grid }, ticks: { color: PALETTE.chalkDim, callback: v => v + '%' }, title: { display: true, text: 'FG%', color: PALETTE.chalkDim, font: { family: "'JetBrains Mono', monospace", size: 11 } } }
      }
    })
  });
}

$$('#pc-shot-view-toggle .pill-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentShotView = btn.dataset.shotview;
    $$('#pc-shot-view-toggle .pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $('#pc-shot-court-view').style.display = currentShotView === 'court' ? 'block' : 'none';
    $('#pc-shot-bars-view').style.display = currentShotView === 'bars' ? 'block' : 'none';
    if (currentPlayerId) renderShotForSeason(currentPlayerId);
  });
});


// ===================================================================
// ON-COURT ROLE: position split bars + play-by-play stats
// ===================================================================
const POSITION_LABELS = [
  { key: 'pg_pct', label: 'PG' },
  { key: 'sg_pct', label: 'SG' },
  { key: 'sf_pct', label: 'SF' },
  { key: 'pf_pct', label: 'PF' },
  { key: 'c_pct', label: 'C' },
];

function renderPositionAndPbp(playerId) {
  const seasons = pbpByPlayer.get(playerId) || [];

  if (seasons.length === 0) {
    $('#pc-pbp-panel').style.display = 'block';
    $('#pc-pbp-sub').textContent = 'Play-by-play tracking begins in the 1996/97 season — not available for this player\u2019s career.';
    $('#pc-position-bars').innerHTML = '<div class="no-data-note">No data.</div>';
    $('#pc-pbp-stats').innerHTML = '';
    return;
  }

  $('#pc-pbp-panel').style.display = 'block';
  $('#pc-pbp-sub').textContent = 'Career-average position mix and per-season playmaking/discipline stats (1996/97 onward).';

  // average position split across all tracked seasons (weighted by games played
  // isn't available here directly, so simple mean across seasons is used)
  const avgPos = {};
  POSITION_LABELS.forEach(p => {
    const vals = seasons.map(s => s[p.key]).filter(v => v != null);
    avgPos[p.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });

  $('#pc-position-bars').innerHTML = POSITION_LABELS.map(p => {
    const pct = avgPos[p.key];
    return `<div class="position-bar-row">
      <span class="position-bar-label">${p.label}</span>
      <div class="position-bar-track"><div class="position-bar-fill" style="width:${pct}%"></div></div>
      <span class="position-bar-pct">${pct.toFixed(0)}%</span>
    </div>`;
  }).join('');

  // most recent season's play-by-play stats for the discipline/playmaking grid
  const latest = seasons[seasons.length - 1];
  const cells = [
    { l: 'On-court +/- per 100', v: latest.on_court_plus_minus != null ? (latest.on_court_plus_minus > 0 ? '+' : '') + fmtNum(latest.on_court_plus_minus, 1) : '—', cls: latest.on_court_plus_minus > 0 ? 'positive' : latest.on_court_plus_minus < 0 ? 'negative' : '' },
    { l: 'Net rating swing', v: latest.net_plus_minus != null ? (latest.net_plus_minus > 0 ? '+' : '') + fmtNum(latest.net_plus_minus, 1) : '—', cls: latest.net_plus_minus > 0 ? 'positive' : latest.net_plus_minus < 0 ? 'negative' : '' },
    { l: 'Pts generated by assists', v: fmtInt(latest.pts_generated_by_ast) },
    { l: 'And-1s', v: fmtInt(latest.and1) },
    { l: 'Shooting fouls drawn', v: fmtInt(latest.shooting_foul_drawn) },
    { l: 'Shooting fouls committed', v: fmtInt(latest.shooting_foul_committed) },
    { l: 'Bad-pass turnovers', v: fmtInt(latest.bad_pass_to) },
    { l: 'FGA blocked', v: fmtInt(latest.fga_blocked) },
  ];
  $('#pc-pbp-stats').innerHTML = `<div class="pbp-stat-grid">${cells.map(c =>
    `<div class="pbp-stat-cell"><div class="v ${c.cls || ''}">${c.v}</div><div class="l">${c.l}</div></div>`
  ).join('')}</div>
  <div style="margin-top:10px; font-family:var(--font-mono); font-size:11px; color:var(--chalk-dim);">Showing ${latest.season} season</div>`;
}


// ===================================================================
// COMPARE: PLAYER COMPARISON
// ===================================================================
let cmpPlayerA = null, cmpPlayerB = null;
let cmpAlignMode = 'experience'; // 'experience' | 'age' | 'calendar'

function cmpExperienceYear(playerId, season) {
  const p = careerById.get(playerId);
  if (!p) return null;
  return season - p.first_season + 1;
}

// For a given alignment mode and "slider position" (meaning depends on mode),
// return each player's matching season object (or null if they have no
// season at that position).
function cmpSeasonAtPosition(playerId, mode, pos) {
  const list = seasonsByPlayer.get(playerId) || [];
  if (mode === 'experience') {
    const p = careerById.get(playerId);
    if (!p) return null;
    const targetSeason = p.first_season + pos - 1;
    return list.find(s => s.season === targetSeason) || null;
  }
  if (mode === 'age') {
    return list.find(s => s.age === pos) || null;
  }
  // calendar
  return list.find(s => s.season === pos) || null;
}

function cmpPositionRange(mode) {
  if (!cmpPlayerA || !cmpPlayerB) return { min: 0, max: 0 };
  const listA = seasonsByPlayer.get(cmpPlayerA) || [];
  const listB = seasonsByPlayer.get(cmpPlayerB) || [];
  if (mode === 'experience') {
    const maxExpA = listA.length ? Math.max(...listA.map(s => cmpExperienceYear(cmpPlayerA, s.season))) : 0;
    const maxExpB = listB.length ? Math.max(...listB.map(s => cmpExperienceYear(cmpPlayerB, s.season))) : 0;
    return { min: 1, max: Math.max(maxExpA, maxExpB, 1) };
  }
  if (mode === 'age') {
    const ages = [...listA.map(s => s.age), ...listB.map(s => s.age)].filter(a => a != null);
    return ages.length ? { min: Math.min(...ages), max: Math.max(...ages) } : { min: 18, max: 45 };
  }
  // calendar — only the overlapping window matters, but show full union so
  // the slider can move across each player's whole career for context
  const seasonsAll = [...listA.map(s => s.season), ...listB.map(s => s.season)];
  return seasonsAll.length ? { min: Math.min(...seasonsAll), max: Math.max(...seasonsAll) } : { min: 1947, max: 2026 };
}

const CMP_STAT_DEFS = [
  { key: 'pts', label: 'Points/Game', isPerGame: true, sourceKey: 'pts' },
  { key: 'trb', label: 'Rebounds/Game', isPerGame: true, sourceKey: 'trb' },
  { key: 'ast', label: 'Assists/Game', isPerGame: true, sourceKey: 'ast' },
  { key: 'stl', label: 'Steals/Game', isPerGame: true, sourceKey: 'stl' },
  { key: 'blk', label: 'Blocks/Game', isPerGame: true, sourceKey: 'blk' },
  { key: 'fg_pct', label: 'FG%', isPct: true, sourceKey: 'fg_pct' },
  { key: 'x3p_pct', label: '3P%', isPct: true, sourceKey: 'x3p_pct' },
  { key: 'ft_pct', label: 'FT%', isPct: true, sourceKey: 'ft_pct' },
  { key: 'mp', label: 'Minutes/Game', sourceKey: 'mp' },
  { key: 'g', label: 'Games Played', sourceKey: 'g' },
];


// ===================================================================
// COMPARE: PLAYER COMPARISON — search & selection
// ===================================================================
function setupCmpPlayerSearch(inputId, resultsId, onSelect) {
  const input = $('#' + inputId);
  const results = $('#' + resultsId);

  input.addEventListener('input', () => {
    const q = normalizeForSearch(input.value.trim());
    if (!q) { results.classList.remove('show'); return; }
    let matches;
    if (q.length < 2) {
      matches = notablePlayers.filter(p => playerSearchKey.get(p.player_id).startsWith(q)).slice(0, 12);
    } else {
      matches = CAREER.filter(p => playerSearchKey.get(p.player_id).includes(q)).slice(0, 30);
      matches.sort((a, b) => (b.pts || 0) - (a.pts || 0));
      matches = matches.slice(0, 12);
    }
    if (matches.length === 0) {
      results.innerHTML = `<div class="psr-item" style="cursor:default;color:var(--chalk-dim);">No players found</div>`;
      results.classList.add('show');
      return;
    }
    results.innerHTML = matches.map(p => `
      <div class="psr-item" data-pid="${p.player_id}">
        <span>${p.player}${p.hof ? '<span class="hof-badge">HOF</span>' : ''}</span>
        <span class="psr-meta">${p.first_season}–${p.last_season}</span>
      </div>
    `).join('');
    $$('.psr-item', results).forEach(item => {
      item.addEventListener('click', () => {
        if (!item.dataset.pid) return;
        const player = careerById.get(item.dataset.pid);
        onSelect(item.dataset.pid);
        input.value = player ? player.player : '';
        results.classList.remove('show');
      });
    });
    results.classList.add('show');
  });

  document.addEventListener('click', (e) => {
    if (!results.contains(e.target) && e.target !== input) {
      results.classList.remove('show');
    }
  });
}

setupCmpPlayerSearch('cmp-player-search-a', 'cmp-player-results-a', (pid) => {
  cmpPlayerA = pid;
  renderPlayerComparison();
});
setupCmpPlayerSearch('cmp-player-search-b', 'cmp-player-results-b', (pid) => {
  cmpPlayerB = pid;
  renderPlayerComparison();
});

function renderCmpPlayerSuggestions() {
  const pairs = [
    ['jamesle01', 'jordami01'], ['curryst01', 'thompkl01'], ['birdla01', 'johnsma02'],
    ['duncati01', 'garneke01'], ['jokicni01', 'embiijo01'],
  ];
  const found = pairs.map(([a, b]) => [careerById.get(a), careerById.get(b)]).filter(([a, b]) => a && b);
  $('#cmp-player-suggestions').innerHTML = found.map(([a, b]) =>
    `<button class="pill-btn" data-pa="${a.player_id}" data-pb="${b.player_id}">${a.player} vs ${b.player}</button>`
  ).join('');
  $$('#cmp-player-suggestions .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      cmpPlayerA = btn.dataset.pa;
      cmpPlayerB = btn.dataset.pb;
      $('#cmp-player-search-a').value = careerById.get(cmpPlayerA).player;
      $('#cmp-player-search-b').value = careerById.get(cmpPlayerB).player;
      renderPlayerComparison();
    });
  });
}
renderCmpPlayerSuggestions();

$$('#cmp-align-toggle .pill-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    cmpAlignMode = btn.dataset.align;
    $$('#cmp-align-toggle .pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderPlayerComparison();
  });
});

// ===================================================================
// COMPARE: PLAYER COMPARISON — rendering
// ===================================================================
function renderPlayerComparison() {
  if (!cmpPlayerA || !cmpPlayerB) return;
  $('#cmp-players-empty').style.display = 'none';
  $('#cmp-players-result').style.display = 'block';

  const range = cmpPositionRange(cmpAlignMode);
  const slider = $('#cmp-align-slider');
  slider.min = range.min;
  slider.max = range.max;
  if (slider.value < range.min || slider.value > range.max || slider.dataset.mode !== cmpAlignMode) {
    slider.value = range.max; // default to most recent
  }
  slider.dataset.mode = cmpAlignMode;

  $('#cmp-align-slider-ticks').innerHTML = `<span>${range.min}</span><span>${range.max}</span>`;

  slider.oninput = () => renderCmpAtPosition(parseInt(slider.value, 10));
  renderCmpAtPosition(parseInt(slider.value, 10));
}

function cmpAlignNoteText(mode, pos, seasonA, seasonB) {
  if (mode === 'experience') {
    return `Comparing Year ${pos} of each player's career — ${seasonA ? seasonA.season : '\u2014'} for ${careerById.get(cmpPlayerA).player}, ${seasonB ? seasonB.season : '\u2014'} for ${careerById.get(cmpPlayerB).player}.`;
  }
  if (mode === 'age') {
    return `Comparing age ${pos} for both players — ${seasonA ? seasonA.season : 'no season at this age'} for ${careerById.get(cmpPlayerA).player}, ${seasonB ? seasonB.season : 'no season at this age'} for ${careerById.get(cmpPlayerB).player}.`;
  }
  return `Comparing the ${pos} season for both players directly.${(!seasonA || !seasonB) ? ' One or both players did not play that season.' : ''}`;
}

function renderCmpAtPosition(pos) {
  const seasonA = cmpSeasonAtPosition(cmpPlayerA, cmpAlignMode, pos);
  const seasonB = cmpSeasonAtPosition(cmpPlayerB, cmpAlignMode, pos);
  const playerA = careerById.get(cmpPlayerA);
  const playerB = careerById.get(cmpPlayerB);

  $('#cmp-align-note').textContent = cmpAlignNoteText(cmpAlignMode, pos, seasonA, seasonB);

  renderCmpPlayerCard('cmp-card-a', playerA, seasonA, cmpAlignMode, pos);
  renderCmpPlayerCard('cmp-card-b', playerB, seasonB, cmpAlignMode, pos);

  renderCmpStatTable(seasonA, seasonB);

  // Head-to-head only when both players have a season AND those seasons are
  // the same calendar year (a genuine overlap), regardless of alignment mode.
  if (seasonA && seasonB && seasonA.season === seasonB.season) {
    renderCmpHeadToHead(playerA, playerB, seasonA, seasonB);
    $('#cmp-h2h-panel').style.display = 'block';
  } else {
    $('#cmp-h2h-panel').style.display = 'none';
  }
}

function renderCmpPlayerCard(containerId, player, seasonRow, mode, pos) {
  const expYear = seasonRow ? cmpExperienceYear(player.player_id, seasonRow.season) : null;
  const cells = seasonRow ? [
    { l: 'Season', v: seasonRow.season },
    { l: 'Age', v: seasonRow.age ?? '\u2014' },
    { l: 'Exp. Yr', v: expYear ?? '\u2014' },
    { l: 'PPG', v: fmtNum(seasonRow.pts, 1) },
    { l: 'RPG', v: fmtNum(seasonRow.trb, 1) },
    { l: 'APG', v: fmtNum(seasonRow.ast, 1) },
  ] : [];

  $('#' + containerId).innerHTML = `
    <div class="cmp-card-name">${player.player}${player.hof ? '<span class="hof-badge">HOF</span>' : ''}</div>
    <div class="cmp-card-meta">${player.pos || '\u2014'} \u00b7 ${player.first_season}\u2013${player.last_season} (${player.seasons_played} seasons)</div>
    ${seasonRow ? `
      <div class="cmp-card-stat-grid">
        ${cells.map(c => `<div class="cs-cell"><div class="v">${c.v}</div><div class="l">${c.l}</div></div>`).join('')}
      </div>
    ` : `<div class="no-data-note">No matching season for this player at this point in the comparison.</div>`}
  `;
}

function renderCmpStatTable(seasonA, seasonB) {
  if (!seasonA || !seasonB) {
    $('#cmp-stat-table').innerHTML = `<div class="no-data-note">Both players need a season at this position in the comparison to show stat-by-stat detail.</div>`;
    return;
  }

  $('#cmp-stat-table').innerHTML = CMP_STAT_DEFS.map(def => {
    const va = seasonA[def.sourceKey];
    const vb = seasonB[def.sourceKey];
    const fmt = (v) => v == null ? '\u2014' : def.isPct ? (v * 100).toFixed(2) + '%' : v.toFixed(1);
    const maxV = Math.max(Math.abs(va || 0), Math.abs(vb || 0), 0.001);
    const pctA = va != null ? Math.max(4, (Math.abs(va) / maxV) * 100) : 0;
    const pctB = vb != null ? Math.max(4, (Math.abs(vb) / maxV) * 100) : 0;
    const aWins = va != null && vb != null && va > vb;
    const bWins = va != null && vb != null && vb > va;
    return `
      <div class="cmp-stat-row ${aWins ? 'cmp-stat-winner-a' : ''} ${bWins ? 'cmp-stat-winner-b' : ''}">
        <div class="cmp-stat-bar-wrap right">
          <span class="cmp-stat-value a-val">${fmt(va)}</span>
          <div class="cmp-stat-bar-track"><div class="cmp-stat-bar-fill a" style="width:${pctA}%"></div></div>
        </div>
        <span class="cmp-stat-label">${def.label}</span>
        <div class="cmp-stat-bar-wrap">
          <div class="cmp-stat-bar-track"><div class="cmp-stat-bar-fill b" style="width:${pctB}%"></div></div>
          <span class="cmp-stat-value b-val">${fmt(vb)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderCmpHeadToHead(playerA, playerB, seasonA, seasonB) {
  const sameTeam = seasonA.team && seasonB.team && seasonA.team === seasonB.team && !MULTITEAM_CODES.has(seasonA.team);
  if (sameTeam) {
    $('#cmp-h2h-content').innerHTML = `<div class="no-data-note">${playerA.player} and ${playerB.player} were teammates on ${seasonA.team} in ${seasonA.season} — no head-to-head, they were on the same side.</div>`;
    return;
  }
  $('#cmp-h2h-content').innerHTML = `
    <div class="no-data-note">
      ${playerA.player} (${seasonA.team || '\u2014'}) and ${playerB.player} (${seasonB.team || '\u2014'}) both played in ${seasonA.season}.
      This dataset doesn't include a game-by-game schedule, so individual head-to-head box scores aren't available \u2014
      but here's how each player's season compared above, and you can look up either team's full season in Team Explorer.
    </div>
  `;
}


// ===================================================================
// COMPARE: TEAM COMPARISON
// ===================================================================
let cmpTeamA = null, cmpTeamB = null;
let cmpTeamScope = 'career'; // 'career' | 'season'
let cmpTeamSeasonA = null, cmpTeamSeasonB = null;

// franchise-career aggregate (sum/avg across every season the franchise has played)
function franchiseCareerAggregate(franchiseName) {
  const span = franchiseSpans.get(franchiseName);
  if (!span) return null;
  const rows = span.rows;
  const totalW = rows.reduce((s, r) => s + (r.w || 0), 0);
  const totalL = rows.reduce((s, r) => s + (r.l || 0), 0);
  const playoffSeasons = rows.filter(r => r.playoffs).length;
  const avg = (key) => {
    const vals = rows.map(r => r[key]).filter(v => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return {
    franchise: franchiseName,
    displayName: rows[rows.length - 1].current_name || rows[rows.length - 1].team_name,
    minSeason: span.minSeason,
    maxSeason: span.maxSeason,
    totalSeasons: rows.length,
    totalW, totalL,
    winPct: (totalW + totalL) > 0 ? totalW / (totalW + totalL) : null,
    playoffSeasons,
    playoffPct: rows.length ? playoffSeasons / rows.length : null,
    avgSrs: avg('srs'), avgOrtg: avg('o_rtg'), avgDrtg: avg('d_rtg'),
    avgPace: avg('pace'), avgPts: avg('pts_per_game'),
    status: rows[rows.length - 1].status,
  };
}

function franchiseSeasonAggregate(franchiseName, season) {
  const span = franchiseSpans.get(franchiseName);
  if (!span) return null;
  const row = span.rows.find(r => r.season === season);
  if (!row) return null;
  return {
    franchise: franchiseName,
    displayName: row.team_name,
    season,
    totalW: row.w, totalL: row.l,
    winPct: (row.w != null && row.l != null && (row.w + row.l) > 0) ? row.w / (row.w + row.l) : null,
    playoffSeasons: row.playoffs ? 1 : 0,
    playoffPct: row.playoffs ? 1 : 0,
    avgSrs: row.srs, avgOrtg: row.o_rtg, avgDrtg: row.d_rtg,
    avgPace: row.pace, avgPts: row.pts_per_game,
    status: row.status,
  };
}

function populateTeamSelectors() {
  const franchises = Array.from(franchiseSpans.keys()).sort();
  const optionsHtml = franchises.map(fr => {
    const span = franchiseSpans.get(fr);
    const latest = span.rows[span.rows.length - 1];
    const displayName = latest.current_name || latest.team_name;
    return `<option value="${fr}">${displayName} (${span.minSeason}\u2013${span.maxSeason})</option>`;
  }).join('');
  $('#cmp-team-select-a').innerHTML = '<option value="">Select a team\u2026</option>' + optionsHtml;
  $('#cmp-team-select-b').innerHTML = '<option value="">Select a team\u2026</option>' + optionsHtml;
}

function populateTeamSeasonSelector(selectId, franchiseName) {
  const span = franchiseSpans.get(franchiseName);
  const sel = $('#' + selectId);
  if (!span) { sel.innerHTML = ''; return; }
  sel.innerHTML = span.rows.slice().reverse().map(r =>
    `<option value="${r.season}">${r.season} (${r.team_name})</option>`
  ).join('');
}

$('#cmp-team-select-a').addEventListener('change', (e) => {
  cmpTeamA = e.target.value || null;
  if (cmpTeamA) populateTeamSeasonSelector('cmp-team-season-a', cmpTeamA);
  renderTeamComparison();
});
$('#cmp-team-select-b').addEventListener('change', (e) => {
  cmpTeamB = e.target.value || null;
  if (cmpTeamB) populateTeamSeasonSelector('cmp-team-season-b', cmpTeamB);
  renderTeamComparison();
});
$('#cmp-team-season-a').addEventListener('change', (e) => {
  cmpTeamSeasonA = parseInt(e.target.value, 10);
  renderTeamComparison();
});
$('#cmp-team-season-b').addEventListener('change', (e) => {
  cmpTeamSeasonB = parseInt(e.target.value, 10);
  renderTeamComparison();
});

$$('#cmp-team-scope-toggle .pill-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    cmpTeamScope = btn.dataset.scope;
    $$('#cmp-team-scope-toggle .pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $('#cmp-team-season-pickers').style.display = cmpTeamScope === 'season' ? 'flex' : 'none';
    if (cmpTeamScope === 'season') {
      if (cmpTeamA) { populateTeamSeasonSelector('cmp-team-season-a', cmpTeamA); cmpTeamSeasonA = parseInt($('#cmp-team-season-a').value, 10); }
      if (cmpTeamB) { populateTeamSeasonSelector('cmp-team-season-b', cmpTeamB); cmpTeamSeasonB = parseInt($('#cmp-team-season-b').value, 10); }
    }
    renderTeamComparison();
  });
});

populateTeamSelectors();

const CMP_TEAM_STAT_DEFS = [
  { key: 'totalW', label: 'Wins', isTotal: true },
  { key: 'totalL', label: 'Losses', isTotal: true },
  { key: 'winPct', label: 'Win %', isPct: true },
  { key: 'avgSrs', label: 'SRS (Strength)' },
  { key: 'avgOrtg', label: 'Off. Rating' },
  { key: 'avgDrtg', label: 'Def. Rating' },
  { key: 'avgPace', label: 'Pace' },
  { key: 'avgPts', label: 'Points/Game' },
];

function renderTeamComparison() {
  if (!cmpTeamA || !cmpTeamB) {
    $('#cmp-teams-result').style.display = 'none';
    return;
  }
  if (cmpTeamScope === 'season' && (cmpTeamSeasonA == null || cmpTeamSeasonB == null)) {
    $('#cmp-teams-result').style.display = 'none';
    return;
  }

  const dataA = cmpTeamScope === 'career' ? franchiseCareerAggregate(cmpTeamA) : franchiseSeasonAggregate(cmpTeamA, cmpTeamSeasonA);
  const dataB = cmpTeamScope === 'career' ? franchiseCareerAggregate(cmpTeamB) : franchiseSeasonAggregate(cmpTeamB, cmpTeamSeasonB);
  if (!dataA || !dataB) {
    $('#cmp-teams-result').style.display = 'none';
    return;
  }

  $('#cmp-teams-result').style.display = 'block';
  renderCmpTeamCard('cmp-team-card-a', dataA);
  renderCmpTeamCard('cmp-team-card-b', dataB);
  renderCmpTeamStatTable(dataA, dataB);
  renderCmpTeamAccomplishments(dataA, dataB);
}

function renderCmpTeamCard(containerId, data) {
  const isCareer = data.season === undefined;
  const cells = isCareer ? [
    { l: 'Seasons', v: data.totalSeasons },
    { l: 'Record', v: `${fmtInt(data.totalW)}-${fmtInt(data.totalL)}` },
    { l: 'Win %', v: data.winPct != null ? (data.winPct * 100).toFixed(1) + '%' : '\u2014' },
    { l: 'Playoff Trips', v: `${data.playoffSeasons} / ${data.totalSeasons}` },
  ] : [
    { l: 'Season', v: data.season },
    { l: 'Record', v: `${fmtInt(data.totalW)}-${fmtInt(data.totalL)}` },
    { l: 'Win %', v: data.winPct != null ? (data.winPct * 100).toFixed(1) + '%' : '\u2014' },
    { l: 'Made Playoffs', v: data.playoffSeasons ? 'Yes' : 'No' },
  ];

  $('#' + containerId).innerHTML = `
    <div class="cmp-card-name">${data.displayName}</div>
    <div class="cmp-card-meta">${isCareer ? `${data.minSeason}\u2013${data.maxSeason}` : `Single season`}${data.status !== 'active' ? ' \u00b7 no longer in the NBA' : ''}</div>
    <div class="cmp-card-stat-grid">
      ${cells.map(c => `<div class="cs-cell"><div class="v">${c.v}</div><div class="l">${c.l}</div></div>`).join('')}
    </div>
  `;
}

function renderCmpTeamStatTable(dataA, dataB) {
  $('#cmp-team-stat-table').innerHTML = CMP_TEAM_STAT_DEFS.map(def => {
    const va = dataA[def.key];
    const vb = dataB[def.key];
    const fmt = (v) => {
      if (v == null) return '\u2014';
      if (def.isPct) return (v * 100).toFixed(1) + '%';
      if (def.isTotal) return fmtInt(v);
      return v.toFixed(1);
    };
    const maxV = Math.max(Math.abs(va || 0), Math.abs(vb || 0), 0.001);
    const pctA = va != null ? Math.max(4, (Math.abs(va) / maxV) * 100) : 0;
    const pctB = vb != null ? Math.max(4, (Math.abs(vb) / maxV) * 100) : 0;
    // Defensive rating is "lower is better" — flip the winner highlight for it
    const lowerIsBetter = def.key === 'avgDrtg' || def.key === 'totalL';
    const aWins = va != null && vb != null && (lowerIsBetter ? va < vb : va > vb);
    const bWins = va != null && vb != null && (lowerIsBetter ? vb < va : vb > va);
    return `
      <div class="cmp-stat-row ${aWins ? 'cmp-stat-winner-a' : ''} ${bWins ? 'cmp-stat-winner-b' : ''}">
        <div class="cmp-stat-bar-wrap right">
          <span class="cmp-stat-value a-val">${fmt(va)}</span>
          <div class="cmp-stat-bar-track"><div class="cmp-stat-bar-fill a" style="width:${pctA}%"></div></div>
        </div>
        <span class="cmp-stat-label">${def.label}</span>
        <div class="cmp-stat-bar-wrap">
          <div class="cmp-stat-bar-track"><div class="cmp-stat-bar-fill b" style="width:${pctB}%"></div></div>
          <span class="cmp-stat-value b-val">${fmt(vb)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Awards won by anyone on a given franchise's roster in a given season (or,
// for career scope, across every season of that franchise's history).
function teamAwardsInSeason(franchiseName, season) {
  const roster = rosterByFranchiseSeason.get(`${franchiseName}:${season}`) || [];
  const rosterIds = new Set(roster.map(p => p.player_id));
  const wins = AWARD_SHARES.filter(a => a.season === season && a.winner && rosterIds.has(a.player_id));
  const eos = EOS_TEAMS.filter(e => e.season === season && rosterIds.has(e.player_id));
  return { wins, eos };
}

function teamAwardsAcrossCareer(franchiseName) {
  const span = franchiseSpans.get(franchiseName);
  if (!span) return { wins: [], eos: [] };
  const allWins = [], allEos = [];
  span.rows.forEach(r => {
    const { wins, eos } = teamAwardsInSeason(franchiseName, r.season);
    allWins.push(...wins);
    allEos.push(...eos);
  });
  return { wins: allWins, eos: allEos };
}

// Unique id counter for expand toggles so multiple calls don't collide.
let _cmpAccId = 0;

function renderCmpTeamAccomplishments(dataA, dataB) {
  const isCareer = dataA.season === undefined;

  function awardPillHtml(w, showSeason) {
    const player = careerById.get(w.player_id);
    const name = player ? player.player : w.player_id;
    return `<span class="award-pill won"><span class="award-trophy">\u{1F3C6}</span>${AWARD_LABELS[w.award] || w.award} \u2014 ${name}${showSeason ? ` (${w.season})` : ''}</span>`;
  }

  function eosPillHtml(e, showSeason) {
    const player = careerById.get(e.player_id);
    const name = player ? player.player : e.player_id;
    const label = e.team_type === 'All-NBA' ? `All-NBA ${e.team_number} Team`
      : e.team_type === 'All-Defense' ? `All-Defensive ${e.team_number} Team`
      : e.team_type === 'All-Rookie' ? `All-Rookie ${e.team_number} Team`
      : `${e.team_type} ${e.team_number}`;
    return `<span class="award-pill won">${label} \u2014 ${name}${showSeason ? ` (${e.season})` : ''}</span>`;
  }

  function summarize(franchiseName, data) {
    const { wins, eos } = isCareer
      ? teamAwardsAcrossCareer(franchiseName)
      : teamAwardsInSeason(franchiseName, data.season);

    const playoffLine = isCareer
      ? `${data.playoffSeasons} of ${data.totalSeasons} seasons reached the playoffs`
      : (data.playoffSeasons ? 'Reached the playoffs this season' : 'Missed the playoffs this season');

    const total = wins.length + eos.length;

    if (!isCareer) {
      const pills = [...wins.map(w => awardPillHtml(w, false)), ...eos.map(e => eosPillHtml(e, false))];
      return `
        <div class="cmp-accomplishments-col">
          <div class="cmp-accomplishments-name">${data.displayName}</div>
          <div class="cmp-accomplishments-line">${playoffLine}</div>
          <div class="cmp-accomplishments-pills">
            ${pills.length > 0 ? pills.join('') : '<span class="no-data-note" style="padding:6px 0;">No major individual awards or All-NBA/All-Defense selections this season.</span>'}
          </div>
        </div>`;
    }

    // Career mode: group by award/EOS type to get counts, then build summary badges
    const awardGroups = {};
    wins.forEach(w => {
      const label = AWARD_SHORT[w.award] || AWARD_LABELS[w.award] || w.award;
      awardGroups[label] = (awardGroups[label] || 0) + 1;
    });

    const eosGroups = {};
    eos.forEach(e => {
      const label = e.team_type === 'All-NBA' ? `All-NBA ${e.team_number} Team`
        : e.team_type === 'All-Defense' ? `All-Defensive ${e.team_number} Team`
        : e.team_type === 'All-Rookie' ? `All-Rookie ${e.team_number} Team`
        : `${e.team_type} ${e.team_number}`;
      eosGroups[label] = (eosGroups[label] || 0) + 1;
    });

    const summaryBadges = [
      ...Object.entries(awardGroups).map(([label, n]) =>
        `<span class="award-summary-badge"><span class="award-trophy">\u{1F3C6}</span> ${n}\u00d7 ${label}</span>`),
      ...Object.entries(eosGroups).map(([label, n]) =>
        `<span class="award-summary-badge">${n}\u00d7 ${label}</span>`),
    ];

    if (total === 0) {
      return `
        <div class="cmp-accomplishments-col">
          <div class="cmp-accomplishments-name">${data.displayName}</div>
          <div class="cmp-accomplishments-line">${playoffLine}</div>
          <span class="no-data-note" style="padding:6px 0;">No major individual awards or All-NBA/All-Defense selections on record.</span>
        </div>`;
    }

    const uid = ++_cmpAccId;
    const detailId = `cmp-acc-detail-${uid}`;
    const btnId = `cmp-acc-btn-${uid}`;
    const allPills = [...wins.map(w => awardPillHtml(w, true)), ...eos.map(e => eosPillHtml(e, true))];
    const btnLabel = `Show all ${total} awards \u25be`;

    return `
      <div class="cmp-accomplishments-col">
        <div class="cmp-accomplishments-name">${data.displayName}</div>
        <div class="cmp-accomplishments-line">${playoffLine}</div>
        <div class="cmp-acc-summary">${summaryBadges.join('')}</div>
        <button class="cmp-acc-expand-btn" id="${btnId}" onclick="(function(){
          var detail = document.getElementById('${detailId}');
          var btn = document.getElementById('${btnId}');
          var open = detail.style.display !== 'none';
          detail.style.display = open ? 'none' : 'flex';
          btn.textContent = open ? '${btnLabel}' : 'Collapse \u25b4';
        })()">
          ${btnLabel}
        </button>
        <div id="${detailId}" class="cmp-accomplishments-pills" style="display:none;margin-top:10px;">
          ${allPills.join('')}
        </div>
      </div>`;
  }

  $('#cmp-team-accomplishments').innerHTML = `
    <div class="cmp-accomplishments-grid">
      ${summarize(cmpTeamA, dataA)}
      ${summarize(cmpTeamB, dataB)}
    </div>
  `;
}


// ===================================================================
// COMPARE: top-level view bootstrap + sub-tab nav
// ===================================================================
let compareViewInitialized = false;

function initCompareView() {
  if (compareViewInitialized) return;
  compareViewInitialized = true;
  // team selectors are populated eagerly in app_part16.js at script-load time
  // (populateTeamSelectors()), so there's nothing else to lazy-init here —
  // this hook exists mainly for symmetry with the other views and as a
  // place to extend later if compare ever needs deferred setup.
}

$$('#view-compare > .tabs > .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('#view-compare > .tabs > .tab-btn').forEach(b => b.classList.remove('active'));
    $$('.compare-mode-view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    $('#compare-' + btn.dataset.compareMode).classList.add('active');
  });
});
