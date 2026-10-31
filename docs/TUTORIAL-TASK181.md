# Tutorial Task181 — Kartu `..menu` kembali ke alur terbukti + 5 bug + 3 sumber fitur

> 31 Oktober 2026 · File utama: `lib/umi-menu/menu-laut.js`, `lib/simple.js`,
> `lib/group-metadata-cache.js`, `plugins/maker/maker-ttqc.js`,
> `plugins/tools/usanagi-rvo.js`, `plugins/tools/rin-tools.js`,
> `plugins/downloader/usp-scrapr.js`, `plugins/maker/usanagi-fakedana.js`

## 1. Kartu `..menu` kecil, tombol mati, tak bisa digeser (fix utama)

### diagnosis (fakta empiris dari HP owner)
| Versi | Gejala di HP owner |
|---|---|
| sisipGulir `height:100%` (Task177-lanjutan/178) | **"foto doang"** — body tinggi 0, hanya `.bg` fixed yang tampil |
| `.stage position:fixed` (Task180) | **kecil, tombol mati, tak bisa digeser** — pembungkus fixed besar merusak tata letak/tap WebView rich message |
| Task177-original (ujirich) | **tampil utuh** — satu-satunya yang pernah dilihat owner bagus |

### solusi Task181
Kembali ke alur Task177-original: `html,body{height:auto}` tanpa overflow tersembunyi, **tanpa `.stage`**, `.isi` jadi wadah gulir sentuh `max-height:340px`, nav statis di alur dokumen, body `umi-scroll-sendiri` (sisipGulir dilewati). Teks banner (Task180) **dipertahankan**. `VERSI_MENU = task181-alur-dasar-isi-scroll`.

Uji desktop: `.isi` scrollable 340px, tab pindah halaman, banner teks utuh (`menu-uji-task181.html`).

## 2. Lima error laporan

| Error | Akar | Fix |
|---|---|---|
| `.mcjoin` HTTP 502 | panel sesaat 502 | **sudah beres di server** (`permintaan()` retry×3 + balasan `error.ramah`); file server-only ikut di-commit |
| `.addcase` `reading 'null'` | `quoted.download()` di simple.js melempar TypeError sinkron (mediaMessage null) | guard: selalu kembalikan Promise; pesan jelas "tidak memiliki media" |
| `.listgc` "Daftar grup berubah" | event grup datang saat fetch | `all()` tandai `GROUP_LIST_CHANGED` lalu **auto-ulang ≤2×** |
| `.ttqc` font 404 | `googlefonts/noto-emoji` pindah | rantai cadangan URL (tag stabil + jsdelivr); berkas lokal tetap prioritas |
| `$rvo` "empty media key" | Baileys tak membuka bungkus view-once | node media hasil `unwrapRvoMessage` dikirim ulang polos; kalau `mediaKey` kosong → balasan ramah "sudah dibuka/kedaluwarsa" |

## 3. Fitur baru

### `.bypass .cekban .cekoperator .trackip .subdo .sub2unlock .tts2 .rateweb .speedweb` (rin-tools.js)
Endpoint API Rin (apiii-xrina.my.id) yang belum ada; parameter diverifikasi probe langsung (`number`, `ip`, `domain`, `url`, `text`). Semua lewat provider milik bot; tanpa apikey untuk endpoint gratis.

### `.scrapr <link>` + `.unshorten <link>` (usp-scrapr.js + lib/scrapr.js)
Pustaka **coflyn/scrapr** (GitHub, MIT) di-vendor sebagai `lib/vendor/scrapr-bundle.cjs` (self-contained, tanpa dependensi npm). Rute otomatis 40+ platform (TikTok/IG/Twitter/YT/Spotify/FB/Pinterest/SoundCloud/Reddit/TeraBox/MediaFire/Pixeldrain/Catbox/GDrive/safelink/sub2unlock, dll) + fallback antar scraper. Uji hidup: unshorten aka.ms ✓, mediafire resolver ✓.

### `.fakedana <nominal>` (usanagi-fakedana.js)
Gambar fake saldo DANA — diport dari bot **VanXone Multi Device** (anya/maker, karya Rin imup). Aset (font/bg/mata) diunduh sekali ke `assets/fakedana/`.

## Cara uji ulang

```bash
node --check lib/umi-menu/menu-laut.js lib/simple.js lib/group-metadata-cache.js \
  plugins/maker/maker-ttqc.js plugins/tools/usanagi-rvo.js plugins/tools/rin-tools.js \
  plugins/downloader/usp-scrapr.js plugins/maker/usanagi-fakedana.js
# di WhatsApp:
..menu        # kartu tampil utuh + teks banner, tab jalan, geser jalan
.scrapr https://www.mediafire.com/file/.../file.zip
.cekban 628xxxxxxxxxx
.fakedana 50.000
.rvo (reply foto sekali lihat)
```
