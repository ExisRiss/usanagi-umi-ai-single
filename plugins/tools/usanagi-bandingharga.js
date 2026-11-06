/* By AlzRiss - Usanagi Umi AI — Task206 (port dari Kaguya: asisten/bandingharga) */

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

const handler = async (m, { text, usedPrefix }) => {
  const parts = String(text || '').split('|').map((s) => s.trim()).filter(Boolean)
  const daftar = []
  for (const [i, part] of parts.entries()) {
    const [h, j] = part.split(/\s+/)
    const harga = parseNominal(h)
    const jml = parseFloat(String(j || '').replace(',', '.'))
    if (!(harga > 0) || !(jml > 0)) return m.reply(`✕ Item ${i + 1} ("${part}") tidak valid. Format: <harga> <jumlah>`)
    daftar.push({ no: i + 1, harga, jml, per: harga / jml })
  }
  if (daftar.length < 2) {
    return m.reply(
      `☾ *BANDING HARGA*\n${usedPrefix}bandingharga 12rb 250 | 20rb 500 | 9rb 100\n` +
      `_Tiap item: harga lalu jumlah (gram/ml/pcs, satuannya harus sama). Pisahkan dengan |_`
    )
  }
  if (daftar.length > 10) return m.reply('✕ Maksimal 10 item.')
  const s = [...daftar].sort((a, b) => a.per - b.per)
  const best = s[0]
  let t = `☾ *BANDING HARGA*\n\n`
  s.forEach((x, i) => {
    t += `${i === 0 ? '◆' : '◇'} *Item ${x.no}* — ${rupiah(x.harga)} / ${x.jml}\n   ${rupiah(x.per * 100)} per 100 satuan${i ? `  (+${((x.per / best.per - 1) * 100).toFixed(1)}%)` : '  — termurah'}\n`
  })
  return m.reply(t + `\nPaling hemat: *Item ${best.no}*.`)
}

handler.help = ['bandingharga <harga> <jumlah> | <harga> <jumlah> | …']
handler.tags = ['tools']
handler.command = ['bandingharga']
handler.description = 'Bandingkan harga per satuan untuk cari yang paling hemat'
handler.limit = false

export default handler
