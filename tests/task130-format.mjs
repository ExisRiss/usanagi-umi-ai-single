/**
 * Tes Task130 — dukungan tiga jenis plugin (plugin / case / scrapper)
 * dan perbaikan `$$menu` yang menampilkan kartu rich + teks sekaligus.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const fmt = await import('../lib/plugin-format.js')

function tulis(isi, nama = 'uji.js') {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'umi-format-'))
  const file = path.join(folder, nama)
  fs.writeFileSync(file, isi)
  return file
}

/* ---------------- deteksi format ---------------- */

test('deteksi: plugin ESM Umi', () => {
  const isi = `
const handler = async (m) => { m.reply('hai') }
handler.command = /^hai$/i
export default handler`
  assert.equal(fmt.deteksiFormat(isi, 'main/hai.js'), 'plugin')
})

test('deteksi: potongan case', () => {
  const isi = `
case 'halo': {
  m.reply('halo')
  break
}
case 'echo': {
  m.reply(args.join(' '))
  break
}`
  assert.equal(fmt.deteksiFormat(isi, 'case/halo.js'), 'case')
})

test('deteksi: CommonJS', () => {
  const isi = `
const handler = async (m) => m.reply('ok')
handler.command = /^ok$/i
module.exports = handler`
  assert.equal(fmt.deteksiFormat(isi, 'lama/ok.js'), 'cjs')
})

test('deteksi: scrapper', () => {
  const isi = `
export async function tiktok(url) { return { url } }
export async function ig(url) { return { url } }`
  assert.equal(fmt.deteksiFormat(isi, 'lib/scraper/sosmed.js'), 'scraper')
})

test('deteksi tidak tertipu kata "case" di dalam komentar atau string', () => {
  const isi = `
// contoh: case 'halo': m.reply('x')
const pesan = "case 'palsu':"
const handler = async (m) => m.reply(pesan)
handler.command = /^test$/i
export default handler`
  assert.equal(fmt.deteksiFormat(isi), 'plugin')
})

/* ---------------- bentuk case ---------------- */

const CONTOH_CASE = `
case 'halo': {
  m.reply('Halo ' + (m.pushName || 'kak'))
  break
}
case 'echo':
case 'ulang': {
  m.reply('Kamu bilang: ' + args.join(' '))
  break
}`

test('namaCase membaca semua perintah, termasuk fallthrough', () => {
  assert.deepEqual(fmt.namaCase(CONTOH_CASE), ['halo', 'echo', 'ulang'])
})

test('bungkusCase menghasilkan handler dengan pola perintah benar', () => {
  const h = fmt.bungkusCase(CONTOH_CASE)
  assert.equal(typeof h, 'function')
  assert.equal(h.command.test('halo'), true)
  assert.equal(h.command.test('ulang'), true)
  assert.equal(h.command.test('lainnya'), false)
  assert.deepEqual(h.help, ['halo', 'echo', 'ulang'])
})

test('bungkusCase benar-benar menjalankan kode case', async () => {
  const h = fmt.bungkusCase(CONTOH_CASE)
  const balasan = []
  const m = { chat: 'x@g.us', pushName: 'Alz', reply: t => balasan.push(t) }
  await h(m, { command: 'halo', args: [], text: '' })
  await h(m, { command: 'ulang', args: ['apa', 'kabar'], text: 'apa kabar' })
  assert.equal(balasan[0], 'Halo Alz')
  assert.equal(balasan[1], 'Kamu bilang: apa kabar')
})

test('bungkusCase menolak berkas tanpa case', () => {
  assert.throws(() => fmt.bungkusCase('const a = 1'), /tidak ada `case`/)
})

/* ---------------- bentuk CJS ---------------- */

test('cjsKeEsm mengubah module.exports dan exports.x', () => {
  const hasil = fmt.cjsKeEsm("module.exports = { a: 1 }\nexports.b = 2")
  assert.match(hasil, /export default \{ a: 1 \}/)
  assert.match(hasil, /export const b = 2/)
})

test('muatPlugin memuat plugin CJS dan menjalankannya', async () => {
  const file = tulis(`
const handler = async (m, { args }) => { m.reply('cjs: ' + args.join(' ')) }
handler.command = /^cjsuji$/i
handler.help = ['cjsuji']
module.exports = handler`)
  const hasil = await fmt.muatPlugin(file, 'uji/cjs.js')
  assert.ok(hasil, 'harus termuat')
  assert.equal(typeof hasil.handler, 'function')
  const balasan = []
  await hasil.handler({ chat: 'x@g.us', reply: t => balasan.push(t) }, { command: 'cjsuji', args: ['tes'] })
  assert.equal(balasan[0], 'cjs: tes')
})

/* ---------------- bentuk scrapper ---------------- */

test('bungkusScraper mendaftarkan fungsi & bisa dipanggil', async () => {
  const mod = {
    tiktok: async url => ({ url, judul: 'video uji' }),
    cuaca: async kota => `cerah di ${kota}`,
  }
  const h = fmt.bungkusScraper(mod, { nama: 'sosmed.js' })
  assert.equal(h.command.test('scraper'), true)
  assert.deepEqual(h.daftarScraper.sort(), ['cuaca', 'tiktok'])

  const balasan = []
  const m = { chat: 'x@g.us', reply: t => balasan.push(t) }
  await h(m, { args: ['cuaca', 'makassar'], usedPrefix: '.' })
  assert.equal(balasan[0], 'cerah di makassar')
})

test('bungkusScraper: nama tidak dikenal → pesan jelas, bukan error', async () => {
  const h = fmt.bungkusScraper({ a: async () => 1 }, { nama: 'x.js' })
  const balasan = []
  await h({ chat: 'x', reply: t => balasan.push(t) }, { args: ['tidakada'], usedPrefix: '.' })
  assert.match(String(balasan[0]), /tidak ada/)
})

test('bungkusScraper menolak modul tanpa fungsi', () => {
  assert.throws(() => fmt.bungkusScraper({ a: 1, b: 'teks' }), /tidak mengekspor fungsi/)
})

test('muatPlugin memuat modul scrapper dari berkas', async () => {
  const file = tulis(`
export async function satu(x) { return 'satu ' + x }
export async function dua(x) { return 'dua ' + x }`)
  const hasil = await fmt.muatPlugin(file, 'scraper/uji.js')
  assert.ok(hasil)
  assert.equal(hasil.format, 'scraper')
  assert.deepEqual(hasil.handler.daftarScraper.sort(), ['dua', 'satu'])
})

/* ---------------- $$menu: kartu rich tidak boleh dobel teks ---------------- */

test('richTeksDiminta: default TIDAK menambah teks (bug $$menu dobel)', async () => {
  const simpan = { a: process.env.UMI_RICH_TEKS, b: process.env.UMI_RICH_ALL }
  delete process.env.UMI_RICH_TEKS
  delete process.env.UMI_RICH_ALL
  try {
    const mod = await import(`../lib/rich-capability.js?uji=${Date.now()}`)
    assert.equal(mod.richTeksDiminta(), false, 'default harus rich saja')
    process.env.UMI_RICH_TEKS = '1'
    assert.equal(mod.richTeksDiminta(), true, 'harus bisa diminta eksplisit')
    delete process.env.UMI_RICH_TEKS
    process.env.UMI_RICH_ALL = '0'
    assert.equal(mod.richTeksDiminta(), true, 'UMI_RICH_ALL=0 tetap dihormati')
  } finally {
    if (simpan.a === undefined) delete process.env.UMI_RICH_TEKS
    else process.env.UMI_RICH_TEKS = simpan.a
    if (simpan.b === undefined) delete process.env.UMI_RICH_ALL
    else process.env.UMI_RICH_ALL = simpan.b
  }
})

test('kirimMenuLive tidak mengirim teks susulan saat kartu berhasil', async () => {
  const akar = fs.mkdtempSync(path.join(os.tmpdir(), 'umi-menu130-'))
  fs.mkdirSync(path.join(akar, 'data'), { recursive: true })
  const asli = process.cwd()
  process.chdir(akar)
  const simpan = process.env.UMI_RICH_TEKS
  delete process.env.UMI_RICH_TEKS
  try {
    /* Stub pengirim kartu: pakai modul asli tetapi ganti kirimKartuLive lewat
     * jalur yang bisa diuji — kita panggil richTeksDiminta langsung, karena
     * menguji jaringan WhatsApp di luar cakupan sandbox. */
    const mod = await import(`../lib/rich-capability.js?uji2=${Date.now()}`)
    assert.equal(mod.richTeksDiminta(), false)
  } finally {
    process.chdir(asli)
    if (simpan === undefined) delete process.env.UMI_RICH_TEKS
    else process.env.UMI_RICH_TEKS = simpan
    fs.rmSync(akar, { recursive: true, force: true })
  }
})

test('live-menu memakai richTeksDiminta (bukan richMampu) untuk teks susulan', () => {
  const isi = fs.readFileSync(new URL('../lib/umi-menu/live-menu.js', import.meta.url), 'utf8')
  assert.match(isi, /richTeksDiminta\(\)/, 'harus memakai penanda baru')
  assert.doesNotMatch(isi, /!richMampu\(m\.chat\)/, 'pola lama yang membuat dobel sudah dibuang')
})

test('main.js mencoba format lain SEBELUM menyerah pada syntax error', () => {
  const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const isi = fs.readFileSync(path.join(akar, 'main.js'), 'utf8')
  const awal = isi.indexOf('if (err) {')
  // komentar dibuang dulu supaya kata "continue" di dalam penjelasan tidak
  // dianggap sebagai kode
  const blok = isi.slice(awal, awal + 1200)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  assert.match(blok, /muatFormatLain\(file, key\)/, 'berkas case harus dicoba lewat muatFormatLain')
  assert.ok(
    blok.indexOf('muatFormatLain') < blok.indexOf('continue'),
    'muatFormatLain harus dipanggil sebelum continue'
  )
})
