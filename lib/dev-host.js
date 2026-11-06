/* By AlzRiss - Usanagi Umi AI
 *
 * Task215 — GERBANG HOST DEVELOPER.
 *
 * Kenapa ada: pemilik punya 3 domain. `alzar.biz.id` adalah domain INTERNAL
 * (panel, konsol, API pengembang) dan tidak boleh dipakai pengguna jadibot,
 * sedangkan `alzriss.my.id` dan `alzriss.web.id` terbuka untuk publik.
 *
 * Cara kerja: gerbang ini berjalan SEBELUM router API mana pun. Permintaan ke
 * host developer hanya dilayani bila membawa bukti identitas developer:
 *
 *   1. header `x-umi-dev-ticket`  — tiket HMAC (dibuat website/konsol owner),
 *   2. header `x-umi-dev-key`     — kunci statis dari data/developer-key.json,
 *   3. `?devkey=`                 — untuk browser/curl manual (dipakai hemat),
 *   4. alamat IP yang ada di daftar `izinkanIp` konfigurasi.
 *
 * Semua kegagalan → 404 (BUKAN 403). Alasannya disengaja: host internal tidak
 * boleh "mengaku" ada. Penyerang yang menebak-nebak tidak mendapat sinyal apa
 * pun bahwa host itu hidup atau apa isinya.
 *
 * Aturan keselamatan:
 *   • Kunci TIDAK pernah ditulis ke log, ke pesan galat, atau ke repo.
 *   • Perbandingan memakai timingSafeEqual (tahan tebak-waktu).
 *   • Path publik yang tetap terbuka: /api/health, /favicon.ico, /robots.txt
 *     (untuk pemantauan uptime), sisanya tertutup.
 *   • Bisa dimatikan total lewat `data/dev-host.json` → { "aktif": false }.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/* Host developer bawaan. Pola `*.domain` = seluruh subdomain ikut terkunci,
 * supaya subdomain baru (panel., dev., api.) TIDAK bocor ke publik hanya karena
 * belum didaftarkan. Tambahan/pengecualian lewat data/dev-host.json. */
export const HOST_DEV_BAWAAN = ['alzar.biz.id', '*.alzar.biz.id']

/* Host milik pengguna — TIDAK boleh ikut terkunci. Didaftarkan eksplisit agar
 * kalau nanti alzar.biz.id dipakai publik, tinggal hapus dari HOST_DEV. */
const HOST_PUBLIK = new Set(['alzriss.my.id', 'alzriss.web.id', 'gwenna.my.id'])

/* Subdomain publik yang tetap terbuka walau di bawah domain developer — mis.
 * nanti `game.alzar.biz.id` untuk publik. Isi lewat data/dev-host.json
 * (`publik: ["game.alzar.biz.id"]`). */
let cachePengecualian = null
function daftarPengecualian() {
  if (cachePengecualian) return cachePengecualian
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS_BEBAS(), 'utf8'))
    cachePengecualian = new Set((Array.isArray(isi.publik) ? isi.publik : []).map((h) => String(h).toLowerCase()))
  } catch {
    cachePengecualian = null
  }
  return cachePengecualian
}

export const PATH_PUBLIK = new Set(['/api/health', '/favicon.ico', '/robots.txt'])

const BERKAS_KONFIG = () => path.join(process.cwd(), 'data', 'dev-host.json')
const BERKAS_KUNCI = () => path.join(process.cwd(), 'data', 'developer-key.json')
const BERKAS_BEBAS = () => path.join(process.cwd(), 'data', 'dev-host.json')

let cacheKonfig = null
let cacheKunci = null

/** Baca data/dev-host.json (opsional). Kegagalan apa pun → nilai bawaan. */
export function bacaKonfigDev(kuatUlang = false) {
  if (cacheKonfig && !kuatUlang) return cacheKonfig
  const bawaan = { aktif: true, host: HOST_DEV_BAWAAN.slice(), izinkanIp: [], izinkanTanpaKunci: false }
  let isi = {}
  try {
    isi = JSON.parse(fs.readFileSync(BERKAS_KONFIG(), 'utf8'))
  } catch { /* berkas belum ada → pakai bawaan */ }
  const host = Array.isArray(isi.host) && isi.host.length ? isi.host.map((h) => String(h).toLowerCase()) : bawaan.host
  cacheKonfig = {
    aktif: isi.aktif === undefined ? bawaan.aktif : Boolean(isi.aktif),
    host,
    izinkanIp: Array.isArray(isi.izinkanIp) ? isi.izinkanIp.map(String) : [],
    izinkanTanpaKunci: Boolean(isi.izinkanTanpaKunci),
  }
  return cacheKonfig
}

/**
 * Kunci developer. Dibaca dari data/developer-key.json → { "kunci": "..." }.
 * Kalau belum ada, dibuat OTOMATIS 32 byte hex dan disimpan mode 600, supaya
 * deploy baru tetap punya pintu masuk (dicetak SEKALI di log saat dibuat,
 * bukan setiap kali — log server bisa dibaca operator, bukan publik).
 */
export function kunciDeveloper() {
  if (cacheKunci) return cacheKunci
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS_KUNCI(), 'utf8'))
    if (isi && typeof isi.kunci === 'string' && isi.kunci.length >= 32) {
      cacheKunci = isi.kunci
      return cacheKunci
    }
  } catch { /* belum ada */ }
  const baru = crypto.randomBytes(32).toString('hex')
  try {
    fs.mkdirSync(path.dirname(BERKAS_KUNCI()), { recursive: true })
    fs.writeFileSync(BERKAS_KUNCI(), JSON.stringify({ kunci: baru, dibuat: new Date().toISOString() }, null, 2), { mode: 0o600 })
    console.log('[DEV-HOST] kunci developer dibuat di data/developer-key.json (mode 600).')
  } catch (error) {
    console.warn('[DEV-HOST] gagal menyimpan kunci developer:', error?.message || error)
  }
  cacheKunci = baru
  return cacheKunci
}

const samaAman = (a, b) => {
  const x = Buffer.from(String(a || ''))
  const y = Buffer.from(String(b || ''))
  if (x.length !== y.length) return false
  try { return crypto.timingSafeEqual(x, y) } catch { return false }
}

const hostDari = (req) => String(
  (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || ''
).split(':')[0].toLowerCase()

/** Host ini termasuk wilayah developer? */
export function hostDeveloper(host, konfig) {
  const h = String(host || '').toLowerCase().split(':')[0]
  if (!h) return false
  if (HOST_PUBLIK.has(h)) return false
  if (daftarPengecualian() && daftarPengecualian().has(h)) return false
  const { host: daftar } = konfig || bacaKonfigDev()
  for (const pola of daftar) {
    const p = pola.replace(/:\d+$/, '')
    if (p.startsWith('*.')) {
      const akar = p.slice(2)
      if (h === akar || h.endsWith('.' + akar)) return true
    } else if (h === p) return true
  }
  return false
}

/** Apakah permintaan ini membawa bukti identitas developer yang sah? */
export function punyaIzinDev(req, url, konfig) {
  const cfg = konfig || bacaKonfigDev()
  const kunci = kunciDeveloper()
  const header = (nama) => String((req.headers && req.headers[nama]) || '').trim()
  const key = header('x-umi-dev-key') || String((url && url.searchParams && url.searchParams.get('devkey')) || '').trim()
  if (key && samaAman(key, kunci)) return { ok: true, cara: 'kunci' }
  const ip = String(
    (req.headers && (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'])) || ''
  ).split(',')[0].trim()
  if (ip && cfg.izinkanIp.some((x) => samaAman(x, ip))) return { ok: true, cara: 'ip' }
  /* Tiket HMAC: dibuat pihak lain (website) memakai kunci yang sama. */
  const tiket = header('x-umi-dev-ticket')
  if (tiket) {
    const [badan, tanda] = tiket.split('.')
    if (badan && tanda) {
      const harap = crypto.createHmac('sha256', kunci).update(badan).digest('base64url')
      if (samaAman(tanda, harap)) {
        try {
          const isi = JSON.parse(Buffer.from(badan, 'base64url').toString('utf8'))
          if (isi && Number.isFinite(isi.exp) && isi.exp > Date.now()) return { ok: true, cara: 'tiket' }
        } catch { /* tiket rusak → tolak */ }
      }
    }
  }
  return { ok: false, cara: '' }
}

/**
 * Gerbang utama. Panggil PALING AWAL di handler HTTP.
 *
 * @returns {boolean} true  = permintaan sudah dijawab (ditolak) → jangan lanjut
 *                    false = boleh diteruskan ke router biasa
 */
export function tolakJikaHostDev(req, res, url) {
  const cfg = bacaKonfigDev()
  const host = hostDari(req)
  if (!hostDeveloper(host, cfg)) return false
  if (!cfg.aktif) return false

  const jalur = String((url && url.pathname) || '/').split('?')[0]
  if (PATH_PUBLIK.has(jalur)) return false

  if (cfg.izinkanTanpaKunci) return false
  const izin = punyaIzinDev(req, url, cfg)
  if (izin.ok) return false

  /* 404, bukan 403: host internal tidak boleh mengaku. */
  const isi = 'Not Found'
  try {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    res.end(isi)
  } catch { /* koneksi sudah tertutup */ }
  return true
}

/** Ringkasan untuk /api/health & log — tanpa membocorkan kunci. */
export function ringkasGerbang() {
  const cfg = bacaKonfigDev()
  return {
    aktif: cfg.aktif,
    hostDeveloper: cfg.host,
    jumlahIpDiizinkan: cfg.izinkanIp.length,
    kunciTerpasang: Boolean(cacheKunci || (() => { try { return fs.existsSync(BERKAS_KUNCI()) } catch { return false } })()),
  }
}

export default { tolakJikaHostDev, hostDeveloper, punyaIzinDev, ringkasGerbang, bacaKonfigDev, HOST_DEV_BAWAAN }
