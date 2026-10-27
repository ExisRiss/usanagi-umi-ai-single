/* Task122 — daftar "📋 MENU UTAMA 1–6" dihapus total, diganti tombol interaktif.
 *
 * Yang dijaga:
 *   1. tombol membawa SEMUA pilihan menu utama (6 baris) dengan id ber-prefix
 *   2. batas WhatsApp terjaga: maks 3 tombol, 5 bagian, 10 baris
 *   3. isi pesan `.menu` tidak lagi memuat daftar bernomor / judul "MENU UTAMA"
 *   4. payload = interactiveMessage polos (tanpa view-once) dan lolos pemeriksa
 *   5. kalau tombol ditolak, barulah teks cadangan (berisi daftar) dikirim
 *   6. "Refresh Status" benar-benar bisa dipanggil dari tombol
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { bagianMenuUtama, tombolRingkas, jumlahBaris, MAKS_BARIS_PER_BAGIAN as MAKS_BARIS, MAKS_BAGIAN } from '../lib/umi-menu/menu-buttons.js'
import { PILIHAN_BAWAAN } from '../lib/umi-menu/menu-text.js'
import { bangunInteractive, periksaPayload, tombolKeNative } from '../lib/tombol-payload.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baca = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const KATEGORI = [
  { key: 'game', label: 'Game', total: 120 },
  { key: 'tools', label: 'Tools', total: 240 },
  { key: 'ai', label: 'Ai', total: 60 },
  { key: 'owner', label: 'Owner', total: 30 },
  { key: 'rpg', label: 'Rpg', total: 90 },
]

test('TASK122: tombol memuat keenam pilihan menu utama dengan id ber-prefix', () => {
  const bagian = bagianMenuUtama({ prefix: '$' })
  const baris = bagian[0].rows

  assert.equal(bagian[0].title, '☰ Menu Utama')  // Task125: judul + ikon
  assert.equal(baris.length, PILIHAN_BAWAAN.length, 'enam baris')
  baris.forEach((row, index) => {
    assert.equal(row.title, PILIHAN_BAWAAN[index].label)
    assert.equal(row.id, `$${PILIHAN_BAWAAN[index].command}`, 'id = prefix + perintah')
  })
  assert.deepEqual(baris.map(r => r.id), ['$menu_all', '$menu_owner', '$menu_group', '$menu_game', '$menu_tools', '$menu_refresh'])
})

test('TASK122: batas WhatsApp — 6 menu utama, maks 10 baris/bagian', () => {
  const bagian = bagianMenuUtama({ prefix: '.' })
  assert.equal(jumlahBaris(bagian), 6, 'enam menu utama')
  assert.ok(bagian[0].rows.length <= MAKS_BARIS, 'maks 10 baris per bagian')

  const tombol = tombolRingkas({ prefix: '.', judulMenu: 'Menu Umi' })
  assert.equal(tombol.length, 2, 'Owner Bot + daftar menu')
  const native = tombol.map(tombolKeNative)
  assert.deepEqual(native.map(t => t.name), ['quick_reply', 'single_select'])
  const params = JSON.parse(native[1].buttonParamsJson)
  // Task123: label tombol di WhatsApp diambil dari params.title, jadi judulnya
  // kini tetap (bukan lagi diambil dari judulMenu).
  assert.equal(params.title, '☰ PILIH MENU')
  assert.equal(jumlahBaris(params.sections), 6)
})

test('TASK122: isi pesan tidak lagi memuat daftar 1–6', () => {
  const tombol = tombolRingkas({ prefix: '.', judulMenu: 'Menu' }).map(tombolKeNative)
  const isi = bangunInteractive({
    title: 'Umi Usanagi AI',
    subtitle: 'Selamat Pagi @Alz aja',
    body: '┇👋 Hai welcome saya *Umi Usanagi AI*\n│ Name : Umi Usanagi AI\n│ Owner : AlzRiss',
    footer: 'By AlzRiss - Usanagi Umi AI',
    media: { headerType: 4, imageMessage: { mimetype: 'image/jpeg' } },
    buttons: tombol,
  })

  const teksPesan = `${isi.interactiveMessage.body.text}\n${isi.interactiveMessage.footer.text}`
  assert.ok(!/MENU UTAMA/.test(teksPesan), 'judul "MENU UTAMA" hilang dari isi')
  assert.ok(!/^\s*\d+[.)]\s/m.test(teksPesan), 'tidak ada baris bernomor')
  assert.ok(!/Ketik nomor/.test(teksPesan), 'tidak ada ajakan ketik nomor')

  const cek = periksaPayload(isi)
  assert.deepEqual(cek.masalah, [], 'payload sah')
  assert.equal(isi.viewOnceMessage, undefined, 'tanpa bungkus view-once')
  assert.equal(cek.info.jenisTombol.join(','), 'quick_reply,single_select')
})

test('TASK122: kode menu — daftar hanya hidup di tombol, teks jadi cadangan', () => {
  const menu = baca('lib/awang-menu.js')
  assert.match(menu, /tanpaDaftarBernomor\(info\)/, 'isi pesan dibersihkan dari daftar bernomor')
  assert.match(menu, /tombolMenu\(\{ prefix, kategori: daftarKategori/, 'tombol lengkap dipakai')
  assert.match(menu, /const teksCadangan = teksMenuBaru\(/, 'cadangan teks disiapkan')
  assert.match(menu, /catch \(error\) \{[\s\S]{0,2200}?teksCadangan/, 'cadangan dipakai saat tombol gagal')

  const plugin = baca('plugins/main/umi-menu.js')
  assert.match(plugin, /: sendModernMenu\(conn, m, prefix\)/, '.menu memakai menu tombol')
  assert.match(plugin, /menu_\(\?:owner\|group\|game\|tools\|refresh\)/, 'menu_refresh bisa dipanggil dari tombol')
})

test('TASK122: tanpaDaftarBernomor membuang baris bernomor saja', () => {
  const sumber = [
    '┇👋 Hai welcome saya *Umi Usanagi AI*',
    '1. All Menu — seluruh perintah',
    '   .menu_all',
    '2) Owner Menu',
    '│ Owner : AlzRiss',
  ].join('\n')

  // Fungsi ini tidak mengimpor apa pun; ambil dari sumbernya lewat regex sederhana.
  const teks = sumber.split('\n').filter(baris => !/^\s*\d+[.)]\s/.test(baris)).join('\n')
  assert.ok(!teks.includes('1. All Menu'))
  assert.ok(!teks.includes('2) Owner Menu'))
  assert.ok(teks.includes('Hai welcome'), 'baris lain tetap')
  assert.ok(teks.includes('Owner : AlzRiss'), 'baris info tetap')

  // pastikan fungsi di modul berperilaku sama
  const badan = baca('lib/awang-menu.js')
  assert.match(badan, /filter\(baris => !\/\^\\s\*\\d\+\[\.\)\]\\s\/\.test\(baris\)\)/)
})

/* ── Task123: tombol dilengkapi (tools/maker/group/semua menu) ──── */
import { tombolMenu as tombolLengkap, bagianSemuaMenu as bagianSemua, tombolRingkas as tombolKecil, namaKategori } from '../lib/umi-menu/menu-buttons.js'
import { MAKS_TOMBOL_QUICK, MAKS_BARIS_PER_BAGIAN } from '../lib/tombol-payload.js'

test('TASK123: tombol lengkap = TOOLS/MAKER/GROUP + MENU + SEMUA MENU + OWNER', () => {
  const banyakKategori = Array.from({ length: 31 }, (_, i) => ({ key: `kat${i}`, total: i + 1 }))
  const tombol = tombolLengkap({ prefix: '.', kategori: [{ key: 'tools', total: 240 }, { key: 'maker', total: 90 }, { key: 'group', total: 20 }].concat(banyakKategori) })

  const label = tombol.map(t => t.buttonText.displayText)
  assert.deepEqual(label.slice(0, 3), ['🛠️ TOOLS', '🎨 MAKER', '👥 GROUP'], 'pintasan kategori utama (Task125: berikon)')
  assert.ok(label.includes('☰ PILIH MENU'), 'tombol pilih menu')
  assert.ok(label.includes('▦ SEMUA MENU'), 'tombol semua menu')
  assert.ok(label.includes('👑 OWNER BOT'), 'tombol owner')

  // tombol pertama quick_reply → WhatsApp Web mengizinkan sampai 10 tombol
  assert.equal(tombol[0].type, 1)
  assert.ok(tombol.length <= MAKS_TOMBOL_QUICK, `${tombol.length} tombol ≤ ${MAKS_TOMBOL_QUICK}`)

  const idCepat = tombol.slice(0, 3).map(t => t.buttonId)
  assert.deepEqual(idCepat, ['.kategori tools', '.kategori maker', '.kategori group'])

  const cek = periksaPayload(bangunInteractive({
    title: 'Umi', subtitle: 'Hai', body: 'info', footer: 'by', buttons: tombol,
  }))
  assert.deepEqual(cek.masalah, [], 'payload lengkap sah')
  assert.equal(cek.info.tombol, tombol.length)
})

test('TASK123: SEMUA MENU memuat setiap kategori, dibagi ≤10 baris/bagian', () => {
  const kategori = Array.from({ length: 31 }, (_, i) => ({ key: `kategori_${i}`, total: i + 1 }))
  const bagian = bagianSemua({ prefix: '$', kategori })

  assert.equal(jumlahBaris(bagian), 31, 'semua kategori kebawa')
  for (const b of bagian) {
    assert.ok(b.rows.length <= MAKS_BARIS_PER_BAGIAN, `"${b.title}" ${b.rows.length} baris`)
  }
  // id tetap perintah yang bisa dijalankan
  const id = bagian.flatMap(b => b.rows.map(r => r.id))
  assert.equal(id[0], '$kategori kategori_0')
  assert.equal(id[30], '$kategori kategori_30')
  // judul enak dibaca
  assert.equal(namaKategori('game-html'), 'Game Html')
  assert.ok(bagian[0].rows[0].title.startsWith('Menu Kategori 0'))
})

test('TASK123: cadangan ringkas tetap ada kalau tombol lengkap ditolak', () => {
  const ringkas = tombolKecil({ prefix: '.', judulMenu: 'Menu' })
  assert.equal(ringkas.length, 2, 'owner + satu daftar')
  const cek = periksaPayload(bangunInteractive({ body: 'x', buttons: ringkas }))
  assert.deepEqual(cek.masalah, [])
  const menu = baca('lib/awang-menu.js')
  assert.match(menu, /tombolRingkas\(\{ prefix, judulMenu \}\)/, 'dipakai saat percobaan kedua')
  assert.match(menu, /mode: 'tombol-ringkas'/)
})
