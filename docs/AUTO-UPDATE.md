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

---

## Task147 — state.sha macet & saklar `/autorestart`

### Gejala nyata di server (28-10-2026, sebelum perbaikan)

`data/auto-update-log.jsonl` setiap ±10 menit menulis:

```json
{"kejadian":"terapkan","sha":"6c464d9383…","ditulis":[],"dihapus":[],"dilewati":["lib/chat.json (server lebih baru dari commit (diedit manual) — pakai .autoupdate paksa)"]}
```

padahal `data/auto-update-state.json` masih menyimpan
`"sha": "70c04cf1c9…"` (commit Task144). Artinya commit baru **tidak pernah
dianggap selesai**, sehingga:

1. setiap siklus mengunduh ulang seluruh daftar berkas (`git/trees?recursive=1`);
2. `.autoupdate` selalu menampilkan "Commit lokal" yang lama;
3. owner membaca itu sebagai **"auto update tidak berfungsi"**, walaupun berkas
   yang berubah sudah ter-update.

### Penyebab

Satu berkas yang sah-sah saja **tidak** ditimpa (`lib/chat.json` diedit manual
di server) membuat syarat berikut tidak pernah terpenuhi:

```js
if (!hasil.dilewati.length && !hasil.gagal.length) state.sha = cek.commit.sha
```

### Aturan baru

- **Keputusan "dilewati" disimpan** di `state.dilewati[path] = { blob, sha256, alasan }`.
  Selama isi repo (`blob`) dan isi server (`sha256`) tidak berubah, berkas itu
  tidak diusulkan lagi dan tidak muncul sebagai "berubah".
- Kalau owner mengedit berkas itu lagi, `sha256` berbeda → berkas dinilai ulang
  (dan tetap dilewati bila masih lebih baru dari commit, sesuai aturan Task145).
- `state.sha` **selalu maju** ke commit yang baru diproses, kecuali ada
  **kegagalan nyata** (`gagal`: sintaks rusak / gagal tulis) — kegagalan
  memang harus dicoba lagi pada siklus berikutnya.
- `state.perluRestart` menyala setiap kali ada berkas yang benar-benar ditulis,
  dan padam saat `restartBot()` dipanggil.

### Saklar restart otomatis

| Perintah | Arti |
|---|---|
| `/autorestart` / `/autorestart status` | tampilkan status (ON/OFF, interval, commit, sisa restart) |
| `/autorestart on` | pembaruan diterapkan → bot **restart sendiri** (bawaan) |
| `/autorestart off` | pembaruan tetap ditulis, tetapi bot **tidak** restart; aktifkan dengan `/restart` |

Disimpan sebagai `restartOtomatis: true|false` di `data/auto-update.json`
(mode 600, tidak pernah masuk repo). `siklusAuto()` memakai
`putuskanRestart()`; saat OFF ia mencatat `{"kejadian":"restart","cara":"dimatikan"}`
ke log dan mengembalikan `{ ditunda: true }`.

### `/restart`

Perintah terpisah (`plugins/owner/restart.js`, khusus owner/developer):

1. balas dulu ("Restart server diminta…"),
2. tunggu 1,2 detik supaya pesan benar-benar terkirim,
3. `restartBot()` → `POST /api/client/servers/<id>/power {"signal":"restart"}`.

Pengaman: satu restart per 45 detik. Kalau kredensial panel kosong, perintah
menjelaskan bahwa bot akan keluar proses dan butuh auto-restart dari panel —
bukan diam. `/restart status` menampilkan metode yang siap dipakai.

### Uji

`node tests/task147-respons-dan-restart.mjs` — 64 cek: sintaks enam berkas,
aturan petunjuk prefix, batas waktu petunjuk, `state.sha` maju walau ada berkas
dilewati, ingatan "diedit manual", `siklusAuto()` dengan tiruan (ON vs OFF),
`/restart` yang benar-benar mengeksekusi `restart.cmd`, dan `/autorestart`
yang menyimpan setelan.

### Bug tambahan yang ditemukan saat verifikasi Task147 — `lib/chat.json` ditimpa

Siklus auto update 28-10-2026 pukul 14:35 **menimpa `lib/chat.json`**
(10.254 B → 1.230 B) dengan salinan repo. Berkas itu lolos `IZIN_PATH` karena
berada di `lib/`, padahal isinya statistik chat yang ditulis bot saat hidup
(dipakai `.totalchat`). Penyebabnya aturan nomor 3 lama: mtime berkas lebih tua
dari commit baru, jadi dianggap "ketinggalan".

Perbaikan:

- Daftar `BERKAS_RUNTIME` (`lib/chat.json`) **tidak pernah** diusulkan untuk
  ditimpa otomatis — `nilaiBerkas()` mengembalikan `jenis: 'dilewati'`.
- `terapkanPembaruan()` punya sabuk kedua: berkas runtime dilewati kecuali
  `.autoupdate paksa`.
- Berkasnya sudah dipulihkan dari
  `data/auto-update-backup/2026-10-28T14-35-51-286Z/lib/chat.json` lalu
  **digabung** dengan isi terbaru supaya statistik yang tercatat selama
  beberapa menit tidak hilang (38 chat / 231 pasangan).

Kalau nanti ada berkas data lain di dalam `lib/`/`plugins/`, tambahkan path-nya
ke `BERKAS_RUNTIME` — jangan mengandalkan mtime.
