/* By AlzRiss - Usanagi Umi AI
 *
 * .rch — reaction ke post WhatsApp Channel memakai API RCH VIP.
 *
 * Diadaptasi dari plugin `rch` milik bot "VanXone Multi Device" (versi yang
 * sudah dimodifikasi: banyak API key VIP + rotasi + sinkronisasi kunci).
 * Perbedaan penting dari aslinya, semuanya karena bug yang terbukti saat diuji:
 *
 *   1. Kunci TIDAK ditulis di dalam plugin. Kunci dibaca dari
 *      config/api-keys.js → `.env.apikeys` (UMI_RCH_KEY) supaya repo publik
 *      tetap bersih. Isinya boleh satu kunci atau daftar JSON.
 *   2. Sinkronisasi kunci dari Firebase TIDAK lagi menghapus kunci lokal.
 *      Di versi asli, kunci yang masih hidup dan sedang dipakai justru
 *      terhapus karena statusnya `active:false` di database, lalu diganti
 *      kunci sampah `PENDING` / `TEST-KEY`. Sekarang hasil sync DIGABUNG
 *      dan kunci placeholder dibuang.
 *   3. Kunci yang kena limit harian (429) atau domain ditolak (403) diberi
 *      jeda sendiri, jadi tidak dicoba berulang setiap pesan.
 *   4. Balasan menyebut kunci mana yang dipakai dan berapa sisa kuota hari ini.
 */
import fs from 'node:fs'
import path from 'node:path'
import { apiKey, refreshApiKeys } from '../../config/api-keys.js'

// Endpoint bisa diarahkan lewat environment (dipakai untuk pengujian).
const RCH_ENDPOINT = process.env.UMI_RCH_ENDPOINT || 'https://apiv2.reactionwa.online/api/v2/react'
const RCH_FIREBASE_KEY = 'AIzaSyDNbAlgLycK0oRO8I9ja3mPnIccZkOz0M0'
const RCH_RTDB = 'https://autoreactberry-default-rtdb.asia-southeast1.firebasedatabase.app/api_keys.json'
const RCH_SYNC_EVERY_MS = 6 * 60 * 60 * 1000
const RCH_LINK_REGEX = /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)\/(\d+)/i
const RCH_EMOJI_REGEX = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?/gu
const MAX_EMOJI = 5
const PLACEHOLDER_KEY = /^(?:PENDING|TEST-KEY|YOUR_API_KEY|ISI_DI_SINI)/i

function stateFile() {
  return process.env.UMI_RCH_STATE_FILE || path.join(process.cwd(), 'data', 'rch-keys.json')
}

function readState() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    return {
      keys: Array.isArray(raw.keys) ? raw.keys : [],
      blocked: raw.blocked && typeof raw.blocked === 'object' ? raw.blocked : {},
      index: Number.isFinite(raw.index) ? raw.index : 0,
      lastSync: Number(raw.lastSync) || 0,
    }
  } catch {
    return { keys: [], blocked: {}, index: 0, lastSync: 0 }
  }
}

let stateCache = null
let stateMtime = 0
function loadState() {
  const file = stateFile()
  try {
    const mtime = fs.statSync(file).mtimeMs
    if (stateCache && mtime === stateMtime) return stateCache
    stateCache = readState()
    stateMtime = mtime
    return stateCache
  } catch {
    if (!stateCache) stateCache = readState()
    return stateCache
  }
}

function saveState(state) {
  try {
    const file = stateFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
    fs.renameSync(temp, file)
    stateCache = state
    try { stateMtime = fs.statSync(file).mtimeMs } catch { stateMtime = 0 }
  } catch (error) {
    console.warn('[RCH] gagal menyimpan state:', String(error?.message || error).slice(0, 120))
  }
}

function usableKey(entry) {
  if (!entry || typeof entry !== 'object') return false
  const key = String(entry.apiKey || '').trim()
  if (key.length < 20) return false
  if (PLACEHOLDER_KEY.test(key)) return false
  return true
}

function normalizeEntry(entry, fallbackDomain = 'https://reactionwa.online') {
  const domain = String(entry.domain || fallbackDomain)
  return {
    name: String(entry.name || 'kunci').slice(0, 60),
    apiKey: String(entry.apiKey || '').trim(),
    domain: domain === '*' ? 'https://reactionwa.online' : domain.replace(/\/+$/, ''),
  }
}

/** Kunci dari `.env.apikeys` (UMI_RCH_KEY) — satu kunci atau daftar JSON. */
function configKeys() {
  const raw = String(apiKey('rch') || '').trim()
  if (!raw) return []
  if (raw.startsWith('[')) {
    try {
      const list = JSON.parse(raw)
      return Array.isArray(list) ? list.map(item => normalizeEntry(typeof item === 'string' ? { apiKey: item } : item)).filter(usableKey) : []
    } catch (error) {
      console.warn('[RCH] UMI_RCH_KEY bukan JSON yang valid:', String(error?.message || error).slice(0, 100))
      return []
    }
  }
  return [normalizeEntry({ name: 'kunci-utama', apiKey: raw })]
}

/** Gabungan kunci: state (hasil sync) + config, tanpa duplikat, tanpa placeholder. */
function collectKeys(state = loadState()) {
  const list = []
  const seen = new Set()
  const push = entry => {
    if (!usableKey(entry)) return
    const id = `${entry.name}|${entry.apiKey}`
    if (seen.has(id)) return
    seen.add(id)
    list.push(entry)
  }
  for (const entry of configKeys()) push(entry)
  for (const entry of state.keys || []) push(normalizeEntry(entry))
  return list
}

function cooldownOf(state, name) {
  const row = state.blocked?.[name]
  if (!row) return { active: false, until: 0, reason: '' }
  const until = Number(row.until) || 0
  return { active: until > Date.now(), until, reason: String(row.reason || '') }
}

function blockKey(state, name, reason, until) {
  if (!state.blocked) state.blocked = {}
  state.blocked[name] = { reason, until }
}

function nextMidnight() {
  // Kuota harian direset "besok hari" menurut waktu server API (WIB).
  const now = new Date()
  const wib = new Date(now.getTime() + 7 * 3600 * 1000)
  wib.setUTCHours(24, 0, 0, 0)
  return wib.getTime() - 7 * 3600 * 1000
}

async function syncRemoteKeys(force = false) {
  const state = loadState()
  if (!force && Date.now() - (state.lastSync || 0) < RCH_SYNC_EVERY_MS) return { synced: false, reason: 'baru saja disinkronkan' }
  try {
    const auth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${RCH_FIREBASE_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: 'https://reactionwa.online/' },
      body: JSON.stringify({ returnSecureToken: true }),
      signal: AbortSignal.timeout(15000),
    })
    const authData = await auth.json().catch(() => ({}))
    if (!authData.idToken) return { synced: false, reason: 'token Firebase tidak didapat' }
    const res = await fetch(`${RCH_RTDB}?auth=${authData.idToken}`, { signal: AbortSignal.timeout(15000) })
    const data = await res.json().catch(() => null)
    if (!data || typeof data !== 'object') return { synced: false, reason: 'database kunci kosong' }

    const fresh = []
    let dibuang = 0
    for (const [name, value] of Object.entries(data)) {
      if (!value || typeof value !== 'object') continue
      const entry = normalizeEntry({ name, apiKey: value.apiKey, domain: value.domain })
      if (!usableKey(entry)) { dibuang += 1; continue }
      fresh.push(entry)
    }
    const before = collectKeys(state)
    // GABUNG, bukan ganti: kunci lama yang masih hidup tidak boleh hilang
    // hanya karena statusnya `active:false` di database.
    const merged = [...before]
    const seen = new Set(before.map(entry => `${entry.name}|${entry.apiKey}`))
    for (const entry of fresh) {
      const id = `${entry.name}|${entry.apiKey}`
      if (seen.has(id)) continue
      seen.add(id)
      merged.push(entry)
    }
    state.keys = merged.slice(0, 40)
    state.lastSync = Date.now()
    saveState(state)
    return { synced: true, remote: fresh.length, dibuang, total: state.keys.length }
  } catch (error) {
    return { synced: false, reason: String(error?.message || error).slice(0, 120) }
  }
}

function normalizeUrl(input) {
  const match = String(input || '').match(RCH_LINK_REGEX)
  if (!match) return null
  return `https://whatsapp.com/channel/${match[1]}/${match[2]}`
}

function parseEmoji(input) {
  const matches = String(input || '').match(RCH_EMOJI_REGEX)
  if (!matches || !matches.length) return null
  return [...new Set(matches)].slice(0, MAX_EMOJI).join(', ')
}

async function kirimReaction(target, reaction, entry) {
  const origin = entry.domain
  const res = await fetch(RCH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      Referer: origin.endsWith('/') ? origin : `${origin}/`,
      'x-api-key': entry.apiKey,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    body: JSON.stringify({ url: target, reaction }),
    signal: AbortSignal.timeout(45000),
  })
  let body = {}
  try { body = await res.json() } catch {}
  return { status: res.status, body }
}

/**
 * Coba kunci satu per satu sampai ada yang berhasil.
 * Kunci yang kena limit/domain otomatis diistirahatkan.
 */
export async function reactChannel(target, reaction) {
  const mulai = Date.now()
  const state = loadState()
  const keys = collectKeys(state)
  if (!keys.length) {
    return {
      ok: false,
      alasan: 'Kunci RCH belum dipasang. Isi UMI_RCH_KEY di .env.apikeys (satu kunci atau daftar JSON), lalu coba lagi.',
      waktu: `${Date.now() - mulai}ms`,
    }
  }

  // Kunci yang sedang diistirahatkan dicoba paling akhir.
  const segar = []
  const istirahat = []
  for (const entry of keys) (cooldownOf(state, entry.name).active ? istirahat : segar).push(entry)
  const urut = [...segar, ...istirahat]
  const start = Number.isFinite(state.index) ? state.index % urut.length : 0

  let pesanTerakhir = 'Semua kunci RCH sedang sibuk / limit.'
  let kenaLimit = 0
  for (let i = 0; i < urut.length; i += 1) {
    const entry = urut[(start + i) % urut.length]
    const jeda = cooldownOf(state, entry.name)
    if (jeda.active) {
      pesanTerakhir = `kunci ${entry.name} sedang diistirahatkan sampai ${new Date(jeda.until).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`
      continue
    }
    try {
      const { status, body } = await kirimReaction(target, reaction, entry)
      state.index = (start + i + 1) % urut.length
      if (status === 200 && (body.success === true || body.status === 'success')) {
        saveState(state)
        const data = body.data || {}
        const task = data.task || {}
        const vip = data.vip || {}
        return {
          ok: true,
          waktu: `${Date.now() - mulai}ms`,
          pesan: body.message || 'Reaction masuk antrean.',
          kunci: entry.name,
          emoji: task.reaction_code || reaction,
          target,
          paket: vip.packageName || 'VIP',
          usage: body.usage_today ?? null,
          limit: body.limit ?? null,
          poin: vip.pointRemaining ?? null,
        }
      }
      // Gagal: beri jeda sesuai jenis kesalahan supaya tidak dicoba terus.
      // PENTING: 429 bisa berarti dua hal berbeda —
      //   "Limit harian ... habis"      → baru berguna besok
      //   "Server Sedang Sibuk"         → cuma sebentar, jangan dikunci sehari
      if (status === 429) {
        const pesan = String(body.error || '')
        if (/limit harian|kuota/i.test(pesan)) {
          kenaLimit += 1
          blockKey(state, entry.name, 'limit harian habis', nextMidnight())
        } else {
          blockKey(state, entry.name, 'server sibuk', Date.now() + 2 * 60 * 1000)
        }
        pesanTerakhir = pesan || 'Server RCH sedang sibuk.'
      } else if (status === 403) {
        blockKey(state, entry.name, 'domain/kunci ditolak', Date.now() + 6 * 60 * 60 * 1000)
        pesanTerakhir = body.error || 'Kunci ditolak (domain tidak cocok).'
      } else {
        blockKey(state, entry.name, `HTTP ${status}`, Date.now() + 60 * 1000)
        pesanTerakhir = body.error || `Kesalahan server (HTTP ${status}).`
      }
      saveState(state)
    } catch (error) {
      blockKey(state, entry.name, 'timeout', Date.now() + 60 * 1000)
      saveState(state)
      pesanTerakhir = String(error?.message || error).slice(0, 160)
    }
  }
  saveState(state)
  return {
    ok: false,
    alasan: kenaLimit === urut.length
      ? 'Semua kunci RCH kena limit harian. Kuota direset besok.'
      : pesanTerakhir,
    waktu: `${Date.now() - mulai}ms`,
  }
}

/** Ringkasan kunci untuk `.rch status`. */
export function statusKunci() {
  const state = loadState()
  const keys = collectKeys(state)
  return keys.map(entry => {
    const jeda = cooldownOf(state, entry.name)
    return {
      name: entry.name,
      domain: entry.domain,
      status: jeda.active
        ? `istirahat — ${jeda.reason} s/d ${new Date(jeda.until).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`
        : 'siap dipakai',
    }
  })
}

const handler = async (m, { conn, text, usedPrefix, command, isOwner, isROwner }) => {
  const prefix = usedPrefix || '.'
  const cmd = command || 'rch'
  const isi = String(text || '').trim()

  // .rch reload — baca ulang .env.apikeys tanpa me-restart bot (owner).
  if (/^reload$/i.test(isi)) {
    if (!isOwner && !isROwner) return m.reply('Perintah ini hanya untuk owner bot.')
    refreshApiKeys()
    const jumlah = collectKeys().length
    return m.reply(`🔄 Kunci RCH dibaca ulang dari .env.apikeys.\nKunci siap pakai: *${jumlah}*\nCek detail: ${prefix}${cmd} status`)
  }

  // .rch status — pemantauan kunci (owner saja; isi kunci tidak pernah ditampilkan)
  if (/^(status|cek)$/i.test(isi)) {
    const state = loadState()
    const daftar = statusKunci()
    const baris = daftar.length
      ? daftar.map((k, i) => `${i + 1}. *${k.name}* — ${k.status}`).join('\n')
      : '_Belum ada kunci. Isi UMI_RCH_KEY di .env.apikeys._'
    return m.reply(
      `🔑 *STATUS KUNCI RCH*\n\n${baris}\n\n` +
      `Sinkron terakhir: ${state.lastSync ? new Date(state.lastSync).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'belum pernah'}\n` +
      `Perintah: ${prefix}${cmd} <link_post> <emoji>`
    )
  }

  const spasi = isi.indexOf(' ')
  const target = spasi < 0 ? isi : isi.slice(0, spasi).trim()
  const emojiInput = spasi < 0 ? '' : isi.slice(spasi + 1).trim()

  if (!isi || !target || !emojiInput) {
    return m.reply(
      `⚠️ *Format:* ${prefix}${cmd} <link_post> <emoji>\n\n` +
      `Contoh:\n• ${prefix}${cmd} https://whatsapp.com/channel/0029Vb7pLCF35fLqMBUCMP1D/123 🔥\n` +
      `• ${prefix}${cmd} https://whatsapp.com/channel/0029Vb7pLCF35fLqMBUCMP1D/123 🔥,🚀,👑\n\n` +
      `Maksimal ${MAX_EMOJI} emoji. Cek kunci: ${prefix}${cmd} status`
    )
  }

  const url = normalizeUrl(target)
  if (!url) {
    return m.reply('❌ Link channel tidak valid. Pastikan ada ID pesan di akhir, contoh:\nhttps://whatsapp.com/channel/xxxxxxxxxxxx/158')
  }
  const reaksi = parseEmoji(emojiInput)
  if (!reaksi) return m.reply('❌ Emoji tidak ditemukan di pesanmu. Contoh: ' + prefix + cmd + ' <link> 🔥')

  await m.reply('⏳ Memproses reaction VIP...')
  // Sinkron kunci di latar belakang: tidak menahan balasan.
  syncRemoteKeys().catch(() => {})

  const hasil = await reactChannel(url, reaksi)
  if (!hasil.ok) {
    return m.reply(`❌ *REACTION GAGAL*\n\n⚠️ ${hasil.alasan}\n⏱️ ${hasil.waktu}`)
  }
  const kuota = hasil.usage !== null && hasil.limit !== null ? `${hasil.usage}/${hasil.limit}` : '-'
  return m.reply(
    `✅ *REACTION MASUK ANTREAN*\n\n` +
    `🎭 Emoji : ${hasil.emoji}\n` +
    `🔗 Target: ${hasil.target}\n\n` +
    `👑 Kunci : ${hasil.kunci}\n` +
    `📦 Paket : ${hasil.paket}\n` +
    `📊 Kuota : ${kuota}\n` +
    (hasil.poin !== null ? `🪙 Poin  : ${hasil.poin}\n` : '') +
    `\n⏱️ ${hasil.waktu}`
  )
}

handler.help = ['rch <link_post> <emoji>', 'rch status']
handler.tags = ['tools']
handler.command = ['rch', 'reactchannel']
handler.description = 'Reaction ke post WhatsApp Channel memakai kunci RCH VIP (banyak kunci, rotasi otomatis)'

export default handler
