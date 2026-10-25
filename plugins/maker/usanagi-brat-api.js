/* By AlzRiss - Usanagi Umi AI
 *
 * Brat via Rin API (https://apiii-xrina.my.id)
 *
 * Semua varian brat diarahkan ke satu modul supaya tidak ada lagi plugin yang
 * memakai API lain/ mati. Endpoint di bawah sudah diuji langsung (25-10-2026):
 *
 *   /maker/brat            → image/png   (stiker teks klasik)
 *   /maker/brathd          → image/png   (versi HD)
 *   /maker/bratvid         → image/gif   (animasi)
 *   /maker/bratvid2        → video/mp4   (kata muncul satu per satu, 60 FPS)
 *   /maker/bratgojo        → image/png   (template Gojo)
 *   /maker/bratspongebob   → image/png   (papan SpongeBob)
 *   /maker/brat-vermeil    → image/png   (template Vermeil)
 *
 * Catatan: endpoint ini TANPA apikey dan hasilnya langsung berkas gambar/video
 * (bukan JSON berisi URL), jadi plugin cukup mengambil buffer lalu mengirim
 * sebagai stiker (gambar), stiker animasi (gif), atau video.
 */

import { fetchRinMedia, describe, sniffMedia } from '../../lib/rin-api.js'

const TIMEOUT_MS = Number(global.rinAPI?.bratTimeoutMs) || 120000

/** Peta perintah → endpoint + jenis keluaran. */
const VARIANTS = {
  // brat, bratvid, bratvid2 sudah punya plugin sendiri (maker/brat.js,
  // bratvid.js, brat2.js) yang juga memakai Rin API — tidak diduplikasi di sini
  // supaya satu perintah hanya punya satu handler.
  brathd: { path: '/maker/brathd', kind: 'image' },
  bratgojo: { path: '/maker/bratgojo', kind: 'image' },
  bratspongebob: { path: '/maker/bratspongebob', kind: 'image' },
  bratspongebob2: { path: '/maker/bratspongebob', kind: 'image' },
  bratvermeil: { path: '/maker/brat-vermeil', kind: 'image' },
  'brat-vermeil': { path: '/maker/brat-vermeil', kind: 'image' },

}

const HELP = prefix => [
  '🎨 *BRAT varian* (Rin API)',
  '',
  `${prefix}brat <teks>            stiker biasa (plugin maker/brat.js)`,
  `${prefix}brathd <teks>          versi HD`,
  `${prefix}bratvid <teks>         animasi (gif)`,
  `${prefix}bratvid2 <teks>        video kata per kata`,
  `${prefix}bratgojo <teks>        template Gojo`,
  `${prefix}bratspongebob <teks>   papan SpongeBob`,
  `${prefix}bratvermeil <teks>     template Vermeil`,
].join('\n')

function pickText(m, extra) {
  const quoted = m?.quoted?.text || m?.quoted?.message?.conversation
    || m?.quoted?.message?.extendedTextMessage?.text || ''
  const fromArgs = Array.isArray(extra?.args) ? extra.args.join(' ').trim() : ''
  return String(quoted || fromArgs || m?.text || '').trim()
}

/**
 * API Rin menolak permintaan dengan parameter yang persis sama dalam waktu
 * berdekatan ("isi parameter masih sama persis"). Itu bukan kesalahan pengguna,
 * jadi permintaan diulang sekali dengan spasi tak terlihat (zero-width space)
 * yang tidak mengubah tampilan teks pada gambar.
 */
const SAME_PARAM_HINT = /masih sama persis|parameter masih sama/i

async function sendMedia(conn, m, variant, buffer, mime) {
  const stickerName = { packname: global.stickpack || global.namebot || 'Usanagi Umi AI', packpublish: global.stickauth || global.author || 'By AlzRiss' }
  if (variant.kind === 'image') {
    if (typeof conn.sendSticker === 'function') return conn.sendSticker(m.chat, buffer, m, stickerName)
    return conn.sendMessage(m.chat, { sticker: buffer }, { quoted: m })
  }
  if (variant.kind === 'gif') {
    // GIF diperlakukan sebagai stiker animasi.
    if (typeof conn.sendSticker === 'function') return conn.sendSticker(m.chat, buffer, m, stickerName)
    return conn.sendMessage(m.chat, { video: buffer, mimetype: mime || 'image/gif', gifPlayback: true }, { quoted: m })
  }
  // video
  return conn.sendMessage(m.chat, {
    video: buffer,
    mimetype: mime || 'video/mp4',
    caption: '🎬 Brat video',
    gifPlayback: true,
  }, { quoted: m })
}

let handler = async function (m, extra = {}) {
  const conn = extra.conn || this
  const command = String(extra.command || '').toLowerCase()
  const prefix = extra.usedPrefix || '.'
  const variant = VARIANTS[command]
  if (!variant) return null

  const text = pickText(m, extra)
  if (!text) return m.reply(`Masukkan teksnya.\nContoh: ${prefix}${command} halo dunia`)

  try { if (typeof m.react === 'function') await m.react('🕒') } catch {}

  try {
    const { buffer, type } = await fetchRinMedia(variant.path, text, { timeoutMs: TIMEOUT_MS })
    // Jenis media ditentukan dari isi berkas, bukan dari nama endpoint.
    const media = sniffMedia(buffer, type)
    await sendMedia(conn, m, { kind: media.kind === 'unknown' ? variant.kind : media.kind }, buffer, media.mime || type)
    try { if (typeof m.react === 'function') await m.react('✅') } catch {}
    return null
  } catch (error) {
    const reason = describe(error)
    console.error('[BRAT]', command, '→', reason)
    try { if (typeof m.react === 'function') await m.react('❌') } catch {}
    return m.reply(`Gagal membuat *${command}*: ${String(reason).slice(0, 160)}\nCoba lagi sebentar, atau pakai ${prefix}brat biasa.`)
  }
}

handler.command = /^(brathd|bratgojo|bratspongebob|bratspongebob2|bratvermeil|brat-vermeil)$/i
handler.help = ['brathd <teks>', 'bratgojo <teks>', 'bratspongebob <teks>', 'bratvermeil <teks>']
handler.tags = ['maker', 'sticker']
handler.description = 'Brat varian HD/Gojo/SpongeBob/Vermeil lewat Rin API'
handler.limit = 1

export default handler
export { VARIANTS }
