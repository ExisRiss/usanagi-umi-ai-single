/* Task156 — uji domain sendiri: domain akar, nama folder, penyajian host
 * asing/terdaftar, dan arahan penyambungan. Tanpa jaringan (kecuali satu
 * pemeriksaan DNS .invalid yang memang harus gagal).
 * Jalankan: node tests/task156-domain-sendiri.mjs
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import http from 'http'
import { pathToFileURL } from 'url'

let lulus = 0
let gagal = 0
const cek = (nama, benar, tambahan = '') => {
  if (benar) { lulus++; console.log(`  ✅ ${nama}`) }
  else { gagal++; console.log(`  ❌ ${nama}${tambahan ? ' — ' + tambahan : ''}`) }
}

const AKAR = pathToFileURL(path.join(process.cwd(), 'lib') + path.sep).href
const uji = (nama) => import(AKAR + nama)

/* Siapkan direktori kerja sementara (modul membaca process.cwd saat import). */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'umi156-'))
fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
fs.mkdirSync(path.join(tmp, 'situs', 'kaeira-my-id'), { recursive: true })
fs.mkdirSync(path.join(tmp, 'situs', 'toko'), { recursive: true })
fs.writeFileSync(path.join(tmp, 'situs', 'kaeira-my-id', 'index.html'), '<h1>situs kaeira</h1>')
fs.writeFileSync(path.join(tmp, 'situs', 'toko', 'index.html'), '<h1>toko</h1>')
fs.writeFileSync(path.join(tmp, 'data', 'subdomain-kaira.json'), JSON.stringify({
  domain: 'alzriss.gwenna.my.id',
  cnameKustom: 'situs.gwenna.my.id',
  maksPerUser: 3,
  hosting: 'lokal',
}))
fs.writeFileSync(path.join(tmp, 'data', 'subdomain-registry.json'), JSON.stringify({
  'kaeira-my-id': {
    pemilik: '6287813709432@s.whatsapp.net',
    judul: 'Kaeira',
    domainKustom: 'kaeira.my.id',
    berkas: 1,
    ukuran: 20,
    status: 'aktif',
    dibuat: Date.now(),
  },
  toko: {
    pemilik: '6287813709432@s.whatsapp.net',
    judul: 'Toko',
    berkas: 1,
    ukuran: 12,
    status: 'aktif',
    dibuat: Date.now(),
  },
}))
process.chdir(tmp)

const sendiri = await uji('domain-sendiri.js')
const kaira = await uji('subdomain-kaira.js')
const lokal = await uji('situs-lokal.js')

console.log('== domain akar ==')
{
  cek('kaeira.my.id → kaeira.my.id', sendiri.domainAkar('kaeira.my.id') === 'kaeira.my.id', sendiri.domainAkar('kaeira.my.id'))
  cek('blog.kaeira.my.id → kaeira.my.id', sendiri.domainAkar('blog.kaeira.my.id') === 'kaeira.my.id', sendiri.domainAkar('blog.kaeira.my.id'))
  cek('a.b.kaeira.my.id → kaeira.my.id', sendiri.domainAkar('a.b.kaeira.my.id') === 'kaeira.my.id', sendiri.domainAkar('a.b.kaeira.my.id'))
  cek('volty.com → volty.com', sendiri.domainAkar('volty.com') === 'volty.com', sendiri.domainAkar('volty.com'))
  cek('sub.volty.com → volty.com', sendiri.domainAkar('sub.volty.com') === 'volty.com', sendiri.domainAkar('sub.volty.com'))
  cek('x.co.uk → x.co.uk', sendiri.domainAkar('x.co.uk') === 'x.co.uk', sendiri.domainAkar('x.co.uk'))
  cek('sub.x.com.au → x.com.au', sendiri.domainAkar('sub.x.com.au') === 'x.com.au', sendiri.domainAkar('sub.x.com.au'))
  cek('cloud.id → cloud.id', sendiri.domainAkar('cloud.id') === 'cloud.id', sendiri.domainAkar('cloud.id'))
}

console.log('== nama folder & domain bot ==')
{
  cek('kaeira.my.id → kaeira-my-id', sendiri.namaFolderDomain('kaeira.my.id') === 'kaeira-my-id', sendiri.namaFolderDomain('kaeira.my.id'))
  cek('blog.kaeira.my.id → blog-kaeira-my-id', sendiri.namaFolderDomain('blog.kaeira.my.id') === 'blog-kaeira-my-id', sendiri.namaFolderDomain('blog.kaeira.my.id'))
  cek('domain bot terbaca', sendiri.domainBot() === 'alzriss.gwenna.my.id', sendiri.domainBot())
}

console.log('== masukan .addsubdomain ==')
{
  const a = kaira.bacaArgumenSitus('alzriss.my.id')
  cek('alzriss.my.id → domain sendiri', a.jenis === 'kustom' && a.domain === 'alzriss.my.id', JSON.stringify(a))
  const b = kaira.bacaArgumenSitus('cloud.id')
  cek('cloud.id → domain sendiri', b.jenis === 'kustom' && b.domain === 'cloud.id', JSON.stringify(b))
  const c = kaira.bacaArgumenSitus('volty.com')
  cek('volty.com → domain sendiri', c.jenis === 'kustom' && c.domain === 'volty.com', JSON.stringify(c))
  const d = kaira.bacaArgumenSitus('blog.kaeira.my.id')
  cek('blog.kaeira.my.id → domain sendiri', d.jenis === 'kustom' && d.domain === 'blog.kaeira.my.id', JSON.stringify(d))
  const e = kaira.bacaArgumenSitus('https://volty.com/')
  cek('URL domain dibersihkan', e.jenis === 'kustom' && e.domain === 'volty.com', JSON.stringify(e))
  const f = kaira.bacaArgumenSitus('toko')
  cek('nama polos tetap nama', f.jenis === 'nama' && f.nama === 'toko', JSON.stringify(f))
}

console.log('== penyajian host ==')
{
  cek('domain terdaftar dikenali', lokal.namaDariHost('kaeira.my.id') === 'kaeira-my-id', lokal.namaDariHost('kaeira.my.id'))
  cek('www domain terdaftar dikenali', lokal.namaDariHost('www.kaeira.my.id') === 'kaeira-my-id', lokal.namaDariHost('www.kaeira.my.id'))
  cek('host tidak terdaftar → kosong', lokal.namaDariHost('volty.com') === '', lokal.namaDariHost('volty.com'))
  cek('subdomain bot tetap jalan', lokal.namaDariHost('toko-alzriss.gwenna.my.id') === 'toko')
  cek('host api milik bot', lokal.hostMilikBot('api.gwenna.my.id') === true)
  cek('host upload milik bot', lokal.hostMilikBot('upload.gwenna.my.id') === true)
  cek('domain user bukan milik bot', lokal.hostMilikBot('kaeira.my.id') === false)
  cek('subdomain bot dikenali milik bot', lokal.hostMilikBot('toko-alzriss.gwenna.my.id') === true)
  cek('IP lokal dianggap milik bot', lokal.hostMilikBot('127.0.0.1:2176') === true)
}

/** Jalankan layaniSitus dengan header Host tertentu tanpa membuka port. */
function coba(host, jalur = '/') {
  return new Promise((selesai) => {
    const req = { method: 'GET', url: jalur, headers: { host } }
    const bagian = []
    const res = {
      writeHead(status, headers) { this._status = status; this._headers = headers },
      end(isi) { selesai({ status: this._status || 0, headers: this._headers || {}, isi: isi ? String(isi) : '' }) },
      write(isi) { bagian.push(String(isi)) },
    }
    const ditangani = lokal.layaniSitus(req, res)
    if (!ditangani) selesai({ status: -1, headers: {}, isi: '' })
  })
}

console.log('== isi halaman per host ==')
{
  const a = await coba('kaeira.my.id')
  cek('domain terdaftar → 200', a.status === 200, String(a.status))
  cek('isi situs milik user', a.isi.includes('situs kaeira'), a.isi.slice(0, 40))
  cek('header X-Umi-Situs', String(a.headers['X-Umi-Situs'] || '') === 'kaeira-my-id', String(a.headers['X-Umi-Situs']))

  const b = await coba('volty.com')
  cek('domain asing → 404', b.status === 404, String(b.status))
  cek('halaman arahan menyebut .addsubdomain', b.isi.includes('.addsubdomain volty.com'), b.isi.slice(0, 60))
  cek('halaman arahan menyebut .cekdns', b.isi.includes('.cekdns'))
  cek('penanda host belum-terdaftar', String(b.headers['X-Umi-Host'] || '') === 'belum-terdaftar')

  const c = await coba('api.gwenna.my.id')
  cek('host API tidak disentuh penyaji situs', c.status === -1, String(c.status))

  const d = await coba('volty.com', '/profil')
  cek('jalur lain tidak diambil alih', d.status === -1, String(d.status))

  const e = await coba('toko-alzriss.gwenna.my.id')
  cek('subdomain bot tetap disajikan', e.status === 200 && e.isi.includes('toko'), String(e.status))
}

console.log('== arahan domain ==')
{
  const denganNs = sendiri.panduanDomain('kaeira.my.id', { ns: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'] })
  cek('menyebut nameserver Cloudflare', denganNs.includes('ada.ns.cloudflare.com') && denganNs.includes('bob.ns.cloudflare.com'))
  cek('ada langkah ganti NS', /ganti nameserver/i.test(denganNs))
  cek('menyebut registrar Indonesia', /Niagahoster/.test(denganNs) && /Domainesia/.test(denganNs) && /Hostinger/.test(denganNs))
  cek('menyebut cloud.id / volty', /Cloud\.id/.test(denganNs) && /Volty/.test(denganNs))
  cek('menyebut cara cek', denganNs.includes('.cekdns kaeira.my.id'))
  cek('menyebut alamat bot alternatif', denganNs.includes('kaeira-my-id-alzriss.gwenna.my.id'))

  const tanpaNs = sendiri.panduanDomain('volty.com', {})
  cek('tanpa NS → minta titip ke owner', /Titipkan domain ke owner bot/.test(tanpaNs))
  cek('tanpa NS tidak mengarang NS', !/ns\.cloudflare\.com/.test(tanpaNs))
}

console.log('== zona tanpa token ==')
{
  const zona = await sendiri.kelolaZona('kaeira.my.id')
  cek('tidak bisa tanpa token', zona.bisa === false, JSON.stringify(zona))
  cek('alasan jelas', /Token Cloudflare/i.test(String(zona.alasan || '')), String(zona.alasan))
  cek('domain akar ikut dilaporkan', zona.akar === 'kaeira.my.id', String(zona.akar))
}

console.log('== cekDns domain tidak ada ==')
{
  const cek1 = await sendiri.cekDns('tidak-ada-domain-ini-156.invalid')
  cek('tidak hidup', cek1.hidup === false, JSON.stringify(cek1.status))
  cek('NS kosong', Array.isArray(cek1.ns) && cek1.ns.length === 0)
  cek('ada saran', Array.isArray(cek1.saran) && cek1.saran.length >= 1)
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n===== ${lulus} lulus, ${gagal} gagal =====`)
process.exit(gagal ? 1 : 0)
