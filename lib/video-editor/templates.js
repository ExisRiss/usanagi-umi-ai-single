/* By AlzRiss - Usanagi Umi AI
 *
 * Task146 — preset template typography.
 *
 * Semua ukuran ditulis sebagai RASIO terhadap sisi pendek kanvas, bukan piksel,
 * supaya tampilan sama di 720x1280 maupun 1920x1080 (syarat Task146 §6).
 *
 * Peran font:
 *   judul     → sans tebal / serif berkarakter
 *   subjudul  → script (fallback serif italic kalau file script tidak ada)
 *   meta      → sans kecil
 * Font TIDAK ditulis sebagai path di sini — lihat fonts.js (resolver).
 */

const TEKS_DASAR = {
  blur: 16,          // sigma blur saat fase pra-reveal
  blurMasuk: 0.30,   // lama blur memudar (detik)
  tajamMasuk: 0.32,  // lama teks tajam muncul dari 0 → 1 (detik)
  jeda: 0.18,        // jarak antara blur hilang dan teks tajam muncul
  pop: 0.035,        // skala awal (1 + pop) lalu menyusut ke 1
  popLama: 0.55,     // lama animasi pop
}

export const TEMPLATE = {
  /* ── A. NATURE TYPOGRAPHY ─────────────────────────────────────────────── */
  nature: {
    id: 'nature',
    nama: '🌿 Nature Typography',
    deskripsi: 'Judul besar + subjudul script, kabut blur lalu tajam, zoom lambat.',
    motion: { jenis: 'zoom-in', skala: 1.12 },
    grading: { kontras: 1.06, saturasi: 1.10, kecerahan: 0.01, vignette: true, grain: 8, glow: false, unsharp: true },
    teks: {
      judul: { font: 'judul', ukuran: 0.135, warna: '#ffffff', outline: 0.0035, shadow: 0.004, posisiY: 0.42, spasi: 0.02 },
      subjudul: { font: 'script', ukuran: 0.062, warna: '#f6e7c8', outline: 0.0025, shadow: 0.003, posisiY: 0.52 },
      meta: { font: 'meta', ukuran: 0.024, warna: '#e8e8e8', outline: 0.0015, shadow: 0.002, posisiY: 0.88 },
    },
    panel: { mode: 'single', radius: 0.03, border: 0.004, bertahap: 0.35 },
    logo: { aktif: false, posisi: 'kanan-bawah', ukuran: 0.075, opacity: 0.85 },
    audio: { pertahankan: true },
  },

  /* ── B. CINEMATIC EDITORIAL ───────────────────────────────────────────── */
  editorial: {
    id: 'editorial',
    nama: '🎬 Cinematic Editorial',
    deskripsi: 'Serif berkarakter, teks kecil lokasi/tanggal, fade elegan, pan lambat.',
    motion: { jenis: 'zoom-pan', skala: 1.08 },
    grading: { kontras: 1.12, saturasi: 0.94, kecerahan: -0.015, vignette: true, grain: 10, glow: false, unsharp: true },
    teks: {
      judul: { font: 'serif', ukuran: 0.105, warna: '#f4efe6', outline: 0.0025, shadow: 0.004, posisiY: 0.36, spasi: 0.05 },
      subjudul: { font: 'serifItalic', ukuran: 0.042, warna: '#d8c9a8', outline: 0.0018, shadow: 0.002, posisiY: 0.46 },
      meta: { font: 'meta', ukuran: 0.021, warna: '#cfc8bb', outline: 0.0012, shadow: 0.0015, posisiY: 0.90 },
    },
    panel: { mode: 'single', radius: 0.02, border: 0.003, bertahap: 0.35 },
    logo: { aktif: false, posisi: 'kiri-atas', ukuran: 0.07, opacity: 0.8 },
    audio: { pertahankan: true },
  },

  /* ── C. MINIMAL MODERN ────────────────────────────────────────────────── */
  minimal: {
    id: 'minimal',
    nama: '◻️ Minimal Modern',
    deskripsi: 'Sans-serif minimalis, banyak ruang kosong, animasi halus.',
    motion: { jenis: 'zoom-out', skala: 1.06 },
    grading: { kontras: 1.0, saturasi: 1.0, kecerahan: 0.02, vignette: false, grain: 0, glow: false, unsharp: false },
    teks: {
      judul: { font: 'judul', ukuran: 0.088, warna: '#ffffff', outline: 0, shadow: 0.002, posisiY: 0.60, spasi: 0.12 },
      subjudul: { font: 'meta', ukuran: 0.030, warna: '#e0e0e0', outline: 0, shadow: 0.0015, posisiY: 0.67 },
      meta: { font: 'meta', ukuran: 0.019, warna: '#bfbfbf', outline: 0, shadow: 0.001, posisiY: 0.93 },
    },
    panel: { mode: 'single', radius: 0.0, border: 0.0, bertahap: 0.25 },
    logo: { aktif: false, posisi: 'kiri-bawah', ukuran: 0.06, opacity: 0.7 },
    audio: { pertahankan: true },
  },

  /* ── D. ELEGANT SCRIPT ────────────────────────────────────────────────── */
  script: {
    id: 'script',
    nama: '✒️ Elegant Script',
    deskripsi: 'Subjudul script besar, blur-to-sharp lembut, cocok untuk travel.',
    motion: { jenis: 'zoom-in', skala: 1.09 },
    grading: { kontras: 1.04, saturasi: 1.06, kecerahan: 0.015, vignette: true, grain: 6, glow: true, unsharp: false },
    teks: {
      judul: { font: 'script', ukuran: 0.115, warna: '#fffdf7', outline: 0.003, shadow: 0.004, posisiY: 0.38 },
      subjudul: { font: 'meta', ukuran: 0.032, warna: '#ffe9c9', outline: 0.0018, shadow: 0.002, posisiY: 0.50 },
      meta: { font: 'meta', ukuran: 0.020, warna: '#e6e6e6', outline: 0.0012, shadow: 0.0015, posisiY: 0.90 },
    },
    panel: { mode: 'single', radius: 0.03, border: 0.003, bertahap: 0.35 },
    logo: { aktif: false, posisi: 'kanan-bawah', ukuran: 0.07, opacity: 0.8 },
    audio: { pertahankan: true },
  },

  /* ── E. GAMING TYPOGRAPHY ─────────────────────────────────────────────── */
  gaming: {
    id: 'gaming',
    nama: '🎮 Gaming Typography',
    deskripsi: 'Judul tebal + outline tebal + glow, gerakan lebih kuat.',
    motion: { jenis: 'zoom-in', skala: 1.20 },
    grading: { kontras: 1.16, saturasi: 1.25, kecerahan: 0.0, vignette: true, grain: 12, glow: true, unsharp: true },
    teks: {
      judul: { font: 'judul', ukuran: 0.15, warna: '#ffffff', outline: 0.008, outlineWarna: '#7b2ff7', shadow: 0.006, shadowWarna: '#000000', posisiY: 0.40, spasi: 0.03 },
      subjudul: { font: 'judul', ukuran: 0.055, warna: '#7b2ff7', outline: 0.003, outlineWarna: '#ffffff', shadow: 0.003, posisiY: 0.51 },
      meta: { font: 'meta', ukuran: 0.022, warna: '#ffffff', outline: 0.0015, shadow: 0.002, posisiY: 0.89 },
    },
    panel: { mode: 'single', radius: 0.02, border: 0.005, bertahap: 0.30 },
    logo: { aktif: false, posisi: 'kanan-atas', ukuran: 0.08, opacity: 0.9 },
    audio: { pertahankan: true },
  },

  /* ── F. PHOTO GALLERY (KOLASE) ────────────────────────────────────────── */
  gallery: {
    id: 'gallery',
    nama: '🖼️ Photo Gallery',
    deskripsi: '4 panel sudut membulat, masuk bergantian, tiap panel bergerak pelan.',
    motion: { jenis: 'zoom-in', skala: 1.06 },
    grading: { kontras: 1.05, saturasi: 1.05, kecerahan: -0.02, vignette: true, grain: 8, glow: false, unsharp: false },
    teks: {
      judul: { font: 'judul', ukuran: 0.085, warna: '#ffffff', outline: 0.0025, shadow: 0.004, posisiY: 0.12, spasi: 0.04 },
      subjudul: { font: 'script', ukuran: 0.045, warna: '#f6e7c8', outline: 0.002, shadow: 0.003, posisiY: 0.20 },
      meta: { font: 'meta', ukuran: 0.019, warna: '#dddddd', outline: 0.0012, shadow: 0.0015, posisiY: 0.95 },
    },
    panel: { mode: 'empat', radius: 0.045, border: 0.005, bertahap: 0.30, margin: 0.06, marginAtas: 0.26, marginBawah: 0.08, jarak: 0.028 },
    logo: { aktif: false, posisi: 'kanan-atas', ukuran: 0.065, opacity: 0.8 },
    audio: { pertahankan: true },
  },
}

/** Nama template yang boleh dipakai (whitelist). */
export const DAFTAR_TEMPLATE = Object.keys(TEMPLATE)

export const TEKS_TIMING = TEKS_DASAR

/** Ambil template dari whitelist; null kalau tidak ada. */
export function ambilTemplate(nama) {
  const id = String(nama || '').trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(TEMPLATE, id) ? TEMPLATE[id] : null
}

/** Daftar ringkas untuk menu WhatsApp. */
export function menuTemplate() {
  return DAFTAR_TEMPLATE.map((id) => ({ id, nama: TEMPLATE[id].nama, deskripsi: TEMPLATE[id].deskripsi }))
}

export default { TEMPLATE, DAFTAR_TEMPLATE, TEKS_TIMING, ambilTemplate, menuTemplate }
