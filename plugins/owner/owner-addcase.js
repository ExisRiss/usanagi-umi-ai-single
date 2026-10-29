/* By AlzRiss - Usanagi Umi AI
 *
 * Task151 — `.addcase`
 *
 *   .addcase <nama>            lalu balas pesan bot dengan kode case / berkas
 *   .addcase <nama> --ganti    menimpa case lama dengan nama yang sama
 *
 * Kode yang diterima:
 *   1. potongan switch (boleh beberapa case sekaligus)
 *        case 'halo':
 *          m.reply('Hai!')
 *          break
 *   2. isi saja tanpa `case` (nama perintah diambil dari argumen)
 *        m.reply('Hai!')
 *   3. berkas .js / .txt berisi salah satu bentuk di atas
 *
 * Hasilnya: berkas plugin baru di `plugins/custom-case/<nama>.js` yang langsung
 * dimuat lewat hot reload — tanpa restart. Sama seperti `.addplugin`, kode
 * diperiksa dulu (sintaks + pola berbahaya) sebelum disimpan.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import syntaxError from 'syntax-error'
import {
  bersihkanPagarKode,
  periksaKeamananKode,
  namaFiturAman,
  pecahBlokCase,
  perintahSudahDipakai,
  indentasi,
} from '../../lib/kode-aman.js'
import { adaLampiran, unduhLampiran } from '../../lib/lampiran.js'

const BRAND = global.brandCredit || 'By AlzRiss - Usanagi Umi AI'
const AKAR_PLUGIN = path.resolve('./plugins')
const DIR_CASE = path.join(AKAR_PLUGIN, 'custom-case')

const TUTORIAL = [
  '🧩 *CARA MENAMBAH CASE (FITUR) BARU*',
  '',
  '*Langkah*',
  '1. Ketik `.addcase <nama>`',
  '   contoh: `.addcase sapa`',
  '2. Balas pesan bot itu dengan salah satu:',
  '   • kode case langsung di chat',
  '   • atau kirim berkas `.js` / `.txt`',
  '',
  '*Contoh kode*',
  '```js',
  "case 'sapa':",
  "  m.reply('Hai ' + (m.pushName || 'kak') + '! 👋')",
  '  break',
  '```',
  '',
  '*Tanpa `case` juga boleh* — nama perintahnya dari langkah 1:',
  '```js',
  "m.reply('Hai kak! 👋')",
  '```',
  '',
  '*Beberapa case sekaligus* juga bisa:',
  '```js',
  "case 'pagi':",
  "  m.reply('Selamat pagi 🌅')",
  '  break',
  "case 'malam':",
  "  m.reply('Selamat malam 🌙')",
  '  break',
  '```',
  '',
  '*Yang tersedia di dalam kode*',
  '• `m` — pesan (m.reply, m.sender, m.pushName, m.quoted …)',
  '• `conn` — koneksi WhatsApp',
  '• `text`, `args`, `usedPrefix`, `command`',
  '',
  '*Catatan*',
  '• Case langsung aktif setelah disimpan (tanpa restart).',
  '• Timpa case lama: `.addcase <nama> --ganti`',
  '• Case disimpan di `plugins/custom-case/`.',
  '',
  BRAND,
].join('\n')

/** Ambil kode dari balasan/berkas yang dikirim user. */
async function kodeMasuk(conn, m) {
  const kutipan = m.quoted
  if (kutipan) {
    const teks = kutipan.text || kutipan.caption
    if (typeof teks === 'string' && teks.trim()) return bersihkanPagarKode(teks)
    if (typeof kutipan.download === 'function') {
      const buffer = await kutipan.download().catch(() => null)
      if (buffer && buffer.length) return bersihkanPagarKode(buffer.toString('utf8'))
    }
    return ''
  }
  if (adaLampiran(m)) {
    const buffer = await unduhLampiran(conn, m).catch(() => null)
    if (buffer && buffer.length) return bersihkanPagarKode(buffer.toString('utf8'))
  }
  return ''
}

/** Nama-nama case yang sudah ada di plugins/custom-case/. */
async function caseTersimpan() {
  try {
    const isi = await fs.readdir(DIR_CASE)
    return new Set(isi.filter((nama) => nama.endsWith('.js')).map((nama) => nama.replace(/\.js$/, '')))
  } catch (error) {
    return new Set()
  }
}

function bangunPlugin({ labels, isi, namaBerkas, pengirim, waktu }) {
  const baris = [
    `/* Dibuat lewat .addcase — ${waktu} oleh ${pengirim} */`,
    '',
    'const handler = async (m, { conn, text, args, usedPrefix, prefix, command }) => {',
    indentasi(isi),
    '}',
    '',
    `handler.command = /^(${labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$/i`,
    `handler.help = [${labels.map((l) => `'${l.replace(/'/g, "\\'")}'`).join(', ')}]`,
    'handler.tags = [\'custom\']',
    `handler.description = 'Case buatan pengguna lewat .addcase (${namaBerkas.replace(/'/g, "\\'")})'`,
    'handler.limit = false',
    '',
    'export default handler',
    '',
  ]
  return baris.join('\n')
}

const handler = async (m, extra = {}) => {
  const { conn, text = '' } = extra
  const argumen = String(text || '').trim()
  const kata = argumen.split(/\s+/).filter(Boolean)
  const ganti = kata.includes('--ganti') || kata.includes('--replace')
  const namaDiminta = kata.find((k) => !k.startsWith('--')) || ''

  /* Kode bisa langsung menyusul di baris berikutnya (tanpa reply). */
  const potongBaris = argumen.split('\n')
  const kodeBarisLanjut = potongBaris.length > 1 ? bersihkanPagarKode(potongBaris.slice(1).join('\n')) : ''
  const kode = kodeBarisLanjut || await kodeMasuk(conn, m)

  if (!kode) return m.reply(TUTORIAL)
  if (!namaDiminta) {
    return m.reply([
      '❌ Nama fitur belum ditulis.',
      '',
      'Pakai: `.addcase <nama>` lalu balas kodenya.',
      'Atau pakai `case` di dalam kode supaya namanya terbaca otomatis.',
      '',
      'Contoh: `.addcase sapa`',
    ].join('\n'))
  }

  const blokCase = pecahBlokCase(kode).filter((item) => item.isi)
  if (!blokCase.length) return m.reply(`❌ Kode case kosong.\n\n${TUTORIAL}`)

  caseTersimpanSet = await caseTersimpan()

  /* Nama dari argumen selalu menang. Kalau argumen kosong (tidak mungkin di
   * sini), label `case` yang dipakai. */
  const semuaLabel = new Set()
  const labelDiminta = namaFiturAman(namaDiminta)
  if (labelDiminta) {
    semuaLabel.add(labelDiminta)
  } else {
    for (const blok of blokCase) {
      for (const label of blok.labels) semuaLabel.add(label)
    }
  }
  if (!semuaLabel.size) {
    return m.reply('❌ Nama case tidak valid. Pakai huruf/angka/tanda hubung, minimal 2 huruf.\nContoh: `.addcase sapa-hari`')
  }

  const labels = [...semuaLabel]
  /* Jangan sampai case baru membajak perintah bawaan bot. */
  const bentrok = labels.filter((label) => perintahSudahDipakai(label, global.plugins) && !caseTersimpanSet.has(label))
  if (bentrok.length) {
    return m.reply([
      `❌ Nama ini sudah dipakai plugin bawaan: *${bentrok.join(', ')}*`,
      '',
      `Pilih nama lain, contoh: \`.addcase ${bentrok[0]}-ku\`.`,
    ].join('\n'))
  }

  const namaBerkas = namaFiturAman(namaDiminta) || labels[0]
  const isiGabung = blokCase.map((item) => item.isi).join('\n\n')
  try {
    periksaKeamananKode(isiGabung)
  } catch (error) {
    return m.reply(`❌ ${error.message}`)
  }

  const berkas = bangunPlugin({
    labels,
    isi: isiGabung,
    namaBerkas,
    pengirim: `+${String(m.sender || '').split('@')[0]}`,
    waktu: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }) + ' WITA',
  })

  const galatSintaks = syntaxError(berkas, `${namaBerkas}.js`, {
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
  })
  if (galatSintaks) {
    return m.reply(`❌ Kode case ada salah tulis:\n${galatSintaks.message}`)
  }

  await fs.mkdir(DIR_CASE, { recursive: true })
  const tujuan = path.join(DIR_CASE, `${namaBerkas}.js`)
  const relatif = path.relative(AKAR_PLUGIN, tujuan).replace(/\\/g, '/')

  const adaSebelumnya = caseTersimpanSet.has(namaBerkas) || await fs.access(tujuan).then(() => true, () => false)
  if (adaSebelumnya && !ganti) {
    return m.reply([
      `⚠️ Case *${namaBerkas}* sudah ada.`,
      '',
      `• Timpa: \`.addcase ${namaBerkas} --ganti\``,
      `• Nama lain: \`.addcase ${namaBerkas}2\``,
    ].join('\n'))
  }

  let cadangan = ''
  if (adaSebelumnya) {
    cadangan = `${tujuan}.${Date.now()}.bak`
    await fs.copyFile(tujuan, cadangan).catch(() => { cadangan = '' })
  }

  const sementara = path.join(DIR_CASE, `.${namaBerkas}.${process.pid}.tmp`)
  try {
    await fs.writeFile(sementara, berkas, { encoding: 'utf8', mode: 0o600 })
    await fs.rename(sementara, tujuan)

    if (typeof global.reload !== 'function') throw new Error('Hot reload plugin belum tersedia.')
    await global.reload(null, relatif)

    const termuat = global.plugins ? global.plugins[relatif] : null
    if (!termuat) {
      await fs.rm(tujuan, { force: true }).catch(() => {})
      if (cadangan) await fs.copyFile(cadangan, tujuan).catch(() => {})
      throw new Error('Case gagal dimuat saat validasi. Perubahan dibatalkan.')
    }

    return m.reply([
      '✅ *CASE BERHASIL DITAMBAHKAN*',
      '',
      `📄 File: plugins/${relatif}`,
      `⌨️ Perintah: ${labels.map((l) => `.${l}`).join(' · ')}`,
      `♻️ Mode: ${adaSebelumnya ? 'timpa' : 'baru'}`,
      '⚡ Status: aktif sekarang juga (tanpa restart)',
      '',
      `Coba: .${labels[0]}`,
      '',
      BRAND,
    ].join('\n'))
  } catch (error) {
    await fs.rm(sementara, { force: true }).catch(() => {})
    return m.reply(`❌ Gagal menyimpan case: ${error.message}`)
  }
}

/* Dipakai untuk cek bentrok sekaligus status tersimpan. */
let caseTersimpanSet = new Set()
const muatAwal = async () => { caseTersimpanSet = await caseTersimpan() }
muatAwal()

handler.help = ['addcase <nama> (balas kode case / berkas)', 'addcase <nama> --ganti']
handler.tags = ['owner']
handler.command = /^(addcase|tambahcase)$/i
handler.description = 'Tambah fitur baru dari potongan case atau berkas JavaScript'
handler.owner = true
handler.limit = false

export default handler
