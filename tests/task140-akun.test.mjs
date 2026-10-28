/* Task140 — uji bagian murni dari fitur akun & nama subdomain.
 *
 * Panggilan jaringan (Supabase / Cloudflare) diuji terpisah dengan akun
 * percobaan yang benar-benar dibuat lalu dihapus (lihat laporan Task140).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validasiEmail,
  validasiSandi,
  validasiUsername,
  parseBuatAkun,
  daftarSitus,
  cariSitus,
  SITUS_BAWAAN,
} from '../lib/akun-platform.js'
import { namaSubAman, hostUtama, hostTitik } from '../lib/subdomain-kaira.js'
import akunPlugin from '../plugins/owner/developer-akun.js'
import subPlugin from '../plugins/owner/developer-subdomain.js'

test('validasi email', () => {
  assert.equal(validasiEmail('Umi@Gmail.com'), 'umi@gmail.com')
  assert.equal(validasiEmail('  toko.bot@yahoo.co.id '), 'toko.bot@yahoo.co.id')
  assert.equal(validasiEmail('bukan-email'), '')
  assert.equal(validasiEmail('a@b'), '')
  assert.equal(validasiEmail(''), '')
})

test('validasi password', () => {
  assert.equal(validasiSandi('Rahasia123'), '')
  assert.match(validasiSandi('pendek1'), /minimal 8/)
  assert.match(validasiSandi('12345678'), /huruf/)
  assert.match(validasiSandi('rahasiaku'), /angka/)
})

test('validasi username', () => {
  assert.equal(validasiUsername('umi'), '')
  assert.equal(validasiUsername('umi_usnagi-01'), '')
  assert.match(validasiUsername('ab'), /3–20/)
  assert.match(validasiUsername('umi usanagi'), /3–20/)
  assert.match(validasiUsername('umi!'), /3–20/)
})

test('parse /buatakun <gmail> | <password> | <username>', () => {
  const hasil = parseBuatAkun(' Umi@Gmail.com | Rahasia123 | umi ')
  assert.deepEqual(hasil, { email: 'Umi@Gmail.com', password: 'Rahasia123', username: 'umi' })
  assert.deepEqual(parseBuatAkun(''), { email: '', password: '', username: '' })
})

test('daftar situs bawaan memuat website & bot lokal', () => {
  const situs = daftarSitus()
  const id = situs.map((s) => s.id)
  assert.ok(id.includes('website-jadibot'))
  assert.ok(id.includes('bot-lokal'))
  assert.equal(SITUS_BAWAAN.length, situs.length > 0 ? SITUS_BAWAAN.length : 0)
  assert.equal(cariSitus('website-jadibot').backend, 'supabase')
  assert.equal(cariSitus('bot-lokal').backend, 'lokal')
  assert.equal(cariSitus('tidak-ada'), null)
})

test('nama subdomain: pola strip hidup, pola titik dicatat', () => {
  assert.equal(namaSubAman('Toko'), 'toko')
  assert.equal(namaSubAman('toko online'), 'toko-online')
  assert.equal(namaSubAman('ab'), '')
  assert.equal(namaSubAman('123'), '')
  assert.equal(namaSubAman('admin'), '')
  assert.equal(hostUtama('toko'), 'toko-alzriss.gwenna.my.id')
  assert.equal(hostTitik('toko'), 'toko.alzriss.gwenna.my.id')
})

test('perintah terdaftar tepat, tanpa tabrakan', () => {
  const akun = akunPlugin.command
  for (const nama of ['buatakun', 'delakun', 'delakunhapus', 'delakunall', 'hapusakun', 'hapusakunall']) {
    assert.ok(akun.test(nama), 'harus cocok: ' + nama)
  }
  for (const nama of ['addsubdomain', 'addnamesubdomain', 'delnamesubdomain']) {
    assert.ok(subPlugin.command.test(nama), 'harus cocok: ' + nama)
  }
  assert.equal(akun.test('menu'), false, 'delakun tidak boleh menangkap "menu"')
  assert.equal(akun.test('delakunfull'), false, 'harus cocok persis')
  assert.equal(subPlugin.command.test('deploysubdomain'), false, 'deploysubdomain bukan milik plugin ini')
})
