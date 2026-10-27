/* Task125 — `.allmenu` asli (dengan animasi loading) + tombol menu berikon
 * dan berdeskripsi.
 *
 * Keluhan owner:
 *   "Benerin kenapa allmenu nya gitu, ganti pake allmenu yang asli yang ada
 *    loading nya. … button di menu yang pilih mau nampilin menu apa itu kasih
 *    icon agar semua user bisa tau fungsi nya dan deskripsi nya."
 *
 * Yang dijaga tes ini:
 *   1. `.allmenu` memakai bar progres loading (5 frame) lalu mengirim SATU pesan
 *      (bukan 35 halaman teks seperti Task106)
 *   2. isi allmenu tetap lengkap: semua kategori & perintah dari global.plugins
 *   3. caption tetap di bawah batas WhatsApp, dan pakai trik read-more
 *   4. setiap baris tombol menu punya IKON + DESKRIPSI
 *   5. pintasan cepat (tools/maker/group/owner) juga berikon
 *   6. payload tombol tetap sah menurut periksaPayload
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  tombolMenu, bagianMenuUtama, bagianSemuaMenu,
  ikonKategori, deskripsiKategori, IKON_KATEGORI,
} from '../lib/umi-menu/menu-buttons.js'
import { bangunInteractive, periksaPayload } from '../lib/tombol-payload.js'
import {
  kumpulkanKategori, bangunTeksAllMenu, susunCaption, teksLoading, FRAMES,
  BATAS_CAPTION,
} from '../plugins/main/usanagi-allmenu.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baca = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const KATEGORI = [
  { key: 'tools', total: 240 },
  { key: 'maker', total: 90 },
  { key: 'group', total: 20 },
  { key: 'game', total: 120 },
  { key: 'ai', total: 60 },
  { key: 'kategori-baru', total: 3 },
]

function pluginPalsu() {
  const buat = (tags, help, extra = {}) => Object.assign(() => {}, { tags, help, ...extra })
  return {
    'main/menu.js': buat(['main'], ['menu', 'ping']),
    'tools/stiker.js': buat(['tools'], ['stiker', 'toimg'], { limit: true }),
    'tools/prem.js': buat(['tools'], ['brainly'], { premium: true }),
    'group/kick.js': buat(['group'], ['kick <nomor>']),
    'off/mati.js': buat(['main'], ['tidakaktif'], { disabled: true }),
    'kosong/tanpa-tag.js': buat([], ['x']),
  }
}

test('TASK125: teks loading = bar progres 5 frame seperti versi asli', () => {
  assert.equal(FRAMES.length, 5)
  assert.deepEqual(FRAMES.map(f => f.percent), [15, 35, 60, 85, 100])
  const teks = teksLoading({ percent: 35, text: 'membaca pikiran user...' })
  assert.match(teks, /AlzRiss Loading/)
  assert.match(teks, /\[■■■□□□□□□□\] 35%/)
  assert.match(teks, /membaca pikiran user/)
})

test('TASK125: allmenu sumbernya memakai loading, bukan 35 halaman teks', () => {
  const sumber = baca('plugins/main/usanagi-allmenu.js')
  assert.match(sumber, /export async function loadingAlzRiss/, 'fungsi loading ada')
  assert.match(sumber, /protocolMessage: \{ key, type: 14, editedMessage/, 'jalur utama edit protocolMessage')
  assert.match(sumber, /sendMessage\(chat, \{ text: teks, edit: key \}/, 'cadangan lewat API edit')
  assert.doesNotMatch(sumber, /MAX_CHUNK|splitMenuText|bagian \$\{index \+ 1\}/, 'tidak lagi membagi jadi banyak pesan')
  assert.match(sumber, /caption/, 'menu dikirim sebagai caption satu pesan')
})

test('TASK125: isi allmenu lengkap dari plugin yang termuat', () => {
  const lama = global.plugins
  global.plugins = pluginPalsu()
  try {
    const kategori = kumpulkanKategori('$')
    assert.deepEqual(kategori.map(k => k.tag), ['group', 'main', 'tools'], 'kategori terurut & plugin mati dibuang')
    assert.deepEqual(kategori.find(k => k.tag === 'tools').perintah, ['$brainly Ⓟ', '$stiker Ⓛ', '$toimg Ⓛ'])

    const hasil = bangunTeksAllMenu({ prefix: '$', name: 'Risky', daftar: kategori, batas: 60000 })
    assert.equal(hasil.kategori, 3)
    assert.equal(hasil.perintah, 6)
    assert.equal(hasil.dipotong, false)
    assert.match(hasil.teks, /❖━━━━━━\[ \*GROUP\* \]━━━━━━❖/)
    assert.match(hasil.teks, /╠➺ \$kick <nomor>/)
    assert.match(hasil.teks, /Risky/, 'nama pengguna masuk')
    assert.match(hasil.teks, /\$brainly Ⓟ/, 'penanda premium ada')
    assert.match(hasil.teks, /\$stiker Ⓛ/, 'penanda limit ada')
  } finally {
    global.plugins = lama
  }
})

test('TASK125: batas pesan dijaga TANPA ada kategori yang hilang', () => {
  const banyak = Array.from({ length: 44 }, (_, i) => ({
    tag: `kategori${i}`,
    perintah: Array.from({ length: 54 }, (_, j) => `.perintah${i}_${j} <argumen panjang>`),
  }))
  const hasil = bangunTeksAllMenu({ prefix: '.', daftar: banyak, batas: BATAS_CAPTION })

  assert.equal(hasil.gaya, 'padat', 'daftar panjang dirapatkan, bukan dipotong')
  assert.equal(hasil.kategori, 44, 'semua kategori tetap ada')
  assert.equal(hasil.perintah, 44 * 54, 'semua perintah tetap ada')
  assert.ok(hasil.byte <= BATAS_CAPTION, `byte ${hasil.byte} ≤ ${BATAS_CAPTION}`)
  assert.equal(hasil.dipotong, false, 'tidak ada yang dibuang')

  const caption = susunCaption(hasil.teks, 'https://contoh.id')
  assert.ok(caption.startsWith('https://contoh.id'), 'tautan website di depan')
  assert.ok(caption.includes(String.fromCharCode(8206)), 'trik read-more dipakai')
  assert.ok(Buffer.byteLength(caption, 'utf8') < 65536, `caption ${Buffer.byteLength(caption, 'utf8')} byte < batas WhatsApp`)

  // Daftar pendek tetap memakai gaya ASLI: satu perintah per baris.
  const pendek = bangunTeksAllMenu({ prefix: '.', daftar: [{ tag: 'tools', perintah: ['.stiker', '.toimg'] }], batas: BATAS_CAPTION })
  assert.equal(pendek.gaya, 'baris')
  assert.match(pendek.teks, /╠➺ \.stiker/)
})

test('TASK125: rincian plugin asli di repo juga bisa dibaca (tanpa global.plugins)', () => {
  const hasil = bangunTeksAllMenu({ prefix: '.', daftar: [{ tag: 'demo', perintah: ['.satu', '.dua'] }] })
  assert.equal(hasil.kategori, 1)
  assert.equal(hasil.perintah, 2)
  assert.match(hasil.teks, /Usanagi Umi AI|𝐔𝐬𝐚𝐧𝐚𝐠𝐢/)
})

test('TASK125: setiap baris menu punya ikon + deskripsi', () => {
  const utama = bagianMenuUtama({ prefix: '.' })[0]
  assert.equal(utama.rows.length, 6)
  for (const baris of utama.rows) {
    assert.ok(baris.header && baris.header !== '▸', `ikon baris ${baris.title}`)
    assert.ok(baris.description.length >= 15, `deskripsi baris ${baris.title}`)
    assert.match(baris.id, /^\.menu_/)
  }
  assert.equal(utama.rows.map(r => r.header).join('').includes('👑'), true, 'owner berikon mahkota')

  const semua = bagianSemuaMenu({ prefix: '.', kategori: KATEGORI }).flatMap(b => b.rows)
  assert.equal(semua.length, KATEGORI.length)
  for (const baris of semua) {
    assert.ok(baris.header && baris.header !== '▦', `ikon kategori ${baris.title}`)
    assert.ok(baris.description.length >= 10, `deskripsi kategori ${baris.title}`)
  }
  assert.equal(semua[0].header, '🛠️')
  assert.match(semua[0].description, /240 perintah/)
  assert.match(semua[0].description, /konversi|utilitas/, 'fungsi kategori dijelaskan')
  assert.equal(semua.find(b => b.id.includes('kategori-baru')).header, '📁', 'kategori baru tetap dapat ikon')
})

test('TASK125: ikon & deskripsi tersedia untuk semua kategori nyata di repo', () => {
  const folder = path.join(ROOT, 'plugins')
  const nyata = fs.readdirSync(folder, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
  const tanpaIkon = nyata.filter(key => ikonKategori(key) === '📁')
  assert.deepEqual(tanpaIkon, [], `kategori tanpa ikon: ${tanpaIkon.join(', ')}`)
  assert.ok(Object.keys(IKON_KATEGORI).length >= 30)

  const deskripsi = deskripsiKategori('game', 120)
  assert.match(deskripsi, /120 perintah/)
  assert.match(deskripsi, /game|taruhan/)
})

test('TASK125: tombol cepat berikon & payload tetap sah', () => {
  const tombol = tombolMenu({ prefix: '.', kategori: KATEGORI })
  const label = tombol.map(t => t.nativeFlowInfo
    ? JSON.parse(t.nativeFlowInfo.paramsJson).title
    : t.buttonText.displayText)

  assert.deepEqual(label.slice(0, 3), ['🛠️ TOOLS', '🎨 MAKER', '👥 GROUP'])
  assert.ok(label.includes('☰ PILIH MENU'))
  assert.ok(label.includes('▦ SEMUA MENU'))
  assert.ok(label.includes('👑 OWNER BOT'))

  const cek = periksaPayload(bangunInteractive({ title: 'Umi', body: 'menu', buttons: tombol }))
  assert.deepEqual(cek.masalah, [])
})
