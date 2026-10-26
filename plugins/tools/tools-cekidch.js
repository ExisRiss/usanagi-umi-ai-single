/* By AlzRiss - Usanagi Umi AI
 *
 * .cekidch <link saluran> — ambil ID saluran dari link.
 *
 * Perbaikan Task116: versi sebelumnya memakai `conn.newsletterMetadata(...)`
 * padahal `conn` tidak pernah diambil dari parameter handler, sehingga perintah
 * ini selalu gagal dengan ReferenceError. Sekarang memakai helper bersama
 * lib/channel-tools.js (validasi link, penanganan galat, dan ID yang rapi).
 */
import { parseRef, channelMetadata, explainChannelError } from '../../lib/channel-tools.js'

const handler = async (m, { conn, text, usedPrefix, command }) => {
  const arg = String(text || '').trim()
  if (!arg) return m.reply(`Format: ${usedPrefix}${command} <link saluran>\nContoh: ${usedPrefix}${command} https://whatsapp.com/channel/0029VaXXXXXXXXXX`)

  const ref = parseRef(arg)
  if (!ref) return m.reply('❌ Itu bukan link/ID saluran WhatsApp yang valid.')

  try {
    const md = await channelMetadata(conn, ref)
    return m.reply(`✨ *ID saluran:*\n${md.id}\n\n▬ Nama : ${md.name}\n▬ Link : https://whatsapp.com/channel/${md.invite || ref.code}`)
  } catch (error) {
    return m.reply(`❌ ${explainChannelError(error)}`)
  }
}

handler.help = ['cekidch <link saluran>']
handler.tags = ['tools']
// 'idch' sudah dipakai plugins/pelengkap/umi/tools/umi-cekidch.js — jangan direbut.
handler.command = ['cekidch']
handler.description = 'Ambil ID saluran WhatsApp dari link-nya'

export default handler
