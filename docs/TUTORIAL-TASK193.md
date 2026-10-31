# Tutorial Task193 — Halaman Pengaturan + Redesign UI SaaS

## A. Halaman Pengaturan (baru)
Akses: panel seleksi `/<idAkun>/<slug>/seleksi` → tombol **"Pengaturan grup"**
(hanya pemilik grup seleksi / owner sistem).

Isi pengaturan:
1. **URL link group seleksi** — tampil di halaman pendaftaran (hanya `https?://`).
2. **URL link group utama** — dikirim bot via DM saat pendaftar diterima.
3. **Deskripsi** + sakelar **Pendaftaran dibuka/tutup**.
4. **Akses penuh** — tambah/hapus nomor yang boleh menerima & menolak
   (setara `/addanggotaseleksi`).
5. **Kolom isian seleksi** — tambah kolom baru, hapus kolom (min. 1), centang
   wajib/opsional per kolom.

API: `GET/POST /api/grup/setting` (`lib/seleksi/api.js`) — wajib login +
pemilik/owner; pengecekan `punyaAkses` biasa TIDAK cukup (helper tak bisa
membuka pengaturan). Log perubahan masuk `db.log`.

## B. Redesign UI (SaaS rapi)
- Latar `#FAFAFA`, kartu putih border `#E5E5E8` shadow `0 1px 2px rgba(0,0,0,.04)`.
- Radius: kartu 16 / input & tombol 12 / badge 8 — tidak ada >20.
- Grid: beranda 3 kolom sama lebar; owner `.owner-grid` = 2 utama (3 kolom) +
  3 status (2 kolom) — semua sejajar, **tanpa rotasi/offset/asimetri**.
- Angka statistik **hitam semua**; warna status hanya lewat **titik di label**
  (`[data-status] .dot`: hijau `#16A34A`, merah `#DC2626`, amber `#D97706`).
- Tile ikon 32px liquid-glass halus — satu-satunya elemen kaca tersisa.
- Form: label sentence case 12px, input 44px putih border `#D4D4D8`, focus ring
  2px, helper 12px, textarea min 96px; tombol utama full-width 48px hitam.
- Bottom nav: `grid-auto-flow:column` (lebar sama untuk 4–5 item), bar 64px +
  safe-area, item aktif = **tile abu muda** (bukan blok hitam).
- Header: role sebagai badge kecil abu.
- Animasi: reveal fade+`translateY(8px)` 250ms stagger 40ms + count-up;
  hover kartu −1px; tombol `:active scale(.98)`; `prefers-reduced-motion` dihormati.
- Dihapus: blob, grain, rotasi bento, split judul per kata, tombol magnetic,
  parallax (sisa Task191).

## Uji lokal
`/tmp/uji193.mjs` — 11/11 (auth setting, 403 non-pemilik, link aman,
tambah/hapus akses & field, minimal-1-field, SPA).

## Pemasangan
Push → deploy `lib/seleksi/api.js` + `situs/umi-alz-seleksi/index.html`
(+ dokumen) ke dua server → restart 1× (API di-import saat boot) → cek live.
