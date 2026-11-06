/* By AlzRiss - Usanagi Umi AI — Task206 (port dari Kaguya: asisten/mathkit) */

const gcdBig = (a, b) => {
  let x = BigInt(a)
  let y = BigInt(b)
  while (y) { const t = x % y; x = y; y = t }
  return x
}
function factorize(n) {
  const f = new Map()
  let x = n
  for (let p = 2; p * p <= x; p += p === 2 ? 1 : 2) {
    while (x % p === 0) { f.set(p, (f.get(p) || 0) + 1); x /= p }
  }
  if (x > 1) f.set(x, (f.get(x) || 0) + 1)
  return f
}
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const sup = (n) => [...String(n)].map((d) => SUP[d]).join('')
const SUB = ['prima', 'faktor', 'fpb', 'kpk', 'fibonacci', 'faktorial']

const handler = async (m, { args, usedPrefix }) => {
  const sub = String(args[0] || '').toLowerCase()
  const nums = args.slice(1).map((x) => Number(String(x).replace(/[.,]/g, '')))
  const p = usedPrefix + 'mathkit'
  const help =
    `☾ *MATH KIT*\n┣ ${p} prima 97\n┣ ${p} faktor 360\n┣ ${p} fpb 48 18\n` +
    `┣ ${p} kpk 4 6 10\n┣ ${p} fibonacci 15\n┗ ${p} faktorial 10`
  if (!SUB.includes(sub) || !nums.length || nums.some((x) => !Number.isSafeInteger(x) || x < 0)) {
    return m.reply(help)
  }
  const n = nums[0]
  if (sub === 'prima') {
    if (n > 1e12) return m.reply('✕ Maksimal 1.000.000.000.000.')
    const f = factorize(n)
    const prime = n > 1 && f.size === 1 && [...f.values()][0] === 1
    return m.reply(prime
      ? `✓ *${n.toLocaleString('id-ID')}* adalah bilangan *prima*.`
      : `✕ *${n.toLocaleString('id-ID')}* bukan bilangan prima.\n▬ Pembagi terkecil : ${n < 2 ? '-' : Math.min(...f.keys())}`)
  }
  if (sub === 'faktor') {
    if (n < 2 || n > 1e12) return m.reply('✕ Masukkan angka 2 – 1.000.000.000.000.')
    const str = [...factorize(n)].map(([b, e]) => (e > 1 ? `${b}${sup(e)}` : `${b}`)).join(' × ')
    const d = []
    for (let i = 1; i * i <= n; i++) {
      if (n % i === 0) { d.push(i); if (i !== n / i) d.push(n / i) }
    }
    d.sort((a, b) => a - b)
    return m.reply(
      `☾ *FAKTORISASI PRIMA*\n\n${n.toLocaleString('id-ID')} = *${str}*\n\n` +
      `▬ Jumlah pembagi : ${d.length}\n${d.length <= 40 ? d.join(', ') : d.slice(0, 40).join(', ') + ', …'}`
    )
  }
  if (sub === 'fpb' || sub === 'kpk') {
    if (nums.length < 2 || nums.length > 10 || nums.some((x) => x === 0)) {
      return m.reply(`✕ Beri 2–10 bilangan bulat positif.\nContoh: ${p} ${sub} 12 18`)
    }
    let g = BigInt(nums[0])
    let l = BigInt(nums[0])
    for (const x of nums.slice(1)) { g = gcdBig(g, x); l = l / gcdBig(l, x) * BigInt(x) }
    return m.reply(`☾ *${sub.toUpperCase()}* dari ${nums.join(', ')} = *${sub === 'fpb' ? g : l}*`)
  }
  if (sub === 'fibonacci') {
    if (n < 1 || n > 300) return m.reply('✕ Pilih jumlah suku 1 – 300.')
    let x = 0n
    let y = 1n
    const seq = []
    for (let i = 0; i < n; i++) { seq.push(x); const t = x + y; x = y; y = t }
    return m.reply(
      `☾ *FIBONACCI* (${n} suku)\n\n${n <= 40 ? seq.join(', ') : seq.slice(0, 20).join(', ') + ', …'}\n\n` +
      `Suku ke-${n}: *${seq[n - 1]}*`
    )
  }
  // faktorial
  if (n > 1000) return m.reply('✕ Maksimal 1000.')
  let r = 1n
  for (let i = 2n; i <= BigInt(n); i++) r *= i
  const s = r.toString()
  return m.reply(
    `☾ *${n}!* = ${s.length > 120 ? s.slice(0, 60) + '…' + s.slice(-30) : s}\n\n` +
    `${s.length} digit${s.length > 120 ? ' (ditampilkan sebagian)' : ''}`
  )
}

handler.help = ['mathkit <prima|faktor|fpb|kpk|fibonacci|faktorial> <angka…>']
handler.tags = ['tools']
handler.command = ['mathkit']
handler.description = 'Matematika: bilangan prima, faktorisasi, FPB, KPK, Fibonacci, faktorial'
handler.limit = false

export default handler
