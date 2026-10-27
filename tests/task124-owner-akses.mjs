/* Task124 — akses penuh untuk OWNER BOT (nomor yang diisi di setelan bot).
 *
 * Keluhan owner: "bot user yang udah masukin nomer nya ke owner bot gabisa
 * punya akses penuh ke bot nya".
 *
 * Yang dijaga tes ini:
 *   1. owner bot boleh memakai perintah bertanda `rowner` milik botnya
 *      (.addowner, .addstok, .setpp, .selfthisgc, …)
 *   2. fitur platform/lintas akun tetap terkunci untuk owner bot
 *   3. nomor asing tidak dapat apa pun; owner platform dapat semua
 *   4. aturan yang sama berlaku untuk bot utama DAN Jadibot (tak ada lagi
 *      syarat `isJadibot`)
 *   5. nomor owner dibaca SEGAR dari berkas setelan, jadi nomor yang baru
 *      diisi di website langsung berlaku tanpa restart
 *   6. handler, auto-ai, dan self-test memakai satu sumber kebenaran
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  canUseOwnerPlugin,
  ownerPluginAccess,
  isPlatformOnlyPlugin,
  PLATFORM_ONLY_PLUGINS,
} from '../lib/owner-policy.js'
import {
  ownerDigits,
  ownerNumberValid,
  mergeOwnerNumbers,
  freshJadibotOwnerNumbers,
  freshMainOwnerNumbers,
} from '../lib/owner-source.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baca = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** Semua plugin nyata yang ber-gate rowner (bukan nama karangan). */
function daftarRownerNyata() {
  const out = []
  const jelajah = dir => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name)
      if (item.isDirectory()) { jelajah(full); continue }
      if (!item.name.endsWith('.js')) continue
      const isi = fs.readFileSync(full, 'utf8')
      if (/handler\.rowner\s*=\s*true/.test(isi)) out.push(path.basename(full))
    }
  }
  jelajah(path.join(ROOT, 'plugins'))
  return out
}

const ROWNER = daftarRownerNyata()

test('TASK124: perintah rowner milik bot terbuka untuk owner bot', () => {
  const perBot = ['usanagi-addowner.js', 'umi-addstok.js', 'umi-setpp.js', 'umi-selfthisgc.js', 'umi-setbio.js']
  for (const name of perBot) {
    assert.equal(isPlatformOnlyPlugin(name), false, `${name} bukan fitur platform`)
    assert.equal(canUseOwnerPlugin(name, { isOwner: true }), true, `${name} boleh untuk owner bot`)
    assert.equal(ownerPluginAccess(name, { isOwner: true }).reason, 'owner bot')
  }

  // Bukti dari repo: mayoritas besar perintah rowner adalah fitur per-bot.
  assert.ok(ROWNER.length >= 100, `plugin rowner nyata: ${ROWNER.length}`)
  const terbuka = ROWNER.filter(name => canUseOwnerPlugin(name, { isOwner: true }))
  const terkunci = ROWNER.filter(name => !canUseOwnerPlugin(name, { isOwner: true }))
  assert.ok(terbuka.length > terkunci.length * 3, `terbuka ${terbuka.length} vs terkunci ${terkunci.length}`)
  assert.ok(terbuka.includes('usanagi-addowner.js'), '.addowner terbuka untuk owner bot')
})

test('TASK124: fitur platform tetap terkunci untuk owner bot', () => {
  const platform = [...PLATFORM_ONLY_PLUGINS.keys()]
  assert.ok(platform.length >= 10, `daftar platform: ${platform.length}`)
  for (const name of platform) {
    assert.equal(canUseOwnerPlugin(name, { isOwner: true }), false, `${name} harus terkunci untuk owner bot`)
    assert.ok(ownerPluginAccess(name, { isOwner: true }).reason.length > 0, 'alasan disebutkan')
    assert.equal(canUseOwnerPlugin(name, { isROwner: true }), true, `${name} tetap untuk owner platform`)
  }
})

test('TASK124: owner bot UTAMA mendapat seluruh fitur (pemilik deployment)', () => {
  const semua = [...PLATFORM_ONLY_PLUGINS.keys(), 'usanagi-addowner.js', 'umi-addstok.js']
  for (const name of semua) {
    assert.equal(
      canUseOwnerPlugin(name, { isOwner: true, botUtama: true }),
      true,
      `owner bot utama: ${name}`,
    )
  }
  // Owner JADIBOT tetap dibatasi untuk fitur lintas akun.
  assert.equal(canUseOwnerPlugin('umi-dellalluser.js', { isOwner: true, botUtama: false }), false)
  assert.equal(canUseOwnerPlugin('usanagi-addowner.js', { isOwner: true, botUtama: false }), true)

  const handler = baca('handler.js')
  assert.match(handler, /botUtama: botConfig\?\.type !== 'jadibot'/, 'handler meneruskan jenis bot')
})

test('TASK124: nomor asing ditolak, owner platform dapat semua', () => {
  assert.equal(canUseOwnerPlugin('usanagi-addowner.js', { isOwner: false }), false)
  assert.equal(canUseOwnerPlugin('usanagi-addowner.js', {}), false)
  assert.equal(ownerPluginAccess('usanagi-addowner.js', {}).allowed, false)
  assert.equal(canUseOwnerPlugin('umi-bcgc.js', { isOwner: true, isROwner: false }), false)
  assert.equal(canUseOwnerPlugin('umi-bcgc.js', { isROwner: true }), true)
})

test('TASK124: aturan sama untuk bot utama & Jadibot (tanpa syarat isJadibot)', () => {
  // Pemanggil lama masih mengirim isJadibot — harus tetap benar.
  assert.equal(canUseOwnerPlugin('usanagi-addowner.js', { isOwner: true, isJadibot: false }), true)
  assert.equal(canUseOwnerPlugin('usanagi-addowner.js', { isOwner: true, isJadibot: true }), true)
  assert.equal(canUseOwnerPlugin('umi-bcgc.js', { isOwner: true, isJadibot: true }), false)

  const handler = baca('handler.js')
  assert.match(handler, /const isBotOwner = Boolean\(/, 'handler punya isBotOwner')
  assert.match(handler, /canUseOwnerPlugin\(pluginBasename, \{/, 'gate memakai kebijakan')
  assert.doesNotMatch(handler, /isJadibot: botConfig\?\.type === 'jadibot'/, 'syarat isJadibot di gate sudah hilang')
  assert.match(handler, /isOwner \? 'platform' : 'rowner'/, 'pesan penolakan membedakan platform vs developer')

  const autoAI = baca('lib/auto-ai.js')
  assert.match(autoAI, /canUseOwnerPlugin/, 'Auto-AI memakai kebijakan yang sama')
})

test('TASK124: nomor owner dibaca segar dari berkas setelan', () => {
  const akses = baca('lib/awang-cekakses.js')
  assert.match(akses, /freshJadibotOwnerNumbers\(botConfig\.file\)/, 'sesi Jadibot dibaca ulang')
  assert.match(akses, /freshMainOwnerNumbers\(\)/, 'bot utama dibaca ulang')
  assert.match(akses, /mergeOwnerNumbers/, 'daftar digabung tanpa duplikat')

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task124-'))
  const sesiFile = path.join(dir, 'bot-config.json')
  fs.writeFileSync(sesiFile, JSON.stringify({ ownerNumbers: ['081234567890', '6281234567890', '628777'] }))

  assert.deepEqual(freshJadibotOwnerNumbers(sesiFile), ['6281234567890'], '0 diubah ke 62, ganda dibuang, nomor pendek ditolak')
  assert.deepEqual(freshJadibotOwnerNumbers(path.join(dir, 'tidak-ada.json')), [], 'berkas hilang = daftar kosong')

  const settingsFile = path.join(dir, 'main-bot-settings.json')
  fs.writeFileSync(settingsFile, JSON.stringify({ ownerNumber: '6283823085746' }))
  const lama = process.env.UMI_MAIN_BOT_SETTINGS_FILE
  process.env.UMI_MAIN_BOT_SETTINGS_FILE = settingsFile
  try {
    assert.deepEqual(freshMainOwnerNumbers(), ['6283823085746'], 'owner bot utama terbaca dari berkas')
  } finally {
    if (lama === undefined) delete process.env.UMI_MAIN_BOT_SETTINGS_FILE
    else process.env.UMI_MAIN_BOT_SETTINGS_FILE = lama
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('TASK124: util nomor owner rapi', () => {
  assert.equal(ownerDigits('0812-3456-7890'), '6281234567890')
  assert.equal(ownerDigits('6281234567890@s.whatsapp.net'), '6281234567890')
  assert.equal(ownerNumberValid('628'), false)
  assert.equal(ownerNumberValid('6281234567890'), true)
  assert.equal(ownerNumberValid('00000000'), false)
  assert.deepEqual(mergeOwnerNumbers(['081234567890'], ['6281234567890', '6289999999999']), [
    '6281234567890',
    '6289999999999',
  ])
})

test('TASK124: self-test akses tersedia di server', () => {
  const sumber = baca('plugins/_system/_akses124.js')
  assert.match(sumber, /export async function jalankanPemeriksaanAkses/)
  assert.match(sumber, /akses-selftest\.json/, 'menulis bukti ke /data/akses-selftest.json')
  for (const bagian of ['sumber-owner', 'uji-owner', 'uji-batas', 'selesai']) {
    assert.ok(sumber.includes(bagian), `tahap ${bagian} dilaporkan`)
  }
  assert.match(sumber, /nomorAsingDitolak/, 'nomor asing diuji')
  assert.match(sumber, /fiturPlatformTerkunci/, 'fitur platform diuji')
  assert.match(sumber, /botUtama: botConfig\?\.type !== 'jadibot'/, 'self-test membedakan bot utama & jadibot')
  assert.match(sumber, /handler\.command = \/\^\(aksescheck/, 'perintah .aksescheck ada')
})

test('TASK124: pengirim ber-LID tetap dikenali sebagai owner', () => {
  const sumber = baca('lib/awang-cekakses.js')
  assert.match(sumber, /export function ingatPemetaanLid/, 'ingatan LID → nomor ada')
  assert.match(sumber, /export function nomorDariIngatanLid/)
  assert.match(sumber, /hints = \[\]/, 'petunjuk nomor dari kunci pesan diterima')
  assert.match(sumber, /raw\.endsWith\('@lid'\)\) continue/, 'petunjuk yang masih LID dilewati')

  const handler = baca('handler.js')
  assert.match(handler, /m\.key\?\.senderPn/, 'handler mengirim senderPn sebagai petunjuk')
  assert.match(handler, /m\.key\?\.participantAlt/, 'handler mengirim participantAlt sebagai petunjuk')
  assert.match(handler, /resolveTargetPhoneNumber\(m\.sender, this, m\.chat, senderNumberHints\)/, 'petunjuk dipakai')
})
