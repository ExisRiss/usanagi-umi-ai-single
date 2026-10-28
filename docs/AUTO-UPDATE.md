# Auto Update Bot — panduan untuk developer & AI lain

> **Dokumen ini penting.** Kalau kamu (manusia atau AI) diminta mengubah bot ini,
> baca dulu bagian ini sebelum menyentuh `lib/auto-update.js`,
> `plugins/owner/auto-update.js`, atau berkas apa pun yang berjalan di server.

## Apa yang dilakukan fitur ini

Bot memeriksa repo GitHub-nya sendiri, membandingkan isi berkas di server dengan
isi repo, mengunduh yang berubah, memeriksa sintaks, lalu restart.

```
.autoupdate              status + tutorial (kartu tombol)
.autoupdate cek          tampilkan commit terbaru + daftar berkas yang beda (tanpa menulis)
.autoupdate now          terapkan pembaruan lalu restart
.autoupdate paksa        sama, tapi menimpa berkas yang pernah diedit manual
.autoupdate on | off     pemeriksaan otomatis berkala
.autoupdate log          riwayat 10 kejadian
.autoupdate restart      restart saja
```

Fitur ini **hanya ada di source code**. Tidak ada tombolnya di website, dan
tidak boleh ditambahkan ke UI web tanpa persetujuan owner.

## Berkas yang terlibat

| Berkas | Isi |
|---|---|
| `lib/auto-update.js` | seluruh logika: cek, terapkan, restart, penjadwal, log |
| `plugins/owner/auto-update.js` | lapisan perintah WhatsApp (khusus developer) |
| `data/auto-update.json` | konfigurasi + kredensial (mode 600, **tidak masuk repo**) |
| `data/auto-update-state.json` | cache sha blob Git per berkas + commit terakhir |
| `data/auto-update-log.jsonl` | riwayat kejadian (append-only) |
| `data/auto-update-backup/<waktu>/` | salinan berkas lama sebelum ditimpa |
| `tests/task142-autoupdate.mjs` | uji aturan keamanan path & sintaks |

## Aturan yang tidak boleh dilanggar

1. **Hanya path di `IZIN_PATH`** yang boleh ditimpa:
   `lib/`, `plugins/`, `core/`, `scripts/`, `tests/`, `docs/`, `handler.js`,
   `main.js`, `config.js`.
2. **`TOLAK_PATH` selalu ditolak**, walaupun ditulis di konfigurasi:
   `data/`, `sessions/`, `node_modules/`, `tmp/`, `database.json`, `.env`,
   `.secrets/`, `.git/`. Di server, `data/` berisi kredensial dan `sessions/`
   berisi sesi WhatsApp hidup — menimpanya = bot kehilangan login.
3. **Setiap `.js` wajib lolos `node --check`** sebelum ditulis. Kalau gagal,
   berkas dilewati dan dilaporkan; bot tetap jalan dengan versi lama.
4. **Backup dulu, baru timpa.** Salinan lama disimpan per waktu.
5. **Jangan menimpa berkas yang diedit manual** di server kecuali memakai
   `.autoupdate paksa`. Ini mencegah perubahan darurat di server hilang.
6. **Restart hanya setelah semua berkas ditulis** dan tidak ada galat fatal.

## Cara pembandingan bekerja (jangan diganti dengan `date`/ukuran saja)

Git menyimpan setiap berkas sebagai blob dengan sha1:

```
sha1("blob <panjang>\0<isi>")
```

Fungsi `gitBlobSha()` menghitung nilai itu **secara lokal**. Kalau sama dengan
`sha` di GitHub tree, isinya identik — tanpa mengunduh apa pun. Ini membuat
pemeriksaan 2.500 berkas selesai ~1 detik dan hemat kuota API. Membandingkan
"tanggal file" atau "ukuran" saja akan salah: ukuran sama belum tentu isi sama.

## Cara restart (berlapis)

1. `restart.cmd` di `data/auto-update.json` kalau diisi (dijalankan detached).
2. API panel Pterodactyl/Pelican:
   `POST {panelUrl}/api/client/servers/{serverId}/power` dengan `{"signal":"restart"}`.
3. Kalau dua-duanya tidak ada: tulis penanda lalu `process.exit(0)`. Ini **hanya
   hidup lagi kalau panel menyetel auto-restart**. Pilihan terakhir, dicatat di log.

Kredensial panel **hanya** di `data/auto-update.json` (mode 600). Jangan pernah
menaruhnya di `config.js`, repo, atau pesan chat.

## Contoh isi `data/auto-update.json` (dibuat di server)

```json
{
  "versi": 1,
  "aktif": true,
  "repo": "ExisRiss/usanagi-umi-ai-single",
  "branch": "main",
  "token": "<token GitHub dengan izin baca repo>",
  "intervalMenit": 30,
  "restart": {
    "mode": "panel",
    "panelUrl": "https://panel.example.com",
    "apiKey": "<client API key server sendiri>",
    "serverId": "xxxxxxxx",
    "cmd": ""
  }
}
```

## Kesalahan yang pernah terjadi (jangan diulang)

- Menyunting `start.sh` dengan regex dan meninggalkan `fi` menggantung → server
  Minecraft tidak bisa menyala. Untuk berkas non-JS, tetap periksa manual.
- Menelan galat `catch {}` saat verifikasi database → akun terlihat "sudah
  dihapus" padahal masih ada (lihat Task141 di `lib/akun-platform.js`).
- Menganggap "panel STARTING" berarti mati, lalu restart berulang.
