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
]

data_js = '\n' + '\n'.join(
    f'const {name} = {read(f"data/{fname}.json")};' for name, fname in DATA_FILES
) + '\n'

html = (read('src/template.html')
        .replace('__CHARTJS__', '\n' + read('src/vendor/chart.umd.min.js') + '\n')
        .replace('__D3__', '\n' + read('src/vendor/d3.min.js') + '\n')
        .replace('__TOPOJSON__', '\n' + read('src/vendor/topojson-client.min.js') + '\n')
        .replace('__STYLES__', '\n' + read('src/styles.css') + '\n')
        .replace('__DATA__', '\n' + data_js + '\n')
        .replace('__APP__', '\n' + read('src/app.js') + '\n'))

(ROOT / 'index.html').write_text(html, encoding='utf-8')
print(f'Wrote index.html ({len(html)/1024/1024:.2f} MB)')
