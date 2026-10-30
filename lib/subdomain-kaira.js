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
      maksPerUser: Number.isFinite(Number(isi.maksPerUser)) ? Number(isi.maksPerUser) : 0,
      cfAccount: String(isi.cfAccount || ''),
      cfGlobalKey: String(isi.cfGlobalKey || ''),
      cfEmail: String(isi.cfEmail || ''),
      autoZona: isi.autoZona !== false,
      cnameKustom: String(isi.cnameKustom || 'situs.gwenna.my.id'),
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

/* ── Task163: kontrol domain (private / public) ─────────────────────────
 *
 * Pemilik domain akar bisa menentukan siapa yang boleh membuat subdomain di
 * domainnya:
 *   private → hanya nomor pemilik domain (bawaan)
 *   public  → siapa pun boleh membuat `<nama>.<domain>`
 *
 * Datanya kecil dan terpisah dari registry situs supaya tidak tercampur:
 *   data/domain-kontrol.json → { "kieran.web.id": { pemilik, akses, ... } }
 */
const BERKAS_KONTROL_DOMAIN = path.join(process.cwd(), 'data', 'domain-kontrol.json')

/* Sama dengan domainAkar() di domain-sendiri.js; disalin agar tidak ada
 * impor melingkar (domain-sendiri.js sudah mengimpor file ini). */
const AKHIRAN_DUA_KONTROL = [
  'co.id', 'my.id', 'web.id', 'biz.id', 'or.id', 'ac.id', 'sch.id', 'go.id', 'mil.id',
  'net.id', 'desa.id', 'ponpes.id', 'id', 'co.uk', 'org.uk', 'ac.uk', 'me.uk', 'com.au',
  'net.au', 'org.au', 'co.nz', 'com.br', 'co.in', 'com.my', 'com.sg', 'co.za', 'com.tr',
  'com.mx', 'com.ph', 'co.th', 'com.vn', 'com.hk', 'com.tw', 'co.kr', 'com.cn',
]

export function akarDomainHost(host) {
  const bersih = String(host || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '').trim()
  const bagian = bersih.split('.').filter(Boolean)
  if (bagian.length <= 2) return bersih
  const duaTerakhir = bagian.slice(-2).join('.')
  if (AKHIRAN_DUA_KONTROL.includes(duaTerakhir)) return bagian.slice(-3).join('.')
  return duaTerakhir
}

export function bacaKontrolDomain() {
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS_KONTROL_DOMAIN, 'utf8'))
    return isi && typeof isi === 'object' && !Array.isArray(isi) ? isi : {}
  } catch {
    return {}
  }
}

export function simpanKontrolDomain(data) {
  try {
    fs.mkdirSync(path.dirname(BERKAS_KONTROL_DOMAIN), { recursive: true })
    fs.writeFileSync(BERKAS_KONTROL_DOMAIN, JSON.stringify(data, null, 2), { mode: 0o600 })
    return true
  } catch (error) {
    console.log(`[subdomain] gagal menyimpan kontrol domain: ${error?.message || error}`)
    return false
  }
}

/** Pemilik domain akar menurut registry situs (entri paling awal). */
export function pemilikAkar(registry, akar) {
  const target = String(akar || '').toLowerCase()
  if (!target) return ''
  const kandidat = Object.entries(registry || {})
    .filter(([, info]) => {
      const akarInfo = String((info && info.akarDomain) || '').toLowerCase()
      const kustom = String((info && info.domainKustom) || '').toLowerCase()
      return akarInfo === target || kustom === target
    })
    .sort((a, b) => Number((a[1] && a[1].dibuat) || 0) - Number((b[1] && b[1].dibuat) || 0))
  return kandidat.length ? String((kandidat[0][1] && kandidat[0][1].pemilik) || '') : ''
}

/**
 * Status satu domain akar: pemilik, akses, daftar subdomain, jumlah nyala.
 * Entri yang belum tercatat di domain-kontrol.json dianggap milik pemilik
 * registry paling awal dengan akses `private` (aman secara bawaan).
 */
export function statusDomain(akar, registry = null) {
  const target = String(akar || '').toLowerCase()
  const reg = registry || bacaRegistryLokal()
  const kontrol = bacaKontrolDomain()
  const catatan = kontrol[target] || null
  const pemilik = String((catatan && catatan.pemilik) || pemilikAkar(reg, target) || '')
  const daftar = Object.entries(reg)
    .filter(([, info]) => {
      const akarInfo = String((info && info.akarDomain) || '').toLowerCase()
      const kustom = String((info && info.domainKustom) || '').toLowerCase()
      /* Entri lama belum punya akarDomain → diturunkan dari domainKustom. */
      return akarInfo === target || (!akarInfo && kustom && akarDomainHost(kustom) === target)
    })
    .map(([nama, info]) => ({
      nama,
      host: String((info && info.domainKustom) || hostUtama(nama)),
      pemilik: String((info && info.pemilik) || ''),
      aktif: !info || info.status === undefined || info.status === 'aktif',
      berkas: Number((info && info.berkas) || 0),
      dibuat: Number((info && info.dibuat) || 0),
    }))
    .sort((a, b) => a.host.localeCompare(b.host))
  return {
    akar: target,
    pemilik,
    akses: String((catatan && catatan.akses) || 'private').toLowerCase() === 'public' ? 'public' : 'private',
    awalan: bacaAwalanDomain(target, kontrol),
    tercatat: Boolean(catatan),
    daftar,
    jumlah: daftar.length,
    nyala: daftar.filter((x) => x.aktif).length,
    diperbarui: catatan ? Number(catatan.diperbarui || 0) : 0,
  }
}

/** Ubah akses domain. Hanya pemilik domain (atau developer bot) yang boleh. */
export function aturAksesDomain({ akar, akses, oleh = '', paksa = false }) {
  const target = akarDomainHost(akar)
  if (!target || !target.includes('.')) throw new Error('Domain tidak valid.')
  const nilai = String(akses || '').toLowerCase()
  if (!['private', 'public'].includes(nilai)) throw new Error('Akses harus private atau public.')
  const status = statusDomain(target)
  const saya = String(oleh || '').split('@')[0]
  if (status.pemilik && String(status.pemilik).split('@')[0] !== saya && !paksa) {
    throw new Error(`Domain ${target} milik +${String(status.pemilik).split('@')[0]}. Hanya pemiliknya yang bisa mengubah akses.`)
  }
  const kontrol = bacaKontrolDomain()
  const lama = kontrol[target] || {}
  kontrol[target] = {
    pemilik: String(lama.pemilik || status.pemilik || oleh || ''),
    akses: nilai,
    dibuat: Number(lama.dibuat || Date.now()),
    diperbarui: Date.now(),
  }
  simpanKontrolDomain(kontrol)
  return statusDomain(target)
}

/** Catat pemilik domain saat pertama kali dipakai (dipanggil klaim). */
export function catatPemilikDomain({ akar, pemilik = '', akses = 'private' }) {
  const target = akarDomainHost(akar)
  if (!target) return null
  const kontrol = bacaKontrolDomain()
  if (kontrol[target] && String(kontrol[target].pemilik || '').split('@')[0] !== String(pemilik || '').split('@')[0]) {
    return kontrol[target]
  }
  if (kontrol[target]) return kontrol[target]
  kontrol[target] = {
    pemilik: String(pemilik || ''),
    akses: akses === 'public' ? 'public' : 'private',
    dibuat: Date.now(),
    diperbarui: Date.now(),
  }
  simpanKontrolDomain(kontrol)
  return kontrol[target]
}

/* ═══ Task168 — AWALAN MEREK PADA DOMAIN USER ══════════════════════════════
 *
 * Aturan (permintaan owner 29-10-2026):
 *   `.buatsubdomain gua.com`          → https://alzriss.gua.com/
 *   `.buatsubdomain gua.com ganteng`  → https://ganteng-alzriss.gua.com/
 *   awalan dimatikan pemilik domain   → https://ganteng.gua.com/
 *                                       (alias https://ganteng-alzriss.gua.com/ ikut hidup)
 *
 * Awalan disimpan per domain di `data/domain-kontrol.json`:
 *   { "<akar>": { pemilik, akses, awalan: "alzriss" | "", ... } }
 * Tidak adanya kunci `awalan` dianggap "alzriss" (bawaan wajib).
 */

export const AWALAN_BAKU = 'alzriss'

/** Nilai awalan yang berlaku untuk sebuah domain akar (`alzriss` atau `''`). */
export function bacaAwalanDomain(akar, kontrol = null) {
  const target = akarDomainHost(akar)
  if (!target) return AWALAN_BAKU
  const data = kontrol && typeof kontrol === 'object' ? kontrol : bacaKontrolDomain()
  const catatan = data[target]
  if (!catatan || catatan.awalan === undefined || catatan.awalan === null) return AWALAN_BAKU
  const nilai = String(catatan.awalan).toLowerCase().trim()
  const mati = ['', '-', 'tanpa', 'off', '0', 'tidak', 'none', 'no', 'nihil']
  if (mati.includes(nilai)) return ''
  return nilai === 'on' || nilai === 'ya' || nilai === 'wajib' || nilai === 'aktif' ? AWALAN_BAKU : nilai
}

/** Ubah awalan domain. Hanya pemilik domain (atau developer) yang boleh. */
export function aturAwalanDomain({ akar, awalan, oleh = '', paksa = false }) {
  const target = akarDomainHost(akar)
  if (!target || !target.includes('.')) throw new Error('Domain tidak valid.')
  const status = statusDomain(target)
  const saya = String(oleh || '').split('@')[0]
  if (status.pemilik && String(status.pemilik).split('@')[0] !== saya && !paksa) {
    throw new Error(`Domain ${target} milik +${String(status.pemilik).split('@')[0]}. Hanya pemiliknya yang bisa mengubah awalan.`)
  }
  const nilai = String(awalan === undefined || awalan === null ? '' : awalan).toLowerCase().trim()
  const mati = ['', '-', 'tanpa', 'off', '0', 'tidak', 'none', 'no', 'nihil', 'mati']
  const baru = mati.includes(nilai) ? '' : (nilai === 'on' || nilai === 'ya' || nilai === 'wajib' || nilai === 'aktif' ? AWALAN_BAKU : nilai)
  const kontrol = bacaKontrolDomain()
  const lama = kontrol[target] || {}
  kontrol[target] = {
    pemilik: String(lama.pemilik || status.pemilik || oleh || ''),
    akses: String(lama.akses || status.akses || 'private'),
    awalan: baru,
    dibuat: Number(lama.dibuat || Date.now()),
    diperbarui: Date.now(),
  }
  simpanKontrolDomain(kontrol)
  return statusDomain(target)
}

/** Label pertama sebuah host terhadap akarnya (`toko.gua.com` → `toko`). */
export function labelPertamaHost(host, akar) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  const a = akarDomainHost(akar || h)
  if (!h || !a) return ''
  if (h === a) return ''
  if (h.endsWith(`.${a}`)) return h.slice(0, h.length - a.length - 1)
  return h.split('.')[0]
}

function hostSudahTerdaftar(registry, host) {
  const target = String(host || '').toLowerCase()
  return Object.values(registry || {}).some((info) => String((info && info.domainKustom) || '').toLowerCase() === target)
}

/**
 * Hitung alamat situs untuk domain user.
 * @returns {{host: string, label: string, alias: string[], utama: boolean, awalan: string}}
 */
export function rencanaHostDomain({ host, akar = '', label = '', awalan = null, registry = {} }) {
  const target = akarDomainHost(akar || host)
  if (!target) throw new Error('Domain tidak valid.')
  const input = String(host || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  const kontrol = null
  const brand = (awalan === null || awalan === undefined) ? bacaAwalanDomain(target, kontrol) : String(awalan || '')
  const mentah = String(label || '').toLowerCase().trim()
  const kataUtama = ['', 'situs', 'alzriss', 'utama', 'main', 'home', 'www', 'domain']
  const mintaUtama = kataUtama.includes(mentah)

  /* Entri lama yang sudah terdaftar tidak pernah diganti nama. */
  if (input !== target && input !== `www.${target}` && hostSudahTerdaftar(registry, input)) {
    return { host: input, label: labelPertamaHost(input, target), alias: [], utama: false, awalan: brand }
  }

  let dasar = ''
  if (!mintaUtama) dasar = namaSubAman(mentah)
  else if (input !== target && input !== `www.${target}`) dasar = namaSubAman(labelPertamaHost(input, target))
  if (!mintaUtama && !dasar) throw new Error(`Nama "${label}" tidak bisa dipakai. Pakai huruf/angka, minimal 3 huruf.`)

  if (!dasar) {
    const namaUtama = brand || 'situs'
    return { host: `${namaUtama}.${target}`, label: namaUtama, alias: [], utama: true, awalan: brand }
  }
  if (brand) {
    return { host: `${dasar}-${brand}.${target}`, label: `${dasar}-${brand}`, alias: [], utama: false, awalan: brand }
  }
  return { host: `${dasar}.${target}`, label: dasar, alias: [`${dasar}-${AWALAN_BAKU}.${target}`], utama: false, awalan: '' }
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
    /* Task154 — `...lama` WAJIB: domain kustom & status klaim tidak boleh
     * hilang setiap kali situs di-deploy ulang. */
    ...lama,
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
/**
 * Batas jumlah situs per nomor.
 *
 * Task162d (permintaan owner): batas dihapus — `0` berarti TANPA BATAS.
 * Nilai `maksPerUser` di data/subdomain-kaira.json dibaca apa adanya:
 * angka > 0 = batas itu, selain itu tidak dibatasi.
 */
export function batasPerUser() {
  const cfg = bacaKonfig() || {}
  const nilai = Number(cfg.maksPerUser)
  return Number.isFinite(nilai) && nilai > 0 ? Math.floor(nilai) : 0
}

/** Teks kuota untuk pesan bot: `3/10` atau `3/tanpa batas`. */
export function teksKuota(terpakai) {
  const batas = batasPerUser()
  return `${terpakai}/${batas > 0 ? batas : 'tanpa batas'}`
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
  if (!tanpaBatas && batas > 0 && milik.length >= batas) {
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

/* ── Task154: masukan domain milik user ────────────────────────────────── */

/**
 * Baca argumen perintah subdomain.
 *
 * Menerima:
 *   toko                      → nama di domain bot
 *   toko.alzriss.gwenna.my.id → nama di domain bot (jadi `toko`)
 *   toko-alzriss.gwenna.my.id → idem
 *   https://toko…/            → idem (protokol & garis miring dibuang)
 *   kaeira.my.id              → DOMAIN KUSTOM milik user
 *
 * @returns {{ jenis: 'nama'|'kustom'|'salah', nama: string, domain?: string, alasan?: string }}
 */
export function bacaArgumenSitus(masukan) {
  const mentah = String(masukan || '').trim()
  if (!mentah) return { jenis: 'salah', nama: '', alasan: 'Nama atau domain belum ditulis.' }

  const bersih = mentah
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .replace(/^www\./i, '')
    .toLowerCase()

  if (!bersih) return { jenis: 'salah', nama: '', alasan: 'Nama atau domain belum ditulis.' }
  if (/\s/.test(bersih)) return { jenis: 'salah', nama: '', alasan: 'Nama tidak boleh mengandung spasi.' }

  const dasar = domainDasar().toLowerCase()
  for (const akhiran of [`-${dasar}`, `.${dasar}`]) {
    if (bersih.endsWith(akhiran) && bersih.length > akhiran.length) {
      const potong = bersih.slice(0, bersih.length - akhiran.length)
      const nama = namaSubAman(potong)
      if (!nama) return { jenis: 'salah', nama: '', alasan: `Nama "${potong}" tidak valid.` }
      return { jenis: 'nama', nama }
    }
  }

  if (bersih === dasar) {
    return { jenis: 'salah', nama: '', alasan: 'Itu domain utama bot, bukan nama subdomain.' }
  }

  if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(bersih)) {
    const nama = namaSubAman(bersih.replace(/\./g, '-'))
    return { jenis: 'kustom', nama: nama || `dom-${Date.now().toString(36)}`, domain: bersih }
  }

  const nama = namaSubAman(bersih)
  if (!nama) {
    return {
      jenis: 'salah',
      nama: '',
      alasan: 'Nama harus 3–30 huruf kecil/angka/tanda hubung, bukan angka saja, dan bukan nama populer (www, api, admin, …).',
    }
  }
  return { jenis: 'nama', nama }
}

/** Host tujuan CNAME untuk domain kustom milik user. */
export function hostCnameKustom() {
  const cfg = bacaKonfig() || {}
  return String(cfg.cnameKustom || 'situs.gwenna.my.id')
}

/** Cek CNAME domain user mengarah ke server bot (DNS publik). */
export async function cekCnameKustom(domain) {
  const target = hostCnameKustom().toLowerCase()
  try {
    const dns = await import('node:dns/promises')
    const daftar = await dns.resolveCname(String(domain || ''))
    const cocok = daftar.some((x) => String(x).toLowerCase().replace(/\.$/, '') === target)
    return { target, daftar, cocok }
  } catch (error) {
    return { target, daftar: [], cocok: false, galat: error.code || error.message }
  }
}

/**
 * Klaim DOMAIN KUSTOM milik user (`kaeira.my.id`, `toko.kaeira.my.id`, …).
 * Berkas situs tetap di server bot pada `situs/<nama>/`; DNS milik user
 * sendiri (CNAME → `situs.gwenna.my.id`), jadi tidak ada record Cloudflare
 * yang dibuat bot untuk domain itu.
 */
export async function klaimDomainKustom({ domain, pemilik = '', judul = '', label = '', akar = '', tanpaBatas = false }) {
  const host = String(domain || '').trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    throw new Error('Domain tidak valid. Contoh: kaeira.my.id atau toko.kaeira.my.id')
  }
  /* Task162c — domain user dipakai sebagai AKAR, situsnya hidup di
   * `<nama subdomain>.<domain user>` (mis. toko.alzriss.xyz), bukan di
   * domain bot. `label` boleh diketik user; kalau kosong dipakai "situs". */
  const akarBersih = String(akar || '').trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  const dasar = domainDasar().toLowerCase()
  if (host === dasar || host.endsWith(`.${dasar}`)) {
    throw new Error('Itu domain bot, bukan domain milikmu. Perintah .buatsubdomain khusus untuk domain sendiri, contoh `.buatsubdomain namadomain.com`.')
  }

  const registry = await bacaRegistry()

  /* Task168 — alamat situs mengikuti aturan awalan domain:
   *   tanpa label      → `alzriss.<akar>` (atau `situs.<akar>` bila awalan mati)
   *   dengan label     → `<label>-alzriss.<akar>` / `<label>.<akar>`
   * Entri lama yang sudah terdaftar tidak pernah diganti nama. */
  const rencana = rencanaHostDomain({
    host,
    akar: akarBersih || host,
    label,
    registry,
  })
  const hostSitus = rencana.host
  const labelBersih = rencana.label
  /* Alias hanya dipakai kalau belum dipegang situs lain. */
  const aliasSitus = rencana.alias.filter((h) => !Object.values(registry).some((info) => daftarHostEntri(info).includes(h)))

  /* Task163 — hormati akses domain akar.
   * private → hanya nomor pemilik domain yang boleh menambah subdomain;
   * public  → siapa pun boleh, situsnya tetap tercatat atas nama pembuatnya. */
  if (akarBersih) {
    const kontrol = statusDomain(akarBersih, registry)
    const saya = String(pemilik || '').split('@')[0]
    const pemilikAkarNomor = String(kontrol.pemilik || '').split('@')[0]
    if (pemilikAkarNomor && pemilikAkarNomor !== saya && kontrol.akses === 'private') {
      throw new Error(`Domain ${akarBersih} sedang PRIVATE — hanya pemiliknya (+${pemilikAkarNomor}) yang bisa membuat subdomain di sana. Minta pemilik mengetik .kontroldomain ${akarBersih} public.`)
    }
    /* Pembuat pertama otomatis menjadi pemilik domain (default private). */
    catatPemilikDomain({ akar: akarBersih, pemilik })
  }

  const bentrok = Object.entries(registry).find(([, info]) => String((info && info.domainKustom) || '').toLowerCase() === hostSitus)
  if (bentrok) {
    const pemilikLama = String((bentrok[1] && bentrok[1].pemilik) || '').split('@')[0]
    const saya = String(pemilik || '').split('@')[0]
    /* Task162 — mendaftarkan ulang domain sendiri bukan galat: dipakai untuk
     * memeriksa/menyambungkan lagi DNS-nya. Data lama tidak ditimpa. */
    if (pemilikLama === saya) {
      return {
        sudahAda: true,
        nama: bentrok[0],
        domainKustom: hostSitus,
        akarDomain: akarBersih || (bentrok[1] && bentrok[1].akarDomain) || '',
        label: (bentrok[1] && bentrok[1].label) || labelBersih,
        pemilik: bentrok[1] && bentrok[1].pemilik,
        judul: bentrok[1] && bentrok[1].judul,
        alamatBot: `https://${hostUtama(bentrok[0])}/`,
        cek: await cekCnameKustom(hostSitus),
      }
    }
    throw new Error(`Domain "${host}" sudah dipakai orang lain.`)
  }

  /* Domain yang sama atas nama orang yang sama → perbarui entri lama, jangan
   * bikin situs kedua. `domainKustom` digeser ke `<label>.<akar>` sesuai
   * permintaan, folder & berkas lama tetap dipakai. */
  const akarSama = Object.entries(registry).find(([, info]) => {
    const akarLama = String((info && info.akarDomain) || '').toLowerCase()
    const pemilikLama = String((info && info.pemilik) || '').split('@')[0]
    const labelLama = String((info && info.label) || '').toLowerCase()
    if (!akarLama || akarLama !== akarBersih) return false
    if (pemilikLama !== String(pemilik || '').split('@')[0]) return false
    /* Label berbeda = situs lain di domain yang sama → bukan entri yang sama. */
    if (labelLama && labelLama !== labelBersih) return false
    return true
  })
  if (akarSama) {
    const [kunci, lama] = akarSama
    if (String(lama.domainKustom || '').toLowerCase() !== hostSitus) {
      registry[kunci] = { ...lama, domainKustom: hostSitus, domainAlias: aliasSitus, label: labelBersih, awalan: rencana.awalan, diperbarui: Date.now() }
      await simpanRegistry(registry)
    }
    return {
      sudahAda: true,
      nama: kunci,
      domainKustom: hostSitus,
      akarDomain: akarBersih,
      label: labelBersih,
      pemilik: lama.pemilik,
      judul: lama.judul,
      alamatBot: `https://${hostSitus}/`,
      cek: await cekCnameKustom(hostSitus),
    }
  }

  const nama = namaSubAman(hostSitus.replace(/\./g, '-')) || `dom-${Date.now().toString(36)}`
  const milik = subdomainMilik(registry, pemilik)
  const batas = batasPerUser()
  if (!tanpaBatas && batas > 0 && milik.length >= batas) {
    throw new Error(`Kamu sudah punya ${milik.length} situs (batas ${batas} per nomor). Hapus dulu salah satunya lewat developer.`)
  }

  const html = halamanAwal({ nama: hostSitus, pemilik, judul })
  let total = 0
  let panelGalat = ''
  try {
    await buatFolder(DIR_SITUS, nama)
    total = await tulisJalur(`${DIR_SITUS}/${nama}/index.html`, Buffer.from(html, 'utf8'))
  } catch (error) {
    panelGalat = error.message
  }

  const cek = await cekCnameKustom(hostSitus)

  /* Task156 — alamat bot tetap dibuat supaya situs user LANGSUNG bisa dibuka
   * walau domain miliknya belum tersambung (NS belum diganti). */
  let alamatBot = ''
  let dnsAlias = null
  /* Task162c — alamat bot tidak lagi dipakai sebagai wajah situs domain user. */
  dnsAlias = null
  alamatBot = `https://${hostSitus}/`

  const waktu = Date.now()
  registry[nama] = {
    pemilik: String(pemilik || ''),
    judul: String(judul || host).slice(0, 60),
    domainKustom: hostSitus,
    domainAlias: aliasSitus,
    akarDomain: akarBersih,
    label: labelBersih,
    awalan: rencana.awalan,
    dibuat: waktu,
    diperbarui: waktu,
    berkas: panelGalat ? 0 : 1,
    ukuran: total,
    status: 'aktif',
    deployKe: 0,
    klaim: true,
    dnsSiap: Boolean(cek.cocok),
    alamatBot,
    dnsAlias,
    hidup: false,
    dnsMode: 'ns',
  }
  await simpanRegistry(registry)

  return {
    nama,
    domainKustom: hostSitus,
    domainAlias: aliasSitus,
    akarDomain: akarBersih,
    label: labelBersih,
    awalan: rencana.awalan,
    url: `https://${hostSitus}/`,
    alamatBot,
    target: cek.target,
    dnsSiap: Boolean(cek.cocok),
    dnsDaftar: cek.daftar,
    panelGalat,
    info: registry[nama],
  }
}

/**
 * Entri UTAMA sebuah domain akar — yang ditampilkan saat orang membuka
 * `akar` atau `www.akar`.
 *
 * Task169 — dulu akar domain melayani SEMUA subdomain (fallback "endsWith"),
 * sehingga `situs.kieran.my.id` tetap tampil walau situsnya sudah dihapus.
 * Sekarang hanya akar/www yang memakai entri utama; subdomain lain harus
 * punya entri sendiri, kalau tidak → halaman "belum terdaftar".
 *
 * Urutan pilih: label == awalan domain → label 'situs' → entri paling lama.
 */
export function entriUtamaAkar(registry, akar) {
  const target = akarDomainHost(akar)
  if (!target) return ''
  const awalan = bacaAwalanDomain(target)
  const kandidat = Object.entries(registry || {})
    .filter(([, info]) => {
      const akarInfo = String((info && info.akarDomain) || '').toLowerCase()
      const kustom = String((info && info.domainKustom) || '').toLowerCase()
      return akarInfo === target || (!akarInfo && kustom && akarDomainHost(kustom) === target)
    })
    .sort((a, b) => Number((a[1] && a[1].dibuat) || 0) - Number((b[1] && b[1].dibuat) || 0))
  if (!kandidat.length) return ''
  const cocok = (label) => kandidat.find(([, info]) => String((info && info.label) || '').toLowerCase() === label)
  return (
    (awalan && cocok(awalan)) ||
    cocok('situs') ||
    cocok(AWALAN_BAKU) ||
    kandidat[0]
  )[0]
}

/** Semua alamat sebuah entri: host utama + alias (huruf kecil). */
export function daftarHostEntri(info) {
  const utama = String((info && info.domainKustom) || '').toLowerCase().replace(/^www\./, '')
  const alias = Array.isArray(info && info.domainAlias) ? info.domainAlias : []
  return [utama, ...alias.map((h) => String(h || '').toLowerCase())].filter(Boolean)
}

/** Cari entri registry berdasarkan nama situs ATAU domain kustom. */
export async function cariSitus(masukan) {
  const arg = bacaArgumenSitus(masukan)
  if (arg.jenis === 'salah') return { arg, nama: '', info: null }
  const registry = await bacaRegistry()
  if (arg.jenis === 'kustom') {
    const entri = Object.entries(registry).find(([, info]) => String((info && info.domainKustom) || '').toLowerCase() === arg.domain)
    if (entri) return { arg, nama: entri[0], info: entri[1] }
    /* Task168 — alias merek (`ganteng-alzriss.gua.com`) menunjuk situs yang sama. */
    const lewatAlias = Object.entries(registry).find(([, info]) => daftarHostEntri(info).includes(arg.domain))
    if (lewatAlias) return { arg, nama: lewatAlias[0], info: lewatAlias[1] }
    return { arg, nama: '', info: null }
  }
  return { arg, nama: arg.nama, info: registry[arg.nama] || null }
}

/** Host kustom → nama folder situs (dipakai penyaji HTTP). */
/**
 * Task162 — nama folder situs dari apa pun yang diketik user.
 *
 * Owner mengetik domainnya sendiri saat deploy (`.deploysubdomain kieran.web.id`),
 * bukan selalu nama folder. Fungsi ini menerima nama folder, domain penuh, atau
 * bentuk titik-diganti-strip, lalu mengembalikan nama folder yang terdaftar.
 */
export async function namaSitusDariDomain(masukan) {
  const target = String(masukan || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').replace(/\.$/, '')
  if (!target) return ''
  let registry = {}
  try {
    registry = await bacaRegistry()
  } catch {
    registry = bacaRegistryLokal()
  }
  if (registry[target]) return target
  for (const [nama, info] of Object.entries(registry)) {
    if (String((info && info.domainKustom) || '').toLowerCase().replace(/^www\./, '') === target) return nama
  }
  /* Task168 — host alias merek milik situs yang sama. */
  for (const [nama, info] of Object.entries(registry)) {
    if (daftarHostEntri(info).includes(target)) return nama
  }
  /* Task169 — hanya akar/www yang memakai entri utama (bukan semua subdomain). */
  const akarTarget = akarDomainHost(target)
  if (target === akarTarget || target === `www.${akarTarget}`) {
    const utama = entriUtamaAkar(registry, akarTarget)
    if (utama) return utama
  }
  if (target.includes('.')) {
    const kandidat = namaSubAman(target.replace(/\./g, '-'))
    if (kandidat && registry[kandidat]) return kandidat
  }
  return ''
}

export function situsDariHostKustom(host) {
  const target = String(host || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  if (!target) return ''
  const registry = bacaRegistryLokal()
  for (const [nama, info] of Object.entries(registry)) {
    const kustom = String((info && info.domainKustom) || '').toLowerCase()
    if (kustom === target) return nama
  }
  /* Task168 — alias merek dan alamat tambahan situs yang sama. */
  for (const [nama, info] of Object.entries(registry)) {
    const alias = Array.isArray(info && info.domainAlias) ? info.domainAlias : []
    if (alias.some((h) => String(h || '').toLowerCase() === target)) return nama
  }
  /* Task169 — akar/www domain melayani entri UTAMA saja. Subdomain lain
   * WAJIB punya entri sendiri; kalau tidak → '' (halaman belum terdaftar),
   * supaya situs yang sudah dihapus benar-benar hilang. */
  const akarTarget = akarDomainHost(target)
  if (target === akarTarget || target === `www.${akarTarget}`) {
    const utama = entriUtamaAkar(registry, akarTarget)
    if (utama) return utama
  }
  return ''
}
