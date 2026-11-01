/**
 * PENJAGA ROOM GAME v3 — mengantar kabar meja ke WhatsApp.
 *
 * Server game v3 TIDAK punya endpoint /api/notify/pending (dihapus di v3.0.0),
 * jadi modul ini memantau lewat endpoint publik:
 *   GET /api/rooms          → daftar meja terbuka
 *   GET /api/rooms/{id}/state → kursi & fase terkini
 *
 * Room yang dipantau = yang tercatat di data/webgame-rooms.json (dibuat
 * lewat plugin game-webmultiplayer). Tiap 25 detik dibandingkan dengan
 * snapshot terakhir:
 *   - jumlah kursi bertambah   → kirim siapa yang duduk
 *   - fase lobby → playing     → kirim pemberitahuan mulai bermain
 *   - room hilang dari daftar  → kirim penutupan + hapus dari registry
 *
 * Tujuan pesan = chat asal pembuatan room (grup tetap grup, privat tetap DM).
 */
import fs from 'node:fs'

const CONFIG_FILES = ['lib/webgame.json', './lib/webgame.json', '/home/container/lib/webgame.json']
const REGISTRY_FILES = ['data/webgame-rooms.json', './data/webgame-rooms.json', '/home/container/data/webgame-rooms.json']
const POLL_MS = 25 * 1000
let timer = null
let busy = false
let configCache = { at: 0, value: null }

function loadConfig() {
  if (configCache.value && Date.now() - configCache.at < 30000) return configCache.value
  let parsed = {}
  for (const file of CONFIG_FILES) {
    try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); break } catch { /* coba berikutnya */ }
  }
  const token = String(parsed.token || process.env.UMI_GAME_TOKEN || '').trim()
  let baseUrl = String(parsed.baseUrl || process.env.UMI_GAME_BASE || '').trim()
  if (!baseUrl) {
    try { baseUrl = 'http://127.0.0.1:' + (process.env.GAME_PORT || '3900') } catch { baseUrl = 'https://game.example.com' }
  }
  baseUrl = baseUrl.replace(/\/+$/, '')
  configCache = { at: Date.now(), value: { enabled: parsed.enabled !== false, baseUrl, token } }
  return configCache.value
}

function jalurRegistry() {
  for (const file of REGISTRY_FILES) {
    try { if (fs.existsSync(file)) return file } catch { /* lanjut */ }
  }
  return REGISTRY_FILES[0]
}

function bacaRegistry() {
  try {
    const data = JSON.parse(fs.readFileSync(jalurRegistry(), 'utf8'))
    if (data && typeof data === 'object' && data.rooms) return data
  } catch { /* belum ada */ }
  return { rooms: {} }
}

function tulisRegistry(data) {
  try {
    fs.writeFileSync(jalurRegistry(), JSON.stringify(data, null, 2), { mode: 0o600 })
  } catch { /* abaikan */ }
}

async function getJson(baseUrl, pathname) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return null
  try { return await res.json() } catch { return null }
}

async function harvest() {
  if (busy) return
  const conn = global.conn
  if (!conn || !conn.user) return
  const cfg = loadConfig()
  if (!cfg.enabled) return
  busy = true
  try {
    const registry = bacaRegistry()
    const ids = Object.keys(registry.rooms || {})
    if (!ids.length) return

    const daftar = await getJson(cfg.baseUrl, '/api/rooms')
    const aktif = new Set(((daftar && daftar.rooms) || []).map((r) => String(r.id)))

    for (const id of ids) {
      const room = registry.rooms[id]
      if (!room) continue
      try {
        if (!aktif.has(id)) {
          const label = room.game || 'meja'
          await conn.reply(room.chat, `🚪 Meja *${label}* \`${id}\` sudah ditutup. Buat baru kapan saja — ketik \`.${room.cmd || 'webgame'}\`.`, null).catch(() => {})
          delete registry.rooms[id]
          continue
        }
        const state = await getJson(cfg.baseUrl, `/api/rooms/${id}/state`)
        const view = (state && (state.view || state)) || null
        if (!view) continue
        const seats = Array.isArray(view.seats) ? view.seats : []
        const phase = String(view.phase || '')
        const snap = room.snap || { seats: 0, phase: 'lobby' }

        /* Kursi bertambah → siapa yang duduk. */
        if (seats.length > Number(snap.seats || 0)) {
          const baru = seats.slice(Number(snap.seats || 0))
          const nama = baru.map((s) => s.name || 'Pemain').join(', ')
          await conn.reply(room.chat, `🪑 ${nama} duduk di meja *${room.game || ''}* \`${id}\` (${seats.length}/${view.max || '?'} pemain).`, null).catch(() => {})
        }

        /* Fase berubah → mulai / selesai. */
        if (phase && phase !== snap.phase) {
          if (phase === 'playing') {
            await conn.reply(room.chat, `🎲 Permainan *${room.game || ''}* \`${id}\` dimulai! Yang belum masuk, gas buka tautannya.`, null).catch(() => {})
          } else if (phase === 'finished') {
            await conn.reply(room.chat, `🏁 Permainan *${room.game || ''}* \`${id}\` selesai.`, null).catch(() => {})
          }
        }

        room.snap = { seats: seats.length, phase: phase || snap.phase }
      } catch (error) {
        console.log('[room-notify] gagal cek room', id, ':', error?.message || error)
      }
    }
    tulisRegistry(registry)
  } catch (error) {
    if (!/abort|timeout|fetch failed/i.test(String(error?.message || ''))) console.log('[room-notify]', error?.message || error)
  } finally {
    busy = false
  }
}

export function startGameRoomNotifier() {
  if (timer) return timer
  timer = setInterval(() => { harvest().catch(() => {}) }, POLL_MS)
  if (timer.unref) timer.unref()
  setTimeout(() => { harvest().catch(() => {}) }, 8000)
  console.log('[room-notify] v3 aktif — pantau meja game tiap 25 detik')
  return timer
}

export function stopGameRoomNotifier() {
  if (timer) clearInterval(timer)
  timer = null
}
