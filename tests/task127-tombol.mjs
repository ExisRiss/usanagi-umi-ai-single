/**
 * Tes Task127 — tombol menu yang tidak merespons + rich message.
 *
 * Yang diuji:
 *   1. `label-action.js` — label tombol dari WhatsApp dipetakan ke aksi menu
 *      (penyebab "Owner Menu ga respon").
 *   2. `plugin-command-match.js` — regex perintah diuji UTUH, jadi `menu_owner`
 *      dan `menu_all` dikenali (versi lama memecah dengan split('|') → gagal).
 *   3. `rich-capability.js` — default belum mampu (teks ikut dikirim), bisa
 *      ditandai mampu setelah pengguna menekan tombol dari kartu.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { actionFromLabel, normalisasiLabel } = await import('../lib/umi-menu/label-action.js')
const { bangunDaftarPerintah, cocokPerintah } = await import('../lib/plugin-command-match.js')

/* ---------------- 1. label tombol ---------------- */

test('label "All Menu" + deskripsi → menu_all', () => {
  const hasil = actionFromLabel('All Menu\nseluruh perintah semua kategori, dibagi per halaman')
  assert.deepEqual(hasil, { action: 'menu_all', page: null })
})

test('label "Owner Menu" + deskripsi → menu_owner (bug utama)', () => {
  const hasil = actionFromLabel('Owner Menu\nperintah khusus owner: setelan, backup, kontrol bot')
  assert.deepEqual(hasil, { action: 'menu_owner', page: null })
})

test('label dengan ikon & emoji tetap dikenali', () => {
  assert.equal(actionFromLabel('👑 OWNER MENU\nkhusus owner').action, 'menu_owner')
  assert.equal(actionFromLabel('🗂️ All Menu').action, 'menu_all')
  assert.equal(actionFromLabel('🎮 Game Menu\nmain game').action, 'menu_game')
  assert.equal(actionFromLabel('🛠 Tools Menu').action, 'menu_tools')
  assert.equal(actionFromLabel('👥 Group Menu').action, 'menu_group')
  assert.equal(actionFromLabel('🔄 Refresh Status').action, 'menu_refresh')
  assert.equal(actionFromLabel('☰ Pilih Menu').action, 'menu_back')
})

test('label dengan karakter arah tak terlihat tetap dikenali', () => {
  assert.equal(actionFromLabel('\u200eAll Menu\u200e\nseluruh perintah').action, 'menu_all')
})

test('teks biasa bukan label menu → null (tidak dianggap tombol)', () => {
  assert.equal(actionFromLabel('halo apa kabar'), null)
  assert.equal(actionFromLabel('menu'), null)
  assert.equal(actionFromLabel(''), null)
  assert.equal(actionFromLabel(null), null)
})

test('normalisasiLabel membuang emoji, baris kedua, dan spasi ganda', () => {
  assert.equal(normalisasiLabel('🗂️  All   Menu \n deskripsi'), 'all menu')
  assert.equal(normalisasiLabel(' OWNER  MENU '), 'owner menu')
})

/* ---------------- 2. pencocokan perintah ---------------- */

const POLA_MENU = /^(umimenu|lmenu|menu|menu_all(?:_\d+)?|menu_(?:owner|group|game|tools|refresh))$/i

test('regex berkelompok: menu_owner & menu_all dikenali', () => {
  const daftar = bangunDaftarPerintah({ 'main/umi-menu.js': { command: POLA_MENU } })
  for (const id of ['menu_owner', 'menu_all', 'menu_all_2', 'menu_group', 'menu_game', 'menu_tools', 'menu_refresh', 'menu']) {
    assert.equal(cocokPerintah(daftar, id), true, `${id} harus dikenali`)
  }
  assert.equal(cocokPerintah(daftar, 'menu_asing'), false)
  assert.equal(cocokPerintah(daftar, 'bukan_perintah'), false)
})

test('ID dengan prefix/spasi tetap dikenali', () => {
  const daftar = bangunDaftarPerintah({ a: { command: POLA_MENU } })
  assert.equal(cocokPerintah(daftar, '.menu_owner'), true)
  assert.equal(cocokPerintah(daftar, '  menu_all 1'), true)
})

test('perintah berbentuk array & string biasa', () => {
  const daftar = bangunDaftarPerintah({
    a: { command: ['ping', 'speed'] },
    b: { command: 'allmenu' },
    c: { command: /^(menu|list)$/i },
  })
  assert.equal(cocokPerintah(daftar, 'ping'), true)
  assert.equal(cocokPerintah(daftar, 'allmenu'), true)
  assert.equal(cocokPerintah(daftar, 'list'), true)
  assert.equal(cocokPerintah(daftar, 'tidakada'), false)
})

test('plugin rusak tidak membuat pencocokan melempar', () => {
  const rusak = { command: { tipo: 'aneh' }, help: 5 }
  const daftar = bangunDaftarPerintah({ rusak, baik: { command: 'ping' } })
  assert.equal(cocokPerintah(daftar, 'ping'), true)
  assert.equal(cocokPerintah(daftar, 'apa'), false)
})

/* ---------------- 3. kemampuan rich ---------------- */

function siapkanAkar() {
  const akar = fs.mkdtempSync(path.join(os.tmpdir(), 'umi-rich-'))
  fs.mkdirSync(path.join(akar, 'data'), { recursive: true })
  return akar
}

test('richMampu: default false untuk chat baru, true setelah ditandai', async () => {
  const akar = siapkanAkar()
  const asli = process.cwd()
  process.chdir(akar)
  try {
    const modul = await import(`../lib/rich-capability.js?akar=${Date.now()}`)
    assert.equal(modul.richMampu('628111@c.us'), false, 'chat baru belum tentu mampu')
    modul.tandaiRichMampu('628111@c.us')
    assert.equal(modul.richMampu('628111@c.us'), true)
    const isi = JSON.parse(fs.readFileSync(path.join(akar, 'data', 'rich-capability.json'), 'utf8'))
    assert.equal(isi['628111@c.us'], true)
  } finally {
    process.chdir(asli)
    fs.rmSync(akar, { recursive: true, force: true })
  }
})

test('konfirmasiKartuTampil hanya menandai bila kartu baru dikirim', async () => {
  const akar = siapkanAkar()
  const asli = process.cwd()
  process.chdir(akar)
  try {
    const modul = await import(`../lib/rich-capability.js?akar=${Date.now()}b`)
    assert.equal(modul.konfirmasiKartuTampil('628222@c.us'), false, 'belum ada kartu')
    modul.catatKartuDikirim('628222@c.us')
    assert.equal(modul.konfirmasiKartuTampil('628222@c.us'), true, 'kartu tampil → ditandai')
    assert.equal(modul.richMampu('628222@c.us'), true)
    assert.equal(modul.konfirmasiKartuTampil('628222@c.us'), false, 'sekali saja')
  } finally {
    process.chdir(asli)
    fs.rmSync(akar, { recursive: true, force: true })
  }
})

test('env UMI_RICH_ALL memaksa hasil', async () => {
  const modul = await import(`../lib/rich-capability.js?akar=${Date.now()}c`)
  process.env.UMI_RICH_ALL = '1'
  assert.equal(modul.richMampu('apa@s.whatsapp.net'), true)
  process.env.UMI_RICH_ALL = '0'
  assert.equal(modul.richMampu('apa@s.whatsapp.net'), false)
  delete process.env.UMI_RICH_ALL
})
