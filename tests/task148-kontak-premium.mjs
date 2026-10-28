/* By AlzRiss - Usanagi Umi AI
 *
 * UJI TASK148 — nomor kontak di pesan premium & pesan "laporan bug".
 *
 *   node tests/task148-kontak-premium.mjs
 *
 * Yang dibuktikan:
 *   1. nomor developer/owner utama MENANG atas owner sesi lain;
 *   2. setelan manual `.premium kontak <nomor>` berlaku untuk semua bot;
 *   3. `.premium kontak auto` mengembalikan perilaku otomatis;
 *   4. sesi yang tidak memuat nomor developer tetap memakai owner-nya sendiri;
 *   5. kartu `.owner2`/`.creator2` memakai nomor hasil resolver, bukan
 *      `global.nomorown` yang tidak pernah didefinisikan.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const AKAR = path.resolve('.')
let lulus = 0
let gagal = 0
const gagalDaftar = []

function cek(nama, kondisi, detail = '') {
  if (kondisi) {
    lulus += 1
    console.log('  ✅ ' + nama)
  } else {
    gagal += 1
    gagalDaftar.push(nama + (detail ? ' → ' + detail : ''))
    console.log('  ❌ ' + nama + (detail ? ' → ' + detail : ''))
  }
}

const impor = (relatif) => import(pathToFileURL(path.join(AKAR, relatif)).href)

console.log('\n[1] Sintaks berkas yang diubah')
for (const relatif of ['lib/premium-mode.js', 'plugins/owner/premium-mode.js', 'integrations/umi/plugins/main/creator2.js', 'lib/owner-utama.js']) {
  const salin = path.join(os.tmpdir(), 'uji148-' + relatif.replace(/[\\/]/g, '_') + '.mjs')
  fs.mkdirSync(path.dirname(salin), { recursive: true })
  fs.writeFileSync(salin, fs.readFileSync(path.join(AKAR, relatif)))
  let ok = true
  let pesan = ''
  try {
    execFileSync(process.execPath, ['--check', salin], { stdio: 'pipe' })
  } catch (error) {
    ok = false
    pesan = String(error.stderr || error.message).split('\n').slice(0, 3).join(' ')
  }
  cek('sintaks ' + relatif, ok, pesan)
}

console.log('\n[2] Resolver kontak premium')
const kerja = fs.mkdtempSync(path.join(os.tmpdir(), 'kontak148-'))
fs.mkdirSync(path.join(kerja, 'data'), { recursive: true })

/* Tiruan environment server: developer terkunci + owner utama + owner biasa. */
global.jadibotPlatform = { lockedOwnerNumber: '6287813709432' }
global.owner = [
  ['6287813709432', 'AlzRiss', true],
  ['6282362155587', 'Owner 2', true],
]
fs.writeFileSync(path.join(kerja, 'data', 'owner-utama.json'), JSON.stringify({
  versi: 1,
  nomor: [{ nomor: '6283823085746', nama: 'RiskyXD' }],
}))

const prosesAsli = process.cwd()
process.chdir(kerja)
const pm = await impor('lib/premium-mode.js')

cek('nomorPlatform memuat developer lebih dulu', pm.nomorPlatform()[0] === '6287813709432', JSON.stringify(pm.nomorPlatform()))
cek('nomorPlatform memuat owner utama', pm.nomorPlatform().includes('6283823085746'))

/* Kasus yang dilaporkan: sesi ZekkBot punya dua owner, nomor orang lain di depan. */
const sesiZekk = { type: 'jadibot', ownerNumbers: ['6287860755783', '6287813709432'] }
cek('nomor developer menang atas owner sesi lain', pm.premiumOwnerContact(sesiZekk) === '6287813709432', pm.premiumOwnerContact(sesiZekk))
cek('nomor 6287860755783 TIDAK dipakai lagi', pm.premiumOwnerContact(sesiZekk) !== '6287860755783')

const sesiOrangLain = { type: 'jadibot', ownerNumbers: ['6285240000001', '6285240000002'] }
cek('sesi tanpa developer memakai owner sesi pertama', pm.premiumOwnerContact(sesiOrangLain) === '6285240000001', pm.premiumOwnerContact(sesiOrangLain))

const tanpaOwner = { type: 'jadibot', ownerNumbers: [] }
cek('sesi tanpa owner jatuh ke developer', pm.premiumOwnerContact(tanpaOwner) === '6287813709432', pm.premiumOwnerContact(tanpaOwner))

cek('owner bertanda dev:false dilewati', !pm.nomorPlatform().includes('6281111111'))
global.owner = [...global.owner, ['6281111111', 'Bukan Dev', false]]
cek('dev:false tetap dilewati setelah ditambah', !pm.nomorPlatform().includes('6281111111'), JSON.stringify(pm.nomorPlatform()))

console.log('\n[3] Setelan manual .premium kontak')
cek('sebelum disetel masih kosong', pm.bacaKontakPremium(true) === '')
pm.simpanKontakPremium('+62 878-1234-5678', 'uji')
cek('nomor disimpan dalam bentuk digit', pm.bacaKontakPremium(true) === '6287812345678', pm.bacaKontakPremium(true))
cek('berkas setelan dibuat', fs.existsSync(path.join(kerja, 'data', 'premium-contact.json')))
cek('setelan manual berlaku untuk semua sesi', pm.premiumOwnerContact(sesiOrangLain) === '6287812345678', pm.premiumOwnerContact(sesiOrangLain))
pm.simpanKontakPremium('', 'uji')
cek('setelan manual bisa dihapus (auto)', pm.bacaKontakPremium(true) === '')
cek('sesi developer kembali ke nomor developer', pm.premiumOwnerContact(sesiZekk) === '6287813709432', pm.premiumOwnerContact(sesiZekk))
cek('sesi orang lain kembali ke owner sesi pertama', pm.premiumOwnerContact(sesiOrangLain) === '6285240000001', pm.premiumOwnerContact(sesiOrangLain))

console.log('\n[4] Perintah .premium kontak')
const pluginPremium = (await impor('plugins/owner/premium-mode.js')).default
const balas = []
const connUji = { botConfig: sesiZekk, reply: async (teks) => { balas.push(String(teks)) } }
const pesan = (teks, opsi = {}) => ({
  m: { chat: '6281@s.whatsapp.net', sender: '6287813709432@s.whatsapp.net', text: teks, reply: async (t) => { balas.push(String(t)) } },
  opsi,
})

async function jalankan(text, opsi = {}) {
  const { m } = pesan(text)
  const args = text.trim().split(/\s+/).slice(1)
  await pluginPremium(m, { conn: connUji, args, usedPrefix: '.', command: 'premium', isOwner: true, isROwner: true, ...opsi })
  return balas[balas.length - 1] || ''
}

balas.length = 0
let hasil = await jalankan('.premium kontak')
cek('tanpa argumen menampilkan nomor aktif', hasil.includes('wa.me/6287813709432'), hasil.slice(0, 120))
cek('menyebut sumber otomatis', hasil.includes('otomatis'), hasil.slice(0, 120))

hasil = await jalankan('.premium kontak 087860755783')
cek('developer bisa mengunci nomor', hasil.includes('87860755783') || hasil.includes('6287860755783'), hasil)
cek('tersimpan di berkas', pm.bacaKontakPremium(true) === '6287860755783', pm.bacaKontakPremium(true))

hasil = await jalankan('.premium kontak 123')
cek('nomor tidak valid ditolak', hasil.includes('tidak valid'), hasil)

hasil = await jalankan('.premium kontak 6287813709432', { isROwner: false })
cek('bukan developer ditolak', hasil.includes('hanya bisa diubah developer'), hasil)

hasil = await jalankan('.premium kontak auto')
cek('.premium kontak auto mengembalikan otomatis', pm.bacaKontakPremium(true) === '' && hasil.includes('6287813709432'), hasil)

console.log('\n[5] Kartu "laporan bug / hubungi owner" (creator2)')
const isiCreator = fs.readFileSync(path.join(AKAR, 'integrations/umi/plugins/main/creator2.js'), 'utf8')
const pemakaianNomorown = (isiCreator.match(/(?:phone_number|copy_code|url)\s*:\s*[^\n]*global\.nomorown|\$\{global\.nomorown\}/g) || []).length
cek('tidak lagi memakai global.nomorown di tombol/tautan', pemakaianNomorown === 0, String(pemakaianNomorown))
cek('memakai resolver premiumOwnerContact', isiCreator.includes('premiumOwnerContact'))
cek('path import benar (lib di akar repo)', fs.existsSync(path.resolve(path.dirname(path.join(AKAR, 'integrations/umi/plugins/main/creator2.js')), '../../../../lib/premium-mode.js')))

process.chdir(prosesAsli)
console.log(`\n===== ${lulus} lulus, ${gagal} gagal =====`)
if (gagal) for (const p of gagalDaftar) console.log('  • ' + p)
process.exit(gagal ? 1 : 0)
