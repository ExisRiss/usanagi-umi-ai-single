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
---

## Task145 — kenapa dulu "auto update tidak berfungsi"

Gejala di server (log `data/auto-update-log.jsonl`, 11:56 sampai 13:37):
setiap siklus 10 menit menulis `"ditulis": []` dan `"dilewati": [...]`
untuk berkas yang sama terus-menerus. Tidak ada satu berkas pun yang pernah
diperbarui otomatis.

Penyebabnya satu baris logika yang salah desain: pemindaian **pertama**
mencatat setiap berkas yang isinya beda dari repo ke `state.dasar`, lalu
berkas itu dianggap "diedit manual" **selamanya**. Akibatnya enam berkas tidak
pernah bisa ikut ter-update lagi:

```
lib/chat.json
lib/jadibot-platform-api.js
plugins/group/group-jadwalbukatutup.js
plugins/main/usanagi-allmenu.js
lib/akun-platform.js
plugins/owner/developer-akun.js
```

Salah satu berkas itu (`plugins/main/usanagi-allmenu.js`) bahkan sudah punya
versi baru di GitHub, tetapi karena tersangkut di `dasar`, bot terus memakai
versi lama.

### Aturan baru (tanpa `state.dasar`)

Untuk setiap berkas di repo, urutannya:

1. **isinya identik** dengan blob Git repo → tidak diapa-apakan (tidak diunduh);
2. isi server **sama dengan yang terakhir ditulis bot** → aman ditimpa;
3. `mtime` berkas **lebih tua** dari waktu commit → ketinggalan, ditimpa;
4. `mtime` berkas **lebih baru** dari waktu commit → kemungkinan diedit tangan,
   dilewati dengan alasan tertulis. Pakai `.autoupdate paksa` kalau memang mau
   ditimpa.

Aturannya berbasis bukti (waktu & isi), bukan catatan sekali-jadi.

### Tiga bug lain yang ikut diperbaiki

1. **Catatan "tulisan bot" salah isi.** Versi baru sempat mencatat hash isi
   server sebagai "berkas ini tulisan bot", sehingga edit tangan ikut ditimpa.
   Sekarang catatan hanya diisi untuk berkas yang benar-benar sudah ditulis
   bot, dan berkas yang berbeda dari repo justru dicabut catatannya.
2. **`node --check` tidak memeriksa ESM.** Berkas sementara ditulis `.js`, dan
   Node memeriksa `.js` sebagai CommonJS. Isi ESM yang rusak gagal di-parse CJS,
   lalu Node menganggapnya "bukan CJS" dan keluar status 0 — artinya
   `export const = ;` **lolos** pemeriksaan. Sekarang berkas sementara memakai
   ekstensi `.mjs` sehingga benar-benar divalidasi sebagai ES module.
3. **Berkas yang dihapus di repo tidak pernah dihapus di server.** Duplikat
   seperti `plugins/music/play2.js` tertinggal dan bentrok dengan plugin lain.
   Sekarang berkas yang hilang dari repo ikut dihapus di server (dibackup dulu),
   dan hanya kalau tidak diedit manual setelah commit.

Tambahan kecil: siklus pertama dijalankan **45 detik** setelah bot hidup
(dulu menunggu satu interval penuh), log diputar supaya tidak membengkak,
dan `state.berkas` tidak lagi menyimpan ribuan entri (dari 593 KB menjadi
beberapa KB).

### Uji

```
node tests/task145-autoupdate.mjs     → 41/41 lolos (GitHub tiruan)
```

Yang diuji antara lain: berkas ketinggalan benar-benar ditulis ulang,
berkas hasil edit tangan dilewati, berkas yang dihapus di repo ikut terhapus,
berkas bersintaks rusak ditolak, mode paksa bekerja, dan pemeriksaan kedua
tidak lagi "menyangkut".

### Kalau masih ada yang tidak ter-update

Lihat `.autoupdate cek`. Kalau muncul `⚠️ ... (diedit manual)`, itu **bukan
bug**: isi berkas di server lebih baru daripada commit GitHub. Kalau memang
repo yang benar, jalankan `.autoupdate paksa` — bot membackup dulu lalu
menimpanya.
