/* By AlzRiss - Usanagi Umi AI
 *
 * Task152 — penyaji situs subdomain dari server bot sendiri.
 *
 * Sebelumnya berkas situs disimpan di panel Kaira (server terpisah) dan
 * disajikan lewat tunnel lain. Sekarang:
 *
 *   berkas  : `situs/<nama>/…` di server bot
 *   DNS     : CNAME <nama>-alzriss.gwenna.my.id → tunnel bot
 *   penyaji : API bot (port 2176) mengenali Host lalu membaca berkas lokal
 *
 * Modul ini dipanggil paling awal di `lib/jadibot-platform-api.js#route`,
 * jadi domain situs tidak pernah masuk ke router API.
 */

import fs from 'fs'
import path from 'path'
import { bacaKonfig, situsDariHostKustom } from './subdomain-kaira.js'
import { amanJalur } from './arsip.js'

const AKAR_SITUS = path.join(process.cwd(), 'situs')
const BERKAS_REGISTRY = path.join(process.cwd(), 'data', 'subdomain-registry.json')

const TIPE = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
}

let cacheRegistry = { cap: '', data: {} }

/**
 * Registry kepemilikan subdomain.
 * Cache dikunci ke mtime+ukuran berkas, jadi perubahan (klaim/hapus) langsung
 * terlihat pada permintaan berikutnya tanpa menunggu hitungan detik.
 */
export function registrySitus() {
  let cap = ''
  try {
    const stat = fs.statSync(BERKAS_REGISTRY)
    cap = `${stat.mtimeMs}:${stat.size}`
  } catch (error) {
    return {}
  }
  if (cap === cacheRegistry.cap) return cacheRegistry.data
  let data = {}
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS_REGISTRY, 'utf8'))
    if (isi && typeof isi === 'object') data = isi
  } catch (error) { /* registry rusak → anggap kosong */ }
  cacheRegistry = { cap, data }
  return data
}

/** Nama subdomain dari header Host, atau '' bila bukan domain situs. */
export function namaDariHost(host) {
  const bersih = String(host || '').split(':')[0].toLowerCase().replace(/\.$/, '')
  if (!bersih) return ''
  /* Task154 — domain kustom milik user (mis. kaeira.my.id) punya folder sendiri. */
  const kustom = situsDariHostKustom(bersih)
  if (kustom) return kustom
  const cfg = bacaKonfig() || {}
  const domain = String(cfg.domain || 'alzriss.gwenna.my.id').toLowerCase().replace(/^\.+|\.+$/g, '')
  if (!domain || bersih === domain) return ''
  for (const akhiran of [`-${domain}`, `.${domain}`]) {
    if (bersih.endsWith(akhiran)) {
      const nama = bersih.slice(0, bersih.length - akhiran.length)
      return /^[a-z0-9][a-z0-9-]{1,40}$/.test(nama) ? nama : ''
    }
  }
  return ''
}

function kirim(res, status, tipe, isi, tambahan = {}) {
  res.writeHead(status, {
    'Content-Type': tipe,
    'Content-Length': Buffer.byteLength(isi),
    'X-Content-Type-Options': 'nosniff',
    ...tambahan,
  })
  res.end(isi)
}

function halamanPesan(judul, pesan, nama) {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${judul}${nama ? ' — ' + nama : ''}</title>
<style>
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1020;color:#e6edf7;
      font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:24px}
 .kartu{max-width:520px;background:rgba(15,23,42,.85);border:1px solid rgba(148,163,184,.25);
        border-radius:18px;padding:26px;box-shadow:0 20px 50px rgba(0,0,0,.45)}
 h1{margin:0 0 8px;font-size:20px} p{margin:0;color:#9fb0c9;line-height:1.6;font-size:14px}
 code{background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.35);padding:1px 6px;border-radius:6px;font-size:12.5px}
</style></head>
<body><main class="kartu"><h1>${judul}</h1><p>${pesan}</p></main></body></html>`
}

/**
 * Layani permintaan bila Host adalah subdomain situs.
 * @returns {boolean} true bila permintaan sudah ditangani.
 */
export function layaniSitus(req, res) {
  const nama = namaDariHost(req.headers ? req.headers.host : '')
  if (!nama) return false

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    kirim(res, 405, 'text/plain; charset=utf-8', 'Metode tidak didukung.', { Allow: 'GET, HEAD' })
    return true
  }

  const info = registrySitus()[nama]
  if (info && info.status === 'nonaktif') {
    kirim(res, 503, 'text/html; charset=utf-8', halamanPesan(
      '⏸️ Situs sedang nonaktif',
      `Subdomain <code>${nama}</code> dinonaktifkan pemiliknya. Hubungi pemilik atau owner bot untuk mengaktifkan kembali.`,
      nama,
    ), { 'Cache-Control': 'no-store' })
    return true
  }

  const akarSitus = path.join(AKAR_SITUS, nama)
  const belumAda = (judul, pesan) => halamanPesan(judul, pesan, nama)

  let jalurPermintaan = '/'
  try {
    jalurPermintaan = decodeURIComponent(String(req.url || '/').split('?')[0].split('#')[0])
  } catch (error) {
    jalurPermintaan = '/'
  }

  let relatif = amanJalur(jalurPermintaan.replace(/^\/+/, ''))
  if (!relatif && jalurPermintaan !== '/') {
    kirim(res, 400, 'text/html; charset=utf-8', belumAda('400 — Jalur tidak valid', 'Alamat yang diminta tidak dikenali.'))
    return true
  }
  if (!relatif || relatif.endsWith('/')) relatif = `${relatif}index.html`

  const berkas = path.resolve(akarSitus, relatif)
  if (!berkas.startsWith(akarSitus + path.sep)) {
    kirim(res, 400, 'text/html; charset=utf-8', belumAda('400 — Jalur tidak valid', 'Alamat yang diminta tidak dikenali.'))
    return true
  }

  let target = berkas
  let info2 = null
  try {
    info2 = fs.statSync(target)
    if (info2.isDirectory()) {
      target = path.join(target, 'index.html')
      info2 = fs.statSync(target)
    }
  } catch (error) {
    info2 = null
  }

  if (!info2 || !info2.isFile()) {
    kirim(res, 404, 'text/html; charset=utf-8', belumAda(
      '🌐 404 — Halaman belum ada',
      info
        ? `Subdomain <code>${nama}</code> aktif, tetapi halaman ini belum diunggah.<br><br>Pemilik bisa mengisi situs dengan <code>.deploysubdomain ${nama} ganti</code>.`
        : `Subdomain <code>${nama}</code> belum terdaftar di bot ini.<br><br>Daftarkan lewat WhatsApp: <code>.addsubdomainmy ${nama}</code>.`,
    ), { 'Cache-Control': 'no-store' })
    return true
  }

  const ekstensi = path.extname(target).toLowerCase()
  const tipe = TIPE[ekstensi] || 'application/octet-stream'
  const cache = /\.(?:html?|json)$/i.test(ekstensi) ? 'no-cache' : 'public, max-age=3600'

  try {
    const isi = fs.readFileSync(target)
    res.writeHead(200, {
      'Content-Type': tipe,
      'Content-Length': isi.length,
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
      'X-Umi-Situs': nama,
    })
    res.end(req.method === 'HEAD' ? undefined : isi)
  } catch (error) {
    kirim(res, 500, 'text/plain; charset=utf-8', 'Gagal membaca berkas situs.', { 'Cache-Control': 'no-store' })
  }
  return true
}

export default { layaniSitus, namaDariHost, registrySitus }
