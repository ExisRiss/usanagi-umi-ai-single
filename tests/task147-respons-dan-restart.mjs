/* By AlzRiss - Usanagi Umi AI
 *
 * UJI TASK147 — "bot ga respon", /restart, /autorestart, auto update macet.
 *
 * Jalankan dari akar repo (sama seperti uji Task145/146):
 *   node tests/task147-respons-dan-restart.mjs
 *
 * Yang diuji BENAR-BENAR dijalankan, bukan dibaca:
 *   1. lib/prefix-hint.js — aturan petunjuk prefix & batas waktunya
 *   2. lib/auto-update.js — state.sha maju walau ada berkas dilewati,
 *      ingatan "berkas diedit manual", dan putuskanRestart()
 *   3. siklusAuto() dengan tiruan — restart tidak jalan saat /autorestart off
 *   4. plugins/owner/restart.js — benar-benar menjalankan restart.cmd
 *   5. plugins/owner/autorestart.js — menulis setelan ke data/auto-update.json
 *   6. handler.js — ketiga gerbang "diam" sudah memanggil petunjuk
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const AKAR = path.resolve('.')
let lulus = 0
let gagal = 0
const pesanGagal = []

function cek(nama, kondisi, detail = '') {
  if (kondisi) {
    lulus += 1
    console.log('  ✅ ' + nama)
  } else {
    gagal += 1
    pesanGagal.push(nama + (detail ? ' → ' + detail : ''))
    console.log('  ❌ ' + nama + (detail ? ' → ' + detail : ''))
  }
}

function impor(relatif) {
  return import(pathToFileURL(path.join(AKAR, relatif)).href)
}

/* Semua uji yang menyentuh process.cwd() dijalankan di folder sementara,
 * supaya data/ repo tidak tersentuh. */
const kerja = fs.mkdtempSync(path.join(os.tmpdir(), 'uji147-'))
fs.mkdirSync(path.join(kerja, 'data'), { recursive: true })
fs.mkdirSync(path.join(kerja, 'lib'), { recursive: true })

const penandaRestart = path.join(kerja, 'restart-dijalankan.txt')
fs.writeFileSync(path.join(kerja, 'data', 'auto-update.json'), JSON.stringify({
  versi: 2,
  aktif: true,
  repo: 'contoh/repo',
  branch: 'main',
  token: '',
  intervalMenit: 10,
  restartOtomatis: true,
  restart: { mode: 'cmd', panelUrl: '', apiKey: '', serverId: '', cmd: 'touch ' + penandaRestart },
}, null, 2))

process.chdir(kerja)

console.log('\n[1] Sintaks berkas yang berubah (disalin ke .mjs dulu — .js ESM selalu lolos)')
const berkasDiubah = [
  'handler.js',
  'lib/prefix-hint.js',
  'lib/auto-update.js',
  'plugins/owner/restart.js',
  'plugins/owner/autorestart.js',
  'plugins/owner/auto-update.js',
  'lib/owner-policy.js',
]
for (const relatif of berkasDiubah) {
  const asal = path.join(AKAR, relatif)
  const salin = path.join(kerja, 'cek-' + relatif.replace(/[\\/]/g, '_') + '.mjs')
  fs.writeFileSync(salin, fs.readFileSync(asal))
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

console.log('\n[2] lib/prefix-hint.js — perintah ber-prefix salah tidak lagi didiamkan')
const hint = await impor('lib/prefix-hint.js')
const plugins = {
  'main/menu.js': Object.assign(() => {}, { command: /^(menu|help)$/i }),
  'tools/ping.js': Object.assign(() => {}, { command: ['ping', 'p'], alias: 'pong' }),
  'mati/mati.js': Object.assign(() => {}, { command: ['mati'], disabled: true }),
}
const dasar = { plugins, activePrefix: '/', botType: 'jadibot' }

const salah = hint.cariPesanPrefix({ ...dasar, text: '.menu' })
cek('prefix salah dikenali', Boolean(salah && salah.perintah === 'menu'), JSON.stringify(salah))
cek('pesan memuat prefix benar', Boolean(salah && salah.pesan.includes('*/*') && salah.pesan.includes('/menu')), salah && salah.pesan)
cek('prefix benar tidak diproses modul ini', hint.cariPesanPrefix({ ...dasar, text: '/menu' }) === null)
cek('obrolan biasa ("es teh") tidak dibalas', hint.cariPesanPrefix({ ...dasar, text: '.es teh' }) === null)
cek('perintah tidak dikenal tidak dibalas', hint.cariPesanPrefix({ ...dasar, text: '.zzzzz' }) === null)
cek('angka ("5 juta") tidak dibalas', hint.cariPesanPrefix({ ...dasar, text: '.5 juta' }) === null)
cek('alias ikut dikenali', Boolean(hint.cariPesanPrefix({ ...dasar, text: '!pong' })))
cek('plugin disabled tidak dikenali', hint.cariPesanPrefix({ ...dasar, text: '.mati' }) === null)
const dollar = hint.cariPesanPrefix({ ...dasar, text: '$menu' })
cek('$ pada jadibot diberi catatan khusus', Boolean(dollar && dollar.pesan.includes('bot utama')), dollar && dollar.pesan)
const tanpaBotType = hint.cariPesanPrefix({ plugins, activePrefix: '/', text: '$menu' })
cek('tanpa botType tidak menambah catatan', Boolean(tanpaBotType) && !tanpaBotType.pesan.includes('bot utama'), tanpaBotType && tanpaBotType.pesan)

const setPerintah = hint.kumpulanPerintah(plugins)
cek('kumpulanPerintah membaca regex + array + alias', setPerintah.has('menu') && setPerintah.has('help') && setPerintah.has('p') && setPerintah.has('pong') && setPerintah.has('ping'))
cek('kumpulanPerintah melewati plugin disabled', !setPerintah.has('mati'))
const kunciCache = {}
const setCache1 = hint.kumpulanPerintah(plugins, { kunci: kunciCache })
const setCache2 = hint.kumpulanPerintah(plugins, { kunci: kunciCache })
cek('cache per sesi mengembalikan Set yang sama', setCache1 === setCache2)
cek('isDisabled dipakai', !hint.kumpulanPerintah(plugins, { isDisabled: (n) => n === 'main/menu.js' }).has('menu'))

hint.lupakanHint()
const chatA = '628111@s.whatsapp.net'
const chatB = '628222@s.whatsapp.net'
cek('petunjuk pertama boleh', hint.bolehHint(chatA, 'prefix') === true)
cek('petunjuk kedua ditahan', hint.bolehHint(chatA, 'prefix') === false)
cek('chat lain tetap boleh', hint.bolehHint(chatB, 'prefix') === true)
cek('jenis lain tetap boleh', hint.bolehHint(chatA, 'onlygroup') === true)
cek('setelah 10 menit boleh lagi', hint.bolehHint(chatA, 'prefix', Date.now() + hint.JEDA_PETUNJUK_MS + 1) === true)
hint.lupakanHint(chatB)
cek('lupakanHint mengosongkan satu chat', hint.bolehHint(chatB, 'prefix') === true)
cek('petunjuk onlyGroup menyebut Only Group', hint.petunjukOnlyGroup('Bot Uji').includes('Only Group'))
cek('petunjuk privat menyebut mode privat', hint.petunjukPrivat().includes('privat'))

console.log('\n[3] lib/auto-update.js — state.sha tidak boleh macet lagi')
const au = await impor('lib/auto-update.js')
cek('data/auto-update.json terbaca dari cwd uji', au.bacaKonfig(true).repo === 'contoh/repo')
cek('putuskanRestart() bawaan ON', au.putuskanRestart(au.bacaKonfig(true)) === true)
au.simpanKonfig({ restartOtomatis: false })
cek('putuskanRestart() OFF setelah disimpan', au.putuskanRestart(au.bacaKonfig(true)) === false)
au.simpanKonfig({ restartOtomatis: true })
cek('putuskanRestart() ON lagi', au.putuskanRestart(au.bacaKonfig(true)) === true)

/* Berkas "diedit manual" yang selalu membuat commit ditahan. */
fs.mkdirSync(path.join(kerja, 'lib'), { recursive: true })
fs.writeFileSync(path.join(kerja, 'lib', 'chat.json'), JSON.stringify({ manual: true }))
fs.writeFileSync(path.join(kerja, 'lib', 'baru.js'), 'export const a = 1\n')

const commitUji = { sha: 'abc123def456', pesan: 'uji' }
const hasilUji = {
  commit: commitUji,
  ditulis: ['lib/baru.js'],
  dihapus: [],
  dilewati: ['lib/chat.json (server lebih baru dari commit (diedit manual) — pakai .autoupdate paksa)'],
  gagal: [],
  kering: false,
}
const stateSetelah = au.simpanHasilTerap({ commit: commitUji, berubah: [{ path: 'lib/chat.json', blob: 'blob-chat' }] }, hasilUji)
cek('state.sha MAJU walau ada berkas dilewati', stateSetelah.sha === commitUji.sha, stateSetelah.sha)
cek('keputusan "dilewati" diingat', Boolean(stateSetelah.dilewati['lib/chat.json']), JSON.stringify(stateSetelah.dilewati))
cek('penanda perluRestart menyala', stateSetelah.perluRestart === true)

const sidikChat = au.gitBlobSha(fs.readFileSync(path.join(kerja, 'lib', 'chat.json')))
const nilaiLewat = au.nilaiBerkas(
  { path: 'lib/chat.json', sha: stateSetelah.dilewati['lib/chat.json'].blob },
  au.bacaState(),
  Date.now(),
)
cek('berkas yang sudah diputuskan tidak diusulkan lagi', nilaiLewat.jenis === 'dilewati', nilaiLewat.jenis)

/* Ingatan "diedit manual" diuji pada berkas biasa (bukan data runtime). */
fs.writeFileSync(path.join(kerja, 'lib', 'lain.json'), JSON.stringify({ a: 1 }))
au.simpanHasilTerap({ commit: { sha: 's3', pesan: 'z' }, berubah: [{ path: 'lib/lain.json', blob: 'blob-lain' }] }, {
  commit: { sha: 's3', pesan: 'z' }, ditulis: [], dihapus: [], dilewati: ['lib/lain.json (diedit manual)'], gagal: [], kering: false,
})
const nilaiLewatLain = au.nilaiBerkas({ path: 'lib/lain.json', sha: 'blob-lain' }, au.bacaState(), Date.now())
cek('berkas manual biasa tidak diusulkan lagi', nilaiLewatLain.jenis === 'dilewati', nilaiLewatLain.jenis)
fs.writeFileSync(path.join(kerja, 'lib', 'lain.json'), JSON.stringify({ a: 1, baru: 2 }))
const nilaiSetelahSunting = au.nilaiBerkas({ path: 'lib/lain.json', sha: 'blob-lain' }, au.bacaState(), Date.now())
cek('berkas diedit lagi dinilai ulang', nilaiSetelahSunting.jenis !== 'dilewati', nilaiSetelahSunting.jenis)
cek('gitBlobSha membaca isi', sidikChat.length === 40)

/* Catatan "dilewati" yang tidak lagi relevan harus hilang setelah cek ulang.
 * Diuji lewat simpanHasilTerap: berkas yang ditulis menghapus catatannya. */
au.simpanHasilTerap({ commit: { sha: 's2', pesan: 'y' }, berubah: [] }, {
  commit: { sha: 's2', pesan: 'y' }, ditulis: ['lib/chat.json'], dihapus: [], dilewati: [], gagal: [], kering: false,
})
cek('catatan dilewati hilang setelah berkas ditulis', !au.bacaState().dilewati['lib/chat.json'], JSON.stringify(au.bacaState().dilewati))

/* Data runtime tidak boleh dianggap "ketinggalan" untuk ditimpa. */
cek('lib/chat.json terdaftar sebagai berkas runtime', au.BERKAS_RUNTIME.includes('lib/chat.json'))
const nilaiRuntime = au.nilaiBerkas({ path: 'lib/chat.json', sha: 'blob-lain' }, au.bacaState(), Date.now())
cek('data runtime dinilai dilewati, bukan ditimpa', nilaiRuntime.jenis === 'dilewati' && nilaiRuntime.aman === false, JSON.stringify(nilaiRuntime))

const stateGagal = au.simpanHasilTerap({ commit: { sha: 'commit-gagal', pesan: 'x' }, berubah: [] }, {
  commit: { sha: 'commit-gagal', pesan: 'x' }, ditulis: [], dihapus: [], dilewati: [], gagal: ['lib/rusak.js (sintaks rusak)'], kering: false,
})
cek('kegagalan nyata menahan state.sha', stateGagal.sha !== 'commit-gagal', stateGagal.sha)
cek('kegagalan dicatat', (stateGagal.gagalTerakhir || []).length === 1)

console.log('\n[4] siklusAuto() — restart hanya kalau /autorestart on')
const cekTiruan = async () => ({
  commit: { sha: 'siklus1', pesan: 'pembaruan' },
  berubah: [{ path: 'lib/baru.js', aman: true, blob: 'b1' }],
  dihapus: [],
  sama: 0,
  diperiksa: 1,
  baru: 1,
})
const hasilTiruan = () => ({
  commit: { sha: 'siklus1', pesan: 'pembaruan' }, ditulis: ['lib/baru.js'], dihapus: [], dilewati: [], gagal: [], kering: false,
})

let restartDipanggil = 0
au.simpanKonfig({ restartOtomatis: true })
const siklusOn = await au.siklusAuto({
  deps: { cekPembaruan: cekTiruan, terapkanPembaruan: async () => hasilTiruan(), restartBot: async () => { restartDipanggil += 1; return { cara: 'tiruan', ok: true } } },
})
cek('autorestart ON → restart dipanggil', restartDipanggil === 1 && Boolean(siklusOn.restart) && siklusOn.ditunda === false)

restartDipanggil = 0
au.simpanKonfig({ restartOtomatis: false })
const siklusOff = await au.siklusAuto({
  deps: { cekPembaruan: cekTiruan, terapkanPembaruan: async () => hasilTiruan(), restartBot: async () => { restartDipanggil += 1; return { cara: 'tiruan', ok: true } } },
})
cek('autorestart OFF → restart TIDAK dipanggil', restartDipanggil === 0 && siklusOff.restart === null && siklusOff.ditunda === true)
const logTerakhir = au.bacaLog(3).map((x) => x.kejadian + ':' + (x.cara || '')).join(',')
cek('log mencatat restart dimatikan', logTerakhir.includes('restart:dimatikan'), logTerakhir)

const siklusKosong = await au.siklusAuto({
  deps: {
    cekPembaruan: async () => ({ commit: { sha: 'x', pesan: '' }, berubah: [], dihapus: [], sama: 3, diperiksa: 3, baru: 0 }),
    terapkanPembaruan: async () => { throw new Error('tidak boleh dipanggil') },
    restartBot: async () => { throw new Error('tidak boleh dipanggil') },
  },
})
cek('tanpa perubahan tidak menerapkan/merestart', siklusKosong.hasil === null && siklusKosong.restart === null)

console.log('\n[5] plugins/owner/restart.js — benar-benar menjalankan restart')
fs.rmSync(penandaRestart, { force: true })
const restartPlugin = (await impor('plugins/owner/restart.js')).default
const balasanRestart = []
const mRestart = { chat: '628999@s.whatsapp.net', reply: async (teks) => { balasanRestart.push(String(teks)) } }
cek('handler.command cocok dengan "restart"', restartPlugin.command.test('restart') && !restartPlugin.command.test('restartbiasa'))
cek('handler khusus developer/owner utama', restartPlugin.rowner === true && !restartPlugin.owner)
cek('/restart terdaftar platform-only', (await impor('lib/owner-policy.js')).isPlatformOnlyPlugin('restart.js'))
await restartPlugin(mRestart, { text: '' })
cek('membalas sebelum restart', balasanRestart.length === 1 && balasanRestart[0].includes('Restart server diminta'), balasanRestart[0])
cek('belum restart sebelum jeda 1,2 detik', !fs.existsSync(penandaRestart))
await new Promise((resolve) => setTimeout(resolve, 1800))
cek('restart.cmd dieksekusi setelah jeda', fs.existsSync(penandaRestart))

const balasanKedua = []
await restartPlugin({ chat: '628999@s.whatsapp.net', reply: async (t) => balasanKedua.push(String(t)) }, { text: '' })
cek('restart kedua dalam 45 detik ditahan', balasanKedua.length === 1 && balasanKedua[0].includes('Tunggu'), balasanKedua[0])

const balasanStatus = []
await restartPlugin({ chat: '628999@s.whatsapp.net', reply: async (t) => balasanStatus.push(String(t)) }, { text: 'status' })
cek('/restart status menampilkan metode & auto restart', balasanStatus[0].includes('Auto restart') && balasanStatus[0].includes('Perintah cmd'), balasanStatus[0])

console.log('\n[6] plugins/owner/autorestart.js — menyimpan saklar')
const autoPlugin = (await impor('plugins/owner/autorestart.js')).default
const balasAuto = []
const connAuto = { chat: '628999@s.whatsapp.net', reply: async (t) => balasAuto.push(String(t)) }
cek('handler.command cocok dengan "autorestart"', autoPlugin.command.test('autorestart'))
cek('handler khusus developer/owner utama', autoPlugin.rowner === true && !autoPlugin.owner)
cek('/autorestart terdaftar platform-only', (await impor('lib/owner-policy.js')).isPlatformOnlyPlugin('autorestart.js'))
await autoPlugin(connAuto, { text: 'off' })
cek('/autorestart off menulis setelan', au.bacaKonfig(true).restartOtomatis === false)
cek('/autorestart off membalas DIMATIKAN', balasAuto[0].includes('DIMATIKAN'), balasAuto[0])
await autoPlugin(connAuto, { text: 'on' })
cek('/autorestart on menulis setelan', au.bacaKonfig(true).restartOtomatis === true)
await autoPlugin(connAuto, { text: 'status' })
cek('/autorestart status menyebut ON', balasAuto[2].includes('ON ✅'), balasAuto[2])
await autoPlugin(connAuto, { text: 'ngawur' })
cek('/autorestart menolak argumen lain', balasAuto[3].includes('Pilihan'), balasAuto[3])

console.log('\n[7] handler.js — ketiga gerbang "diam" sudah menjawab')
const isiHandler = fs.readFileSync(path.join(AKAR, 'handler.js'), 'utf8')
cek('import lib/prefix-hint.js', isiHandler.includes("from './lib/prefix-hint.js'"))
cek('gerbang prefix salah memakai cariPesanPrefix', isiHandler.includes('cariPesanPrefix({'))
cek('gerbang onlyGroup membalas petunjuk', isiHandler.includes('petunjukOnlyGroup('))
cek('gerbang mode privat membalas petunjuk', isiHandler.includes('petunjukPrivat('))
cek('hanya chat pribadi yang diberi petunjuk prefix', /if \(!isGroup\) \{\s*\n\s*try \{\s*\n\s*const hintPrefix/.test(isiHandler))
cek('bolehHint membatasi pengiriman', (isiHandler.match(/bolehHint\(/g) || []).length >= 3)

console.log(`\n===== ${lulus} lulus, ${gagal} gagal =====`)
if (gagal) {
  console.log('Gagal:')
  for (const p of pesanGagal) console.log('  • ' + p)
}
console.log('folder uji: ' + kerja)
process.exit(gagal ? 1 : 0)
