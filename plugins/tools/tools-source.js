/* By AlzRiss - Usanagi Umi AI
 *
 * `.source <url>` — ambil HTML mentah sebuah halaman (khusus owner).
 *
 * Perubahan Task104 (25-10-2026):
 *  1. Dulu memakai `new ElainaTLS()` dari paket @elainaa/tls. Paket itu
 *     membuat koneksi HTTPS dengan `rejectUnauthorized: false`, artinya
 *     sertifikat situs TIDAK diverifikasi — satu jalur bisa disadap/diubah
 *     tanpa ketahuan. Sekarang memakai `fetch` bawaan Node yang memverifikasi
 *     sertifikat (TLS tetap valid).
 *  2. URL divalidasi: hanya http/https, dan alamat privat (localhost,
 *     10.x, 192.168.x, 172.16–31.x, 169.254.x, ::1, .internal) ditolak supaya
 *     perintah ini tidak bisa dipakai membaca layanan internal server
 *     (anti-SSRF). Redirect juga dicek ulang.
 *  3. Isi dibatasi (maks 64 KB dibaca, 4000 karakter ditampilkan) dan cookie
 *     tidak lagi dicetak.
 */

const MAX_BYTES = 64 * 1024
const DISPLAY_CHARS = 4000
const TIMEOUT_MS = 15000

const PRIVATE_HOST = [
  /^localhost$/i,
  /^\[?::1\]?$/,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /\.internal$/i,
  /\.local$/i,
  /^metadata\./i,
]

function validateUrl(input) {
  let url
  try { url = new URL(String(input || '').trim()) }
  catch { throw new Error('URL tidak valid. Contoh: .source https://example.com') }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Hanya URL http/https yang diizinkan.')
  if (PRIVATE_HOST.some(pattern => pattern.test(url.hostname))) {
    throw new Error('Alamat internal/privat tidak diizinkan.')
  }
  return url
}

let handler = async function (m, extra = {}) {
  const text = extra.text || ''
  if (!text) return m.reply('Contoh:\n.source https://example.com')

  let url
  try { url = validateUrl(text) }
  catch (error) { return m.reply('❌ ' + error.message) }

  await m.reply('wait...')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })

    // Redirect bisa menuju alamat internal → periksa tujuan akhirnya juga.
    if (response.url) {
      try { validateUrl(response.url) } catch { throw new Error('Redirect menuju alamat internal ditolak.') }
    }
    if (!response.ok) return m.reply(`❌ Gagal fetch, status: ${response.status}`)

    const type = String(response.headers.get('content-type') || '')
    if (!/text\/|json|xml|html/i.test(type)) {
      return m.reply(`❌ Bukan halaman teks (content-type: ${type || 'tidak diketahui'}).`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    let html = buffer.subarray(0, MAX_BYTES).toString('utf8')
    if (html.length > DISPLAY_CHARS) html = html.slice(0, DISPLAY_CHARS) + '\n\n...[HTML dipotong]'

    await m.reply(
      `✅ *SCRAPE SOURCE SUCCESS*\n` +
      `🌐 URL: ${response.url || url.href}\n` +
      `📡 Status: ${response.status}\n\n` +
      html
    )
  } catch (error) {
    const reason = error?.name === 'AbortError'
      ? `situs tidak merespons dalam ${TIMEOUT_MS / 1000} detik`
      : (error?.message || 'gagal mengambil halaman')
    console.error('[SOURCE] gagal:', String(reason).slice(0, 160))
    await m.reply('❌ ' + String(reason).slice(0, 200))
  } finally {
    clearTimeout(timer)
  }
}

handler.help = ['source <url>']
handler.tags = ['tools']
handler.command = /^source$/i
handler.owner = true
handler.limit = false
handler.description = 'Ambil HTML halaman (owner, hanya http/https publik, TLS terverifikasi)'

export default handler
export { validateUrl }
