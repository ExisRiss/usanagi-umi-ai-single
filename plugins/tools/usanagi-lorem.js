/* By AlzRiss - Usanagi Umi AI — Task206 (port dari Kaguya: asisten/lorem) */

const LAT = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ')
const IND = 'aplikasi ini dibuat untuk membantu pengguna menyelesaikan pekerjaan dengan cepat dan mudah setiap fitur dirancang sederhana namun tetap lengkap sehingga tim dapat bekerja lebih efisien data tersimpan aman dan dapat diakses kapan saja melalui berbagai perangkat desain yang bersih membuat tampilan nyaman dilihat laporan dihasilkan otomatis agar keputusan bisa diambil secara tepat pelanggan mendapat pengalaman terbaik dari awal hingga akhir'.split(' ')

const pick = (a) => a[Math.floor(Math.random() * a.length)]
const kalimat = (w) => {
  const s = Array.from({ length: 7 + Math.floor(Math.random() * 9) }, () => pick(w))
  s[0] = s[0][0].toUpperCase() + s[0].slice(1)
  return s.join(' ') + '.'
}

const handler = async (m, { args }) => {
  const a = args.map((x) => String(x).toLowerCase())
  const id = a.includes('id') || a.includes('indo')
  const n = Math.min(5, Math.max(1, parseInt(a.find((x) => /^\d+$/.test(x)), 10) || 1))
  const w = id ? IND : LAT
  const isi = Array.from({ length: n }, (_, i) => {
    const s = Array.from({ length: 3 + Math.floor(Math.random() * 3) }, () => kalimat(w))
    if (!id && i === 0) s[0] = 'Lorem ipsum dolor sit amet, ' + s[0][0].toLowerCase() + s[0].slice(1)
    return s.join(' ')
  }).join('\n\n')
  return m.reply(isi)
}

handler.help = ['lorem [jumlah] [id]']
handler.tags = ['tools']
handler.command = ['lorem']
handler.description = 'Teks dummy Lorem Ipsum (tambah "id" untuk versi Indonesia), 1–5 paragraf'
handler.limit = false

export default handler
