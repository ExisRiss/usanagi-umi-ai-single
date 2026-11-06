/* By AlzRiss - Usanagi Umi AI — Task206 (port dari Kaguya: asisten/listrik) */

const TARIF = 1444.7 // Rp/kWh rumah tangga non-subsidi umum (bisa diganti: tarif=1699)
const rupiah = (n) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

const handler = async (m, { text, usedPrefix }) => {
  let tarif = TARIF
  const t0 = String(text || '').replace(/tarif=([\d.,]+)/i, (_, v) => {
    tarif = parseFloat(v.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
    return ''
  })
  const parts = t0.split('|').map((s) => s.trim()).filter(Boolean)
  const help =
    `☾ *BIAYA LISTRIK*\n${usedPrefix}listrik <watt> <jam/hari> [hari/bulan] | alat lain\n` +
    `Contoh: ${usedPrefix}listrik 350 8 30 | 100w 5 | 1,5kw 2 20 tarif=1699\n` +
    `_Hari bawaan 30. Tarif bawaan Rp1.444,70/kWh._`
  if (!parts.length || !(tarif > 0)) return m.reply(help)
  let total = 0
  let t = `☾ *BIAYA LISTRIK*\n`
  for (const [i, p] of parts.slice(0, 15).entries()) {
    const [w0, j0, h0] = p.split(/\s+/)
    const mm = String(w0).toLowerCase().match(/^(\d+(?:[.,]\d+)?)(kw|w)?$/)
    const watt = mm ? parseFloat(mm[1].replace(',', '.')) * (mm[2] === 'kw' ? 1000 : 1) : NaN
    const jam = parseFloat(String(j0 || '').replace(',', '.'))
    const hari = h0 === undefined ? 30 : parseInt(h0, 10)
    if (!(watt > 0) || !(jam > 0 && jam <= 24) || !(hari >= 1 && hari <= 31)) {
      return m.reply(`✕ Alat ${i + 1} ("${p}") tidak valid.\n\n${help}`)
    }
    const kwh = watt * jam * hari / 1000
    total += kwh
    t += `◆ ${p}\n   ${kwh.toFixed(2)} kWh → ${rupiah(kwh * tarif)}\n`
  }
  return m.reply(
    t + `\n▬ Total : ${total.toFixed(2)} kWh/bulan\n▬ Biaya : *${rupiah(total * tarif)}* /bulan  (≈ ${rupiah(total * tarif * 12)} /tahun)\n\n` +
    `_Estimasi di luar biaya beban/pajak penerangan; alat berdaya berubah-ubah (kulkas, AC inverter) rata-ratanya lebih kecil dari label watt._`
  )
}

handler.help = ['listrik <watt> <jam> [hari] | alat lain']
handler.tags = ['tools']
handler.command = ['listrik']
handler.description = 'Estimasi pemakaian dan biaya listrik per bulan dari daftar alat'
handler.limit = false

export default handler
