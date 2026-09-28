#!/usr/bin/env python3
"""Refresh the dashboard with the latest NBA stats.

Downloads the Basketball-Reference CSVs (Kaggle dataset
"sumitrodatta/nba-aba-baa-stats", which is updated through the season),
checks them, regenerates data/*.json, rebuilds index.html and runs the
smoke test. If anything fails, data/ is restored to what it was before.

Usage
  python3 scripts/update_season.py                 # download from Kaggle
  python3 scripts/update_season.py --zip nba.zip   # use a zip you downloaded yourself
  python3 scripts/update_season.py --skip-download # reuse what's already in data/raw/
  options: --no-test (skip the browser smoke test)

Kaggle download needs `pip install kaggle` and an API token: run
`kaggle auth login`, or set KAGGLE_API_TOKEN (from kaggle.com/settings/api).
"""
import argparse, json, shutil, subprocess, sys, tempfile, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'data' / 'raw'
DATA = ROOT / 'data'
BACKUP = DATA / '.backup'
KAGGLE_DATASET = 'sumitrodatta/nba-aba-baa-stats'

sys.path.insert(0, str(ROOT / 'scripts'))

# Every CSV and column the pipeline reads. If the source dataset renames
# something, the update stops here with a clear message instead of
# producing a half-broken dashboard.
REQUIRED = {
    'Team Summaries.csv': ['season', 'lg', 'team', 'abbreviation', 'playoffs', 'w', 'l', 'srs', 'o_rtg', 'd_rtg', 'pace', 'x3p_ar', 'ts_percent'],
    'Team Stats Per Game.csv': ['season', 'lg', 'team', 'pts_per_game', 'x3pa_per_game', 'x3p_percent', 'fg_percent', 'ft_per_game', 'orb_per_game', 'ast_per_game'],
    'Team Totals.csv': ['season', 'lg', 'team', 'g', 'pts', 'trb', 'ast', 'stl', 'blk', 'tov', 'fg', 'fga', 'x3p', 'x3pa', 'ft', 'fta'],
    'Player Totals.csv': ['season', 'lg', 'player', 'player_id', 'team', 'g', 'gs', 'mp', 'fg', 'fga', 'x3p', 'x3pa', 'ft', 'fta', 'trb', 'ast', 'stl', 'blk', 'pts'],
    'Player Per Game.csv': ['season', 'lg', 'player', 'player_id', 'age', 'team', 'pos', 'g', 'gs', 'mp_per_game', 'pts_per_game', 'trb_per_game', 'ast_per_game', 'stl_per_game', 'blk_per_game', 'fg_percent', 'x3p_percent', 'ft_percent'],
    'Player Career Info.csv': ['player_id', 'pos', 'hof', 'ht_in_in', 'wt'],
    'Player Shooting.csv': ['season', 'player_id', 'team', 'g', 'avg_dist_fga', 'percent_fga_from_x0_3_range', 'fg_percent_from_x3p_range', 'percent_corner_3s_of_3pa', 'corner_3_point_percent'],
    'Player Play By Play.csv': ['season', 'player_id', 'team', 'pg_percent', 'c_percent', 'on_court_plus_minus_per_100_poss', 'points_generated_by_assists'],
    'Player Award Shares.csv': ['season', 'award', 'player_id', 'share', 'winner'],
    'End of Season Teams.csv': ['season', 'lg', 'type', 'number_tm', 'player_id'],
    'Advanced.csv': ['season', 'lg', 'player_id', 'team', 'per', 'ts_percent', 'usg_percent', 'ws', 'ws_48', 'bpm', 'vorp', 'x3p_ar'],
    'Per 100 Poss.csv': ['season', 'lg', 'player_id', 'team', 'pts_per_100_poss', 'o_rtg', 'd_rtg'],
    'All-Star Selections.csv': ['season', 'lg', 'player_id', 'replaced'],
    'Draft Pick History.csv': ['season', 'lg', 'overall_pick', 'round', 'tm', 'player_id', 'college'],
}


def step(msg):
    print(f'\n== {msg}')


def fail(msg):
    print(f'\nUpdate stopped: {msg}')
    sys.exit(1)


def find_csv_dir(folder):
    hit = next(Path(folder).rglob('Team Summaries.csv'), None)
    if not hit:
        fail(f'no "Team Summaries.csv" found in {folder}; is this the right dataset?')
    return hit.parent


def download_from_kaggle(dest):
    try:
        from kaggle.api.kaggle_api_extended import KaggleApi
    except ImportError:
        fail('the Kaggle client isn\'t installed. Run `pip install kaggle`, or download the dataset '
             f'from https://www.kaggle.com/datasets/{KAGGLE_DATASET} and pass --zip path/to/file.zip')
    api = KaggleApi()
    try:
        api.authenticate()
    except SystemExit:
        fail('Kaggle login needed (see the instructions above), or download the zip yourself and use --zip.')
    print(f'Downloading {KAGGLE_DATASET} ...')
    api.dataset_download_files(KAGGLE_DATASET, path=str(dest), unzip=True, quiet=False)


def validate(csv_dir):
    import pandas as pd
    problems = []
    for name, cols in REQUIRED.items():
        path = csv_dir / name
        if not path.exists():
            problems.append(f'missing file: {name}')
            continue
        header = pd.read_csv(path, nrows=0).columns
        missing = [c for c in cols if c not in header]
        if missing:
            problems.append(f'{name} is missing columns: {", ".join(missing)}')
    if problems:
        fail('the source data changed shape:\n  ' + '\n  '.join(problems))

    # A renamed, relocated or expansion team needs a line in franchise_map.py
    # (plus colors in team_colors.py if it's a new franchise).
    from franchise_map import TEAM_META
    ts = pd.read_csv(csv_dir / 'Team Summaries.csv', low_memory=False)
    names = set(ts[ts['lg'].isin(['NBA', 'BAA']) & (ts['team'] != 'League Average')]['team'])
    unknown = sorted(names - set(TEAM_META) - {'Baltimore Bullets'})
    if unknown:
        fail('new team name(s) with no franchise mapping: ' + ', '.join(unknown) +
             '\n  Add each one to TEAM_META (and CITY_COORDS if it is a new city) in scripts/franchise_map.py,'
             '\n  and to TEAM_COLORS in scripts/team_colors.py if it is a brand-new franchise. Then rerun.')
    from franchise_map import resolve_meta
    from team_colors import TEAM_COLORS
    no_colors = sorted({resolve_meta(n, s)['franchise'] for n, s in
                        ts[ts['team'].isin(names)][['team', 'season']].drop_duplicates().itertuples(index=False)}
                       - set(TEAM_COLORS))
    if no_colors:
        fail('franchise(s) with no colors/badge code: ' + ', '.join(no_colors) +
             '\n  Add each one to TEAM_COLORS in scripts/team_colors.py. Then rerun.')
    seasons = sorted(ts['season'].unique())
    print(f'OK: {len(REQUIRED)} files checked, seasons {seasons[0]}-{seasons[-1]}')


def snapshot():
    """Headline numbers from the current data/*.json, for the change report."""
    def load(name):
        p = DATA / f'{name}.json'
        return json.loads(p.read_text()) if p.exists() else None
    era, career, seasons = load('era_trends'), load('player_career'), load('player_seasons')
    if not era:
        return None
    latest = max(e['season'] for e in era)
    cols = seasons['columns']
    s_i, g_i = cols.index('season'), cols.index('g')
    latest_rows = [r for r in seasons['rows'] if r[s_i] == latest]
    return {
        'latest': latest,
        'players': len(career['rows']),
        'player_seasons': len(seasons['rows']),
        'latest_rows': len(latest_rows),
        'latest_max_gp': max((r[g_i] or 0) for r in latest_rows) if latest_rows else 0,
    }


def run(cmd):
    print('$', ' '.join(str(c) for c in cmd))
    return subprocess.run(cmd, cwd=ROOT).returncode == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--zip', help='use a downloaded dataset zip instead of the Kaggle API')
    ap.add_argument('--skip-download', action='store_true', help='reuse the CSVs already in data/raw/')
    ap.add_argument('--no-test', action='store_true', help='skip the headless browser smoke test')
    args = ap.parse_args()

    # 1. Get the raw CSVs into a temp folder first, so a bad download never
    #    overwrites a working data/raw/.
    if args.skip_download:
        step('Using existing data/raw/')
        if not RAW.exists():
            fail('data/raw/ does not exist yet; run without --skip-download or pass --zip.')
        csv_dir = find_csv_dir(RAW)
        validate(csv_dir)
    else:
        tmp = Path(tempfile.mkdtemp(prefix='nba_raw_'))
        if args.zip:
            step(f'Unzipping {args.zip}')
            with zipfile.ZipFile(args.zip) as z:
                z.extractall(tmp)
        else:
            step('Downloading latest data from Kaggle')
            download_from_kaggle(tmp)
        csv_dir = find_csv_dir(tmp)
        step('Checking the new data')
        validate(csv_dir)
        if RAW.exists():
            shutil.rmtree(RAW)
        shutil.copytree(csv_dir, RAW)
        shutil.rmtree(tmp, ignore_errors=True)
        csv_dir = RAW

    # 2. Regenerate data/*.json and rebuild, restoring data/ on any failure.
    before = snapshot()
    if BACKUP.exists():
        shutil.rmtree(BACKUP)
    BACKUP.mkdir()
    for f in DATA.glob('*.json'):
        shutil.copy2(f, BACKUP / f.name)
    backup_html = (ROOT / 'index.html').read_bytes() if (ROOT / 'index.html').exists() else None

    def restore(reason):
        for f in BACKUP.glob('*.json'):
            shutil.copy2(f, DATA / f.name)
        if backup_html is not None:
            (ROOT / 'index.html').write_bytes(backup_html)
        fail(f'{reason}. data/ and index.html were restored to their previous versions.')

    step('Regenerating data/*.json')
    if not run([sys.executable, 'scripts/prep_data.py', str(csv_dir)]):
        restore('prep_data.py failed')
    step('Rebuilding index.html')
    if not run([sys.executable, 'build.py']):
        restore('build.py failed')
    if not args.no_test:
        step('Running smoke test')
        try:
            import playwright  # noqa: F401
        except ImportError:
            print('Playwright not installed; skipping (pip install playwright && playwright install chromium).')
        else:
            if not run([sys.executable, 'tests/smoke_test.py']):
                restore('the smoke test failed')
    shutil.rmtree(BACKUP, ignore_errors=True)

    # 3. Report what changed.
    after = snapshot()
    step('Done')
    if before:
        if after['latest'] > before['latest']:
            new = f'{before["latest"] + 1}' if after['latest'] == before['latest'] + 1 else f'{before["latest"] + 1}-{after["latest"]}'
            print(f'New season(s) added: {new}')
        else:
            print(f'Latest season still {after["latest"]}')
        print(f'Players:        {before["players"]:,} -> {after["players"]:,}')
        print(f'Player-seasons: {before["player_seasons"]:,} -> {after["player_seasons"]:,}')
        print(f'{after["latest"]} season: {after["latest_rows"]} player rows, '
              f'most games played so far {after["latest_max_gp"]} (was {before["latest_max_gp"] if before["latest"] == after["latest"] else "n/a"})')
    print('index.html rebuilt. Review it, then commit data/ and index.html.')


if __name__ == '__main__':
    main()
