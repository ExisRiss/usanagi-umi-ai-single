# Tutorial Task199 — UMI GAME 3D (Catur & UNO 3D)

> Web game 3D: animasi langkah, efek suara (WebAudio), bayangan (shadow map),
> meja kayu 3D — gaya spidergame. Dua mode dalam satu halaman.

## Cara membuka

1. **Perintah chat**: ketik `/game3d` (atau `/catur3d`, `/uno3d`) di WhatsApp → bot
   membalas tautan `https://game3d-alzriss.gwenna.my.id/` (tautan bisa diklik).
2. **Langsung**: buka `https://game3d-alzriss.gwenna.my.id/` di browser HP/laptop.
3. **Deep-link**: `.../#catur` atau `.../#uno` langsung masuk mode itu.

> Domain di Cloudflare → CNAME → `situs.gwenna.my.id` (wildcard, arah d1ebc84a).

## Struktur halaman

- **Lobi 3D** — meja kayu berputar halus: papan catur mini (kiri) & tumpukan UNO
  (kanan). Ketuk salah satu untuk masuk mode itu. Kamera bisa diseret (orbit).
- **Catur 3D** — ketuk bidak putih → kotak hijau menandai langkah sah → ketuk
  kotak untuk melangkah. Lawan komputer (hitam) jalan otomatis. Ada skor, pesan,
  animasi angkat–lompat, bayangan PCFSoft, efek suara (klik/makan/skak/mati).
  Kemenangan/kesiangan → kembali ke lobi otomatis.
- **UNO 3D** — tangan kartu ada di bawah layar (ketuk kartu yang cocok warna/
  angka). Kartu yang tak cocok → pesan "tidak cocok". Butuh kartu → ketuk tumpukan
  di meja (kiri). Lawan 3 bot (Kanan/Depan/Kiri) jalan otomatis dengan efek suara.
  Kartu Skip/Libal/+2/Liar/Liar4 berjalan sesuai aturan; pilih warna lewat modal.
- **Tombol atas**: 🔊 suara on/off · ❓ bantuan · 🏠 kembali lobi.

## Teknis (untuk developer)

- Berkas: `situs/game3d/index.html` (satu file HTML+CSS+JS) +
  `situs/game3d/three.min.js` (fallback lokal; CDN `unpkg` dipakai dulu).
- Rendering: WebGL2 via three.js r128 — `PCFSoftShadowMap` 2048,
  `Fog(34–85)`, kamera adaptif rasio layar (`pasangKamera` — portrait → mundur).
- Suara: WebAudio murni (nada sine/square + derau) — tanpa berkas audio.
- Klik: raycaster per-mode (`daftarRay()` → anak grup lobi/catur/uno).
- API uji/deep-link: `window.UMI3D = { mulaiCatur, mulaiUno, keLobby, mode, pos }`.
- Perintah bot: `plugins/game-html/game3d.js` (env `GAME3D_WEB_URL` bisa override).

## Menambah game baru

1. Salin `situs/game3d/` → `situs/gamenew/`, ganti isi `index.html`.
2. Tambah handler di `plugins/game-html/` dengan pola `game3d.js`.
3. Cloudflare: wildcard sudah menangani `gamenew-alzriss.gwenna.my.id` → `d1/`.
