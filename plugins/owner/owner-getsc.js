/* By AlzRiss - Usanagi Umi AI
 *
 * GETSC (Task184/196) — kirim source code bot lewat MENU TOMBOL.
 *
 * Tombol (semua dikirim ke private chat peminta):
 *   📦 Source code Umi lengkap        → repo usanagi-umi-ai (multi-bot)
 *   💻 Source code Umi single bot     → repo usanagi-umi-ai-single
 * Khusus owner utama / developer (tombol ekstra):
 *   🔐 Umi lengkap (full akses + api + token)
 *   🔐 Umi single  (full akses + api + token)
 *
 * Versi FULL dikirim lewat https://upload.gwenna.my.id:
 *   • ZIP kode     → zipball GitHub apa adanya
 *   • .umienc      → berkas TAMBAHAN (config.js + env token) terkunci password
 *                    (AES-256-GCM) + sc-license.enc untuk gerbang pairing
 *   • bukasc.js    → alat decrypt kecil (Node) dikirim sebagai dokumen
 *
 * Instansi berlisensi akan meminta password saat pairing bot utama;
 * 3 kali salah → seluruh isi folder bot dihancurkan (Task196).
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { sendLocalMediaFast } from '../../lib/awang-media-transfer.js'
import { simpanBerkas } from '../../lib/upload-publik.js'
import { buatIsiLisensi } from '../../lib/sc-license.js'

const REPO_SINGLE = 'ExisRiss/usanagi-umi-ai-single'
const REPO_LENGKAP = 'ExisRiss/usanagi-umi-ai'
const BRANCH = 'main'
const MAKS_ZIP = 60 * 1024 * 1024
const MAKS_TAMBAHAN = 5 * 1024 * 1024

/* Token pemilik yang menekan tombol (5 menit berlaku). */
const izinMenu = new Map()
/* Password yang sedang diminta: { jid, jenis, sampai } */
let menungguPassword = null

function repoDari(jenis) { return jenis === 'LENGKAP' ? REPO_LENGKAP : REPO_SINGLE }

async function unduhZipball(repo) {
  const tujuan = path.join(os.tmpdir(), `getsc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.zip`)
  const res = await fetch(`https://codeload.github.com/${repo}/legacy.zip/refs/heads/${BRANCH}`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(300000),
    headers: { 'User-Agent': 'UMI-GetSC' },
  })
  if (!res.ok || !res.body) throw new Error(`GitHub tidak mengizinkan unduhan (HTTP ${res.status}).`)
  let total = 0
  const batas = new Transform({
    transform(potongan, _enc, selesai) {
      total += potongan.length
      if (total > MAKS_ZIP) { selesai(new Error('Zip melebihi batas 60 MB.')); return }
      selesai(null, potongan)
    },
  })
  try {
    await pipeline(res.body, batas, fs.createWriteStream(tujuan))
  } catch (error) {
    fs.rmSync(tujuan, { force: true })
    throw error
  }
  if (!total) { fs.rmSync(tujuan, { force: true }); throw new Error('GitHub mengirim file kosong.') }
  return { file: tujuan, bytes: total }
}

async function infoCommit(repo) {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${BRANCH}`, {
      headers: { 'User-Agent': 'UMI-GetSC', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return { sha: String(data.sha || '').slice(0, 7), tanggal: String(data.commit?.committer?.date || '').slice(0, 10) }
  } catch { return null }
}

/* ── versi biasa: zip kode dari GitHub ── */
async function kirimZipBersih(m, conn, jenis) {
  const repo = repoDari(jenis)
  const mTujuan = m.isGroup ? { chat: m.sender } : m
  await conn.reply(m.chat, `⏳ Mengambil source code *${jenis === 'LENGKAP' ? 'Umi lengkap' : 'Umi single bot'}* dari GitHub…`, m)
  let hasil = null
  try {
    const [commit, zip] = await Promise.all([infoCommit(repo), unduhZipball(repo)])
    hasil = zip
    const baris = [
      '📦 *SOURCE CODE BOT*',
      '',
      `Repo   : ${repo}`,
      `Branch : ${BRANCH}`,
      commit ? `Commit : ${commit.sha} (${commit.tanggal})` : 'Commit : terbaru',
      `Ukuran : ${(zip.bytes / 1048576).toFixed(1)} MB`,
      '',
      '_Kode bersih — tanpa token/rahasia._',
    ].join('\n')
    await sendLocalMediaFast(conn, mTujuan, zip.file, {
      type: 'document',
      mimeType: 'application/zip',
      fileName: `${repo.split('/')[1]}-${BRANCH}.zip`,
      caption: baris,
      maxBytes: MAKS_ZIP,
    })
    console.log('[getsc] zip terkirim ke', mTujuan.chat, `${zip.bytes} B`, commit?.sha || '')
    if (m.isGroup) await conn.reply(m.chat, '✅ ZIP source code sudah dikirim ke private chat kamu.', m)
  } catch (error) {
    console.warn('[getsc]', error?.message || error)
    if (hasil?.file) fs.rmSync(hasil.file, { force: true })
    await conn.reply(m.chat, `❌ Gagal mengirim source code: ${error?.message || 'coba lagi nanti.'}`, m)
  }
}

/* ── versi full: zip + tambahan token terkunci password ── */

function enkripsiTambahan(buffer, password) {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(password, salt, 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const isi = Buffer.concat([cipher.update(buffer), cipher.final()])
  return Buffer.concat([Buffer.from('UMIENC1\n', 'latin1'), salt, iv, isi, cipher.getAuthTag()])
}

const BERKAS_TAMBAHAN = [
  'config.js',
  '.env.apikeys', '.env.gemini', '.main-bot.env', '.platform.env', '.tunnel.env', '.backup-system.env',
]

/* Task196-fix — verifikasi URL benar-benar hidup sebelum ditawarkan. */
async function urlHidup(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000), redirect: 'follow' })
    return res.ok
  } catch { return false }
}

/* Task196-fix — bila upload publik bermasalah, kirim ketiga berkas langsung sebagai dokumen. */
async function kirimFullDokumen(mTujuan, conn, jenis, zip, enc, commit, jumlahBerkas) {
  const baris = [
    '🔐 *SOURCE CODE FULL AKSES*',
    '',
    `Repo   : ${repoDari(jenis)}`,
    commit ? `Commit : ${commit.sha} (${commit.tanggal})` : 'Commit : terbaru',
    '',
    '⚠️ Upload publik sedang tidak merespons — paket dikirim *langsung sebagai berkas terlampir*:',
    '1. ZIP kode      → dokumen .zip',
    '2. Token+config  → dokumen .umienc (terkunci password)',
    '3. Alat decrypt  → dokumen bukasc.js',
    '',
    'Password yang kamu pilih terkunci di file .umienc — simpan sendiri.',
    `Isi token terdeteksi: ${jumlahBerkas} berkas + sc-license.enc.`,
    '',
    '*Cara pasang:*',
    '• Ekstrak ZIP → buka .umienc (node bukasc.js <file> <password>)',
    '• Salin isi tiap blok ke file dengan nama yang sama (timpa config.js & env).',
    '• Taruh data/sc-license.enc di folder data/.',
    '• Saat pairing bot utama, bot MINTA PASSWORD — benar → lanjut, 3× salah → instalasi dihancurkan otomatis.',
  ].join('\n')
  await conn.sendMessage(mTujuan.chat, { text: baris })
  await sendLocalMediaFast(conn, mTujuan, zip.file, {
    type: 'document', mimeType: 'application/zip',
    fileName: `umi-${jenis.toLowerCase()}-full.zip`, caption: '1️⃣ ZIP source code', maxBytes: MAKS_ZIP,
  })
  const encPath = path.join(os.tmpdir(), `tambahan-${Date.now()}.umienc`)
  fs.writeFileSync(encPath, enc)
  await sendLocalMediaFast(conn, mTujuan, encPath, {
    type: 'document', mimeType: 'application/octet-stream',
    fileName: 'umi-tambahan-full.umienc', caption: '2️⃣ Token+config terkunci password', maxBytes: 10 * 1024 * 1024,
  }).finally(() => fs.rmSync(encPath, { force: true }))
  const toolPath = path.join(os.tmpdir(), `bukasc-${Date.now()}.js`)
  fs.writeFileSync(toolPath, TEKS_BUKASC)
  await sendLocalMediaFast(conn, mTujuan, toolPath, {
    type: 'document', mimeType: 'text/javascript',
    fileName: 'bukasc.js', caption: '3️⃣ Alat decrypt — jalankan: node bukasc.js <file.umienc> <password>', maxBytes: 1024 * 1024,
  }).finally(() => fs.rmSync(toolPath, { force: true }))
  console.log('[getsc] full (fallback dokumen) terkirim ke', mTujuan.chat, jenis, `zip=${zip.bytes}B`)
}

function rakitTambahan(jenis, password) {
  const bagian = []
  bagian.push(`TAMBAHAN SOURCE CODE ${jenis === 'LENGKAP' ? 'UMI LENGKAP' : 'UMI SINGLE BOT'}\n`)
  bagian.push(`Dibuat: ${new Date().toISOString()} — JANGAN BAGIKAN.\n`)
  bagian.push('Cara pakai:\n1. Ekstrak ZIP source code.\n2. Buka file .umienc dengan: node bukasc.js <file.umienc> <password>\n3. Salin isi tiap blok ke berkas dengan nama yang sama (timpa).\n4. data/sc-license.enc taruh di folder data/ — bot akan minta password itu saat pairing.\n')
  let ada = 0
  for (const nama of BERKAS_TAMBAHAN) {
    try {
      const isi = fs.readFileSync(path.join(process.cwd(), nama))
      if (isi.length > MAKS_TAMBAHAN) { bagian.push(`\n===== FILE: ${nama} (TERLALU BESAR, dilewati) =====\n`); continue }
      bagian.push(`\n===== FILE: ${nama} =====\n`)
      bagian.push(isi.toString('utf8'))
      bagian.push('\n')
      ada += 1
    } catch { /* tidak ada di instansi ini — lewati */ }
  }
  const lisan = buatIsiLisensi(password)
  bagian.push(`\n===== FILE: data/sc-license.enc =====\n${JSON.stringify(lisan, null, 2)}\n`)
  bagian.push('\n===== CARA DECRYPT =====\nnode bukasc.js umi-tambahan-full.umienc <password>\n')
  return { buffer: Buffer.from(bagian.join(''), 'utf8'), jumlahBerkas: ada }
}

const TEKS_BUKASC = `/* Alat decrypt tambahan sc Umi (Task196). Pakai: node bukasc.js <file.umienc> <password> [keluaran] */
const fs = require('fs'), crypto = require('crypto')
const [,, f, pw, out = 'TAMBAHAN-FULL.txt'] = process.argv
if (!f || !pw) { console.log('Pakai: node bukasc.js <file.umienc> <password>'); process.exit(1) }
const b = fs.readFileSync(f)
if (b.subarray(0, 8).toString('latin1') !== 'UMIENC1\\n') { console.error('Bukan file .umienc.'); process.exit(1) }
const salt = b.subarray(8, 24), iv = b.subarray(24, 36), data = b.subarray(36)
const key = crypto.scryptSync(pw, salt, 32)
const d = crypto.createDecipheriv('aes-256-gcm', key, iv)
d.setAuthTag(data.subarray(data.length - 16))
const isi = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()])
fs.writeFileSync(out, isi)
console.log('OK →', out)
`

async function kirimFull(m, conn, jenis, password) {
  const repo = repoDari(jenis)
  const mTujuan = m.isGroup ? { chat: m.sender } : m
  await conn.reply(m.chat, '⏳ Menyiapkan sc *full akses* (kode + token terkunci password)… proses ±1–3 menit.', m)
  const zip = await unduhZipball(repo)
  try {
    const commit = await infoCommit(repo)
    const { buffer: tambahan, jumlahBerkas } = rakitTambahan(jenis, password)
    const enc = enkripsiTambahan(tambahan, password)

    const uZip = simpanBerkas({ buffer: fs.readFileSync(zip.file), nama: `umi-${jenis.toLowerCase()}-full-${Date.now()}.zip`, mime: 'application/zip', jid: m.sender, tipe: 'document' })
    const uEnc = simpanBerkas({ buffer: enc, nama: `umi-tambahan-full-${Date.now()}.umienc`, mime: 'application/octet-stream', jid: m.sender, tipe: 'document' })
    const uTool = simpanBerkas({ buffer: Buffer.from(TEKS_BUKASC, 'utf8'), nama: 'bukasc.js', mime: 'text/javascript', jid: m.sender, tipe: 'document' })

    /* Task196-fix — tunggu dorongan ke penyaji, lalu pastikan URL benar-benar hidup. */
    await Promise.allSettled([uZip.dorong, uEnc.dorong, uTool.dorong].filter(Boolean))
    const semuaHidup = (await Promise.all([uZip, uEnc, uTool].map((u) => urlHidup(u.urlUnduh)))).every(Boolean)
    if (!semuaHidup) {
      await kirimFullDokumen(mTujuan, conn, jenis, zip, enc, commit, jumlahBerkas)
      if (m.isGroup) await conn.reply(m.chat, '✅ Paket full akses (berkas langsung) sudah dikirim ke private chat kamu.', m)
      return
    }

    const baris = [
      '🔐 *SOURCE CODE FULL AKSES*',
      '',
      `Repo   : ${repo}`,
      commit ? `Commit : ${commit.sha} (${commit.tanggal})` : 'Commit : terbaru',
      '',
      `1. ZIP kode      : ${uZip.urlUnduh}`,
      `2. Token+config  : ${uEnc.urlUnduh}  (terkunci password)`,
      `3. Alat decrypt  : ${uTool.urlUnduh}`,
      '',
      'Password yang kamu pilih *terkunci di file nomor 2* — simpan sendiri.',
      `Isi token terdeteksi: ${jumlahBerkas} berkas + sc-license.enc.`,
      '',
      '*Cara pasang:*',
      '• Ekstrak ZIP → buka .umienc (node bukasc.js <file> <password>)',
      '• Salin isi tiap blok ke file dengan nama yang sama (timpa config.js & env).',
      '• Taruh data/sc-license.enc di folder data/.',
      '• Saat pairing bot utama, bot MINTA PASSWORD — benar → lanjut, 3× salah → instalasi dihancurkan otomatis.',
    ].join('\n')
    await conn.sendMessage(mTujuan.chat, { text: baris })
    const toolPath = path.join(os.tmpdir(), `bukasc-${Date.now()}.js`)
    fs.writeFileSync(toolPath, TEKS_BUKASC)
    await sendLocalMediaFast(conn, mTujuan, toolPath, { type: 'document', mimeType: 'text/javascript', fileName: 'bukasc.js', caption: 'Alat decrypt (.umienc) — jalankan dengan Node.', maxBytes: 1024 * 1024 })
      .catch(() => {})
      .finally(() => fs.rmSync(toolPath, { force: true }))
    console.log('[getsc] full terkirim ke', mTujuan.chat, jenis, `zip=${zip.bytes}B enc=${enc.length}B`)
    if (m.isGroup) await conn.reply(m.chat, '✅ Paket full akses dikirim ke private chat kamu.', m)
  } finally {
    fs.rmSync(zip.file, { force: true })
  }
}

/* ── handler ── */

const handler = async (m, { conn, isOwnerUtama, isDeveloper, usedPrefix }) => {
  if (!isOwnerUtama && !isDeveloper) {
    await m.reply('🔒 Perintah ini khusus *owner utama* atau *developer*.')
    return
  }
  izinMenu.set(m.sender, Date.now() + 5 * 60 * 1000)
  const tombol = [
    { label: '📦 Source code Umi lengkap', command: 'GETSC:LENGKAP' },
    { label: '💻 Source code Umi single bot', command: 'GETSC:SINGLE' },
    { label: '🔐 Umi lengkap (full akses + api/token)', command: 'GETSC:FULL:LENGKAP' },
    { label: '🔐 Umi single (full akses + api/token)', command: 'GETSC:FULL:SINGLE' },
  ]
  const isi = [
    '📦 *GET SOURCE CODE*',
    '',
    'Pilih source code yang mau dikirim:',
    '• *Umi lengkap* — versi multi-bot (banyak bot dari satu tempat)',
    '• *Umi single bot* — versi satu bot (ringkas)',
    '',
    'Versi *full akses* menyertakan config.js + token API — dikirim terkunci',
    'password lewat upload.gwenna.my.id, dan bot akan meminta password yang',
    'sama saat pairing.3× salah → instalasi bot dihancurkan otomatis.',
  ].join('\n')
  try {
    const { sendInteractive } = await import('../../lib/awang-tombol.js')
    await sendInteractive(conn, m.chat, {
      title: '📦 Source code bot',
      subtitle: 'Umi AI — pilihan versi',
      body: isi,
      footer: 'Umi GetSC',
      buttons: tombol,
      mentions: [m.sender],
      fallbackToText: true,
    })
  } catch {
    await m.reply(isi + '\n\nKetik manual: ' + tombol.map(t => `\`${t.command}\``).join(' '))
  }
  if (m.isGroup) await m.reply('📋 Menu dikirim ke private chat kamu.')
}

/* Tombol + alur password ditangkap tanpa prefix (Task196). */
handler.before = async function (m, { conn }) {
  if (!m.text || typeof m.text !== 'string') return
  const teks = m.text.trim()
  const tombol = teks.match(/^GETSC:(LENGKAP|SINGLE|FULL:LENGKAP|FULL:SINGLE)$/i)
  if (tombol) {
    const izin = izinMenu.get(m.sender) || 0
    if (izin < Date.now()) {
      izinMenu.delete(m.sender)
      await conn.reply(m.chat, '🔒 Jalankan /getsc dulu sebagai owner utama/developer.', m).catch(() => {})
      return true
    }
    const jenis = tombol[1].toUpperCase()
    if (jenis.startsWith('FULL:')) {
      menungguPassword = { jid: m.sender, jenis: jenis.split(':')[1], sampai: Date.now() + 5 * 60 * 1000, olehChat: m.chat }
      await conn.reply(m.chat, '🔐 Balas pesan ini dengan *password* (4–32 karakter) untuk mengunci paket full akses.\nPassword ini juga dipakai bot pengguna saat pairing —5 menit untuk membalas.', m).catch(() => {})
      return true
    }
    await kirimZipBersih(m, conn, jenis)
    return true
  }
  if (menungguPassword && menungguPassword.jid === m.sender) {
    if (Date.now() > menungguPassword.sampai) { menungguPassword = null; return }
    if (m.text.trim().match(/^GETSC:/i)) return
    const password = m.text.trim().slice(0, 32)
    const jenis = menungguPassword.jenis
    menungguPassword = null
    if (password.length < 4) {
      await conn.reply(m.chat, '❌ Password minimal4 karakter. Jalankan /getsc lagi untuk ulang.', m).catch(() => {})
      return true
    }
    await kirimFull(m, conn, jenis, password).catch(async e => {
      console.warn('[getsc full]', e?.message || e)
      await conn.reply(m.chat, `❌ Gagal menyiapkan paket full: ${e?.message || 'coba lagi.'}`, m).catch(() => {})
    })
    return true
  }
}

handler.command = /^(getsc)$/i
handler.help = ['getsc (owner utama/developer)']
handler.tags = ['owner']
handler.category = 'owner'
handler.description = 'Menu pilihan source code bot — versi bersih & full akses (terkunci password).'
handler.rowner = true
handler.limit = false

export default handler
