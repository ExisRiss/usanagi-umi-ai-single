/* By AlzRiss - Usanagi Umi AI
 *
 * .rch — reaction ke post WhatsApp Channel memakai API RCH VIP.
 *
 * Diadaptasi dari plugin `rch` milik bot "VanXone Multi Device" (versi yang
 * sudah dimodifikasi: banyak API key VIP + rotasi + sinkronisasi kunci).
 *
 * ── Task149 (laporan 29-10-2026: "rch nge filter apikey, kalau 1 limit pakai
 *    apikey lain sampai dapat, kalau limit semua bot otomatis kirim rch limit")
 *
 * Yang DIPERBAIKI di versi ini — semuanya bug nyata, bukan kosmetik:
 *
 *  1. FILTER KUNCI (`filterKeys`). Sebelumnya daftar kunci dipakai apa adanya:
 *       • kunci yang isinya SAMA tapi namanya beda dicoba dua kali
 *         (dedupe lama memakai `nama|apiKey`, bukan isi kunci);
 *       • kunci rusak/placeholder hanya disaring di satu jalur (config),
 *         tidak di jalur state hasil sync;
 *       • kunci yang kuotanya sudah habis (usage >= limit) tetap dicoba.
 *     Sekarang setiap kunci dinilai: duplikat, terlalu pendek, placeholder,
 *     domain kosong, dan kuota habis → dibuang / diistirahatkan, dengan alasan
 *     yang bisa dilihat di `.rch status`.
 *
 *  2. JEDA DIPISAH DARI KUNCI. Sebelumnya status jeda disimpan berdasarkan
 *     `name`. Kalau token dengan nama sama diganti isinya (kasus nyata: sync
 *     Firebase menambah ulang nama `VIP-D68JICP0` dengan apiKey baru), jeda
 *     lama ikut menempel ke kunci baru → kunci sehat dilewati. Sekarang jeda
 *     disimpan per SIDIK kunci (sha1 isi kunci), nama hanya untuk tampilan.
 *
 *  3. STATUS API DIBACA LEBIH JUJUR (`klasifikasiRespons`). API RCH menjawab
 *     `403 "API Key ini tidak memiliki domain whitelist"` untuk kunci asing
 *     (sudah diuji langsung ke server mereka), dan limit bisa datang sebagai
 *     `429` MAUPUN `200 {success:false}`. Versi lama hanya mengenali
 *     `429 + /limit harian/`, sehingga balasan limit berbentuk 200 dicatat
 *     sebagai "HTTP 200" dan kunci sehat ikut diistirahatkan.
 *
 *  4. "SAMPAI DAPAT". Semua kunci yang siap dicoba BERURUTAN dalam satu
 *     permintaan; kunci yang masih dijeda ikut dicoba paling akhir bila semua
 *     kunci siap gagal. Hanya kunci yang benar-benar menolak yang dijeda.
 *
 *  5. "RCH LIMIT". Kalau SEMUA kunci kena limit/kuota, hasilnya bukan lagi
 *     pesan samar "kunci X sedang diistirahatkan", tetapi
 *     `limitTotal: true` → bot otomatis membalas *RCH LIMIT* beserta jumlah
 *     kunci, waktu reset, dan cara memperbaikinya. Pemilik bot juga diberi
 *     tahu (maksimal 1×/jam) supaya bisa menambah kunci.
 *
 * Aturan tetap: kunci TIDAK ditulis di dalam plugin (dibaca dari
 * config/api-keys.js → `.env.apikeys` UMI_RCH_KEY), dan isi kunci tidak pernah
 * ditampilkan ke chat.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { apiKey, refreshApiKeys } from '../../config/api-keys.js'

// Endpoint bisa diarahkan lewat environment (dipakai untuk pengujian).
const RCH_ENDPOINT = process.env.UMI_RCH_ENDPOINT || 'https://apiv2.reactionwa.online/api/v2/react'
const RCH_FIREBASE_KEY = 'AIzaSyDNbAlgLycK0oRO8I9ja3mPnIccZkOz0M0'
const RCH_RTDB = 'https://autoreactberry-default-rtdb.asia-southeast1.firebasedatabase.app/api_keys.json'
const RCH_SYNC_EVERY_MS = 6 * 60 * 60 * 1000
const RCH_LINK_REGEX = /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)\/(\d+)/i
const RCH_EMOJI_REGEX = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?/gu
const MAX_EMOJI = 5
const PLACEHOLDER_KEY = /^(?:PENDING|TEST-KEY|YOUR_API_KEY|ISI_DI_SINI|CHANGEME|EXAMPLE)/i
const MIN_KEY_LENGTH = 20

/* Jeda menurut jenis kegagalan. */
const JEDA_SIBUK_MS = 2 * 60 * 1000      // server sibuk — sebentar saja
const JEDA_DITOLAK_MS = 6 * 60 * 60 * 1000 // domain/token ditolak
const JEDA_GAGAL_MS = 60 * 1000           // kesalahan lain
const JEDA_RUSAK_MS = 24 * 60 * 60 * 1000 // kunci permanen tidak valid

/* ── state ─────────────────────────────────────────────────────────────── */

function stateFile() {
  return process.env.UMI_RCH_STATE_FILE || path.join(process.cwd(), 'data', 'rch-keys.json')
}

function readState() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    return {
      keys: Array.isArray(raw.keys) ? raw.keys : [],
      blocked: raw.blocked && typeof raw.blocked === 'object' ? raw.blocked : {},
      kuota: raw.kuota && typeof raw.kuota === 'object' ? raw.kuota : {},
      index: Number.isFinite(raw.index) ? raw.index : 0,
      lastSync: Number(raw.lastSync) || 0,
    }
  } catch {
    return { keys: [], blocked: {}, kuota: {}, index: 0, lastSync: 0 }
  }
}

let stateCache = null
/* Kunci cache = mtime + ukuran berkas. Kalau hanya mtime, dua penulisan dalam
 * milidetik yang sama (mis. sync lalu koreksi manual) membuat state basi
 * terpakai — persis bug yang membuat uji Task149 sempat gagal. */
let stateKunciCache = ''
function loadState() {
  const file = stateFile()
  try {
    const info = fs.statSync(file)
    const kunci = `${info.mtimeMs}:${info.size}`
    if (stateCache && kunci === stateKunciCache) return stateCache
    stateCache = readState()
    stateKunciCache = kunci
    return stateCache
  } catch {
    if (!stateCache) stateCache = readState()
    return stateCache
  }
}

/** Paksa baca ulang state dari disk (dipakai `.rch reload` dan pengujian). */
export function lupakanState() {
  stateCache = null
  stateKunciCache = ''
  return loadState()
}

function saveState(state) {
  try {
    const file = stateFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
    fs.renameSync(temp, file)
    stateCache = state
    try {
      const info = fs.statSync(file)
      stateKunciCache = `${info.mtimeMs}:${info.size}`
    } catch { stateKunciCache = '' }
  } catch (error) {
    console.warn('[RCH] gagal menyimpan state:', String(error?.message || error).slice(0, 120))
  }
}

/* ── penilaian kunci ───────────────────────────────────────────────────── */

/** Sidik kunci untuk menyimpan jeda tanpa menulis isi kunci ke berkas state. */
export function sidikKunci(entry) {
  const isi = String((entry && entry.apiKey) || '').trim()
  if (!isi) return ''
  return crypto.createHash('sha1').update(isi).digest('hex').slice(0, 16)
}

function normalisasiDomain(nilai, cadangan = 'https://reactionwa.online') {
  const teks = String(nilai || '').trim()
  if (!teks || teks === '*') return cadangan
  const denganSkema = /^https?:\/\//i.test(teks) ? teks : `https://${teks}`
  return denganSkema.replace(/\/+$/, '')
}

export function normalisasiKunci(entry, cadanganDomain = 'https://reactionwa.online') {
  const data = typeof entry === 'string' ? { apiKey: entry } : (entry || {})
  return {
    name: String(data.name || 'kunci').slice(0, 60),
    apiKey: String(data.apiKey || '').trim(),
    domain: normalisasiDomain(data.domain, cadanganDomain),
  }
}

/**
 * Kenapa kunci ini tidak layak dipakai? `''` berarti layak.
 * Dipakai `filterKeys()` dan `.rch status`.
 */
export function alasanTidakLayak(entry) {
  if (!entry || typeof entry !== 'object') return 'data kunci rusak'
  const kunci = String(entry.apiKey || '').trim()
  if (!kunci) return 'isi kunci kosong'
  if (PLACEHOLDER_KEY.test(kunci)) return 'masih placeholder (PENDING/TEST-KEY)'
  if (kunci.length < MIN_KEY_LENGTH) return `kunci terlalu pendek (${kunci.length} karakter)`
  if (!/^https?:\/\//i.test(String(entry.domain || ''))) return 'domain tidak valid'
  return ''
}

/** Kunci dari `.env.apikeys` (UMI_RCH_KEY) — satu kunci atau daftar JSON. */
function configKeys() {
  const raw = String(apiKey('rch') || '').trim()
  if (!raw) return []
  if (raw.startsWith('[')) {
    try {
      const list = JSON.parse(raw)
      return Array.isArray(list) ? list.map(item => normalisasiKunci(typeof item === 'string' ? { apiKey: item } : item)) : []
    } catch (error) {
      console.warn('[RCH] UMI_RCH_KEY bukan JSON yang valid:', String(error?.message || error).slice(0, 100))
      return []
    }
  }
  return [normalisasiKunci({ name: 'kunci-utama', apiKey: raw })]
}

/**
 * Gabungan kunci mentah: config lebih dulu, lalu hasil sync. Belum difilter.
 */
function collectKeys(state = loadState()) {
  const list = []
  for (const entry of configKeys()) list.push(entry)
  for (const entry of state.keys || []) list.push(normalisasiKunci(entry))
  return list
}

/**
 * FILTER (Task149).
 *
 * @returns {{
 *   siap: object[], jeda: object[], dibuang: {name:string, alasan:string}[],
 *   semua: object[]
 * }}
 *   siap    : boleh dicoba sekarang
 *   jeda    : masih diistirahatkan (dicoba paling akhir bila perlu)
 *   dibuang : tidak akan pernah dicoba (duplikat / rusak / kuota habis)
 */
export function filterKeys(state = loadState(), sekarang = Date.now()) {
  const siap = []
  const jeda = []
  const dibuang = []
  const semua = []
  const isiTerpakai = new Set()

  for (const mentah of collectKeys(state)) {
    const entry = normalisasiKunci(mentah)
    const alasan = alasanTidakLayak(entry)
    if (alasan) {
      dibuang.push({ name: entry.name || 'kunci', alasan })
      continue
    }
    const sidik = sidikKunci(entry)
    if (isiTerpakai.has(sidik)) {
      dibuang.push({ name: entry.name, alasan: 'duplikat (isi kunci sama dengan kunci lain)' })
      continue
    }
    isiTerpakai.add(sidik)
    const kunci = { ...entry, sidik }
    semua.push(kunci)

    const jedaRow = cooldownOf(state, kunci)
    if (jedaRow.active) {
      jeda.push({ ...kunci, jeda: jedaRow })
      continue
    }
    /* Kuota yang tercatat dari balasan API: kalau sudah habis, jangan dicoba. */
    const kuota = state.kuota && state.kuota[sidik]
    if (kuota && Number.isFinite(kuota.usage) && Number.isFinite(kuota.limit) && kuota.limit > 0 && kuota.usage >= kuota.limit) {
      jeda.push({
        ...kunci,
        jeda: { active: true, until: nextMidnight(), reason: `kuota habis (${kuota.usage}/${kuota.limit})` },
      })
      continue
    }
    siap.push(kunci)
  }

  return { siap, jeda, dibuang, semua }
}

/* ── jeda per kunci ────────────────────────────────────────────────────── */

function cooldownOf(state, entry) {
  const id = entry && entry.sidik ? entry.sidik : sidikKunci(entry)
  const nama = String((entry && entry.name) || '')
  const baris = (state.blocked && (state.blocked[id] || state.blocked[nama])) || null
  if (!baris) return { active: false, until: 0, reason: '' }
  const until = Number(baris.until) || 0
  return { active: until > sekarangAman(), until, reason: String(baris.reason || '') }
}

/* Dibungkus function supaya bisa diuji dengan waktu tiruan. */
let jamUji = null
function sekarangAman() {
  return typeof jamUji === 'number' ? jamUji : Date.now()
}
export function setJamUji(nilai) {
  jamUji = typeof nilai === 'number' ? nilai : null
  return jamUji
}

function blockKey(state, entry, reason, ms) {
  if (!state.blocked) state.blocked = {}
  const id = entry.sidik || sidikKunci(entry)
  if (!id) return
  state.blocked[id] = { reason, until: sekarangAman() + Math.max(1000, Number(ms) || 60000) }
  /* Catatan lama berbasis nama dibersihkan supaya tidak menempel ke kunci baru. */
  if (entry.name && state.blocked[entry.name]) delete state.blocked[entry.name]
}

function clearBlock(state, entry) {
  const id = entry.sidik || sidikKunci(entry)
  if (state.blocked && state.blocked[id]) delete state.blocked[id]
  if (entry.name && state.blocked && state.blocked[entry.name]) delete state.blocked[entry.name]
}

function nextMidnight() {
  // Kuota harian direset "besok hari" menurut waktu server API (WIB).
  const now = new Date(sekarangAman())
  const wib = new Date(now.getTime() + 7 * 3600 * 1000)
  wib.setUTCHours(24, 0, 0, 0)
  return wib.getTime() - 7 * 3600 * 1000
}

/* ── sinkronisasi kunci dari server RCH ────────────────────────────────── */

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
      const entry = normalisasiKunci({ name, apiKey: value.apiKey, domain: value.domain })
      if (alasanTidakLayak(entry)) { dibuang += 1; continue }
      fresh.push(entry)
    }
    const before = collectKeys(state)
    // GABUNG, bukan ganti: kunci lama yang masih hidup tidak boleh hilang
    // hanya karena statusnya `active:false` di database.
    const merged = [...before]
    const seen = new Set(before.map(entry => sidikKunci(entry)))
    for (const entry of fresh) {
      const id = sidikKunci(entry)
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

/* ── masukan pengguna ──────────────────────────────────────────────────── */

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

/* ── panggilan API ─────────────────────────────────────────────────────── */

export function klasifikasiRespons(status, body) {
  const isi = body || {}
  const teks = String(isi.error || isi.message || isi.msg || '').slice(0, 200)
  const kode = Number(status) || 0
  const sukses = kode === 200 && (isi.success === true || isi.status === 'success' || isi.status === true || isi.ok === true)
  if (sukses) return { jenis: 'sukses', teks }
  /* Limit harus dikenali dari pesan, bukan hanya status: API bisa menjawab
   * 200 {success:false,"error":"Limit harian habis"} atau 429. */
  if (/limit\s*(harian|api|hari)|kuota|quota|batas\s*harian|sudah\s*mencapai\s*limit|limit\s*tercapai/i.test(teks)) {
    return { jenis: 'limit', teks }
  }
  if (kode === 429) {
    if (/sibuk|busy|terlalu\s*banyak|too\s*many/i.test(teks)) return { jenis: 'sibuk', teks }
    return { jenis: 'limit', teks }
  }
  if (kode === 401 || kode === 403) return { jenis: 'ditolak', teks }
  if (kode >= 500) return { jenis: 'server', teks }
  return { jenis: 'gagal', teks }
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
  try { body = await res.json() } catch { /* balasan bukan JSON */ }
  return { status: res.status, body }
}

/** Simpan pemakaian kuota yang dilaporkan API. */
function catatKuota(state, entry, body) {
  const usage = Number(body && body.usage_today)
  const limit = Number(body && body.limit)
  if (!Number.isFinite(usage) || !Number.isFinite(limit) || limit <= 0) return null
  if (!state.kuota) state.kuota = {}
  const id = entry.sidik || sidikKunci(entry)
  state.kuota[id] = { usage, limit, at: Date.now() }
  return { usage, limit }
}

/**
 * Coba kunci satu per satu sampai ada yang berhasil.
 *
 * @param {string} target    URL post channel
 * @param {string} reaction  emoji (boleh beberapa, dipisah koma)
 * @param {{ state?: object, sekarang?: number }} [opsi]  `state` untuk pengujian
 * @returns {Promise<object>} hasil dengan `limitTotal` bila semua kunci limit
 */
export async function reactChannel(target, reaction, opsi = {}) {
  const mulai = Date.now()
  const state = opsi.state || loadState()
  const sekarang = Number.isFinite(opsi.sekarang) ? opsi.sekarang : sekarangAman()
  const filter = filterKeys(state, sekarang)

  if (!filter.semua.length) {
    const rusak = filter.dibuang.length
      ? `\nKunci yang dibuang: ${filter.dibuang.length} (${filter.dibuang.slice(0, 3).map(x => x.alasan).join('; ')})`
      : ''
    return {
      ok: false,
      limitTotal: false,
      dicoba: 0,
      alasan: 'Kunci RCH belum dipasang. Isi UMI_RCH_KEY di .env.apikeys (satu kunci atau daftar JSON), lalu coba lagi.' + rusak,
      waktu: `${Date.now() - mulai}ms`,
    }
  }

  /* Kunci siap lebih dulu; yang masih dijeda dicoba paling akhir (siapa tahu
   * jedanya baru habis di tengah proses). */
  const urut = [...filter.siap, ...filter.jeda]
  const start = filter.siap.length ? (Number(state.index) || 0) % Math.max(1, urut.length) : 0

  const ringkas = { sukses: 0, limit: 0, sibuk: 0, ditolak: 0, gagal: 0, server: 0, dilewati: 0 }
  const alasanAkhir = []
  let dicoba = 0

  for (let i = 0; i < urut.length; i += 1) {
    const entry = urut[(start + i) % urut.length]
    const jeda = cooldownOf(state, entry)
    if (jeda.active && jeda.until > sekarang) {
      ringkas.dilewati += 1
      alasanAkhir.push(`${entry.name}: masih dijeda (${jeda.reason})`)
      continue
    }
    dicoba += 1
    try {
      const { status, body } = await kirimReaction(target, reaction, entry)
      state.index = (start + i + 1) % urut.length
      const nilai = klasifikasiRespons(status, body)

      if (nilai.jenis === 'sukses') {
        clearBlock(state, entry)
        const kuota = catatKuota(state, entry, body)
        if (kuota && kuota.usage >= kuota.limit) {
          blockKey(state, entry, `kuota habis (${kuota.usage}/${kuota.limit})`, Math.max(60000, nextMidnight() - Date.now()))
        }
        saveState(state)
        const data = body.data || {}
        const task = data.task || {}
        const vip = data.vip || {}
        return {
          ok: true,
          limitTotal: false,
          waktu: `${Date.now() - mulai}ms`,
          pesan: body.message || 'Reaction masuk antrean.',
          kunci: entry.name,
          emoji: task.reaction_code || reaction,
          target,
          paket: vip.packageName || 'VIP',
          usage: body.usage_today !== undefined ? body.usage_today : (kuota ? kuota.usage : null),
          limit: body.limit !== undefined ? body.limit : (kuota ? kuota.limit : null),
          poin: vip.pointRemaining !== undefined ? vip.pointRemaining : null,
          dicoba,
          ringkas,
        }
      }

      // Gagal: jeda sesuai jenis kesalahan, lalu lanjut ke kunci berikutnya.
      if (nilai.jenis === 'limit') {
        ringkas.limit += 1
        blockKey(state, entry, `limit: ${nilai.teks || 'kuota habis'}`, Math.max(60000, nextMidnight() - Date.now()))
      } else if (nilai.jenis === 'sibuk') {
        ringkas.sibuk += 1
        blockKey(state, entry, 'server sibuk', JEDA_SIBUK_MS)
      } else if (nilai.jenis === 'ditolak') {
        ringkas.ditolak += 1
        blockKey(state, entry, `domain/kunci ditolak: ${nilai.teks || `HTTP ${status}`}`, JEDA_DITOLAK_MS)
      } else if (nilai.jenis === 'server') {
        ringkas.server += 1
        blockKey(state, entry, `server error HTTP ${status}`, JEDA_GAGAL_MS)
      } else {
        ringkas.gagal += 1
        blockKey(state, entry, nilai.teks || `HTTP ${status}`, JEDA_GAGAL_MS)
      }
      alasanAkhir.push(`${entry.name}: ${nilai.jenis}${nilai.teks ? ' — ' + nilai.teks : ''}`)
      saveState(state)
    } catch (error) {
      ringkas.gagal += 1
      blockKey(state, entry, 'timeout / jaringan', JEDA_GAGAL_MS)
      alasanAkhir.push(`${entry.name}: jaringan — ${String(error?.message || error).slice(0, 80)}`)
      saveState(state)
    }
  }

  saveState(state)

  /* Semua kunci limit? Termasuk yang sejak awal masih dijeda karena limit. */
  const totalKunci = filter.semua.length
  const karenaLimit = filter.semua.filter((entry) => {
    const jeda = cooldownOf(state, entry)
    return jeda.active && /limit|kuota/i.test(jeda.reason)
  }).length
  const limitTotal = karenaLimit >= totalKunci && totalKunci > 0

  const resetTerdekat = filter.semua
    .map((entry) => cooldownOf(state, entry))
    .filter((jeda) => jeda.active && jeda.until > sekarang)
    .map((jeda) => jeda.until)
    .sort((a, b) => a - b)[0] || 0

  let alasan
  if (limitTotal) {
    alasan = `Semua ${totalKunci} kunci RCH kena limit.`
  } else if (ringkas.sibuk && ringkas.sibuk + ringkas.dilewati >= totalKunci) {
    alasan = 'Server RCH sedang sibuk untuk semua kunci. Coba lagi sebentar.'
  } else if (!dicoba) {
    alasan = 'Semua kunci sedang istirahat.' + (alasanAkhir.length ? '\n' + alasanAkhir.slice(0, 3).join('\n') : '')
  } else {
    alasan = alasanAkhir.slice(0, 4).join('\n') || 'Tidak ada kunci yang bisa dipakai.'
  }

  return {
    ok: false,
    limitTotal,
    totalKunci,
    resetTerdekat,
    dicoba,
    ringkas,
    dibuang: filter.dibuang,
    alasan,
    waktu: `${Date.now() - mulai}ms`,
  }
}

/** Ringkasan kunci untuk `.rch status`. */
export function statusKunci(state = loadState()) {
  const filter = filterKeys(state)
  const sekarang = sekarangAman()
  const baris = []
  for (const entry of filter.siap) {
    const kuota = state.kuota && state.kuota[entry.sidik]
    const sisa = kuota && Number.isFinite(kuota.limit) ? ` — kuota ${kuota.usage}/${kuota.limit}` : ''
    baris.push({ name: entry.name, domain: entry.domain, status: `siap dipakai${sisa}`, jenis: 'siap' })
  }
  for (const entry of filter.jeda) {
    const jeda = entry.jeda
    const sampai = jeda.until > sekarang
      ? new Date(jeda.until).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
      : 'sebentar lagi'
    baris.push({ name: entry.name, domain: entry.domain, status: `istirahat — ${jeda.reason} s/d ${sampai}`, jenis: 'jeda' })
  }
  for (const entry of filter.dibuang) {
    baris.push({ name: entry.name, domain: '-', status: `dibuang — ${entry.alasan}`, jenis: 'dibuang' })
  }
  return baris
}

/* ── perintah WhatsApp ─────────────────────────────────────────────────── */

const handler = async (m, { conn, text, usedPrefix, command, isOwner, isROwner }) => {
  const prefix = usedPrefix || '.'
  const cmd = command || 'rch'
  const isi = String(text || '').trim()

  // .rch reload — baca ulang .env.apikeys tanpa me-restart bot (owner).
  if (/^reload$/i.test(isi)) {
    if (!isOwner && !isROwner) return m.reply('Perintah ini hanya untuk owner bot.')
    refreshApiKeys()
    const jumlah = filterKeys().semua.length
    return m.reply(`🔄 Kunci RCH dibaca ulang dari .env.apikeys.\nKunci siap pakai: *${jumlah}*\nCek detail: ${prefix}${cmd} status`)
  }

  // .rch reset — hapus semua jeda kunci (owner). Berguna kalau jeda salah status.
  if (/^(reset|bersihkan)$/i.test(isi)) {
    if (!isOwner && !isROwner) return m.reply('Perintah ini hanya untuk owner bot.')
    const state = loadState()
    state.blocked = {}
    state.kuota = {}
    saveState(state)
    const jumlah = filterKeys().siap.length
    return m.reply(`🧹 Jeda & catatan kuota kunci RCH dihapus.\nKunci siap dipakai sekarang: *${jumlah}*`)
  }

  // .rch status — pemantauan kunci (isi kunci tidak pernah ditampilkan)
  if (/^(status|cek)$/i.test(isi)) {
    const state = loadState()
    const daftar = statusKunci(state)
    const siap = daftar.filter((k) => k.jenis === 'siap').length
    const jeda = daftar.filter((k) => k.jenis === 'jeda').length
    const buang = daftar.filter((k) => k.jenis === 'dibuang').length
    const baris = daftar.length
      ? daftar.map((k, i) => `${i + 1}. *${k.name}* — ${k.status}`).join('\n')
      : '_Belum ada kunci. Isi UMI_RCH_KEY di .env.apikeys._'
    return m.reply(
      `🔑 *STATUS KUNCI RCH*\n\n${baris}\n\n` +
      `Siap: *${siap}* · istirahat: *${jeda}* · dibuang: *${buang}*\n` +
      `Sinkron terakhir: ${state.lastSync ? new Date(state.lastSync).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'belum pernah'}\n` +
      `Perintah: ${prefix}${cmd} <link_post> <emoji> · ${prefix}${cmd} reset`
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
    /* "RCH LIMIT" otomatis: semua kunci kena limit → bot langsung memberi tahu,
     * tidak menunggu pengguna bertanya lagi. */
    if (hasil.limitTotal) {
      await beritahuOwnerLimit(conn, m, hasil).catch(() => {})
      const reset = hasil.resetTerdekat
        ? new Date(hasil.resetTerdekat).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
        : 'besok'
      return m.reply(
        `🚫 *RCH LIMIT*\n\n` +
        `Semua *${hasil.totalKunci}* kunci API RCH sudah kena limit / kuota habis.\n` +
        `⏳ Reset otomatis: *${reset}* (WIB)\n` +
        `🔁 Kunci dicoba: ${hasil.dicoba}\n\n` +
        `Reaction tidak bisa dikirim sekarang. Coba lagi setelah reset, atau minta owner menambah kunci baru (isi \`UMI_RCH_KEY\`).\n` +
        `⏱️ ${hasil.waktu}`
      )
    }
    return m.reply(`❌ *REACTION GAGAL*\n\n⚠️ ${hasil.alasan}\n⏱️ ${hasil.waktu}`)
  }

  const kuota = hasil.usage !== null && hasil.limit !== null ? `${hasil.usage}/${hasil.limit}` : '-'
  const catatan = hasil.dicoba > 1 ? `\n🔁 Kunci dicoba: ${hasil.dicoba}` : ''
  return m.reply(
    `✅ *REACTION MASUK ANTREAN*\n\n` +
    `🎭 Emoji : ${hasil.emoji}\n` +
    `🔗 Target: ${hasil.target}\n\n` +
    `👑 Kunci : ${hasil.kunci}\n` +
    `📦 Paket : ${hasil.paket}\n` +
    `📊 Kuota : ${kuota}\n` +
    (hasil.poin !== null ? `🪙 Poin  : ${hasil.poin}\n` : '') +
    catatan +
    `\n⏱️ ${hasil.waktu}`
  )
}

/* Pemberitahuan ke pemilik bot saat semua kunci limit (maks. 1×/jam). */
let alertTerakhir = 0
const ALERT_JEDA_MS = 60 * 60 * 1000

async function beritahuOwnerLimit(conn, m, hasil) {
  if (process.env.UMI_RCH_ALERT_OWNER === 'off') return
  if (Date.now() - alertTerakhir < ALERT_JEDA_MS) return
  const pemilik = String(process.env.UMI_RCH_ALERT_NUMBER || '').replace(/\D/g, '') || (() => {
    const daftar = Array.isArray(global.owner) ? global.owner : []
    const baris = daftar.find((item) => Array.isArray(item) && item[2] !== false) || daftar[0]
    const nomor = Array.isArray(baris) ? baris[0] : baris
    return String(nomor || '').replace(/\D/g, '')
  })()
  if (!pemilik) return
  const pengirim = String(m.sender || '').split('@')[0].replace(/\D/g, '')
  if (pengirim === pemilik) return
  alertTerakhir = Date.now()
  const reset = hasil.resetTerdekat ? new Date(hasil.resetTerdekat).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'besok'
  await conn.reply(
    `${pemilik}@s.whatsapp.net`,
    `🚫 *RCH LIMIT*\n\nSemua ${hasil.totalKunci} kunci API RCH habis/limit.\n` +
    `Reset: ${reset} (WIB)\nPelapor: wa.me/${pengirim || '-'}\n\n` +
    `Tambah kunci baru di \`.env.apikeys\` → \`UMI_RCH_KEY\`, lalu kirim \`.rch reload\`.`,
    null
  )
}

handler.help = ['rch <link_post> <emoji>', 'rch status', 'rch reset']
handler.tags = ['tools']
handler.command = ['rch', 'reactchannel']
handler.description = 'Reaction ke post WhatsApp Channel memakai kunci RCH VIP (filter + rotasi kunci otomatis, pesan RCH LIMIT bila semua habis)'

export { collectKeys, klasifikasiRespons as klasifikasi, nextMidnight, syncRemoteKeys as syncKunci }
export default handler
