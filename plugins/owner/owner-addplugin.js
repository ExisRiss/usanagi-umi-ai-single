/* By AlzRiss - Usanagi Umi AI */

import fs from 'node:fs/promises'
import path from 'node:path'
import syntaxError from 'syntax-error'
import { adaLampiran, unduhLampiran, captionLampiran } from '../../lib/lampiran.js'
import { pasangKode, ambilKode, hapusKode, BATAS_TUNGGU } from '../../lib/pending-kode.js'
import { daftarkanAksi } from '../../lib/pending-aksi.js'

const BRAND = global.brandCredit || 'By AlzRiss - Usanagi Umi AI'

const TUTORIAL = [
  '🧩 *CARA MENAMBAH PLUGIN*',
  '',
  '*Langkah*',
  '1. Ketik `.addplugin <nama>`',
  '   contoh: `.addplugin sapaan`',
  '2. Balas pesan bot itu dengan salah satu:',
  '   • kode plugin langsung di chat',
  '   • atau kirim berkas `.js`',
  '',
  '*Kerangka plugin*',
  '```js',
  'const handler = async (m, { conn, text, args, usedPrefix, command }) => {',
  "  m.reply('Hai dari plugin baru!')",
  '}',
  '',
  'handler.command = /^sapaan$/i',
  'handler.tags = [\'custom\']',
  'handler.help = [\'sapaan\']',
  'handler.limit = false',
  '',
  'export default handler',
  '```',
  '',
  '*Syarat*',
  '• wajib punya `export default handler`',
  '• wajib punya `handler.command`',
  '• maksimal 256 KB, tanpa akses child_process / eval / kredensial',
  '',
  '*Nama sama?*',
  'Tambahkan `--replace`: `.addplugin sapaan --replace`',
  '',
  'Mau hanya menambah fitur sederhana? Pakai *.addcase* (tanpa kerangka plugin).',
  '',
  BRAND,
].join('\n')

function installerConfig() {
  const value = global.pluginInstaller || {}
  const pluginRoot = path.resolve('./plugins')
  const requested = String(value.directory || 'custom').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const candidate = path.resolve(pluginRoot, requested)
  const directory = candidate.startsWith(pluginRoot + path.sep) ? candidate : path.join(pluginRoot, 'custom')
  return {
    enabled: value.enabled !== false,
    pluginRoot,
    directory,
    maxBytes: Math.max(1024, Number(value.maxBytes) || 256 * 1024),
    keepBackups: value.keepBackups !== false
  }
}

function cleanCodeFence(value) {
  let code = String(value || '').replace(/^\uFEFF/, '').trim()
  const fenced = code.match(/^```(?:javascript|js|mjs)?\s*\n?([\s\S]*?)\n?```$/i)
  if (fenced) code = fenced[1].trim()
  return code
}

async function codeFromReply(m, conn) {
  const quoted = m.quoted
  if (quoted) {
    const text = quoted.text || quoted.caption
    if (typeof text === 'string' && text.trim()) return cleanCodeFence(text)

    if (typeof quoted.download === 'function') {
      const buffer = await quoted.download().catch(() => null)
      if (!buffer || !buffer.length) throw new Error('File plugin tidak dapat diunduh. Coba kirim ulang sebagai dokumen .js.')
      return cleanCodeFence(buffer.toString('utf8'))
    }
  }

  /* Tanpa reply: boleh langsung mengirim berkas .js bersama perintahnya. */
  if (adaLampiran(m)) {
    const buffer = await unduhLampiran(conn, m).catch(() => null)
    if (!buffer || !buffer.length) throw new Error('File plugin tidak dapat diunduh. Coba kirim ulang sebagai dokumen .js.')
    return cleanCodeFence(buffer.toString('utf8'))
  }

  return ''
}

function safeFilename(input) {
  const raw = String(input || '').replace(/\.m?js$/i, '').trim().toLowerCase()
  const name = raw
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${name || `plugin-${Date.now()}`}.js`
}

function securityCheck(code) {
  const rules = [
    [/\b(?:child_process|node:child_process)\b/i, 'akses child_process'],
    [/\b(?:execSync|execFileSync|spawnSync|execFile|spawn)\s*\(/i, 'eksekusi proses sistem'],
    [/\b(?:eval|Function)\s*\(/i, 'eksekusi kode dinamis'],
    [/\bprocess\s*\.\s*(?:env|exit|kill)\b/i, 'akses proses sensitif'],
    [/(?:sessions[\\/]|creds\.json|\.env\b)/i, 'akses kredensial/session'],
    [/\bfs\s*\.\s*(?:rm|rmSync|rmdir|rmdirSync)\s*\(/i, 'penghapusan filesystem'],
    [/(?:config|main|handler)\.js["'`]?\s*,?\s*(?:\)|,)/i, 'perubahan file inti'],
    [/handler\s*\.\s*command\s*=\s*[^\n]*(?:addplugin|installplugin)/i, 'pengambilalihan command installer']
  ]
  const blocked = rules.filter(([pattern]) => pattern.test(code)).map(([, label]) => label)
  if (blocked.length) throw new Error(`Plugin ditolak oleh pemeriksaan keamanan: ${blocked.join(', ')}.`)
}

function validateShape(code, filename) {
  const error = syntaxError(code, filename, {
    sourceType: 'module',
    allowAwaitOutsideFunction: true
  })
  if (error) throw new Error(`Syntax tidak valid: ${error.message}`)
  if (!/\bexport\s+default\b/.test(code)) throw new Error('Plugin wajib memiliki export default handler.')
  if (!/handler\s*\.\s*command\s*=/.test(code)) throw new Error('Plugin wajib memiliki handler.command.')
  securityCheck(code)
}

async function restoreOrRemove(target, backup) {
  await fs.rm(target, { force: true }).catch(() => {})
  if (backup) await fs.copyFile(backup, target).catch(() => {})
}

/** Deteksi cepat kode plugin (bukan obrolan biasa). */
function tampakKodePlugin(teks) {
  const isi = String(teks || '').trim()
  if (!isi || /^[.\/#!]/.test(isi)) return false
  return /export\s+default|handler\s*\.\s*command|const\s+handler\s*=|function\s+handler|import\s+.+from\s+['"]/.test(isi)
}

/** Ambil kode dari pesan sekarang: berkas, teks, atau kutipan. */
async function kodeDariPesan(conn, m) {
  if (adaLampiran(m)) {
    const buffer = await unduhLampiran(conn, m).catch(() => null)
    if (buffer && buffer.length) return cleanCodeFence(buffer.toString('utf8'))
  }
  const teks = String(m.text || captionLampiran(m) || '').trim()
  if (tampakKodePlugin(teks)) return cleanCodeFence(teks)

  const kutipan = m.quoted
  if (kutipan) {
    const teksKutipan = kutipan.text || kutipan.caption
    if (typeof teksKutipan === 'string' && teksKutipan.trim()) return cleanCodeFence(teksKutipan)
    if (typeof kutipan.download === 'function') {
      const buffer = await kutipan.download().catch(() => null)
      if (buffer && buffer.length) return cleanCodeFence(buffer.toString('utf8'))
    }
  }
  return ''
}

/** Inti: validasi + tulis plugin + hot reload. */
async function pasangPlugin(m, { kode = '', text = '' } = {}) {
  const config = installerConfig()
  if (!config.enabled) throw new Error('Installer plugin sedang dinonaktifkan di config.js.')

  const args = String(text || '').trim().split(/\s+/).filter(Boolean)
  const replace = args.includes('--replace')
  const requestedName = args.find(value => !value.startsWith('--'))
  const filename = safeFilename(requestedName)

  if (!kode) return m.reply(TUTORIAL)
  const size = Buffer.byteLength(kode)
  if (size > config.maxBytes) throw new Error(`Plugin terlalu besar: ${size} byte. Maksimal ${config.maxBytes} byte.`)
  validateShape(kode, filename)

  await fs.mkdir(config.directory, { recursive: true })
  const target = path.join(config.directory, filename)
  const relative = path.relative(config.pluginRoot, target).replace(/\\/g, '/')
  let exists = false
  try { await fs.access(target); exists = true } catch {}
  if (exists && !replace) {
    throw new Error(`Plugin ${filename} sudah ada. Tambahkan --replace untuk menggantinya.`)
  }

  let backup = ''
  if (exists && config.keepBackups) {
    const backupDir = path.join(config.directory, '.backups')
    await fs.mkdir(backupDir, { recursive: true })
    backup = path.join(backupDir, `${filename}.${Date.now()}.bak`)
    await fs.copyFile(target, backup)
  }

  const temporary = path.join(config.directory, `.${filename}.${process.pid}.tmp`)
  try {
    await fs.writeFile(temporary, `${kode.trim()}\n`, { encoding: 'utf8', mode: 0o600 })
    await fs.rename(temporary, target)
    if (typeof global.reload !== 'function') throw new Error('Hot reload plugin belum tersedia.')
    await global.reload(null, relative)

    const loaded = global.plugins?.[relative]
    if (typeof loaded !== 'function') {
      await restoreOrRemove(target, backup)
      if (backup) await global.reload(null, relative)
      throw new Error('Plugin gagal dimuat saat validasi runtime. Instalasi dibatalkan.')
    }

    return m.reply([
      '✅ *PLUGIN BERHASIL DITAMBAHKAN*',
      '',
      `📄 File: plugins/${relative}`,
      `📦 Ukuran: ${size.toLocaleString('id-ID')} byte`,
      `♻️ Mode: ${exists ? 'replace' : 'baru'}`,
      '⚡ Status: sudah dimuat tanpa restart',
      '',
      BRAND
    ].join('\n'))
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

const menit = Math.round(BATAS_TUNGGU / 60000)

const handler = async (m, extra = {}) => {
  const { text = '', conn, command = '' } = extra

  if (/^batalplugin$/i.test(String(command))) {
    hapusKode(m)
    return m.reply('✅ Antrean kode dibatalkan.')
  }

  const config = installerConfig()
  if (!config.enabled) throw new Error('Installer plugin sedang dinonaktifkan di config.js.')

  const argumen = String(text || '').trim()
  const baris = argumen.split('\n')
  const kodeBaris = baris.length > 1 ? cleanCodeFence(baris.slice(1).join('\n')) : ''
  const kode = kodeBaris || await kodeDariPesan(conn, m)
  const textArg = baris[0].trim()

  if (kode) {
    hapusKode(m)
    return pasangPlugin(m, { kode, text: textArg })
  }

  /* Tanpa kode → simpan antrean + tutorial (bukan pesan error). */
  pasangKode(m, { jenis: 'addplugin', text: textArg })
  return m.reply([
    TUTORIAL,
    '',
    `⏳ *Menunggu kode* (${menit} menit).`,
    'Kirim kodenya sekarang — di grup pun tanpa prefix.',
    'Batal: `.batalplugin`',
  ].join('\n'))
}

/* Jalur utama: kode yang dikirim sesudah perintah (tanpa prefix) tetap masuk. */
daftarkanAksi('addplugin', (m) => {
  const tunggu = ambilKode(m)
  if (!tunggu || tunggu.jenis !== 'addplugin') return null
  return {
    jalankan: async function (pesan) {
      const kode = await kodeDariPesan(this, pesan)
      if (!kode) return false
      hapusKode(pesan)
      await pasangPlugin(pesan, { kode, text: tunggu.text || '' })
      return true
    },
  }
})

handler.help = ['addplugin [nama] [--replace] (kirim kode/file .js)', 'batalplugin']
handler.tags = ['owner']
handler.command = /^(addplugin|installplugin|batalplugin)$/i
handler.rowner = true
handler.limit = false

export default handler
