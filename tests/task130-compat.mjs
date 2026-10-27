/* Tes Task130 — plugin format "case" & "scraper" yang benar-benar dipasang
 * di folder plugins/compat/. Bedanya dengan task130-format.mjs: di sini yang
 * diuji adalah berkas NYATA di repo, dimuat lewat loader yang sama dengan
 * yang dipakai main.js, lalu handler-nya dijalankan.
 *
 * Jalankan: node --test tests/task130-compat.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { muatPlugin, deteksiFormat } = await import('../lib/plugin-format.js')
import fs from 'node:fs'

const BERKAS_CASE = path.join(AKAR, 'plugins/compat/kilua-islamic-case.js')
const BERKAS_SCRAPER = path.join(AKAR, 'plugins/compat/kilua-quran-scraper.js')

/* Satu kotak untuk menampung semua balasan, baik lewat conn.sendMessage
 * (dipakai pembungkus scraper) maupun lewat m.reply (dipakai pembungkus case). */
function siapkan() {
  const kotak = []
  const conn = {
    async sendMessage(jid, isi) {
      kotak.push(typeof isi === 'string' ? { text: isi } : isi)
      return { key: { id: `M${kotak.length}` } }
    },
  }
  const m = {
    chat: '628222-1@g.us',
    sender: '628111@s.whatsapp.net',
    raw: null,
    async reply(isi) {
      kotak.push({ text: String(isi) })
      return { key: { id: `R${kotak.length}` } }
    },
  }
  return { kotak, conn, m }
}

const ambilTeks = kotak => String(kotak.at(-1)?.text ?? '')

test('berkas case benar-benar berformat case (tanpa export)', () => {
  const isi = fs.readFileSync(BERKAS_CASE, 'utf8')
  assert.equal(deteksiFormat(isi, 'kilua-islamic-case.js'), 'case')
  assert.ok(!/export\s+default/.test(isi), 'tidak boleh punya export default')
  assert.match(isi, /case 'akursi':/)
  assert.match(isi, /case 'quranayat':/)
})

test('berkas scraper memakai module.exports gaya bot lama', () => {
  const isi = fs.readFileSync(BERKAS_SCRAPER, 'utf8')
  assert.match(isi, /module\.exports\s*=\s*\{/)
  // `export default` hanya boleh muncul di komentar penjelasan, bukan sebagai kode.
  const kode = isi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  assert.doesNotMatch(kode, /export\s+default/)
})

test('loader memuat berkas case menjadi handler dengan 2 perintah', async () => {
  const hasil = await muatPlugin(BERKAS_CASE, 'compat/kilua-islamic-case.js')
  assert.ok(hasil, 'harus berhasil dimuat')
  assert.equal(hasil.format, 'case')
  assert.equal(typeof hasil.handler, 'function')
  assert.ok(hasil.handler.command.test('akursi'))
  assert.ok(hasil.handler.command.test('quranayat'))
  assert.ok(!hasil.handler.command.test('ping'))
})

test('loader memuat berkas scraper dan mendaftarkan fungsinya', async () => {
  const hasil = await muatPlugin(BERKAS_SCRAPER, 'compat/kilua-quran-scraper.js')
  assert.ok(hasil, 'harus berhasil dimuat')
  assert.equal(hasil.format, 'scraper')
  assert.deepEqual(hasil.handler.daftarScraper.sort(), ['surahinfo', 'tafsir'])
  assert.ok(hasil.handler.command.test('scraper'))
})

test('.quranayat salah format → pesan jelas, tidak lempar error', async () => {
  const { handler } = await muatPlugin(BERKAS_CASE, 'compat/kilua-islamic-case.js')
  const { kotak, m, conn } = siapkan()
  await handler(m, { conn, command: 'quranayat', text: 'dua:lima', usedPrefix: '.' })
  assert.match(ambilTeks(kotak), /Format salah/i)
})

test('.quranayat tanpa argumen → menampilkan cara pakai', async () => {
  const { handler } = await muatPlugin(BERKAS_CASE, 'compat/kilua-islamic-case.js')
  const { kotak, m, conn } = siapkan()
  await handler(m, { conn, command: 'quranayat', text: '', usedPrefix: '.' })
  const teks = ambilTeks(kotak)
  assert.match(teks, /AYAT AL-QURAN/)
  assert.match(teks, /\.akursi/)
  assert.match(teks, /2:255/)
})

test('.scraper tanpa argumen → daftar fungsi', async () => {
  const { handler } = await muatPlugin(BERKAS_SCRAPER, 'compat/kilua-quran-scraper.js')
  const { kotak, m, conn } = siapkan()
  await handler(m, { conn, command: 'scraper', args: [], usedPrefix: '.' })
  const teks = ambilTeks(kotak)
  assert.match(teks, /SCRAPER/)
  assert.match(teks, /scraper tafsir/)
  assert.match(teks, /scraper surahinfo/)
})

test('.scraper dengan nama tak dikenal → daftar yang tersedia', async () => {
  const { handler } = await muatPlugin(BERKAS_SCRAPER, 'compat/kilua-quran-scraper.js')
  const { kotak, m, conn } = siapkan()
  await handler(m, { conn, command: 'scraper', args: ['ngawur'], usedPrefix: '.' })
  assert.match(ambilTeks(kotak), /tidak ada/i)
})

test('scraper menolak nomor surah di luar 1–114', async () => {
  const { handler } = await muatPlugin(BERKAS_SCRAPER, 'compat/kilua-quran-scraper.js')
  const { kotak, m, conn } = siapkan()
  await handler(m, { conn, command: 'scraper', args: ['surahinfo', '999'], usedPrefix: '.' })
  assert.match(ambilTeks(kotak), /1–114|1-114/)
})

/* ---- Uji jaringan nyata (boleh gagal kalau server Al-Quran sedang down) ---- */
test('.akursi mengambil teks Arab & terjemahan sungguhan', async t => {
  const { handler } = await muatPlugin(BERKAS_CASE, 'compat/kilua-islamic-case.js')
  const { kotak, m, conn } = siapkan()
  await handler(m, { conn, command: 'akursi', text: '', usedPrefix: '.' })
  const teks = ambilTeks(kotak)
  if (/Gagal mengambil/i.test(teks)) {
    t.diagnostic(`jaringan tidak tersedia: ${teks.slice(0, 120)}`)
    return
  }
  assert.match(teks, /AYAT KURSI/)
  assert.match(teks, /Al-Baqara|Al-Baqarah/i)
  assert.match(teks, /[\u0600-\u06FF]/, 'harus ada huruf Arab')
  assert.match(teks, /Terjemahan/)
  assert.ok(teks.length > 300)
})

test('.scraper surahinfo 2 mengembalikan data Al-Baqarah', async t => {
  const { handler } = await muatPlugin(BERKAS_SCRAPER, 'compat/kilua-quran-scraper.js')
  const { kotak, m, conn } = siapkan()
  await handler(m, { conn, command: 'scraper', args: ['surahinfo', '2'], usedPrefix: '.' })
  const teks = ambilTeks(kotak)
  if (/gagal/i.test(teks)) {
    t.diagnostic(`jaringan tidak tersedia: ${teks.slice(0, 120)}`)
    return
  }
  assert.match(teks, /Al-Baqarah/)
  assert.match(teks, /286/)
})
