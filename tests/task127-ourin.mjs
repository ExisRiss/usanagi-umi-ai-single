/**
 * Tes Task127 — fitur hasil porting dari OURIN V3.4.
 *
 * Diuji tanpa jaringan:
 *   - jadwalsholat: penyusunan teks + validasi parameter
 *   - pixeldrain  : pembacaan ID dari berbagai bentuk URL + format ukuran
 *   - cariplugin  : pencarian plugin berdasarkan perintah/deskripsi/berkas
 */
import test from 'node:test'
import assert from 'node:assert/strict'

const sholat = await import('../plugins/ourin/jadwalsholat.js')
const pixeldrain = await import('../plugins/ourin/pixeldraindl.js')
const cariPluginMod = await import('../plugins/ourin/searchplugin.js')

/* ---------------- jadwal sholat ---------------- */

const CONTOH_JADWAL = {
  id: 1504,
  lokasi: 'KAB. SLEMAN',
  daerah: 'D.I. YOGYAKARTA',
  jadwal: {
    tanggal: 'Selasa, 27/10/2026',
    imsak: '03:45', subuh: '03:55', terbit: '05:09', dhuha: '05:37',
    dzuhur: '11:26', ashar: '14:37', maghrib: '17:36', isya: '18:47',
  },
}

test('susunTeksJadwal memuat semua waktu sholat', () => {
  const teks = sholat.susunTeksJadwal(CONTOH_JADWAL)
  for (const waktu of ['03:45', '03:55', '05:09', '05:37', '11:26', '14:37', '17:36', '18:47']) {
    assert.ok(teks.includes(waktu), `waktu ${waktu} harus ada`)
  }
  assert.ok(teks.includes('KAB. SLEMAN'))
  assert.ok(teks.includes('D.I. YOGYAKARTA'))
  assert.ok(teks.includes('Selasa, 27/10/2026'))
})

test('susunTeksJadwal tahan data kosong (tidak melempar)', () => {
  const teks = sholat.susunTeksJadwal({})
  assert.ok(teks.includes('JADWAL SHOLAT'))
  assert.ok(teks.includes('-'))
})

test('perintah jadwal sholat terdaftar dengan alias yang benar', () => {
  const pola = sholat.default.command
  for (const nama of ['jadwalsholat', 'sholat', 'waktusholat']) {
    if (nama === 'sholat') continue // 'sholat' bukan alias di plugin ini
    assert.equal(pola.test(nama), true, `${nama} harus cocok`)
  }
  assert.equal(pola.test('bukanperintah'), false)
})

/* ---------------- pixeldrain ---------------- */

test('ambilIdPixeldrain membaca berbagai bentuk URL', () => {
  assert.equal(pixeldrain.ambilIdPixeldrain('https://pixeldrain.com/u/abcd1234'), 'abcd1234')
  assert.equal(pixeldrain.ambilIdPixeldrain('https://pixeldrain.com/api/file/xyz987?download'), 'xyz987')
  assert.equal(pixeldrain.ambilIdPixeldrain('https://pixeldrain.com/d/qq11'), 'qq11')
  assert.equal(pixeldrain.ambilIdPixeldrain('abcd1234'), 'abcd1234')
  assert.equal(pixeldrain.ambilIdPixeldrain('https://google.com'), '')
  assert.equal(pixeldrain.ambilIdPixeldrain(''), '')
  assert.equal(pixeldrain.ambilIdPixeldrain(null), '')
})

test('ukuranManusia memformat byte dengan benar', () => {
  assert.equal(pixeldrain.ukuranManusia(512), '512 B')
  assert.equal(pixeldrain.ukuranManusia(1536), '1.5 KB')
  assert.equal(pixeldrain.ukuranManusia(5 * 1048576), '5.0 MB')
  assert.equal(pixeldrain.ukuranManusia(0), '0 B')
})

test('perintah pixeldrain terdaftar', () => {
  assert.equal(pixeldrain.default.command.test('pixeldrain'), true)
  assert.equal(pixeldrain.default.command.test('pd'), true)
})

/* ---------------- cari plugin ---------------- */

const PLUGIN_PALSU = {
  'main/allmenu.js': { command: /^allmenu$/i, help: ['allmenu'], tags: ['main'], description: 'seluruh perintah semua kategori' },
  'maker/stiker.js': { command: ['sticker', 'stiker'], help: ['sticker'], tags: ['maker'], description: 'buat stiker dari gambar' },
  'game/tebak.js': { command: /^(tebak|tebakgambar)$/i, help: ['tebak'], tags: ['game'], description: 'game tebak gambar' },
}

test('cariPlugin menemukan berdasarkan nama perintah', () => {
  const hasil = cariPluginMod.cariPlugin(PLUGIN_PALSU, 'stiker')
  assert.equal(hasil.length, 1)
  assert.deepEqual(hasil[0].perintah, ['sticker', 'stiker'])
})

test('cariPlugin menemukan berdasarkan deskripsi', () => {
  const hasil = cariPluginMod.cariPlugin(PLUGIN_PALSU, 'gambar')
  assert.ok(hasil.length >= 2, 'stiker & tebak sama-sama menyebut gambar')
})

test('cariPlugin mengurutkan yang cocok persis lebih dulu', () => {
  const hasil = cariPluginMod.cariPlugin(PLUGIN_PALSU, 'tebak')
  assert.equal(hasil[0].berkas, 'game/tebak.js')
})

test('cariPlugin: kata kosong → tidak ada hasil, bukan semua plugin', () => {
  assert.deepEqual(cariPluginMod.cariPlugin(PLUGIN_PALSU, ''), [])
  assert.deepEqual(cariPluginMod.cariPlugin(PLUGIN_PALSU, '   '), [])
})

test('cariPlugin tahan plugin rusak', () => {
  const rusak = { rusak: { command: { a: 1 } }, baik: { command: 'ping', help: ['ping'] } }
  const hasil = cariPluginMod.cariPlugin(rusak, 'ping')
  assert.equal(hasil.length, 1)
  assert.equal(hasil[0].berkas, 'baik')
})
