/* By AlzRiss - Usanagi Umi AI
 *
 * GAMELOGIN — buat/cek akun UMI GAMES (game.gwenna.my.id) yang terkait
 * nomor WhatsApp pemain. Akun dipakai untuk masuk ke website game
 * (lobby, room multiplayer, dan pasar $AS).
 *
 * Perintah:
 *   /gamelogin            → buat akun (kalau belum ada) lalu kirim name+pin
 *   /gamelogin ulang      → kirim ulang kredensial tersimpan
 *   /gamelogin hapus      → hapus catatan bot (akun di server tetap ada)
 *
 * API v3 yang dipakai:
 *   POST /api/auth/register { name, pin } → daftar
 *   POST /api/auth/login    { name, pin } → masuk (verifikasi kredensial)
 *
 * Name dibuat dari nomor WA (wa628xxx) supaya unik & mudah dikenali.
 * Pin = 6 digit acak, disimpan di data/game-accounts.json (mode 600).
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_FILE = path.resolve(__dirname, '../../lib/webgame.json')
const AKUN_FILE = path.resolve(__dirname, '../../data/game-accounts.json')
const TIMEOUT_MS = 20000

let configCache = { at: 0, value: null }
function loadConfig() {
  if (configCache.value && Date.now() - configCache.at < 30000) return configCache.value
  let parsed = {}
  try { parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) } catch { /* fallback env */ }
  const baseUrl = String(parsed.baseUrl || process.env.UMI_GAME_BASE || 'https://game.example.com').replace(/\/+$/, '')
  configCache = { at: Date.now(), value: { enabled: parsed.enabled !== false, baseUrl } }
  return configCache.value
}

async function apiPost(cfg, pathname, body) {
  const res = await fetch(`${cfg.baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  let data = {}
  try { data = await res.json() } catch { /* non-JSON */ }
  return { status: res.status, data }
}

function bacaAkun() {
  try {
    const data = JSON.parse(fs.readFileSync(AKUN_FILE, 'utf8'))
    if (data && typeof data === 'object') return data
  } catch { /* belum ada */ }
  return { akun: {} }
}

function tulisAkun(data) {
  try {
    fs.mkdirSync(path.dirname(AKUN_FILE), { recursive: true })
    fs.writeFileSync(AKUN_FILE, JSON.stringify(data, null, 2), { mode: 0o600 })
  } catch (error) {
    console.warn('[gamelogin] gagal tulis:', error?.message || error)
  }
}

const pinAcak = () => String(crypto.randomInt(100000, 1000000))
const namaDariNomor = (jid) => 'wa' + String(jid || '').split('@')[0].replace(/\D/g, '')

const handler = async (m, { conn, args, usedPrefix }) => {
  const cfg = loadConfig()
  if (!cfg.enabled) throw 'Server game sedang nonaktif (lib/webgame.json).'

  const sub = String(args?.[0] || '').toLowerCase()
  const db = bacaAkun()
  const jid = m.sender
  const tersimpan = db.akun[jid] || null

  /* Hapus catatan lokal. */
  if (sub === 'hapus') {
    if (db.akun[jid]) {
      delete db.akun[jid]
      tulisAkun(db)
      return m.reply('🗑️ Catatan akun game di bot dihapus. Akun di website game tetap ada — daftar ulang pakai /gamelogin untuk kredensial baru.')
    }
    return m.reply('Belum ada catatan akun game untuk nomor ini.')
  }

  /* Kirim ulang kredensial tersimpan. */
  if (sub === 'ulang') {
    if (!tersimpan) throw `Belum ada akun untuk nomor ini. Ketik ${usedPrefix}gamelogin dulu.`
    return conn.reply(m.chat, `🔐 *Akun UMI GAMES kamu*

👤 Name : \`${tersimpan.name}\`
🔑 Pin  : \`${tersimpan.pin}\`

Masuk di: ${cfg.baseUrl}/#/masuk
Atau lewat menu Masuk di website game.`, m)
  }

  const name = namaDariNomor(jid)

  /* Sudah punya catatan → verifikasi masih hidup dengan login. */
  if (tersimpan) {
    const cek = await apiPost(cfg, '/api/auth/login', { name: tersimpan.name, pin: tersimpan.pin })
    if (cek.data && cek.data.ok) {
      return conn.reply(m.chat, `✅ Akun game kamu sudah aktif.

👤 Name : \`${tersimpan.name}\`
🔑 Pin  : \`${tersimpan.pin}\` (lupa? /gamelogin ulang)

Masuk di: ${cfg.baseUrl}/#/masuk`, m)
    }
    /* Kredensial tidak diterima → buat baru. */
  }

  const pin = pinAcak()
  const reg = await apiPost(cfg, '/api/auth/register', { name, pin })
  let namaAkun = name
  let pinAkun = pin
  if (reg.data && reg.data.ok) {
    namaAkun = String(reg.data.player?.name || name)
    pinAkun = pin
  } else {
    /* Name sudah terpakai → coba login dgn pin lama bila ada, kalau gagal pakai name acak. */
    if (tersimpan) {
      const coba = await apiPost(cfg, '/api/auth/login', { name: tersimpan.name, pin: tersimpan.pin })
      if (coba.data && coba.data.ok) {
        return conn.reply(m.chat, `✅ Akun game lama kamu masih dipakai: \`${tersimpan.name}\`. Pin: \`${tersimpan.pin}\`.`, m)
      }
    }
    const nameBaru = name + '-' + crypto.randomInt(100, 1000)
    const pinBaru = pinAcak()
    const reg2 = await apiPost(cfg, '/api/auth/register', { name: nameBaru, pin: pinBaru })
    if (!(reg2.data && reg2.data.ok)) {
      throw `Pendaftaran akun game gagal: ${String(reg.data?.error || reg2.data?.error || ('HTTP ' + reg.status)).slice(0, 120)}`
    }
    namaAkun = String(reg2.data.player?.name || nameBaru)
    pinAkun = pinBaru
  }

  db.akun[jid] = { name: namaAkun, pin: pinAkun, dibuat: Date.now() }
  tulisAkun(db)

  return conn.reply(m.chat, `🎉 *Akun UMI GAMES dibuat!*

👤 Name : \`${namaAkun}\`
🔑 Pin  : \`${pinAkun}\`

Simpan name & pin ini — dipakai masuk website game:
${cfg.baseUrl}/#/masuk

Dari website kamu bisa main UNO, Catur, Ular Tangga, Monopoli, dan lainnya bareng teman WhatsApp. Buat meja langsung dari chat: \`.uno\`, \`.caturweb\`, \`.utweb\`, dll.`, m)
}

handler.help = ['gamelogin', 'gamelogin ulang', 'gamelogin hapus']
handler.tags = ['game']
handler.command = /^gamelogin$/i
handler.register = false
handler.limit = false

export default handler
