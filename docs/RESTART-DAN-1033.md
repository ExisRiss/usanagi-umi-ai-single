# Situs/API error Cloudflare 1033, 530, dan 1027 — penyebab & cara pulih

Catatan kejadian 29 Oktober 2026. Dua error berbeda, dua penyebab berbeda.
Keduanya bukan bug website-nya.

## Ringkas

| Yang terlihat | Arti sebenarnya | Pemicu | Perbaikan |
|---|---|---|---|
| **1033** "Cloudflare Tunnel error … unable to resolve it" | Tunnel tidak punya koneksi aktif → server bot mati **atau** DNS host itu menunjuk tunnel yang sudah tidak jalan | (a) server berhenti setelah restart bertumpuk; (b) 18 CNAME di zona menunjuk tunnel lama yang `down` | server dinyalakan + watchdog 2 menit + kode restart diperbaiki; semua CNAME mati dialihkan ke tunnel hidup `72975e9b` |
| **530** (sering berpasangan dengan 1033) | Sama seperti 1033: Cloudflare tidak bisa menghubungi origin | idem | idem |
| **1027** "This website has been temporarily rate limited — the owner has reached their plan limits" | Kuota **Cloudflare Worker** gratis (100.000 request/hari) habis, dan route-nya disetel *fail closed* → seluruh zona diblokir | Worker lama Task117 `alzriss-okta-platform` dengan route catch-all `*.gwenna.my.id/*` dan `gwenna.my.id/*` | route catch-all dihapus; trafik langsung ke DNS → tunnel bot |

## Bukti diagnosis 1027

Sebelum perbaikan, **semua** host di zona dibalas 1027, termasuk:
`kiw-kiw-ganteng-alzriss`, `api`, `upload`, `situs`, subdomain acak
`zzz-test-156.gwenna.my.id`, bahkan apex `gwenna.my.id` — padahal
`GET /accounts/…/cfd_tunnel` menunjukkan tunnel `umi-api-gwenna` **healthy (4 koneksi)**.
Artinya paket tidak pernah sampai ke tunnel: ada yang memotong di depan (Worker).

```
GET /zones/<zone>/workers/routes
  *.gwenna.my.id/*   → alzriss-okta-platform
  gwenna.my.id/*     → alzriss-okta-platform
```

Sejak Task152/153/155/156 bot sudah melayani sendiri:

- situs subdomain → `situs/<nama>/` lewat `lib/situs-lokal.js`
- upload publik → `data/upload-publik/` lewat `lib/upload-publik.js`
- API → `api.gwenna.my.id`
- domain sendiri (Task156) → `lib/domain-sendiri.js`

Jadi Worker itu tidak dipakai lagi dan route-nya aman dihapus.

## Perintah pemulihan (owner)

```bash
# 1) cek & hapus route Worker catch-all
python3 tools/cf-route-okta.py --status
python3 tools/cf-route-okta.py --hapus

# 2) kalau suatu saat Worker lama dibutuhkan lagi
python3 tools/cf-route-okta.py --pulihkan

# 3) restart bot dengan aman (satu restart + tunggu benar-benar hidup)
PANEL_AKUN=2 python3 tools/restart-aman.py
PANEL_AKUN=2 python3 tools/restart-aman.py --cek     # cek saja
PANEL_AKUN=2 python3 tools/restart-aman.py --start   # hanya kalau mati
```

Kredensial Cloudflare untuk skrip di atas dibaca dari
`.secrets/cloudflare-global.env` (mode 600): `CLOUDFLARE_EMAIL` +
`CLOUDFLARE_GLOBAL_TOKEN` (Global API Key berawalan `cfk_`). Kunci itu **tidak
pernah** dicetak ke log maupun chat.

## Kenapa server bisa mati (akar 1033)

1. Panel ini melaporkan status `starting` terus (egg tidak punya penanda
   "startup complete"), sehingga status panel tidak bisa dipakai sebagai patokan.
2. `lib/auto-update.js` dulu, kalau restart lewat panel gagal (mis. panel
   membalas **429 Too Many Attempts** karena beberapa restart berdekatan),
   menjalankan `process.exit(0)` dengan harapan panel menyalakan ulang.
   Panel Pterodactyl **tidak** menyalakan ulang sendiri → server berhenti total
   → semua domain 1033/530 sampai dinyalakan manual.

Perbaikan yang sudah masuk:

- `mintaPanelRestart()` mencoba ulang 4 kali (jeda 0/3/7/15 detik) dan
  membedakan 429/5xx (layak diulang) dari 4xx izin.
- `restartBot()` **tidak lagi** mematikan proses. Kalau panel tetap menolak,
  bot tetap hidup dan menandai `perluRestart` supaya perubahan dipakai pada
  restart berikutnya. `process.exit(0)` hanya jalan bila konfigurasi
  `restart.izinkanExit = true` (khusus panel yang punya auto-restart).
- **Watchdog panel**: jadwal `*/2 * * * *` (setiap 2 menit) dengan tugas
  `power start`. Kalau server mati, panel menyalakannya sendiri tanpa
  bergantung pada siapa pun. Sudah diuji: server dimatikan manual →
  `last_run_at` terisi → bot hidup lagi.
- Semua CNAME yang menunjuk tunnel mati (`alzriss-okta`, `bot-utama`,
  `bot-v1`, `bot-v2`, `kaira-tunel`) dialihkan ke `72975e9b…cfargotunnel.com`.
  Subdomain yang belum terdaftar sekarang menampilkan halaman
  "Domain ini belum terdaftar di bot" (404), bukan 1033.

## Checklist kalau situs mati lagi

1. `PANEL_AKUN=2 python3 tools/restart-aman.py --cek`
   - `health 200` → bot & tunnel sehat, cek bagian Cloudflare.
   - `diblokir Cloudflare` (403/429) → lihat apakah halamannya 1027.
   - `gagal` + RAM kecil → server mati; jalankan `--start`.
2. `python3 tools/cf-route-okta.py --status` → pastikan **tidak ada** route
   catch-all yang memotong zona.
3. Cek tunnel: `GET /accounts/<acc>/cfd_tunnel` → `umi-api-gwenna` harus
   `healthy` dengan ≥1 koneksi.
4. Baru curigai isi situs (`situs/<nama>/index.html`) atau registry
   (`data/subdomain-registry.json`).
