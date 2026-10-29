/* Task152 — uji logika hosting situs lokal + antrean kode (.addcase/.addplugin).
 * Jalankan: node tests/task152-situs-lokal.mjs
 */
import path from 'path'
import { namaDariHost, registrySitus } from '../lib/situs-lokal.js'
import { jalurSitus, batasPerUser, halamanAwal } from '../lib/subdomain-kaira.js'
import { tampakKode, BATAS_TUNGGU } from '../lib/pending-kode.js'

let lulus = 0
let gagal = 0

function cek(nama, benar, tambahan = '') {
  if (benar) { lulus++; console.log(`  ✅ ${nama}`) }
  else { gagal++; console.log(`  ❌ ${nama}${tambahan ? ' — ' + tambahan : ''}`) }
}

console.log('== host → nama subdomain ==')
cek('bentuk strip', namaDariHost('demo-alzriss.gwenna.my.id') === 'demo')
cek('bentuk titik', namaDariHost('demo.alzriss.gwenna.my.id') === 'demo')
cek('dengan port', namaDariHost('demo-alzriss.gwenna.my.id:443') === 'demo')
cek('kapital dinormalkan', namaDariHost('DEMO-Alzriss.Gwenna.My.Id') === 'demo')
cek('domain dasar bukan situs', namaDariHost('alzriss.gwenna.my.id') === '')
cek('api bukan situs', namaDariHost('api.gwenna.my.id') === '')
cek('domain lain bukan situs', namaDariHost('situs.orang.com') === '')
cek('host kosong', namaDariHost('') === '')
cek('nama berbahaya ditolak', namaDariHost('..-alzriss.gwenna.my.id') === '')

console.log('== jalur berkas situs ==')
const akar = path.join(process.cwd(), 'situs')
const j1 = jalurSitus('/situs/demo/index.html')
cek('jalur logis dipetakan', j1 === path.join(akar, 'demo', 'index.html'), j1)
const j2 = jalurSitus('/situs/../../etc/passwd')
cek('traversal tidak keluar folder', j2.startsWith(akar), j2)
const j3 = jalurSitus('/situs/demo/../rahasia.txt')
cek('titik-titik dibersihkan', j3 === path.join(akar, 'rahasia.txt') || j3.startsWith(akar), j3)
cek('node_modules di akar ditolak', jalurSitus('/situs/node_modules/x.js') === akar)
cek('folder dalam situs tetap boleh', jalurSitus('/situs/demo/aset/gambar.png') === path.join(akar, 'demo', 'aset', 'gambar.png'))

console.log('== registry ==')
cek('registry kosong tanpa berkas', typeof registrySitus() === 'object')

console.log('== antrean kode ==')
cek('kode case dikenali', tampakKode("case 'halo':\n  m.reply('hai')") === true)
cek('kode plugin dikenali', tampakKode('const handler = async (m) => { m.reply(1) }') === true)
cek('obrolan biasa bukan kode', tampakKode('halo kak apa kabar') === false)
cek('perintah bukan kode', tampakKode('.menu') === false)
cek('teks kosong bukan kode', tampakKode('') === false)
cek('batas tunggu 20 menit', BATAS_TUNGGU === 20 * 60 * 1000, String(BATAS_TUNGGU))

console.log('== subdomain tetap waras ==')
cek('batas user 3', batasPerUser() === 3)
cek('halaman awal punya doctype', /^<!doctype html>/i.test(halamanAwal({ nama: 'demo', pemilik: '62811@s.whatsapp.net' })))

console.log(`\n===== ${lulus} lulus, ${gagal} gagal =====`)
process.exit(gagal ? 1 : 0)
