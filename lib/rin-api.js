/* By AlzRiss - Usanagi Umi AI
 *
 * Satu pintu untuk API Rin (https://apiii-xrina.my.id).
 *
 * Kenapa dipusatkan:
 *  - semua plugin maker/brat* memakai perilaku yang sama (UA, timeout, batas
 *    ukuran, penanganan error JSON, deteksi tipe berkas);
 *  - API menolak permintaan yang teksnya SAMA PERSIS dengan contoh di
 *    dokumentasi ("halo dunia"), dengan HTTP 400. Itu bukan kesalahan
 *    pengguna, jadi permintaan diulang sekali dengan zero-width space yang
 *    tidak terlihat pada hasil gambar.
 *
 * Yang TIDAK dilakukan modul ini: tidak menyimpan kredensial, tidak mencatat
 * parameter teks ke log (bisa berisi hal pribadi), tidak mematikan TLS.
 */

const DEFAULT_BASE = 'https://apiii-xrina.my.id'
const DEFAULT_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36'
const PLACEHOLDER_HINT = /masih sama persis|parameter masih sama|sama dengan CONTOH/i
const MAX_BYTES = 24 * 1024 * 1024

function baseUrl() {
  return String(global.rinAPI?.baseUrl || DEFAULT_BASE).replace(/\/+$/, '')
}

function describe(error) {
  if (!error) return 'kesalahan tidak diketahui'
  if (error.name === 'AbortError') return 'server tidak merespons (waktu habis)'
  return String(error.message || error).slice(0, 180)
}

/** Buang isi JSON error menjadi pesan satu baris yang aman ditampilkan. */
function errorFromBody(text, status) {
  let message = String(text || '').trim()
  try {
    const parsed = JSON.parse(message)
    message = parsed.message || parsed.error || message
  } catch { /* bukan JSON, pakai apa adanya */ }
  message = message.replace(/\s+/g, ' ').trim()
  return `API ${status}${message ? ': ' + message.slice(0, 160) : ''}`
}

async function requestOnce(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': DEFAULT_UA, Accept: 'image/*,video/*,*/*' },
      redirect: 'follow',
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return { ok: false, status: response.status, error: errorFromBody(body, response.status) }
    }
    const type = String(response.headers.get('content-type') || '').toLowerCase()
    const buffer = Buffer.from(await response.arrayBuffer())
    if (!buffer.length) return { ok: false, status: response.status, error: 'API mengembalikan berkas kosong.' }
    if (buffer.length > MAX_BYTES) {
      return { ok: false, status: response.status, error: `Hasil terlalu besar (${(buffer.length / 1048576).toFixed(1)} MB).` }
    }
    if (type.includes('application/json') || buffer[0] === 0x7b) {
      const body = buffer.toString('utf8')
      if (PLACEHOLDER_HINT.test(body)) {
        return { ok: false, status: response.status, error: errorFromBody(body, response.status), placeholder: true }
      }
      return { ok: false, status: response.status, error: errorFromBody(body, response.status) }
    }
    return { ok: true, buffer, type, status: response.status }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Ambil media dari endpoint Rin.
 * @param {string} path  contoh: '/maker/brat'
 * @param {string} text  teks pengguna (wajib, tidak boleh kosong)
 * @param {object} options  { timeoutMs, paramName }
 * @returns {Promise<{buffer: Buffer, type: string}>}
 */
export async function fetchRinMedia(path, text, options = {}) {
  const value = String(text || '').trim()
  if (!value) throw new Error('Teks kosong.')
  const timeoutMs = Number(options.timeoutMs) || Number(global.rinAPI?.timeoutMs) || 120000
  const param = options.paramName || 'text'
  const build = teks => `${baseUrl()}${path}?${param}=${encodeURIComponent(teks)}`

  const first = await requestOnce(build(value), timeoutMs)
  if (first.ok) return { buffer: first.buffer, type: first.type }

  if (first.placeholder || PLACEHOLDER_HINT.test(first.error || '')) {
    // Ulangi dengan penanda tak terlihat: tampilan gambar tidak berubah.
    const second = await requestOnce(build(value + '\u200B'), timeoutMs)
    if (second.ok) return { buffer: second.buffer, type: second.type }
    throw new Error(second.error || first.error)
  }
  throw new Error(first.error)
}

/** Tebak jenis media dari header magic bytes (tanpa paket tambahan). */
export function sniffMedia(buffer, fallbackType = '') {
  const b = buffer || Buffer.alloc(0)
  const hex = b.subarray(0, 12).toString('hex')
  if (hex.startsWith('89504e47')) return { mime: 'image/png', kind: 'image', ext: 'png' }
  if (hex.startsWith('ffd8ff')) return { mime: 'image/jpeg', kind: 'image', ext: 'jpg' }
  if (hex.startsWith('47494638')) return { mime: 'image/gif', kind: 'gif', ext: 'gif' }
  if (b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', kind: 'image', ext: 'webp' }
  }
  if (hex.startsWith('00000018') || hex.startsWith('00000020') || b.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { mime: 'video/mp4', kind: 'video', ext: 'mp4' }
  }
  if (/video\//.test(fallbackType)) return { mime: fallbackType, kind: 'video', ext: 'mp4' }
  if (/gif/.test(fallbackType)) return { mime: 'image/gif', kind: 'gif', ext: 'gif' }
  return { mime: fallbackType || 'application/octet-stream', kind: 'unknown', ext: 'bin' }
}

export { describe, baseUrl, PLACEHOLDER_HINT, DEFAULT_BASE }
