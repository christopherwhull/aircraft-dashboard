#!/usr/bin/env python3
"""Restart the Aircraft Dashboard server and tile server.

Features:
- Stop processes listening on configured ports (3002, 3003).
- Start `node server.js` and `node geotiff-server.js` detached and log output to `logs/`.
- Support `--server`, `--tiles`, `--all` and `--wait` options.
- Can fallback to calling the `/api/restart` endpoint if `--use-api` is passed with a token.
"""
from __future__ import annotations
import argparse
import json
import os
import signal
import subprocess
import sys
import time
from typing import List, Optional

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LOGS = os.path.join(ROOT, 'logs')
os.makedirs(LOGS, exist_ok=True)

SERVICES = {
    'server': {
        'port': 3002,
        'cmd': ['node', 'server.js'],
        'log': os.path.join(LOGS, 'server.log')
    },
    'tiles': {
        'port': 3003,
        'cmd': ['node', 'geotiff-server.js'],
        'log': os.path.join(LOGS, 'geotiff.log')
    }
}


def find_pids_for_port(port: int) -> List[int]:
    pids = []
    try:
        if os.name == 'nt':
            out = subprocess.check_output(['netstat', '-ano'], encoding='utf8', errors='ignore')
            for line in out.splitlines():
                if f':{port} ' in line or f':{port}\r' in line or f':{port}\t' in line:
                    parts = line.split()
                    if parts:
                        pid = parts[-1]
                        if pid.isdigit():
                            pids.append(int(pid))
        else:
            # try ss, fall back to netstat
            try:
                out = subprocess.check_output(['ss', '-ltnp'], encoding='utf8', errors='ignore')
            except Exception:
                out = subprocess.check_output(['netstat', '-anp'], encoding='utf8', errors='ignore')
            import re
            for line in out.splitlines():
                if f':{port} ' in line or f':{port}\n' in line:
                    m = re.search(r'pid=(\d+)', line)
                    if m:
                        pids.append(int(m.group(1)))
                    else:
                        toks = [t for t in line.split() if t.isdigit()]
                        if toks:
                            pids.append(int(toks[-1]))
    except Exception:
        pass
    return list(dict.fromkeys(pids))


def kill_pid(pid: int):
    try:
        if os.name == 'nt':
            subprocess.check_call(['taskkill', '/PID', str(pid), '/F'])
        else:
            os.kill(pid, signal.SIGTERM)
            time.sleep(0.2)
    except Exception:
        try:
            if os.name == 'nt':
                subprocess.check_call(['taskkill', '/PID', str(pid), '/F', '/T'])
            else:
                os.kill(pid, signal.SIGKILL)
        except Exception as e:
            print(f'Failed to kill {pid}: {e}', file=sys.stderr)


def start_service(key: str):
    svc = SERVICES[key]
    cmd = svc['cmd']
    log = svc['log']
    print(f"Starting {key}: {' '.join(cmd)} (log: {log})")
    lf = open(log, 'a', encoding='utf8')
    # Detached start
    if os.name == 'nt':
        proc = subprocess.Popen(cmd, cwd=ROOT, stdout=lf, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NEW_CONSOLE)
    else:
        proc = subprocess.Popen(cmd, cwd=ROOT, stdout=lf, stderr=subprocess.STDOUT, start_new_session=True)
    print(f"Started PID {getattr(proc, 'pid', 'unknown')} for {key}")


def write_test_reminder():
    """Write a short reminder about running tests to the logs and print to console."""
    reminder = (
        "Reminder: Run the project test suite after a restart:\n"
        "  - Run `npm test` (jest) or `node tools/test-all.js` for full checks.\n"
        "  - Test helpers and diagnostics live in the `tools/` folder."
    )
    try:
        out_path = os.path.join(LOGS, 'restart_reminder.txt')
        with open(out_path, 'a', encoding='utf8') as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {reminder}\n")
        print('\n' + reminder + f"\n(also written to {out_path})\n")
    except Exception as e:
        print('Failed to write restart reminder:', e, file=sys.stderr)


def restart_target(key: str):
    svc = SERVICES[key]
    port = svc['port']
    print(f"Checking port {port} for existing process...")
    pids = find_pids_for_port(port)
    if pids:
        print(f"Found PIDs on port {port}: {pids}. Stopping...")
        for pid in pids:
            kill_pid(pid)
        time.sleep(0.6)
    else:
        print(f"No process found on port {port}")
    start_service(key)


def api_restart(server_url: str, token: Optional[str]) -> bool:
    try:
        import urllib.request, urllib.error
        data = None
        headers = {}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        req = urllib.request.Request(f'{server_url}/api/restart', data=None, headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status == 200
    except Exception as e:
        print('API restart failed:', e)
        return False


def wait_for_health(server: str, timeout: int = 60) -> bool:
    import urllib.request, json
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f'{server}/api/health', timeout=3) as r:
                if r.status == 200:
                    try:
                        body = r.read().decode('utf8')
                        j = json.loads(body)
                        if j.get('status') == 'ok':
                            return True
                    except Exception:
                        return True
        except Exception:
            pass
        time.sleep(1)
    return False


def main(argv: List[str]):
    p = argparse.ArgumentParser(description='Restart server and tile services')
    p.add_argument('--server', action='store_true', help='Restart app server (port 3002)')
    p.add_argument('--tiles', action='store_true', help='Restart tile server (port 3003)')
    p.add_argument('--all', action='store_true', help='Restart both')
    p.add_argument('--use-api', action='store_true', help='Attempt to call /api/restart instead of local restart')
    p.add_argument('--token', default=os.environ.get('RESTART_API_TOKEN', ''), help='API restart token')
    p.add_argument('--wait', action='store_true', help='Wait for /api/health to report ok')
    p.add_argument('--server-url', default=os.environ.get('SERVER_URL', 'http://localhost:3002'))
    args = p.parse_args(argv[1:])

    targets = []
    if args.all or (not args.server and not args.tiles and not args.all):
        targets = ['server', 'tiles']
    else:
        if args.server:
            targets.append('server')
        if args.tiles:
            targets.append('tiles')

    if args.use_api and args.token:
        print('Attempting API restart...')
        ok = api_restart(args.server_url, args.token)
        if ok:
            print('API restart triggered')
            if args.wait:
                if wait_for_health(args.server_url):
                    print('Server healthy')
                else:
                    print('Server did not become healthy in time')
            # Always print/write test reminder after a restart
            try:
                write_test_reminder()
            except Exception:
                pass
            return 0
        else:
            print('API restart failed; falling back to local restarts')

    for t in targets:
        if t not in SERVICES:
            print('Unknown target', t)
            continue
        restart_target(t)

    if args.wait:
        print('Waiting for server health...')
        ok = wait_for_health(args.server_url, timeout=60)
        print('Health OK' if ok else 'Health check timed out')

    # Always print/write test reminder after local restarts
    try:
        write_test_reminder()
    except Exception:
        pass

    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
