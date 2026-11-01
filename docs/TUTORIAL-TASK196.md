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

---

## 🔧 Perbaikan Bug (laporan: "getsc gaada SC nya / file sama sekali")

**Gejala:** pesan `/getsc` full menampilkan URL lengkap, tapi ketiga tautan di upload.gwenna.my.id membalas **404 — berkas tidak ditemukan**.

**Diagnosis (bukti):** file fisik `data/upload-publik/wnt659u9/bukasc.js` **ADA di server 044f34b0** (tempat instansi menjalankan `/getsc`) tapi **TIDAK ADA di d1ebc84a**, padahal host `upload.gwenna.my.id` disaji API d1ebc84a. Artinya semua `.tourl`/getsc dari instansi di server 044f34b0 sejak awal menghasilkan tautan mati — berkasnya tersimpan di server yang salah dari sudut pandang penyaji.

**Perbaikan:**
1. **Dorongan antar server** — `simpanBerkas()` sekarang mendorong tiap berkas ke API penyaji
   (`POST https://umi-api.gwenna.my.id/api/upload-publik/terima`, auth `Bearer` secret
   `data/upload-sync.secret`, body mentah + header `X-Upload-Id/Nama/Mime`). Penyaji menulis
   **idempoten** (isi sama → dilewati). Gagal dorong hanya log — URL & penyimpanan lokal tetap jalan.
2. **Endpoint penerima** — `layaniTerimaUpload()` di `lib/upload-publik.js`, disambung di
   `route()` API; secret salah →403; penyaji belum punya secret →503.
3. **Anti tautan mati** — `kirimFull` menunggu dorongan selesai lalu **cek HEAD** ketiga URL;
   kalau ada yang mati → **fallback kirim dokumen langsung** (ZIP + .umienc + bukasc.js sebagai
   lampiran WhatsApp) dengan penjelasan. `/getsc` tidak pernah lagi mengirim tautan tanpa isi.

**Uji lokal** `tmp-uji/alat/uji-upload-dorong.mjs` — **5/5**: dorong sukses, URL hidup & isi sama,
idempoten, secret salah→403, tanpa secret penyaji→503.

**Secret:** file `data/upload-sync.secret` dipasang identik di **d1ebc84a & 044f34b0**
(cadangan lokal `.secrets/upload-sync.secret`). Instansi baru yang ingin `.tourl`-nya hidup tinggal
diberi file secret yang sama + env `UMI_UPLOAD_PENYAJI_URL` (bawaan: `https://umi-api.gwenna.my.id`).
