/* By AlzRiss - Usanagi Umi AI
 *
 * .chinfo <link/ID saluran> — metadata saluran WhatsApp langsung dari server
 * WhatsApp (bukan scraping halaman). Nama perintah `infoch` sudah dipakai
 * plugin lama, jadi di sini dipakai `chinfo`.
 * Diadaptasi dari plugin "chinfo" bot VanXone Multi Device.
 */
import { parseRef, channelMetadata, channelLink, formatAngka, isAdminRole, explainChannelError, getTargetChannel } from '../../lib/channel-tools.js'

const handler = async (m, { conn, text, usedPrefix, command }) => {
  const arg = String(text || '').trim().split(/\s+/)[0]
  let ref = parseRef(arg)
  if (!ref && !arg) {
    const tersimpan = getTargetChannel()
    if (tersimpan) ref = { type: 'jid', jid: tersimpan.id }
  }
  if (!ref) {
    return m.reply(
      `Format: ${usedPrefix}${command} <link saluran>\n` +
      `Contoh: ${usedPrefix}${command} https://whatsapp.com/channel/0029VaXXXXXXXXXX\n\n` +
      `Kalau sudah mengatur saluran dengan ${usedPrefix}setch, ketik ${usedPrefix}${command} tanpa argumen.`
    )
  }

  let md
  try {
    md = await channelMetadata(conn, ref)
  } catch (error) {
    return m.reply(`❌ ${explainChannelError(error)}`)
  }

  const dibuat = md.created
    ? new Date(md.created * 1000).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' })
    : '-'
  const tautan = channelLink(md.invite)

  return m.reply(
    `📢 *INFO SALURAN*\n\n` +
    `▬ Nama : ${md.name}${md.verified ? ' ✅' : ''}\n` +
    `▬ Pengikut : ${formatAngka(md.subs)}\n` +
    `▬ Dibuat : ${dibuat}\n` +
    (md.role ? `▬ Peran bot : ${md.role.toLowerCase()}${isAdminRole(md.role) ? '' : ' (bot belum admin)'}\n` : '') +
    (tautan ? `▬ Link : ${tautan}\n` : '') +
    `▬ ID : ${md.id}` +
    (md.desc ? `\n\n📝 *Deskripsi*\n${md.desc.length > 400 ? md.desc.slice(0, 399) + '…' : md.desc}` : '')
  )
}

handler.help = ['chinfo <link saluran>']
handler.tags = ['tools']
handler.command = ['chinfo']
handler.description = 'Info saluran WhatsApp (nama, pengikut, peran bot, ID) dari link atau ID'

export default handler
