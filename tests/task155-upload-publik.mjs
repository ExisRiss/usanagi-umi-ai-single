/* Task155 — uji penyimpanan & penyajian upload publik (tanpa jaringan).
 * Jalankan: node tests/task155-upload-publik.mjs
 */
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'

/* Folder kerja sementara supaya data asli tidak tersentuh. */
const kerja = fs.mkdtempSync(path.join(os.tmpdir(), 'umi155-'))
process.chdir(kerja)
fs.mkdirSync(path.join(kerja, 'data'), { recursive: true })
fs.writeFileSync(path.join(kerja, 'data', 'upload-publik.json'), JSON.stringify({
  host: 'upload.gwenna.my.id', maksUkuran: 1024, simpanHari: 30,
}))

const {
  simpanBerkas, daftarFolder, hostUpload, layaniUpload,
  idAkun, namaBerkasAman, bersihkanLama, batasUkuranUpload,
} = await import('../lib/upload-publik.js')

let lulus = 0
let gagal = 0
const cek = (nama, benar, tambahan = '') => {
  if (benar) { lulus++; console.log(`  ✅ ${nama}`) }
  else { gagal++; console.log(`  ❌ ${nama}${tambahan ? ' — ' + tambahan : ''}`) }
}

console.log('== konfigurasi ==')
cek('host dari config', hostUpload() === 'upload.gwenna.my.id', hostUpload())
cek('batas ukuran dari config', batasUkuranUpload() === 1024, String(batasUkuranUpload()))

console.log('== id akun ==')
const idA = idAkun('6287813709432@s.whatsapp.net')
cek('id stabil', idA === idAkun('6287813709432@lid') && idA.length === 8, idA)
cek('beda nomor beda id', idA !== idAkun('628111@s.whatsapp.net'))
cek('nomor tidak muncul di id', !idA.includes('6287813709432'))
cek('jid kosong → kosong', idAkun('') === '')

console.log('== nama berkas ==')
cek('tanpa folder', namaBerkasAman('../../etc/passwd') === 'passwd')
cek('spasi jadi strip', namaBerkasAman('foto liburan.jpg') === 'foto-liburan.jpg')
cek('ekstensi dipertahankan', namaBerkasAman('arsip.tar.gz').endsWith('.gz'))

console.log('== simpan berkas ==')
const isiFoto = Buffer.from('konten-foto-uji')
const hasil = simpanBerkas({ buffer: isiFoto, nama: 'foto uji.jpg', mime: 'image/jpeg', jid: '6287813709432@s.whatsapp.net' })
cek('url memakai host', hasil.url.startsWith('https://upload.gwenna.my.id/'), hasil.url)
cek('url berisi id akun', hasil.url.includes(`/${idA}/`), hasil.url)
cek('nama dinormalkan', hasil.nama === 'foto-uji.jpg', hasil.nama)
cek('url unduh berisi ?dl=1', hasil.urlUnduh.endsWith('?dl=1'))
cek('daftar url diakhiri /', hasil.daftarUrl.endsWith('/'))
cek('berkas benar-benar ditulis', fs.existsSync(path.join(kerja, 'data', 'upload-publik', idA, 'foto-uji.jpg')))

const zip = simpanBerkas({ buffer: Buffer.from('PK-uji'), nama: 'paket.zip', mime: 'application/zip', jid: '6287813709432@s.whatsapp.net' })
cek('zip tersimpan', zip.nama === 'paket.zip')
const tujuh = simpanBerkas({ buffer: Buffer.from('7z-uji'), nama: 'data.7z', jid: '6287813709432@s.whatsapp.net' })
cek('7z tersimpan', tujuh.nama === 'data.7z')

const sama = simpanBerkas({ buffer: Buffer.from('lagi'), nama: 'foto-uji.jpg', mime: 'image/jpeg', jid: '6287813709432@s.whatsapp.net' })
cek('nama bentrok diberi akhiran', sama.nama === 'foto-uji-1.jpg', sama.nama)

const tanpaNama = simpanBerkas({ buffer: Buffer.from('x'), mime: 'video/mp4', jid: '6287813709432@s.whatsapp.net', tipe: 'videoMessage' })
cek('tanpa nama → nama otomatis .mp4', tanpaNama.nama.endsWith('.mp4'), tanpaNama.nama)

let tolakBesar = false
try { simpanBerkas({ buffer: Buffer.alloc(2048), nama: 'besar.bin', jid: '628111@s.whatsapp.net' }) } catch { tolakBesar = true }
cek('berkas melebihi batas ditolak', tolakBesar)

let tolakKosong = false
try { simpanBerkas({ buffer: Buffer.alloc(0), nama: 'kosong.txt' }) } catch { tolakKosong = true }
cek('berkas kosong ditolak', tolakKosong)

const daftar = daftarFolder(idA)
cek('daftar folder berisi 5 berkas', daftar.length === 5, String(daftar.length))

console.log('== penyajian HTTP ==')
const server = http.createServer((req, res) => {
  if (layaniUpload(req, res)) return
  res.writeHead(418); res.end('bukan-upload')
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

function ambil(jalur, host = 'upload.gwenna.my.id', metode = 'GET') {
  return new Promise((selesai) => {
    const req = http.request({ host: '127.0.0.1', port, path: jalur, method: metode, headers: { Host: host } }, (res) => {
      const buf = []
      res.on('data', (c) => buf.push(c))
      res.on('end', () => selesai({ status: res.statusCode, headers: res.headers, isi: Buffer.concat(buf).toString('utf8') }))
    })
    req.on('error', (e) => selesai({ status: 0, galat: e.message, headers: {}, isi: '' }))
    req.end()
  })
}

const depan = await ambil('/')
cek('halaman depan 200', depan.status === 200 && /Upload publik/i.test(depan.isi))

const berkas = await ambil(`/${idA}/foto-uji.jpg`)
cek('berkas 200', berkas.status === 200)
cek('content-type foto', String(berkas.headers['content-type']).startsWith('image/jpeg'), String(berkas.headers['content-type']))
cek('foto inline (tanpa dl)', String(berkas.headers['content-disposition'] || '').startsWith('inline'), String(berkas.headers['content-disposition']))
cek('isi benar', berkas.isi === 'konten-foto-uji')

const unduh = await ambil(`/${idA}/foto-uji.jpg?dl=1`)
cek('?dl=1 → attachment', String(unduh.headers['content-disposition'] || '').startsWith('attachment'), String(unduh.headers['content-disposition']))

const arsip = await ambil(`/${idA}/paket.zip`)
cek('zip → attachment', String(arsip.headers['content-disposition'] || '').startsWith('attachment'))
cek('zip content-type', String(arsip.headers['content-type']) === 'application/zip', String(arsip.headers['content-type']))

const tujuh2 = await ambil(`/${idA}/data.7z`)
cek('7z content-type', String(tujuh2.headers['content-type']) === 'application/x-7z-compressed', String(tujuh2.headers['content-type']))

const daftarHal = await ambil(`/${idA}/`)
cek('daftar folder 200', daftarHal.status === 200 && daftarHal.isi.includes('foto-uji.jpg'))
cek('daftar folder memuat link', daftarHal.isi.includes(`/${idA}/paket.zip`))

const hilang = await ambil(`/${idA}/tidak-ada.txt`)
cek('berkas hilang → 404', hilang.status === 404)

const folderKosong = await ambil('/tidakada999/')
cek('folder kosong → 404', folderKosong.status === 404)

const traversal = await ambil(`/${idA}/..%2F..%2Fetc%2Fpasswd`)
cek('traversal ditolak', traversal.status === 400 || traversal.status === 404, String(traversal.status))

const hostLain = await ambil('/', 'api.gwenna.my.id')
cek('host lain tidak ditangani', hostLain.status === 418)

const metodeSalah = await ambil(`/${idA}/foto-uji.jpg`, 'upload.gwenna.my.id', 'POST')
cek('POST ditolak 405', metodeSalah.status === 405)

console.log('== masa simpan ==')
const tua = path.join(kerja, 'data', 'upload-publik', idA, 'lama.txt')
fs.writeFileSync(tua, 'x')
const mundur = Date.now() - 40 * 24 * 60 * 60 * 1000
fs.utimesSync(tua, new Date(mundur), new Date(mundur))
const dihapus = bersihkanLama()
cek('berkas kedaluwarsa dihapus', dihapus === 1 && !fs.existsSync(tua), `dihapus=${dihapus}`)
cek('berkas baru tetap ada', fs.existsSync(path.join(kerja, 'data', 'upload-publik', idA, 'foto-uji.jpg')))

server.close()
fs.rmSync(kerja, { recursive: true, force: true })

console.log(`\n===== ${lulus} lulus, ${gagal} gagal =====`)
process.exit(gagal ? 1 : 0)
