/* By AlzRiss - Usanagi Umi AI
 *
 * `.ocr` — baca tulisan di gambar.
 *
 * Diambil dari OURIN (plugins/tools/ocr.js) yang memakai layanan OCR publik.
 * Versi ini memakai endpoint yang sama (api.ocr.space) tetapi:
 *  - gambarnya diunggah langsung sebagai berkas, bukan lewat URL publik,
 *    jadi gambar pribadi tidak perlu di-host dulu,
 *  - batas ukuran 2 MB (batas gratis layanan ini 1 MB untuk unggahan,
 *    kita pakai 1 MB agar hasilnya tidak ditolak),
 *  - hasil kosong dilaporkan jujur, bukan dikarang.
 *
 * Sudah diuji langsung: gambar 420x140 bertuliskan "USANAGI UMI 12345"
 * terbaca persis sama.
 */

const BATAS_BYTE = 1024 * 1024

async function handler(m, { conn, text }) {
  const sumber = m.quoted ? m.quoted : m
  const jenis = String(sumber.mtype || '').toLowerCase()
  if (!/image/.test(jenis)) {
    return m.reply('〄 Balas sebuah *gambar* dengan perintah .ocr, atau kirim gambar dengan caption .ocr')
  }

  const bahasa = String(text || '').trim().toLowerCase()
  const pilihan = /^(eng|id|jpn|kor|chi|ara|rus)$/.test(bahasa) ? bahasa : 'eng'

  await m.react('🕐')
  let buffer
  try {
    buffer = await sumber.download()
  } catch (e) {
    await m.react('❌')
    return m.reply(`〄 Gagal mengunduh gambar: ${String(e?.message || e).slice(0, 140)}`)
  }

  if (!buffer || !buffer.length) {
    await m.react('❌')
    return m.reply('〄 Gambarnya kosong, coba kirim ulang.')
  }
  if (buffer.length > BATAS_BYTE) {
    await m.react('❌')
    return m.reply(`〄 Gambar terlalu besar (${(buffer.length / 1048576).toFixed(2)} MB). Maksimal 1 MB.`)
  }

  const form = new FormData()
  form.append('language', pilihan)
  form.append('isOverlayRequired', 'false')
  form.append('OCREngine', '2')
  form.append('scale', 'true')
  form.append('apikey', 'helloworld')
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }), 'gambar.jpg')

  let data
  try {
    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60000),
    })
    data = await res.json()
  } catch (e) {
    await m.react('❌')
    return m.reply(`〄 Layanan OCR tidak bisa dihubungi: ${String(e?.message || e).slice(0, 120)}`)
  }

  const teks = (data?.ParsedResults || []).map(x => String(x?.ParsedText || '')).join('\n').trim()
  if (!teks) {
    await m.react('❌')
    const alasan = (data?.ErrorMessage || []).join('; ') || 'tidak ada tulisan yang terbaca'
    return m.reply(`〄 Tidak ada teks yang bisa dibaca.\n〄 Alasan: ${String(alasan).slice(0, 200)}`)
  }

  await m.react('✅')
  return m.reply(`〄 *HASIL OCR*\n\n${teks.slice(0, 3500)}\n\n〄 Bahasa: ${pilihan}`)
}

handler.help = ['ocr']
handler.tags = ['tools']
handler.command = /^(ocr|bacagambar)$/i
handler.limit = false

export default handler
