"""Kelola route Worker 'alzriss-okta-platform' di zona gwenna.my.id.

Worker lama Task117 memakai route catch-all:
    *.gwenna.my.id/*     → alzriss-okta-platform
    gwenna.my.id/*       → alzriss-okta-platform
Akibatnya SELURUH trafik zona lewat Worker. Kuota gratis Worker
(100.000 request/hari) habis → Cloudflare "fail closed" → error 1027
untuk semua host, tunnel bot tidak pernah tersentuh.

Sejak Task152/153/155/156 situs & API dilayani bot sendiri lewat tunnel,
jadi route catch-all ini tidak diperlukan lagi.

Pemakaian:
    python3 tools/cf-route-okta.py --status
    python3 tools/cf-route-okta.py --hapus
    python3 tools/cf-route-okta.py --pulihkan
"""
import importlib.util
import os
import sys

spec = importlib.util.spec_from_file_location('cfg', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cf-global.py'))
cfg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cfg)

POLA = ['*.gwenna.my.id/*', 'gwenna.my.id/*']
SCRIPT = 'alzriss-okta-platform'


def daftar():
    st, isi = cfg.api(f'/zones/{cfg.ZONE}/workers/routes')
    if st != 200:
        raise SystemExit(f'gagal membaca route: {st} {isi.get("errors")}')
    return isi.get('result') or []


def status():
    routes = daftar()
    if not routes:
        print('route Worker: TIDAK ADA (trafik langsung ke DNS → tunnel bot)')
    for r in routes:
        tanda = '⚠️ catch-all' if r.get('pattern') in POLA else '•'
        print(f'  {tanda} {r.get("pattern")} → {r.get("script")}')


def hapus():
    routes = daftar()
    for r in routes:
        if r.get('pattern') in POLA and r.get('script') == SCRIPT:
            st, isi = cfg.api(f'/zones/{cfg.ZONE}/workers/routes/{r["id"]}', 'DELETE')
            print(('✅ dihapus ' if st == 200 else f'❌ gagal {st} ') + r['pattern'])
    for r in daftar():
        if r.get('pattern') in POLA:
            print('⚠️ masih tersisa:', r.get('pattern'), '→', r.get('script'))


def pulihkan():
    ada = {r.get('pattern') for r in daftar()}
    for pola in POLA:
        if pola in ada:
            print('sudah ada:', pola)
            continue
        st, isi = cfg.api(f'/zones/{cfg.ZONE}/workers/routes', 'POST', {'pattern': pola, 'script': SCRIPT})
        print(('✅ dipulihkan ' if st == 200 else f'❌ gagal {st} ') + pola)


if __name__ == '__main__':
    aksi = sys.argv[1] if len(sys.argv) > 1 else '--status'
    print('== status sebelum ==')
    status()
    if aksi == '--hapus':
        print('== menghapus route catch-all ==')
        hapus()
        print('== status sesudah ==')
        status()
    elif aksi == '--pulihkan':
        pulihkan()
        status()
