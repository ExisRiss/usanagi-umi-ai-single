/* By AlzRiss - Usanagi Umi AI
 *
 * Umi Web Games v3 — jembatan WhatsApp ke server game multiplayer web
 * (UMI GAMES v3, game.gwenna.my.id). Tujuh meja: UNO, UNO Flip, Catur,
 * Ular Tangga, Monopoli, Property Empire, Werewolf.
 *
 * API v3 yang dipakai (terpetakan 2026-11-01):
 *   POST /api/rooms/create { game }        → { roomId, token (host), view }
 *   POST /api/rooms/{id}/join { name }     → { token (seat), view }
 *   POST /api/rooms/{id}/start { token }   → mulai (hanya host)
 *   GET  /api/rooms/{id}/state             → view { seats, phase, log }
 *   GET  /api/rooms                        → daftar publik
 *   GET  /api/health
 *
 * Alur pemain:
 *   1. `.uno`                 → bot membuat meja + kirim tautan
 *   2. teman buka tautan      → masuk/duduk di web (akun game, /gamelogin)
 *   3. `.uno start <id>`      → host (pembuat room) memulai permainan
 *   4. notifikasi join/mulai/tutup dikirim bot ke chat asal (poller v3)
 *
 * Token host disimpan di data/webgame-rooms.json agar perintah start
 * berasal dari pemilik room yang sama. Konfigurasi: lib/webgame.json.
 *
 * Catatan teknis: plugin dibatasi ES2020 — tanpa ||= / ??=.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_FILE = path.resolve(__dirname, '../../lib/webgame.json')
const REGISTRY_FILE = path.resolve(__dirname, '../../data/webgame-rooms.json')
const TIMEOUT_MS = 20000

/* Nama perintah → id game di server. */
const GAMES = {
  uno: { id: 'uno', label: 'UNO', emoji: '🃏' },
  unoflip: { id: 'unoflip', label: 'UNO Flip', emoji: '🔄' },
  caturweb: { id: 'chess', label: 'Catur Web', emoji: '♟️' },
  utweb: { id: 'snakes', label: 'Ular Tangga Web', emoji: '🎲' },
  monopoli: { id: 'monopoly', label: 'Monopoli Web', emoji: '🏙️' },
  empire: { id: 'empire', label: 'Property Empire', emoji: '🎩' },
  wwweb: { id: 'werewolf', label: 'Werewolf Web', emoji: '🐺' },
}
const COMMANDS = Object.keys(GAMES)
console.log(`[WEBGAME] plugin v3 aktif — ${COMMANDS.length} meja: ${COMMANDS.join(', ')}`)

/* ── config & api ─────────────────────────────────────────────────────── */

let configCache = { at: 0, value: null }
function loadConfig() {
  if (configCache.value && Date.now() - configCache.at < 30000) return configCache.value
  let parsed = {}
  try { parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) } catch { /* fallback env */ }
  const token = String(parsed.token || process.env.UMI_GAME_TOKEN || '').trim()
  const baseUrl = String(parsed.baseUrl || process.env.UMI_GAME_BASE || 'https://game.example.com').replace(/\/+$/, '')
  configCache = { at: Date.now(), value: { enabled: parsed.enabled !== false, baseUrl, token } }
  return configCache.value
}

async function api(cfg, pathname, { method = 'GET', body } = {}) {
  const res = await fetch(`${cfg.baseUrl}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  let data = {}
  try { data = await res.json() } catch { /* balasan non-JSON */ }
  if (!res.ok) throw String(data.error || `Server game membalas HTTP ${res.status}`)
  return data
}

/* ── registry room (dibaca bersama oleh poller notifikasi) ────────────── */

function bacaRegistry() {
  try {
    const data = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'))
    if (data && typeof data === 'object') return data
  } catch { /* belum ada */ }
  return { rooms: {} }
}

function tulisRegistry(data) {
  try {
    fs.mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true })
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2), { mode: 0o600 })
  } catch (error) {
    console.warn('[webgame] gagal tulis registry:', error?.message || error)
  }
}

/* Bersihkan room yang sudah lama (> 6 jam). */
function bersihkanRegistry(data) {
  const batas = Date.now() - 6 * 60 * 60 * 1000
  let dibuang = 0
  for (const [id, room] of Object.entries(data.rooms || {})) {
    if (Number(room.dibuat || 0) < batas) { delete data.rooms[id]; dibuang++ }
  }
  return dibuang
}

/* ── helper ───────────────────────────────────────────────────────────── */

const cleanNumber = (jid) => String(jid || '').split('@')[0].replace(/\D/g, '')
const isRoomId = (value) => /^[A-Za-z0-9]{6,14}$/.test(String(value || ''))
const cleanName = (m) => {
  const user = global.db?.data?.users?.[m.sender]
  const name = String(user?.name || m.pushName || '').trim()
  return name ? name.slice(0, 24) : 'Pemain'
}
const roomUrl = (cfg, roomId) => `${cfg.baseUrl}/#/room/${roomId}`
const labelGame = (id) => {
  const g = Object.values(GAMES).find((x) => x.id === id)
  return g ? g.label : String(id || 'Game')
}
const emojiGame = (id) => {
  const g = Object.values(GAMES).find((x) => x.id === id)
  return g ? g.emoji : '🎮'
}

const FASE = { lobby: 'menunggu pemain', playing: 'sedang bermain', finished: 'selesai', closed: 'ditutup' }

function helpText(usedPrefix) {
  const rows = Object.entries(GAMES)
    .map(([cmd, g]) => `${g.emoji} ${usedPrefix}${cmd.padEnd(10)} — ${g.label}`)
    .join('\n')
  return `🎮 *UMI WEB GAMES v3*

Main bareng di browser — buat meja, undang teman, semua dikendalikan dari WhatsApp.

${rows}

*Perintah:*
• ${usedPrefix}uno → buat meja + tautan undangan
• ${usedPrefix}uno join <id> → minta tautan meja teman
• ${usedPrefix}uno start <id> → mulai permainan (host)
• ${usedPrefix}webgame room <id> → intip keadaan meja
• /gamelogin → buat akun game biar bisa masuk web

Pemain duduk lewat web (akun /gamelogin). Bot memberi tahu saat ada yang
join, permainan dimulai, atau meja ditutup.`
}

/* ── aksi ─────────────────────────────────────────────────────────────── */

async function createRoom(m, conn, cmd, cfg, usedPrefix) {
  const game = GAMES[cmd]
  const data = await api(cfg, '/api/rooms/create', {
    method: 'POST',
    body: { game: game.id },
  })
  const roomId = String(data.roomId || '')
  const roomToken = String(data.token || '')

  const registry = bacaRegistry()
  bersihkanRegistry(registry)
  registry.rooms[roomId] = {
    game: game.id,
    cmd,
    chat: m.chat,
    sender: m.sender,
    nama: cleanName(m),
    roomToken,
    dibuat: Date.now(),
    snap: { seats: Number(data.view?.seats?.length || 0), phase: String(data.view?.phase || 'lobby') },
  }
  tulisRegistry(registry)

  await conn.reply(m.chat, `${game.emoji} *Meja ${game.label} siap!*

🆔 Room: \`${roomId}\`
🔗 ${roomUrl(cfg, roomId)}

Cara main:
1. Sebarkan tautan ke teman (atau mereka ketik \`${usedPrefix}${cmd} join ${roomId}\`).
2. Semua pemain masuk lewat web — akun dari /gamelogin (atau daftar langsung di web).
3. Kalau sudah cukup pemain, kamu (host) ketik \`${usedPrefix}${cmd} start ${roomId}\`.

Bot memberi tahu otomatis di chat ini saat ada yang join atau permainan dimulai.`, m)
}

async function joinInfo(m, conn, cmd, cfg, roomId, usedPrefix) {
  const state = await api(cfg, `/api/rooms/${roomId}/state`).catch(() => null)
  if (!state || !state.ok) throw `Room \`${roomId}\` tidak ditemukan atau sudah ditutup.`
  const view = state.view || state
  const game = labelGame(view.game)
  const terisi = (view.seats || []).length
  const maks = Number(view.max || '?')
  await conn.reply(m.chat, `${emojiGame(view.game)} *${game}* \`${roomId}\` — ${terisi}/${maks} pemain (${FASE[view.phase] || view.phase})

🔗 ${roomUrl(cfg, roomId)}

Buka tautan di atas lalu duduk di meja. Belum punya akun? /gamelogin dulu supaya namamu langsung dikenal. Kalau kamu host, mulai dengan \`${usedPrefix}${cmd} start ${roomId}\`.`, m)
}

async function startRoom(m, conn, cmd, cfg, roomId) {
  const registry = bacaRegistry()
  const info = registry.rooms[roomId]
  if (!info || info.sender !== m.sender) {
    throw `Hanya pembuat room \`${roomId}\` yang bisa memulai. Minta dia ketik \`${cmd} start ${roomId}\`.`
  }
  if (!info.roomToken) throw 'Token host room ini tidak tersimpan di bot. Buat meja baru.'
  const data = await api(cfg, `/api/rooms/${roomId}/start`, {
    method: 'POST',
    body: { token: info.roomToken },
  })
  const view = data.view || {}
  info.snap = info.snap || {}
  info.snap.phase = String(view.phase || 'playing')
  tulisRegistry(registry)
  await conn.reply(m.chat, `🎲 *${labelGame(view.game)}* (${roomId}) dimulai — selamat bermain!
🔗 ${roomUrl(cfg, roomId)}`, m)
}

async function showRoom(m, conn, cfg, roomId) {
  const state = await api(cfg, `/api/rooms/${roomId}/state`).catch(() => null)
  if (!state || !state.ok) throw `Room \`${roomId}\` tidak ditemukan.`
  const view = state.view || state
  const seats = (view.seats || [])
    .map((s) => `${Number(s.i) + 1}. ${s.name || 'Pemain'}${s.bot ? ' 🤖' : ''}${s.online ? '' : ' (offline)'}`)
    .join('\n')
  return conn.reply(m.chat, `${emojiGame(view.game)} *Meja ${labelGame(view.game)}* \`${roomId}\`

Status: ${FASE[view.phase] || view.phase}
Pemain: ${(view.seats || []).length}/${view.max || '?'}
${seats || '(kosong)'}

🔗 ${roomUrl(cfg, roomId)}`, m)
}

/* ── handler ──────────────────────────────────────────────────────────── */

const handler = async (m, { conn, usedPrefix, args, command }) => {
  const cfg = loadConfig()
  if (!cfg.enabled) throw 'Umi Web Games sedang dinonaktifkan (lib/webgame.json).'

  const cmd = String(command || '').toLowerCase()
  const sub = String(args?.[0] || '').toLowerCase()
  const target = String(args?.[1] || '')

  if (cmd === 'webgame') {
    if (sub === 'room' && isRoomId(target)) return showRoom(m, conn, cfg, target)
    if (sub === 'join' && isRoomId(target)) return joinInfo(m, conn, 'webgame', cfg, target, usedPrefix)
    let health = 'tidak diketahui'
    try {
      const h = await api(cfg, '/api/health')
      const rooms = await api(cfg, '/api/rooms').catch(() => ({ rooms: [] }))
      health = `UMI GAMES v${h.version || '?'} — ${h.players ?? '?'} pemain online, ${(rooms.rooms || []).length} meja terbuka`
    } catch (error) { health = `gangguan (${String(error).slice(0, 60)})` }
    return conn.reply(m.chat, `${helpText(usedPrefix)}\n\n🛰️ Server: ${health}`, m)
  }

  if (!GAMES[cmd]) return
  const aksi = String(args?.[0] || '').toLowerCase()

  /* Tanpa argumen → buat meja baru. */
  if (!args?.length) return createRoom(m, conn, cmd, cfg, usedPrefix)
  /* `<cmd> join <id>` → tautan + info duduk. */
  if (aksi === 'join' && isRoomId(target)) return joinInfo(m, conn, cmd, cfg, target, usedPrefix)
  /* `<cmd> start <id>` → mulai (host). */
  if (aksi === 'start' && isRoomId(target)) return startRoom(m, conn, cmd, cfg, target)
  /* `<cmd> room <id>` → keadaan meja. */
  if (aksi === 'room' && isRoomId(target)) return showRoom(m, conn, cfg, target)

  throw `Perintah tidak dikenal. Contoh: ${usedPrefix}${cmd} · ${usedPrefix}${cmd} join <id> · ${usedPrefix}${cmd} start <id>`
}

handler.help = ['webgame', ...COMMANDS]
handler.tags = ['game']
handler.command = new RegExp(`^(${['webgame', ...COMMANDS].join('|')})$`, 'i')
handler.register = false
handler.limit = false

export default handler
