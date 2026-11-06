/* By AlzRiss - Usanagi Umi AI — Task206 (port dari Kaguya: asisten/lembur)
 * Upah sejam = 1/173 upah sebulan (Kepmenaker 102/2004, dipertahankan PP 35/2021). */

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
const num = (n) => String(Math.round(n * 100) / 100).replace('.', ',')

/* Tiap segmen: [batas jam kumulatif, pengali]. */
const MODE = {
  kerja: { nama: 'Hari kerja biasa', seg: [[1, 1.5], [Infinity, 2]] },
  libur5: { nama: 'Hari libur (sistem 5 hari kerja)', seg: [[8, 2], [9, 3], [Infinity, 4]] },
  libur6: { nama: 'Hari libur (sistem 6 hari kerja)', seg: [[7, 2], [8, 3], [Infinity, 4]] },
}
const ALIAS = { biasa: 'kerja', hk: 'kerja', libur: 'libur5', libur5hk: 'libur5', libur6hk: 'libur6', '5hk': 'libur5', '6hk': 'libur6' }

function hitung(gaji, jam, modeKey) {
  const upahJam = gaji / 173
  const rows = []
  let from = 0
  let total = 0
  for (const [lim, mult] of MODE[modeKey].seg) {
    if (from >= jam) break
    const h = Math.min(jam, lim) - from
    if (h <= 0) { from = lim; continue }
    const nominal = h * mult * upahJam
    rows.push({ h, mult, nominal })
    total += nominal
    from = lim
  }
  return { upahJam, rows, total }
}

const handler = async (m, { args, usedPrefix }) => {
  const p = usedPrefix + 'lembur'
  const a = args.map((x) => String(x).toLowerCase())
  let modeKey = 'kerja'
  const rest = a.filter((x) => {
    const k = ALIAS[x] || x
    if (MODE[k]) { modeKey = k; return false }
    return true
  })
  const gaji = parseNominal(rest[0])
  const jam = parseFloat(String(rest[1] || '').replace(',', '.'))
  if (!(gaji > 0) || !(jam > 0)) {
    return m.reply(
      `*UPAH LEMBUR*\nFormat: ${p} <upah sebulan> <jam lembur> [kerja|libur5|libur6]\n` +
      `Contoh: ${p} 5jt 3\n        ${p} 6,5jt 10 libur5\n` +
      `_Upah sebulan = gaji pokok + tunjangan tetap. Tanpa mode = hari kerja biasa._`
    )
  }
  if (jam > 24) return m.reply('Jam lembur tidak masuk akal (maksimal 24 jam dalam sehari).')
  const r = hitung(gaji, jam, modeKey)
  let t = `☾ *UPAH LEMBUR*\n${MODE[modeKey].nama}\n\n▬ Upah sebulan : ${rupiah(gaji)}\n▬ Upah sejam   : ${rupiah(r.upahJam)} (1/173)\n▬ Lembur       : ${num(jam)} jam\n\n`
  for (const x of r.rows) t += `• ${num(x.h)} jam × ${num(x.mult)} = ${rupiah(x.nominal)}\n`
  t += `\n▬ Total lembur : *${rupiah(r.total)}*\n\n_Acuan: Kepmenaker 102/2004 (maks. 4 jam/hari dan 18 jam/minggu). Hasil ini perkiraan, bukan keputusan hukum._`
  return m.reply(t)
}

handler.help = ['lembur <upah bulanan> <jam> [kerja|libur5|libur6]']
handler.tags = ['tools']
handler.command = ['lembur']
handler.description = 'Hitung upah lembur (hari kerja / hari libur 5 atau 6 hari kerja)'
handler.limit = false

export default handler
