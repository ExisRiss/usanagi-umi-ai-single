/* By AlzRiss - Usanagi Umi AI
 *
 * Task146 — pencari berkas font (per peran teks).
 *
 * Tidak ada unduhan font otomatis (syarat §7): hanya berkas yang SUDAH ada di
 * server. Urutan pencarian:
 *   1. env VIDEO_EDITOR_FONT_<PERAN>
 *   2. assets/fonts/video-<peran>.(ttf|otf)
 *   3. kandidat bawaan per peran (lihat KANDIDAT)
 *   4. fallback terakhir: DejaVu Sans (selalu ada karena ikut repo)
 * Kalau satu peran gagal, peran lain tetap jalan — rendering tidak pernah
 * dibatalkan hanya karena font opsional hilang.
 */
import fs from 'node:fs'
import path from 'node:path'

const AKAR = process.cwd()

const KANDIDAT = {
  judul: [
    'assets/fonts/video-judul.ttf',
    'assets/fonts/DejaVuSansCondensed-Bold.ttf',
    'assets/fonts/DejaVuSans-Bold.ttf',
    'font/Inter-Bold.otf',
    'assets/fonts/Inter-Bold.otf',
    'assets/fonts/usanagi-nulis.ttf',
  ],
  serif: [
    'assets/fonts/video-serif.ttf',
    'assets/fonts/DejaVuSerif-Bold.ttf',
    'assets/fonts/DejaVuSans-Bold.ttf',
  ],
  serifItalic: [
    'assets/fonts/video-serif-italic.ttf',
    'src/font/Convered-By-Your-Grace.ttf',
    'assets/fonts/DejaVuSerif-Bold.ttf',
    'assets/fonts/DejaVuSans-Bold.ttf',
  ],
  script: [
    'assets/fonts/video-script.ttf',
    'src/font/Convered-By-Your-Grace.ttf',
    'src/font/BrayNotes.ttf',
    'assets/fonts/usanagi-nulis.ttf',
    'assets/fonts/tahu.ttf',
    'assets/fonts/DejaVuSerif-Bold.ttf',
    'assets/fonts/DejaVuSans-Bold.ttf',
  ],
  meta: [
    'assets/fonts/video-meta.ttf',
    'assets/fonts/DejaVuSans.ttf',
    'assets/fonts/DejaVuSans-Bold.ttf',
  ],
}

const ENV = {
  judul: 'VIDEO_EDITOR_FONT_JUDUL',
  serif: 'VIDEO_EDITOR_FONT_SERIF',
  serifItalic: 'VIDEO_EDITOR_FONT_SERIF_ITALIC',
  script: 'VIDEO_EDITOR_FONT_SCRIPT',
  meta: 'VIDEO_EDITOR_FONT_META',
}

const ada = (relatif) => {
  const penuh = path.isAbsolute(relatif) ? relatif : path.join(AKAR, relatif)
  try { return fs.statSync(penuh).isFile() ? penuh : '' } catch (e) { return '' }
}

/** Apakah ffmpeg bisa memakai font ini (ekstensi yang didukung freetype). */
const ekstensiSah = (berkas) => /\.(ttf|otf)$/i.test(berkas)

const _cache = new Map()

/**
 * Path font untuk peran tertentu.
 * @param {'judul'|'serif'|'serifItalic'|'script'|'meta'} peran
 * @returns {{berkas: string, peran: string, bawaan: boolean}}
 */
export function fontUntuk(peran) {
  const kunci = String(peran || 'judul')
  if (_cache.has(kunci)) return _cache.get(kunci)

  let hasil = { berkas: '', peran: kunci, bawaan: false, dicari: [] }

  const env = ENV[kunci] && process.env[ENV[kunci]]
  if (env) {
    const cek = ada(env)
    if (cek && ekstensiSah(cek)) hasil = { berkas: cek, peran: kunci, bawaan: false, dicari: [env] }
  }

  if (!hasil.berkas) {
    for (const relatif of KANDIDAT[kunci] || []) {
      const cek = ada(relatif)
      if (cek && ekstensiSah(cek)) {
        hasil = { berkas: cek, peran: kunci, bawaan: KANDIDAT[kunci].indexOf(relatif) > 0, dicari: [relatif] }
        break
      }
    }
  }

  /* Fallback mutlak: font bawaan repo. Kalau ini pun tidak ada, drawtext
   * memakai fontconfig sistem (tanpa fontfile). */
  if (!hasil.berkas) {
    for (const relatif of ['assets/fonts/DejaVuSans-Bold.ttf', 'assets/fonts/DejaVuSans.ttf']) {
      const cek = ada(relatif)
      if (cek) { hasil = { berkas: cek, peran: kunci, bawaan: true, dicari: [relatif] }; break }
    }
  }

  _cache.set(kunci, hasil)
  return hasil
}

/** Semua peran yang dipakai template, sekaligus info untuk diagnostik. */
export function fontSemua() {
  const keluaran = {}
  for (const peran of Object.keys(KANDIDAT)) keluaran[peran] = fontUntuk(peran)
  return keluaran
}

/** Hapus cache (dipakai uji setelah font baru dipasang). */
export function lupakanCache() {
  _cache.clear()
}

export default { fontUntuk, fontSemua, lupakanCache, KANDIDAT }
