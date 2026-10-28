/* Task143 — uji owner utama, perlindungan autodelmsg, dan plugin creator. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  tambahOwnerUtama, hapusOwnerUtama, nomorOwnerUtama, isOwnerUtama, statusAkses,
} from '../lib/owner-utama.js'
import creator from '../plugins/info/main-creator.js'
import autodel from '../plugins/owner/autodelmsg.js'
import utama from '../plugins/owner/owner-utama.js'

const BERKAS = path.join(process.cwd(), 'data', 'owner-utama.json')
const cadangan = fs.existsSync(BERKAS) ? fs.readFileSync(BERKAS) : null

test.after(() => {
  if (cadangan) fs.writeFileSync(BERKAS, cadangan)
  else { try { fs.unlinkSync(BERKAS) } catch (e) {} }
})

test('owner utama: tambah, kenali, cabut', () => {
  const tambah = tambahOwnerUtama('628111222333', 'Uji Utama', 'test')
  assert.equal(tambah.nomor, '628111222333')
  assert.equal(isOwnerUtama('628111222333'), true)
  assert.equal(isOwnerUtama('+62 811-1222-333'), true, 'format bebas tetap dikenali')
  assert.equal(isOwnerUtama('628999999999'), false)
  const cabut = hapusOwnerUtama('628111222333')
  assert.equal(cabut.dihapus, true)
  assert.equal(isOwnerUtama('628111222333'), false)
})

test('peran akses: developer menang atas owner utama', () => {
  tambahOwnerUtama('628111222333', 'Uji Utama', 'test')
  assert.equal(statusAkses('6287813709432', { developer: ['6287813709432'] }).peran, 'developer')
  assert.equal(statusAkses('628111222333', { developer: ['6287813709432'] }).peran, 'owner utama')
  assert.equal(statusAkses('628111222333', { developer: ['6287813709432'] }).aksesPenuh, true)
  assert.equal(statusAkses('628555555555', { developer: [] }).peran, 'pengguna')
  assert.equal(statusAkses('628555555555', { developer: [] }).aksesPenuh, false)
  hapusOwnerUtama('628111222333')
})

test('plugin creator tidak lagi bergantung pada global.images', () => {
  const isi = fs.readFileSync(path.join(process.cwd(), 'plugins', 'info', 'main-creator.js'), 'utf8')
  assert.ok(isi.includes('ratio_16_9'), 'masih menyebut ratio_16_9 (untuk fallback opsional)')
  assert.match(isi, /global\.images && global\.images\.ratio_16_9/, 'akses harus dijaga kondisi')
  assert.equal(/global\.images\.ratio_16_9\.url,/.test(isi), false, 'tidak boleh akses langsung tanpa cek')
  assert.match(isi, /contacts:/, 'harus punya jalur cadangan kartu kontak')
  assert.equal(creator.command.test('developer'), true)
  assert.equal(creator.command.test('creator'), true)
})

test('autodelmsg terdaftar untuk grup saja dan punya hook all', () => {
  assert.equal(autodel.command.test('autodelmsg'), true)
  assert.equal(autodel.command.test('autodel'), false)
  assert.equal(typeof autodel.all, 'function', 'penghapus otomatis harus jalan lewat handler.all')
  assert.equal(autodel.group, true)
  const isi = fs.readFileSync(path.join(process.cwd(), 'plugins', 'owner', 'autodelmsg.js'), 'utf8')
  assert.match(isi, /TIDAK PERNAH/, 'aturan perlindungan owner/developer harus tertulis')
  assert.match(isi, /nomorTerlindungi/, 'harus memakai daftar terlindungi')
  assert.match(isi, /isBotAdmin/, 'harus memeriksa status admin bot')
})

test('perintah owner utama terdaftar', () => {
  for (const nama of ['ownerutama', 'addownerutama', 'delownerutama', 'statusakses']) {
    assert.equal(utama.command.test(nama), true, 'harus cocok: ' + nama)
  }
  assert.equal(utama.command.test('owner'), false)
})

test('daftar owner utama terbaca dari data setelah ditambah', () => {
  tambahOwnerUtama('628111222333', 'Uji Utama', 'test')
  assert.ok(nomorOwnerUtama().includes('628111222333'))
  hapusOwnerUtama('628111222333')
  assert.equal(nomorOwnerUtama().includes('628111222333'), false)
})
