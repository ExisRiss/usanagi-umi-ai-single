"""Restart server bot dengan aman — satu restart, tunggu benar-benar hidup.

Pelajaran dari kejadian Cloudflare 1033:
  • Panel ini melaporkan status `starting` terus (egg tidak punya penanda
    "startup complete"), jadi patokan sebenarnya = health publik.
  • Jangan restart saat boot belum selesai; jangan restart dua kali berdekatan
    (auto update + deploy manual) karena panel membalas 429 lalu server bisa
    berhenti total.
  • Setelah restart, tunggu sampai https://api.gwenna.my.id/api/health = 200
    (boot 2100+ plugin bisa 3–5 menit).

Pemakaian:
    PANEL_AKUN=2 python3 tools/restart-aman.py            # restart
    PANEL_AKUN=2 python3 tools/restart-aman.py --start    # hanya nyalakan kalau mati
    PANEL_AKUN=2 python3 tools/restart-aman.py --cek      # cek saja
"""
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, '/home/user/tools')
os.environ.setdefault('PANEL_AKUN', '2')
import panelcloud as pc  # noqa: E402

SID = os.environ.get('PANEL_SID', 'd1ebc84a')
HEALTH = os.environ.get('HEALTH_URL', 'https://api.gwenna.my.id/api/health')
MODE = 'restart'
for arg in sys.argv[1:]:
    if arg in ('--start', '--cek', '--restart'):
        MODE = arg.lstrip('-')
BATAS_BOOT = 480  # detik


def state():
    try:
        return str(pc.resources(SID).get('current_state') or '')
    except Exception:
        return '?'


def sehat(waktu=8):
    """True = 200. False = mati. None = tidak bisa dipastikan (Cloudflare
    membalas 403/429/1027 ke IP ini, padahal bot bisa saja hidup)."""
    try:
        with urllib.request.urlopen(HEALTH, timeout=waktu) as r:
            return r.status == 200
    except urllib.error.HTTPError as e:
        if e.code in (403, 429):
            return None
        return False
    except Exception:
        return False


def memori_mb():
    try:
        return int(pc.resources(SID).get('resources', {}).get('memory_bytes') or 0) / (1024 * 1024)
    except Exception:
        return 0.0


def uptime_s():
    try:
        return int(pc.resources(SID).get('resources', {}).get('uptime') or 0) / 1000
    except Exception:
        return 0.0


def hidup_lokal(baru=False):
    """Patokan cadangan saat Cloudflare memblokir: proses Node memakai >250 MB.
    `baru=True` minta proses yang memang baru menyala setelah restart."""
    if memori_mb() <= 250:
        return False
    return (uptime_s() < 600) if baru else True


def tunggu_sehat(batas=BATAS_BOOT, label=''):
    mulai = time.time()
    diblokir = False
    while time.time() - mulai < batas:
        h = sehat()
        if h is True:
            print(f'{label}health 200 setelah {int(time.time() - mulai)} detik ✔')
            return True
        if h is None:
            diblokir = True
            if hidup_lokal():
                print(f'{label}Cloudflare memblokir cek publik (403/429), '
                      f'tapi proses hidup (RAM {memori_mb():.0f} MB) setelah {int(time.time() - mulai)} detik ✔')
                return True
        time.sleep(6)
    if diblokir:
        print(f'{label}Cloudflare masih memblokir; RAM {memori_mb():.0f} MB, state={state()}')
        return hidup_lokal()
    print(f'{label}GAGAL: health belum 200 dalam {batas} detik (state={state()}, RAM {memori_mb():.0f} MB)')
    return False


def main():
    s0 = state()
    h0 = sehat()
    label_h = {True: '200', False: 'gagal', None: 'diblokir Cloudflare'}[h0]
    print(f'awal: state={s0 or "?"} health={label_h} RAM={memori_mb():.0f} MB')
    if MODE == 'cek':
        if h0 is True:
            return 0
        if h0 is None:
            print(f'cek publik diblokir Cloudflare; proses hidup={hidup_lokal()} (RAM {memori_mb():.0f} MB)')
            return 0 if hidup_lokal() else 1
        return 1

    if MODE == 'start':
        if h0 is True or (h0 is None and hidup_lokal()):
            print('sudah hidup — tidak perlu start')
            return 0
        if s0 == 'stopping':
            time.sleep(20)
        print('start:', pc.power(SID, 'start'))
        return 0 if tunggu_sehat(label='start ') else 1

    # restart
    if h0 is not True and not (h0 is None and hidup_lokal()):
        # Jangan menembak restart kalau server mati atau masih boot.
        if state() == 'offline':
            print('server mati → start, bukan restart:', pc.power(SID, 'start'))
        else:
            print('belum sehat, tunggu boot maksimal 5 menit dulu…')
            if tunggu_sehat(300, label='boot lama '):
                print('ternyata sudah hidup — restart dibatalkan (hindari restart dobel)')
                return 0
            print('masih belum hidup → start:', pc.power(SID, 'start'))
        return 0 if tunggu_sehat(label='start ') else 1

    print('kirim restart:', pc.power(SID, 'restart'))
    # beri jeda supaya proses benar-benar turun dulu
    time.sleep(20)
    return 0 if tunggu_sehat(label='restart ') else 1


if __name__ == '__main__':
    sys.exit(main())
