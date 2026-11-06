/* Task205 — MESIN AKSES & PERINGATAN
 *
 * Permintaan owner (04-11-2026):
 *   /private  → bot khusus owner/developer, user lain tidak bisa pakai.
 *   /public   → bot bisa dipakai semua.
 *   /onlygc on  → hanya group; maksa di pribadi → kirim warning.
 *   /onlygc off → bisa dipakai di pribadi dan group.
 *   /onlypc on  → bot bisa dipakai di pribadi (group tidak dilayani).
 *   /onlypc off → chat pribadi DIBATASI: warning → lewat batas → tindakan
 *                 (block / blacklist, pilihan button), dan bot tidak
 *                 merespons di group.
 *   /onlygcset & /onlypcset → atur warning: on/off, jumlah warning sebelum
 *                 tindakan, teks warning, tindakan (button: block/blacklist).
 *   "Warning dulu langsung ambil tindakan, atau langsung ambil tindakan."
 *
 * Modul ini MURNI (tanpa I/O) supaya bisa diuji tanpa WhatsApp.
 * Penyimpanan: `global.db.data.accessWarn = { config, counts }`.
 */

/** Mode permukaan yang tersimpan di core/awang-mode (SQLite). */
export const MODE = Object.freeze({
  NORMAL: 'normal',
  ONLY_GC: 'onlygc',
  ONLY_PC: 'onlypc',
  OFF: 'off',
})

/**
 * Flag akses per mode.
 *   pc     — chat pribadi dilayani?
 *   gc     — group dilayani?
 *   warnPc — saat PC ditolak: kirim warning dulu (true) atau langsung diam (false)
 */
export function flagMode(mode) {
  if (mode === MODE.ONLY_GC) return { pc: false, gc: true, warnPc: true }
  if (mode === MODE.ONLY_PC) return { pc: true, gc: false, warnPc: false }
  if (mode === MODE.OFF) return { pc: false, gc: false, warnPc: true }
  return { pc: true, gc: true, warnPc: false }
}

/** Mode yang dipakai handler: jadibot onlyGroup = onlygc, selain itu SQLite. */
export function modeEfektif({ onlyGroup = false, mode } = {}) {
  if (onlyGroup === true) return MODE.ONLY_GC
  return Object.values(MODE).includes(mode) ? mode : MODE.NORMAL
}

export function configDefault() {
  return {
    enabled: true,
    threshold: 3,
    text: 'Chat pribadi sedang dibatasi pemilik bot. Nomor kamu akan ditindak jika terus mengirim command.',
    action: 'block',
  }
}

function angkaValid(n, min, max, fallback) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, Math.floor(v)))
}

/** Baca config peringatan dari db.data (lengkapi default, tanpa merusak). */
export function muatConfig(dbData) {
  const d = configDefault()
  const c = dbData && dbData.accessWarn && dbData.accessWarn.config
  if (!c || typeof c !== 'object') return d
  return {
    enabled: c.enabled !== false,
    threshold: angkaValid(c.threshold, 1, 20, d.threshold),
    text: typeof c.text === 'string' && c.text.trim() ? c.text : d.text,
    action: c.action === 'blacklist' ? 'blacklist' : 'block',
  }
}

/** Timpa config (partial) dan simpan ke db.data. */
export function simpanConfig(dbData, patch = {}) {
  if (!dbData.accessWarn || typeof dbData.accessWarn !== 'object') dbData.accessWarn = {}
  const gabung = Object.assign({}, muatConfig(dbData), patch)
  dbData.accessWarn.config = {
    enabled: gabung.enabled !== false,
    threshold: angkaValid(gabung.threshold, 1, 20, 3),
    text: typeof gabung.text === 'string' && gabung.text.trim() ? gabung.text.trim() : configDefault().text,
    action: gabung.action === 'blacklist' ? 'blacklist' : 'block',
  }
  return dbData.accessWarn.config
}

function muatCounts(dbData) {
  if (!dbData.accessWarn || typeof dbData.accessWarn !== 'object') dbData.accessWarn = {}
  if (!dbData.accessWarn.counts || typeof dbData.accessWarn.counts !== 'object') dbData.accessWarn.counts = {}
  return dbData.accessWarn.counts
}

/**
 * Catat satu peringatan untuk jid.
 * @returns {{count:number, threshold:number, lewat:boolean}}
 */
export function catatPeringatan(dbData, jid) {
  const config = muatConfig(dbData)
  const counts = muatCounts(dbData)
  const kunci = String(jid || '')
  const next = (Number(counts[kunci]) || 0) + 1
  counts[kunci] = next
  return { count: next, threshold: config.threshold, lewat: next >= config.threshold }
}

export function hitungan(dbData, jid) {
  const counts = muatCounts(dbData)
  return Number(counts[String(jid || '')]) || 0
}

export function resetHitungan(dbData, jid) {
  const counts = muatCounts(dbData)
  if (jid === undefined) {
    dbData.accessWarn.counts = {}
    return 0
  }
  const before = Number(counts[String(jid)]) || 0
  delete counts[String(jid)]
  return before
}

/**
 * Keputusan utama gerbang akses.
 * @returns {'izinkan'|'diam'|'peringatan'}
 */
export function putusanAkses({
  mode = MODE.NORMAL,
  isGroup = false,
  isOwner = false,
  isCommand = false,
  realmAccess = false,
} = {}) {
  if (isOwner) return 'izinkan'
  const f = flagMode(mode)
  const dilayani = isGroup ? f.gc : f.pc
  if (dilayani) return 'izinkan'
  /* Permukaan dibatasi: */
  if (!isCommand) return 'diam'
  if (isGroup) return 'diam' // group dibatasi → tidak ada respon (permintaan owner)
  if (!f.warnPc) return 'diam'
  if (realmAccess) return 'izinkan' // aturan lama: command realms tetap jalan di PC
  return 'peringatan'
}

/** Teks peringatan final (dikirim bersama tindakan). */
export function teksTindakan(config, action) {
  const nama = action === 'blacklist' ? 'BLACKLIST (bot tidak akan merespons nomor ini lagi)' : 'DIBLOKIR'
  return config.text + '\n\n⛔ Tindakan: ' + nama
}

/** Label tindakan untuk ditampilkan di menu. */
export function tindakanLabel(action) {
  return action === 'blacklist' ? 'BLACKLIST' : 'BLOCK (WhatsApp)'
}

/**
 * Terapkan tindakan ke user.
 * @param {object} deps { conn, dbData }
 * @returns {Promise<{berhasil:boolean, jalur:string}>}
 *   jalur: 'wa-block' | 'blacklist' | 'gagal'
 */
export async function terapkanTindakan(deps, jid, action) {
  const { conn, dbData } = deps
  const kunci = String(jid || '')
  try {
    if (action === 'block' && conn && typeof conn.updateBlockStatus === 'function') {
      await conn.updateBlockStatus(kunci, 'block')
      return { berhasil: true, jalur: 'wa-block' }
    }
  } catch { /* jatuh ke blacklist */ }
  try {
    if (!dbData.blacklistUser || typeof dbData.blacklistUser !== 'object') dbData.blacklistUser = {}
    dbData.blacklistUser[kunci] = Date.now()
    return { berhasil: true, jalur: 'blacklist' }
  } catch {
    return { berhasil: false, jalur: 'gagal' }
  }
}

export default {
  MODE,
  flagMode,
  modeEfektif,
  configDefault,
  muatConfig,
  simpanConfig,
  catatPeringatan,
  hitungan,
  resetHitungan,
  putusanAkses,
  teksTindakan,
  tindakanLabel,
  terapkanTindakan,
}
