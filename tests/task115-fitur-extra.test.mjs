/* Task115 — fitur baru dari bot VanXone Multi Device (selain rch).
 * Semua dipanggil dengan payload pesan tiruan yang bentuknya sama seperti
 * yang dikirim handler asli; yang berbau jaringan memakai API sungguhan.
 */
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const hasil2 = []
const cek = (nama, lulus, info = '') => { hasil2.push(lulus); console.log(`${lulus ? 'LULUS' : 'GAGAL'} · ${nama}${info ? ' — ' + info : ''}`) }

async function muat(nama) {
  return (await import(pathToFileURL(path.join(ROOT, 'plugins/tools', nama)).href)).default
}

function pesan(text) {
  const m = { text, args: String(text || '').trim().split(/\s+/).filter(Boolean), chat: '1@s.whatsapp.net', sender: '2@s.whatsapp.net' }
  m.reply = async isi => { m.balasan = String(isi) }
  return m
}

async function jalankan(nama, text) {
  const handler = await muat(nama)
  const m = pesan(text)
  await handler(m, { conn: {}, text, args: m.args, usedPrefix: '.', command: String(handler.command[0]) })
  return m.balasan || ''
}

/* ── cuaca (API sungguhan) ─────────────────────────────────────── */
{
  const jawab = await jalankan('usanagi-cuaca.js', 'Makassar')
  cek('cuaca memuat data kota sungguhan', /CUACA .*MAKASSAR/i.test(jawab), jawab.split('\n')[0])
  cek('cuaca menyertakan suhu', /Suhu\s+: -?\d+°C/.test(jawab))
  cek('cuaca memberi prakiraan 3 hari', (jawab.match(/• /g) || []).length === 3)
  const salah = await jalankan('usanagi-cuaca.js', 'xzxzxzxzz')
  cek('kota tidak ada → pesan jelas', /tidak ditemukan/i.test(salah))
  const kosong = await jalankan('usanagi-cuaca.js', '')
  cek('tanpa kota → contoh pemakaian', /Contoh/.test(kosong))
}

/* ── cicilan ───────────────────────────────────────────────────── */
{
  const jawab = await jalankan('usanagi-cicilan.js', '10jt 12 12')
  cek('cicilan menghitung angsuran flat', /Angsuran : Rp933\.333/.test(jawab), (jawab.match(/Angsuran : [^\n]+/) || [''])[0])
  cek('cicilan menampilkan bunga total', /Total bunga : Rp1\.200\.000/.test(jawab), (jawab.match(/Total bunga : [^\n]+/) || [''])[0])
  cek('cicilan menormalkan "10jt" jadi 10 juta', /Pokok : Rp10\.000\.000/.test(jawab))
  const nol = await jalankan('usanagi-cicilan.js', '10jt 0 10')
  cek('bunga 0% → angsuran = pokok/bulan', /Angsuran : Rp1\.000\.000/.test(nol))
  const salah = await jalankan('usanagi-cicilan.js', 'abc')
  cek('masukan salah → petunjuk format', /Format:/.test(salah))
}

/* ── diskon ────────────────────────────────────────────────────── */
{
  const satu = await jalankan('usanagi-diskon.js', '250000 30')
  cek('diskon menghitung harga akhir', /Harga akhir : Rp175\.000/.test(satu), (satu.match(/Harga akhir : [^\n]+/) || [''])[0])
  cek('diskon menghitung hemat', /Hemat : Rp75\.000 \(30\.0%\)/.test(satu))
  const dua = await jalankan('usanagi-diskon.js', '1jt 20 10')
  cek('diskon bertingkat dihitung benar', /Harga akhir : Rp720\.000/.test(dua), (dua.match(/Harga akhir : [^\n]+/) || [''])[0])
  const salah = await jalankan('usanagi-diskon.js', '100 150')
  cek('persen di luar 0-100 ditolak', /Format:/.test(salah))
}

/* ── bmi ───────────────────────────────────────────────────────── */
{
  const normal = await jalankan('usanagi-bmi.js', '65 170')
  cek('bmi menghitung nilai', /BMI : \*22\.5\*/.test(normal), (normal.match(/BMI : [^\n]+/) || [''])[0])
  cek('bmi memberi kategori', /Kategori : Normal/.test(normal))
  cek('bmi menyebut rentang ideal', /Rentang berat ideal/.test(normal))
  const kurang = await jalankan('usanagi-bmi.js', '45 170')
  cek('bmi kategori kurang', /Berat badan kurang/.test(kurang))
  const salah = await jalankan('usanagi-bmi.js', '0 0')
  cek('masukan tidak masuk akal ditolak', /Format:/.test(salah))
}

/* ── calc ──────────────────────────────────────────────────────── */
{
  cek('calc aritmetika + kurung', (await jalankan('usanagi-calc.js', '(12+8)*3/4')).includes('= *15*'))
  cek('calc pangkat', (await jalankan('usanagi-calc.js', '2^10')).includes('= *1.024*'), await jalankan('usanagi-calc.js', '2^10'))
  cek('calc modulo', (await jalankan('usanagi-calc.js', '15%4')).includes('= *3*'))
  const jahat = await jalankan('usanagi-calc.js', 'process.exit(1)')
  cek('calc menolak kode (bukan hanya angka)', /tidak valid/i.test(jahat), jahat.slice(0, 40))
  const jahat2 = await jalankan('usanagi-calc.js', '1;process.exit(1)')
  cek('calc menolak pemisah perintah', /tidak valid/i.test(jahat2))
  const kurung = await jalankan('usanagi-calc.js', '(1+2')
  cek('kurung tidak seimbang ditolak', /tidak valid/i.test(kurung))
}

/* ── epoch ─────────────────────────────────────────────────────── */
{
  const detik = await jalankan('usanagi-epoch.js', '1700000000')
  cek('epoch timestamp → tanggal WIB', /14 November 2023|15 November 2023/.test(detik), (detik.match(/WIB : [^\n]+/) || [''])[0])
  cek('epoch menampilkan detik & ISO', /Detik : 1700000000/.test(detik) && /2023-11-14T22:13:20\.000Z/.test(detik))
  const tanggal = await jalankan('usanagi-epoch.js', '2025-12-31 23:59')
  cek('epoch tanggal → detik', /Detik : 1767200340/.test(tanggal), (tanggal.match(/Detik : \d+/) || [''])[0])
  const sekarang = await jalankan('usanagi-epoch.js', '')
  cek('epoch tanpa argumen menampilkan sekarang', /Sekarang :/.test(sekarang))
  const salah = await jalankan('usanagi-epoch.js', 'kemarin')
  cek('format salah ditolak', /Format salah/.test(salah))
}

/* ── base64 ────────────────────────────────────────────────────── */
{
  cek('base64 encode', (await jalankan('usanagi-base64.js', 'enc halo dunia')) === 'aGFsbyBkdW5pYQ==')
  cek('base64 decode', (await jalankan('usanagi-base64.js', 'dec aGFsbyBkdW5pYQ==')) === 'halo dunia')
  cek('base64 menolak teks bukan base64', /bukan Base64/i.test(await jalankan('usanagi-base64.js', 'dec @@@')))
  cek('base64 tanpa mode → contoh', /Contoh/.test(await jalankan('usanagi-base64.js', 'halo')))
}

const gagal = hasil2.filter(x => !x).length
console.log(`\n${hasil2.length - gagal}/${hasil2.length} lulus`)
process.exit(gagal ? 1 : 0)
