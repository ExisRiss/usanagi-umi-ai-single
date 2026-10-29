/* Task151 — uji logika murni (tanpa jaringan) untuk .addcase dan subdomain.
 * Jalankan: node tests/task151-kode-aman.mjs
 */
import {
  bangunPluginCase,
  fungsiBelumDipanggil,
  bersihkanPagarKode,
  periksaKeamananKode,
  namaFiturAman,
  pecahBlokCase,
  perintahSudahDipakai,
  indentasi,
} from '../lib/kode-aman.js'
import {
  namaSubAman,
  hostUtama,
  hostTitik,
  batasPerUser,
  subdomainMilik,
  halamanAwal,
} from '../lib/subdomain-kaira.js'

let lulus = 0
let gagal = 0

function cek(nama, benar, tambahan = '') {
  if (benar) {
    lulus++
    console.log(`  ✅ ${nama}`)
  } else {
    gagal++
    console.log(`  ❌ ${nama}${tambahan ? ' — ' + tambahan : ''}`)
  }
}

console.log('== pagar kode ==')
cek('pagar ```js dibuang', bersihkanPagarKode('```js\nm.reply(1)\n```') === 'm.reply(1)')
cek('tanpa pagar tetap utuh', bersihkanPagarKode('  m.reply(1)  ') === 'm.reply(1)')
cek('BOM dibuang', bersihkanPagarKode('\uFEFFm.reply(1)') === 'm.reply(1)')

console.log('== pecah case ==')
const satu = pecahBlokCase("case 'halo':\n  m.reply('Hai')\n  break")
cek('satu case → 1 blok', satu.length === 1 && satu[0].labels[0] === 'halo')
cek('break dibuang', !/break/.test(satu[0].isi))
cek('isi case utuh', satu[0].isi.trim() === "m.reply('Hai')")

const ganda = pecahBlokCase([
  "case 'pagi':",
  "  m.reply('Pagi')",
  '  break',
  "case 'bye':",
  "case 'dadah':",
  "  m.reply('Dadah')",
  '  break',
].join('\n'))
cek('dua blok', ganda.length === 2, JSON.stringify(ganda.map((x) => x.labels)))
cek('label bertumpuk digabung', ganda[1].labels.join(',') === 'bye,dadah')

const tanpaCase = pecahBlokCase("m.reply('polos')")
cek('tanpa case → label kosong', tanpaCase.length === 1 && tanpaCase[0].labels.length === 0)
cek('tanpa case → isi terjaga', tanpaCase[0].isi === "m.reply('polos')")

const denganDefault = pecahBlokCase("case 'a':\n  m.reply('a')\n  break\ndefault:\n  m.reply('lain')")
cek('default tidak ikut', denganDefault.length === 1 && !/lain/.test(denganDefault[0].isi))

console.log('== nama fitur ==')
cek('.Halo Dunia → halo-dunia', namaFiturAman('.Halo Dunia') === 'halo-dunia')
cek('karakter aneh dibuang', namaFiturAman('sapa!!!kak??') === 'sapa-kak')
cek('nama perintah inti ditolak', namaFiturAman('addplugin') === '')
cek('angka saja ditolak', namaFiturAman('12345') === '')
cek('terlalu pendek ditolak', namaFiturAman('a') === '')
cek('panjang dipotong 30', namaFiturAman('a'.repeat(40)).length === 30)

console.log('== keamanan kode ==')
const tolak = [
  ['eval', 'const x = eval("1")'],
  ['child_process', 'import cp from "child_process"'],
  ['process.env', 'const t = process.env.TOKEN'],
  ['hapus berkas', 'await fs.rm("data")'],
  ['kredensial', 'baca("sessions/x/creds.json")'],
  ['global.db', 'global.db = {}'],
]
for (const [nama, kode] of tolak) {
  let ditolak = false
  try { periksaKeamananKode(kode) } catch { ditolak = true }
  cek(`tolak ${nama}`, ditolak)
}
let aman = true
try { periksaKeamananKode("m.reply('Hai ' + m.pushName)") } catch { aman = false }
cek('kode biasa diterima', aman)

console.log('== bentrok perintah ==')
const pluginsUji = {
  'main/menu.js': { command: /^(menu|allmenu)$/i },
  'main/ping.js': { command: ['ping', 'p'] },
}
cek('deteksi regex', perintahSudahDipakai('menu', pluginsUji) === true)
cek('deteksi array', perintahSudahDipakai('ping', pluginsUji) === true)
cek('nama baru lolos', perintahSudahDipakai('sapa-baru', pluginsUji) === false)
cek('beda huruf besar/kecil', perintahSudahDipakai('MENU', pluginsUji) === true)

console.log('== indentasi ==')
cek('indentasi 2 spasi', indentasi('a\n\nb') === '  a\n\n  b')

console.log('== subdomain ==')
cek('nama valid', namaSubAman('toko-budi') === 'toko-budi')
cek('nama terlarang ditolak', namaSubAman('admin') === '')
cek('angka saja ditolak', namaSubAman('12345') === '')
cek('huruf besar → kecil', namaSubAman('TokoBudi') === 'tokobudi')
cek('host utama', hostUtama('toko') === 'toko-alzriss.gwenna.my.id', hostUtama('toko'))
cek('host titik', hostTitik('toko') === 'toko.alzriss.gwenna.my.id', hostTitik('toko'))
cek('batas per user default 3', batasPerUser() === 3, String(batasPerUser()))

const registryUji = {
  toko: { pemilik: '628111@s.whatsapp.net' },
  blog: { pemilik: '628111@s.whatsapp.net' },
  lain: { pemilik: '628222@s.whatsapp.net' },
}
const milik = subdomainMilik(registryUji, '628111@lid')
cek('milik user dihitung 2', milik.length === 2, JSON.stringify(milik))
cek('milik developer lain tidak ikut', milik.includes('lain') === false)

const html = halamanAwal({ nama: 'toko', pemilik: '6281234567890@s.whatsapp.net', judul: 'Toko Budi' })
cek('halaman awal HTML', /^<!doctype html>/i.test(html))
cek('halaman memuat nama', html.includes('toko'))
cek('halaman menutup nomor', !html.includes('6281234567890'))
cek('halaman memuat perintah deploy', html.includes('.deploysubdomain toko ganti'))


console.log('== fungsi yang hanya dideklarasikan ==')
const fungsiSaja = 'async function Bug2(sock, jid) {\n  await sock.relayMessage(jid, {}, {})\n}'
cek('fungsi tanpa pemanggilan terdeteksi', fungsiBelumDipanggil(fungsiSaja) === 'Bug2')
cek('fungsi yang sudah dipanggil tidak diulang', fungsiBelumDipanggil(fungsiSaja + '\nawait Bug2(conn, m.chat)') === '')
cek('kode biasa tidak dianggap fungsi', fungsiBelumDipanggil("m.reply('hai')") === '')
cek('dua fungsi, salah satu dipanggil', fungsiBelumDipanggil('function A(){}\nfunction B(){}\nA()') === '')

console.log('== berkas case yang dihasilkan ==')
const berkasCase = bangunPluginCase({
  labels: ['sapa', 'hai'],
  isi: "m.reply('Hai')",
  namaBerkas: 'sapa',
  pengirim: '+62811',
  waktu: 'uji',
  fungsiOtomatis: 'Bug2',
})
cek('ada alias sock', berkasCase.includes('const sock = conn'))
cek('ada alias jid', berkasCase.includes('const jid = m.chat'))
cek('auto-call ditulis', berkasCase.includes('await Bug2(sock, jid)'))
cek('command dari label', /handler\.command = \/\^\(sapa\|hai\)\$\/i/.test(berkasCase))
cek('export default ada', /export default handler/.test(berkasCase))
cek('tanpa fungsiOtomatis tidak ada auto-call', !bangunPluginCase({ labels: ['x'], isi: 'm.reply(1)', namaBerkas: 'x' }).includes('await undefined'))

console.log(`\n===== ${lulus} lulus, ${gagal} gagal =====`)
process.exit(gagal ? 1 : 0)
