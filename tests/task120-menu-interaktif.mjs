/* Task120 — menu rich (prefix ganda) & tombol interaktif.
 *
 * Yang dijaga tes ini:
 *   1. payload SELALU `interactiveMessage` polos — tidak ada bungkus
 *      `viewOnceMessage` / `viewOnce` (penyebab pesan rich tidak bisa dibuka
 *      di HP penerima lain)
 *   2. tombol lama (ButtonV2) dipetakan benar ke tombol native flow
 *   3. daftar pilihan dibatasi 5 bagian / 10 baris (batas aman WhatsApp)
 *   4. maksimal 3 tombol (lebih dari itu ditolak WhatsApp)
 *   5. `..menu` = rich, `.menu` = teks (aturan prefix, tanpa setting tambahan)
 *   6. pemicu regresi: payload gaya lama DITOLAK oleh pemeriksa
 *
 * File ini sengaja hanya memakai modul tanpa dependensi luar, jadi bisa jalan
 * tanpa `npm install`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  bangunInteractive, tombolKeNative, rapikanBagian, periksaPayload,
  MAKS_TOMBOL, MAKS_TOMBOL_QUICK, MAKS_BAGIAN, MAKS_BARIS, MAKS_BARIS_PER_BAGIAN,
} from '../lib/tombol-payload.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baca = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const tombolMenuContoh = () => [
  { buttonText: { displayText: '♕ OWNER BOT' }, buttonId: '.owner', type: 1 },
  {
    buttonText: { displayText: '☰ LIST MENU' },
    buttonId: 'menu',
    type: 1,
    nativeFlowInfo: {
      name: 'single_select',
      paramsJson: JSON.stringify({
        title: 'Menu',
        sections: rapikanBagian([
          { title: 'Menu Utama', rows: [{ header: '📖', title: 'Semua Fitur', description: 'Semua perintah', command: '.allmenu' }] },
        ]),
      }),
    },
  },
]

test('TASK120: interactiveMessage dikirim di level atas (tanpa view-once)', () => {
  const isi = bangunInteractive({
    title: 'UMI USANAGI AI',
    subtitle: 'Selamat pagi Kak',
    body: 'info bot',
    footer: 'By AlzRiss',
    media: { headerType: 4, imageMessage: { mimetype: 'image/jpeg' } },
    buttons: tombolMenuContoh(),
  })

  assert.ok(isi.interactiveMessage, 'ada interactiveMessage')
  assert.equal(isi.viewOnceMessage, undefined)
  assert.equal(isi.viewOnceMessageV2, undefined)
  assert.equal(isi.buttonsMessage, undefined)
  assert.equal(isi.interactiveMessage.viewOnce, undefined)
  assert.equal(isi.interactiveMessage.header.hasMediaAttachment, true)
  assert.ok(isi.interactiveMessage.header.imageMessage)
  assert.equal(isi.interactiveMessage.body.text, 'info bot')
  assert.equal(isi.interactiveMessage.footer.text, 'By AlzRiss')

  const cek = periksaPayload(isi)
  assert.deepEqual(cek.masalah, [])
  assert.equal(cek.ok, true)
  assert.deepEqual(cek.info.jenisTombol, ['quick_reply', 'single_select'])
})

test('TASK120: payload gaya lama (viewOnce / buttonsMessage) ditolak pemeriksa', () => {
  const lama = {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: { body: { text: 'x' }, nativeFlowMessage: { buttons: [] } },
      },
    },
  }
  const cek = periksaPayload(lama)
  assert.equal(cek.ok, false)
  assert.ok(cek.masalah.some(m => m.includes('view-once')))

  const tombolLama = { buttonsMessage: { contentText: 'x', viewOnce: true, buttons: [] } }
  assert.equal(periksaPayload(tombolLama).ok, false)
})

test('TASK120: tombol ButtonV2 lama dipetakan ke native flow', () => {
  const quick = tombolKeNative({ buttonText: { displayText: '♕ OWNER BOT' }, buttonId: '.owner', type: 1 })
  assert.equal(quick.name, 'quick_reply')
  assert.deepEqual(JSON.parse(quick.buttonParamsJson), { display_text: '♕ OWNER BOT', id: '.owner' })

  const pilih = tombolKeNative({
    buttonText: { displayText: '☰ LIST MENU' },
    nativeFlowInfo: { name: 'single_select', paramsJson: { title: 'Menu', sections: [] } },
  })
  assert.equal(pilih.name, 'single_select')
  assert.equal(JSON.parse(pilih.buttonParamsJson).title, 'Menu')

  const url = tombolKeNative({ text: 'Buka', url: 'https://gwenna.my.id' })
  assert.equal(url.name, 'cta_url')
  assert.equal(JSON.parse(url.buttonParamsJson).url, 'https://gwenna.my.id')

  const salin = tombolKeNative({ text: 'Salin', copyCode: 'UMI-2026' })
  assert.equal(salin.name, 'cta_copy')
  assert.equal(JSON.parse(salin.buttonParamsJson).copy_code, 'UMI-2026')

  // Sudah native → dibiarkan
  const native = tombolKeNative({ name: 'quick_reply', buttonParamsJson: '{"display_text":"A","id":".a"}' })
  assert.equal(native.name, 'quick_reply')
})

test('TASK120: daftar pilihan dibatasi per bagian (10 baris) dan id tetap utuh', () => {
  const banyak = Array.from({ length: 9 }, (_, s) => ({
    title: `Bagian ${s + 1}`,
    rows: Array.from({ length: 6 }, (_, r) => ({
      header: 'H',
      title: `Baris ${s + 1}-${r + 1}`,
      description: 'ket',
      command: `.kategori k${s}${r}`,
    })),
  }))
  const hasil = rapikanBagian(banyak)
  assert.ok(hasil.length <= MAKS_BAGIAN, `bagian ${hasil.length} ≤ ${MAKS_BAGIAN}`)
  for (const bagian of hasil) {
    assert.ok(bagian.rows.length <= MAKS_BARIS_PER_BAGIAN, `"${bagian.title}" ${bagian.rows.length} ≤ ${MAKS_BARIS_PER_BAGIAN}`)
  }
  const total = hasil.reduce((n, b) => n + b.rows.length, 0)
  // 9 bagian × 6 baris = 54 baris, dipotong per bagian ke 10 → 54 (semua muat)
  assert.equal(total, Math.min(9 * 6, MAKS_BARIS, MAKS_BARIS_PER_BAGIAN * hasil.length))

  for (const bagian of hasil) {
    for (const baris of bagian.rows) {
      assert.match(baris.id, /^\.kategori k\d+$/, 'id perintah tidak berubah')
      assert.ok(baris.title && baris.title.length <= 60)
    }
  }

  // Baris tanpa id dibuang (tombol mati kalau dikirim)
  const kotor = rapikanBagian([{ title: 'A', rows: [{ title: 'tanpa id' }, { title: 'ok', command: '.ok' }] }])
  assert.equal(kotor[0].rows.length, 1)
  assert.equal(kotor[0].rows[0].id, '.ok')
})

test('TASK120: batas tombol mengikuti aturan WhatsApp Web (3, atau 10 bila pertama quick_reply)', () => {
  const empat = [
    { buttonText: { displayText: 'A' }, buttonId: '.a' },
    { buttonText: { displayText: 'B' }, buttonId: '.b' },
    { buttonText: { displayText: 'C' }, buttonId: '.c' },
    { buttonText: { displayText: 'D' }, buttonId: '.d' },
  ]
  // tombol pertama quick_reply → semua 4 dipertahankan
  const isi = bangunInteractive({ body: 'x', buttons: empat })
  assert.equal(isi.interactiveMessage.nativeFlowMessage.buttons.length, 4)
  assert.equal(MAKS_TOMBOL, 3)
  assert.equal(MAKS_TOMBOL_QUICK, 10)

  // tombol pertama BUKAN quick_reply → dipotong jadi 3
  const bukanQuick = [
    { name: 'single_select', buttonParamsJson: JSON.stringify({ title: 'x', sections: [{ title: 'a', rows: [{ id: '.a', title: 'A' }] }] }) },
    ...empat,
  ]
  const isi2 = bangunInteractive({ body: 'x', buttons: bukanQuick })
  assert.equal(isi2.interactiveMessage.nativeFlowMessage.buttons.length, MAKS_TOMBOL)
})

test('TASK120: builder tidak lagi memakai view-once / buttonsMessage', () => {
  const sumber = baca('lib/awang-tombol.js')
  // Hanya boleh muncul di komentar penjelasan, bukan di kode.
  const kode = sumber.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.ok(!/viewOnceMessage\s*:/.test(kode), 'tidak ada viewOnceMessage di kode')
  assert.ok(!/viewOnce\s*:\s*true/.test(kode), 'tidak ada viewOnce: true di kode')
  assert.ok(!/buttonsMessage\s*:/.test(kode), 'tidak ada buttonsMessage di kode')
  assert.match(kode, /payload\(\)\s*\{/, 'ButtonV2 punya payload() untuk diperiksa dulu')
  assert.match(kode, /bangunInteractive/, 'memakai pembangun payload bersama')
})

test('TASK120: aturan prefix — "..menu" rich, ".menu" teks', () => {
  const plugin = baca('plugins/main/umi-menu.js')
  assert.match(plugin, /const rich = m\.__richMenu === true\s*\n/, 'rich tidak lagi bergantung setelan style')
  assert.ok(!/const rich = m\.__richMenu === true && richEnabled\(\)/.test(plugin), 'gerbang style dilepas')
  // Task121/122: '.menu' = teks + tombol, '..menu' = kartu rich
  assert.match(plugin, /if \(command === 'menu'\) \{\s*\n\s*return rich\s*\n\s*\? kirimMenuLive/, '..menu → kartu rich')
  assert.match(plugin, /: sendModernMenu\(conn, m, prefix\)/, '.menu → tombol interaktif')

  const menu = baca('lib/awang-menu.js')
  assert.match(menu, /export async function sendModernMenu/, 'sendModernMenu tersedia')
  assert.match(menu, /♕ OWNER BOT/, 'tombol Owner Bot ada')
  assert.match(menu, /☰ LIST MENU/, 'tombol daftar menu ada')
  assert.match(menu, /single_select/, 'daftar memakai single_select')
  assert.match(menu, /buildFullMenuText/, 'ada cadangan menu teks kalau tombol ditolak')
})

test('TASK120: menu rich memakai foto header, bukan latar abu-abu', () => {
  const menu = baca('lib/awang-menu.js')
  assert.match(menu, /siapkanVisualMenu/, 'penyiapan foto header')
  assert.match(menu, /assets\/menu\/umi-menu-bg\.jpg/, 'aset foto lokal dipakai lebih dulu daripada video 2,5 MB')
  assert.match(menu, /prepareWAMessageMedia/, 'foto diunggah lewat prepareWAMessageMedia')
  assert.match(menu, /cacheUnggah/, 'unggahan di-cache supaya menu tidak lemot')
})
