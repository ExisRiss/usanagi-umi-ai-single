/* By AlzRiss - Usanagi Umi AI
 *
 * .epoch [timestamp | yyyy-mm-dd [hh:mm]] — konversi waktu.
 * Diadaptasi dari plugin "epoch" bot VanXone Multi Device (zona WIB).
 */
const ZONA = 'Asia/Jakarta'
const format = tanggal => tanggal.toLocaleString('id-ID', { timeZone: ZONA, dateStyle: 'full', timeStyle: 'medium' })

const handler = async (m, { text, usedPrefix, command }) => {
  const isi = String(text || '').trim()
  if (!isi) {
    const sekarang = new Date()
    return m.reply(
      `🕰️ *EPOCH*\n\n` +
      `▬ Sekarang : ${format(sekarang)}\n` +
      `▬ Detik : ${Math.floor(sekarang.getTime() / 1000)}\n` +
      `▬ Milidetik : ${sekarang.getTime()}\n` +
      `▬ ISO (UTC) : ${sekarang.toISOString()}\n\n` +
      `Contoh: ${usedPrefix}${command} 1700000000\nContoh: ${usedPrefix}${command} 2025-12-31 23:59`
    )
  }

  let tanggal = null
  if (/^\d{9,13}$/.test(isi)) {
    tanggal = new Date(isi.length <= 10 ? Number(isi) * 1000 : Number(isi))
  } else {
    const cocok = isi.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/)
    if (cocok) {
      const jam = String(cocok[4] || '0').padStart(2, '0')
      tanggal = new Date(`${cocok[1]}-${cocok[2]}-${cocok[3]}T${jam}:${cocok[5] || '00'}:00+07:00`)
    }
  }
  if (!tanggal || Number.isNaN(tanggal.getTime())) {
    return m.reply(`Format salah.\nContoh: ${usedPrefix}${command} 1700000000\nContoh: ${usedPrefix}${command} 2025-12-31 23:59`)
  }

  return m.reply(
    `🕰️ *EPOCH*\n\n` +
    `▬ WIB : ${format(tanggal)}\n` +
    `▬ Detik : ${Math.floor(tanggal.getTime() / 1000)}\n` +
    `▬ Milidetik : ${tanggal.getTime()}\n` +
    `▬ ISO (UTC) : ${tanggal.toISOString()}`
  )
}

handler.help = ['epoch [timestamp|yyyy-mm-dd hh:mm]']
handler.tags = ['tools']
handler.command = ['epoch', 'timestamp', 'unixtime']
handler.description = 'Konversi Unix timestamp ke tanggal (WIB) dan sebaliknya'

export default handler
