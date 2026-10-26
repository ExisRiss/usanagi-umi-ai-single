/* By AlzRiss - Usanagi Umi AI
 *
 * .setch <link saluran> | off — saluran tujuan bawaan.
 * Diadaptasi dari plugin "setch" bot VanXone Multi Device; simpanannya memakai
 * data/channel-target.json milik bot ini (bukan lib store pihak lain).
 */
import { parseRef, channelMetadata, isAdminRole, formatAngka, explainChannelError, getTargetChannel, setTargetChannel } from '../../lib/channel-tools.js'

const handler = async (m, { conn, text, usedPrefix, command, isOwner, isROwner }) => {
  if (!isOwner && !isROwner) return m.reply('Perintah ini hanya untuk owner bot.')

  const arg = String(text || '').trim()
  const sekarang = getTargetChannel()

  if (!arg) {
    return m.reply(
      `📌 *SALURAN TUJUAN*\n\n` +
      (sekarang
        ? `▬ Nama : ${sekarang.name}\n▬ ID : ${sekarang.id}\n▬ Peran bot : ${sekarang.role ? sekarang.role.toLowerCase() : 'tidak diketahui'}`
        : '▬ Belum diatur.') +
      `\n\n*Cara pakai*\n${usedPrefix}${command} <link saluran>\n${usedPrefix}${command} off  (hapus)`
    )
  }

  if (/^(off|hapus|reset)$/i.test(arg)) {
    setTargetChannel(null)
    return m.reply('Saluran tujuan dihapus.')
  }

  const ref = parseRef(arg)
  if (!ref) return m.reply(`Itu bukan link/ID saluran.\nContoh: ${usedPrefix}${command} https://whatsapp.com/channel/0029VaXXXXXXXXXX`)

  try {
    const md = await channelMetadata(conn, ref)
    setTargetChannel({ id: md.id, name: md.name, role: md.role, invite: md.invite })
    const peringatan = md.role && !isAdminRole(md.role)
      ? `\n⚠️ Akun bot cuma "${md.role.toLowerCase()}" di saluran ini. Jadikan admin dulu supaya bisa memposting.`
      : ''
    return m.reply(
      `✅ Saluran tujuan: *${md.name}*\nPengikut: ${formatAngka(md.subs)}` +
      (md.role ? `\nPeran bot: ${md.role.toLowerCase()}` : '') + peringatan
    )
  } catch (error) {
    return m.reply(`❌ ${explainChannelError(error)}`)
  }
}

handler.help = ['setch <link saluran> | off']
handler.tags = ['owner']
handler.command = ['setch', 'setsaluran']
handler.description = 'Atur saluran WhatsApp tujuan bawaan bot'
handler.owner = true

export default handler
