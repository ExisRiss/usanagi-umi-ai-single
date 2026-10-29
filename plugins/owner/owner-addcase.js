/* By AlzRiss - Usanagi Umi AI
 *
 * Task151/152 — `.addcase`
 *
 *   .addcase <nama>              kirim kode case (boleh di pesan berikutnya)
 *   .addcase <nama> --ganti      timpa case dengan nama yang sama
 *   .batalcase                   batalkan antrean kode
 *
 * Kode yang diterima:
 *   1. potongan switch (boleh beberapa case sekaligus)
 *        case 'halo':
 *          m.reply('Hai!')
 *          break
 *   2. isi saja tanpa `case` — nama perintah dari argumen perintah
 *   3. berkas .js / .txt
 *
 * Task152: kode yang dikirim SETELAH perintah (tanpa prefix, termasuk di grup)
 * ditangkap lewat `lib/pending-kode.js` + registry aksi tertunda, karena
 * handler.js berhenti di gerbang prefix sebelum plugin dipanggil.
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
  fungsiBelumDipanggil,
  bangunPluginCase,
} from '../../lib/kode-aman.js'
import { adaLampiran, unduhLampiran, captionLampiran } from '../../lib/lampiran.js'
import { pasangKode, ambilKode, hapusKode, tampakKode, BATAS_TUNGGU } from '../../lib/pending-kode.js'
import { daftarkanAksi } from '../../lib/pending-aksi.js'

const BRAND = global.brandCredit || 'By AlzRiss - Usanagi Umi AI'
const AKAR_PLUGIN = path.resolve('./plugins')
const DIR_CASE = path.join(AKAR_PLUGIN, 'custom-case')

const TUTORIAL = [
  '🧩 *CARA MENAMBAH CASE (FITUR) BARU*',
  '',
  '*Langkah*',
  '1. Ketik `.addcase <nama>`',
  '   contoh: `.addcase sapa`',
  '2. Kirim kodenya di pesan berikutnya — di grup pun boleh tanpa prefix.',
  '   Bisa juga langsung membalas pesan bot ini dengan kodenya.',
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

const menit = Math.round(BATAS_TUNGGU / 60000)

/** Ambil kode dari pesan sekarang: berkas, teks, atau kutipan. */
async function kodeDariPesan(conn, m) {
  if (adaLampiran(m)) {
    const buffer = await unduhLampiran(conn, m).catch(() => null)
    if (buffer && buffer.length) return { kode: bersihkanPagarKode(buffer.toString('utf8')), sumber: 'berkas' }
  }

  const teks = String(m.text || captionLampiran(m) || '').trim()
  if (teks && tampakKode(teks)) return { kode: bersihkanPagarKode(teks), sumber: 'teks' }

  const kutipan = m.quoted
  if (kutipan) {
    const teksKutipan = kutipan.text || kutipan.caption
    if (typeof teksKutipan === 'string' && tampakKode(teksKutipan)) {
      return { kode: bersihkanPagarKode(teksKutipan), sumber: 'kutipan' }
    }
    if (typeof kutipan.download === 'function') {
      const buffer = await kutipan.download().catch(() => null)
      if (buffer && buffer.length) return { kode: bersihkanPagarKode(buffer.toString('utf8')), sumber: 'kutipan-berkas' }
    }
  }
  return { kode: '', sumber: '' }
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

/** Inti: validasi + simpan case + hot reload. Semua jalur berakhir di sini. */
async function simpanCase(m, { namaDiminta = '', ganti = false, kode = '' } = {}) {
  if (!kode) return m.reply(TUTORIAL)

  const blokCase = pecahBlokCase(kode).filter((item) => item.isi)
  if (!blokCase.length) return m.reply(`❌ Kode case kosong.\n\n${TUTORIAL}`)

  const tersimpan = await caseTersimpan()

  /* Nama dari argumen selalu menang. */
  const semuaLabel = new Set()
  const labelDiminta = namaFiturAman(namaDiminta)
  if (labelDiminta) {
    semuaLabel.add(labelDiminta)
  } else {
    for (const blok of blokCase) for (const label of blok.labels) semuaLabel.add(label)
  }
  if (!semuaLabel.size) {
    return m.reply('❌ Nama case tidak valid. Pakai huruf/angka/tanda hubung, minimal 2 huruf.\nContoh: `.addcase sapa-hari`')
  }

  const labels = [...semuaLabel]

  /* Jangan sampai case baru membajak perintah bawaan bot. */
  const bentrok = labels.filter((label) => perintahSudahDipakai(label, global.plugins) && !tersimpan.has(label))
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

  /* Kode yang hanya berisi deklarasi fungsi (tanpa pemanggilan) tidak akan
   * melakukan apa pun. Deteksi lalu panggil otomatis. */
  const fungsiOtomatis = fungsiBelumDipanggil(isiGabung)

  const berkas = bangunPluginCase({
    labels,
    isi: isiGabung,
    namaBerkas,
    fungsiOtomatis,
    pengirim: `+${String(m.sender || '').split('@')[0]}`,
    waktu: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }) + ' WITA',
  })

  const galatSintaks = syntaxError(berkas, `${namaBerkas}.js`, {
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
  })
  if (galatSintaks) return m.reply(`❌ Kode case ada salah tulis:\n${galatSintaks.message}`)

  await fs.mkdir(DIR_CASE, { recursive: true })
  const tujuan = path.join(DIR_CASE, `${namaBerkas}.js`)
  const relatif = path.relative(AKAR_PLUGIN, tujuan).replace(/\\/g, '/')

  const adaSebelumnya = tersimpan.has(namaBerkas) || await fs.access(tujuan).then(() => true, () => false)
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
      ...(fungsiOtomatis ? [`▶️ Fungsi ${fungsiOtomatis}() dipanggil otomatis (sock, jid)`] : []),
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

const handler = async (m, extra = {}) => {
  const { conn, text = '', command = '' } = extra

  if (/^batalcase$/i.test(String(command))) {
    hapusKode(m)
    return m.reply('✅ Antrean kode dibatalkan.')
  }

  const argumen = String(text || '').trim()
  const baris = argumen.split('\n')
  const kata = baris[0].trim().split(/\s+/).filter(Boolean)
  const ganti = kata.includes('--ganti') || kata.includes('--replace')
  const namaDiminta = kata.find((k) => !k.startsWith('--')) || ''

  /* Kode boleh langsung menyusul di baris berikutnya. */
  const kodeBaris = baris.length > 1 ? bersihkanPagarKode(baris.slice(1).join('\n')) : ''
  const dariPesan = kodeBaris ? { kode: kodeBaris, sumber: 'pesan' } : await kodeDariPesan(conn, m)

  if (dariPesan.kode) {
    hapusKode(m)
    return simpanCase(m, { namaDiminta, ganti, kode: dariPesan.kode })
  }

  /* Belum ada kode → simpan antrean lalu kirim tutorial. */
  pasangKode(m, { jenis: 'addcase', nama: namaDiminta, ganti })
  return m.reply([
    TUTORIAL,
    '',
    `⏳ *Menunggu kode* untuk case *${namaDiminta || 'tanpa nama'}* (${menit} menit).`,
    'Kirim kodenya sekarang — di grup pun tanpa prefix.',
    'Batal: `.batalcase`',
  ].join('\n'))
}

/* Jalur utama: pesan kode berikutnya ditangkap sebelum gerbang prefix. */
daftarkanAksi('addcase', (m) => {
  const tunggu = ambilKode(m)
  if (!tunggu || tunggu.jenis !== 'addcase') return null
  return {
    jalankan: async function (pesan) {
      const hasil = await kodeDariPesan(this, pesan)
      if (!hasil.kode) return false
      hapusKode(pesan)
      await simpanCase(pesan, { namaDiminta: tunggu.nama || '', ganti: Boolean(tunggu.ganti), kode: hasil.kode })
      return true
    },
  }
})

handler.help = ['addcase <nama> (kirim kode case / berkas)', 'batalcase']
handler.tags = ['owner']
handler.command = /^(addcase|tambahcase|batalcase)$/i
handler.description = 'Tambah fitur baru dari potongan case atau berkas JavaScript'
handler.owner = true
handler.limit = false

export default handler
