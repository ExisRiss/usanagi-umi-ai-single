# Tutorial Task180 — `..menu` teks banner tampil + `.allmenu` tak kepotong

> Tanggal: 31 Oktober 2026 · File: `plugins/_system/_allmenu.js`, `lib/umi-menu/menu-laut.js`

## Gejala (laporan owner)

1. **`.allmenu` kepotong** — pesan WhatsApp terpotong sebelum semua kategori tampil.
2. **`..menu` cuma foto Umi doang** — teks banner, header, daftar menu tidak muncul; scroll dari area mana pun tidak gerak.

## Akar masalah

### A. Caption `.allmenu` tanpa batas
`caption = text` polos — konten melebihi limit pesan (65.536 byte) lalu dipotong klien dengan kasar.

### B. `html,body{height:100%}` dari `sisipGulir()` memblokir kartu
Sejak Task177-lanjutan, kartu `..menu` memakai gulir bawaan (`sisipGulir` → tinggi 100% di html/body). Di WebView HP owner aturan itu membuat badan tinggi 0 → semua isi ter-clip; hanya `.bg` (foto Umi, `position:fixed`) yang lolos → terlihat "foto doang".

### C. Blok `.banner` tidak pernah dirakit
CSS `.banner` ada sejak Task173c, tapi elemennya tidak dipasang di HTML → "teks benner gaada".

## Solusi

### 1. `jagaBatasCaption()` di `_allmenu.js` (section BATAS_KAPTION)

Caption diukur **setelah** `Styles()` + readmore + URL, dijamin **≤ 64.500 byte** lewat tangga:

| Tahap | Aksi | Kapan jalan |
|---|---|---|
| 0 | `gaya(asli)` — perilaku lama persis | muat (menu kecil identik 12.100 B ✓) |
| 1 | readmore 4001 → 1200 | masih kebesaran |
| 2 | `buangDuplikatPerintah` — hapus baris `╠➺ ` duplikat | masih kebesaran |
| 3 | `modeHemat` — argumen `<..>[(..)]` dibuang, daftar perintah padat ASCII ` · `, baris non-cmd tetap smallcaps | masih kebesaran |
| 4 | `hematsRapi` — footer per kategori dibuang, sapaan kepala dipangkas sisa 4 baris | masih kebesaran |
| 5 | `batasKeras` — potong per baris + `console.warn` (ada jejak server) | darurat |

Judul kategori tetap smallcaps. Tidak ada potong diam-diam.

**Uji** (`tmp-uji/alat/uji-allmenu-batas.mjs`): menu kecil = output **identik persis** perilaku lama; menu sintetis 78.621 B (2.014 perintah, 37 kategori) → **41.847 B**, semua kategori & nama perintah unik utuh.

### 2. Kartu `..menu` kelola gulir sendiri (`.stage`)

```css
html,body{height:auto;margin:0;overflow:hidden}   /* TANPA height:100% */
.stage{position:fixed;inset:0;z-index:1;overflow-y:auto;overscroll-behavior-y:contain}
```

- `<body class="umi-scroll-sendiri">` → `sisipGulir()` **melewatkan** kartu ini (aturan milik sendiri tidak ditimpa).
- `<div class="stage">` membungkus seluruh isi → SATU wadah gulir; posisi `fixed` terbukti dirender di HP owner (jalur yang sama dengan `.bg`).
- Blok `.banner` kembali dirakit: `<span>nama bot</span><small>tagline · versi</small>`.
- `show()` me-reset `stage.scrollTop = 0` tiap kartu dibuka.

**Uji Playwright** (viewport HP 360×800, `tmp-uji/alat/uji-kartu-task180.py`):
banner teks "Usanagi Umi AI · Bot WhatsApp multi-fitur · v4.0.2" tampil; tab MENU scrollH 2295 px;
scroll dari area badan 0→1320 dan dari header 1320→1495 ✓. Screenshot: `tmp-uji/screenshot-task180-*.png`.

## Catatan

- Upgrade Task181-lanjutan (bendera `GULIR_BAWAAN`) masih aman: kalau owner kembali ke gulir klien, hapus `class="umi-scroll-sendiri"` dan pembungkus `.stage` saja — CSS/GSAP lama tidak diubah Task180.
- Kapitalisasi: caption `Styles()` memakai huruf kecil-kecil; `.stage` memang khusus kartu `..menu` (jangan dipakai kartu lain).

## Cara uji ulang

```bash
node --check umi/plugins/_system/_allmenu.js umi/lib/umi-menu/menu-laut.js
node tmp-uji/alat/uji-allmenu-batas.mjs        # lolos: ALLMENU-BATAS LOLOS
python3 tmp-uji/alat/uji-kartu-task180.py      # lolos: KARTU-TASK180 LOLOS
```
