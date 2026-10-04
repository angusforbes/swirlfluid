#!/usr/bin/env python3
"""swirlfluid debug receiver: the page's debug button (or the d key) sends a screenshot plus every setting here,
and they are saved where the agent working on swirlfluid can read them:

  debug/captures/<YYYYmmdd-HHMMSS>-<preset>/shot.png, state.json, note.md   (debug/ is git-ignored)
  debug/captures.jsonl                                                       one line per capture, newest last

Start it while you are sending captures (any page of the site, local or https://angusforbes.github.io/swirlfluid/,
posts to http://127.0.0.1:8790 on the same machine):

  python3 tools/debug-receiver.py

With no receiver running (e.g. on a phone), the page downloads the screenshot and the state instead.
"""
import base64, datetime, json, os, re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8790
DEBUG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'debug')


def slug(s):
    return re.sub(r'[^A-Za-z0-9._-]+', '-', str(s or '')).strip('-')[:40] or 'capture'


class H(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')   # Chrome: https page -> localhost

    def reply(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code); self.cors()
        self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body)))
        self.end_headers(); self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        if self.path != '/capture' or not 0 < n < 40 * 1024 * 1024: return self.reply(400, {'ok': False})
        try:
            d = json.loads(self.rfile.read(n))
            now = datetime.datetime.now()
            rel = os.path.join('captures', now.strftime('%Y%m%d-%H%M%S') + '-' + slug(d.get('label')))
            out = os.path.join(DEBUG, rel); os.makedirs(out, exist_ok=True)
            png = (d.get('png') or '').split(',', 1)[-1]
            if png:
                with open(os.path.join(out, 'shot.png'), 'wb') as f: f.write(base64.b64decode(png))
            with open(os.path.join(out, 'state.json'), 'w') as f: json.dump(d.get('state', {}), f, indent=2, sort_keys=True)
            note = (d.get('note') or '').strip()
            with open(os.path.join(out, 'note.md'), 'w') as f:
                f.write(f"# {d.get('label') or 'capture'} ({now:%Y-%m-%d %H:%M:%S})\n\n{note or '(no note)'}\n")
            with open(os.path.join(DEBUG, 'captures.jsonl'), 'a') as f:
                f.write(json.dumps({'time': now.isoformat(timespec='seconds'), 'dir': 'debug/' + rel, 'label': d.get('label'), 'note': note}) + '\n')
            print(f'{now:%H:%M:%S} debug/{rel}' + (f'  "{note}"' if note else ''), flush=True)
            self.reply(200, {'ok': True, 'dir': 'debug/' + rel})
        except Exception as e:
            self.reply(500, {'ok': False, 'error': str(e)})

    def log_message(self, *a): pass


if __name__ == '__main__':
    print(f'swirlfluid debug receiver on http://127.0.0.1:{PORT} -> {DEBUG}/captures  (Ctrl+C to stop)', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
