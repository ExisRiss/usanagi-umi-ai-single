/* By AlzRiss - Usanagi Umi AI
 *
 * Task173 — unduhan media yang tahan jaringan jelek.
 *
 * MASALAH (laporan owner 29-10, `.s` di grup):
 *   [TypeError: fetch failed] { [cause]: ConnectTimeoutError ... }
 *   attempted addresses: 57.144.25.32:443, 2a03:2880:f30a:120:face:b00c:0:167:443
 *   timeout 10000ms
 *
 * Itu `fetch` bawaan Node (undici) yang dipakai Baileys untuk mengambil media
 * dari CDN WhatsApp (mmg.whatsapp.net, IP Facebook). Dua penyebab khas:
 *   1. Node mencoba alamat IPv6 lebih dulu (2a03:2880:…), rutenya tidak jalan
 *      di panel → menunggu sampai timeout 10 detik lalu gagal, tanpa mencoba
 *      IPv4.
 *   2. Batas 10 detik terlalu pendek untuk media video/stiker besar.
 *
 * SOLUSI:
 *   - Bungkus `globalThis.fetch`: percobaan pertama tetap fetch bawaan; kalau
 *     gagal karena jaringan (fetch failed / timeout), ulangi dengan klien
 *     HTTPS sendiri yang MEMAKSA IPv4 (`family: 4`), timeout 30 detik, dan
 *     sampai 3 percobaan dengan jeda.
 *   - Hasil fallback berbentuk sama seperti Response: `ok`, `status`,
 *     `headers`, `body` (async iterable berisi Buffer), `arrayBuffer()`,
 *     `text()`, `json()` — jadi `downloadContentFromMessage` Baileys tetap
 *     bisa membaca `response.body`.
 *   - Body non-string (stream/FormData) tidak diulang supaya tidak rusak.
 *
 * Dipasang sekali di main.js (`pasangFetchAman()`), idempoten.
 */

import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import zlib from 'node:zlib'
import { URL } from 'node:url'

const PENANDA = path.join(process.cwd(), 'data', 'jaringan-aman.json')

const BATAS_MS = 30000
const PERCOBAAN = 3
const JEDA_MS = 600
let suksesFallback = 0

function perluFallback(error) {
  const pesan = String((error && (error.cause?.code || error.code || error.message)) || '').toLowerCase()
  return [
    'fetch failed', 'connect timeout', 'und_err_connect_timeout', 'und_err_headers_timeout',
    'und_err_body_timeout', 'etimedout', 'econnreset', 'eai_again', 'enotfound', 'econnrefused',
    'socket hang up', 'network',
  ].some((x) => pesan.includes(x))
}

function headerObj(header) {
  const hasil = {}
  for (const [k, v] of Object.entries(header || {})) {
    hasil[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v)
  }
  return hasil
}

/**
 * Permintaan HTTP/HTTPS langsung dengan IPv4 dipaksa.
 * @returns {Promise<{ok:boolean,status:number,headers:object,body:any,arrayBuffer:Function,text:Function,json:Function,url:string}>}
 */
export function ambilAman(url, opsi = {}) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    batasMs = BATAS_MS,
    family = 4,
    redirect = 3,
  } = opsi

  return new Promise((selesai, gagal) => {
    let alamat
    try {
      alamat = new URL(String(url))
    } catch (error) {
      gagal(new Error(`URL tidak valid: ${url}`))
      return
    }
    const pustaka = alamat.protocol === 'http:' ? http : https
    const permintaan = pustaka.request({
      hostname: alamat.hostname,
      port: alamat.port || (alamat.protocol === 'http:' ? 80 : 443),
      path: `${alamat.pathname || '/'}${alamat.search || ''}`,
      method,
      family,
      timeout: batasMs,
      headers: {
        accept: '*/*',
        'accept-encoding': 'gzip, deflate, br',
        'user-agent': 'UMI-UmiUsanagi/1.0 (+https://jadibot-alzriss.gwenna.my.id)',
        ...headerObj(headers),
      },
    }, (res) => {
      const status = res.statusCode || 0
      /* Ikuti pengalihan (CDN WhatsApp kadang 302 ke host lain). */
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirect > 0) {
        res.resume()
        const tujuan = new URL(res.headers.location, alamat).toString()
        ambilAman(tujuan, { ...opsi, method: status === 303 ? 'GET' : method, redirect: redirect - 1 })
          .then(selesai, gagal)
        return
      }

      let aliran = res
      const encoding = String(res.headers['content-encoding'] || '').toLowerCase()
      if (encoding === 'gzip') aliran = res.pipe(zlib.createGunzip())
      else if (encoding === 'deflate') aliran = res.pipe(zlib.createInflate())
      else if (encoding === 'br' && zlib.createBrotliDecompress) aliran = res.pipe(zlib.createBrotliDecompress())

      const kumpul = async () => {
        const potongan = []
        for await (const bagian of aliran) potongan.push(Buffer.isBuffer(bagian) ? bagian : Buffer.from(bagian))
        return Buffer.concat(potongan)
      }

      selesai({
        ok: status >= 200 && status < 300,
        status,
        statusText: res.statusMessage || '',
        url: alamat.toString(),
        headers: headerObj(res.headers),
        body: aliran,
        arrayBuffer: async () => {
          const buf = await kumpul()
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        },
        text: async () => (await kumpul()).toString('utf8'),
        json: async () => JSON.parse((await kumpul()).toString('utf8')),
      })
    })
    permintaan.on('timeout', () => permintaan.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })))
    permintaan.on('error', gagal)
    if (body) permintaan.write(body)
    permintaan.end()
  })
}

/** fetch dengan fallback IPv4 + ulangan. */
export async function fetchAman(input, init = {}) {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input)
  const bawaan = globalThis.__umiFetchAsli
  const bolehUlang = !init.body || typeof init.body === 'string' || Buffer.isBuffer(init.body) || init.body instanceof Uint8Array
  const batas = Number(init.__batasMs || BATAS_MS)

  if (bawaan) {
    /* Caller (mis. Baileys) boleh menyebut dispatcher sendiri; kalau tidak,
     * pakai dispatcher aman kita supaya tidak kena connect timeout 10 s. */
    let percobaan = init
    if (!init.dispatcher && globalThis.__umiUndiciDispatcher) {
      percobaan = { ...init, dispatcher: globalThis.__umiUndiciDispatcher }
    }
    try {
      return await bawaan(input, percobaan)
    } catch (error) {
      if (!perluFallback(error) || !bolehUlang) throw error
      console.warn(`[JARINGAN] fetch bawaan gagal (${error.cause?.code || error.message}) → coba IPv4`)
    }
  }

  let galatTerakhir = null
  for (let i = 0; i < PERCOBAAN; i++) {
    try {
      const hasil = await ambilAman(url, {
        method: init.method || 'GET',
        headers: init.headers,
        body: init.body,
        batasMs: batas + i * 5000,
      })
      if (i === 0 && suksesFallback < 10) {
        suksesFallback += 1
        console.log(`[JARINGAN] fallback IPv4 sukses: ${String(new URL(url).host).slice(0, 40)}`)
      }
      if (hasil.status >= 500 && i + 1 < PERCOBAAN) {
        galatTerakhir = new Error(`HTTP ${hasil.status}`)
        await new Promise((r) => setTimeout(r, JEDA_MS * (i + 1)))
        continue
      }
      return hasil
    } catch (error) {
      galatTerakhir = error
      await new Promise((r) => setTimeout(r, JEDA_MS * (i + 1)))
    }
  }
  throw galatTerakhir || new Error('fetch gagal')
}

let dispatcherPasang = null

/**
 * Task173b — pasang dispatcher undici sendiri sebagai dispatcher global.
 *
 * Dispatcher bawaan Node memakai connect timeout 10 detik dan mencoba IPv6
 * lebih dulu; di panel ini IPv6 ke CDN WhatsApp (2a03:2880:…) tidak jalan,
 * jadi setiap unduhan media kehilangan 10 detik lalu gagal. Dispatcher ini
 * memberi 30 detik dan memindahkan percobaan ke IPv4 setelah 250 ms.
 */
async function pasangDispatcher() {
  try {
    const u = await import('undici')
    if (!u?.Agent || !u?.setGlobalDispatcher) return null
    const agen = new u.Agent({
      connect: { timeout: BATAS_MS, autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 250 },
      headersTimeout: 60000,
      bodyTimeout: 180000,
      keepAliveTimeout: 30000,
    })
    const lama = typeof u.getGlobalDispatcher === 'function' ? u.getGlobalDispatcher() : null
    u.setGlobalDispatcher(agen)
    dispatcherPasang = agen
    globalThis.__umiUndiciDispatcher = agen
    console.log('[JARINGAN] dispatcher undici: connect 30 s, pindah ke IPv4 setelah 250 ms')
    tulisPenanda(true)
    /* Dispatcher lama tidak di-destroy: masih dipakai request yang berjalan. */
    if (lama && typeof lama.close === 'function') setTimeout(() => { Promise.resolve(lama.close()).catch(() => {}) }, 60000).unref?.()
    return agen
  } catch (error) {
    console.log('[JARINGAN] dispatcher undici tidak dipasang:', String(error?.message || error).slice(0, 90))
    tulisPenanda(false)
    return null
  }
}

/**
 * Jejak versi: berkas kecil di `data/jaringan-aman.json` yang ditulis setiap
 * boot. Dipakai untuk memastikan kode yang jalan memang versi terbaru —
 * tanpa perlu memburu baris log di konsol panel.
 */
function tulisPenanda(dispatcher) {
  try {
    const isi = {
      versi: '173b',
      waktu: new Date().toISOString(),
      node: process.version,
      dispatcherUndici: Boolean(dispatcher),
      ipv4Fallback: true,
      batasMs: BATAS_MS,
      percobaan: PERCOBAAN,
    }
    fs.mkdirSync(path.dirname(PENANDA), { recursive: true })
    fs.writeFileSync(PENANDA, JSON.stringify(isi, null, 2))
  } catch { /* tidak boleh menggagalkan boot */ }
}

let terpasang = false

/** Pasang sekali; aman dipanggil berkali-kali. */
export function pasangFetchAman() {
  if (terpasang) return { terpasang: true }
  if (typeof globalThis.fetch !== 'function') return { terpasang: false, alasan: 'fetch tidak ada' }
  globalThis.__umiFetchAsli = globalThis.__umiFetchAsli || globalThis.fetch
  globalThis.fetch = (input, init) => fetchAman(input, init || {})
  /* Pembantu untuk plugin: `await globalThis.umiAmbil(url)` */
  globalThis.umiAmbil = (url, opsi) => ambilAman(url, opsi || {})
  terpasang = true
  console.log('[JARINGAN] fetch aman aktif (IPv4 dipaksa bila perlu, timeout 30 s, 3 percobaan)')
  pasangDispatcher()
  return { terpasang: true }
}

export default pasangFetchAman
