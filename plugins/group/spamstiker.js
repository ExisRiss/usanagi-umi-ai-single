/* By AlzRiss - Usanagi Umi AI
 *
 * Task192 — /spamstiker <jumlah> (balas pesan stiker yang mau di-spam).
 *   • Jumlah wajib, batas atas 50× (MAKS).
 *   • Stiker diunduh dari pesan yang dibalas lalu dikirim ulang N kali.
 *   • Aksi memakai emoji loading 1️⃣→🔟 (mulaiReactLoading) seperti spamtag.
 */

import { downloadContentFromMessage } from '@sairidev/baileys-new'
import { mulaiReactLoading } from '../../lib/loading-react.js'

const MAKS = 50
const JEDA = 250

const handler = async (m, { conn, args, usedPrefix, command }) => {
  const jumlah = parseInt(args[0], 10)
  if (!Number.isFinite(jumlah) || jumlah < 1) {
    return m.reply(`Pemakaian: ${usedPrefix}spamstiker <jumlah>\nContoh: ${usedPrefix}spamstiker 30\nBalas pesan stiker yang mau di-spam. Jumlah 1–${MAKS}.`)
  }
  const n = Math.min(jumlah, MAKS)

  const quoted = m.quoted
  if (!quoted) return m.reply('Reply (balas) pesan stiker yang mau di-spam.')
  const mime = String(quoted.mimetype || '')
  if (!/webp|sticker/.test(mime) && quoted.type !== 'sticker') {
    return m.reply('Pesannya bukan stiker. Reply stiker yang mau di-spam ya.')
  }

  const anim = mulaiReactLoading(conn, m)
  try {
    const imageMsg = quoted.msg || quoted
    const stream = await downloadContentFromMessage(imageMsg, 'image')
    const potongan = []
    for await (const chunk of stream) potongan.push(chunk)
    const buffer = Buffer.concat(potongan)
    if (!buffer.length) throw new Error('stiker kosong')

    await conn.sendMessage(m.chat, { text: `ⓘ Memulai spam stiker ${n}×…` })
    for (let i = 0; i < n; i++) {
      await conn.sendMessage(m.chat, { sticker: buffer })
      if (JEDA) await new Promise(r => setTimeout(r, JEDA))
    }
    await conn.sendMessage(m.chat, { text: `✅ Spam stiker selesai — ${n} pesan terkirim.` })
    await anim.stop('✅')
  } catch (error) {
    console.warn('[spamstiker]', error?.message || error)
    await anim.stop('⚠️')
    try { await m.reply(`ⓘ Gagal spam stiker: ${error?.message || error}`) } catch { /* abaikan */ }
  } finally {
    await anim.stop('✅')
  }
}

handler.command = /^spamstiker$/i
handler.help = ['spamstiker <jumlah>  (reply stiker)']
handler.tags = ['user']
handler.limit = true
handler.group = false
handler.description = `Spam stiker hasil reply — batas ${MAKS}×`

export default handler
