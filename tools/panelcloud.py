"""Klien Pterodactyl untuk panel private.panelcloud.biz.id (2 akun, 1 domain).

Pilih akun lewat env PANEL_AKUN=1 (default) atau 2.
Kredensial dibaca dari /home/user/.secrets/panel-cloud.env — tidak pernah dicetak.
"""
import io, json, os, urllib.request, urllib.error, urllib.parse, uuid

ENV_PATH = os.environ.get('PANEL_ENV', '/home/user/.secrets/panel-cloud.env')
AKUN = str(os.environ.get('PANEL_AKUN', '1')).strip()


def load_env(path=ENV_PATH):
    env = {}
    for line in open(path):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k] = v.strip().strip('"').strip("'")
    return env


ENV = load_env()
PREFIX = '' if AKUN == '1' else AKUN
BASE = ENV[f'PTERO{PREFIX}_PANEL_URL'].rstrip('/')
KEY = ENV[f'PTERO{PREFIX}_CLIENT_API_KEY']
SID = os.environ.get('PANEL_SID', ENV.get(f'PTERO{PREFIX}_SERVER_ID', ''))


def _req(method, path, data=None, raw=False, headers=None, timeout=120):
    url = BASE + path
    body = json.dumps(data).encode() if data is not None and not isinstance(data, bytes) else data
    h = {'Authorization': f'Bearer {KEY}', 'Accept': 'application/json', 'User-Agent': 'umi-deploy'}
    if data is not None and not isinstance(data, bytes):
        h['Content-Type'] = 'application/json'
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            payload = r.read()
            return payload if raw else (json.loads(payload) if payload else {})
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'replace')[:400]
        raise RuntimeError(f'{method} {path} → HTTP {e.code} {detail}')


def servers():
    return [(d['attributes']['identifier'], d['attributes']['name'], d['attributes'].get('node'))
            for d in _req('GET', '/api/client')['data']]


def detail(sid=None):
    return _req('GET', f'/api/client/servers/{sid or SID}?include=egg')['attributes']


def resources(sid=None):
    return _req('GET', f'/api/client/servers/{sid or SID}/resources')['attributes']


def list_files(sid, directory='/'):
    q = urllib.parse.quote(directory)
    out = []
    for item in _req('GET', f'/api/client/servers/{sid}/files/list?directory={q}')['data']:
        a = item['attributes']
        out.append((a['name'], a.get('size', 0), a.get('is_file', True), a.get('mimetype', '')))
    return out


def read_file(sid, path):
    q = urllib.parse.quote(path)
    return _req('GET', f'/api/client/servers/{sid}/files/contents?file={q}', raw=True)


def write_file(sid, path, content: bytes):
    q = urllib.parse.quote(path)
    return _req('POST', f'/api/client/servers/{sid}/files/write?file={q}', data=content,
                headers={'Content-Type': 'application/octet-stream'})


def delete_files(sid, paths, root='/'):
    return _req('POST', f'/api/client/servers/{sid}/files/delete', {'root': root, 'files': paths})


def mkdir(sid, root, name):
    return _req('POST', f'/api/client/servers/{sid}/files/create-folder', {'root': root, 'name': name})


def compress(sid, root, files):
    return _req('POST', f'/api/client/servers/{sid}/files/compress', {'root': root, 'files': files})


def decompress(sid, root, file):
    return _req('POST', f'/api/client/servers/{sid}/files/decompress', {'root': root, 'file': file})


def download_url(sid, path):
    q = urllib.parse.quote(path)
    return _req('GET', f'/api/client/servers/{sid}/files/download?file={q}')['attributes']['url']


def upload_file(sid, directory, nama, content: bytes):
    """Unggah berkas lewat multipart/form-data ke folder tertentu."""
    batas = '----umi' + uuid.uuid4().hex
    buf = io.BytesIO()
    buf.write(f'--{batas}\r\n'.encode())
    buf.write(f'Content-Disposition: form-data; name="files"; filename="{nama}"\r\n'.encode())
    buf.write(b'Content-Type: application/octet-stream\r\n\r\n')
    buf.write(content)
    buf.write(f'\r\n--{batas}--\r\n'.encode())
    q = urllib.parse.quote(directory)
    return _req('POST', f'/api/client/servers/{sid}/files/upload?directory={q}', data=buf.getvalue(),
                headers={'Content-Type': f'multipart/form-data; boundary={batas}'}, timeout=600)


def power(sid, signal='start'):
    return _req('POST', f'/api/client/servers/{sid}/power', {'signal': signal})


def set_startup(sid, key, value):
    return _req('PUT', f'/api/client/servers/{sid}/startup/variable', {'key': key, 'value': value})
