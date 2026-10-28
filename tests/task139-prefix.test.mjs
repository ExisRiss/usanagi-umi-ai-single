/* Task139 — uji filter prefix per sesi.
 *
 * Bug yang dilaporkan: mengetik `//pingmc` di sesi ber-prefix `/`, tetapi bot
 * lain yang prefix-nya `.` dan `★` ikut membalas.
 *
 * Uji ini mereproduksi pipeline handler yang sebenarnya:
 *   1. normalizeIncoming()  → normalisasi prefix + penanda rich (Task117)
 *   2. splitDoublePrefix()  → prefix ganda milik sesi ini (Task139)
 *   3. pencocokan plugin    → regex ^prefix terhadap teks dispatch
 * Sesi dianggap "membalas" hanya kalau langkah 3 cocok.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeIncoming, splitDoublePrefix, sanitizeActivePrefix } from '../lib/prefix-bot.js'

const COMMANDS = new Set(['statusmc', 'pingmc', 'menu'])

/** Tiruan alur handler: kembalikan { matched, rich, text } untuk satu sesi. */
function prosesSesi(teks, prefixSesi, mode = 'strict') {
  const hasil = { matched: false, rich: false, text: teks }

  // langkah 1 — Task117 (handler baris ~366)
  const norm = normalizeIncoming({ text: teks, botType: 'jadibot', activePrefix: prefixSesi })
  let aktif = norm.prefix
  let teksDispatch = teks
  if (norm.rich) {
    hasil.rich = true
    teksDispatch = norm.text
  }

  // langkah 2 — Task139 (handler baris ~660)
  const ganda = splitDoublePrefix(teksDispatch, aktif)
  if (ganda.rich) {
    hasil.rich = true
    teksDispatch = ganda.text
  }

  // langkah 3 — pencocokan plugin: `^prefix` lalu nama perintah terdaftar
  if (teksDispatch.startsWith(aktif)) {
    const sisa = teksDispatch.slice(aktif.length).trim()
    const nama = sisa.split(/\s+/)[0].toLowerCase()
    hasil.matched = COMMANDS.has(nama) && sisa === nama
  }
  hasil.text = teksDispatch
  hasil.aktif = aktif
  return hasil
}

test('prefix sesi diambil apa adanya untuk simbol sah', () => {
  assert.equal(sanitizeActivePrefix('jadibot', '/', '/'), '/')
  assert.equal(sanitizeActivePrefix('jadibot', '★', '.'), '★')
  assert.equal(sanitizeActivePrefix('jadibot', '.', '.'), '.')
})

test('`//pingmc` HANYA dijalankan sesi ber-prefix `/`', () => {
  const slash = prosesSesi('//pingmc', '/')
  assert.equal(slash.matched, true, 'sesi "/" harus menjalankan //pingmc')
  assert.equal(slash.rich, true, '//pingmc di sesi "/" harus rich')
  assert.equal(slash.text, '/pingmc')

  for (const prefix of ['.', '★', ',', '!']) {
    const lain = prosesSesi('//pingmc', prefix)
    assert.equal(lain.matched, false, `sesi "${prefix}" TIDAK boleh ikut menjalankan //pingmc`)
    assert.equal(lain.rich, false, `sesi "${prefix}" tidak boleh menandai //pingmc sebagai rich`)
    assert.equal(lain.text, '//pingmc', `teks untuk sesi "${prefix}" tidak boleh diubah`)
  }
})

test('prefix ganda milik sendiri tetap jalan (teks vs rich)', () => {
  const titik = prosesSesi('..pingmc', '.')
  assert.equal(titik.matched, true)
  assert.equal(titik.rich, true)

  const bintang = prosesSesi('★★pingmc', '★')
  assert.equal(bintang.matched, true)
  assert.equal(bintang.rich, true)

  const biasa = prosesSesi('.pingmc', '.')
  assert.equal(biasa.matched, true)
  assert.equal(biasa.rich, false, '.pingmc harus teks biasa, bukan rich')
})

test('simbol lain tidak bocor antar sesi', () => {
  const kasus = [
    ['!pingmc', '!', true],
    ['!pingmc', '.', false],
    ['..pingmc', '!', false],
    ['##pingmc', '#', true],
    ['##pingmc', '.', false],
    ['★pingmc', '★', true],
    ['★pingmc', '.', false],
    ['//statusmc', '.', false],
    ['//statusmc', '/', true],
  ]
  for (const [teks, prefix, harusJalan] of kasus) {
    const r = prosesSesi(teks, prefix)
    assert.equal(r.matched, harusJalan, `${teks} pada sesi "${prefix}" seharusnya ${harusJalan ? 'jalan' : 'DIAM'}`)
  }
})

test('splitDoublePrefix tidak menyentuh prefix lain', () => {
  assert.deepEqual(splitDoublePrefix('//pingmc', '.'), { rich: false, text: '//pingmc', body: '' })
  assert.deepEqual(splitDoublePrefix('//pingmc', '/'), { rich: true, text: '/pingmc', body: 'pingmc' })
  assert.deepEqual(splitDoublePrefix('///pingmc', '/'), { rich: true, text: '/pingmc', body: 'pingmc' })
  assert.deepEqual(splitDoublePrefix('..pingmc', '/'), { rich: false, text: '..pingmc', body: '' })
  assert.equal(splitDoublePrefix('..', '.').rich, false, 'tanpa nama perintah bukan rich')
  assert.equal(splitDoublePrefix('.. ping', '.').rich, false, 'spasi setelah prefix bukan perintah')
  assert.equal(splitDoublePrefix('', '.').rich, false)
  assert.equal(splitDoublePrefix('..menu', '').rich, false, 'prefix kosong tidak diubah')
})
