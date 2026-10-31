# Tutorial Task190 — Umi Alz Seleksi (website seleksi member grup)

Website + bot untuk seleksi member grup WhatsApp:
`https://umi-alz-seleksi.gwenna.my.id`

## Arsitektur
- **Server website & data pusat**: `d1ebc84a` (server yang punya DNS/tunnel
  `gwenna.my.id`). Penyaji: `lib/seleksi/api.js` (host header routing, dipanggil
  paling awal dari `lib/jadibot-platform-api.js`).
- **Bot (plugin)**: `plugins/group/seleksi.js` — hidup di SEMUA server; berbicara
  ke website lewat API sinkron (header `X-Sinkron-Secret`, berkas
  `data/seleksi-sync.json` yang isinya sama di semua server).
- **Data**: `data/seleksi/db.json` (grup, pendaftar, akun, chat, log) + foto di
  `data/seleksi/foto/`.
- **SPA**: `situs/umi-alz-seleksi/index.html` — satu file vanilla JS, halaman
  mengikuti path: `/` beranda, `/<idAkun>/<slug>` form publik,
  `/<idAkun>/<slug>/seleksi` panel, `/chat`, `/profil`, `/owner`.

## Alur pemakaian
1. **Pemilik grup** menjalankan `/buatseleksi <nama>` (atau `buatseleksi`) di
   grup WA tujuan. Bot membuat grup seleksi + **akun web otomatis**
   (password sementara dikirim ke pesan pribadi pemilik — segera ganti di
   Profil). Link pendaftaran & panel dibalas di grup.
2. **Calon member** menjalankan `/seleksi` di grup → mendapat **kode + link**.
   Di website: isi nama, umur, kelas, agama, hobi, tujuan join + foto.
3. Bot mengirim **notifikasi kaya (foto + data + mention admin)** ke grup
   tujuan dengan tombol **[✅ Terima] [❌ Tolak]**.
4. Tekan Terima → user otomatis ditambahkan ke grup + DM selamat.
   Tekan Tolak → status ditolak (+ dikeluarkan kalau sudah sempat masuk).

## Perintah bot
| Perintah | Siapa | Fungsi |
|---|---|---|
| `/seleksi` | semua (di grup) | kode + link pendaftaran |
| `/buatseleksi <nama> [deskripsi]` | admin grup | buat grup seleksi + akun web pemilik |
| `/addanggotaseleksi <nomor/@tag>` | pemilik seleksi | tambah helper (akses panel + acc/tolak) |
| `/fieldseleksi +<kolom> [label]` | pemilik seleksi | tambah kolom isian |
| `/fieldseleksi hapus <kolom>` | pemilik seleksi | hapus kolom isian |

Akses acc/tolak (web maupun tombol bot) hanya untuk: pemilik grup seleksi,
helper yang ditambahkan, dan developer bot. Tanpa akses → ditolak dengan pesan
"tidak ada akses, minta ke pemilik".

## Website
- **Beranda**: jumlah grup seleksi, status server, pesan sambutan (owner bisa
  edit).
- **Masuk/Daftar**: akun web baru; nomor WA yang terdaftar di bot dikenali
  (role developer otomatis jadi owner sistem).
- **Grup**: daftar grup seleksi terbuka → form pendaftaran (kode opsional bila
  lewat link undangan langsung).
- **Panel seleksi** `/<idAkun>/<slug>/seleksi`: daftar pendaftar + Terima/Tolak.
- **Chat**: antar akun yang sudah login.
- **Profil**: nama, bio, foto, password, **token akun** (Bearer untuk API).
- **Owner panel**: statistik (acc/tolak/menunggu), tambah/ban/unban grup,
  tutup-buka pendaftaran, role akun, log, pesan sambutan.

## Pemasangan (sudah dilakukan saat rilis)
1. Push commit → deploy ke `d1ebc84a` (website+plugin) & `044f34b0` (plugin).
2. Salin `data/seleksi-sync.json` (secret sama) ke SEMUA server.
3. DNS: CNAME `umi-alz-seleksi` → tunnel `72975e9b…` (zona gwenna.my.id).
4. Restart dua server; verifikasi: `curl https://umi-alz-seleksi.gwenna.my.id/api/status`.

## Catatan teknis
- Poller notifikasi jalan tiap 14 dtk per server, menyaring pendaftar dengan
  `serverKey` = nomor bot pembuat grup seleksi (notifikasi dikirim oleh server
  tempat grup WA berada).
- Foto dikirim sebagai base64 JSON (batas 6 MB, disimpan sebagai file).
- Keamanan: password pakai scrypt+timingSafeEqual; token acak 24 byte; endpoint
  sinkron wajib `X-Sinkron-Secret`; cookie `HttpOnly`.
