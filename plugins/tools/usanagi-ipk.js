/* By AlzRiss - Usanagi Umi AI — Task206 (port dari Kaguya: asisten/ipk) */

const BOBOT = { A: 4, 'A-': 3.7, AB: 3.5, 'B+': 3.3, B: 3, 'B-': 2.7, BC: 2.5, 'C+': 2.3, C: 2, D: 1, E: 0 }
const f2 = (x) => x.toFixed(2).replace('.', ',')
const predikat = (x) => (x >= 3.51 ? 'Sangat memuaskan / berpotensi cum laude' : x >= 2.76 ? 'Sangat memuaskan' : x >= 2 ? 'Memuaskan' : 'Di bawah syarat lulus umum (2,00)')

const handler = async (m, { args, text, command, usedPrefix }) => {
  const p = usedPrefix + command

  if (command === 'nilai') {
    const parts = String(text || '').split('|').map((s) => s.trim()).filter(Boolean)
    const help =
      `☾ *NILAI AKHIR*\n${p} tugas 80 20 | uts 70 30 | uas 85 50\n` +
      `_Tiap komponen: nama, nilai, bobot (%). Komponen belum keluar pakai tanda ? — contoh: uas ? 50 — bot hitung nilai minimum yang dibutuhkan._`
    if (!parts.length) return m.reply(help)
    let got = 0
    let w = 0
    let unk = null
    let rows = ''
    for (const part of parts) {
      const [n, v, b] = part.split(/\s+/)
      const bw = parseFloat(String(b || '').replace(',', '.'))
      if (!n || !(bw > 0)) return m.reply(`✕ Komponen "${part}" tidak valid.\n\n${help}`)
      w += bw
      if (v === '?') {
        if (unk) return m.reply('✕ Hanya satu komponen yang boleh bertanda ?')
        unk = { n, bw }
        rows += `◇ ${n}: ? (${bw}%)\n`
      } else {
        const vv = parseFloat(String(v || '').replace(',', '.'))
        if (!(vv >= 0 && vv <= 100)) return m.reply(`✕ Nilai "${v}" harus 0–100.`)
        got += vv * bw / 100
        rows += `◆ ${n}: ${vv} (${bw}%) → ${f2(vv * bw / 100)}\n`
      }
    }
    if (Math.abs(w - 100) > 0.01) return m.reply(`✕ Total bobot harus 100% (sekarang ${w}%).`)
    if (!unk) return m.reply(`☾ *NILAI AKHIR*\n${rows}\n▬ Nilai akhir : *${f2(got)}*`)
    const need = (t) => (t - got) / unk.bw * 100
    const tb = [['A', 80], ['B', 70], ['C', 60], ['D', 50]]
    return m.reply(
      `☾ *NILAI AKHIR*\n${rows}\nSaat ini terkumpul ${f2(got)} poin. Butuh nilai *${unk.n}* minimal:\n` +
      tb.map(([g, t]) => {
        const n2 = need(t)
        return `◆ untuk ${g} (≥${t}): ${n2 <= 0 ? 'sudah aman' : n2 > 100 ? 'tidak mungkin tercapai' : f2(n2)}`
      }).join('\n') +
      '\n_Batas huruf A=80, B=70, C=60, D=50 hanyalah contoh; sesuaikan dengan kampus/sekolahmu._'
    )
  }

  if (String(args[0] || '').toLowerCase() === 'target') {
    const [cur, sks, tgt, nx] = args.slice(1).map((x) => parseFloat(String(x).replace(',', '.')))
    if (![cur, sks, tgt, nx].every(Number.isFinite) || cur < 0 || cur > 4 || tgt < 0 || tgt > 4 || sks < 0 || nx <= 0) {
      return m.reply(
        `☾ *TARGET IPK*\n${usedPrefix}ipk target <IPK sekarang> <SKS sekarang> <IPK target> <SKS semester depan>\n` +
        `Contoh: ${usedPrefix}ipk target 3,4 60 3,5 20`
      )
    }
    const need = (tgt * (sks + nx) - cur * sks) / nx
    return m.reply(
      `☾ *TARGET IPK*\nUntuk IPK *${f2(tgt)}* setelah ${sks + nx} SKS, IPS semester depan harus minimal *${f2(need)}*.\n` +
      `${need > 4 ? '_Mustahil di skala 4,00; turunkan target atau ambil lebih banyak SKS._' : need < 0 ? '_Target sudah pasti tercapai._' : '_Skala 4,00._'}`
    )
  }

  if (command === 'ipk' || command === 'ips') {
    const items = String(text || '').split(/[,;\n|]+/).map((s) => s.trim()).filter(Boolean)
    const help =
      `☾ *IPK / IPS*\n${usedPrefix}ipk A 3, B+ 2, B 4, AB 3\n${usedPrefix}ipk target 3,4 60 3,5 20\n` +
      `_Format: <huruf atau angka 0–4> <SKS>. Huruf: ${Object.keys(BOBOT).join(' ')}_`
    if (!items.length) return m.reply(help)
    let sks = 0
    let poin = 0
    let rows = ''
    for (const [i, it] of items.slice(0, 40).entries()) {
      const [g, s] = it.split(/\s+/)
      const key = String(g || '').toUpperCase()
      const b = key in BOBOT ? BOBOT[key] : parseFloat(String(g || '').replace(',', '.'))
      const c = parseFloat(String(s || '').replace(',', '.'))
      if (!(b >= 0 && b <= 4) || !(c > 0 && c <= 10)) {
        return m.reply(`✕ Mata kuliah ${i + 1} ("${it}") tidak valid.\n\n${help}`)
      }
      sks += c
      poin += b * c
      rows += `${i + 1}. ${key in BOBOT ? key : g} × ${c} SKS = ${f2(b * c)}\n`
    }
    const x = poin / sks
    return m.reply(
      `☾ *INDEKS PRESTASI*\n${rows}▬ Total SKS : ${sks}\n▬ Total mutu : ${f2(poin)}\n┗ Indeks : *${f2(x)}*\n` +
      `_${predikat(x)} (kriteria umum, kampusmu bisa berbeda)_`
    )
  }
  return m.reply('Gunakan: .ipk A 3, B+ 2 · .ipk target 3,4 60 3,5 20 · .nilai tugas 80 20 | uas ? 50')
}

handler.help = ['ipk <huruf/angka> <sks>, …', 'ipk target <sekarang> <sks> <target> <sks depan>', 'nilai <nama> <nilai> <bobot%> | …']
handler.tags = ['tools']
handler.command = ['ipk', 'ips', 'nilai']
handler.description = 'Hitung IPS/IPK, target IPS, dan nilai akhir berbobot'
handler.limit = false

export default handler
