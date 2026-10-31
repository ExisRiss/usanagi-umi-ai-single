# Tutorial Task183 — bikintesti HD, iqontact ala WA, scrapr kirim media, `/tt` + tombol audio

> 31 Oktober 2026 · File: `plugins/maker/usanagi-bikintesti.js`,
> `plugins/maker/usanagi-iqontact.js`, `lib/scrapr.js`,
> `plugins/downloader/usp-scrapr.js`, `plugins/download/usanagi-tiktok.js`

## 1. bikintesti → HD

Keluhan: foto bukti tf blur. Penyebab: kanvas keluaran cuma 1080×1350 —
slot foto ~420 px diperbesar lagi saat dilihat.

Fix: kanvas **2× → 2160×2700** (`SKALA = 2`, semua koordinat tetap diruang
1080 via `ctx.scale`), `imageSmoothingQuality = 'high'`, JPEG kualitas
0,92 → **0,95**. Uji: keluaran `2160×2700` (loadImage memverifikasi dimensi),
66.896 B, visual tajam (`tmp-uji/sample-bikintesti-hd.jpg`).

## 2. iqontact → tampilan WhatsApp

Keluhan: "kaku, bukan kayak tampilan WA". RenderCard ditulis ulang mengikuti
halaman **Info kontak WhatsApp**:

- latar hero gradiat, avatar bulat besar + shadow + **titik online hijau**
  (siluet orang standar kalau foto WA tak ada)
- nama tebal, nomor `+62 xxx-xxxx-xxx`, baris About
  "Halo! Saya menggunakan WhatsApp."
- **tiga tombol bundar hijau** Pesan/Audio/Video (ikon vektor digambar
  sendiri — tak butuh font emoji) — menggantikan kotak kaku
- section card rounded + **pemisah tipis** antar baris, chevron `›`
- palet persis WA: gelap `#111b21`/`#202c33`/`#e9edef`/`#00a884`,
  terang `#ffffff`/`#f7f8fa`/`#111b21`/`#25d366`
- kaki "WhatsApp", jam tetap WITA

Uji render: dark 92.139 B / light 134.729 B (`tmp-uji/sample-iqontact-wa-*.png`).

## 3. `.scrapr` → kirim LANGSUNG (bukan link)

`lib/scrapr.js` + `klasifikasiMedia()` mengelompokkan hasil:
`gambar | video | audio | berkas | tautan`.

| Jenis | Contoh | Dikirim sebagai |
|---|---|---|
| audio | MP3 YT/Spotify/SoundCloud/TikTok | pesan **audio** |
| video | TikTok/IG/YT-MP4 | pesan **video** (+MP3 TikTok otomatis) |
| gambar | foto post/IG/Pinterest | pesan **gambar** |
| berkas | zip/7z/rar/apk/pdf/… + MediaFire/Pixeldrain/Catbox/GDrive/TeraBox | **dokumen** dgn nama asli |
| tautan lain | hasil resolver aneh | teks |

Pengiriman `{url}` dulu; kalau WhatsApp menolak → unduh buffer
(batas: video 60 MB, audio 25 MB, berkas 64 MB) lalu kirim ulang.
Rute TikTok kini **tiktokio dulu** (satu-satunya yang konsisten kasih MP3 +
video); `savetik` dibuang (butuh Chrome). Kalau rute pertama tanpa MP3,
plugin mengejar audio lewat tiktokio/ssstik.

## 4. `/tt` → video/foto + PILIHAN tombol audio

Perintah lama `tiktok|tt|ttdl` (plugin `download/usanagi-tiktok.js`) dipoles:

- **Foto post** kini terdeteksi (scrapr) dan dikirim sebagai **foto**, bukan
  gagal di jalur video.
- Setelah video/foto terkirim → tombol native
  **"🎵 Unduh audio (MP3)"** (`sendInteractive`, id =
  `tt-audio <link>`) — audio tak lagi dikirim otomatis (permintaan owner:
  beri pilihan). Fallback teks biasa kalau tombol gagal.
- Subperintah baru **`tt-audio`/`ttaudio`**: ffmpeg (jalur lama, ada di
  server) → scrapr cadangan → kirim MP3.
- Jalur fallback yt-dlp juga kini memberi tombol.

Catatan: `handler.command` diperluas jadi
`/^(tiktok|tt|ttdl|tt-audio|ttaudio)$/i` — tidak ada tabrakan (ttqc/ttsearch/
ttstalk/tt3/tt4/ttmp3 semuanya regex berbeda).

## Cara uji ulang

```bash
node --check lib/scrapr.js plugins/downloader/usp-scrapr.js \
  plugins/download/usanagi-tiktok.js plugins/maker/usanagi-bikintesti.js \
  plugins/maker/usanagi-iqontact.js
# di WhatsApp:
buattesti 628xx | @nama     (balas 2 foto tf)   → kartu 2160×2700 tajam
iqontact Nama | 628xx        (+ | light)         → kartu gaya info kontak WA
.scrapr <link mediafire zip>                     → dokumen langsung
.scrapr <link spotify/ytmp3>                     → audio langsung
.tt <link tiktok>                                → video/foto + tombol audio
.tt-audio <link tiktok>                          → MP3
```
