/* By AlzRiss - Usanagi Umi AI
 *
 * .base64 enc|dec <teks> — encode/decode Base64.
 * Diadaptasi dari plugin "base64" bot VanXone Multi Device.
 */
const handler = async (m, { text, usedPrefix, command, args }) => {
  const bagian = String(text || '').trim().split(/\s+/)
  const mode = String((Array.isArray(args) && args[0]) || bagian[0] || '').toLowerCase()
  const isi = (Array.isArray(args) && args.length > 1 ? args.slice(1).join(' ') : bagian.slice(1).join(' ')).trim()

  if (!['enc', 'dec'].includes(mode) || !isi) {
    return m.reply(`Contoh:\n${usedPrefix}${command} enc halo dunia\n${usedPrefix}${command} dec aGFsbyBkdW5pYQ==`)
  }
  if (mode === 'enc') {
    const hasil = Buffer.from(isi, 'utf8').toString('base64')
    return m.reply(`${hasil}`)
  }
  if (!/^[A-Za-z0-9+/=_-]+$/.test(isi)) return m.reply('Teks itu bukan Base64 yang valid.')
  const hasil = Buffer.from(isi, 'base64').toString('utf8')
  if (!hasil) return m.reply('Gagal membaca Base64 tersebut.')
  return m.reply(hasil)
}

handler.help = ['base64 enc|dec <teks>']
handler.tags = ['tools']
handler.command = ['base64', 'b64']
handler.description = 'Encode atau decode teks Base64'

export default handler
