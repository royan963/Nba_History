#!/usr/bin/env python3
"""Assemble the single-file dashboard (index.html) from src/ and data/.

Usage:  python3 build.py
Output: index.html (self-contained; safe to host on GitHub Pages)
"""
from pathlib import Path

ROOT = Path(__file__).parent
read = lambda p: (ROOT / p).read_text(encoding='utf-8')

# (JS constant name, data file) in the order the app expects them.
DATA_FILES = [
    ('ERA_TRENDS', 'era_trends'),
    ('PLAYER_CAREER', 'player_career'),
    ('PLAYER_SEASONS', 'player_seasons'),
    ('TEAM_SEASONS', 'team_seasons'),
    ('TEAM_GEO', 'team_geo'),
    ('STATES_TOPOJSON', 'states-10m'),
    ('CANADA_TOPOJSON', 'canada_topo'),
    ('PLAYER_SHOOTING', 'player_shooting'),
    ('PLAYER_PBP', 'player_pbp'),
    ('PLAYER_AWARD_SHARES', 'player_award_shares'),
    ('PLAYER_EOS_TEAMS', 'player_eos_teams'),
    ('LEAGUE_AVG_SHOOTING', 'league_avg_shooting'),
    ('PLAYER_ADVANCED', 'player_advanced'),
    ('PLAYER_PER100', 'player_per100'),
    ('ALL_STAR_SELECTIONS', 'all_star'),
    ('DRAFT_PICKS', 'draft'),
    ('LEAGUE_ENV', 'league_env'),
    ('SIMILAR_PLAYERS', 'similar_players'),
]

# App modules, concatenated in dependency order into one inline <script>.
# Each file may use globals defined by the files listed before it.
JS_MODULES = [
    'core.js',              # DOM helpers, formatters, core data indexes, chart theme
    'extended-data.js',     # advanced stats, per-100, All-Star, draft, league environment
    'era-stats.js',         # raw / per-100 / era-adjusted stat definitions
    'nav.js',               # top-level tab navigation
    'overview.js',          # hero ticker, season scoreboard, overview chart
    'evolution.js',         # Era Evolution tab
    'leaderboards.js',      # Leaderboards tab
    'player-explorer.js',   # player search, card, career trajectory chart
    'team-map.js',          # franchise map (D3)
    'team-roster.js',       # season rosters
    'team-explorer.js',     # franchise detail panel
    'player-data.js',       # shooting / play-by-play / awards indexes
    'player-awards.js',     # awards timeline
    'shot-court.js',        # half-court SVG geometry
    'shot-profile.js',      # shot profile rendering + league-average bars
    'player-role.js',       # position mix + play-by-play panel
    'player-advanced.js',   # advanced metrics panel
    'compare-players.js',   # player comparison (+ career overlay chart)
    'similar-players.js',   # similar players panel (needs openComparison)
    'compare-teams.js',     # team comparison
    'compare-nav.js',       # compare sub-tabs
    'main.js',              # bootstrap (runs last)
]

app_js = '\n\n'.join(
    f'// ---- {name} ----\n' + read(f'src/js/{name}') for name in JS_MODULES
)

data_js = '\n' + '\n'.join(
    f'const {name} = {read(f"data/{fname}.json")};' for name, fname in DATA_FILES
) + '\n'

import json
era = json.loads(read('data/era_trends.json'))
seasons = [e['season'] for e in era]

html = (read('src/template.html')
        .replace('__LATEST__', str(max(seasons)))
        .replace('__NUM_SEASONS__', str(len(seasons)))
        .replace('__CHARTJS__', '\n' + read('src/vendor/chart.umd.min.js') + '\n')
        .replace('__D3__', '\n' + read('src/vendor/d3.min.js') + '\n')
        .replace('__TOPOJSON__', '\n' + read('src/vendor/topojson-client.min.js') + '\n')
        .replace('__STYLES__', '\n' + read('src/styles.css') + '\n')
        .replace('__DATA__', '\n' + data_js + '\n')
        .replace('__APP__', '\n' + app_js + '\n'))

(ROOT / 'index.html').write_text(html, encoding='utf-8')
print(f'Wrote index.html ({len(html)/1024/1024:.2f} MB)')
