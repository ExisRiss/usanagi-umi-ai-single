/* By AlzRiss - Usanagi Umi AI
 *
 * Task173g — SISTEM SUBDOMAIN & DOMAIN BARU (mulai dari awal).
 *
 * Menggantikan plugins/owner/subdomain-deploy.js (1.971 baris, 30+ perintah
 * saling tumpang tindih) dengan satu plugin yang perintahnya jelas:
 *
 *   /subdomainmenu                       peta semua perintah di bawah
 *   /subdomain                           status subdomain + domain + situs aktif
 *   /domain                              status tiap domain aktif
 *   /deploysubdomain [nama] [ganti]      deploy ke <nama>-alzriss.<akar>
 *   /deploydomain [nama] [ganti]         deploy ke <nama>.<akar> (pemilik domain)
 *   /kontrolsubdomain [nama]             panel kontrol satu subdomain
 *   /kontroldomain [akar]                panel kontrol satu domain
 *   /addsupabase <nama>                  pasang Supabase ke situs
 *   /addfile <nama> <tambah|ganti|edit> [jalur]
 *
 * Prinsip yang dipakai (hasil pembongkaran bug lama):
 *   1. DOMAIN AKAR tidak lagi butuh pembuatan CNAME satu per satu. Ketiga zona
 *      (kieran.my.id, kieran.web.id, gwenna.my.id) sudah punya record `*`,
 *      jadi host apa pun langsung sampai ke bot. Situs dikenali dari
 *      `domainKustom` di registry (lib/situs-lokal.js → situsDariHostKustom).
 *      Inilah sebab dulu muncul "Domain X belum terdaftar" dan teks berisi
 *      "undefined": jawabannya bergantung pada Cloudflare API yang gagal.
 *   2. Semua perintah memakai SATU state menunggu berkas
 *      (data/subdomain-baru-tunggu.json), bukan tiga peta berbeda.
 *   3. Semua teks dibangun dari data registry/kontrol yang sudah ada, tanpa
 *      variabel yang bisa kosong lalu tampil sebagai "undefined".
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import {
  bacaRegistry,
  simpanRegistry,
  bacaKontrolDomain,
  simpanKontrolDomain,
  statusDomain,
  aturAksesDomain,
  aturAwalanDomain,
  bacaAwalanDomain,
  siapkanBerkas,
} from '../../lib/subdomain-kaira.js'
import { cekDns } from '../../lib/domain-sendiri.js'
import { sendInteractive } from '../../lib/awang-tombol.js'
import { daftarkanAksi } from '../../lib/pending-aksi.js'
import { adaLampiran, namaBerkasLampiran, captionLampiran } from '../../lib/lampiran.js'

/* Akar domain bawaan bot. Urutan ini juga dipakai sebagai tombol. */
const AKAR_BAWAAN = ['kieran.my.id', 'kieran.web.id', 'gwenna.my.id']
const AWALAN_SUB = 'alzriss'
const DIR_SITUS = path.join(process.cwd(), 'situs')
const BERKAS_TUNGGU = path.join(process.cwd(), 'data', 'subdomain-baru-tunggu.json')
const BERKAS_LOG = path.join(process.cwd(), 'data', 'subdomain-baru-log.json')
const BATAS_TUNGGU = 15 * 60 * 1000
const MAKS_GANTI = 300

/* ───────────────────────── util ───────────────────────── */

const TUNGGU = new Map()
let sudahMuat = false

function muatTunggu() {
  if (sudahMuat) return
  sudahMuat = true
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS_TUNGGU, 'utf8'))
    const sekarang = Date.now()
    for (const [k, v] of Object.entries(isi || {})) {
      if (!v || sekarang - Number(v.waktu || 0) > BATAS_TUNGGU) continue
      TUNGGU.set(k, v)
    }
  } catch { /* belum ada */ }
}

function simpanTunggu() {
  try {
    const isi = {}
    for (const [k, v] of TUNGGU) isi[k] = v
    fs.mkdirSync(path.dirname(BERKAS_TUNGGU), { recursive: true })
    fs.writeFileSync(BERKAS_TUNGGU, JSON.stringify(isi, null, 2), { mode: 0o600 })
  } catch { /* tidak boleh mengganggu */ }
}

function kunciTunggu(m) {
  return `${m.chat}:${m.sender}`
}

function pasangTunggu(m, data) {
  TUNGGU.set(kunciTunggu(m), { ...data, waktu: Date.now() })
  simpanTunggu()
}

function ambilTunggu(m) {
  muatTunggu()
  const data = TUNGGU.get(kunciTunggu(m))
  if (!data) return null
  if (Date.now() - Number(data.waktu || 0) > BATAS_TUNGGU) {
    TUNGGU.delete(kunciTunggu(m))
    simpanTunggu()
    return null
  }
  return data
}

function hapusTunggu(m) {
  TUNGGU.delete(kunciTunggu(m))
  simpanTunggu()
}

function catat(aksi, data) {
  try {
    let log = []
    try { log = JSON.parse(fs.readFileSync(BERKAS_LOG, 'utf8')) } catch { log = [] }
    log.unshift({ waktu: new Date().toISOString(), aksi, ...data })
    fs.mkdirSync(path.dirname(BERKAS_LOG), { recursive: true })
    fs.writeFileSync(BERKAS_LOG, JSON.stringify(log.slice(0, MAKS_GANTI), null, 2))
  } catch { /* opsional */ }
}

const angka = (n) => Number(n || 0).toLocaleString('id-ID')

function bita(n) {
  const b = Number(n || 0)
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}

function waktu(ms) {
  const t = Number(ms || 0)
  if (!t) return '-'
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar', hour12: false,
    }).format(new Date(t)).replace('.', ':') + ' WITA'
  } catch {
    return new Date(t).toISOString()
  }
}

function jamWita() {
  try {
    return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Makassar', hour12: false }).format(new Date()).replace(/\./g, ':')
  } catch {
    return '--:--'
  }
}

function nomorDari(jid) {
  return String(jid || '').split('@')[0].replace(/\D/g, '')
}

/** Label aman: huruf/angka/strip, tanpa awalan merek ganda. */
function labelAman(nama) {
  return String(nama || '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\..*$/, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(new RegExp(`-${AWALAN_SUB}$`), '')
    .slice(0, 28)
}

function akarAman(akar) {
  return String(akar || '').toLowerCase().trim().replace(/^www\./, '').replace(/\.$/, '')
}

function slugSitus(label, akar) {
  return `${label}-${akarAman(akar).replace(/\./g, '-')}`
}

/** Host subdomain: <label>-alzriss.<akar> */
function hostSubdomain(label, akar) {
  return `${label}-${AWALAN_SUB}.${akarAman(akar)}`
}

/** Host domain (pemilik domain bebas): <label>.<akar> */
function hostDomain(label, akar) {
  return `${label}.${akarAman(akar)}`
}

function daftarAkar(registry, kontrol = null) {
  const kk = kontrol || bacaKontrolDomain()
  const set = new Set(AKAR_BAWAAN)
  for (const akar of Object.keys(kk || {})) if (akar) set.add(akarAman(akar))
  for (const info of Object.values(registry || {})) {
    const akar = akarAman((info && info.akarDomain) || '')
    if (akar) set.add(akar)
  }
  return [...set]
}

function pemilikAkar(kontrol, akar) {
  const catatan = (kontrol || {})[akarAman(akar)]
  return String((catatan && catatan.pemilik) || '').split('@')[0]
}

function sayaOwnerBot(m, extra) {
  return Boolean(m?.fromMe || extra?.isOwner || extra?.isROwner || extra?.isOwnerUtama)
}

/** Domain yang boleh dipakai user untuk /deploydomain. */
function domainMilikUser(kontrol, registry, sender) {
  const saya = nomorDari(sender)
  const daftar = []
  for (const [akar, catatan] of Object.entries(kontrol || {})) {
    const pemilik = String((catatan && catatan.pemilik) || '').split('@')[0]
    if (pemilik && pemilik === saya) daftar.push(akarAman(akar))
  }
  // Domain yang pernah dipakai untuk situs tapi belum tercatat di kontrol.
  for (const info of Object.values(registry || {})) {
    const akar = akarAman((info && info.akarDomain) || '')
    const pemilik = String((info && info.pemilik) || '').split('@')[0]
    if (akar && pemilik === saya && !daftar.includes(akar)) daftar.push(akar)
  }
  return daftar
}

/* ───────────────────── penyimpanan situs ───────────────────── */

function folderSitus(slug) {
  return path.join(DIR_SITUS, slug)
}

function tulisBerkas(slug, daftar) {
  const akar = folderSitus(slug)
  fs.mkdirSync(akar, { recursive: true })
  let total = 0
  for (const item of daftar) {
    const jalur = String(item.jalur || '').replace(/^\/+/, '').replace(/\.\.(\/|\\|$)/g, '')
    if (!jalur) continue
    const tujuan = path.join(akar, jalur)
    if (!tujuan.startsWith(akar)) continue
    fs.mkdirSync(path.dirname(tujuan), { recursive: true })
    fs.writeFileSync(tujuan, item.data)
    total += item.data.length
  }
  return total
}

function hapusFolder(slug) {
  try {
    fs.rmSync(folderSitus(slug), { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

function ringkasBerkas(slug) {
  const akar = folderSitus(slug)
  let jumlah = 0
  let ukuran = 0
  const jelajah = (dir) => {
    let isi = []
    try { isi = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const item of isi) {
      const jalur = path.join(dir, item.name)
      if (item.isDirectory()) jelajah(jalur)
      else {
        jumlah += 1
        try { ukuran += fs.statSync(jalur).size } catch { /* lewati */ }
      }
    }
  }
  jelajah(akar)
  return { jumlah, ukuran }
}

/** Semua situs yang terdaftar, dinormalkan. */
function daftarSitus(registry) {
  return Object.entries(registry || {}).map(([slug, info]) => {
    const akar = akarAman((info && info.akarDomain) || '')
    const host = String((info && info.domainKustom) || '').toLowerCase()
    return {
      slug,
      info: info || {},
      akar,
      host,
      label: String((info && info.label) || slug),
      pemilik: String((info && info.pemilik) || ''),
      aktif: !info || info.status === undefined || info.status === 'aktif',
      subdomain: Boolean(host && akar && host.endsWith(`-${AWALAN_SUB}.${akar}`)),
      berkas: Number((info && info.berkas) || 0),
      ukuran: Number((info && info.ukuran) || 0),
      deployKe: Number((info && info.deployKe) || 0),
      diperbarui: Number((info && info.diperbarui) || 0),
    }
  })
}

/* ─────────────────────── teks & kartu ─────────────────────── */

function kartuJudul(judul, isi, footer = '') {
  return [judul, '', isi, footer ? `\n${footer}` : ''].join('\n').trim()
}

async function kirimDaftar(m, conn, { judul, subjudul, isi, footer, baris, judulDaftar }) {
  const rows = (baris || []).filter(Boolean).map((r) => ({
    title: String(r.title || '').slice(0, 24),
    description: String(r.description || '').slice(0, 60),
    command: r.command,
  }))
  if (rows.length) {
    try {
      return await sendInteractive(conn, m.chat, {
        title: judul,
        subtitle: subjudul,
        body: isi,
        footer: footer || 'Pilih salah satu.',
        list: { listTitle: judulDaftar || 'PILIH', sections: [{ title: (judulDaftar || 'PILIH').toUpperCase(), rows }] },
      }, { quoted: m.raw || m })
    } catch { /* jatuh ke teks */ }
  }
  const teks = rows.length
    ? [isi, '', '*Pilihan:*', ...rows.map((r) => `• ${r.title} → ${r.command}`)].join('\n')
    : isi
  return m.reply(teks)
}

/** Status satu host lewat DoH + HTTP (pakai cekDns yang sudah ada). */
async function statusHost(host) {
  try {
    const hasil = await cekDns(host)
    return {
      hidup: Boolean(hasil?.hidup),
      status: String(hasil?.status || 'belum'),
      http: Number(hasil?.statusHttp || 0),
      ns: Array.isArray(hasil?.ns) ? hasil.ns : [],
      a: Array.isArray(hasil?.a) ? hasil.a : [],
      ms: Number(hasil?.diperiksa || 0),
    }
  } catch (error) {
    return { hidup: false, status: 'galat', http: 0, ns: [], a: [], galat: String(error?.message || error).slice(0, 80) }
  }
}

function ikonStatus(status) {
  if (status === 'hidup') return '🟢'
  if (status === 'tersambung-kosong') return '🟡'
  if (status === 'hidup-lain') return '🟠'
  if (status === 'dns-sebagian') return '🟡'
  return '🔴'
}

function labelStatusRingkas(s) {
  if (s === 'hidup') return 'HIDUP'
  if (s === 'tersambung-kosong') return 'tersambung · halaman kosong'
  if (s === 'hidup-lain') return 'hidup, bukan dari bot'
  if (s === 'dns-sebagian') return 'DNS sebagian'
  if (s === 'http-gagal') return 'server tidak menjawab'
  if (s === 'galat') return 'gagal dicek'
  return 'belum'
}

/* ───────────────────────– perintah –─────────────────────── */

async function perintahMenu(m, conn) {
  const isi = [
    '🌐 *MENU SUBDOMAIN & DOMAIN*',
    '',
    'Semua yang berhubungan dengan situs ada di sini.',
    '',
    '*Status*',
    '• `/subdomain` — ringkasan domain, subdomain, situs aktif',
    '• `/domain` — status tiap domain aktif',
    '',
    '*Deploy*',
    '• `/deploysubdomain` — pilih domain → `<nama>-alzriss.<domain>`',
    '• `/deploydomain` — khusus pemilik domain → `<nama>.<domain>`',
    '• `/addfile <nama> tambah|ganti|edit` — ubah isi situs',
    '• `/addsupabase <nama>` — pasang database Supabase',
    '',
    '*Kontrol*',
    '• `/kontrolsubdomain <nama>` — info, deploy ulang, maintenance, hapus',
    '• `/kontroldomain <domain>` — akses, awalan, daftar subdomain',
    '',
    'Alamat subdomain memakai akhiran `-alzriss` (bawaan bot).',
    'Alamat domain bebas tidak memakai akhiran.',
  ].join('\n')

  return kirimDaftar(m, conn, {
    judul: '🌐 Menu Subdomain',
    subjudul: 'Status · deploy · kontrol',
    isi,
    footer: 'Ketuk untuk membuka.',
    judulDaftar: 'PILIH MENU',
    baris: [
      { title: '📊 Status subdomain', description: 'Domain, subdomain, situs aktif', command: '/subdomain' },
      { title: '🌍 Status domain', description: 'Cek hidup tiap domain', command: '/domain' },
      { title: '🚀 Deploy subdomain', description: '<nama>-alzriss.<domain>', command: '/deploysubdomain' },
      { title: '🚀 Deploy domain', description: '<nama>.<domain> milikmu', command: '/deploydomain' },
      { title: '🛠️ Kontrol subdomain', description: 'Deploy ulang, maintenance, hapus', command: '/kontrolsubdomain' },
      { title: '🛠️ Kontrol domain', description: 'Akses, awalan, daftar situs', command: '/kontroldomain' },
      { title: '🗄️ Pasang Supabase', description: 'Database cloud untuk situs', command: '/addsupabase' },
      { title: '📝 Ubah berkas situs', description: 'tambah · ganti · edit', command: '/addfile' },
    ],
  })
}

async function perintahSubdomain(m, conn) {
  const registry = await bacaRegistry().catch(() => ({}))
  const kontrol = bacaKontrolDomain()
  const situs = daftarSitus(registry)
  const akar = daftarAkar(registry, kontrol)
  const aktif = situs.filter((s) => s.aktif)
  const subAktif = situs.filter((s) => s.subdomain)
  const domainSitus = situs.filter((s) => !s.subdomain)

  const barisDomain = akar.map((a) => {
    const milik = statusDomain(a, registry)
    return `• *${a}* — ${milik.jumlah} situs · ${milik.akses === 'public' ? '🌐 public' : '🔒 private'}${kontrol[a] ? '' : ' · belum dicatat'}`
  })

  const isi = [
    '🌐 *STATUS SUBDOMAIN & DOMAIN*',
    `diperiksa ${jamWita()} WITA`,
    '',
    `Domain tersedia : *${akar.length}*`,
    `Subdomain aktif : *${subAktif.length}*`,
    `Domain situs    : *${domainSitus.length}*`,
    `Situs aktif     : *${aktif.length}* dari ${situs.length}`,
    '',
    '*Domain yang tersedia*',
    ...barisDomain,
    '',
    '*Daftar situs*',
    ...(situs.length
      ? situs.slice(0, 12).map((s) => `• ${s.aktif ? '🟢' : '🔴'} ${s.host || s.slug}${s.pemilik ? ` · +${String(s.pemilik).split('@')[0]}` : ''}`)
      : ['• belum ada situs']),
    situs.length > 12 ? `… dan ${situs.length - 12} situs lain` : '',
    '',
    'Deploy baru: `/deploysubdomain` · kontrol: `/kontrolsubdomain <nama>`',
  ].filter(Boolean).join('\n')

  return kirimDaftar(m, conn, {
    judul: '🌐 Status Subdomain',
    subjudul: `${akar.length} domain · ${aktif.length} situs aktif`,
    isi,
    baris: [
      { title: '🚀 Deploy subdomain', description: 'Buat situs baru', command: '/deploysubdomain' },
      { title: '🌍 Status domain', description: 'Cek hidup tiap domain', command: '/domain' },
      { title: '🛠️ Kontrol subdomain', description: 'Kelola situs yang ada', command: '/kontrolsubdomain' },
    ],
    judulDaftar: 'AKSI',
  })
}

async function perintahDomain(m, conn) {
  const registry = await bacaRegistry().catch(() => ({}))
  const kontrol = bacaKontrolDomain()
  const akar = daftarAkar(registry, kontrol)
  const cek = await Promise.all(akar.map(async (a) => ({ akar: a, hasil: await statusHost(a) })))

  const isi = [
    '🌍 *STATUS DOMAIN*',
    `diperiksa ${jamWita()} WITA`,
    '',
    ...cek.map(({ akar: a, hasil }) => {
      const milik = statusDomain(a, registry)
      return [
        `${ikonStatus(hasil.status)} *${a}* — ${labelStatusRingkas(hasil.status)}${hasil.http ? ` · HTTP ${hasil.http}` : ''}`,
        `   ${milik.jumlah} situs · ${milik.akses === 'public' ? '🌐 public' : '🔒 private'}${milik.awalan ? ` · awalan ${milik.awalan}` : ''}`,
        `   NS ${hasil.ns.length ? hasil.ns.slice(0, 2).join(', ') : '-'}`,
      ].join('\n')
    }),
    '',
    '_DNS memakai record `*`, jadi semua nama di bawah domain ini langsung sampai ke bot._',
    'Panel: `/kontroldomain <domain>`',
  ].join('\n')

  return m.reply(isi)
}

/* ───────────── deploy subdomain (pilih domain → nama → berkas) ───────────── */

async function perintahDeploySubdomain(m, conn, args) {
  const registry = await bacaRegistry().catch(() => ({}))
  const kontrol = bacaKontrolDomain()
  const akarSemua = daftarAkar(registry, kontrol)
  const sisa = args.filter(Boolean)
  const nama = sisa[0] ? labelAman(sisa[0]) : ''
  const mode = /^ganti$/i.test(sisa[1] || '') ? 'ganti' : 'baru'

  /* Sudah ada situs dengan nama itu → tampilkan panel kontrolnya. */
  if (nama) {
    const situs = daftarSitus(registry).filter((s) => s.label === nama || s.slug.startsWith(`${nama}-`))
    if (situs.length === 1 && mode === 'baru' && !adaLampiran(m)) {
      pasangTunggu(m, { aksi: 'deploy-sub', label: nama, akar: situs[0].akar, mode: 'ganti' })
      return m.reply([
        `ℹ️ Situs *${nama}* sudah ada di ${situs[0].akar}.`,
        `Alamat: https://${situs[0].host}/`,
        '',
        'Kirim berkas baru (zip / index.html / kode HTML) untuk MENGGANTI isinya,',
        'atau ketik /kontrolsubdomain ' + nama + ' untuk aksi lain.',
        `Menunggu berkas maksimal 15 menit. Ketik /batal untuk membatalkan.`,
      ].join('\n'))
    }
  }

  if (!akarSemua.length) {
    return m.reply('Belum ada domain. Minta owner mendaftarkan domain dulu (data/domain-kontrol.json).')
  }

  const akarTerpilih = sisa.find((x) => akarSemua.includes(akarAman(x))) ? akarAman(sisa.find((x) => akarSemua.includes(akarAman(x)))) : ''

  if (nama && akarTerpilih) {
    pasangTunggu(m, { aksi: 'deploy-sub', label: nama, akar: akarTerpilih, mode })
    return m.reply([
      '📥 *SIAP DEPLOY*',
      '',
      `Nama  : ${nama}`,
      `Domain: ${akarTerpilih}`,
      `Alamat: https://${hostSubdomain(nama, akarTerpilih)}/`,
      '',
      'Sekarang kirim:',
      '• berkas .zip / .tar.gz berisi situs, atau',
      '• satu index.html, atau',
      '• kode HTML langsung di chat.',
      '',
      mode === 'ganti' ? 'Mode: GANTI — isi lama akan dihapus.' : 'Mode: BARU — isi lama (kalau ada) diganti juga.',
      'Batalkan dengan /batal. Berlaku 15 menit.',
    ].join('\n'))
  }

  const baris = akarSemua.slice(0, 8).map((a) => ({
    title: `🚀 ${a}`,
    description: nama ? `https://${hostSubdomain(nama, a)}/` : 'Deploy di domain ini',
    command: nama ? `/deploysubdomain ${nama} ${a} ${mode}` : `/deploysubdomain ${nama || 'namasitus'} ${a}`,
  }))

  return kirimDaftar(m, conn, {
    judul: '🌐 Pilih Domain',
    subjudul: nama ? `nama: ${nama}` : 'nama: belum diisi',
    isi: [
      '🌐 *DEPLOY SUBDOMAIN*',
      '',
      nama ? `Nama situs : *${nama}*` : 'Nama situs : belum ada',
      '',
      nama
        ? 'Ketuk domain untuk memilih tempat deploy.'
        : 'Tulis dulu nama situsnya, contoh:\n`/deploysubdomain toko`\nlalu pilih domain.',
      '',
      '*Alamat yang akan dipakai*',
      ...akarSemua.slice(0, 8).map((a) => `• https://${hostSubdomain(nama || 'namasitus', a)}/`),
      '',
      'Ganti seluruh isi situs: `/deploysubdomain <nama> ganti`',
    ].join('\n'),
    baris: nama ? baris : [{ title: '🛠️ Kontrol subdomain', description: 'Lihat situs yang sudah ada', command: '/kontrolsubdomain' }],
    judulDaftar: nama ? 'PILIH DOMAIN' : 'AKSI',
  })
}

/* ───────────── deploy domain (pemilik domain bebas) ───────────── */

async function perintahDeployDomain(m, conn, args, extra) {
  const registry = await bacaRegistry().catch(() => ({}))
  const kontrol = bacaKontrolDomain()
  const saya = nomorDari(m.sender)
  const milik = domainMilikUser(kontrol, registry, m.sender)
  const bawaan = AKAR_BAWAAN
  const boleh = sayaOwnerBot(m, extra) ? daftarAkar(registry, kontrol) : milik

  const sisa = args.filter(Boolean)
  const nama = sisa[0] ? labelAman(sisa[0]) : ''
  const mode = /^ganti$/i.test(sisa[1] || '') ? 'ganti' : 'baru'
  const akarTerpilih = sisa.find((x) => boleh.includes(akarAman(x))) ? akarAman(sisa.find((x) => boleh.includes(akarAman(x)))) : ''

  if (!boleh.length) {
    return m.reply([
      '🔒 *DEPLOY DOMAIN*',
      '',
      'Belum ada domain yang terdaftar atas namamu.',
      '',
      'Domain bawaan bot hanya bisa dipakai lewat /deploysubdomain:',
      ...bawaan.map((a) => `• https://<nama>-${AWALAN_SUB}.${a}/`),
      '',
      'Punya domain sendiri? Daftarkan dulu ke owner bot,',
      'lalu /deploydomain akan menampilkan domain itu di sini.',
    ].join('\n'))
  }

  if (nama && akarTerpilih) {
    pasangTunggu(m, { aksi: 'deploy-domain', label: nama, akar: akarTerpilih, mode })
    return m.reply([
      '📥 *SIAP DEPLOY DOMAIN*',
      '',
      `Nama  : ${nama}`,
      `Domain: ${akarTerpilih}`,
      `Alamat: https://${hostDomain(nama, akarTerpilih)}/`,
      '',
      'Kirim berkas situs (zip / index.html / kode HTML).',
      'Batalkan dengan /batal. Berlaku 15 menit.',
    ].join('\n'))
  }

  return kirimDaftar(m, conn, {
    judul: '🌍 Deploy ke Domain',
    subjudul: `${boleh.length} domain tersedia`,
    isi: [
      '🌍 *DEPLOY DOMAIN*',
      '',
      nama ? `Nama situs : *${nama}*` : 'Nama situs : belum ada (contoh: /deploydomain toko)',
      '',
      '*Domain milikmu*',
      ...boleh.map((a) => `• https://${hostDomain(nama || 'namasitus', a)}/`),
      '',
      'Alamat domain bebas tidak memakai akhiran `-alzriss`.',
      'Hapus/ganti isi: /kontrolsubdomain <nama>',
    ].join('\n'),
    baris: (nama ? boleh : []).slice(0, 8).map((a) => ({
      title: `🌐 ${a}`,
      description: `https://${hostDomain(nama, a)}/`,
      command: `/deploydomain ${nama} ${a} ${mode}`,
    })),
    judulDaftar: 'PILIH DOMAIN',
  })
}

/* ───────────── kontrol ───────────── */

function kartuSitus(situs) {
  const label = situs.subdomain ? 'SUBDOMAIN' : 'DOMAIN'
  /* Entri lama (sebelum Task173g) tidak punya akarDomain/domainKustom —
   * alamatnya diturunkan dari slug supaya tidak pernah tampil "https://\/". */
  const alamat = situs.host || (situs.akar ? `${situs.label}-${AWALAN_SUB}.${situs.akar}` : `${situs.slug}`)
  return [
    `🛠️ *KONTROL ${label}*`,
    '',
    `Alamat  : ${situs.host ? `https://${situs.host}/` : `(belum punya alamat) folder ${situs.slug}`}`,
    `Nama    : ${situs.label}`,
    `Domain  : ${situs.akar || '-'}`,
    `Folder  : ${situs.slug}`,
    `Status  : ${situs.status === 'maintenance' ? '🛠️ maintenance' : situs.aktif ? '🟢 aktif' : '🔴 nonaktif'}`,
    `Pemilik : ${situs.pemilik ? '+' + String(situs.pemilik).split('@')[0] : '-'}`,
    `Berkas  : ${angka(situs.berkas)} · ${bita(situs.ukuran)}`,
    `Deploy  : ke-${situs.deployKe || 1} · ${waktu(situs.diperbarui)}`,
    situs.supabase ? '🗄️ Supabase: terpasang' : '',
  ].filter(Boolean).join('\n')
}

async function cariSitusUntuk(m, nama) {
  const registry = await bacaRegistry().catch(() => ({}))
  const semua = daftarSitus(registry)
  if (!nama) return { registry, semua, situs: null }
  const target = String(nama || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const label = labelAman(target)
  const ketemu = semua.find((s) => s.host === target)
    || semua.find((s) => s.slug === target)
    || semua.find((s) => s.label === label && s.host.endsWith(`.${akarAman(target)}`))
    || semua.filter((s) => s.label === label)[0]
    || null
  return { registry, semua, situs: ketemu }
}

async function perintahKontrolSubdomain(m, conn, args, extra) {
  const { situs, semua } = await cariSitusUntuk(m, args[0])
  const saya = nomorDari(m.sender)
  const admin = sayaOwnerBot(m, extra)

  if (!situs) {
    const milik = semua.filter((s) => admin || String(s.pemilik).split('@')[0] === saya)
    if (!milik.length) {
      return m.reply('Belum ada subdomain milikmu. Buat dulu: /deploysubdomain')
    }
    if (milik.length === 1) return panelKontrol(m, conn, milik[0], admin)
    return kirimDaftar(m, conn, {
      judul: '🛠️ Kontrol Subdomain',
      subjudul: `${milik.length} situs`,
      isi: ['🛠️ *PILIH SUBDOMAIN*', '', ...milik.slice(0, 12).map((s) => `• ${s.aktif ? '🟢' : '🔴'} ${s.host}`)].join('\n'),
      baris: milik.slice(0, 8).map((s) => ({ title: `🛠️ ${s.label}`, description: s.host, command: `/kontrolsubdomain ${s.label}` })),
      judulDaftar: 'PILIH SITUS',
    })
  }

  if (!admin && String(situs.pemilik).split('@')[0] !== saya) {
    return m.reply(`🔒 ${situs.host} milik nomor lain.`)
  }
  return panelKontrol(m, conn, situs, admin)
}

async function panelKontrol(m, conn, situs, admin) {
  const maintenance = situs.info.status === 'maintenance'
  const baris = [
    { title: '📊 Info status', description: 'Cek hidup + detail situs', command: `/kontrolsubdomain ${situs.label} info` },
    { title: '🔄 Deploy ulang', description: 'Kirim berkas baru (ganti semua)', command: `/kontrolsubdomain ${situs.label} deployulang` },
    { title: maintenance ? '▶️ Keluar maintenance' : '🛠️ Maintenance', description: maintenance ? 'Situs dibuka lagi' : 'Situs ditutup sementara', command: `/kontrolsubdomain ${situs.label} ${maintenance ? 'aktif' : 'maintenance'}` },
    { title: '📝 Tambah berkas', description: 'Tambah satu berkas', command: `/addfile ${situs.label} tambah` },
    { title: '✏️ Edit berkas', description: 'Ganti isi satu berkas', command: `/addfile ${situs.label} edit` },
    { title: '🗄️ Pasang Supabase', description: 'Database cloud', command: `/addsupabase ${situs.label}` },
  ]
  if (admin) baris.push({ title: '🗑️ Hapus situs', description: 'Folder + data dihapus', command: `/kontrolsubdomain ${situs.label} hapus` })

  return kirimDaftar(m, conn, {
    judul: '🛠️ Kontrol Situs',
    subjudul: situs.host,
    isi: kartuSitus(situs),
    footer: 'Pilih aksi di bawah.',
    baris,
    judulDaftar: 'AKSI',
  })
}

async function aksiKontrolSubdomain(m, conn, args, extra) {
  const { situs } = await cariSitusUntuk(m, args[0])
  const aksi = String(args[1] || '').toLowerCase()
  const admin = sayaOwnerBot(m, extra)
  if (!situs) return m.reply('Situs tidak ditemukan. Lihat daftar: /kontrolsubdomain')
  if (!admin && String(situs.pemilik).split('@')[0] !== nomorDari(m.sender)) {
    return m.reply(`🔒 ${situs.host} milik nomor lain.`)
  }

  if (aksi === 'info') {
    const status = await statusHost(situs.host)
    return m.reply([
      kartuSitus(situs),
      '',
      `Status live : ${ikonStatus(status.status)} ${labelStatusRingkas(status.status)}${status.http ? ` (HTTP ${status.http})` : ''}`,
      `NS          : ${status.ns.length ? status.ns.slice(0, 2).join(', ') : '-'}`,
      `Diperiksa   : ${jamWita()} WITA`,
    ].join('\n'))
  }

  if (aksi === 'maintenance' || aksi === 'aktif' || aksi === 'nonaktif') {
    const registry = await bacaRegistry().catch(() => ({}))
    if (!registry[situs.slug]) return m.reply('Situs tidak ada di registry.')
    registry[situs.slug].status = aksi === 'maintenance' ? 'maintenance' : aksi === 'aktif' ? 'aktif' : 'nonaktif'
    registry[situs.slug].diperbarui = Date.now()
    await simpanRegistry(registry)
    catat('status', { slug: situs.slug, status: registry[situs.slug].status, oleh: nomorDari(m.sender) })
    return m.reply([
      `✅ Status *${situs.host}* sekarang: *${registry[situs.slug].status}*`,
      '',
      aksi === 'maintenance' ? 'Pengunjung melihat halaman "sedang perbaikan".' : aksi === 'aktif' ? 'Situs bisa dibuka lagi.' : 'Situs ditutup.',
    ].join('\n'))
  }

  if (aksi === 'deployulang') {
    pasangTunggu(m, { aksi: situs.subdomain ? 'deploy-sub' : 'deploy-domain', label: situs.label, akar: situs.akar, mode: 'ganti' })
    return m.reply([
      `📥 *DEPLOY ULANG — ${situs.host}*`,
      '',
      'Kirim berkas baru (zip / index.html / kode HTML).',
      'Isi lama akan diganti seluruhnya.',
      'Batalkan: /batal · berlaku 15 menit.',
    ].join(String.fromCharCode(10)))
  }

  if (aksi === 'hapus') {
    if (!admin) return m.reply('🔒 Hapus situs hanya bisa dilakukan owner bot.')
    const registry = await bacaRegistry().catch(() => ({}))
    delete registry[situs.slug]
    await simpanRegistry(registry)
    hapusFolder(situs.slug)
    catat('hapus', { slug: situs.slug, oleh: nomorDari(m.sender) })
    return m.reply(`🗑️ *${situs.host}* dihapus.\n\nAlamatnya sekarang menampilkan halaman "belum terdaftar".`)
  }

  return panelKontrol(m, conn, situs, admin)
}

async function perintahKontrolDomain(m, conn, args, extra) {
  const registry = await bacaRegistry().catch(() => ({}))
  const kontrol = bacaKontrolDomain()
  const semua = daftarAkar(registry, kontrol)
  const arg = akarAman(args[0] || '')
  const akar = arg && semua.includes(arg) ? arg : ''
  const admin = sayaOwnerBot(m, extra)

  if (!akar) {
    return kirimDaftar(m, conn, {
      judul: '🔐 Kontrol Domain',
      subjudul: `${semua.length} domain`,
      isi: [
        '🔐 *PILIH DOMAIN*',
        '',
        ...semua.map((a) => {
          const st = statusDomain(a, registry)
          return `• *${a}* — ${st.jumlah} situs · ${st.akses === 'public' ? '🌐 public' : '🔒 private'} · awalan ${st.awalan || '-'}`
        }),
        '',
        'Panel: akses, awalan, daftar situs, hapus.',
      ].join('\n'),
      baris: semua.slice(0, 8).map((a) => ({ title: `🔐 ${a}`, description: `${statusDomain(a, registry).jumlah} situs`, command: `/kontroldomain ${a}` })),
      judulDaftar: 'PILIH DOMAIN',
    })
  }

  const status = statusDomain(akar, registry)
  const pemilik = String(status.pemilik || '').split('@')[0]
  const boleh = admin || (pemilik && pemilik === nomorDari(m.sender))
  if (!boleh) return m.reply(`🔒 Domain ${akar} milik +${pemilik || '?'}. Hanya pemiliknya yang bisa membuka panel ini.`)

  const aksi = String(args[1] || '').toLowerCase()
  if (aksi === 'public' || aksi === 'private') {
    aturAksesDomain({ akar, akses: aksi, oleh: m.sender, paksa: admin })
    catat('akses-domain', { akar, akses: aksi, oleh: nomorDari(m.sender) })
    return m.reply([
      `🌐 *AKSES DOMAIN DIUBAH*`,
      '',
      `Domain : *${akar}*`,
      `Akses  : ${aksi === 'public' ? '🌐 PUBLIC — siapa saja boleh menambah subdomain' : '🔒 PRIVATE — hanya pemilik'}`,
    ].join('\n'))
  }
  if (aksi === 'awalan' || aksi === 'tanpaawalan' || aksi === 'awalanawal') {
    const nilai = aksi === 'tanpaawalan' ? '' : AWALAN_SUB
    aturAwalanDomain({ akar, awalan: nilai, oleh: m.sender, paksa: admin })
    catat('awalan-domain', { akar, awalan: nilai, oleh: nomorDari(m.sender) })
    const contohHost = nilai ? `contoh-${nilai}.${akar}` : `contoh.${akar}`
    return m.reply([
      '🔤 *AWALAN DOMAIN DIUBAH*',
      '',
      `Domain : *${akar}*`,
      `Awalan : ${nilai ? `*${nilai}*` : 'tanpa awalan'}`,
      '',
      `Contoh alamat subdomain baru: https://${contohHost}/`,
      `Panel : /kontroldomain ${akar}`,
    ].join('\n'))
  }

  const cek = await statusHost(akar)
  const daftar = status.daftar || []
  return kirimDaftar(m, conn, {
    judul: '🔐 Kontrol Domain',
    subjudul: akar,
    isi: [
      '🔐 *KONTROL DOMAIN*',
      '',
      `Domain  : *${akar}*`,
      `Pemilik : ${pemilik ? '+' + pemilik : '-'}`,
      `Akses   : ${status.akses === 'public' ? '🌐 PUBLIC' : '🔒 PRIVATE'}`,
      `Awalan  : ${status.awalan ? `*${status.awalan}*` : 'tanpa awalan'}`,
      `Situs   : *${status.jumlah}* total · *${status.nyala}* nyala`,
      `Status  : ${ikonStatus(cek.status)} ${labelStatusRingkas(cek.status)}${cek.http ? ` · HTTP ${cek.http}` : ''}`,
      `NS      : ${cek.ns.length ? cek.ns.slice(0, 2).join(', ') : '-'}`,
      '',
      '*Situs di domain ini*',
      ...(daftar.length ? daftar.map((s) => `• ${s.aktif ? '🟢' : '🔴'} ${s.host} · ${s.berkas} berkas`) : ['• belum ada']),
    ].join('\n'),
    footer: 'Pilih aksi di bawah.',
    baris: [
      { title: '🚀 Deploy subdomain', description: `https://<nama>-${AWALAN_SUB}.${akar}/`, command: `/deploysubdomain namasitus ${akar}` },
      { title: status.akses === 'public' ? '🔒 Jadikan PRIVATE' : '🌐 Jadikan PUBLIC', description: status.akses === 'public' ? 'Hanya pemilik' : 'Siapa saja boleh', command: `/kontroldomain ${akar} ${status.akses === 'public' ? 'private' : 'public'}` },
      { title: status.awalan ? '🔤 Tanpa awalan' : `🔤 Pakai ${AWALAN_SUB}`, description: 'Aturan alamat subdomain', command: `/kontroldomain ${akar} ${status.awalan ? 'tanpaawalan' : 'awalan'}` },
      { title: '🛠️ Kontrol situs', description: 'Kelola isi halaman', command: '/kontrolsubdomain' },
    ],
    judulDaftar: 'AKSI DOMAIN',
  })
}

/* ───────────── addsupabase ───────────── */

async function perintahAddSupabase(m, conn, args, extra) {
  const nama = labelAman(args[0] || '')
  if (!nama) {
    return m.reply([
      '🗄️ *PASANG SUPABASE*',
      '',
      'Supabase = database cloud gratis untuk situsmu.',
      '',
      'Cara pakai:',
      '`/addsupabase namasitus`',
      '',
      'Lalu kirim URL project + anon key dari dashboard Supabase, contoh:',
      '`https://abcdefgh.supabase.co sb_publishable_xxx`',
      '',
      'Syarat: kamu sudah punya subdomain/domain yang terdaftar di bot.',
    ].join('\n'))
  }

  const { situs } = await cariSitusUntuk(m, nama)
  const admin = sayaOwnerBot(m, extra)
  if (!situs) {
    return m.reply(`Situs *${nama}* belum ada. Deploy dulu: /deploysubdomain ${nama}`)
  }
  if (!admin && String(situs.pemilik).split('@')[0] !== nomorDari(m.sender)) {
    return m.reply(`🔒 ${situs.host} milik nomor lain.`)
  }

  const url = String(args[1] || '').trim()
  const kunci = String(args[2] || '').trim()
  if (!url || !kunci) {
    pasangTunggu(m, { aksi: 'supabase', slug: situs.slug })
    return m.reply([
      '🗄️ *SUPABASE — LANGKAH 1*',
      '',
      `Situs : ${situs.host}`,
      '',
      '1. Buka https://supabase.com → New project (gratis).',
      '2. Masuk Project Settings → API.',
      '3. Salin *Project URL* dan *anon public key*.',
      '4. Kirim ke chat ini dengan format:',
      '   `<project-url> <anon-key>`',
      '',
      'Contoh:',
      '   https://abcdefgh.supabase.co sb_publishable_abc123',
      '',
      'Kunci disimpan di server (tidak ditampilkan lagi di chat).',
      'Batalkan: /batal · berlaku 15 menit.',
    ].join('\n'))
  }

  return pasangSupabase(m, situs, url, kunci)
}

async function pasangSupabase(m, situs, url, kunci) {
  const bersihUrl = String(url || '').trim().replace(/\/+$/, '')
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(bersihUrl)) {
    return m.reply('URL Supabase tidak valid. Harus berbentuk https://xxxx.supabase.co')
  }
  if (String(kunci || '').length < 20) {
    return m.reply('Anon key terlalu pendek. Salin ulang dari Project Settings → API.')
  }

  const berkas = [
    {
      jalur: 'supabase-config.js',
      data: Buffer.from(`/* Dibuat otomatis oleh Umi Usanagi AI\n * Jangan bagikan berkas ini.\n */\nwindow.SUPABASE_URL = ${JSON.stringify(bersihUrl)};\nwindow.SUPABASE_ANON_KEY = ${JSON.stringify(String(kunci))};\n`, 'utf8'),
    },
    {
      jalur: 'supabase-client.js',
      data: Buffer.from(`/* Klien Supabase kecil tanpa bundler — cukup disertakan di index.html:\n *   <script src="supabase-config.js"></script>\n *   <script src="supabase-client.js"></script>\n * Lalu:  const db = SupabaseKecil.from('nama_tabel')\n */\n(function (global) {\n  function url(jalur) { return global.SUPABASE_URL.replace(/\\/$/, '') + '/rest/v1/' + jalur; }\n  function kepala(extra) {\n    return Object.assign({\n      apikey: global.SUPABASE_ANON_KEY,\n      Authorization: 'Bearer ' + global.SUPABASE_ANON_KEY,\n      'Content-Type': 'application/json',\n    }, extra || {});\n  }\n  var SupabaseKecil = {\n    from: function (tabel) {\n      return {\n        pilih: function (kolom) {\n          return fetch(url(tabel + '?select=' + encodeURIComponent(kolom || '*')), { headers: kepala() }).then(function (r) { return r.json(); });\n        },\n        tambah: function (data) {\n          return fetch(url(tabel), { method: 'POST', headers: kepala({ Prefer: 'return=representation' }), body: JSON.stringify(data) }).then(function (r) { return r.json(); });\n        },\n        hapus: function (filter) {\n          return fetch(url(tabel + '?' + filter), { method: 'DELETE', headers: kepala() }).then(function (r) { return r.json(); });\n        },\n      };\n    },\n  };\n  global.SupabaseKecil = SupabaseKecil;\n})(window);\n`, 'utf8'),
    },
    {
      jalur: 'TUTORIAL-SUPABASE.md',
      data: Buffer.from([
        '# Supabase untuk ' + situs.host,
        '',
        'Berkas yang sudah dipasang:',
        '- `supabase-config.js` — URL + anon key project',
        '- `supabase-client.js` — klien kecil (tanpa bundler)',
        '',
        '## Pakai di index.html',
        '```html',
        '<script src="supabase-config.js"></script>',
        '<script src="supabase-client.js"></script>',
        '<script>',
        "  SupabaseKecil.from('siswa').pilih('*').then(console.log)",
        '</script>',
        '```',
        '',
        '## Membuat tabel',
        '1. Dashboard Supabase → Table Editor → New table.',
        '2. Beri nama tabel, tambahkan kolom.',
        '3. Table Editor → RLS: aktifkan, lalu Policy `select` untuk `anon` bila data publik.',
        '',
        '## Catatan keamanan',
        '- Anon key boleh ada di browser, tapi JANGAN pakai service_role key di situs.',
        '- Aktifkan Row Level Security supaya orang tidak bisa membaca/menulis sembarangan.',
        '',
        'Project URL: ' + bersihUrl,
      ].join('\n'), 'utf8'),
    },
  ]

  const total = tulisBerkas(situs.slug, berkas)
  const registry = await bacaRegistry().catch(() => ({}))
  if (registry[situs.slug]) {
    const ringkas = ringkasBerkas(situs.slug)
    registry[situs.slug].supabase = { url: bersihUrl, dipasang: Date.now() }
    registry[situs.slug].berkas = ringkas.jumlah
    registry[situs.slug].ukuran = ringkas.ukuran
    registry[situs.slug].diperbarui = Date.now()
    await simpanRegistry(registry)
  }
  catat('supabase', { slug: situs.slug, url: bersihUrl, oleh: nomorDari(m.sender) })

  return m.reply([
    '🗄️ *SUPABASE TERPASANG*',
    '',
    `Situs  : ${situs.host}`,
    `URL    : ${bersihUrl}`,
    `Berkas : supabase-config.js, supabase-client.js, TUTORIAL-SUPABASE.md (${bita(total)})`,
    '',
    'Langkah berikutnya:',
    '1. Buka dashboard Supabase → Table Editor → New table.',
    '2. Di index.html tambahkan:',
    '   <script src="supabase-config.js"></script>',
    '   <script src="supabase-client.js"></script>',
    '3. Aktifkan RLS + policy untuk anon (data publik).',
    '',
    `Tutorial lengkap: https://${situs.host}/TUTORIAL-SUPABASE.md`,
    '_Kunci tidak ditampilkan lagi di chat._',
  ].join('\n'))
}

/* ───────────── addfile ───────────── */

async function perintahAddFile(m, conn, args, extra) {
  const nama = labelAman(args[0] || '')
  const aksi = String(args[1] || '').toLowerCase()
  const jalur = String(args[2] || '').trim()

  if (!nama || !['tambah', 'ganti', 'edit'].includes(aksi)) {
    return m.reply([
      '📝 *UBAH BERKAS SITUS*',
      '',
      'Format:',
      '`/addfile <nama> tambah` → tambah berkas baru (kirim berkasnya)',
      '`/addfile <nama> ganti`  → ganti berkas yang sudah ada',
      '`/addfile <nama> edit <jalur>` → kirim kode HTML/CSS/JS sebagai teks',
      '',
      'Contoh:',
      '`/addfile toko tambah` lalu kirim `style.css`',
      '`/addfile toko edit index.html` lalu kirim kode HTML-nya',
      '',
      `Nama situs: ${nama || 'belum diisi'}`,
    ].join('\n'))
  }

  const { situs } = await cariSitusUntuk(m, nama)
  const admin = sayaOwnerBot(m, extra)
  if (!situs) return m.reply(`Situs *${nama}* belum ada. Deploy dulu: /deploysubdomain ${nama}`)
  if (!admin && String(situs.pemilik).split('@')[0] !== nomorDari(m.sender)) {
    return m.reply(`🔒 ${situs.host} milik nomor lain.`)
  }

  pasangTunggu(m, { aksi: 'addfile', slug: situs.slug, mode: aksi, jalur })
  return m.reply([
    `📝 *${aksi.toUpperCase()} BERKAS — ${situs.host}*`,
    '',
    aksi === 'tambah' || aksi === 'ganti'
      ? 'Kirim berkasnya sekarang (satu berkas: .html/.css/.js/.json/.svg/.txt).'
      : `Kirim kode ${jalur || 'index.html'} sebagai teks di chat.`,
    aksi === 'ganti' ? 'Berkas lama dengan nama sama akan ditimpa.' : '',
    'Batalkan: /batal · berlaku 15 menit.',
  ].filter(Boolean).join('\n'))
}

/* ───────────── pemroses berkas masuk ───────────── */

async function prosesLampiran(conn, m, tunggu) {
  const caption = captionLampiran(m) || String(m.text || '')
  const ada = adaLampiran(m)

  /* Supabase: dikirim sebagai teks "url key". */
  if (tunggu.aksi === 'supabase') {
    const { situs } = await cariSitusUntuk(m, tunggu.slug)
    if (!situs) {
      hapusTunggu(m)
      return m.reply('Situs tidak ditemukan lagi.')
    }
    const bagian = String(caption).trim().split(/\s+/).filter(Boolean)
    if (bagian.length < 2) {
      return m.reply('Format: `<project-url> <anon-key>` — contoh:\nhttps://abcdefgh.supabase.co sb_publishable_abc123')
    }
    hapusTunggu(m)
    return pasangSupabase(m, situs, bagian[0], bagian[1])
  }

  /* Aksi yang menyentuh situs yang SUDAH ada (addfile) vs deploy baru.
   * Deploy memakai `label` + `akar` dari state tunggu, bukan slug, jadi tidak
   * boleh mencari situs lebih dulu — situsnya memang belum ada. */
  const pakaiSitusLama = tunggu.aksi === 'addfile'
  let situs = null
  if (pakaiSitusLama) {
    situs = (await cariSitusUntuk(m, tunggu.slug)).situs
    if (!situs) {
      hapusTunggu(m)
      return m.reply('Situs tidak ditemukan lagi.')
    }
  }

  if (tunggu.aksi === 'addfile') {
    let daftar = []
    try {
      if (ada) {
        const buffer = await unduhLampiranLokal(m, conn)
        const namaBerkas = namaBerkasLampiran(m) || 'berkas.html'
        daftar = siapkanBerkas(buffer, namaBerkas, '')
        if (tunggu.mode === 'edit' && tunggu.jalur) daftar = daftar.map((b) => ({ ...b, jalur: tunggu.jalur }))
      } else if (tunggu.mode === 'edit') {
        daftar = [{ jalur: tunggu.jalur || 'index.html', data: Buffer.from(String(caption), 'utf8') }]
      } else {
        return m.reply('Kirim berkasnya (bukan teks) untuk aksi tambah/ganti.')
      }
    } catch (error) {
      return m.reply(`❌ ${String(error?.message || error).slice(0, 160)}`)
    }
    const total = tulisBerkas(situs.slug, daftar)
    const ringkas = ringkasBerkas(situs.slug)
    const registry = await bacaRegistry().catch(() => ({}))
    if (registry[situs.slug]) {
      registry[situs.slug].berkas = ringkas.jumlah
      registry[situs.slug].ukuran = ringkas.ukuran
      registry[situs.slug].diperbarui = Date.now()
      await simpanRegistry(registry)
    }
    hapusTunggu(m)
    catat('addfile', { slug: situs.slug, berkas: daftar.map((d) => d.jalur), oleh: nomorDari(m.sender) })
    return m.reply([
      '✅ *BERKAS DIPASANG*',
      '',
      `Situs  : https://${situs.host}/`,
      `Berkas : ${daftar.map((d) => d.jalur).join(', ')}`,
      `Ukuran : ${bita(total)}`,
      `Total  : ${ringkas.jumlah} berkas · ${bita(ringkas.ukuran)}`,
    ].join('\n'))
  }

  /* deploy-sub / deploy-domain */
  let daftar = []
  try {
    if (ada) {
      const buffer = await unduhLampiranLokal(m, conn)
      daftar = siapkanBerkas(buffer, namaBerkasLampiran(m), '')
    } else {
      daftar = siapkanBerkas(null, '', String(caption))
    }
  } catch (error) {
    return m.reply(`❌ ${String(error?.message || error).slice(0, 200)}`)
  }

  const host = tunggu.aksi === 'deploy-domain' ? hostDomain(tunggu.label, tunggu.akar) : hostSubdomain(tunggu.label, tunggu.akar)
  const slug = slugSitus(tunggu.label, tunggu.akar)
  const registry = await bacaRegistry().catch(() => ({}))

  const bentrok = Object.entries(registry).find(([lainSlug, info]) =>
    lainSlug !== slug && String((info && info.domainKustom) || '').toLowerCase() === host.toLowerCase())
  if (bentrok) {
    hapusTunggu(m)
    return m.reply(`❌ Alamat ${host} sudah dipakai situs lain (${bentrok[0]}).`)
  }

  const total = tulisBerkas(slug, daftar)
  const lama = registry[slug] || {}
  const ringkas = ringkasBerkas(slug)
  registry[slug] = {
    ...lama,
    pemilik: lama.pemilik || String(m.sender || ''),
    judul: lama.judul || String(m.pushName || tunggu.label).slice(0, 40),
    akarDomain: tunggu.akar,
    label: tunggu.label,
    domainKustom: host,
    domainAlias: Array.isArray(lama.domainAlias) ? lama.domainAlias : [],
    dibuat: lama.dibuat || Date.now(),
    diperbarui: Date.now(),
    berkas: ringkas.jumlah,
    ukuran: ringkas.ukuran,
    status: 'aktif',
    deployKe: Number(lama.deployKe || 0) + 1,
    mode: tunggu.aksi === 'deploy-domain' ? 'domain' : 'subdomain',
  }
  await simpanRegistry(registry)
  hapusTunggu(m)
  catat('deploy', { slug, host, berkas: daftar.length, oleh: nomorDari(m.sender) })

  return m.reply([
    '✅ *DEPLOY BERHASIL*',
    '',
    `🌐 https://${host}/`,
    `📦 ${daftar.length} berkas · ${bita(total)}`,
    `🔁 Deploy ke-${registry[slug].deployKe}`,
    '',
    'Alamat langsung aktif (DNS memakai record `*`).',
    `🛠️ Kontrol : /kontrolsubdomain ${tunggu.label}`,
    `📝 Ubah isi: /addfile ${tunggu.label} edit index.html`,
  ].join('\n'))
}

/** Unduh lampiran dari pesan WhatsApp memakai jalur aman bot. */
async function unduhLampiranLokal(m, conn) {
  const { unduhLampiran } = await import('../../lib/lampiran.js')
  return unduhLampiran(conn, m)
}

/* ───────────── handler ───────────── */

const COMMAND = /^(subdomainmenu|subdomain|domain|deploysubdomain|deploydomain|kontrolsubdomain|kontrol-?domain|addsupabase|addfile)$/i

let handler = async function (m, extra = {}) {
  const conn = extra.conn || this
  const teks = String(m.text || extra.text || '').trim()
  const mentah = teks.replace(/^[^\w/]+/, '').replace(/^\//, '')
  const bagian = mentah.split(/\s+/).filter(Boolean)
  const perintah = String(bagian.shift() || extra.command || '').toLowerCase()
  const args = bagian

  if (perintah === 'subdomainmenu') return perintahMenu(m, conn)
  if (perintah === 'subdomain') return perintahSubdomain(m, conn)
  if (perintah === 'domain') return perintahDomain(m, conn)
  if (perintah === 'deploysubdomain') return perintahDeploySubdomain(m, conn, args)
  if (perintah === 'deploydomain') return perintahDeployDomain(m, conn, args, extra)
  if (perintah === 'addsupabase') return perintahAddSupabase(m, conn, args, extra)
  if (perintah === 'addfile') return perintahAddFile(m, conn, args, extra)
  if (/^kontrol-?domain$/i.test(perintah)) return perintahKontrolDomain(m, conn, args, extra)
  if (perintah === 'kontrolsubdomain') {
    /* /kontrolsubdomain <nama> <aksi> → aksi; tanpa aksi → panel */
    if (args.length >= 2) return aksiKontrolSubdomain(m, conn, args, extra)
    return perintahKontrolSubdomain(m, conn, args, extra)
  }
  return null
}

handler.command = COMMAND
handler.help = [
  'subdomainmenu',
  'subdomain',
  'domain',
  'deploysubdomain [nama] [domain] [ganti]',
  'deploydomain [nama] [domain] [ganti]',
  'kontrolsubdomain [nama]',
  'kontroldomain [domain] [public|private|awalan|tanpaawalan]',
  'addsupabase [nama]',
  'addfile [nama] [tambah|ganti|edit] [jalur]',
]
handler.tags = ['owner', 'subdomain']
handler.category = 'owner'
handler.description = 'Subdomain & domain: status, deploy, kontrol, supabase, ubah berkas (Task173g)'
handler.limit = false
handler.group = false
handler.private = false

/* Jalur lampiran: dipanggil handler.js SEBELUM gerbang prefix chat pribadi. */
daftarkanAksi('subdomain-baru', (m) => {
  const tunggu = ambilTunggu(m)
  if (!tunggu) return null
  if (tunggu.aksi === 'supabase') {
    const teks = String(captionLampiran(m) || m.text || '')
    if (!/supabase\.co\s+\S{20,}/i.test(teks)) return null
    return { jalankan: (msg) => prosesLampiran(this, msg || m, tunggu) }
  }
  if (!adaLampiran(m) && !/^\s*<[a-z!/]/i.test(String(m.text || ''))) return null
  return { jalankan: (msg) => prosesLampiran(this, msg || m, tunggu) }
})

handler.all = async function (m) {
  const tunggu = ambilTunggu(m)
  if (!tunggu) return
  if (tunggu.aksi === 'supabase') {
    const teks = String(captionLampiran(m) || m.text || '')
    if (!/supabase\.co\s+\S{20,}/i.test(teks)) return
    return prosesLampiran(this, m, tunggu)
  }
  if (!adaLampiran(m) && !/^\s*<[a-z!/]/i.test(String(m.text || ''))) return
  return prosesLampiran(this, m, tunggu)
}

export { AKAR_BAWAAN, AWALAN_SUB, hostSubdomain, hostDomain, slugSitus, labelAman, daftarAkar }
export default handler
