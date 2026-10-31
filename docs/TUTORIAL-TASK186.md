# Tutorial Task186

Tanggal: 2026-10-31
Repo: `ExisRiss/usanagi-umi-ai-single`

## Ringkasan perubahan

1. **Animasi reaction loading 1️⃣→🔟** (`lib/loading-react.js`, baru)
   - Dipasang pada: `.menu`/`..menu` (semua jalur), `.allmenu`, `getsc`,
     `spamtag`, `spamht`.
   - Reaksi pesan perintah berubah 1️⃣ 2️⃣ … 🔟 berulang selama tugas jalan;
     saat selesai reaksi akhir = ✅ (sukses) / ⚠️ (gagal).
   - Anti-tabrakan per chat; TTL pengaman 180 detik kalau `stop()` lupa
     terpanggil.
   - Contoh uji: `tmp-uji/alat/uji-anim.mjs`.

2. **Spamtag rewrite** (`plugins/pelengkap/umi/owner/umi-spamtag.js`)
   - `/spamtag 50 @tag` → tag 50×; `/spamtag 50 @tag <pesan>` → tag + pesan;
     `/spamtag 50 <pesan>` sambil reply → tag pengirim pesan direply.
   - `/spamht 50 [pesan]` → spam hidetag (mention semua member grup).
   - Batas naik 50 → **100**, jaga 400 ms → **150 ms** (lebih cepat).
   - Semua pesan spam dikirim **TANPA quote** — tidak mengutip perintah
     pengirim.
   - Contoh uji: `tmp-uji/alat/uji-spamtag.mjs`.

3. **addscraper diperbaiki** (`integrations/umi/plugins/owner/addscraper.js`)
   - TUJUAN PENYIMPANAN salah dulu: `src/scraper` (tidak pernah dibaca bot).
     Sekarang `integrations/umi/src/scraper/` — folder yang benar-benar
     dipakai bot (semua scraper di situ ESM).
   - Kode pola `module.exports = { a, b }` otomatis dikonversi menjadi
     `export { a, b }` (ESM); kalau sudah ada `export`, ditulis apa adanya.
   - Contoh di bantuan kini format ESM.
   - Alias baru `addscrapr` (ejaan yang dipakai owner) pada wrapper
     `plugins/pelengkap/umi/owner/umi-addscraper.js`.
   - addcase & addplugin diaudit + diuji lokal (`uji-addcase.mjs`,
     `uji-addplugin.mjs`) — alur tambah/kode/reload berfungsi normal.

4. **Tombol `//menu` diperbaiki**
   - `lib/umi-menu/html.js` — tinggi kartu dibatasi ~72% layar (dulu setinggi
     layar penuh → chat macet & tombol pesan daftar di bawah kartu sulit
     dijangkau). Isi panjang digeser di dalam kartu.
   - `lib/umi-menu/router.js` — kartu kini menyertakan tombol ▲▼
     (`scrollControls`) yang pasti bisa ditekan; gesture touch di WebView
     WhatsApp sering ditelan host, jadi scroll disediakan lewat tombol.
   - Pesan daftar native (tombol asli WA) tetap dikirim setelah kartu.

## Cara pakai (owner)

- `..menu` / `//menu` → kartu rich + tombol daftar native; geser isi kartu
  dengan tombol ▲▼ di pojok kanan bawah kartu bila gesture tidak masuk.
- `.spamtag 100 @628xxxx halo` → tag 100× tanpa quote perintah.
- `.spamht 50` (di grup) → hidetag semua member 50×.
- `.addscrapr nama` (alias `.addscraper`) reply kode scraper → file masuk
  `integrations/umi/src/scraper/nama.js` format ESM.
- `.addcase nama` lalu kirim kode; `.addplugin nama` lalu kirim plugin —
  tetap hot-reload tanpa restart.

## Panel

- Server lama `d1ebc84a` (panelcloud akun 2) — deploy Task186 + restart 1×.
- Server baru owner `0223aeea` (private.panelcloud.biz.id, akun RiskyXD) —
  diupdate per-file (server sudah berisi bot versi lama, file yang berbeda
  ditimpa), restart 1×. Kredensial di `.secrets/panel-risky.env`
  (`PANEL_ENV=… PANEL_AKUN=1`).
