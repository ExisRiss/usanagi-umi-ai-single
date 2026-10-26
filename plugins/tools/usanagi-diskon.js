/* By AlzRiss - Usanagi Umi AI
 *
 * .diskon <harga> <diskon%> [diskon2% ...]
 * Hitung harga setelah diskon, bisa bertingkat.
 * Diadaptasi dari plugin "diskon" bot VanXone Multi Device.
 */
function angkaRp(nilai) {
  return `Rp${Math.round(nilai).toLocaleString('id-ID')}`
}
function parseAmount(raw) {
  const bersih = String(raw || '').toLowerCase().replace(/[.,_\s]/g, '')
  const cocok = bersih.match(/^(\d+)(k|rb|jt)?$/)
  if (!cocok) return null
  const nilai = Number(cocok[1]) * ({ k: 1e3, rb: 1e3, jt: 1e6 }[cocok[2]] || 1)
  return Number.isSafeInteger(nilai) ? nilai : null
}

const handler = async (m, { text, usedPrefix, command, args }) => {
  const bagian = Array.isArray(args) && args.length ? args : String(text || '').trim().split(/\s+/).filter(Boolean)
  const harga = parseAmount(bagian[0])
  const persen = bagian.slice(1).map(nilai => Number(String(nilai).replace('%', '').replace(',', '.')))
  if (!harga || !persen.length || persen.some(nilai => !(nilai >= 0 && nilai <= 100))) {
    return m.reply(
      `Format: ${usedPrefix}${command} <harga> <diskon%> [diskon2%]\n` +
      `Contoh: ${usedPrefix}${command} 250000 30\n` +
      `Bertingkat: ${usedPrefix}${command} 1jt 20 10`
    )
  }

  let akhir = harga
  const langkah = persen.map(nilai => {
    const potong = akhir * (nilai / 100)
    akhir -= potong
    return `• Diskon ${nilai}% : −${angkaRp(potong)} → ${angkaRp(akhir)}`
  })
  const hemat = harga - akhir

  return m.reply(
    ['*KALKULATOR DISKON*', '', `▬ Harga awal : ${angkaRp(harga)}`, ...langkah, '',
      `▬ Harga akhir : ${angkaRp(akhir)}`,
      `▬ Hemat : ${angkaRp(hemat)} (${((hemat / harga) * 100).toFixed(1)}%)`].join('\n')
  )
}

handler.help = ['diskon <harga> <diskon%> [diskon2%]']
handler.tags = ['tools']
handler.command = ['diskon', 'discount', 'potongan']
handler.description = 'Hitung harga setelah diskon, termasuk diskon bertingkat'

export default handler
