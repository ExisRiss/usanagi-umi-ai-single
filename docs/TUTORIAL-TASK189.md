# Tutorial Task189 — Perbaikan Laporan Owner (1 Nov 2026)

Lima laporan owner diselesaikan dalam satu rilis (commit `Task189`):

## 1. Grup kena `GROUP_FORBIDDEN (403)` terus-menerus
**Gejala:** `.bot off`, `.sulap`, dll di grup `1203…` membalas "Grup ini sedang
tidak bisa diakses bot (403/404)".
**Akar:** cache metadata (`lib/group-metadata-cache.js`) menangkap 403/404
sementara lalu memblokir grup 2 menit; kalau query berikutnya masih gagal,
grup tetap error padahal bot masih di dalamnya.
**Fix:** `noteIncoming(id)` — setiap pesan MASUK dari grup membuka blokir
(debounce 30 dtk/grup) karena pesan masuk = bukti bot masih anggota. Sinyal
dikirim dari `handler.js` via `conn.noteIncomingGroupMetadata` (dipasang di
`lib/simple.js`).

## 2. Jadibot "log out sendiri"
**Akar:** `catch` start di `lib/jadibot.js` menghapus folder sesi saat start
gagal — padahal kebanyakan kegagalan transient (jaringan/RPC). Kredensial
valid ikut terhapus → terasa logout sendiri.
**Fix:** sesi TIDAK dihapus pada kegagalan start (prinsip sama dengan
Task187 — 401 ditoleransi 3×). Kalau sesi memang rusak permanen, owner bisa
`.deljadibot` lalu pairing ulang. (Gagal *pairing awal* tetap membersihkan
sesi kosongnya — itu memang sesi baru yang belum pernah login.)

## 3. `autodelmsg` & `spamtag/spamht` tidak boleh menyentuh nomor tertentu
**Aturan baru:** nomor developer (`global.owner`), nomor terkunci, owner
utama, **dan `+62823-6414-5692`** tidak pernah:
- dihapus pesannya oleh autodelmsg (`nomorTerlindungi()` di
  `plugins/owner/autodelmsg.js`);
- dijadikan sasaran spamtag (ditolak dengan pesan);
- ikut ditag spam hidetag (dikeluarkan dari daftar mention).

Nomor tambahan ditulis di satu tempat per plugin — kalau mau menambah lagi,
cari `6282364145692` di kedua file.

## 4. Bot delay / sering tidak respon
Log pengawas (`data/lambat.jsonl`) menunjukkan hanya perintah berat (tiktok
9–13 dtk) — tidak ada kemacetan global. Penyebab "tidak respon" yang nyata
selama ini: grup yang kena `GROUP_FORBIDDEN` (butir 1) + jadibot yang mati
karena sesi terhapus (butir 2) — keduanya sudah diperbaiki.

## 5. `//menu` tidak bisa digeser
**Akar:** tombol ▲▼ Task186 memakai `scrollControls` dari elaina-baileys —
tombol tampil & bisa dipencet tapi tidak menggeser isi di WebView WhatsApp
beberapa HP.
**Fix:** tombol ▲▼ diganti HTML biasa + script inline yang meng-scroll
`body` langsung (`lib/umi-menu/router.js`). Script inline terbukti jalan di
WebView kartu (skrip AUTO_SIZE ukur-tinggi memakai mekanisme sama). Body
kartu juga diberi `touch-action:pan-y` (`lib/umi-menu/html.js`) agar gesture
touch tidak tertahan.

## Pemasangan
- 8 file di atas + dokumen ini → push GitHub → deploy dua server
  (`044f34b0`, `d1ebc84a`) → **restart 1×** (handler.js & lib core ikut
  berubah, hot-reload tidak cukup untuk file inti).
- Verifikasi: boot tanpa error, `.ht <teks>` di grup masih jalan, uji
  `.sulap`/`.bot off` di grup yang tadi kena 403, `//menu` tombol ▲▼
  menggeser isi kartu.
