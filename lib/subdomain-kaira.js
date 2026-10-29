/* By AlzRiss - Usanagi Umi AI
 *
 * Task136 — deploy situs ke subdomain dari WhatsApp.
 *
 * Alamat yang didukung:
 *   https://<nama>-alzriss.gwenna.my.id   ← dipakai (tercakup SSL Universal)
 *   https://<nama>.alzriss.gwenna.my.id   ← didaftarkan juga, hidup begitu
 *                                           sertifikat Total TLS/ACM aktif
 *
 * Cara kerja (Task152 — hosting pindah ke server bot):
 *   berkas situs disimpan di `situs/<nama>/` pada server bot sendiri,
 *   daftar pemilik disimpan di `data/subdomain-registry.json`, lalu CNAME
 *   `<nama>-alzriss.gwenna.my.id` diarahkan ke tunnel bot (lihat
 *   `lib/situs-lokal.js` + `data/subdomain-kaira.json` → `tunnelId`).
 *   Panel Kaira tidak dipakai lagi.
 *
 * Konfigurasi `data/subdomain-kaira.json`:
 *   { panelUrl, apiKey, serverId, domain, cfToken, cfZone, tunnelId }
 * Berkas ini mode 600 dan tidak masuk repo.
 */

import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import { bacaArsip, amanJalur } from './arsip.js'

const BERKAS = path.join(process.cwd(), 'data', 'subdomain-kaira.json')
/* Task151 — salinan registry di server bot. Panel situs bisa mati/limit, jadi
 * data kepemilikan subdomain tetap tersimpan lokal dan digabung saat dibaca. */
const BERKAS_REGISTRY_LOKAL = path.join(process.cwd(), 'data', 'subdomain-registry.json')
const DIR_SITUS = '/situs'
const DOMAIN_DASAR = 'alzriss.gwenna.my.id'

let cache = null

export function bacaKonfig(kuatUlang = false) {
  if (cache && !kuatUlang) return cache
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS, 'utf8'))
    cache = {
      panelUrl: String(isi.panelUrl || '').replace(/\/+$/, ''),
      apiKey: String(isi.apiKey || ''),
      serverId: String(isi.serverId || ''),
      domain: String(isi.domain || DOMAIN_DASAR),
      cfToken: String(isi.cfToken || ''),
      cfZone: String(isi.cfZone || ''),
      tunnelId: String(isi.tunnelId || ''),
      maksBerkas: Number(isi.maksBerkas || 300),
      maksUkuran: Number(isi.maksUkuran || 25 * 1024 * 1024),
      maksPerUser: Number(isi.maksPerUser || 3),
    }
  } catch (error) {
    cache = null
  }
  return cache
}

export function subSiap() {
  /* Task152 — hosting lokal: tidak butuh panel eksternal lagi. */
  const cfg = bacaKonfig()
  if (cfg && cfg.enabled === false) return false
  return true
}

/* ── penyimpanan berkas situs (lokal, server bot) ─────────────────────── */

const AKAR_SITUS = path.join(process.cwd(), 'situs')

/** Ubah jalur logis (`/situs/<nama>/index.html`) menjadi jalur aman di disk. */
export function jalurSitus(logis) {
  const bersih = String(logis || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^situs\/?/, '')
  const aman = amanJalur(bersih)
  if (!aman) return AKAR_SITUS
  const penuh = path.resolve(AKAR_SITUS, aman)
  if (penuh !== AKAR_SITUS && !penuh.startsWith(AKAR_SITUS + path.sep)) return ''
  return penuh
}

async function tulisJalur(jalur, isi) {
  const tujuan = jalurSitus(jalur)
  if (!tujuan) throw new Error('Jalur berkas tidak aman.')
  const buffer = Buffer.isBuffer(isi) ? isi : Buffer.from(String(isi))
  await fs.promises.mkdir(path.dirname(tujuan), { recursive: true })
  await fs.promises.writeFile(tujuan, buffer, { mode: 0o644 })
  return buffer.length
}

async function bacaJalur(jalur) {
  const tujuan = jalurSitus(jalur)
  if (!tujuan) throw new Error('Jalur berkas tidak aman.')
  return fs.promises.readFile(tujuan, 'utf8')
}

async function hapusJalur(daftar) {
  const isi = Array.isArray(daftar) ? daftar : [daftar]
  for (const item of isi) {
    const tujuan = jalurSitus(item)
    if (!tujuan || tujuan === AKAR_SITUS) continue
    await fs.promises.rm(tujuan, { recursive: true, force: true })
  }
}

async function buatFolder(induk, nama) {
  const tujuan = jalurSitus(`${induk}/${nama}`)
  if (!tujuan) throw new Error('Nama folder tidak aman.')
  await fs.promises.mkdir(tujuan, { recursive: true })
}

/* ── registry ──────────────────────────────────────────────────────────── */

export function bacaRegistryLokal() {
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS_REGISTRY_LOKAL, 'utf8'))
    return isi && typeof isi === 'object' ? isi : {}
  } catch (error) {
    return {}
  }
}

export function simpanRegistryLokal(data) {
  try {
    fs.mkdirSync(path.dirname(BERKAS_REGISTRY_LOKAL), { recursive: true })
    fs.writeFileSync(BERKAS_REGISTRY_LOKAL, JSON.stringify(data, null, 2), { mode: 0o600 })
    return true
  } catch (error) {
    console.log(`[subdomain] gagal menulis registry lokal: ${error.message}`)
    return false
  }
}

export async function bacaRegistry() {
  return bacaRegistryLokal()
}

export async function simpanRegistry(data) {
  simpanRegistryLokal(data)
  return data
}

export async function daftarSubdomain() {
  const registry = await bacaRegistry()
  return Object.entries(registry)
    .map(([nama, info]) => ({ nama, ...info }))
    .sort((a, b) => String(a.nama).localeCompare(String(b.nama)))
}

export async function infoSubdomain(nama) {
  const registry = await bacaRegistry()
  return registry[nama] || null
}

/* ── DNS Cloudflare ────────────────────────────────────────────────────── */

function cf(path, method = 'GET', body = null) {
  const cfg = bacaKonfig()
  if (!cfg?.cfToken) return Promise.reject(new Error('Token Cloudflare belum diatur di data/subdomain-kaira.json'))
  return new Promise((selesai, gagal) => {
    const data = body === null ? null : Buffer.from(JSON.stringify(body))
    const req = https.request({
      hostname: 'api.cloudflare.com',
      path: '/client/v4' + path,
      method,
      headers: {
        Authorization: `Bearer ${cfg.cfToken}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': data.length } : {}),
      },
      timeout: 25000,
    }, (res) => {
      const potongan = []
      res.on('data', (c) => potongan.push(c))
      res.on('end', () => {
        let isi = {}
        try { isi = JSON.parse(Buffer.concat(potongan).toString('utf8')) } catch { }
        if (res.statusCode >= 200 && res.statusCode < 300 && isi.success !== false) return selesai(isi)
        const pesan = isi?.errors?.[0]?.message || `HTTP ${res.statusCode}`
        gagal(new Error(`Cloudflare: ${pesan}`))
      })
    })
    req.on('timeout', () => req.destroy(new Error('Cloudflare tidak merespons.')))
    req.on('error', gagal)
    if (data) req.write(data)
    req.end()
  })
}

function domainDasar() {
  const cfg = bacaKonfig()
  const nilai = String(cfg && cfg.domain ? cfg.domain : DOMAIN_DASAR)
  return nilai.replace(/^\.+|\.+$/g, '') || DOMAIN_DASAR
}

export function hostUtama(nama) {
  return `${nama}-${domainDasar()}`
}

export function hostTitik(nama) {
  return `${nama}.${domainDasar()}`
}

/** Pastikan CNAME untuk satu hostname mengarah ke tunnel. */
async function pastikanDns(hostname) {
  const cfg = bacaKonfig()
  if (!cfg?.cfToken || !cfg?.cfZone || !cfg?.tunnelId) return { dilewati: true }
  const target = `${cfg.tunnelId}.cfargotunnel.com`
  const cari = await cf(`/zones/${cfg.cfZone}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`)
  const ada = (cari.result || []).find((x) => x.name === hostname)
  if (ada) {
    if (ada.content === target && ada.proxied) return { sudahAda: true, id: ada.id }
    await cf(`/zones/${cfg.cfZone}/dns_records/${ada.id}`, 'PATCH', { content: target, proxied: true })
    return { diperbarui: true, id: ada.id }
  }
  const dibuat = await cf(`/zones/${cfg.cfZone}/dns_records`, 'POST', {
    type: 'CNAME', name: hostname, content: target, proxied: true, ttl: 1,
    comment: 'Task136 deploy subdomain',
  })
  return { dibuat: true, id: dibuat.result?.id }
}

async function hapusDnsRecord(hostname) {
  const cfg = bacaKonfig()
  if (!cfg?.cfToken || !cfg?.cfZone) return { dilewati: true }
  const cari = await cf(`/zones/${cfg.cfZone}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`)
  const ada = (cari.result || []).find((x) => x.name === hostname)
  if (!ada) return { tidakAda: true }
  await cf(`/zones/${cfg.cfZone}/dns_records/${ada.id}`, 'DELETE')
  return { dihapus: true }
}

/* ── validasi nama ─────────────────────────────────────────────────────── */

export function namaSubAman(nama) {
  const bersih = String(nama || '').toLowerCase().trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
  if (!bersih || bersih.length < 3) return ''
  if (/^\d+$/.test(bersih)) return ''
  const terlarang = ['www', 'api', 'admin', 'mail', 'ftp', 'jadibot', 'tunel', 'alzriss', 'game', 'upload']
  if (terlarang.includes(bersih)) return ''
  return bersih
}

/**
 * Ubah isi unggahan user menjadi daftar berkas situs.
 * Menerima: HTML mentah (teks), satu berkas .html, atau arsip zip/tar.gz.
 */
export function siapkanBerkas(buffer, namaBerkas = '', teks = '') {
  const cfg = bacaKonfig() || {}
  const maksUkuran = cfg.maksUkuran || 25 * 1024 * 1024
  if (buffer && buffer.length > maksUkuran) {
    throw new Error(`Berkas terlalu besar (${(buffer.length / 1024 / 1024).toFixed(1)} MB, maksimal ${Math.round(maksUkuran / 1024 / 1024)} MB).`)
  }
  const rendah = String(namaBerkas || '').toLowerCase()

  if (!buffer && teks && teks.trim()) {
    const isi = teks.trim()
    if (!/<[a-z!/]/i.test(isi)) throw new Error('Teks yang dikirim bukan kode HTML.')
    return [{ jalur: 'index.html', data: Buffer.from(isi, 'utf8') }]
  }
  if (!buffer || !buffer.length) throw new Error('Tidak ada berkas yang dikirim.')

  if (/\.(html?|css|js|json|txt|svg)$/.test(rendah)) {
    const nama = amanJalur(namaBerkas) || 'index.html'
    return [{ jalur: /index\.html?$/i.test(nama) ? 'index.html' : nama, data: buffer }]
  }

  /* Task136 — sebagian client mengirim berkas tanpa nama (filename kosong).
   * Kalau isinya jelas HTML, perlakukan sebagai index.html, jangan ditolak. */
  const awal = buffer.slice(0, 512).toString('utf8').replace(/^\uFEFF/, '').trim().toLowerCase()
  if (/^(<!doctype html|<html|<head|<body|<!--|<style|<script)/.test(awal)) {
    return [{ jalur: 'index.html', data: buffer }]
  }

  const arsip = bacaArsip(buffer, namaBerkas)
  const berkas = arsip.berkas
    .map((item) => ({ jalur: amanJalur(item.jalur), data: item.data }))
    .filter((item) => item.jalur)
  if (!berkas.length) throw new Error('Arsip kosong.')
  if (berkas.length > (cfg.maksBerkas || 300)) throw new Error(`Terlalu banyak berkas (${berkas.length}). Maksimal ${cfg.maksBerkas || 300}.`)

  /* Kalau semua berkas ada di dalam satu folder induk, folder itu dibuang
   * supaya index.html berada di akar situs. */
  const punyaIndexAkar = berkas.some((b) => b.jalur === 'index.html' || b.jalur === 'index.htm')
  if (!punyaIndexAkar) {
    const pertama = berkas[0].jalur.split('/')[0]
    const semuaSatuFolder = berkas.every((b) => b.jalur.includes('/') && b.jalur.split('/')[0] === pertama)
    if (semuaSatuFolder) {
      for (const b of berkas) b.jalur = b.jalur.slice(pertama.length + 1)
    }
  }
  if (!berkas.some((b) => /^index\.html?$/i.test(b.jalur))) {
    throw new Error('Arsip tidak punya index.html di akar. Tambahkan index.html lalu deploy ulang.')
  }
  return berkas
}

/* ── deploy / hapus / status ───────────────────────────────────────────── */

export async function deploySubdomain({ nama, berkas, pemilik, judul = '', mode = 'baru' }) {
  const sub = namaSubAman(nama)
  if (!sub) throw new Error('Nama subdomain tidak valid (3–30 huruf/angka, tidak boleh angka saja).')

  const folder = `${DIR_SITUS}/${sub}`
  await buatFolder(DIR_SITUS, sub)

  /* Bersihkan isi lama supaya berkas nyasar tidak tertinggal. */
  if (mode !== 'baru') {
    try { await hapusJalur([folder]) } catch { }
    await buatFolder(DIR_SITUS, sub)
  }

  let total = 0
  for (const item of berkas) {
    const jalur = amanJalur(item.jalur)
    if (!jalur) continue
    const bagian = jalur.split('/')
    if (bagian.length > 1) {
      let induk = folder
      for (const potong of bagian.slice(0, -1)) {
        await buatFolder(induk, potong)
        induk = `${induk}/${potong}`
      }
    }
    total += await tulisJalur(`${folder}/${jalur}`, item.data)
  }

  const dns = []
  for (const host of [hostUtama(sub), hostTitik(sub)]) {
    try { dns.push({ host, ...(await pastikanDns(host)) }) } catch (error) { dns.push({ host, galat: error.message }) }
  }

  const registry = await bacaRegistry()
  const lama = registry[sub] || {}
  const waktu = Date.now()
  registry[sub] = {
    pemilik: pemilik || lama.pemilik || '',
    judul: judul || lama.judul || sub,
    dibuat: lama.dibuat || waktu,
    diperbarui: waktu,
    berkas: berkas.length,
    ukuran: total,
    status: 'aktif',
    deployKe: Number(lama.deployKe || 0) + 1,
  }
  await simpanRegistry(registry)

  return { nama: sub, url: `https://${hostUtama(sub)}/`, urlTitik: `https://${hostTitik(sub)}/`, berkas: berkas.length, ukuran: total, dns, info: registry[sub] }
}

/**
 * Hapus isi situs + entri registry.
 *
 * Task152: record DNS sengaja DIPERTAHANKAN (opsi `hapusDns`) supaya alamat
 * yang pernah dipakai menampilkan halaman 404 resmi dari bot, bukan error
 * Cloudflare 1033/530. Nama itu tetap bisa diklaim ulang kapan saja.
 */
export async function hapusSubdomain(nama, { hapusDns = false } = {}) {
  const sub = namaSubAman(nama)
  if (!sub) throw new Error('Nama subdomain tidak valid.')
  const registry = await bacaRegistry()
  if (!registry[sub]) throw new Error(`Subdomain "${sub}" tidak terdaftar.`)
  try { await hapusJalur([`${DIR_SITUS}/${sub}`]) } catch (error) { }
  const dns = []
  if (hapusDns) {
    for (const host of [hostUtama(sub), hostTitik(sub)]) {
      try { dns.push({ host, ...(await hapusDnsRecord(host)) }) } catch (error) { dns.push({ host, galat: error.message }) }
    }
  } else {
    dns.push({ dipertahankan: true, catatan: 'DNS dibiarkan agar muncul halaman 404 resmi' })
  }
  delete registry[sub]
  await simpanRegistry(registry)
  return { nama: sub, dns, dnsDipertahankan: !hapusDns }
}

export async function aturStatusSubdomain(nama, status) {
  const sub = namaSubAman(nama)
  const registry = await bacaRegistry()
  if (!registry[sub]) throw new Error(`Subdomain "${sub}" tidak terdaftar.`)
  const nilai = status === 'aktif' ? 'aktif' : 'nonaktif'
  registry[sub].status = nilai
  registry[sub].diperbarui = Date.now()
  await simpanRegistry(registry)
  return { nama: sub, status: nilai }
}

export function daftarBerkasSitus(nama) {
  return `${DIR_SITUS}/${namaSubAman(nama)}`
}

/* ── Task151: subdomain milik user ─────────────────────────────────────── */

/** Batas jumlah subdomain per nomor (bisa diatur di data/subdomain-kaira.json). */
export function batasPerUser() {
  const cfg = bacaKonfig() || {}
  const nilai = Number(cfg.maksPerUser || 0)
  return nilai > 0 ? nilai : 3
}

/** Daftar nama subdomain yang pemiliknya nomor tersebut. */
export function subdomainMilik(registry, jid) {
  const nomor = String(jid || '').split('@')[0]
  const data = registry && typeof registry === 'object' ? registry : {}
  return Object.keys(data).filter((nama) => {
    const info = data[nama]
    return String((info && info.pemilik) || '').split('@')[0] === nomor
  })
}

/** Halaman sementara saat subdomain baru diklaim (belum ada berkas user). */
export function halamanAwal({ nama = '', pemilik = '', judul = '' } = {}) {
  const nomor = String(pemilik || '').split('@')[0]
  const samar = nomor.length > 6 ? `${nomor.slice(0, 4)}****${nomor.slice(-2)}` : nomor
  const tanggal = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar' })
  const aman = (teks) => String(teks || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${aman(judul || nama)}</title>
<style>
  :root { color-scheme: dark }
  * { box-sizing: border-box }
  body { margin:0; min-height:100vh; display:grid; place-items:center; font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
         background:radial-gradient(circle at 20% 10%,#1e293b,#0b1020 60%); color:#e6edf7; padding:24px }
  .kartu { width:min(560px,100%); background:rgba(15,23,42,.82); border:1px solid rgba(148,163,184,.25);
           border-radius:20px; padding:28px 26px; box-shadow:0 24px 60px rgba(0,0,0,.45) }
  h1 { margin:0 0 6px; font-size:22px; letter-spacing:.3px }
  .sub { color:#8fa3bf; font-size:13px; margin-bottom:20px }
  .label { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#7c8db5 }
  .nilai { font-size:14px; margin:2px 0 14px; word-break:break-all }
  code { background:rgba(99,102,241,.15); border:1px solid rgba(99,102,241,.35); padding:1px 6px; border-radius:6px; font-size:12.5px }
  .kaki { margin-top:18px; padding-top:14px; border-top:1px dashed rgba(148,163,184,.25); font-size:12px; color:#8fa3bf }
</style>
</head>
<body>
  <main class="kartu">
    <h1>${aman(judul || nama)}</h1>
    <div class="sub">Subdomain ini sudah kamu daftarkan dan siap dipakai.</div>
    <div class="label">Alamat</div>
    <div class="nilai">${aman(nama)}</div>
    <div class="label">Pemilik</div>
    <div class="nilai">+${aman(samar)}</div>
    <div class="label">Didaftarkan</div>
    <div class="nilai">${aman(tanggal)} WITA</div>
    <div class="kaki">
      Ganti halaman ini dengan situsmu: kirim <code>.deploysubdomain ${aman(nama)} ganti</code> lalu balas berkas HTML/zip.<br>
      Atur subdomain: <code>.kontrolsubdomain ${aman(nama)}</code><br>
      Umi Usanagi AI — subdomain gratis untuk pengguna bot.
    </div>
  </main>
</body>
</html>
`
}

/**
 * Klaim subdomain baru untuk satu nomor.
 * Membuat folder + halaman sementara, CNAME Cloudflare, lalu mencatat pemilik.
 * Kalau panel situs sedang mati, pendaftaran tetap tercatat (DNS + registry
 * lokal) dan `panelGalat` berisi alasannya.
 */
export async function klaimSubdomain({ nama, pemilik = '', judul = '' }) {
  const sub = namaSubAman(nama)
  if (!sub) throw new Error('Nama subdomain tidak valid (3–30 huruf/angka/tanda hubung, tidak boleh angka saja).')

  const registry = await bacaRegistry()
  if (registry[sub]) {
    const pemilikLama = String((registry[sub] && registry[sub].pemilik) || '').split('@')[0]
    const saya = String(pemilik || '').split('@')[0]
    if (pemilikLama === saya) throw new Error(`Kamu sudah mendaftarkan "${sub}". Kontrol: .kontrolsubdomain ${sub}`)
    throw new Error(`Subdomain "${sub}" sudah dipakai orang lain. Coba nama lain.`)
  }

  const milik = subdomainMilik(registry, pemilik)
  const batas = batasPerUser()
  if (milik.length >= batas) {
    throw new Error(`Kamu sudah punya ${milik.length} subdomain (batas ${batas} per nomor). Hapus dulu salah satunya lewat developer, baru tambah lagi.`)
  }

  const html = halamanAwal({ nama: sub, pemilik, judul })
  let panelGalat = ''
  let total = 0
  try {
    await buatFolder(DIR_SITUS, sub)
    total = await tulisJalur(`${DIR_SITUS}/${sub}/index.html`, Buffer.from(html, 'utf8'))
  } catch (error) {
    panelGalat = error.message
  }

  const dns = []
  for (const host of [hostUtama(sub), hostTitik(sub)]) {
    try { dns.push({ host, ...(await pastikanDns(host)) }) } catch (error) { dns.push({ host, galat: error.message }) }
  }

  const waktu = Date.now()
  registry[sub] = {
    pemilik: String(pemilik || ''),
    judul: String(judul || sub).slice(0, 60),
    dibuat: waktu,
    diperbarui: waktu,
    berkas: panelGalat ? 0 : 1,
    ukuran: total,
    status: 'aktif',
    deployKe: 0,
    klaim: true,
  }
  await simpanRegistry(registry)

  return {
    nama: sub,
    url: `https://${hostUtama(sub)}/`,
    urlTitik: `https://${hostTitik(sub)}/`,
    dns,
    panelGalat,
    info: registry[sub],
  }
}
