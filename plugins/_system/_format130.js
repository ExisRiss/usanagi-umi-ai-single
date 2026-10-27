/* By AlzRiss - Usanagi Umi AI
 *
 * PENDETEKSI & PEMASANG PLUGIN MULTI-FORMAT (Task130)
 *
 * Perintah owner:
 *   .formatplugin <file.js>     → tebak format sebuah berkas plugin
 *   .cekplugin                  → (balas/reply berkas .js) tebak formatnya
 *   .pasangplugin <kategori/nama.js>
 *                               → (balas/reply berkas .js) ubah & pasang ke
 *                                 plugins/compat/<kategori/nama.js> supaya
 *                                 langsung dimuat bot
 *
 * Kenapa ada: plugin dari bot lain sering berbentuk `case …`, `module.exports`,
 * atau modul scrapper — bukan plugin ESM Umi. Tanpa alat ini, memasangnya harus
 * diedit manual dulu.
 *
 * Semua kegagalan dijawab sebagai pesan, tidak pernah melempar ke handler.
 */

import fs from 'node:fs'
import path from 'node:path'

const AKAR = () => process.cwd()
const FOLDER_PASANG = () => path.join(AKAR(), 'plugins', 'compat')

const LABEL = Object.freeze({
  plugin: '✅ plugin Umi (ESM, export default + handler.command)',
  case: '🧩 potongan switch-case',
  scraper: '🔍 modul scrapper',
  cjs: '📦 modul CommonJS (module.exports)',
  'tidak-dikenal': '❔ tidak dikenali',
})

/** Ambil isi berkas yang dibalas/dilampirkan pengguna. */
async function ambilSumber(m, conn) {
  // 1) Berkas yang dibalas (dokumen .js)
  const kuotasi = m.quoted || m.msg?.contextInfo?.quotedMessage ? m.quoted : null
  const dok = kuotasi?.msg || kuotasi?.message?.documentMessage || kuotasi?.message?.documentWithCaptionMessage?.message?.documentMessage
  if (dok) {
    try {
      const buf = await conn.downloadM(dok, 'document', false)
      return { isi: Buffer.from(buf).toString('utf8'), nama: dok.fileName || 'plugin.js', dari: 'balasan' }
    } catch (error) {
      throw new Error(`gagal mengunduh berkas balasan: ${String(error?.message || error).slice(0, 120)}`)
    }
  }
  // 2) Berkas yang dikirim langsung
  const sendiri = m.message?.documentMessage || m.message?.documentWithCaptionMessage?.message?.documentMessage
  if (sendiri) {
    try {
      const buf = await conn.downloadM(sendiri, 'document', false)
      return { isi: Buffer.from(buf).toString('utf8'), nama: sendiri.fileName || 'plugin.js', dari: 'lampiran' }
    } catch (error) {
      throw new Error(`gagal mengunduh lampiran: ${String(error?.message || error).slice(0, 120)}`)
    }
  }
  return null
}

function ringkasPesan(hasil, nama) {
  const baris = [
    `🧪 *CEK FORMAT PLUGIN*`,
    '',
    `Berkas : ${nama}`,
    `Format : ${LABEL[hasil.format] || hasil.format}`,
    `Handler: ${typeof hasil.handler === 'function' ? 'siap dipakai' : 'tidak ada'}`,
  ]
  const h = hasil.handler
  if (h?.command) baris.push(`Perintah: ${String(h.command).slice(0, 160)}`)
  if (Array.isArray(h?.help) && h.help.length) baris.push(`Bantuan : ${h.help.slice(0, 8).join(', ')}`)
  if (Array.isArray(h?.daftarScraper) && h.daftarScraper.length) baris.push(`Scraper : ${h.daftarScraper.join(', ')}`)
  baris.push('', 'Pasang otomatis: balas berkas ini dengan `.pasangplugin <folder/nama.js>`')
  return baris.join('\n')
}

let handler = async (m, extra = {}) => {
  const conn = extra.conn || m.conn || global.conn
  const perintah = String(extra.command || m.command || '').toLowerCase()
  const args = Array.isArray(extra.args) ? extra.args : String(extra.text || m.text || '').trim().split(/\s+/).filter(Boolean)
  const usedPrefix = extra.usedPrefix || extra.prefix || global.prefix || '.'

  let formatModul
  try {
    formatModul = await import('../../lib/plugin-format.js')
  } catch (error) {
    return m.reply(`❌ Modul format tidak bisa dimuat: ${String(error?.message || error).slice(0, 150)}`)
  }

  /* ---------- .formatplugin <jalur berkas> ---------- */
  if (perintah === 'formatplugin' && args[0]) {
    const jalur = path.resolve(AKAR(), args[0])
    if (!jalur.startsWith(path.resolve(AKAR()))) return m.reply('❌ Jalur harus di dalam folder bot.')
    let isi
    try {
      isi = fs.readFileSync(jalur, 'utf8')
    } catch {
      return m.reply(`❌ Berkas tidak ada: ${args[0]}`)
    }
    const hasil = await formatModul.muatPlugin(jalur, args[0])
    return m.reply(ringkasPesan(hasil || { format: formatModul.deteksiFormat(isi, args[0]), handler: null }, args[0]))
  }

  /* ---------- .cekplugin (balas berkas) ---------- */
  if (perintah === 'cekplugin') {
    let sumber
    try {
      sumber = await ambilSumber(m, conn)
    } catch (error) {
      return m.reply(`❌ ${error.message}`)
    }
    if (!sumber) {
      return m.reply(
        [
          '🧪 *CEK FORMAT PLUGIN*',
          '',
          'Kirim atau balas sebuah berkas `.js`, lalu ketik:',
          `${usedPrefix}cekplugin`,
          '',
          'Yang didukung: plugin ESM Umi, potongan `case`, `module.exports`, scrapper.',
        ].join('\n')
      )
    }
    const format = formatModul.deteksiFormat(sumber.isi, sumber.nama)
    let contohHandler = null
    if (format === 'case') {
      try {
        contohHandler = formatModul.bungkusCase(sumber.isi, { nama: sumber.nama })
      } catch {}
    } else if (format === 'cjs') {
      // uji ubah ke ESM tanpa menjalankan isinya
      const esm = formatModul.cjsKeEsm(sumber.isi)
      const cocok = /export\s+default/.test(esm)
      contohHandler = cocok ? { command: '(diekspor lewat export default)' } : null
    } else if (format === 'scraper') {
      const namaScraper = [...sumber.isi.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(x => x[1])
      contohHandler = { command: '(scraper)', daftarScraper: namaScraper }
    }
    return m.reply(ringkasPesan({ format, handler: contohHandler }, sumber.nama))
  }

  /* ---------- .pasangplugin <folder/nama.js> ---------- */
  if (perintah === 'pasangplugin') {
    const tujuan = String(args[0] || '').trim()
    if (!tujuan || !/^[\w-]+\/[\w.-]+\.js$/.test(tujuan)) {
      return m.reply(
        [
          '📥 *PASANG PLUGIN*',
          '',
          'Balas berkas `.js` lalu kirim:',
          `${usedPrefix}pasangplugin tools/namafile.js`,
          '',
          'Folder menentukan kategori di menu (mis. `tools`, `maker`, `game`).',
        ].join('\n')
      )
    }

    let sumber
    try {
      sumber = await ambilSumber(m, conn)
    } catch (error) {
      return m.reply(`❌ ${error.message}`)
    }
    if (!sumber) return m.reply('❌ Balas atau lampirkan berkas `.js` yang mau dipasang.')

    // Uji dulu: harus bisa jadi handler, kalau tidak jangan dipasang.
    const sementara = path.join(AKAR(), 'tmp', `pasang-${Date.now()}.js`)
    try {
      fs.mkdirSync(path.dirname(sementara), { recursive: true })
      fs.writeFileSync(sementara, sumber.isi)
      const uji = await formatModul.muatPlugin(sementara, tujuan)
      if (!uji) {
        fs.rmSync(sementara, { force: true })
        return m.reply(`❌ Format *${formatModul.deteksiFormat(sumber.isi, sumber.nama)}* tidak bisa diubah menjadi plugin yang sah. Cek dengan ${usedPrefix}cekplugin dulu.`)
      }

      /* Simpan sebagai plugin ESM sah: hasil konversi ditulis apa adanya kalau
       * sudah ESM, atau dibungkus pembungkus kecil untuk case/scraper. */
      const folder = path.join(FOLDER_PASANG(), path.dirname(tujuan))
      fs.mkdirSync(folder, { recursive: true })
      const target = path.join(FOLDER_PASANG(), tujuan)
      const format = uji.format

      if (format === 'plugin' || format === 'cjs-plugin') {
        const isi = format === 'cjs-plugin' ? formatModul.cjsKeEsm(sumber.isi) : sumber.isi
        fs.writeFileSync(target, isi)
      } else {
        // case / scraper → tulis pembungkus yang memuat berkas asli
        const asli = path.join(folder, `_asli-${path.basename(tujuan)}`)
        fs.writeFileSync(asli, sumber.isi)
        const relatif = `./${path.basename(asli)}`
        const isi =
          format === 'case'
            ? [
                `/* Dibungkus otomatis oleh .pasangplugin (format case) */`,
                `import { bungkusCase } from '../../../lib/plugin-format.js'`,
                `import fs from 'node:fs'`,
                `import path from 'node:path'`,
                `import { fileURLToPath } from 'node:url'`,
                `const __dirname = path.dirname(fileURLToPath(import.meta.url))`,
                `const sumber = fs.readFileSync(path.join(__dirname, ${JSON.stringify(path.basename(asli))}), 'utf8')`,
                `export default bungkusCase(sumber, { nama: ${JSON.stringify(tujuan)} })`,
              ].join('\n')
            : [
                `/* Dibungkus otomatis oleh .pasangplugin (format scrapper) */`,
                `import * as asli from ${JSON.stringify(relatif)}`,
                `import { bungkusScraper } from '../../../lib/plugin-format.js'`,
                `export default bungkusScraper(asli, { nama: ${JSON.stringify(tujuan)} })`,
              ].join('\n')
        fs.writeFileSync(target, isi)
      }

      fs.rmSync(sementara, { force: true })
      return m.reply(
        [
          '✅ *PLUGIN TERPASANG*',
          '',
          `Berkas : plugins/compat/${tujuan}`,
          `Format : ${LABEL[format] || format}`,
          hondlerRingkas(uji.handler),
          '',
          'Bot memuat ulang otomatis (hot-reload). Kalau belum muncul, restart container.',
        ].filter(Boolean).join('\n')
      )
    } catch (error) {
      try {
        fs.rmSync(sementara, { force: true })
      } catch {}
      return m.reply(`❌ Gagal memasang: ${String(error?.message || error).slice(0, 200)}`)
    }
  }

  /* ---------- daftar plugin compat ---------- */
  const folder = FOLDER_PASANG()
  let daftar = []
  try {
    daftar = fs.readdirSync(folder, { withFileTypes: true, recursive: true })
      .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_asli-'))
      .map(e => path.relative(folder, path.join(e.parentPath || e.path, e.name)))
  } catch {}

  return m.reply(
    [
      '🧩 *PLUGIN MULTI-FORMAT*',
      '',
      'Bot bisa menerima 3 jenis plugin dari bot lain:',
      '1. plugin ESM Umi  → export default handler',
      "2. case            → potongan `case 'perintah': …`",
      '3. scrapper        → modul fungsi pengambil data',
      '',
      'Cara pasang: balas berkas .js dengan',
      `${usedPrefix}pasangplugin tools/nama.js`,
      '',
      `Terpasang sekarang: ${daftar.length}`,
      ...daftar.slice(0, 20).map(d => `▸ ${d}`),
    ].join('\n')
  )
}

function hondlerRingkas(h) {
  if (!h) return ''
  const baris = []
  if (h.command) baris.push(`Perintah: ${String(h.command).slice(0, 150)}`)
  if (Array.isArray(h.help) && h.help.length) baris.push(`Bantuan : ${h.help.slice(0, 8).join(', ')}`)
  if (Array.isArray(h.daftarScraper) && h.daftarScraper.length) baris.push(`Scraper : ${h.daftarScraper.join(', ')}`)
  return baris.join('\n')
}

/* `installplugin` & `addplugin` sudah dipakai plugins/owner/owner-addplugin.js —
 * jangan diambil alih. */
handler.command = /^(pasangplugin|cekplugin|formatplugin)$/i
handler.help = ['cekplugin', 'pasangplugin <folder/nama.js>', 'formatplugin <berkas>']
handler.tags = ['owner', 'system']
handler.owner = true
handler.description = 'Mendeteksi & memasang plugin berformat case / scrapper / CommonJS dari bot lain'
handler.limit = false

export default handler
