/* By AlzRiss - Usanagi Umi AI
 *
 * PENDUKUNG TIGA JENIS PLUGIN (Task130)
 *
 * Owner minta bot bisa menerima plugin dari bot lain yang formatnya berbeda.
 * Di dunia bot WhatsApp Indonesia ada tiga bentuk yang paling sering dipakai:
 *
 *   1. PLUGIN  — bentuk asli Umi (ini yang selama ini didukung):
 *        const handler = async (m, { conn, args }) => { … }
 *        handler.command = /^ping$/i
 *        export default handler
 *
 *   2. CASE    — potongan `switch` dari bot lama, sering berbentuk file utuh:
 *        case 'ping': {
 *          m.reply('pong')
 *          break
 *        }
 *      File seperti ini BUKAN modul sah (tidak ada export), jadi loader lama
 *      melewatinya dengan pesan "syntax error". Sekarang dibungkus otomatis
 *      menjadi handler yang sah.
 *
 *   3. SCRAPPER — modul pengambil data, biasanya `lib/scraper/*.js`:
 *        export async function tiktok(url) { … }
 *        module.exports = { tiktok }
 *      Tidak punya `handler.command`, jadi tidak pernah muncul di menu.
 *      Sekarang bisa dipanggil lewat `.scraper <nama> <argumen>` dan
 *      didaftarkan otomatis.
 *
 * Berkas ini TIDAK mengubah plugin yang sudah jalan. Ia hanya menambah jalan
 * cadangan ketika bentuk 1 gagal dimuat.
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/* ============================================================
 * DETEKSI FORMAT
 * ============================================================ */

/** Buang komentar & isi string supaya deteksi tidak tertipu teks di dalamnya. */
export function bersihkanKode(source) {
  return String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
    .replace(/'(?:\\[\s\S]|[^'\\])*'/g, "''")
    .replace(/"(?:\\[\s\S]|[^"\\])*"/g, '""')
}

/**
 * Tebak jenis sebuah berkas plugin.
 * @param {string} source isi berkas
 * @param {string} [nama] nama berkas (untuk petunjuk tambahan)
 * @returns {'plugin'|'case'|'scraper'|'cjs'|'tidak-dikenal'}
 */
export function deteksiFormat(source, nama = '') {
  const asli = String(source || '')
  const kode = bersihkanKode(asli)
  if (!kode.trim()) return 'tidak-dikenal'

  const adaExportDefault = /export\s+default\s+/.test(kode)
  const adaHandlerCommand = /handler\s*\.\s*command\s*=/.test(kode)
  const adaModuleExports = /(^|\n)\s*(module\.exports|exports\.[A-Za-z_$][\w$]*\s*=)/.test(kode)
  const adaCase = /(^|\n)\s*case\s+['"`]/.test(kode) || /\bcase\s+['"`][a-z0-9_-]+['"`]\s*:/.test(kode)

  // Bentuk 1: plugin Umi yang sah (ESM).
  if (adaExportDefault) return 'plugin'

  // Bentuk CJS: module.exports / exports.x — WAJIB diubah dulu, karena
  // `module` tidak ada di ESM. Dicek sebelum aturan lain supaya plugin gaya
  // lama (yang juga punya handler.command) tidak dicoba diimpor apa adanya.
  if (adaModuleExports) return 'cjs'

  // Bentuk 2: potongan switch-case.
  if (adaCase) return 'case'

  // Bentuk 3: modul scraper — fungsi tanpa handler.command, atau di folder scraper.
  const polaScraper = /(export\s+(async\s+)?function\s+\w+|export\s+const\s+\w+\s*=\s*(async\s*)?\()/
  if (polaScraper.test(kode) && !adaHandlerCommand) return 'scraper'
  if (/scraper|scrape/i.test(String(nama)) && !adaHandlerCommand) return 'scraper'

  // File yang hanya berisi `const handler = …` tanpa export (gaya bot lama).
  if (/const\s+handler\s*=/.test(kode) && adaHandlerCommand) return 'cjs'

  return 'tidak-dikenal'
}

/* ============================================================
 * BENTUK 1 (plugin) — tidak diubah, hanya diambil handler-nya
 * ============================================================ */

function handlerSah(mod) {
  const kandidat = [mod?.default, mod?.handler, mod]
  for (const item of kandidat) {
    if (typeof item === 'function' && (item.command || item.help)) return item
  }
  // Kadang plugin mengekspor objek { handler, command }
  if (mod && typeof mod === 'object' && typeof mod.handler === 'function') {
    const h = mod.handler
    if (!h.command && mod.command) h.command = mod.command
    if (!h.help && mod.help) h.help = mod.help
    if (h.command || h.help) return h
  }
  return null
}

/* ============================================================
 * BENTUK 2 (case) — ubah potongan switch menjadi handler
 * ============================================================ */

const POLA_CASE = /\bcase\s+['"`]([^'"`]+)['"`]\s*:/g

/**
 * Ambil semua nama perintah dari potongan case.
 * @returns {string[]}
 */
export function namaCase(source) {
  /* PENTING: jangan pakai `bersihkanKode` di sini — fungsi itu membuang isi
   * string, padahal nama perintah justru ADA di dalam string (`case 'halo':`).
   * Cukup buang komentarnya saja. */
  const kode = String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  const hasil = []
  let cocok
  // `case 'a':` diikuti `case 'b':` tanpa body juga sering dipakai (fallthrough).
  POLA_CASE.lastIndex = 0
  while ((cocok = POLA_CASE.exec(kode))) {
    for (const bagian of cocok[1].split('|')) {
      const nama = bagian.trim().toLowerCase()
      if (nama && /^[a-z0-9_-]+$/.test(nama)) hasil.push(nama)
    }
  }
  // `case 'a': case 'b':` juga umum; dan `case /^x/i` tidak didukung.
  return [...new Set(hasil)]
}

/**
 * Ubah potongan `case …` menjadi handler Umi.
 *
 * Kode dijalankan di dalam fungsi baru dengan konteks yang sama seperti plugin
 * biasa (m, conn, args, text, command, prefix, …). Ini setara dengan plugin
 * mana pun yang sudah menjalankan kodenya sendiri — tidak ada tambahan risiko.
 *
 * @param {string} source isi berkas case
 * @param {{nama?:string, command?:string[]}} [opsi]
 */
export function bungkusCase(source, opsi = {}) {
  const isi = String(source || '')
  const nama = namaCase(isi)
  const daftarPerintah = opsi.command && opsi.command.length ? opsi.command : nama
  if (!daftarPerintah.length) {
    throw new Error('tidak ada `case` yang bisa dibaca')
  }

  /* Kalau berkasnya hanya potongan case tanpa `switch`, bungkus dengan switch.
   * Kalau sudah punya `switch (command)`, pakai apa adanya.
   *
   * PENTING: potongan `case` tidak boleh didahului pernyataan lain di dalam
   * switch — `switch (x) { const A = 1; case 'a': }` adalah SyntaxError
   * ("Unexpected token 'const'"). Padahal berkas case di dunia nyata sering
   * punya helper di atas case pertama (`const API = …`, `async function ambil()`).
   * Jadi bagian pembuka itu dipindah KE LUAR switch, tetap di dalam IIFE yang
   * sama, sehingga helper tetap terlihat oleh semua case. */
  const sudahSwitch = /\bswitch\s*\(\s*(command|cmd|m\.command)\s*\)/.test(bersihkanKode(isi))
  const awalCase = isi.search(/(^|\n)[ \t]*case[ \t]+['"`]/)
  let pembuka = ''
  let kasus = isi
  if (!sudahSwitch && awalCase > 0) {
    pembuka = isi.slice(0, awalCase)
    kasus = isi.slice(awalCase)
  }
  const badan = sudahSwitch ? isi : `${pembuka}\nswitch (command) {\n${kasus}\n}`

  const pabrik = new Function(
    'm', 'conn', 'args', 'text', 'command', 'usedPrefix', 'prefix', 'reply',
    'sleep', 'db', 'globalRef', 'console', 'fetch', 'Buffer', 'processRef', 'requireShim',
    `"use strict";\nreturn (async () => {\n${badan}\n})();`
  )

  const handler = async (m, extra = {}) => {
    const conn = extra.conn || m?.conn || global.conn
    const command = String(
      extra.command || m?.command || String(m?.text || '').replace(/^[^\w]+/, '').split(/\s+/)[0]
    ).toLowerCase()
    const args = Array.isArray(extra.args)
      ? extra.args
      : String(extra.text || m?.text || '').trim().split(/\s+/).filter(Boolean)
    const text = Array.isArray(args) ? args.join(' ') : String(extra.text || '')
    const usedPrefix = extra.usedPrefix || extra.prefix || global.prefix || '.'
    const reply = (isi, opsi2) => (typeof m?.reply === 'function' ? m.reply(isi, opsi2) : conn?.sendMessage(m.chat, { text: String(isi) }))
    const sleep = ms => new Promise(r => setTimeout(r, Number(ms) || 0))
    const requireShim = (modul) => {
      throw new Error(`Berkas case memakai require("${modul}") — ubah ke import ESM atau pasang sebagai plugin biasa`)
    }

    return pabrik(
      m, conn, args, text, command, usedPrefix, prefix2(usedPrefix), reply,
      sleep, extra.db || global.db, global, console, globalThis.fetch, Buffer, process, requireShim
    )
  }

  handler.command = new RegExp(`^(${daftarPerintah.map(kabur).join('|')})$`, 'i')
  handler.help = daftarPerintah.slice()
  handler.tags = Array.isArray(opsi.tags) ? opsi.tags : ['compat']
  handler.description = opsi.description || `Plugin format case (${daftarPerintah.length} perintah)`
  handler.formatSumber = 'case'
  handler.limit = false
  return handler
}

function prefix2(nilai) {
  return String(nilai || '.')
}

function kabur(teks) {
  return String(teks).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ============================================================
 * BENTUK 3 (scraper) — daftarkan fungsi scraper sebagai perintah
 * ============================================================ */

/**
 * Ubah modul scraper (hasil import) menjadi handler `.scraper`.
 *
 * @param {Record<string, any>} mod hasil import modul scraper
 * @param {{nama?:string}} [opsi]
 */
export function bungkusScraper(mod, opsi = {}) {
  const kumpulan = mod?.default && typeof mod.default === 'object' ? mod.default : mod
  const fungsi = {}
  for (const [nama, nilai] of Object.entries(kumpulan || {})) {
    if (typeof nilai === 'function' && !nama.startsWith('_')) fungsi[nama] = nilai
  }
  if (!Object.keys(fungsi).length) throw new Error('modul scraper tidak mengekspor fungsi apa pun')

  const namaBerkas = String(opsi.nama || mod?.__nama || 'scraper')
  const handler = async (m, { args = [], usedPrefix = '.', conn } = {}) => {
    const daftar = args.filter(Boolean)
    const nama = String(daftar[0] || '').toLowerCase()
    const sisa = daftar.slice(1)

    if (!nama || nama === 'list') {
      const baris = [
        `🧩 *SCRAPER: ${namaBerkas}*`,
        '',
        ...Object.keys(fungsi).map(f => `▸ ${usedPrefix}scraper ${f}`),
        '',
        `Cara pakai: ${usedPrefix}scraper <nama> <argumen>`,
        `Contoh: ${usedPrefix}scraper ${Object.keys(fungsi)[0]} https://contoh.com`,
      ]
      return m.reply(baris.join('\n'))
    }

    const fn = fungsi[nama]
    if (!fn) {
      return m.reply(`❌ Scraper *${nama}* tidak ada.\nYang tersedia: ${Object.keys(fungsi).map(f => `${usedPrefix}scraper ${f}`).join(', ')}`)
    }

    try {
      const hasil = await fn(...sisa)
      const teks = typeof hasil === 'string' ? hasil : JSON.stringify(hasil, null, 2)
      const potong = teks.length > 12000 ? `${teks.slice(0, 12000)}\n… (dipotong)` : teks
      return conn?.sendMessage
        ? conn.sendMessage(m.chat, { text: potong }, m?.raw ? { quoted: m.raw } : undefined)
        : m.reply(potong)
    } catch (error) {
      return m.reply(`❌ Scraper *${nama}* gagal: ${String(error?.message || error).slice(0, 200)}`)
    }
  }

  handler.command = /^(scraper|scrape|srap)$/i
  handler.help = ['scraper <nama> <argumen>']
  handler.tags = ['tools', 'compat']
  handler.description = `Menjalankan scraper dari ${namaBerkas}`
  handler.formatSumber = 'scraper'
  handler.daftarScraper = Object.keys(fungsi)
  handler.limit = false
  return handler
}

/* ============================================================
 * BENTUK CJS (module.exports) — ubah teks ke ESM lalu impor
 * ============================================================ */

/**
 * Ubah `module.exports = …` / `exports.x = …` menjadi ESM supaya bisa diimpor
 * di paket bertipe module.
 */
export function cjsKeEsm(source) {
  let isi = String(source || '')

  // module.exports = { … }  →  export default { … }
  isi = isi.replace(/(^|\n)[ \t]*module\.exports\s*=[ \t]*/, '$1export default ')
  // exports.nama = …  →  export const nama = …  (hanya penugasan paling luar)
  isi = isi.replace(/(^|\n)\s*exports\.([A-Za-z_$][\w$]*)\s*=/g, '$1export const $2 =')
  return isi
}

/* ============================================================
 * PEMUAT UTAMA
 * ============================================================ */

/**
 * Muat satu berkas plugin apa pun formatnya.
 *
 * @param {string} filePath jalur absolut
 * @param {string} [kunci] nama di daftar plugin (mis. "maker/stiker.js")
 * @returns {Promise<{handler: Function, format: string}|null>}
 */
export async function muatPlugin(filePath, kunci = '') {
  let asli = ''
  try {
    asli = fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }

  const format = deteksiFormat(asli, kunci || path.basename(filePath))

  // Bentuk 2 — case
  if (format === 'case') {
    try {
      return { handler: bungkusCase(asli, { nama: kunci }), format }
    } catch (error) {
      console.warn(`[FORMAT] case gagal dibungkus (${kunci}): ${error?.message || error}`)
      return null
    }
  }

  // Bentuk 1 & 3 butuh import; CJS perlu diubah dulu.
  const sumberImpor = format === 'cjs' ? cjsKeEsm(asli) : asli
  let mod = null
  try {
    if (format === 'cjs') {
      // Impor lewat data URL: tidak menulis berkas baru di folder plugin.
      const url = `data:text/javascript;base64,${Buffer.from(sumberImpor).toString('base64')}`
      mod = await import(url)
    } else {
      mod = await import(`${pathToFileURL(filePath).href}?compat=${Date.now()}`)
    }
  } catch (error) {
    console.warn(`[FORMAT] impor gagal (${kunci}, ${format}): ${error?.message || error}`)
    return null
  }

  const langsung = handlerSah(mod)
  if (langsung) return { handler: langsung, format: format === 'cjs' ? 'cjs-plugin' : 'plugin' }

  // Bentuk 3 — scraper
  if (format === 'scraper' || !langsung) {
    try {
      return { handler: bungkusScraper(mod, { nama: kunci || path.basename(filePath) }), format: 'scraper' }
    } catch {
      /* bukan scraper */
    }
  }

  return null
}

export default { deteksiFormat, bungkusCase, bungkusScraper, cjsKeEsm, muatPlugin, namaCase, bersihkanKode }
