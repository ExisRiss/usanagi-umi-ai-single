# Tutorial Task194 — Grup Seleksi, Notifikasi Rich, /addseleksi + Akun Otomatis

## 1. Grup seleksi (grup WA khusus review)
- Buat grup WA terpisah (mis. "Admin Seleksi"), tambahkan bot.
- Pemilik (atau yang punya akses) jalankan `/grupseleksi` di grup itu →
  notifikasi pendaftar baru masuk ke sini lengkap dengan tombol **Terima/Tolak**.
- Punya banyak seleksi? `/grupseleksi <nama>` untuk memilih.
- Tanpa grup seleksi: notifikasi fallback ke grup tujuan (perilaku lama).
- Data: `grup.grupSeleksiJid` (store.js); bot cek keberadaannya di grup target
  sebelum kirim (poller) — kalau bot tidak ada di grup seleksi, tidak dikirim
  ke grup tujuan (supaya tidak salah tempat).

## 2. Notifikasi rich
- `sendInteractive` (native flow: quick_reply Terima/Tolak + cta_url panel),
  mention admin grup seleksi, foto pendaftar bila ada.
- Body memakai label rapi (Title Case per kolom, kolom kosong dilewati).
- Kalau rich gagal → fallback teks rapi + mention (bukan caption sembarangan);
  error dicetak `[SELEKSI] Rich notif gagal, fallback teks: ...`.

## 3. /addseleksi (akun web otomatis)
- `/addseleksi @tag` | reply pesan | `/addseleksi 628xxxx` — di grup seleksi
  ATAU grup tujuan; pemilik/owner/helper (yang punya akses) boleh.
- Target otomatis dapat **akun web** (username `u<10 digit>`, password acak)
  dikirim via DM + akses ke grup tsb. Akun sudah ada → langsung aktif.
- Alias lama: `addanggotaseleksi`, `addanggota`.
- Bug ikut diperbaiki: `grup-info` sekarang terima `jid` pengirim — sebelumnya
  helper/pemilik non-dev selalu ditolak (`boleh=false`).

## 4. Multi-grup per akun
- Satu akun bisa diundang ke banyak grup seleksi (`/addseleksi`) atau memilikinya.
- `GET /api/grup/saya` → daftar grup + peran; beranda SPA menampilkan kartu
  "Buka panel" per grup; pengaturan grup tetap terpisah per grup.

## 5. /tutorialseleksi
- Plugin `plugins/info/tutorialseleksi.js` — panduan lengkap, bisa dari
  grup atau chat pribadi.

## Uji lokal
`/tmp/uji194.mjs` — 14/14 (aturSeleksi, peranGrup, pending seleksiJid, kode
+fields, auto-akun helper, login helper, panel via idAkun pemilik, multi-grup,
perluPilih, 404 tanpa akses).

## Pemasangan
Push → deploy `store.js`, `api.js`, `seleksi.js`, `tutorialseleksi.js`,
`index.html` (+ dokumen) dua server → restart 1× → cek live.
