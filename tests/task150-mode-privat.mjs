/* By AlzRiss - Usanagi Umi AI
 *
 * UJI TASK150 — "bot private tapi masih bales" → mode privat = DIAM.
 *
 *   node tests/task150-mode-privat.mjs
 *
 * Yang dibuktikan:
 *   1. keputusan role (developer / owner utama / owner bot) benar untuk semua
 *      kombinasi, termasuk pesan dari akun bot sendiri;
 *   2. setelan private terbaca dari bentuk yang dipakai server:
 *      botConfig.public = false, managedSettings, dan settings.public lama;
 *   3. handler.js menaruh gerbang privat SEBELUM AFK, aksi tertunda, dan
 *      petunjuk prefix — dan tidak lagi mengirim balasan apa pun;
 *   4. daftar akses (`.addakses`) tidak lagi membuka mode privat.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const AKAR = path.resolve('.')
let lulus = 0
let gagal = 0
const daftarGagal = []

function cek(nama, kondisi, detail = '') {
  if (kondisi) {
    lulus += 1
    console.log('  ✅ ' + nama)
  } else {
    gagal += 1
    daftarGagal.push(nama + (detail ? ' → ' + detail : ''))
    console.log('  ❌ ' + nama + (detail ? ' → ' + detail : ''))
  }
}

const impor = (relatif) => import(pathToFileURL(path.join(AKAR, relatif)).href)

console.log('\n[1] Sintaks berkas yang diubah')
for (const relatif of ['handler.js', 'lib/mode-privat.js']) {
  const salin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'uji150-')), 'cek.mjs')
  fs.writeFileSync(salin, fs.readFileSync(path.join(AKAR, relatif)))
  let ok = true
  let pesan = ''
  try { execFileSync(process.execPath, ['--check', salin], { stdio: 'pipe' }) } catch (e) {
    ok = false
    pesan = String(e.stderr || e.message).split('\n').slice(0, 3).join(' ')
  }
  cek('sintaks ' + relatif, ok, pesan)
}

console.log('\n[2] Pembacaan setelan private')
const mp = await impor('lib/mode-privat.js')
cek('jadibot public:false → privat', mp.apakahPrivat({ type: 'jadibot', public: false }) === true)
cek('jadibot public:true → publik', mp.apakahPrivat({ type: 'jadibot', public: true }) === false)
cek('jadibot tanpa field public → publik (perilaku lama)', mp.apakahPrivat({ type: 'jadibot' }) === false)
cek('bot utama managedSettings public:false → privat', mp.apakahPrivat({ type: 'main', managedSettings: true, public: false }) === true)
cek('bot utama lama: settings.public false → privat', mp.apakahPrivat({ type: 'main' }, { public: false }) === true)
cek('bot utama lama: settings.public true → publik', mp.apakahPrivat({ type: 'main' }, { public: true }) === false)
cek('tanpa setelan apa pun → publik', mp.apakahPrivat({}, null) === false)
cek("key 'self' → privat", mp.apakahPrivat({}, null, { key: 'self' }) === true)
cek("key 'private' → privat", mp.apakahPrivat({}, null, { key: 'private' }) === true)
cek("key 'public' → publik", mp.apakahPrivat({}, null, { key: 'public' }) === false)

console.log('\n[3] Siapa yang dilayani')
const kasus = [
  ['publik → semua dilayani', { privat: false }, true, 'semua'],
  ['pengguna biasa → DIAM', { privat: true }, false, 'pengguna'],
  ['developer → dilayani', { privat: true, isDeveloper: true }, true, 'developer'],
  ['owner utama → dilayani', { privat: true, isOwnerUtama: true }, true, 'ownerUtama'],
  ['owner bot → dilayani', { privat: true, isOwnerBot: true }, true, 'ownerBot'],
  ['pesan dari akun bot → dilayani', { privat: true, fromMe: true }, true, 'perangkat'],
]
for (const [nama, masukan, harapDilayani, harapRole] of kasus) {
  const hasil = mp.putusanModePrivat(masukan)
  cek(nama, hasil.dilayani === harapDilayani && hasil.role === harapRole, JSON.stringify(hasil))
}
cek('developer + owner utamasekaligus tetap developer', mp.putusanModePrivat({ privat: true, isDeveloper: true, isOwnerUtama: true }).role === 'developer')
cek('alasan diam menyebut role yang diizinkan', /developer/.test(mp.putusanModePrivat({ privat: true }).alasan))

const role = mp.roleDari({ isROwner: true, isOwnerUtama: false, isOwner: true })
cek('roleDari memisahkan developer', role.isDeveloper === true && role.isOwnerBot === true && role.isOwnerUtama === false, JSON.stringify(role))
const catatan = mp.catatanDiam({ alasan: 'mode privat' }, { sender: '628123@s.whatsapp.net', chat: '628999@s.whatsapp.net' })
cek('catatan log tidak memuat isi pesan', catatan.includes('628123') && !catatan.includes('menu'))

console.log('\n[4] Sambungan di handler.js')
const isiHandler = fs.readFileSync(path.join(AKAR, 'handler.js'), 'utf8')
const posisi = (teks) => isiHandler.indexOf(teks)
const posGerbang = posisi('MODE PRIVAT — BOT DIAM')
const posAfk = posisi('await handleAfkMessage(')
const posAksi = posisi('const _aksiPending = cariAksi(m)')
const posHint = posisi('const hintPrefix = cariPesanPrefix({')
const posDbInit = posisi('DATABASE INIT')

cek('handler mengimpor lib/mode-privat.js', isiHandler.includes("from './lib/mode-privat.js'"))
cek('gerbang privat ada', posGerbang > 0)
cek('gerbang privat SEBELUM inisialisasi database', posGerbang > 0 && posGerbang < posDbInit, `${posGerbang} vs ${posDbInit}`)
cek('gerbang privat SEBELUM notifikasi AFK', posGerbang > 0 && posGerbang < posAfk, `${posGerbang} vs ${posAfk}`)
cek('gerbang privat SEBELUM aksi tertunda', posGerbang > 0 && posGerbang < posAksi, `${posGerbang} vs ${posAksi}`)
cek('gerbang privat SEBELUM petunjuk prefix', posGerbang > 0 && posGerbang < posHint, `${posGerbang} vs ${posHint}`)
cek('tidak ada balasan "mode privat" lagi', !isiHandler.includes('petunjukPrivat'))
cek('daftar akses (.addakses) tidak membuka mode privat', !isiHandler.includes('punyaAkses'))
cek('gerbang lama tetap diam (tanpa reply)', /if \(!instancePublic && !m\.fromMe && !isOwner\) return;/.test(isiHandler))
cek('gerbang memakai putusanModePrivat', isiHandler.includes('putusanModePrivat({'))
cek('log diam dibatasi per chat', isiHandler.includes('bolehLogDiam('))

/* Gerbang privat harus berisi `return` tepat setelah putusan — kalau tidak,
 * handler lanjut dan bot membalas. */
const blokGerbang = isiHandler.slice(posGerbang, posGerbang + 1200)
cek('gerbang menghentikan proses dengan return', /if \(!putusan\.dilayani\) \{[\s\S]*?return;?\s*\n/.test(blokGerbang), blokGerbang.slice(0, 200))

console.log('\n[5] Simulasi alur gerbang (tanpa WhatsApp)')
/* Tiruan mini alur handler: hitung siapa yang lalu, lalu pastikan tidak ada
 * balasan yang tercatat untuk pengguna biasa. */
function jalankanGerbang({ privat, isROwner = false, isOwnerUtama = false, isOwner = false, fromMe = false }) {
  const balasan = []
  const conn = { reply: async (teks) => { balasan.push(String(teks)) } }
  const putusan = mp.putusanModePrivat({ privat, fromMe, ...mp.roleDari({ isROwner, isOwnerUtama, isOwner }) })
  if (privat && !putusan.dilayani) {
    return { dilayani: false, balasan }
  }
  return { dilayani: true, balasan, role: putusan.role, conn }
}
const tamu = jalankanGerbang({ privat: true })
cek('tamu di bot private: bot diam', tamu.dilayani === false && tamu.balasan.length === 0)
const dev = jalankanGerbang({ privat: true, isROwner: true })
cek('developer di bot private: dilayani', dev.dilayani === true && dev.role === 'developer')
const ou = jalankanGerbang({ privat: true, isOwnerUtama: true })
cek('owner utama di bot private: dilayani', ou.dilayani === true && ou.role === 'ownerUtama')
const ob = jalankanGerbang({ privat: true, isOwner: true })
cek('owner bot di bot private: dilayani', ob.dilayani === true && ob.role === 'ownerBot')
const publik = jalankanGerbang({ privat: false })
cek('bot publik: tamu tetap dilayani', publik.dilayani === true && publik.role === 'semua')

console.log(`\n===== ${lulus} lulus, ${gagal} gagal =====`)
if (gagal) for (const p of daftarGagal) console.log('  • ' + p)
process.exit(gagal ? 1 : 0)
