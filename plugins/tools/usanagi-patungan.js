/* By AlzRiss - Usanagi Umi AI — Task206 (port dari Kaguya: asisten/patungan) */

function parseNominal(raw) {
  let s = String(raw || '').toLowerCase().replace(/\s+/g, '')
  if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const m = s.match(/^(\d+(?:[.,]\d+)?)(k|rb|ribu|jt|juta)?$/)
  if (!m) return NaN
  const n = parseFloat(m[1].replace(',', '.'))
  const kali = { k: 1e3, rb: 1e3, ribu: 1e3, jt: 1e6, juta: 1e6 }[m[2]] || 1
  return n * kali
}
const rupiah = (n) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

const handler = async (m, { args, usedPrefix }) => {
  const total = parseNominal(args[0])
  const n = parseInt(args[1], 10)
  const pajak = args[2] !== undefined ? parseFloat(String(args[2]).replace(',', '.')) : 0
  const svc = args[3] !== undefined ? parseFloat(String(args[3]).replace(',', '.')) : 0
  if (!(total > 0) || !(n >= 1) || n > 500 || !(pajak >= 0) || !(svc >= 0)) {
    return m.reply(
      `☾ *PATUNGAN*\n${usedPrefix}patungan <total> <orang> [pajak%] [service%]\n` +
      `Contoh: ${usedPrefix}patungan 450rb 5 10 5\n` +
      `_Total boleh ditulis 450rb, 1,5jt, atau 250000_`
    )
  }
  const sv = total * svc / 100
  const tx = (total + sv) * pajak / 100
  const grand = total + sv + tx
  const per = grand / n
  const round = Math.ceil(per / 100) * 100
  let t = `☾ *HITUNG PATUNGAN*\n\n▬ Subtotal : ${rupiah(total)}\n`
  if (svc) t += `▬ Service ${svc}% : ${rupiah(sv)}\n`
  if (pajak) t += `▬ Pajak ${pajak}% : ${rupiah(tx)}\n`
  t += `▬ Total : *${rupiah(grand)}*\n▬ Orang : ${n}\n\n┣ Per orang : *${rupiah(per)}*\n┗ Dibulatkan : *${rupiah(round)}*`
  if (round * n - grand > 0.5) t += `\n\n_Kelebihan pembulatan: ${rupiah(round * n - grand)}_`
  return m.reply(t)
}

handler.help = ['patungan <total> <orang> [pajak%] [service%]']
handler.tags = ['tools']
handler.command = ['patungan']
handler.description = 'Bagi tagihan patungan dengan pajak, service charge, dan pembulatan'
handler.limit = false

export default handler
