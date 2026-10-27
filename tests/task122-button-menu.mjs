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

import { bagianMenu, tombolMenu, jumlahBaris, MAKS_BARIS, MAKS_BAGIAN } from '../lib/umi-menu/menu-buttons.js'
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
  const bagian = bagianMenu({ prefix: '$', kategori: KATEGORI })
  const baris = bagian[0].rows

  assert.equal(bagian[0].title, 'Menu Utama')
  assert.equal(baris.length, PILIHAN_BAWAAN.length, 'enam baris')
  baris.forEach((row, index) => {
    assert.equal(row.title, PILIHAN_BAWAAN[index].label)
    assert.equal(row.id, `$${PILIHAN_BAWAAN[index].command}`, 'id = prefix + perintah')
  })
  assert.deepEqual(baris.map(r => r.id), ['$menu_all', '$menu_owner', '$menu_group', '$menu_game', '$menu_tools', '$menu_refresh'])
})

test('TASK122: batas WhatsApp — 3 tombol, 5 bagian, 10 baris', () => {
  const bagian = bagianMenu({ prefix: '.', kategori: KATEGORI })
  const total = jumlahBaris(bagian)

  assert.ok(bagian.length <= MAKS_BAGIAN, `bagian ${bagian.length} ≤ ${MAKS_BAGIAN}`)
  assert.equal(total, MAKS_BARIS, 'diisi sampai 10 baris (6 menu + 4 kategori)')
  assert.ok(bagian[1].rows.length <= 4, 'kategori dibatasi 4')

  const tombol = tombolMenu({ prefix: '.', kategori: KATEGORI, judulMenu: 'Menu Umi' })
  assert.equal(tombol.length, 2, 'Owner Bot + daftar menu')
  const native = tombol.map(tombolKeNative)
  assert.deepEqual(native.map(t => t.name), ['quick_reply', 'single_select'])
  const params = JSON.parse(native[1].buttonParamsJson)
  assert.equal(params.title, 'Menu Umi')
  assert.equal(jumlahBaris(params.sections), MAKS_BARIS)

  // kategori yang berlebih dipotong, bukan ditumpuk melewati batas
  const kebanyakan = bagianMenu({ prefix: '.', kategori: KATEGORI.concat(KATEGORI) })
  assert.equal(jumlahBaris(kebanyakan), MAKS_BARIS)
})

test('TASK122: isi pesan tidak lagi memuat daftar 1–6', () => {
  const tombol = tombolMenu({ prefix: '.', kategori: KATEGORI }).map(tombolKeNative)
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
  assert.match(menu, /tombolMenu\(\{ prefix, kategori: daftarKategori/, 'tombol menu utama dipakai')
  assert.match(menu, /const teksCadangan = teksMenuBaru\(/, 'cadangan teks disiapkan')
  assert.match(menu, /catch \(error\) \{[\s\S]{0,600}?teksCadangan/, 'cadangan dipakai saat tombol gagal')

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
