/* By AlzRiss - Usanagi Umi AI
 *
 * .cvidch <120363…@newsletter> — ubah ID saluran jadi nama + link undangan.
 * Nama `cekidch`/`idch` sudah dipakai plugin lama, jadi di sini `cvidch`/`cidch`.
 * Diadaptasi dari plugin "convert_idch" bot VanXone Multi Device.
 */
import { channelMetadata, channelLink, formatAngka, explainChannelError } from '../../lib/channel-tools.js'

const handler = async (m, { conn, text, usedPrefix, command, args }) => {
  // Beberapa runtime memecah teks per spasi; gabung lagi supaya ID tetap utuh.
  const gabung = Array.isArray(args) && args.length ? args.join(' ') : String(text || '')
  const sumber = gabung.trim() || m.quoted?.text || m.quoted?.caption || ''
  const cocok = String(sumber).match(/(\d{8,25})@newsletter/i)
  if (!cocok) {
    return m.reply(
      `Format: ${usedPrefix}${command} <ID saluran>\n` +
      `Contoh: ${usedPrefix}${command} 120363312345678901@newsletter\n\n` +
      `Bisa juga reply pesan yang memuat ID saluran.`
    )
  }
  const jid = `${cocok[1]}@newsletter`

  try {
    const md = await channelMetadata(conn, { type: 'jid', jid })
    const tautan = channelLink(md.invite)
    return m.reply(
      `📢 *INFO SALURAN*\n\n` +
      `▬ Nama : ${md.name}${md.verified ? ' ✅' : ''}\n` +
      `▬ Pengikut : ${formatAngka(md.subs)}\n` +
      `▬ ID : ${md.id}\n` +
      (tautan ? `▬ Link : ${tautan}` : '▬ Link : (tidak tersedia)')
    )
  } catch (error) {
    return m.reply(`❌ ${explainChannelError(error)}`)
  }
}

handler.help = ['cvidch <id@newsletter>']
handler.tags = ['tools']
handler.command = ['cvidch', 'cidch']
handler.description = 'Ubah ID saluran (…@newsletter) menjadi nama dan link undangan'

export default handler
