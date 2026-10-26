/* Task112 — filter prefix harus benar-benar ketat.
 *
 * Keluhan: prefix disetel hanya "/" tetapi bot tetap menjawab ".menu".
 * Uji ini memakai kode ASLI: lib/prefix-policy.js, lib/bot-config.js,
 * plugin owner/usanagi-setprefix.js, dan SQLite sungguhan (better-sqlite3).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const hasil = []
const cek = (n, l, i = '') => { hasil.push(l); console.log(`${l ? 'LULUS' : 'GAGAL'} · ${n}${i ? ' — ' + i : ''}`) }

const policy = await import('../lib/prefix-policy.js')
const { resolveIncomingPrefix, normalizePrefixMode, isPrefixMode } = policy

const PLUGINS = {
  'plugins/main/umi-menu.js': { command: /^(menu|umimenu)$/i },
  'plugins/fun/usanagi-dimana.js': { command: /^(dimana|mana)$/i },
  'plugins/info/ping.js': { command: ['ping'] },
}

/* ── 1. Kebijakan prefix (inti bug) ───────────────────────────── */
{
  const strict = resolveIncomingPrefix({ text: '/menu', plugins: PLUGINS, activePrefix: '/', mode: undefined })
  cek('bawaan = strict (mode tidak disetel)', strict.mode === 'strict')
  cek('prefix "/" → "/menu" dijalankan', strict.matched === true && strict.prefix === '/')

  const salah = resolveIncomingPrefix({ text: '.menu', plugins: PLUGINS, activePrefix: '/', mode: undefined })
  cek('prefix "/" → ".menu" DITOLAK (bug yang dilaporkan)', salah.matched === false, `matched=${salah.matched}`)
  cek('prefix "/" → ".menu" tidak mengganti prefix', salah.prefix === '/' && salah.alternate === false)

  const lain = resolveIncomingPrefix({ text: '!ping', plugins: PLUGINS, activePrefix: '/', mode: 'strict' })
  cek('prefix "/" → "!ping" ditolak', lain.matched === false)

  const tanda = resolveIncomingPrefix({ text: '.menu', plugins: PLUGINS, activePrefix: '★', mode: 'strict' })
  cek('prefix "★" → ".menu" ditolak', tanda.matched === false)

  // Mode longgar tetap tersedia bila pemilik bot menyalakannya sendiri.
  const longgar = resolveIncomingPrefix({ text: '.menu', plugins: PLUGINS, activePrefix: '/', mode: 'loose' })
  cek('mode loose → ".menu" diterima (opsional)', longgar.matched === true && longgar.alternate === true)
  cek('mode loose tetap menerima prefix asli', resolveIncomingPrefix({ text: '/menu', plugins: PLUGINS, activePrefix: '/', mode: 'loose' }).matched === true)

  // Kata biasa bukan perintah: tidak boleh dianggap command di mode apa pun.
  const biasa = resolveIncomingPrefix({ text: 'halo semua', plugins: PLUGINS, activePrefix: '/', mode: 'loose' })
  cek('teks biasa tidak dianggap perintah', biasa.matched === false)

  cek('spasi di awal tetap dikenali', resolveIncomingPrefix({ text: '   /ping', plugins: PLUGINS, activePrefix: '/', mode: 'strict' }).matched === true)
}

/* ── 2. Normalisasi nilai mode ────────────────────────────────── */
{
  cek('normalize: kosong → strict', normalizePrefixMode('') === 'strict')
  cek('normalize: "LOOSE" → loose', normalizePrefixMode('LOOSE') === 'loose')
  cek('normalize: "ketat" → strict', normalizePrefixMode('ketat') === 'strict')
  cek('normalize: "bebas" → loose', normalizePrefixMode('bebas') === 'loose')
  cek('normalize: nilai aneh → strict', normalizePrefixMode('xyz') === 'strict')
  cek('normalize: null → strict', normalizePrefixMode(null) === 'strict')
  cek('isPrefixMode: strict/loose/ketat/bebas benar', isPrefixMode('strict') && isPrefixMode('loose') && isPrefixMode('ketat') && isPrefixMode('bebas'))
  cek('isPrefixMode: nilai aneh ditolak', isPrefixMode('xyz') === false && isPrefixMode('') === false)
}

/* ── 3. Config jadibot menyimpan mode (kode asli bot-config.js) ─ */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'umi-prefix-'))
const botConfigMod = await import('../lib/bot-config.js')
let profil
{
  profil = botConfigMod.loadJadibotConfig('628111222333', tmp)
  cek('config baru → mode strict', profil.prefixMode === 'strict', String(profil.prefixMode))
  profil.defaultPrefix = '/'
  profil.prefixMode = 'loose'
  botConfigMod.saveJadibotConfig(profil)
  const isi = JSON.parse(fs.readFileSync(path.join(tmp, 'bot-config.json'), 'utf8'))
  cek('prefix "/" tersimpan di berkas', isi.defaultPrefix === '/', String(isi.defaultPrefix))
  cek('mode loose tersimpan di berkas', isi.prefixMode === 'loose', String(isi.prefixMode))
  const muat = botConfigMod.loadJadibotConfig('628111222333', tmp)
  cek('dibaca ulang: prefix tetap "/"', muat.defaultPrefix === '/')
  cek('dibaca ulang: mode tetap loose', muat.prefixMode === 'loose')
}

/* ── 4. Plugin .setprefix memakai kode asli + SQLite sungguhan ── */
const plugin = (await import('../plugins/owner/usanagi-setprefix.js')).default
const db = (await import('../core/awang-sqlite.js')).getDb()
const scope = profil.scope
const chatKey = `${scope}:628111222333@s.whatsapp.net`

function panggil(teks, opsi = {}) {
  const terkirim = []
  const conn = { sendMessage: async (jid, isi) => { terkirim.push(String(isi.text || '')); return {} } }
  const m = { chat: '628111222333@s.whatsapp.net', text: teks, args: teks.split(/\s+/).filter(Boolean), raw: null }
  const extra = {
    conn, usedPrefix: profil.defaultPrefix || '.', botConfig: profil,
    prefixStorageKey: chatKey, isOwner: opsi.isOwner !== false, isROwner: opsi.isOwner !== false,
    isAdmin: false,
  }
  return plugin(m, extra).then(() => terkirim.join('\n'))
}

{
  // baris prefix per-chat lama (mis. "." dari sebelum owner ganti)
  db.prepare('INSERT OR REPLACE INTO prefixes (chatId, prefix) VALUES (?, ?)').run(chatKey, '.')
  cek('sebelum uji: baris prefix lama ada', Boolean(db.prepare('SELECT 1 FROM prefixes WHERE chatId = ?').get(chatKey)))

  // owner mengubah prefix global ke "/"
  profil.prefixMode = 'strict'
  const balas = await panggil('global /')
  cek('global "/" → dibalas sukses', /Prefix default bot ini diubah/i.test(balas), balas.slice(0, 60))
  cek('global "/" → tersimpan di config', JSON.parse(fs.readFileSync(path.join(tmp, 'bot-config.json'), 'utf8')).defaultPrefix === '/')
  cek('global "/" → baris prefix lama sesi ini dibuang', db.prepare('SELECT 1 FROM prefixes WHERE chatId = ?').get(chatKey) === undefined)

  // mode
  const modeBalas = await panggil('mode strict')
  cek('mode strict → dibalas', /Mode prefix: \*strict\*/i.test(modeBalas), modeBalas.slice(0, 50))
  cek('mode strict tersimpan', JSON.parse(fs.readFileSync(path.join(tmp, 'bot-config.json'), 'utf8')).prefixMode === 'strict')

  const modeInfo = await panggil('mode')
  cek('mode tanpa argumen → menampilkan mode', /Mode prefix bot ini/i.test(modeInfo))

  const modeSalah = await panggil('mode ngawur')
  cek('mode ngawur → ditolak', /strict atau loose/i.test(modeSalah))

  const bukanOwner = await panggil('mode loose', { isOwner: false })
  cek('bukan owner → mode tidak bisa diubah', /Hanya owner/i.test(bukanOwner))

  // Setelah semua itu, keputusan prefix untuk pesan berikutnya:
  const aktif = profil.defaultPrefix
  const salahPrefix = resolveIncomingPrefix({ text: '.menu', plugins: PLUGINS, activePrefix: aktif, mode: profil.prefixMode })
  const benarPrefix = resolveIncomingPrefix({ text: '/menu', plugins: PLUGINS, activePrefix: aktif, mode: profil.prefixMode })
  cek('setelah setelan: "/menu" dijalankan', benarPrefix.matched === true)
  cek('setelah setelan: ".menu" diabaikan', salahPrefix.matched === false)
}

/* ── 5. Handler memakai kebijakan ini (bukan deteksi bebas) ───── */
{
  const handler = fs.readFileSync(new URL('../handler.js', import.meta.url), 'utf8')
  cek('handler memakai resolveIncomingPrefix', /resolveIncomingPrefix\(/.test(handler))
  cek('handler membaca botConfig.prefixMode', /botConfig\s*&&\s*botConfig\.prefixMode/.test(handler))
  cek('handler tidak lagi memanggil deteksi bebas langsung', !/detectAlternatePrefix\(/.test(handler))
}

try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
try { db.prepare('DELETE FROM prefixes WHERE chatId = ?').run(chatKey) } catch {}

const gagal = hasil.filter(x => !x).length
console.log(`\n${hasil.length - gagal}/${hasil.length} lulus`)
process.exit(gagal ? 1 : 0)
