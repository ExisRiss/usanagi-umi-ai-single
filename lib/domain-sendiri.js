/* By AlzRiss - Usanagi Umi AI
 *
 * Task156 — domain sendiri untuk pengguna (bukan cuma nama di domain bot).
 *
 * Yang dikerjakan modul ini:
 *   1. `domainAkar()`   — cari domain akar (kaeira.my.id dari blog.kaeira.my.id)
 *   2. `kelolaZona()`   — cek/buat zona Cloudflare untuk domain user otomatis
 *   3. `cekDns()`       — periksa CNAME/A/NS + apakah situs benar-benar hidup
 *   4. `panduanDomain()`— teks arahan langkah demi langkah (per penyedia DNS)
 *   5. `pasangCname()`  — tulis CNAME ke tunnel di zona milik user
 *
 * Kenapa perlu zona: `cfargotunnel.com` hanya meneruskan lalu lintas untuk
 * DNS record di akun Cloudflare yang sama (dokumentasi Cloudflare One, DNS
 * records). Jadi domain user tidak bisa sekadar di-CNAME ke tunnel bot —
 * domainnya harus "dititipkan" ke akun Cloudflare bot (cukup ganti
 * nameserver di registrar), setelah itu bot yang mengurus DNS + SSL.
 * Kalau token Cloudflare bot belum punya izin membuat zona, modul ini
 * melaporkan `bolehBuat: false` dan bot memberi arahan manual ke owner.
 */

import https from 'https'
import dns from 'dns'

import { bacaKonfig, hostUtama, bacaRegistry, simpanRegistry } from './subdomain-kaira.js'

/* ── util dasar ────────────────────────────────────────────────────────── */

const AKHIRAN_DUA = [
  'co.id', 'my.id', 'web.id', 'biz.id', 'or.id', 'ac.id', 'sch.id', 'go.id', 'mil.id',
  'net.id', 'desa.id', 'ponpes.id', 'id', 'co.uk', 'org.uk', 'ac.uk', 'me.uk', 'com.au',
  'net.au', 'org.au', 'co.nz', 'com.br', 'co.in', 'com.my', 'com.sg', 'co.za', 'com.tr',
  'com.mx', 'com.ph', 'co.th', 'com.vn', 'com.hk', 'com.tw', 'co.kr', 'com.cn',
]

/** Domain akar dari sebuah host: blog.kaeira.my.id → kaeira.my.id */
export function domainAkar(host) {
  const bersih = String(host || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '').trim()
  const bagian = bersih.split('.').filter(Boolean)
  if (bagian.length <= 2) return bersih
  const duaTerakhir = bagian.slice(-2).join('.')
  if (AKHIRAN_DUA.includes(duaTerakhir)) return bagian.slice(-3).join('.')
  return duaTerakhir
}

/** Domain bot (mis. alzriss.gwenna.my.id). */
export function domainBot() {
  return String(hostUtama('contoh')).replace(/^contoh-/, '')
}

/** Nama folder situs untuk sebuah domain (kaeira.my.id → kaeira-my-id). */
export function namaFolderDomain(host) {
  return String(host || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

/* ── Cloudflare API ────────────────────────────────────────────────────── */

function cf(path, method = 'GET', body = null) {
  const cfg = bacaKonfig() || {}
  if (!cfg.cfToken) return Promise.reject(new Error('Token Cloudflare belum diatur di data/subdomain-kaira.json'))
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
        try { isi = JSON.parse(Buffer.concat(potongan).toString('utf8')) } catch (error) { }
        if (res.statusCode >= 200 && res.statusCode < 300 && isi.success !== false) return selesai(isi)
        const galat = (isi.errors && isi.errors[0]) || {}
        const error = new Error(`Cloudflare: ${galat.message || 'HTTP ' + res.statusCode}`)
        error.kode = galat.code || 0
        error.status = res.statusCode
        gagal(error)
      })
    })
    req.on('timeout', () => req.destroy(new Error('Cloudflare tidak merespons.')))
    req.on('error', gagal)
    if (data) req.write(data)
    req.end()
  })
}

/** Zona Cloudflare yang sudah ada & bisa dikelola token bot. */
export async function cariZona(domain) {
  const akar = domainAkar(domain)
  if (!akar) return null
  try {
    const hasil = await cf(`/zones?name=${encodeURIComponent(akar)}`)
    const zona = (hasil.result || []).find((z) => String(z.name).toLowerCase() === akar)
    if (!zona) return null
    return {
      zonaId: zona.id,
      nama: zona.name,
      akun: zona.account && zona.account.name,
      ns: zona.name_servers || [],
      status: zona.status,
      akar,
    }
  } catch (error) {
    return null
  }
}

/**
 * Pastikan zona domain user ada di akun Cloudflare bot.
 *
 * @returns {{ bisa: boolean, dibuat?: boolean, zonaId?: string, ns?: string[], akar?: string, alasan?: string }}
 */
export async function kelolaZona(domain) {
  const akar = domainAkar(domain)
  if (!akar) return { bisa: false, alasan: 'Domain tidak valid.' }

  const ada = await cariZona(akar)
  if (ada) return { bisa: true, sudahAda: true, ...ada }

  const cfg = bacaKonfig() || {}
  if (!cfg.cfToken) return { bisa: false, akar, alasan: 'Token Cloudflare bot belum diatur.' }

  /* Butuh accountId — diambil dari zona utama bot bila tidak ada di konfigurasi. */
  let accountId = String(cfg.cfAccount || '')
  if (!accountId && cfg.cfZone) {
    try {
      const z = await cf(`/zones/${cfg.cfZone}`)
      accountId = (z.result && z.result.account && z.result.account.id) || ''
    } catch (error) { }
  }
  if (!accountId) return { bisa: false, akar, alasan: 'Account ID Cloudflare tidak diketahui.' }

  try {
    const hasil = await cf('/zones', 'POST', {
      name: akar,
      account: { id: accountId },
      jump_start: false,
      type: 'full',
    })
    const zona = hasil.result || {}
    return {
      bisa: true,
      dibuat: true,
      zonaId: zona.id,
      ns: zona.name_servers || [],
      akar,
      status: zona.status,
    }
  } catch (error) {
    return {
      bisa: false,
      akar,
      alasan: error.message,
      bolehBuat: !/permission|zone.create/i.test(String(error.message)),
      perluOwner: true,
    }
  }
}

/** CNAME `<hostname>` → tunnel bot, ditulis di zona tertentu. */
export async function pasangCname(hostname, zonaId) {
  const cfg = bacaKonfig() || {}
  if (!cfg.tunnelId) throw new Error('tunnelId belum diatur di data/subdomain-kaira.json')
  if (!zonaId) throw new Error('Zona Cloudflare untuk domain ini belum ada.')
  const target = `${cfg.tunnelId}.cfargotunnel.com`
  const cari = await cf(`/zones/${zonaId}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`)
  const ada = (cari.result || []).find((x) => x.name === hostname)
  if (ada) {
    if (ada.content === target && ada.proxied) return { sudahAda: true, id: ada.id }
    await cf(`/zones/${zonaId}/dns_records/${ada.id}`, 'PATCH', { content: target, proxied: true })
    return { diperbarui: true, id: ada.id }
  }
  const buat = await cf(`/zones/${zonaId}/dns_records`, 'POST', {
    type: 'CNAME',
    name: hostname,
    content: target,
    proxied: true,
    ttl: 1,
    comment: 'Task156 domain sendiri',
  })
  return { dibuat: true, id: buat.result && buat.result.id }
}

/* ── pemeriksaan DNS & situs ───────────────────────────────────────────── */

function resolveAman(fn, ...arg) {
  return new Promise((selesai) => {
    let selesai2 = false
    const akhiri = (nilai) => { if (!selesai2) { selesai2 = true; selesai(nilai) } }
    try {
      fn(...arg, (error, hasil) => akhiri(error ? [] : hasil))
    } catch (error) {
      akhiri([])
    }
  })
}

/** Ambil isi HTTP(S) sebuah host (untuk memastikan situs benar-benar dilayani bot). */
function ambilHalaman(host, jalur = '/', batasMs = 9000) {
  return new Promise((selesai) => {
    let selesai2 = false
    const akhiri = (nilai) => { if (!selesai2) { selesai2 = true; selesai(nilai) } }
    let req
    try {
      req = https.request({
        hostname: host,
        port: 443,
        path: jalur,
        method: 'GET',
        timeout: batasMs,
        headers: { 'User-Agent': 'UMI-CekDomain/1.0', Host: host },
      }, (res) => {
        const potongan = []
        res.on('data', (c) => { if (potongan.length < 40) potongan.push(c) })
        res.on('end', () => akhiri({
          status: res.statusCode || 0,
          header: res.headers || {},
          awal: Buffer.concat(potongan).toString('utf8').slice(0, 400),
        }))
      })
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.on('error', (error) => akhiri({ status: 0, galat: error.code || error.message, header: {} }))
      req.end()
    } catch (error) {
      akhiri({ status: 0, galat: error.message, header: {} })
    }
  })
}

/**
 * Periksa DNS sebuah domain user + status situsnya.
 *
 * @returns {Promise<{domain, cname, a, ns, pakaiCloudflare, target, cnameCocok,
 *   botMelayani, hidup, status, saran}>}
 */
export async function cekDns(domain) {
  const host = String(domain || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '').trim()
  const target = String((bacaKonfig() || {}).cnameKustom || 'situs.gwenna.my.id').toLowerCase()
  const akar = domainAkar(host)
  const [cname, a, ns] = await Promise.all([
    resolveAman(dns.resolveCname, host),
    resolveAman(dns.resolve4, host),
    resolveAman(dns.resolveNs, akar),
  ])
  const nsBersih = ns.map((x) => String(x).toLowerCase().replace(/\.$/, ''))
  const pakaiCloudflare = nsBersih.some((x) => x.endsWith('.ns.cloudflare.com'))
  const cnameBersih = cname.map((x) => String(x).toLowerCase().replace(/\.$/, ''))
  const cnameCocok = cnameBersih.some((x) => x === target || x.endsWith('.cfargotunnel.com'))

  const halaman = await ambilHalaman(host).catch(() => ({ status: 0, header: {} }))
  const botMelayani = String((halaman.header && halaman.header['x-umi-situs']) || '') !== ''

  const hidup = halaman.status >= 200 && halaman.status < 400 && botMelayani
  let status = 'belum'
  if (hidup) status = 'hidup'
  else if (botMelayani) status = 'tersambung-kosong'
  else if (halaman.status >= 200 && halaman.status < 400) status = 'hidup-lain'
  else if (cnameCocok || pakaiCloudflare) status = 'dns-sebagian'

  const saran = []
  if (hidup) {
    saran.push('Situs sudah dilayani bot ini.')
  } else if (botMelayani) {
    saran.push('Domain sudah tersambung ke bot, hanya halamannya belum diisi — pakai .deploysubdomain <nama> ganti.')
  } else if (!nsBersih.length) {
    saran.push('Domain belum punya NS publik — pastikan domain aktif di registrar.')
  } else if (!pakaiCloudflare) {
    saran.push('Nameserver domain bukan Cloudflare. Untuk dititipkan ke bot, ganti NS ke pasangan dari owner bot (lihat panduan).')
  } else if (!botMelayani && halaman.status === 0) {
    saran.push('NS sudah Cloudflare tetapi belum mengarah ke bot — zona belum ditambahkan ke akun bot / DNS belum dibuat.')
  } else if (!botMelayani) {
    saran.push('Domain merespons tetapi bukan dari bot (header X-Umi-Situs tidak ada).')
  }

  return {
    domain: host,
    akar,
    target,
    cname: cnameBersih,
    a,
    ns: nsBersih,
    pakaiCloudflare,
    cnameCocok,
    statusHttp: halaman.status,
    botMelayani,
    hidup,
    status,
    saran,
  }
}

/* ── arahan untuk user ─────────────────────────────────────────────────── */

/**
 * Teks arahan lengkap untuk menyambungkan domain milik user.
 *
 * @param {string} domain
 * @param {{ ns?: string[], zonaDibuat?: boolean, bolehBuat?: boolean, target?: string }} opsi
 */
export function panduanDomain(domain, opsi = {}) {
  const host = String(domain || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  const akar = domainAkar(host)
  const ns = Array.isArray(opsi.ns) ? opsi.ns : []
  const target = opsi.target || String((bacaKonfig() || {}).cnameKustom || 'situs.gwenna.my.id')
  const baris = []

  baris.push('*CARA MENYAMBUNGKAN DOMAIN SENDIRI*')
  baris.push(`Domain: ${host}`)
  baris.push(`Domain akar: ${akar}`)
  baris.push('')

  baris.push('⚠️ *Baca dulu:* ganti nameserver memindahkan SELURUH DNS')
  baris.push('domainmu ke Cloudflare bot. Kalau domain itu sudah dipakai')
  baris.push('email atau website lain, jangan diganti — pakai alamat bot saja')
  baris.push('(situsnya sama persis, tanpa mengubah DNS).')
  baris.push('')
  baris.push('*Kenapa tidak cukup CNAME saja?*')
  baris.push('Tunnel Cloudflare hanya meneruskan lalu lintas untuk DNS record')
  baris.push('di akun Cloudflare yang sama. Jadi domainmu harus dititipkan')
  baris.push('ke akun Cloudflare bot — cukup ganti nameserver (NS), sekali saja.')
  baris.push('Setelah itu bot yang membuat DNS + sertifikat SSL-nya.')
  baris.push('')

  if (ns.length) {
    baris.push('*LANGKAH 1 — Ganti nameserver di registrar*')
    baris.push('Masuk ke pengaturan DNS domainmu, pilih "ganti nameserver",')
    baris.push('lalu isi dua baris ini (hapus NS lama):')
    for (const n of ns) baris.push(`   • ${n}`)
    baris.push('')
    baris.push('Kalau NS-nya belum ada di daftar, pilih "saya punya NS sendiri"')
    baris.push('(custom nameservers), lalu tempel dua nama di atas.')
    baris.push('')
  } else {
    baris.push('*LANGKAH 1 — Titipkan domain ke owner bot*')
    baris.push('Owner bot perlu menambahkan domainmu ke akun Cloudflare bot')
    baris.push('(dashboard Cloudflare → Add a site → masukkan domain akar),')
    baris.push('lalu bot mengirimkan dua nameserver. Kamu tinggal memakai')
    baris.push('alamat bot di bawah sementara ini.')
    baris.push('')
  }

  baris.push('*LANGKAH 2 — Isi situsnya*')
  baris.push(`   .deploysubdomain ${host} ganti`)
  baris.push('   lalu balas berkas .html atau .zip (wajib ada index.html).')
  baris.push('')

  baris.push('*LANGKAH 3 — Cek status*')
  baris.push(`   .cekdns ${host}`)
  baris.push('Bot memeriksa NS, CNAME, dan apakah halamannya benar-benar')
  baris.push('dilayani bot. Ulangi 1–24 jam setelah ganti NS (propagasi).')
  baris.push('')

  baris.push('*Panduan per penyedia*')
  baris.push('• Cloudflare  → dashboard → DNS → Nameservers → Change')
  baris.push('  (kalau domainmu sudah di Cloudflare, cukup tambahkan')
  baris.push('  record CNAME ke ' + target + ' — tapi zona harus di akun bot)')
  baris.push('• Niagahoster → Domain → Kelola → Nameserver → Ubah Nameserver')
  baris.push('• Hostinger   → Domains → DNS / Nameservers → Change nameservers')
  baris.push('• Namecheap   → Domain List → Manage → Nameservers → Custom DNS')
  baris.push('• Domainesia  → Domain → Nameserver → Ganti Nameserver')
  baris.push('• Rumahweb    → Domain → Kelola DNS → Nameserver')
  baris.push('• GoDaddy     → My Domains → DNS → Nameservers → Change')
  baris.push('• Cloud.id / Volty / lainnya → cari menu "Nameserver" atau')
  baris.push('  "Custom DNS" di panel domainnya')
  baris.push('')

  baris.push('*Kalau tidak mau ribet NS*')
  baris.push(`Pakai alamat bot saja: https://${(host || 'namamu').replace(/[^a-z0-9]+/g, '-')}-${domainBot()}/`)
  baris.push('Semua isi situsnya sama persis, tanpa perlu mengubah DNS.')

  return baris.join('\n')
}
