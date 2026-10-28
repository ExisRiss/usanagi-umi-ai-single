# Cinematic Typography Video Editor

Fitur bot Usanagi Umi AI (Task146). Kirim video atau foto lewat WhatsApp, pilih
template, bot mengirim balik MP4 dengan tipografi sinematik: judul besar,
subjudul script, teks kecil lokasi/tanggal, efek **teks muncul dari blur lalu
tajam**, kamera bergerak pelan, kolase 4 panel, color grading, dan audio asli
yang dipertahankan.

- **Ukuran & rasio hasil selalu mengikuti media utama** (bukan dipaksa 9:16).
- Rotasi HP (metadata 90°/180°/270°) diikuti, foto tidak diregangkan.
- Semua proses berjalan di bot yang sudah ada: tidak ada koneksi WhatsApp kedua,
  tidak ada listener pesan tambahan.

---

## 1. Cara pakai (WhatsApp)

```
1. Kirim video atau foto (boleh sebagai dokumen; boleh dibalas).
2. .edit template nature      → pilih gaya
3. .edit judul NATURE
4. .edit sub Mountain Prau
5. .edit meta DIENG · 28 OKT 2026
6. .edit render
```

Media berikutnya yang dikirim selama sesi berjalan otomatis ditambahkan ke
kolase (maksimal 4).

| Perintah | Fungsi |
|---|---|
| `.edit` | panduan + status sesi |
| `.edit mulai` | sesi baru (berkas lama dihapus) |
| `.edit template` | daftar template |
| `.edit template nature` | pilih template |
| `.edit judul <teks>` | judul besar |
| `.edit sub <teks>` | subjudul script |
| `.edit meta <teks>` | teks kecil (lokasi/tanggal/koordinat) |
| `.edit logo` | pakai PNG yang sedang dibalas |
| `.edit tanpa logo` | lepas logo |
| `.edit durasi 15` | panjang hasil (detik) |
| `.edit slow 0.6` | slow motion (0.4–1, 1 = normal) |
| `.edit kualitas tinggi` | rendah / sedang / tinggi |
| `.edit render` | render sekarang |
| `.edit batal` | batalkan + hapus berkas sementara |

Prefix mengikuti pengaturan bot (`.` atau `!`, `,`, dsb). Alias perintah:
`videoeditor`, `veledit`.

## 2. Template

| id | Karakter |
|---|---|
| `nature` | judul sans tebal + subjudul script, vignette + grain, zoom-in pelan |
| `editorial` | serif berkarakter, teks kecil lokasi/tanggal, zoom + pan |
| `minimal` | sans minimalis, banyak ruang kosong, zoom-out |
| `script` | subjudul script besar, glow lembut |
| `gaming` | judul tebal, outline + warna, gerakan lebih kuat |
| `gallery` | kolase 4 panel sudut membulat, panel masuk bergantian |

Setiap template mengatur sendiri: font per peran, ukuran, warna, outline,
shadow, posisi, waktu masuk/keluar, blur, pop, grading, logo, dan tata panel.
Semua ukuran ditulis sebagai **rasio terhadap sisi pendek kanvas**, jadi sama
tampilannya di 720×1280 maupun 1920×1080.

## 3. Struktur

```
lib/video-editor/
  config.js       ambang batas + environment variable
  probe.js        ffprobe: dimensi, rotasi, SAR, fps, audio, durasi
  fonts.js        pencari font per peran (judul/serif/script/meta)
  templates.js    6 preset + timing animasi
  render.js       penyusun filter_complex + eksekusi + verifikasi hasil
  session.js      sesi per chat+pengirim, antrean render, pembersihan
  validation.js   validasi MIME/ukuran/jumlah/template/logo/teks
plugins/tools/video-editor.js   perintah WhatsApp
docs/VIDEO-EDITOR.md            dokumen ini
tests/task146-video-editor.mjs  uji 77 skenario
```

## 4. Kebutuhan sistem

- **FFmpeg** dengan filter: `drawtext`, `gblur`, `zoompan`, `alphamerge`, `geq`,
  `eq`, `vignette`, `noise`, `overlay`, `crop`, `scale`, `fade`.
  Sudah tersedia di `@ffmpeg-installer/ffmpeg` (ikut `package.json` bot).
- **FFprobe** opsional tapi sangat disarankan (verifikasi hasil). Kalau tidak
  ada, bot memakai `ffmpeg -i` sebagai cadangan dan menandai hasil "tidak
  diverifikasi".
  Kalau mau memakai paket: `npm i @ffprobe-installer/ffprobe`
  (tanpa paket pun tetap jalan).
- Font TTF/OTF di server (lihat §6). `.ttf` dan `.otf` didukung libfreetype.

Kalau FFmpeg tidak bisa dijalankan, perintah `.edit render` membalas alasannya —
tidak menggantung tanpa penjelasan.

## 5. Konfigurasi (environment variable di panel)

| Variabel | Bawaan | Arti |
|---|---|---|
| `VIDEO_EDITOR_ENABLED` | `1` | `0` = matikan seluruh fitur |
| `VIDEO_EDITOR_MAX_INPUT_BYTES` | `36700160` (35 MB) | batas per berkas |
| `VIDEO_EDITOR_MAX_OUTPUT_BYTES` | `67108864` (64 MB) | batas berkas hasil |
| `VIDEO_EDITOR_MAX_DURATION` | `60` | batas durasi sumber & hasil (detik) |
| `VIDEO_EDITOR_PHOTO_DURATION` | `12` | panjang hasil untuk foto (detik) |
| `VIDEO_EDITOR_MAX_MEDIA` | `4` | jumlah media per sesi |
| `VIDEO_EDITOR_MAX_CONCURRENT` | `2` | rendering bersamaan |
| `VIDEO_EDITOR_MAX_QUEUE` | `8` | panjang antrean |
| `VIDEO_EDITOR_TIMEOUT_MS` | `300000` | batas waktu satu render |
| `VIDEO_EDITOR_TEMP_DIR` | folder temp sistem | lokasi berkas sementara |
| `VIDEO_EDITOR_DEFAULT_QUALITY` | `sedang` | `rendah`/`sedang`/`tinggi` |
| `VIDEO_EDITOR_MAX_FPS` | `30` | fps keluaran maksimum |
| `VIDEO_EDITOR_SESSION_TTL_MS` | `1800000` | umur sesi (30 menit) |
| `VIDEO_EDITOR_HEAVY_EFFECTS` | `1` | `0` = matikan grain & unsharp |
| `VIDEO_EDITOR_FFMPEG` | otomatis | path biner ffmpeg |
| `VIDEO_EDITOR_FFPROBE` | otomatis | path biner ffprobe |
| `VIDEO_EDITOR_FONT_JUDUL` / `_SERIF` / `_SERIF_ITALIC` / `_SCRIPT` / `_META` | otomatis | font per peran |
| `VIDEO_EDITOR_DEFAULT_LOGO` | — | path logo bawaan (opsional) |

Rekomendasi VPS 2 core: biarkan `MAX_CONCURRENT=2` dan `TIMEOUT_MS=300000`.
Kalau RAM < 1 GB, turunkan `MAX_CONCURRENT=1` dan set `HEAVY_EFFECTS=0`.

## 6. Menambah font

Bot mencari font per **peran**, bukan satu font untuk semua teks:

```
assets/fonts/video-judul.ttf        judul (sans tebal / serif berkarakter)
assets/fonts/video-serif.ttf        judul gaya editorial
assets/fonts/video-serif-italic.ttf subjudul editorial
assets/fonts/video-script.ttf       subjudul script
assets/fonts/video-meta.ttf         teks kecil (lokasi/tanggal)
```

Nama berkas di atas langsung dipakai tanpa mengubah kode. Kalau tidak ada,
pencarian berlanjut ke `@font` bawaan repo (`Convered-By-Your-Grace.ttf`,
`DejaVuSans-Bold.ttf`, dst) lalu ke DejaVu Sans. **Satu peran gagal tidak
membatalkan rendering.**

> Gunakan font yang lisensinya jelas. Bot tidak mengunduh font dari internet.

## 7. Menambah logo

- `.edit logo` sambil membalas gambar **PNG transparan** (maks 2 MB), atau
- letakkan PNG di server dan set `VIDEO_EDITOR_DEFAULT_LOGO`.

Ukuran, posisi (kiri/kanan × atas/bawah), dan opacity diatur template
(`logo.ukuran`, `logo.posisi`, `logo.opacity`). Tanpa logo, layer logo dilewati
dan rendering tetap jalan.

## 8. Menambah template

Tambahkan satu objek di `lib/video-editor/templates.js`:

```js
travel: {
  id: 'travel',
  nama: '✈️ Travel',
  deskripsi: 'Untuk video perjalanan',
  motion: { jenis: 'pan-kanan', skala: 1.10 },
  grading: { kontras: 1.05, saturasi: 1.08, kecerahan: 0, vignette: true, grain: 6, glow: false, unsharp: true },
  teks: {
    judul:    { font: 'judul', ukuran: 0.12, warna: '#ffffff', outline: 0.003, posisiY: 0.40 },
    subjudul: { font: 'script', ukuran: 0.05, warna: '#ffe9c9', posisiY: 0.50 },
    meta:     { font: 'meta', ukuran: 0.02, warna: '#eeeeee', posisiY: 0.88 },
  },
  panel: { mode: 'single', radius: 0.03, border: 0.004 },
  logo: { aktif: false, posisi: 'kanan-bawah', ukuran: 0.07, opacity: 0.8 },
  audio: { pertahankan: true },
},
```

`motion.jenis`: `zoom-in`, `zoom-out`, `pan-kiri`, `pan-kanan`, `pan-atas`,
`pan-bawah`, `zoom-pan`, `statis`.
`panel.mode`: `single`, `dua`, `tiga`, `empat`.

## 9. Cara kerja render (ringkas)

1. Media diperiksa `ffprobe`: dimensi, rotasi, SAR, fps, durasi, audio.
2. Kanvas = dimensi efektif media utama (setelah rotasi), dibulatkan genap.
3. Media utama diperbesar `skala` (1.06–1.20) lalu `zoompan` memberi gerakan
   kamera tanpa distorsi.
4. Panel kolase dipotong per panel + masker PNG sudut membulat (`geq`), lalu
   di-`alphamerge` dan di-`overlay` bergantian.
5. Color grading (`eq`, `vignette`, `unsharp`, `noise`).
6. Tiap teks dibuat dua lapis: **versi blur** (`gblur` + `fade alpha`) dan
   **versi tajam** (`zoompan` pop + fade). Versi blur muncul lebih dulu.
7. Logo (opsional) → `format=yuv420p` → H.264 + AAC + `+faststart`.
8. Hasil diperiksa ulang `ffprobe` (dimensi, durasi, audio) sebelum dikirim.

Teks pengguna **tidak pernah** masuk ke sintaks filter: selalu lewat
`textfile=` dan argumen dikirim sebagai array ke `spawn()` (tanpa shell).

## 10. Menjalankan uji

```bash
# di server / dev yang punya ffmpeg & ffprobe
node tests/task146-video-editor.mjs
```

Uji membuat media sintetis sendiri (portrait, landscape, square, rasio 1024×436,
rotasi 90°, foto, berkas rusak) lalu merender 10+ video dan memeriksa hasilnya
dengan ffprobe. Hasil terakhir di mesin pengembangan: **77/77 lolos**.

## 11. Diagnosis masalah FFmpeg

| Gejala | Penyebab & solusi |
|---|---|
| `FFmpeg tidak bisa dijalankan` | biner tidak ada. Set `VIDEO_EDITOR_FFMPEG`, atau pastikan `@ffmpeg-installer` terpasang (`npm install`). |
| `No such filter: drawtext` | build FFmpeg tanpa libfreetype. Pakai build dari `@ffmpeg-installer` atau `apt install ffmpeg`. |
| `Failed to configure input pad` di `alphamerge` | ukuran masker ≠ ukuran panel. Itu bug tata letak, bukan konfigurasi — laporkan. |
| `Stream specifier ... matches no streams` | satu keluaran filter dipakai dua kali (butuh `split`). Bug internal; sudah ditangani otomatis. |
| Render sangat lambat | turunkan `MAX_FPS`, set `HEAVY_EFFECTS=0`, `MAX_CONCURRENT=1`. |
| Hasil dipotong sebelum durasi | `VIDEO_EDITOR_MAX_DURATION` lebih pendek dari sumber — ini disengaja. |
| `Antrean rendering penuh` | terlalu banyak render bersamaan; tunggu atau naikkan `MAX_QUEUE`. |
| Font tidak sesuai | pasang berkasnya dengan nama `video-<peran>.ttf` atau set `VIDEO_EDITOR_FONT_<PERAN>`. |

## 12. Keamanan

- MIME + ekstensi divalidasi sebelum unduh; ukuran & jumlah dibatasi.
- Template, font, dan logo dari whitelist; nama berkas disanitasi
  (tidak ada path dari pengguna).
- Teks pengguna → `textfile`, bukan filter.
- `spawn` dengan array argumen (tanpa shell), batas waktu proses, batas antrean.
- Berkas sementara dihapus setelah kirim, setelah gagal, atau saat sesi
  dibatalkan/kedaluwarsa.
- Error teknis masuk log server; pengguna menerima pesan yang bisa dipahami.

## 13. Batasan yang masih ada

- Belum ada interpolasi frame (RIFE dkk). Slow motion di bawah 0.6× pada video
  24 fps akan terasa kurang halus — bot menolak nilai ekstrem untuk fps rendah.
- Video sumber tanpa audio tetap menghasilkan MP4 dengan **kanvas audio sunyi**
  (bukan tanpa audio sama sekali) supaya pemutar WhatsApp tidak error. Caption
  hasil membedakan "audio asli dipertahankan" vs "tanpa audio".
- Belum ada antrean persisten: kalau bot restart saat render berjalan, pekerjaan
  itu hilang (berkas sementara di folder temp bisa tersisa; hapus manual atau
  restart membersihkan `/tmp` bila panel mengosongkannya).
- Kartu template belum bisa diatur per pengguna dari website; saat ini lewat
  environment variable dan berkas template.
- Kolase mendukung 2–4 panel (mode `dua`, `tiga`, `empat`). Media lebih sedikit
  dari slot akan diulang memakai media terakhir — bukan panel kosong.
