/* By AlzRiss - Usanagi Umi AI
 *
 * Task155 — upload publik: media/berkas dari WhatsApp menjadi tautan
 * unduhan di server bot sendiri.
 *
 *   https://upload.gwenna.my.id/<id akun>/<nama berkas>
 *
 * Struktur penyimpanan:
 *   data/upload-publik/<id akun>/<nama berkas>
 *   data/upload-publik.json  → konfigurasi { host, maksUkuran, simpanHari }
 *
 * Penyajian (HTTP) dipanggil dari `lib/jadibot-platform-api.js#route` lewat
 * `layaniUpload()`, memakai header Host — sama seperti penyaji situs subdomain.
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const AKAR = path.join(process.cwd(), 'data', 'upload-publik')
const BERKAS_KONFIG = path.join(process.cwd(), 'data', 'upload-publik.json')

const BAWAAN = {
  host: 'upload.gwenna.my.id',
  maksUkuran: 100 * 1024 * 1024,
  simpanHari: 90,
  inline: ['image/', 'video/', 'audio/', 'application/pdf', 'text/plain'],
}

let cacheKonfig = { waktu: 0, data: BAWAAN }

export function bacaKonfigUpload() {
  if (Date.now() - cacheKonfig.waktu < 5000) return cacheKonfig.data
  let data = { ...BAWAAN }
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS_KONFIG, 'utf8'))
    if (isi && typeof isi === 'object') data = { ...BAWAAN, ...isi }
  } catch (error) { /* pakai bawaan */ }
  cacheKonfig = { waktu: Date.now(), data }
  return data
}

export function hostUpload() {
  return String(bacaKonfigUpload().host || BAWAAN.host).toLowerCase()
}

export function batasUkuranUpload() {
  const nilai = Number(bacaKonfigUpload().maksUkuran)
  return Number.isFinite(nilai) && nilai > 0 ? nilai : BAWAAN.maksUkuran
}

/* ── nama & id ─────────────────────────────────────────────────────────── */

/** Nama berkas aman: tanpa folder, tanpa karakter aneh, tetap berekstensi. */
export function namaBerkasAman(nama, cadangan = 'berkas') {
  const asli = String(nama || '').replace(/\\/g, '/').split('/').pop() || ''
  const bersih = asli
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.\-]+/, '')
    .slice(-80)
  if (!bersih || bersih === '.' || bersih === '..') return cadangan
  return bersih
}

/**
 * ID akun untuk folder upload.
 * Nomor WhatsApp tidak pernah ditulis apa adanya di URL — dipakai hash pendek
 * yang stabil, jadi berkas orang yang sama selalu berkumpul di satu folder.
 */
export function idAkun(jid) {
  const nomor = String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
  if (!nomor) return ''
  const hash = crypto.createHash('sha256').update(`umi-upload:${nomor}`).digest('hex')
  return parseInt(hash.slice(0, 12), 16).toString(36).padStart(7, '0').slice(0, 8)
}

export function idAcak() {
  return crypto.randomBytes(5).toString('hex').slice(0, 8)
}

/** Tambah akhiran bila nama berkas sudah dipakai (−1, −2, …). */
function namaUnik(folder, nama) {
  const ext = path.extname(nama)
  const dasar = nama.slice(0, nama.length - ext.length) || 'berkas'
  let calon = nama
  let n = 0
  while (fs.existsSync(path.join(folder, calon)) && n < 500) {
    n++
    calon = `${dasar}-${n}${ext}`
  }
  return calon
}

/* ── simpan & baca ─────────────────────────────────────────────────────── */

const EKSTENSI_MIME = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/3gpp': '.3gp', 'video/quicktime': '.mov',
  'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/wav': '.wav',
  'application/pdf': '.pdf', 'application/zip': '.zip', 'application/x-7z-compressed': '.7z',
  'application/vnd.rar': '.rar', 'application/x-tar': '.tar', 'application/gzip': '.gz',
  'application/vnd.android.package-archive': '.apk', 'text/plain': '.txt',
}

/** Ekstensi cadangan dari mime / tipe pesan. */
export function ekstensiDari(mime = '', tipe = '') {
  const bersih = String(mime || '').split(';')[0].trim().toLowerCase()
  if (EKSTENSI_MIME[bersih]) return EKSTENSI_MIME[bersih]
  if (bersih.startsWith('image/')) return `.${bersih.split('/')[1] || 'jpg'}`
  if (bersih.startsWith('video/')) return `.${bersih.split('/')[1] || 'mp4'}`
  const peta = {
    imageMessage: '.jpg', videoMessage: '.mp4', audioMessage: '.mp3',
    stickerMessage: '.webp', documentMessage: '',
  }
  return peta[String(tipe || '')] || ''
}

/**
 * Simpan satu berkas.
 * @returns {{ id: string, nama: string, url: string, urlUnduh: string, ukuran: number, mime: string, daftarUrl: string }}
 */
export function simpanBerkas({ buffer, nama = '', mime = '', jid = '', tipe = '' } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Berkas kosong — tidak ada yang bisa disimpan.')
  const batas = batasUkuranUpload()
  if (buffer.length > batas) {
    throw new Error(`Berkas terlalu besar (${(buffer.length / 1024 / 1024).toFixed(1)} MB, maksimal ${Math.round(batas / 1024 / 1024)} MB).`)
  }

  const id = idAkun(jid) || idAcak()
  const folder = path.join(AKAR, id)
  fs.mkdirSync(folder, { recursive: true, mode: 0o755 })

  const extBawaan = ekstensiDari(mime, tipe)
  let namaAman = namaBerkasAman(nama, '')
  if (!namaAman) {
    const stempel = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    namaAman = `berkas-${stempel}${extBawaan || '.bin'}`
  } else if (!path.extname(namaAman) && extBawaan) {
    namaAman += extBawaan
  }

  const unik = namaUnik(folder, namaAman)
  const tujuan = path.join(folder, unik)
  fs.writeFileSync(tujuan, buffer, { mode: 0o644 })

  /* Catatan kecil per berkas (untuk masa simpan & daftar). */
  try {
    fs.appendFileSync(path.join(folder, '.index.jsonl'), JSON.stringify({
      nama: unik, ukuran: buffer.length, mime: mime || '', waktu: Date.now(),
    }) + '\n')
  } catch (error) { /* abaikan */ }

  const host = hostUpload()
  const url = `https://${host}/${id}/${encodeURIComponent(unik)}`
  return {
    id,
    nama: unik,
    ukuran: buffer.length,
    mime: mime || 'application/octet-stream',
    url,
    urlUnduh: `${url}?dl=1`,
    daftarUrl: `https://${host}/${id}/`,
  }
}

export function daftarFolder(id) {
  const bersih = String(id || '').replace(/[^a-z0-9]/gi, '')
  if (!bersih) return []
  const folder = path.join(AKAR, bersih)
  let isi = []
  try {
    isi = fs.readdirSync(folder, { withFileTypes: true })
  } catch (error) {
    return []
  }
  return isi
    .filter((x) => x.isFile() && !x.name.startsWith('.'))
    .map((x) => {
      const penuh = path.join(folder, x.name)
      let info = { size: 0, mtimeMs: 0 }
      try { info = fs.statSync(penuh) } catch (error) { /* abaikan */ }
      return { nama: x.name, ukuran: info.size, waktu: info.mtimeMs }
    })
    .sort((a, b) => b.waktu - a.waktu)
}

/** Hapus berkas yang lebih tua dari `simpanHari` (dipanggil saat menyimpan). */
export function bersihkanLama() {
  const hari = Number(bacaKonfigUpload().simpanHari)
  if (!Number.isFinite(hari) || hari <= 0) return 0
  const batas = Date.now() - hari * 24 * 60 * 60 * 1000
  let dihapus = 0
  let folder = []
  try { folder = fs.readdirSync(AKAR, { withFileTypes: true }) } catch (error) { return 0 }
  for (const entri of folder) {
    if (!entri.isDirectory()) continue
    const dir = path.join(AKAR, entri.name)
    let isi = []
    try { isi = fs.readdirSync(dir, { withFileTypes: true }) } catch (error) { continue }
    for (const berkas of isi) {
      if (!berkas.isFile() || berkas.name === '.index.jsonl') continue
      const penuh = path.join(dir, berkas.name)
      try {
        const info = fs.statSync(penuh)
        if (info.mtimeMs < batas) { fs.unlinkSync(penuh); dihapus++ }
      } catch (error) { /* abaikan */ }
    }
    try {
      if (!fs.readdirSync(dir, { withFileTypes: true }).some((x) => x.isFile() && x.name !== '.index.jsonl')) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    } catch (error) { /* abaikan */ }
  }
  return dihapus
}

/* ── penyajian HTTP ────────────────────────────────────────────────────── */

export function hostDikenali(host) {
  const bersih = String(host || '').split(':')[0].toLowerCase().replace(/\.$/, '')
  return bersih === hostUpload()
}

function ukuranTeks(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

const escapeHtml = (teks) => String(teks || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))

function halaman(judul, isi) {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(judul)}</title>
<style>
 :root{color-scheme:dark}
 *{box-sizing:border-box}
 body{margin:0;min-height:100vh;background:radial-gradient(circle at 15% 5%,#1e293b,#0b1020 60%);
      color:#e6edf7;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:28px}
 .wrap{max-width:760px;margin:0 auto}
 h1{font-size:22px;margin:0 0 6px}
 .sub{color:#8fa3bf;font-size:13px;margin-bottom:22px}
 .kartu{background:rgba(15,23,42,.85);border:1px solid rgba(148,163,184,.22);border-radius:16px;padding:20px;margin-bottom:14px}
 .baris{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed rgba(148,163,184,.15);font-size:14px}
 .baris:last-child{border-bottom:none}
 a{color:#7cc4ff;text-decoration:none;word-break:break-all}
 a:hover{text-decoration:underline}
 code{background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.35);padding:1px 6px;border-radius:6px;font-size:12.5px}
 .kecil{color:#8fa3bf;font-size:12px}
</style></head><body><main class="wrap">${isi}<p class="kecil" style="margin-top:22px">Umi Usanagi AI — upload publik</p></main></body></html>`
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

function tipeBerkas(nama) {
  const ext = path.extname(String(nama || '')).toLowerCase()
  const peta = {
    '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.3gp': 'video/3gpp',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
    '.pdf': 'application/pdf', '.apk': 'application/vnd.android.package-archive',
    '.zip': 'application/zip', '.7z': 'application/x-7z-compressed', '.rar': 'application/vnd.rar',
    '.tar': 'application/x-tar', '.gz': 'application/gzip',
  }
  return peta[ext] || 'application/octet-stream'
}

function bolehInline(tipe) {
  const daftar = bacaKonfigUpload().inline || BAWAAN.inline
  return daftar.some((x) => String(tipe).startsWith(x))
}

/**
 * Layani permintaan untuk host upload.
 * @returns {boolean} true bila permintaan sudah ditangani.
 */
export function layaniUpload(req, res) {
  if (!hostDikenali(req.headers ? req.headers.host : '')) return false
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    kirim(res, 405, 'text/plain; charset=utf-8', 'Metode tidak didukung.', { Allow: 'GET, HEAD' })
    return true
  }

  let jalur = '/'
  try {
    jalur = decodeURIComponent(String(req.url || '/').split('?')[0].split('#')[0])
  } catch (error) { jalur = '/' }
  const url = (() => { try { return new URL(req.url || '/', 'http://lokal') } catch { return null } })()
  const paksaUnduh = url ? ['1', 'true', 'ya'].includes(String(url.searchParams.get('dl') || '').toLowerCase()) : false
  const tanpaDaftar = url ? ['1', 'true'].includes(String(url.searchParams.get('raw') || '').toLowerCase()) : false

  const bagian = jalur.split('/').filter(Boolean)
  const host = hostUpload()

  /* Halaman depan. */
  if (!bagian.length) {
    kirim(res, 200, 'text/html; charset=utf-8', halaman('Upload publik', [
      '<h1>📤 Upload publik</h1>',
      '<div class="sub">Berkas yang kamu kirim ke bot bisa langsung jadi tautan unduhan.</div>',
      '<div class="kartu">',
      '<div class="baris"><span>Cara pakai</span><a>kirim/reply berkas → <code>.tourl</code></a></div>',
      `<div class="baris"><span>Bentuk tautan</span><span>https://${escapeHtml(host)}/&lt;id akun&gt;/&lt;nama berkas&gt;</span></div>`,
      '<div class="baris"><span>Dukungan</span><span>foto · video · audio · dokumen · zip · 7z · apk</span></div>',
      `<div class="baris"><span>Batas ukuran</span><span>${Math.round(batasUkuranUpload() / 1024 / 1024)} MB</span></div>`,
      `<div class="baris"><span>Masa simpan</span><span>${bacaKonfigUpload().simpanHari} hari</span></div>`,
      '</div>',
      '<div class="kartu kecil">Tambahkan <code>?dl=1</code> pada tautan untuk memaksa unduh langsung.</div>',
    ].join('')), { 'Cache-Control': 'no-store' })
    return true
  }

  const id = String(bagian[0] || '').replace(/[^a-z0-9]/gi, '')
  if (!id) {
    kirim(res, 404, 'text/html; charset=utf-8', halaman('404', '<h1>404 — Tidak ditemukan</h1><div class="sub">Alamat tidak dikenali.</div>'))
    return true
  }

  /* Daftar isi folder akun. */
  if (bagian.length === 1) {
    const daftar = daftarFolder(id)
    if (!daftar.length) {
      kirim(res, 404, 'text/html; charset=utf-8', halaman('Folder kosong', [
        '<h1>📂 Belum ada berkas</h1>',
        `<div class="sub">Folder <code>${escapeHtml(id)}</code> kosong atau sudah kedaluwarsa.</div>`,
        `<div class="kartu kecil">Kirim berkas ke bot dengan keterangan <code>.tourl</code> untuk membuat tautan baru.</div>`,
      ].join('')), { 'Cache-Control': 'no-store' })
      return true
    }
    const total = daftar.reduce((s, x) => s + Number(x.ukuran || 0), 0)
    const baris = daftar.map((x) => {
      const tautan = `/${encodeURIComponent(id)}/${encodeURIComponent(x.nama)}`
      const tanggal = new Date(x.waktu).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'medium', timeStyle: 'short' })
      return `<div class="baris"><a href="${tautan}">${escapeHtml(x.nama)}</a><span class="kecil">${ukuranTeks(x.ukuran)} · ${escapeHtml(tanggal)}</span></div>`
    }).join('')
    kirim(res, 200, 'text/html; charset=utf-8', halaman(`Berkas ${id}`, [
      `<h1>📂 ${daftar.length} berkas</h1>`,
      `<div class="sub">Folder <code>${escapeHtml(id)}</code> · total ${ukuranTeks(total)}</div>`,
      `<div class="kartu">${baris}</div>`,
    ].join('')), { 'Cache-Control': 'no-store' })
    return true
  }

  /* Berkas tunggal. */
  const namaDiminta = bagian.slice(1).join('/')
  const namaAman = namaBerkasAman(namaDiminta, '')
  if (!namaAman) {
    kirim(res, 400, 'text/html; charset=utf-8', halaman('400', '<h1>400 — Nama berkas tidak valid</h1>'))
    return true
  }
  const folder = path.join(AKAR, id)
  const penuh = path.resolve(folder, namaAman)
  if (!penuh.startsWith(folder + path.sep)) {
    kirim(res, 400, 'text/html; charset=utf-8', halaman('400', '<h1>400 — Jalur tidak valid</h1>'))
    return true
  }

  let info = null
  try { info = fs.statSync(penuh) } catch (error) { info = null }
  if (!info || !info.isFile()) {
    /* Coba cocokkan tanpa peduli huruf besar/kecil (Windows/HP sering mengubah). */
    let cocok = ''
    try {
      cocok = (fs.readdirSync(folder)).find((x) => x.toLowerCase() === namaAman.toLowerCase()) || ''
    } catch (error) { cocok = '' }
    if (!cocok) {
      kirim(res, 404, 'text/html; charset=utf-8', halaman('404', [
        '<h1>🔍 Berkas tidak ditemukan</h1>',
        `<div class="sub">Tautan salah, atau berkas sudah dihapus karena melewati masa simpan ${escapeHtml(bacaKonfigUpload().simpanHari)} hari.</div>`,
        `<div class="kartu kecil"><a href="/${encodeURIComponent(id)}/">Lihat semua berkas di folder ini</a></div>`,
      ].join('')), { 'Cache-Control': 'no-store' })
      return true
    }
    return layaniUploadBerkas(req, res, path.join(folder, cocok), cocok, paksaUnduh)
  }
  return layaniUploadBerkas(req, res, penuh, namaAman, paksaUnduh)
}

function layaniUploadBerkas(req, res, penuh, nama, paksaUnduh) {
  let isi
  try {
    isi = fs.readFileSync(penuh)
  } catch (error) {
    kirim(res, 500, 'text/plain; charset=utf-8', 'Gagal membaca berkas.')
    return true
  }
  const tipe = tipeBerkas(nama)
  const inline = !paksaUnduh && bolehInline(tipe)
  res.writeHead(200, {
    'Content-Type': tipe,
    'Content-Length': isi.length,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${nama.replace(/"/g, '')}"`,
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'none',
  })
  res.end(req.method === 'HEAD' ? undefined : isi)
  return true
}

export default {
  simpanBerkas, daftarFolder, hostUpload, layaniUpload,
  idAkun, namaBerkasAman, bersihkanLama, bacaKonfigUpload, batasUkuranUpload,
}
