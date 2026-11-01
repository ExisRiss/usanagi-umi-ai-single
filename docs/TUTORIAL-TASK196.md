# Tutorial Task196 — /getsc Tombol + Full Akses Berpassword + Gerbang Pairing

## Menu /getsc (khusus owner utama & developer)
Ketik `/getsc` → bot kirim pesan interaktif (tombol):
1. **📦 Source code Umi lengkap** — repo `usanagi-umi-ai` (multi-bot), kode bersih.
2. **💻 Source code Umi single bot** — repo `usanagi-umi-ai-single`, kode bersih.
3. **🔐 Umi lengkap (full akses + api/token)** — owner utama/developer saja.
4. **🔐 Umi single (full akses + api/token)** — owner utama/developer saja.

Tombol hanya berefek5 menit setelah menu dibuka & hanya untuk peminta menu.

## Versi full — alur
1. Tekan tombol 🔐 → bot minta **password** (4–32 karakter) — balas dalam5 menit.
2. Bot menyiapkan & mengunggah ke **upload.gwenna.my.id**:
   - `umi-<jenis>-full-<ts>.zip` — kode dari GitHub (apa adanya).
   - `umi-tambahan-full-<ts>.umienc` — blok config.js + env token
     (`.env.apikeys`, `.env.gemini`, `.main-bot.env`, `.platform.env`,
     `.tunnel.env`, `.backup-system.env`) + `data/sc-license.enc`
     (hash password) — **terkunci AES-256-GCM** dengan password pilihanmu.
   - `bukasc.js` — alat decrypt (Node): `node bukasc.js <file> <password>`.
3. Penerima: ekstrak ZIP → decrypt .umienc → salin tiap blok ke file bernama
   sama (timpa config.js & env) → taruh `data/sc-license.enc` di `data/`.

## Gerbang pairing (di sc berlisensi)
- Saat `/pairing` / minta kode pairing bot utama, bot meminta **password sc**
  lebih dulu (console interaktif; atau env `PAIRING_PASSWORD`).
- Benar → kode pairing dikeluarkan. Salah3× → **seluruh isi folder bot
  dihancurkan** (hanya di server pengguna — file lain & server upload aman).
- Instansi TANPA `data/sc-license.enc` (bot normal) → gerbang nonaktif,
  pairing seperti biasa.

## Keamanan
- Password TIDAK pernah disimpan mentah — hanya SHA-256(salt+password)
  di `sc-license.enc`; percobaan gagal dihitung di `sc-license.state.json`.
- Token/rahasia dikirim terpisah dalam berkas terenkripsi; ZIP kode tetap
  bersih sehingga aman dibagikan.

## Uji lokal
`/tmp/uji196.mjs` —9/9 (lisensi on/off, hash, roundtrip .umienc,
decrypt salah gagal, hancurkanInstansi mengosongkan folder uji).

## Pemasangan
Push → deploy `main.js`, `lib/sc-license.js`, `plugins/owner/owner-getsc.js`
(+ dokumen) dua server → restart → cek boot 0 error.
