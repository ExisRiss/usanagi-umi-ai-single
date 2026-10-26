/* By AlzRiss - Usanagi Umi AI
 *
 * Filter "pesan sesama bot" untuk Auto-AI.
 *
 * Masalahnya: satu proses ini menjalankan bot utama + semua sesi jadibot.
 * Kalau dua bot kumpul di grup yang sama, balasan bot A dianggap "mention /
 * reply ke bot" oleh bot B, lalu dibalas lagi oleh A — percakapan bot ke bot
 * yang tidak pernah selesai dan memakan kuota model. Filter ini memutusnya
 * SEBELUM Auto-AI memanggil model.
 *
 * Urutan pemeriksaan (yang pasti didahulukan, heuristik paling akhir):
 *
 *   1. nomor bot kita sendiri (bot utama + semua sesi jadibot)  → pasti bot
 *   2. nomor di daftar pantau owner (data/auto-ai-bot-filter.json) → pasti bot
 *   3. device pesan "tidak dikenal" / id berawalan BAE5            → pesan library
 *   4. tipe pesan yang hanya bisa dikirim lewat API (interactive,
 *      buttons, list, template)                                    → pasti bot
 *   5. mode `web` (opsional, bawaan MATI): semua device web
 *      dianggap bot — berguna bila grup dipenuhi bot Baileys,
 *      tapi orang yang chat dari WhatsApp Web ikut terlewat.
 *   6. skor heuristik ≥ 6 (id 3EB0 + tanpa deviceListMetadata +
 *      nama pengirim bernuansa bot + ada footer)
 *
 * Di luar itu ada dua jaring pengaman supaya loop tetap berhenti walau bot
 * lawan tidak terdeteksi:
 *
 *   - gema: teks masuk nyaris sama dengan balasan Auto-AI terakhir kita
 *     di chat itu (bot yang mengutip balasan kita bolak-balik)
 *   - pemutus: ≥ 4 balasan Auto-AI ke pengirim yang sama dalam 60 detik.
 *
 * Setelan disimpan di data/auto-ai-bot-filter.json dan bisa diubah owner
 * lewat `.setbotfilter`.
 */
import fs from 'node:fs'
import path from 'node:path'

// Bisa diarahkan ke berkas lain saat pengujian (UMI_BOT_FILTER_FILE).
const STORE_FILE = process.env.UMI_BOT_FILTER_FILE || path.join(process.cwd(), 'data', 'auto-ai-bot-filter.json')
const MAX_MANUAL = 200
const OWN_CACHE_MS = 8000
const STOPPER_WINDOW_MS = 60000
const STOPPER_LIMIT = 4

const DEFAULTS = {
  enabled: true,         // filter bot aktif
  filterWebDevice: false, // mode agresif: device web dianggap bot
  stopper: true,         // pemutus loop otomatis
  numbers: [],           // nomor bot tambahan (diisi owner)
}

/* ── penyimpanan setelan ─────────────────────────────────────────── */

let cache = null
let cacheMtime = 0

function sanitizeStore(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const numbers = []
  const seen = new Set()
  for (const item of Array.isArray(source.numbers) ? source.numbers : []) {
    const number = normalizeNumber(item)
    if (!number || number.length < 6 || seen.has(number)) continue
    seen.add(number)
    numbers.push(number)
    if (numbers.length >= MAX_MANUAL) break
  }
  return {
    enabled: source.enabled !== false,
    filterWebDevice: source.filterWebDevice === true,
    stopper: source.stopper !== false,
    numbers,
    updatedAt: String(source.updatedAt || ''),
  }
}

export function getBotFilterSettings() {
  try {
    const stat = fs.statSync(STORE_FILE)
    if (cache && stat.mtimeMs === cacheMtime) return cache
    cache = sanitizeStore(JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')))
    cacheMtime = stat.mtimeMs
    return cache
  } catch {
    if (!cache) cache = sanitizeStore(DEFAULTS)
    return cache
  }
}

export function updateBotFilter(patch = {}) {
  const merged = sanitizeStore({ ...getBotFilterSettings(), ...patch })
  merged.updatedAt = new Date().toISOString()
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true })
    const temp = `${STORE_FILE}.${process.pid}.tmp`
    fs.writeFileSync(temp, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 })
    fs.renameSync(temp, STORE_FILE)
    cache = merged
    try { cacheMtime = fs.statSync(STORE_FILE).mtimeMs } catch { cacheMtime = 0 }
  } catch (error) {
    console.warn('[BOT-FILTER] gagal menyimpan setelan:', String(error && error.message || error).slice(0, 120))
  }
  return merged
}

export function addBotNumber(value) {
  const number = normalizeNumber(value)
  if (!number || number.length < 6) return { ok: false, reason: 'nomor tidak valid', settings: getBotFilterSettings() }
  const settings = getBotFilterSettings()
  if (settings.numbers.includes(number)) return { ok: true, added: false, number, settings }
  const numbers = [...settings.numbers, number].slice(-MAX_MANUAL)
  return { ok: true, added: true, number, settings: updateBotFilter({ numbers }) }
}

export function removeBotNumber(value) {
  const number = normalizeNumber(value)
  const settings = getBotFilterSettings()
  if (!number || !settings.numbers.includes(number)) return { ok: false, reason: 'nomor tidak ada di daftar', settings }
  return { ok: true, removed: true, number, settings: updateBotFilter({ numbers: settings.numbers.filter(item => item !== number) }) }
}

/* ── nomor & identitas ───────────────────────────────────────────── */

/** "0 812-345" / "62812345:12@s.whatsapp.net" → "62812345" */
export function normalizeNumber(value) {
  const raw = String(value === undefined || value === null ? '' : value).split('@')[0].split(':')[0]
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits
}

const ownCache = { at: 0, size: -1, identities: new Set() }

function addIdentity(set, value) {
  const number = normalizeNumber(value)
  if (number && number.length >= 6) set.add(number)
}

function addConnIdentities(set, conn) {
  if (!conn || typeof conn !== 'object') return
  addIdentity(set, conn.user && conn.user.id)
  addIdentity(set, conn.user && conn.user.jid)
  addIdentity(set, conn.user && conn.user.lid)
  const me = conn.authState && conn.authState.creds && conn.authState.creds.me
  addIdentity(set, me && me.id)
  addIdentity(set, me && me.lid)
  addIdentity(set, conn.botNumber)
  addIdentity(set, conn.botJid)
  addIdentity(set, conn.__botNumber)
}

function sessionDirectoryNumbers() {
  const numbers = []
  try {
    const base = path.join(process.cwd(), 'sessions', 'jadibot')
    for (const name of fs.readdirSync(base)) {
      const number = normalizeNumber(name)
      if (number && number.length >= 8) numbers.push(number)
    }
  } catch {}
  return numbers
}

/**
 * Semua nomor bot yang berjalan DI PROSES INI (bot utama + jadibot).
 * Hasilnya di-cache sebentar karena dipanggil untuk setiap pesan masuk.
 */
export function ownBotIdentities(conn) {
  let size = -1
  try { size = global.jadibotConns instanceof Map ? global.jadibotConns.size : 0 } catch {}
  const now = Date.now()
  if (now - ownCache.at < OWN_CACHE_MS && ownCache.size === size && ownCache.identities.size) {
    const identities = ownCache.identities
    addConnIdentities(identities, conn)
    return identities
  }
  const identities = new Set()
  addConnIdentities(identities, conn)
  addConnIdentities(identities, globalThis.conn)
  addIdentity(identities, global.mainBot && global.mainBot.number)
  addIdentity(identities, global.mainBot && global.mainBot.id)
  addIdentity(identities, global.mainBot && global.mainBot.jid)
  addIdentity(identities, global.umiBot && global.umiBot.number)
  try {
    if (global.jadibotConns instanceof Map) for (const sub of global.jadibotConns.values()) addConnIdentities(identities, sub)
  } catch {}
  for (const number of sessionDirectoryNumbers()) identities.add(number)
  ownCache.at = now
  ownCache.size = size
  ownCache.identities = identities
  return identities
}

/** Nomor yang mungkin mewakili pengirim (PN maupun LID). */
export function senderNumbers(m) {
  const list = []
  if (!m) return list
  const push = value => { const number = normalizeNumber(value); if (number && number.length >= 6) list.push(number) }
  push(m.sender)
  if (m.key) {
    push(m.key.participant)
    push(m.key.participantAlt)
    push(m.key.senderPn)
    push(m.key.participantPn)
    push(m.key.senderLid)
  }
  push(m.senderPn)
  push(m.participantAlt)
  push(m.senderAlt)
  if (!m.isGroup && m.chat) push(m.chat)
  return [...new Set(list)]
}

/* ── sinyal pesan ────────────────────────────────────────────────── */

/** Sama seperti `getDevice` di lib/simple.js — menentukan perangkat pengirim dari id pesan. */
export function messageDevice(id) {
  const value = String(id || '')
  if (!value) return 'unknown'
  return /^3A|2A.{18}$/.test(value) ? 'ios'
    : /^3E.{20}$/.test(value) ? 'web'
    : /^(.{21}|.{32})$/.test(value) ? 'android'
    : /^(3F|.{18}$)/.test(value) ? 'desktop'
    : 'unknown'
}

// Tipe pesan yang hanya bisa dibuat lewat API/bot. Balasan tombol dari
// pengguna (buttonsResponseMessage, listResponseMessage, ...) TIDAK termasuk:
// itu manusia yang menekan tombol.
const API_MESSAGE_TYPES = new Set([
  'buttonsMessage', 'templateMessage', 'listMessage', 'interactiveMessage',
  'highlyStructuredMessage', 'hydratedTemplateMessage', 'productMessage',
  'orderMessage', 'invoiceMessage', 'botForwardedMessage',
])

function hasApiFooter(m) {
  const msg = (m && (m.msg || m.message)) || {}
  const content = msg.extendedTextMessage || msg
  return Boolean(
    content && (content.footerText || (content.footer && content.footer.text))
  )
}

function hasDeviceListMetadata(m) {
  const info = (m && (m.messageContextInfo || (m.message && m.message.messageContextInfo))) || null
  const meta = info && info.deviceListMetadata
  return Boolean(meta && Object.keys(meta).length)
}

function botLikeName(m) {
  const name = String((m && (m.pushName || (m.key && m.key.pushName) || m.name)) || '')
  return /\b(bot|botz|robot|assistant)\b/i.test(name)
}

/* ── memo balasan Auto-AI (gema + pemutus loop) ───────────────────── */

const replyLog = new Map() // key → { texts: [], at: [], last: string }
const REPLY_TTL = 10 * 60000
const MAX_LOGS = 2000

function logKey(m, botConfig) {
  const scope = (botConfig && botConfig.scope) || (m && m.chat) || ''
  return `${scope}:${(m && m.chat) || ''}:${(m && m.sender) || ''}`
}

function pruneReplyLogs(now) {
  if (replyLog.size <= MAX_LOGS) return
  for (const [key, row] of replyLog) if (!row.at.length || row.at[row.at.length - 1] < now - REPLY_TTL) replyLog.delete(key)
}

/** Dicatat dari lib/auto-ai-reply.js setiap kali Auto-AI mengirim balasan. */
export function rememberAutoAIReply(m, text, botConfig) {
  const body = String(text || '').trim()
  if (!body || !m) return
  const key = logKey(m, botConfig)
  const now = Date.now()
  let row = replyLog.get(key)
  if (!row) row = { texts: [], at: [], last: '' }
  row.texts.push(body.slice(0, 1200))
  row.at.push(now)
  row.last = body.slice(0, 1200)
  row.texts = row.texts.slice(-8)
  row.at = row.at.slice(-8)
  replyLog.set(key, row)
  pruneReplyLogs(now)
}

export function resetBotFilterMemory() {
  replyLog.clear()
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim()
}

/** Kemiripan sederhana (irisan kata / gabungan kata), 0..1. */
function similarity(a, b) {
  const left = new Set(normalizeText(a).split(' ').filter(Boolean))
  const right = new Set(normalizeText(b).split(' ').filter(Boolean))
  if (!left.size || !right.size) return 0
  let same = 0
  for (const word of left) if (right.has(word)) same += 1
  return same / (left.size + right.size - same)
}

/**
 * Bot lawan yang mengutip balasan kita (atau mengulang kalimat kita) akan
 * terdeteksi di sini tanpa perlu tahu nomornya.
 */
export function isEchoOfOwnReply(m, botConfig) {
  const text = String((m && m.text) || '')
  if (text.trim().length < 20) return { echo: false }
  const row = replyLog.get(logKey(m, botConfig))
  if (!row || !row.at.length) return { echo: false }
  if (row.at[row.at.length - 1] < Date.now() - REPLY_TTL) return { echo: false }
  for (const previous of row.texts) {
    if (similarity(previous, text) >= 0.8) return { echo: true, reason: 'gema balasan bot sendiri' }
  }
  return { echo: false }
}

function stopperTripped(m, botConfig) {
  const settings = getBotFilterSettings()
  if (settings.stopper === false) return { tripped: false }
  const row = replyLog.get(logKey(m, botConfig))
  if (!row || !row.at.length) return { tripped: false }
  const now = Date.now()
  const recent = row.at.filter(at => at > now - STOPPER_WINDOW_MS)
  if (recent.length < STOPPER_LIMIT) return { tripped: false }
  // Hanya dipakai untuk pengirim yang perangkatnya bergaya library, supaya
  // obrolan manusia yang cepat tidak ikut dibungkam.
  const device = messageDevice(m && m.key && m.key.id)
  if (device !== 'web' && device !== 'unknown') return { tripped: false }
  return { tripped: true, reason: `pemutus loop: ${recent.length} balasan dalam 60 detik` }
}

/* ── keputusan utama ─────────────────────────────────────────────── */

const throttled = new Map()

function logOnce(key, message) {
  const now = Date.now()
  const last = throttled.get(key) || 0
  if (now - last < 10 * 60000) return
  throttled.set(key, now)
  if (throttled.size > 500) for (const [k, at] of throttled) if (at < now - 600000) throttled.delete(k)
  console.log('[BOT-FILTER]', message)
}

/**
 * @returns {{ bot: boolean, reason: string, score: number, device: string }}
 */
export function detectBotMessage(m, conn, botConfig) {
  const settings = getBotFilterSettings()
  const device = messageDevice(m && m.key && m.key.id)
  const numbers = senderNumbers(m)
  const empty = { bot: false, reason: '', score: 0, device }

  if (!m || !numbers.length) return empty

  // 1. Bot milik kita sendiri (bot utama + semua sesi jadibot di proses ini).
  const own = ownBotIdentities(conn)
  for (const number of numbers) {
    if (own.has(number)) return { bot: true, reason: 'nomor bot sendiri', score: 100, device }
  }

  // 2. Daftar pantau owner.
  const manual = new Set(settings.numbers || [])
  for (const number of numbers) {
    if (manual.has(number)) return { bot: true, reason: 'nomor di daftar pantau', score: 100, device }
  }
  if (Array.isArray(global.umiAutoAI && global.umiAutoAI.botNumbers)) {
    const extra = new Set(global.umiAutoAI.botNumbers.map(normalizeNumber).filter(Boolean))
    for (const number of numbers) {
      if (extra.has(number)) return { bot: true, reason: 'nomor di config umiAutoAI.botNumbers', score: 100, device }
    }
  }

  // 3. Pesan buatan library (device tidak dikenal / id BAE5).
  // Cek id dulu supaya alasannya lebih tepat di `.setbotfilter cek`.
  const id = String((m.key && m.key.id) || m.id || '')
  if (/^BAE5/i.test(id)) return { bot: true, reason: 'id pesan Baileys', score: 90, device }
  // Tanpa id pesan tidak ada dasar menyimpulkan apa pun (mis. pesan rekaan
  // penjadwal internal) — jangan dianggap bot.
  if (id.length >= 8 && (m.isBaileys === true || device === 'unknown')) {
    return { bot: true, reason: 'perangkat pesan tidak dikenal', score: 90, device }
  }

  // 4. Tipe pesan yang hanya bisa dikirim lewat API.
  if (API_MESSAGE_TYPES.has(String(m.mtype || ''))) return { bot: true, reason: 'pesan interaktif buatan API', score: 80, device }

  // 5. Mode agresif: semua device web dianggap bot (bawaan mati).
  if (settings.filterWebDevice && device === 'web') return { bot: true, reason: 'device web (mode agresif)', score: 70, device }

  // 6. Skor heuristik untuk bot Baileys yang menyamar seperti device web.
  let score = 0
  if (/^3EB0/i.test(id)) score += 2
  if (!hasDeviceListMetadata(m)) score += 2
  if (botLikeName(m)) score += 2
  if (hasApiFooter(m)) score += 2
  if (score >= 6) return { bot: true, reason: 'ciri pesan bot (skor ' + score + ')', score, device }
  return { bot: false, reason: '', score, device }
}

/**
 * Dipakai Auto-AI: boleh dibalas atau tidak.
 * @returns {{ skip: boolean, reason: string }}
 */
export function botMessageVerdict(m, conn, botConfig) {
  const settings = getBotFilterSettings()
  if (settings.enabled === false) return { skip: false, reason: 'filter dimatikan' }
  const echo = isEchoOfOwnReply(m, botConfig)
  if (echo.echo) {
    logOnce('echo:' + ((m && m.sender) || ''), `${echo.reason} — lewati (${(m && m.sender) || '?'})`)
    return { skip: true, reason: echo.reason }
  }
  const detection = detectBotMessage(m, conn, botConfig)
  if (detection.bot) {
    logOnce('bot:' + ((m && m.sender) || ''), `${detection.reason} — lewati (${(m && m.sender) || '?'} di ${(m && m.chat) || '?'})`)
    return { skip: true, reason: detection.reason }
  }
  const stopper = stopperTripped(m, botConfig)
  if (stopper.tripped) {
    logOnce('stop:' + ((m && m.sender) || ''), `${stopper.reason} — berhenti membalas (${(m && m.sender) || '?'})`)
    return { skip: true, reason: stopper.reason }
  }
  return { skip: false, reason: '' }
}

export default {
  getBotFilterSettings, updateBotFilter, addBotNumber, removeBotNumber,
  ownBotIdentities, senderNumbers, messageDevice,
  detectBotMessage, botMessageVerdict, rememberAutoAIReply,
  isEchoOfOwnReply, resetBotFilterMemory, normalizeNumber,
}
