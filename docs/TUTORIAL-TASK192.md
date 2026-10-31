# Tutorial Task192 — Seleksi Privat, Kode 8 Digit, Notif & Acc Otomatis, Spamstiker

Lanjutan sistem seleksi (Task190/191). Enam perbaikan + satu fitur:

## 1. Seleksi privat
- `GET /api/grup/publik` **tanpa `idAkun` → selalu `[]`** — tidak ada daftar
  grup yang bisa dibrowse; seleksi hanya lewat **link langsung**.
- Beranda menampilkan kartu "Seleksi privat" alih-alih daftar.
- Tab Grup → hanya grup milik akun yang masuk; belum masuk → ajakan link langsung.

## 2. Kode pendaftaran 8 digit angka (sekali pakai)
- `kodeAcak()` → `10000000–99999999` (`lib/seleksi/store.js`).
- Submit menolak bukan-8-digit (400) dan kode bekas (sekali pakai per grup).
- `/seleksi` bisa dijalankan ulang → kode baru setiap kali.

## 3. Notif ke grup & bot menambahkan anggota (AKAR BUG)
- **Sebelumnya**: `pending` difilter `serverKey` = nomor bot pembuat
  (sering jadibot) sedangkan poller jalan di bot utama → notif tidak pernah
  terkirim; ACC dari web hanya mengubah status → bot tidak menambahkan.
- **Sekarang**: `pending` tanpa filter server; plugin hanya mengirim bila
  `groupMetadata(grupTujuan)` sukses (bot anggota grup) + klaim `antar` dulu
  (gagal → `antar-batal` untuk dicoba lagi).
- **Alur ACC**: status `diterima` → flag `accPending` → poller
  `GET /api/sinkron/acc-pending` → bot `groupParticipantsAdd` + DM selamat +
  link grup utama → `POST /api/sinkron/acc-selesai`. Tombol ACC di grup memakai
  alur sama (gagal → flag tetap nyala, dicoba lagi oleh poller).

## 4. Prefix dikembalikan ke kebijakan bot
- `handler.customPrefix = [/^\W/]` dihapus dari `plugins/group/seleksi.js` —
  seleksi kini mengikuti prefix aktif bot masing-masing (Task117).
- Tombol `SELEKSI:ACC/TOLAK` tetap jalan: `plugin.before` dipanggil dispatcher
  tanpa syarat prefix (lihat handler.js — sebelum blok command match).

## 5. Link grup seleksi & grup utama di halaman seleksi
- Field `linkGrup` & `linkUtama` per grup (hanya `http(s)`).
- Diisi via `/buatseleksi <nama> [linkGrup] [linkUtama]` atau input per grup di
  Owner panel website (tombol "Simpan link").
- Ditampilkan di halaman form (dua info-kode) + dibalas saat ACC (DM bot).

## 6. Tombol panel rapi di HP
- `class="aksi"` pengganti inline style: desktop 2 tombol di sisi kanan kartu,
  ≤719px melebar penuh 2 kolom simetris (`.pendaftar .aksi`).

## 7. `/spamstiker <jumlah>` (plugin baru)
- Balas stiker → bot kirim ulang N kali (batas **50**), jeda 250 ms, animasi
  loading 1️⃣→🔟, ringkasan selesai.

## Uji lokal
`/tmp/uji192.mjs` — 16/16: privat, kode 8 digit, sekali pakai, link, pending
lintas server, accPending, acc-pending/selesai, SPA.

## Pemasangan
Push → deploy file ke dua server (`d1ebc84a` + `044f34b0`) → **restart 1×**
(`lib/seleksi/*.js` di-import platform API saat boot) → pantau log
`[SELEKSI]`.
