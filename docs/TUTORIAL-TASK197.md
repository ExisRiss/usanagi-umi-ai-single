# Tutorial Task197 — Game /spidergame (RichMassange Explorer V2)

## Cara main
1. **Di chat**: ketik `/spidergame` (prefix mengikuti prefix bot) → game dikirim
   sebagai pesan AI Rich (HTML interaktif) — pakai joystick virtual di layar.
   Butuh WhatsApp terbaru yang mendukung Rich Message; kalau tidak didukung,
   bot otomatis menawarkan link web.
2. **Via web**: https://spidergame-alzriss.gwenna.my.id/ (disajikan dari
   `situs/spidergame/index.html` — sama persis game-nya).

## Berkas
- `lib/rich-games/spidergame.html` — isi game (dibaca plugin tiap kirim, di-cache).
- `plugins/game-html/spidergame.js` — command `spidergame`/`htmlspider`;
  payload `richResponseMessage` mengikuti pola game HTML lain (flappy dkk).
- `situs/spidergame/index.html` — salinan untuk versi web (dua server).
- URL web bisa di-override env `SPIDERGAME_WEB_URL`.

## Uji lokal
`/tmp/uji197.mjs` — 7/7 (regex, struktur rich, payload HTML utuh34KB,
messageId = responseId).

## Pemasangan
Push (plugin + html + docs) → deploy plugin+html + tulis `situs/spidergame/`
di dua server → restart → cek `https://spidergame-alzriss.gwenna.my.id/` 200.

---

## 🔧 Perbaikan Bug (laporan pengguna)

**Laporan:** "kok kepotong, tombol gede, laba laba gaada, map ga kelihatan, iKON tombol gaada"

**Diagnosis (bukti):** game hanya punya SATU dependensi eksternal — three.js r128 dari cdnjs.
Kalau CDN itu gagal dimuat (jaringan memblokir/WebView ketat), objek `THREE` kosong → seluruh
`<script>` utama mati di `const V=THREE.Vector3` → konsekuensinya persis semua keluhan:
- **laba-laba gaada** = mesh three.js tak pernah dibuat;
- **map ga kelihatan** = kanvas minimap `#map` tak pernah digambar;
- **iKON tombol gaada** = ikon tombol diisi JS (`ui()` menggambar SVG: petir/jalan/kamera/orbit/reset/suara/peta/robot);
- **kepotong** = `R.setSize(innerWidth,innerHeight)` memakai tinggi WebView yang bisa meleset → canvas tak pas;
- **tombol gede** = ukuran px tetap (`#joy` 140px, `.b` 58px, kolom 68px) di layar chat yang sempit.

**Perbaikan:**
1. **three.js di-bundle lokal** — `situs/spidergame/three.min.js` (603 KB) untuk versi web.
   Web memuat lokal dulu, kalau gagal fallback ke cdnjs, lalu jsdelivr (3 tingkat).
2. **Varian chat (payload WhatsApp)** — cdnjs + fallback jsdelivr, lalu **guard overlay**:
   bila `THREE` tetap kosong, HUD menampilkan peringatan merah + tautan versi web
   (https://spidergame-alzriss.gwenna.my.id/) supaya pemain diarahkan ke web yang pasti jalan.
3. **Anti-kepotong** — `R.setSize(clientWidth, clientHeight, false)`: pakai ukuran viewport
   nyata `document.documentElement` dan TIDAK menulis style inline (CSS `inset:0` yang menang),
   plus dengar `orientationchange`.
4. **Tombol responsif** — joystick `min(126px,34vw)` + knob 44%, panel `width:min(232px,58vw)`
   kolom fleksibel, tinggi tombol `clamp(44px,13vw,58px)`, ikon `clamp(17px,5vw,22px)`.

**Hasil uji Playwright (Chromium 390×844, tmp-uji/alat/uji-spider-fix.mjs) — 12/12 lulus:**
| Skenario | Pemeriksaan | Hasil |
|---|---|---|
| Chat normal (CDN hidup) | THREE, ikon+label (7 tombol), minimap 49 KB, joy 126px, panel 226px, kanvas OK, tanpa overlay | ✅ |
| Chat + semua CDN diblokir | overlay panduan muncul dengan tautan web | ✅ |
| Web lokal + CDN diblokir | THREE dari lokal, ikon ada, minimap tergambar | ✅ |
