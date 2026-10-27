/* By AlzRiss - Usanagi Umi AI
 *
 * PIXELDRAIN DOWNLOADER (Task127 — diadaptasi dari OURIN V3.4 by AJI)
 *
 * Versi OURIN memakai API pihak ketiga (neoxr) yang butuh API key. Di sini
 * memakai API RESMI pixeldrain — tanpa key, tanpa perantara:
 *
 *   info     : GET https://pixeldrain.com/api/file/<id>/info
 *   unduh    : GET https://pixeldrain.com/api/file/<id>?download
 *
 * Batas kirim WhatsApp ±100 MB, jadi berkas di atas 64 MB hanya ditampilkan
 * informasinya + tautan (bukan dipaksa diunduh lalu gagal).
 */

const API = 'https://pixeldrain.com/api/file'
const BATAS_KIRIM = 64 * 1024 * 1024
const TIMEOUT_INFO = 15000
const TIMEOUT_UNDUH = 120000

/** Ambil ID dari URL pixeldrain apa pun bentuknya. */
export function ambilIdPixeldrain(teks) {
  const nilai = String(teks == null ? '' : teks).trim()
  if (!nilai) return ''
  // https://pixeldrain.com/u/<id>, /api/file/<id>, /d/<id>, /l/<list>
  const cocok = nilai.match(/pixeldrain\.com\/(?:u|api\/file|d)\/([A-Za-z0-9_-]{4,})/)
  if (cocok) return cocok[1]
  if (/^[A-Za-z0-9_-]{4,}$/.test(nilai)) return nilai
  return ''
}

export function ukuranManusia(byte) {
  const n = Number(byte) || 0
  if (n < 1024) return `${n} B`
  const kb = n / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

async function infoBerkas(id) {
  const res = await fetch(`${API}/${encodeURIComponent(id)}/info`, {
    headers: { 'User-Agent': 'Usanagi-Umi-AI/7.1' },
    signal: AbortSignal.timeout(TIMEOUT_INFO),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.success === false) {
    throw new Error(data?.message || `HTTP ${res.status}`)
  }
  return data
}

let handler = async (m, { conn, args, usedPrefix }) => {
  const masukan = String((args || []).join(' ') || '').trim()
  const id = ambilIdPixeldrain(masukan)
  if (!id) {
    return m.reply(
      [
        '📥 *PIXELDRAIN DOWNLOADER*',
        '',
        `Cara pakai: ${usedPrefix}pixeldrain <tautan pixeldrain>`,
        `Contoh: ${usedPrefix}pixeldrain https://pixeldrain.com/u/abcd1234`,
      ].join('\n')
    )
  }

  await m.reply('🔎 Mengambil informasi berkas…')

  let info
  try {
    info = await infoBerkas(id)
  } catch (error) {
    return m.reply(`❌ *Gagal* — berkas tidak ditemukan atau pixeldrain menolak.\n> ${String(error?.message || error).slice(0, 120)}`)
  }

  const nama = String(info.name || id)
  const ukuran = Number(info.size) || 0
  const mime = String(info.mime_type || 'application/octet-stream')

  if (ukuran > BATAS_KIRIM) {
    return m.reply(
      [
        '📦 *BERKAS TERLALU BESAR*',
        '',
        `Nama   : ${nama}`,
        `Ukuran : ${ukuranManusia(ukuran)}`,
        'WhatsApp hanya bisa menerima berkas ±64 MB dari bot.',
        '',
        `Unduh manual: https://pixeldrain.com/u/${id}`,
      ].join('\n')
    )
  }

  await m.reply(`⬇️ Mengunduh *${nama}* (${ukuranManusia(ukuran)})…`)

  try {
    const res = await fetch(`${API}/${encodeURIComponent(id)}?download`, {
      headers: { 'User-Agent': 'Usanagi-Umi-AI/7.1' },
      signal: AbortSignal.timeout(TIMEOUT_UNDUH),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())

    const gambar = /^image\//.test(mime)
    const video = /^video\//.test(mime)
    const audio = /^audio\//.test(mime)

    /* Kirim lewat conn.sendMessage: m.reply pada sebagian pembungkus hanya
     * menerima teks, jadi media harus lewat jalur ini. */
    const kirim = isi => conn.sendMessage(m.chat, isi, m?.raw ? { quoted: m.raw } : undefined)
    const keterangan = `📥 ${nama}\n${ukuranManusia(buffer.length)}`
    if (gambar) {
      await kirim({ image: buffer, caption: keterangan })
    } else if (video) {
      await kirim({ video: buffer, caption: keterangan })
    } else if (audio) {
      await kirim({ audio: buffer, mimetype: mime, ptt: false })
    } else {
      await kirim({ document: buffer, mimetype: mime, fileName: nama, caption: keterangan })
    }
  } catch (error) {
    console.error('[PIXELDRAIN]', error?.message || error)
    await m.reply(
      [
        '❌ *Gagal mengunduh*',
        `> ${String(error?.message || error).slice(0, 120)}`,
        '',
        `Coba manual: https://pixeldrain.com/u/${id}`,
      ].join('\n')
    )
  }
}

handler.command = /^(pixeldrain|pixeldraindl|pd)$/i
handler.help = ['pixeldrain <url>']
handler.tags = ['downloader', 'tools']
handler.description = 'Mengunduh berkas dari Pixeldrain lewat API resmi (tanpa API key)'
handler.limit = true

export default handler
