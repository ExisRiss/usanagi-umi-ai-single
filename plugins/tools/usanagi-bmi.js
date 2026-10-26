/* By AlzRiss - Usanagi Umi AI
 *
 * .bmi <berat kg> <tinggi cm> — indeks massa tubuh + kategori.
 * Diadaptasi dari plugin "bmi" bot VanXone Multi Device.
 */
function kategoriBmi(bmi) {
  if (bmi < 18.5) return 'Berat badan kurang'
  if (bmi < 25) return 'Normal'
  if (bmi < 30) return 'Berat badan berlebih'
  if (bmi < 35) return 'Obesitas tingkat 1'
  if (bmi < 40) return 'Obesitas tingkat 2'
  return 'Obesitas tingkat 3'
}

const handler = async (m, { text, usedPrefix, command, args }) => {
  const bagian = Array.isArray(args) && args.length ? args : String(text || '').trim().split(/\s+/).filter(Boolean)
  const berat = Number(String(bagian[0] || '').replace(',', '.'))
  const tinggiCm = Number(String(bagian[1] || '').replace(',', '.'))
  if (!(berat > 0 && berat < 500) || !(tinggiCm > 30 && tinggiCm < 300)) {
    return m.reply(`Format: ${usedPrefix}${command} <berat kg> <tinggi cm>\nContoh: ${usedPrefix}${command} 65 170`)
  }

  const meter = tinggiCm / 100
  const bmi = berat / (meter * meter)
  const idealMin = 18.5 * meter * meter
  const idealMax = 24.9 * meter * meter
  const selisih = berat < idealMin ? idealMin - berat : berat > idealMax ? berat - idealMax : 0
  const catatan = selisih === 0
    ? 'Beratmu sudah di rentang ideal.'
    : berat < idealMin
      ? `Kurang sekitar ${selisih.toFixed(1)} kg dari rentang ideal.`
      : `Lebih sekitar ${selisih.toFixed(1)} kg dari rentang ideal.`

  return m.reply(
    `⚖️ *INDEKS MASSA TUBUH*\n\n` +
    `▬ Berat : ${berat} kg\n` +
    `▬ Tinggi : ${tinggiCm} cm\n` +
    `▬ BMI : *${bmi.toFixed(1)}*\n` +
    `▬ Kategori : ${kategoriBmi(bmi)}\n\n` +
    `Rentang berat ideal untuk tinggi ini: ${idealMin.toFixed(1)}–${idealMax.toFixed(1)} kg.\n${catatan}\n\n` +
    `_BMI hanya perkiraan kasar, bukan diagnosis medis._`
  )
}

handler.help = ['bmi <berat kg> <tinggi cm>']
handler.tags = ['tools']
handler.command = ['bmi', 'imt']
handler.description = 'Hitung indeks massa tubuh (BMI) dan rentang berat ideal'

export default handler
