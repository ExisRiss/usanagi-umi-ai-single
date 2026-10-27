/* Task123 — tombol menu DILENGKAPI (tools, maker, group, semua kategori)
 * dan `.ytplay` benar-benar bisa dipakai.
 *
 * Yang dijaga:
 *   1. tombol `.menu` = 6 tombol: 3 pintasan kategori + ☰ MENU + ▦ SEMUA MENU + owner
 *   2. pintasan mengirim id `.kategori <key>` yang memang ditangani plugin
 *   3. ☰ MENU membawa 6 menu utama, semuanya punya penangan (umi-menu / router)
 *   4. ▦ SEMUA MENU memuat SELURUH kategori nyata di folder plugins/,
 *      dibagi ≤10 baris/bagian dan ≤10 bagian (batas WhatsApp)
 *   5. payload hasil bangunInteractive lolos periksaPayload
 *   6. pencarian YouTube tidak lagi memakai placeholder API key dan berlapis
 *   7. unduhan `.ytplay` memakai lib/youtube-media.js (yt-dlp → api-faa → SaveTube)
 *   8. perintah ytplay + cadangan (URL langsung / kartu / teks) tetap ada
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  tombolMenu,
  bagianMenuUtama,
  bagianSemuaMenu,
  namaKategori,
  jumlahBaris,
  MAKS_BARIS_PER_BAGIAN,
  MAKS_BAGIAN,
} from '../lib/umi-menu/menu-buttons.js'
import { PILIHAN_BAWAAN } from '../lib/umi-menu/menu-text.js'
import { bangunInteractive, periksaPayload, MAKS_TOMBOL_QUICK } from '../lib/tombol-payload.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baca = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** Kategori nyata = nama folder di plugins/ yang berisi berkas .js. */
function kategoriNyata() {
  const dir = path.join(ROOT, 'plugins')
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => {
      const isi = fs.readdirSync(path.join(dir, entry.name), { withFileTypes: true })
      return isi.some(item => item.isFile() && item.name.endsWith('.js'))
    })
    .map(entry => ({ key: entry.name, label: namaKategori(entry.name), total: 1 }))
}

const KATEGORI = kategoriNyata()

function label(button) {
  const params = JSON.parse(button.buttonParamsJson || '{}')
  return params.display_text || params.title || button.name
}

function semuaBaris(payload) {
  return (payload.interactiveMessage.nativeFlowMessage.buttons || [])
    .flatMap(button => {
      if (button.name !== 'single_select') return []
      const params = JSON.parse(button.buttonParamsJson || '{}')
      return (params.sections || []).flatMap(bagian => bagian.rows || [])
    })
}

test('TASK123: tombol .menu lengkap (tools, maker, group, semua menu, owner)', () => {
  const tombol = tombolMenu({ prefix: '.', kategori: KATEGORI, judulMenu: 'Umi Usanagi AI Menu' })
  const native = tombol.map(item => item.nativeFlowInfo
    ? { name: item.nativeFlowInfo.name, buttonParamsJson: item.nativeFlowInfo.paramsJson }
    : { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: item.buttonText.displayText, id: item.buttonId }) })

  assert.equal(native.length, 6, 'enam tombol')
  assert.equal(native[0].name, 'quick_reply', 'tombol pertama quick_reply → batas 10 tombol')
  assert.ok(native.length <= MAKS_TOMBOL_QUICK)

  const teksTombol = native.map(label)
  for (const wajib of ['TOOLS', 'MAKER', 'GROUP']) {
    assert.ok(teksTombol.some(t => t.includes(wajib)), `tombol ${wajib} ada`)
  }
  assert.ok(teksTombol.some(t => t.includes('PILIH MENU')), 'tombol ☰ PILIH MENU ada')
  assert.ok(teksTombol.some(t => t.includes('SEMUA MENU')), 'tombol ▦ SEMUA MENU ada')
  assert.ok(teksTombol.some(t => t.includes('OWNER')), 'tombol owner ada')
  assert.equal(native.filter(t => t.name === 'single_select').length, 2, 'dua daftar pilihan')
})

test('TASK123: pintasan langsung mengirim id .kategori yang ditangani plugin', () => {
  const tombol = tombolMenu({ prefix: '.', kategori: KATEGORI })
  const cepat = tombol.filter(item => item.buttonId && item.buttonId.startsWith('.kategori '))
  assert.deepEqual(cepat.map(item => item.buttonId), [
    '.kategori tools',
    '.kategori maker',
    '.kategori group',
  ], 'id pintasan = prefix + kategori')

  const sumber = baca('plugins/main/usanagi-kategori.js')
  assert.match(sumber, /handler\.command = \/\^\(kategori\|listmenu\)\$\/i/, 'perintah kategori terdaftar')
  assert.match(sumber, /m\.args\[0\]/, 'nama kategori dibaca dari argumen')
})

test('TASK123: ☰ MENU membawa 6 menu utama yang semuanya punya penangan', () => {
  const rows = bagianMenuUtama({ prefix: '.' })[0].rows
  assert.equal(rows.length, PILIHAN_BAWAAN.length)
  assert.deepEqual(rows.map(r => r.id), PILIHAN_BAWAAN.map(o => `.${o.command}`))

  const umiMenu = baca('plugins/main/umi-menu.js')
  const router = baca('lib/umi-menu/router.js')
  for (const opsi of PILIHAN_BAWAAN) {
    const nama = opsi.command
    const dikenal = new RegExp(`\\b${nama}\\b`).test(umiMenu) && new RegExp(`\\b${nama}\\b`).test(router)
    assert.ok(dikenal, `.${nama} dikenali handler & router`)
  }
})

test('TASK123: ▦ SEMUA MENU memuat seluruh kategori nyata, ≤10 baris/bagian', () => {
  assert.ok(KATEGORI.length >= 20, `kategori nyata terbaca (${KATEGORI.length})`)

  const bagian = bagianSemuaMenu({ prefix: '.', kategori: KATEGORI })
  assert.ok(bagian.length <= MAKS_BAGIAN, `bagian ${bagian.length} ≤ ${MAKS_BAGIAN}`)

  const rows = bagian.flatMap(b => b.rows || [])
  for (const b of bagian) {
    assert.ok((b.rows || []).length <= MAKS_BARIS_PER_BAGIAN, `bagian "${b.title}" ≤ 10 baris`)
  }

  const idTerpasang = new Set(rows.map(r => r.id))
  for (const kategori of KATEGORI) {
    assert.ok(idTerpasang.has(`.kategori ${kategori.key}`), `kategori ${kategori.key} ada di tombol`)
  }
  // Batas keras tombol: 10 bagian × 10 baris.
  assert.ok(rows.length <= MAKS_BAGIAN * MAKS_BARIS_PER_BAGIAN, 'total baris masih di batas WhatsApp')
  assert.equal(jumlahBaris(bagian), rows.length)
})

test('TASK123: payload menu lolos pemeriksa dan semua id ber-prefix', () => {
  const payload = bangunInteractive({
    title: 'UMI USANAGI AI',
    subtitle: 'Selamat Pagi Kak',
    body: 'Hai, saya Umi Usanagi AI',
    footer: 'By AlzRiss - Usanagi Umi AI',
    media: null,
    buttons: tombolMenu({ prefix: '.', kategori: KATEGORI }),
  })

  const cek = periksaPayload(payload)
  assert.equal(cek.ok, true, `masalah: ${cek.masalah.join('; ')}`)
  assert.deepEqual(cek.masalah, [])

  const tombol = payload.interactiveMessage.nativeFlowMessage.buttons
  assert.equal(tombol.length, 6)
  for (const row of semuaBaris(payload)) {
    assert.match(row.id, /^\.(kategori |menu|owner)/, `id "${row.id}" ber-prefix`)
    assert.ok(row.title && row.title.length > 0)
  }

  const ids = semuaBaris(payload).map(r => r.id)
  assert.equal(new Set(ids).size, ids.length, 'tidak ada id ganda')
})

test('TASK123: pencarian YouTube berlapis dan tanpa API key placeholder', () => {
  const sumber = baca('lib/scrape/YouTube.js')
  const kodeApi = sumber.split('\n').filter(l => !/^\s*(\*|\/\/)/.test(l)).join('\n')
  assert.doesNotMatch(kodeApi, /YOUR_API_KEY/, 'placeholder key sudah hilang dari kode (bukan komentar)')
  assert.match(sumber, /INNERTUBE_KEY_DEFAULT\s*=\s*'AIza/, 'key publik innertube dipakai')
  assert.match(sumber, /export async function searchYoutube/, 'searchYoutube diekspor')
  assert.match(sumber, /cariInnertube/, 'jalur innertube ada')
  assert.match(sumber, /cariHalamanHasil/, 'jalur halaman /results ada')
  assert.match(sumber, /export function videoIdOf/, 'normalisasi id/link ada')

  const badan = sumber.slice(sumber.indexOf('export async function searchYoutube'))
  const rantai = badan.slice(0, badan.indexOf('\n}\n'))
  assert.match(rantai, /cariInnertube/, 'urutan pertama innertube')
  assert.ok(rantai.indexOf('cariInnertube') < rantai.indexOf('cariHalamanHasil'), 'innertube → halaman hasil')
})

test('TASK123: .ytplay mengunduh lewat lib/youtube-media.js (yt-dlp → api-faa → SaveTube)', () => {
  const plugin = baca('plugins/music/umi-usanagi-ai-ytplay.js')
  assert.match(plugin, /import \{ downloadYoutube \} from '\.\.\/\.\.\/lib\/youtube-media\.js'/, 'impor downloadYoutube')
  assert.match(plugin, /downloadYoutube\(videoUrl, \{ type: 'video', maxBytes: batas, prefix: 'ytplay' \}\)/, 'panggilan unduhan video')
  assert.match(plugin, /async function kirimVideoYoutube/, 'pengirim video')
  assert.match(plugin, /createReadStream\(media\.file\)/, 'berkas dikirim sebagai stream')
  assert.match(plugin, /fs\.remove\(media\.file\)/, 'berkas sementara dibersihkan')

  const media = baca('lib/youtube-media.js')
  assert.match(media, /export async function downloadYoutube/, 'pintu unduhan tunggal')
  assert.match(media, /faaResolve\('video'/, 'cadangan api-faa')
  assert.match(media, /saveTubeLink\(id, 'video'/, 'cadangan SaveTube')
  assert.match(media, /youtube:player_client=/, 'yt-dlp diberi daftar player client')
})

test('TASK123: perintah .ytplay + cadangan pengiriman tetap utuh', () => {
  const plugin = baca('plugins/music/umi-usanagi-ai-ytplay.js')
  assert.match(plugin, /handler\.command\s*=/, 'handler.command ada')
  for (const nama of ['ytplay', 'ytp', 'ytvideo', 'ytvid']) {
    assert.ok(new RegExp(`\\b${nama}\\b`).test(plugin), `perintah ${nama} ada`)
  }
  assert.match(plugin, /searchYoutube/, 'pencarian judul dipakai')
  assert.match(plugin, /sendRemoteMediaFast/, 'cadangan URL langsung ada')
  assert.match(plugin, /buildPlayerHtml/, 'cadangan kartu pemutar ada')
})

test('TASK123: daftar kategori tahan saat pluginStore belum terisi', () => {
  const sumber = baca('lib/awang-menu.js')
  assert.match(sumber, /export function daftarKategoriMenu/, 'helper kategori diekspor')
  assert.match(sumber, /global\.plugins/, 'cadangan global.plugins dipakai')
  assert.match(sumber, /const daftarKategori = daftarKategoriMenu\(\)/, 'sendModernMenu memakai helper')

  const selfTest = baca('plugins/_system/_menu120.js')
  assert.match(selfTest, /daftarKategoriMenu/, 'self-test memakai helper yang sama')
  assert.match(selfTest, /for \(let coba = 0; coba < 8/, 'self-test menunggu store terisi')
})
