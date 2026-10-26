/* By AlzRiss - Usanagi Umi AI
 *
 * .cicilan <pokok> <bunga%/tahun> <tenor bulan>
 * Simulasi cicilan bunga flat vs anuitas (efektif).
 * Diadaptasi dari plugin "cicilan" bot VanXone Multi Device.
 */
function angkaRp(nilai) {
  return `Rp${Math.round(nilai).toLocaleString('id-ID')}`
}

/** "5000", "50.000", "5k", "2jt" → angka (null kalau tidak valid). */
function parseAmount(raw) {
  const bersih = String(raw || '').toLowerCase().replace(/[.,_\s]/g, '')
  const cocok = bersih.match(/^(\d+)(k|rb|jt)?$/)
  if (!cocok) return null
  const nilai = Number(cocok[1]) * ({ k: 1e3, rb: 1e3, jt: 1e6 }[cocok[2]] || 1)
  return Number.isSafeInteger(nilai) ? nilai : null
}

const handler = async (m, { text, usedPrefix, command, args }) => {
  const bagian = Array.isArray(args) && args.length ? args : String(text || '').trim().split(/\s+/).filter(Boolean)
  const pokok = parseAmount(bagian[0])
  const bunga = Number(String(bagian[1] || '').replace('%', '').replace(',', '.'))
  const bulan = Number.parseInt(bagian[2], 10)

  if (!pokok || !(bunga >= 0 && bunga <= 100) || !(bulan >= 1 && bulan <= 360)) {
    return m.reply(
      `Format: ${usedPrefix}${command} <pokok> <bunga%/tahun> <bulan>\n` +
      `Contoh: ${usedPrefix}${command} 10jt 12 12\n` +
      `Artinya: pinjaman Rp10.000.000, bunga 12%/tahun, tenor 12 bulan.`
    )
  }

  const flat = (pokok + pokok * (bunga / 100) * (bulan / 12)) / bulan
  const r = bunga / 100 / 12
  const anuitas = r === 0 ? pokok / bulan : (pokok * r) / (1 - Math.pow(1 + r, -bulan))
  const totalFlat = flat * bulan
  const totalAnuitas = anuitas * bulan

  return m.reply(
    `🏦 *SIMULASI CICILAN*\n\n` +
    `▬ Pokok : ${angkaRp(pokok)}\n` +
    `▬ Bunga : ${bunga}% / tahun\n` +
    `▬ Tenor : ${bulan} bulan\n\n` +
    `*Bunga flat*\n` +
    `▬ Angsuran : ${angkaRp(flat)} / bulan\n` +
    `▬ Total bayar : ${angkaRp(totalFlat)}\n` +
    `▬ Total bunga : ${angkaRp(totalFlat - pokok)}\n\n` +
    `*Anuitas (efektif)*\n` +
    `▬ Angsuran bulan ke-1 : ${angkaRp(anuitas)} (turun tipis tiap bulan)\n` +
    `▬ Total bayar : ${angkaRp(totalAnuitas)}\n` +
    `▬ Total bunga : ${angkaRp(totalAnuitas - pokok)}\n\n` +
    `_Perhitungan matematis, bukan penawaran resmi bank._`
  )
}

handler.help = ['cicilan <pokok> <bunga%> <bulan>']
handler.tags = ['tools']
handler.command = ['cicilan', 'kredit', 'pinjaman']
handler.description = 'Simulasi cicilan bunga flat dan anuitas'

export default handler
