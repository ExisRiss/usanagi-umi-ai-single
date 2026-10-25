/* By AlzRiss - Usanagi Umi AI
 *
 * Statistik WEBSITE (Supabase) untuk kartu menu.
 *
 * Prinsip:
 *  - angka diambil langsung dari database website saat menu dibuka;
 *  - tidak ada angka contoh/hardcoded — kalau kunci belum diisi atau
 *    jaringan gagal, hasilnya `available: false` dan menu menulis
 *    "Tidak tersedia";
 *  - hanya MENGHITUNG baris (count), tidak pernah mengambil isi kolom
 *    sensitif seperti api_token/email;
 *  - hasil di-cache singkat (30 detik) supaya menekan beban REST.
 */

const CACHE_TTL_MS = 30000
const TIMEOUT_MS = 6000

let cache = { at: 0, value: null }

function env(...names) {
  for (const name of names) {
    const value = process.env[name]
    if (value && String(value).trim()) return String(value).trim()
  }
  return ''
}

/**
 * Kunci dibaca dari environment ATAU `config/api-keys.js`.
 *
 * Bot ini tidak memakai dotenv, jadi di server kunci asli disimpan di
 * config/api-keys.js (berkas yang sama dengan kunci API lain, dan tidak
 * ikut di-push berisi nilai asli).
 */
async function fileConfig() {
  try {
    // config/api-keys.js adalah pusat kunci bot ini: nilainya bisa datang dari
    // global.apiKeys, `.env.apikeys` (0600), atau environment panel.
    const mod = await import('../../config/api-keys.js')
    if (typeof mod?.apiKey === 'function') {
      return {
        url: String(mod.apiKey('supabaseUrl') || '').trim(),
        key: String(mod.apiKey('supabaseServiceKey') || '').trim(),
      }
    }
    const cfg = mod?.default || mod || {}
    return {
      url: String(cfg.supabaseUrl || '').trim(),
      key: String(cfg.supabaseServiceKey || '').trim(),
    }
  } catch {
    return { url: '', key: '' }
  }
}

async function supabaseConfig() {
  const fromEnv = {
    url: env('UMI_DATA_SUPABASE_URL', 'SUPABASE_URL'),
    key: env('UMI_DATA_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'UMI_DATA_SUPABASE_KEY'),
  }
  if (fromEnv.url && fromEnv.key) return { url: fromEnv.url.replace(/\/+$/, ''), key: fromEnv.key }
  const fromFile = await fileConfig()
  return { url: fromFile.url.replace(/\/+$/, ''), key: fromFile.key }
}

async function countRows(url, key, table, query = '') {
  const endpoint = `${url}/rest/v1/${table}?select=${table === 'platform_profiles' ? 'auth_id' : 'id'}${query}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(endpoint, {
      method: 'HEAD',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
        Range: '0-0',
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const range = response.headers.get('content-range') || ''
    const total = Number(String(range).split('/')[1])
    return Number.isFinite(total) ? total : null
  } finally {
    clearTimeout(timer)
  }
}

async function serverStatus(url, key) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${url}/rest/v1/api_server_status?select=service,status,checked_at&order=checked_at.desc&limit=8`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const rows = await response.json()
    if (!Array.isArray(rows) || !rows.length) return { total: 0, online: 0, checkedAt: null }
    const latest = rows[0]
    const online = rows.filter(row => String(row.status || '').toLowerCase() === 'online' || row.status === true).length
    return { total: rows.length, online, checkedAt: latest.checked_at || null }
  } finally {
    clearTimeout(timer)
  }
}

function agoText(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return 'baru saja'
  if (minutes < 60) return `${minutes} menit lalu`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  return `${Math.round(hours / 24)} hari lalu`
}

/**
 * @returns {Promise<{available:boolean, reason?:string, users?:number, active24h?:number,
 *   banned?:number, services?:{total:number,online:number}, checkedText?:string, updatedAt:number}>}
 */
export async function collectWebStats({ force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.at < CACHE_TTL_MS) return cache.value

  const { url, key } = await supabaseConfig()
  if (!url || !key) {
    const value = { available: false, reason: 'UMI_DATA_SUPABASE_URL / SERVICE_ROLE_KEY belum diisi di .env' }
    cache = { at: Date.now(), value }
    return value
  }

  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const [users, active24h, banned, services] = await Promise.all([
      countRows(url, key, 'platform_profiles'),
      countRows(url, key, 'platform_profiles', `&last_seen_at=gte.${encodeURIComponent(since)}`),
      countRows(url, key, 'platform_profiles', '&banned=eq.true'),
      serverStatus(url, key).catch(() => null),
    ])

    const value = {
      available: users !== null,
      reason: users === null ? 'database website tidak menjawab' : '',
      users: users ?? 0,
      active24h: active24h ?? 0,
      banned: banned ?? 0,
      services: services ? { total: services.total, online: services.online } : { total: 0, online: 0 },
      checkedText: services ? agoText(services.checkedAt) : '',
      updatedAt: Date.now(),
    }
    cache = { at: Date.now(), value }
    return value
  } catch (error) {
    const value = { available: false, reason: `gagal membaca website: ${String(error?.message || error).slice(0, 80)}` }
    cache = { at: Date.now(), value }
    return value
  }
}

export function resetWebStatsCache() {
  cache = { at: 0, value: null }
}
