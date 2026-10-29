"""Akses Cloudflare pakai Global API Key (prefix cfk_) + email akun.

Kredensial hanya dibaca dari /home/user/.secrets/cloudflare-global.env (600)
dan TIDAK pernah dicetak.
"""
import json
import urllib.error
import urllib.request

ENV = {}
for baris in open('/home/user/.secrets/cloudflare-global.env'):
    baris = baris.strip()
    if baris and not baris.startswith('#') and '=' in baris:
        k, v = baris.split('=', 1)
        ENV[k.strip()] = v.strip()

EMAIL = ENV.get('CLOUDFLARE_EMAIL', '')
KUNCI = ENV.get('CLOUDFLARE_GLOBAL_TOKEN', '')
ZONE = '749ac07d6dba0c78a4913d3d08491b66'
ACC = '036f8ab78b289954794f71ada514e225'


def api(path, method='GET', body=None, mentah=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        'https://api.cloudflare.com/client/v4' + path,
        data=data, method=method,
        headers={'X-Auth-Email': EMAIL, 'X-Auth-Key': KUNCI, 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            isi = resp.read()
            return resp.status, (isi if mentah else json.loads(isi or b'{}'))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except Exception:
            return e.code, {}
