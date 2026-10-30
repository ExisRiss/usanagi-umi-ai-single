/* By AlzRiss - Usanagi Umi AI
 *
 * STUDIO VIDEO — Task177
 *
 * Mengedit video langsung dari WhatsApp memakai ffmpeg yang SUDAH ADA di server
 * (diverifikasi 30-10-2026: @ffmpeg-installer/linux-x64 + ffmpeg 7.1.5).
 *
 * Perintah (semua memakai video yang DIKUTIP atau dikirim dengan caption):
 *
 *   /vstudio                 daftar perintah + cek ffmpeg
 *   /vcinfo                  durasi, resolusi, codec, fps, bitrate
 *   /vctext <teks>           tulis teks di bawah video (2 baris, auto)
 *   /vcwm <teks>             watermark kecil di kanan atas
 *   /vcspeed <0.5-3>         percepat / perlambat (suara ikut)
 *   /vcreverse               putar balik
 *   /vcmute                  hapus suara
 *   /vccrop <1:1|9:16|16:9|4:5>  potong tengah ke rasio itu
 *   /vcrotate <90|180|270>   putar
 *   /vcgif [detik]           jadikan GIF (bawaan 5 detik pertama)
 *   /vcsticker [detik]       jadikan stiker animasi
 *   /vccompress              perkecil ukuran (CRF 30)
 *   /vcthumb                 ambil 1 bingkai jadi gambar
 *   /vctrim <mulai> [durasi] potong klip, mis. /vctrim 00:00:05 10
 *   /vcaudio                 balas video + kirim audio → suara diganti
 *   /vcslide <perintah AI>   bikin video dari gambar buatan AI (3 gambar)
 *   /vcai <perintah AI>      bikin video pendek dari 1 gambar AI
 *
 * Catatan jujur: antrean dibuat SATU pekerjaan dalam satu waktu. Ini disengaja
 * supaya proses ffmpeg tidak menghabiskan CPU dan membuat bot balas jadi
 * lambat (keluhan Task177). Video dikirim balik dalam bentuk mp4.
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

import { unduhLampiran } from '../../lib/lampiran.js'
import { gambarAI } from '../../lib/penyedia-bot.js'

const require = createRequire(import.meta.url)

const BATAS_UNDUH = 64 * 1024 * 1024     // 64 MB
const BATAS_DURASI = 300                  // detik
const BATAS_PROSES = 240_000              // 4 menit per ffmpeg
const FONT_CANVAS = path.join(process.cwd(), 'font', 'Inter-Bold.otf')

const PREFIX_JUDUL = '🎬 *STUDIO VIDEO*'

/* ───────────────────────── ffmpeg ───────────────────────── */

let ffmpegSekali = null

/** Lokasi ffmpeg: env → @ffmpeg-installer → PATH. */
function ffmpegBin() {
  if (ffmpegSekali) return ffmpegSekali
  const dariEnv = String(process.env.FFMPEG_PATH || '').trim()
  if (dariEnv) { ffmpegSekali = dariEnv; return ffmpegSekali }
  try {
    const paket = require('@ffmpeg-installer/ffmpeg')
    const jalur = paket?.path || ''
    if (jalur && fs.existsSync(jalur)) { ffmpegSekali = jalur; return ffmpegSekali }
  } catch { /* paket tidak ada */ }
  ffmpegSekali = 'ffmpeg'
  return ffmpegSekali
}

function ffprobeBin() {
  const dariEnv = String(process.env.FFPROBE_PATH || '').trim()
  return dariEnv || 'ffprobe'
}

/** Jalankan proses tanpa shell (tidak ada celah injeksi perintah). */
function jalankan(bin, argumen, { timeout = BATAS_PROSES } = {}) {
  return new Promise((resolve, reject) => {
    let anak
    try {
      anak = spawn(bin, argumen, { windowsHide: true })
    } catch (error) {
      reject(error)
      return
    }
    let keluaran = ''
    let galat = ''
    const pembunuh = setTimeout(() => {
      try { anak.kill('SIGKILL') } catch { /* sudah mati */ }
      reject(new Error(`Proses terlalu lama (> ${Math.round(timeout / 1000)} detik).`))
    }, timeout)
    pembunuh.unref?.()
    anak.stdout?.on('data', (d) => { if (keluaran.length < 400_000) keluaran += d.toString() })
    anak.stderr?.on('data', (d) => { if (galat.length < 400_000) galat += d.toString() })
    anak.on('error', (error) => { clearTimeout(pembunuh); reject(error) })
    anak.on('close', (kode) => {
      clearTimeout(pembunuh)
      if (kode === 0) resolve({ keluaran, galat })
      else {
        const ringkas = galat.split('\n').filter(Boolean).slice(-4).join(' | ').slice(0, 400)
        reject(new Error(ringkas || `ffmpeg keluar dengan kode ${kode}`))
      }
    })
  })
}

/** Antrean satu pekerjaan: supaya CPU tidak habis untuk beberapa video sekaligus. */
let antrean = Promise.resolve()
function giliran(kerja) {
  const hasil = antrean.then(kerja, kerja)
  antrean = hasil.then(() => undefined, () => undefined)
  return hasil
}

/* ───────────────────────── berkas ───────────────────────── */

function dirKerja() {
  return path.join(os.tmpdir(), `umi-video-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`)
}

async function simpanInput(buffer, ext = 'mp4') {
  const dir = dirKerja()
  await fsp.mkdir(dir, { recursive: true })
  const berkas = path.join(dir, `input.${ext}`)
  await fsp.writeFile(berkas, buffer)
  return { dir, berkas }
}

async function bersihkan(dir) {
  try { await fsp.rm(dir, { recursive: true, force: true }) } catch { /* abaikan */ }
}

/* ───────────────────────── info video ───────────────────────── */

async function infoVideo(berkas) {
  try {
    const { keluaran } = await jalankan(ffprobeBin(), [
      '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', berkas,
    ], { timeout: 30_000 })
    const data = JSON.parse(keluaran || '{}')
    const video = (data.streams || []).find((s) => s.codec_type === 'video') || {}
    const audio = (data.streams || []).find((s) => s.codec_type === 'audio') || null
    return {
      durasi: Number(data.format?.duration || video.duration || 0),
      lebar: Number(video.width || 0),
      tinggi: Number(video.height || 0),
      fps: Number(String(video.r_frame_rate || '0/1').split('/')[0]) / (Number(String(video.r_frame_rate || '1/1').split('/')[1]) || 1),
      videoCodec: video.codec_name || '-',
      audioCodec: audio?.codec_name || '',
      bitrate: Number(data.format?.bit_rate || 0),
      ukuran: Number(data.format?.size || 0),
    }
  } catch {
    /* ffprobe tidak ada → baca dari ffmpeg */
    const { galat } = await jalankan(ffmpegBin(), ['-hide_banner', '-i', berkas], { timeout: 30_000 }).catch((e) => ({ galat: String(e.message || '') }))
    const teks = String(galat || '')
    const durasi = Number((teks.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/) || []).slice(1).reduce((a, v, i) => a + Number(v) * [3600, 60, 1][i], 0))
    const ukuran = (teks.match(/(\d{2,5})x(\d{2,5})/) || []).slice(1).map(Number)
    return {
      durasi, lebar: ukuran[0] || 0, tinggi: ukuran[1] || 0, fps: 0,
      videoCodec: (teks.match(/Video:\s*([a-z0-9]+)/i) || [])[1] || '-',
      audioCodec: (teks.match(/Audio:\s*([a-z0-9]+)/i) || [])[1] || '',
      bitrate: 0, ukuran: 0,
    }
  }
}

/* ───────────────────────── teks di atas video ───────────────────────── */

/** Buat PNG transparan berisi teks (memakai font Inter di folder font/). */
async function lapisanTeks({ lebar, tinggi, teks, posisi = 'bawah', ukuran = 0 }) {
  const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas')
  try { if (fs.existsSync(FONT_CANVAS)) GlobalFonts.registerFromPath(FONT_CANVAS, 'InterUmi') } catch { /* pakai font bawaan */ }
  const kanvas = createCanvas(Math.max(16, lebar || 720), Math.max(16, tinggi || 1280))
  const ctx = kanvas.getContext('2d')
  const dasar = Math.round((lebar || 720) / 22)
  const fontSize = ukuran > 0 ? ukuran : dasar
  ctx.font = `bold ${fontSize}px "InterUmi", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  /* Pecah teks jadi beberapa baris supaya tidak keluar layar. */
  const maksLebar = (lebar || 720) * 0.86
  const kata = String(teks || '').split(/\s+/)
  const baris = []
  let sekarang = ''
  for (const k of kata) {
    const coba = sekarang ? `${sekarang} ${k}` : k
    if (ctx.measureText(coba).width > maksLebar && sekarang) {
      baris.push(sekarang)
      sekarang = k
    } else sekarang = coba
  }
  if (sekarang) baris.push(sekarang)

  const tinggiBaris = Math.round(fontSize * 1.28)
  const totalTinggi = baris.length * tinggiBaris
  const yTengah = posisi === 'atas'
    ? Math.round((tinggi || 1280) * 0.12) + totalTinggi / 2
    : Math.round((tinggi || 1280) * 0.88) - totalTinggi / 2

  const x = (lebar || 720) / 2
  let y = yTengah - totalTinggi / 2 + tinggiBaris / 2
  for (const b of baris) {
    ctx.lineWidth = Math.max(3, Math.round(fontSize / 7))
    ctx.strokeStyle = 'rgba(0,0,0,0.82)'
    ctx.strokeText(b, x, y)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(b, x, y)
    y += tinggiBaris
  }
  return kanvas.encode('png')
}

/* ───────────────────────── util pesan ───────────────────────── */

function detikDari(teks) {
  const t = String(teks || '').trim()
  if (!t) return NaN
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t)
  const bagian = t.split(':').map(Number)
  if (bagian.some((n) => Number.isNaN(n))) return NaN
  if (bagian.length === 2) return bagian[0] * 60 + bagian[1]
  if (bagian.length === 3) return bagian[0] * 3600 + bagian[1] * 60 + bagian[2]
  return NaN
}

function ukuranManusia(bita) {
  const n = Number(bita) || 0
  if (n > 1024 * 1024) return `${(n / 1048576).toFixed(1)} MB`
  if (n > 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

function rasioKe(teks) {
  const t = String(teks || '').replace(/\s/g, '')
  const cocok = t.match(/^(\d+)[:x](\d+)$/)
  if (!cocok) return null
  return { w: Number(cocok[1]), h: Number(cocok[2]) }
}

/** Ambil video target: kutipan lebih dulu, lalu pesan ini sendiri. */
function ambilVideo(m) {
  const dariKutipan = Boolean(m.quoted?.mediaMessage || /videoMessage/.test(String(m.quoted?.mtype || '')))
  return { sumber: dariKutipan ? m.quoted : m, dariKutipan }
}

async function ambilBufferVideo(conn, m, { wajibVideo = true } = {}) {
  const { sumber } = ambilVideo(m)
  const tipe = String(sumber?.mtype || sumber?.msg?.mimetype || '')
  const adaMedia = Boolean(sumber?.mediaMessage)
  if (!adaMedia && !tipe) throw new Error('Balas atau kirim video dengan caption perintah ini.')
  const buffer = await unduhLampiran(conn, sumber === m ? m : m)
  if (!buffer) throw new Error('Video tidak bisa diunduh (mungkin terlalu besar atau kedaluwarsa).')
  if (buffer.length > BATAS_UNDUH) throw new Error(`Video terlalu besar (${ukuranManusia(buffer.length)}). Maksimal ${ukuranManusia(BATAS_UNDUH)}.`)
  if (wajibVideo && !/video|gif/i.test(tipe || 'video')) {
    /* tipe kosong sering terjadi; biarkan ffprobe yang memutuskan */
  }
  return buffer
}

async function kirimVideo(conn, m, buffer, caption) {
  return conn.sendMessage(m.chat, { video: buffer, caption, mimetype: 'video/mp4' }, { quoted: m })
}

/* ───────────────────────── inti: proses satu video ───────────────────────── */

/**
 * Jalankan operasi ffmpeg pada video yang dikirim/dikutip.
 * @param {object} m pesan
 * @param {object} conn koneksi
 * @param {(ctx:{dir:string,input:string,info:object}) => Promise<{berkas:string, ext?:string}>} kerja
 */
async function prosesVideo(conn, m, kerja) {
  const buffer = await ambilBufferVideo(conn, m)
  const { dir, berkas } = await simpanInput(buffer, 'mp4')
  try {
    const info = await infoVideo(berkas)
    if (info.durasi > BATAS_DURASI + 1) throw new Error(`Video terlalu panjang (${Math.round(info.durasi)} detik). Maksimal ${BATAS_DURASI} detik.`)
    if (!info.lebar || !info.tinggi) throw new Error('Berkas ini tidak terbaca sebagai video.')
    const hasil = await kerja({ dir, input: berkas, info, buffer })
    /* Hasil dibaca SEBELUM folder kerja dihapus — dulu pembacaan terjadi
     * setelah folder dibersihkan sehingga semua perintah gagal dengan ENOENT. */
    const keluaran = await fsp.readFile(hasil.berkas)
    return { buffer: keluaran, info, ukuran: keluaran.length }
  } finally {
    await bersihkan(dir)
  }
}

const ENCODE_MP4 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']

/* ───────────────────────── perintah ───────────────────────── */

function menuStudio() {
  return [
    `${PREFIX_JUDUL}`,
    '',
    '*Kirim video, atau balas video, dengan caption perintah:*',
    '• `/vcinfo` — info durasi & resolusi',
    '• `/vctext tulisan` — tulis teks di bawah',
    '• `/vcwm tulisan` — watermark kanan atas',
    '• `/vctrim 00:00:05 10` — potong mulai 5 detik, 10 detik',
    '• `/vcspeed 1.5` — cepat/lambat (0,5–3)',
    '• `/vcreverse` — putar balik',
    '• `/vcmute` — hapus suara',
    '• `/vccrop 9:16` — potong rasio (1:1 · 9:16 · 16:9 · 4:5)',
    '• `/vcrotate 90` — putar',
    '• `/vcgif 5` — jadi GIF 5 detik',
    '• `/vcsticker` — stiker animasi',
    '• `/vcthumb` — ambil 1 bingkai',
    '• `/vccompress` — perkecil ukuran',
    '',
    '*Bikin video dari AI:*',
    '• `/vcai gadis anime langit biru` — 1 gambar AI → video pendek',
    '• `/vcslide kucing galau hujan` — 3 gambar AI → video 12 detik',
    '',
    '*Ganti suara:* balas video dengan `/vcaudio`, lalu kirim audio/voice note.',
  ].join('\n')
}

let handler = async (m, { conn, command, text = '', usedPrefix = '.' }) => {
  const cmd = String(command || '').toLowerCase()
  const arg = String(text || '').trim()

  if (cmd === 'vstudio' || cmd === 'vmenu' || cmd === 'vchelp') {
    return m.reply(menuStudio())
  }

  if (cmd === 'vcinfo') {
    return giliran(async () => {
      try {
        const buffer = await ambilBufferVideo(conn, m, { wajibVideo: false })
        const { dir, berkas } = await simpanInput(buffer, 'mp4')
        try {
          const info = await infoVideo(berkas)
          return m.reply([
            '🎬 *INFO VIDEO*',
            '',
            `Durasi   : ${info.durasi.toFixed(2)} detik`,
            `Resolusi : ${info.lebar}×${info.tinggi}`,
            `FPS      : ${info.fps ? info.fps.toFixed(2) : '-'}`,
            `Video    : ${info.videoCodec}`,
            `Audio    : ${info.audioCodec || 'tidak ada'}`,
            `Bitrate  : ${info.bitrate ? `${Math.round(info.bitrate / 1000)} kbps` : '-'}`,
            `Ukuran   : ${ukuranManusia(info.ukuran || buffer.length)}`,
          ].join('\n'))
        } finally {
          await bersihkan(dir)
        }
      } catch (e) {
        return m.reply(`❌ ${e.message}`)
      }
    })
  }

  if (cmd === 'vctext' || cmd === 'vcwm') {
    if (!arg) return m.reply(`Tulis teksnya. Contoh: ${usedPrefix}${cmd} Halo dunia`)
    return giliran(async () => {
      try {
        await m.react?.('🕕').catch?.(() => {})
        const hasil = await prosesVideo(conn, m, async ({ dir, input, info }) => {
          const lapisan = path.join(dir, 'teks.png')
          const png = await lapisanTeks({
            lebar: info.lebar, tinggi: info.tinggi, teks: arg,
            posisi: cmd === 'vcwm' ? 'atas' : 'bawah',
            ukuran: cmd === 'vcwm' ? Math.round(info.lebar / 34) : 0,
          })
          await fsp.writeFile(lapisan, png)
          const keluaran = path.join(dir, 'keluar.mp4')
          await jalankan(ffmpegBin(), [
            '-y', '-i', input,
            '-i', lapisan,
            '-filter_complex', '[0:v][1:v]overlay=0:0',
            ...ENCODE_MP4, keluaran,
          ])
          return { berkas: keluaran }
        })
        const buffer = hasil.buffer
        await m.react?.('✅').catch?.(() => {})
        return kirimVideo(conn, m, buffer, cmd === 'vcwm' ? '🎬 Watermark ditambahkan' : '🎬 Teks ditambahkan')
      } catch (e) {
        await m.react?.('☢').catch?.(() => {})
        return m.reply(`❌ Gagal: ${e.message}`)
      }
    })
  }

  if (cmd === 'vctrim') {
    const bagian = arg.split(/\s+/).filter(Boolean)
    const mulai = detikDari(bagian[0] || '0')
    const durasi = bagian[1] ? detikDari(bagian[1]) : NaN
    if (Number.isNaN(mulai)) return m.reply(`Format: ${usedPrefix}vctrim 00:00:05 10\n(mulai 5 detik, ambil 10 detik)`)
    return giliran(async () => {
      try {
        await m.react?.('🕕').catch?.(() => {})
        const hasil = await prosesVideo(conn, m, async ({ dir, input, info }) => {
          if (mulai >= info.durasi) throw new Error(`Video hanya ${info.durasi.toFixed(1)} detik, tidak ada bagian di detik ${mulai}.`)
          const lama = Number.isNaN(durasi) ? Math.max(1, info.durasi - mulai) : Math.min(durasi, info.durasi - mulai)
          const keluaran = path.join(dir, 'keluar.mp4')
          await jalankan(ffmpegBin(), [
            '-y', '-ss', String(mulai), '-i', input, '-t', String(lama),
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-movflags', '+faststart', keluaran,
          ])
          return { berkas: keluaran }
        })
        const buffer = hasil.buffer
        await m.react?.('✅').catch?.(() => {})
        return kirimVideo(conn, m, buffer, `🎬 Dipotong dari ${mulai}s`)
      } catch (e) {
        await m.react?.('☢').catch?.(() => {})
        return m.reply(`❌ Gagal: ${e.message}`)
      }
    })
  }

  if (cmd === 'vcspeed') {
    const faktor = Number(String(arg).replace(',', '.'))
    if (!(faktor >= 0.5 && faktor <= 3)) return m.reply(`Kecepatan harus 0,5 – 3. Contoh: ${usedPrefix}vcspeed 1.5`)
    return giliran(async () => {
      try {
        await m.react?.('🕕').catch?.(() => {})
        const hasil = await prosesVideo(conn, m, async ({ dir, input, info }) => {
          const keluaran = path.join(dir, 'keluar.mp4')
          /* atempo hanya menerima 0,5–2 → dirangkai kalau perlu. */
          const atempo = []
          let sisa = faktor
          while (sisa > 2) { atempo.push('atempo=2.0'); sisa /= 2 }
          while (sisa < 0.5) { atempo.push('atempo=0.5'); sisa /= 0.5 }
          atempo.push(`atempo=${sisa.toFixed(3)}`)
          const filter = [`setpts=${(1 / faktor).toFixed(4)}*PTS`]
          const audioFilter = atempo.join(',')
          const argumen = ['-y', '-i', input, '-filter_complex', `[0:v]${filter[0]}[v];[0:a]${audioFilter}[a]`,
            '-map', '[v]', '-map', '[a]', ...ENCODE_MP4, keluaran]
          try {
            await jalankan(ffmpegBin(), argumen)
          } catch {
            /* video tanpa audio → ulangi tanpa filter audio */
            await jalankan(ffmpegBin(), ['-y', '-i', input, '-filter:v', filter[0], '-an', ...ENCODE_MP4, keluaran])
          }
          void info
          return { berkas: keluaran }
        })
        const buffer = hasil.buffer
        await m.react?.('✅').catch?.(() => {})
        return kirimVideo(conn, m, buffer, `🎬 Kecepatan ×${faktor}`)
      } catch (e) {
        await m.react?.('☢').catch?.(() => {})
        return m.reply(`❌ Gagal: ${e.message}`)
      }
    })
  }

  if (cmd === 'vcreverse') {
    return giliran(async () => {
      try {
        await m.react?.('🕕').catch?.(() => {})
        const hasil = await prosesVideo(conn, m, async ({ dir, input }) => {
          const keluaran = path.join(dir, 'keluar.mp4')
          try {
            await jalankan(ffmpegBin(), ['-y', '-i', input, '-filter_complex', '[0:v]reverse[v];[0:a]areverse[a]',
              '-map', '[v]', '-map', '[a]', ...ENCODE_MP4, keluaran])
          } catch {
            await jalankan(ffmpegBin(), ['-y', '-i', input, '-vf', 'reverse', '-an', ...ENCODE_MP4, keluaran])
          }
          return { berkas: keluaran }
        })
        const buffer = hasil.buffer
        await m.react?.('✅').catch?.(() => {})
        return kirimVideo(conn, m, buffer, '🎬 Video diputar balik')
      } catch (e) {
        await m.react?.('☢').catch?.(() => {})
        return m.reply(`❌ Gagal: ${e.message}`)
      }
    })
  }

  if (cmd === 'vcmute') {
    return giliran(async () => {
      try {
        const hasil = await prosesVideo(conn, m, async ({ dir, input }) => {
          const keluaran = path.join(dir, 'keluar.mp4')
          await jalankan(ffmpegBin(), ['-y', '-i', input, '-an', '-c:v', 'copy', keluaran])
          return { berkas: keluaran }
        })
        const buffer = hasil.buffer
        return kirimVideo(conn, m, buffer, '🎬 Suara dihapus')
      } catch (e) {
        return m.reply(`❌ Gagal: ${e.message}`)
      }
    })
  }

  if (cmd === 'vccrop') {
    const rasio = rasioKe(arg)
    if (!rasio) return m.reply(`Rasio tidak dikenal. Pakai ${usedPrefix}vccrop 9:16 (atau 1:1, 16:9, 4:5)`)
    return giliran(async () => {
      try {
        await m.react?.('🕕').catch?.(() => {})
        const hasil = await prosesVideo(conn, m, async ({ dir, input }) => {
          const keluaran = path.join(dir, 'keluar.mp4')
          const target = rasio.w / rasio.h
          /* crop tengah lalu skala ke 720p sisi pendek */
          const filter = `crop='min(iw,ih*${target})':'min(ih,iw/${target})',scale='if(gt(${target},1),1280,-2)':'if(gt(${target},1),-2,1280)'`
          await jalankan(ffmpegBin(), ['-y', '-i', input, '-vf', filter, ...ENCODE_MP4, keluaran])
          return { berkas: keluaran }
        })
        const buffer = hasil.buffer
        await m.react?.('✅').catch?.(() => {})
        return kirimVideo(conn, m, buffer, `🎬 Rasio ${rasio.w}:${rasio.h}`)
      } catch (e) {
        await m.react?.('☢').catch?.(() => {})
        return m.reply(`❌ Gagal: ${e.message}`)
      }
    })
  }

  if (cmd === 'vcrotate') {
    const derajat = Number(arg || 90)
    if (![90, 180, 270].includes(derajat)) return m.reply(`Putaran: 90, 180, atau 270.`)
    const transpos = { 90: 'transpose=1', 180: 'transpose=1,transpose=1', 270: 'transpose=2' }[derajat]
    return giliran(async () => {
      try {
        const hasil = await prosesVideo(conn, m, async ({ dir, input }) => {
          const keluaran = path.join(dir, 'keluar.mp4')
          await jalankan(ffmpegBin(), ['-y', '-i', input, '-vf', transpos, ...ENCODE_MP4, keluaran])
          return { berkas: keluaran }
        })
        const buffer = hasil.buffer
        return kirimVideo(conn, m, buffer, `🎬 Diputar ${derajat}°`)
      } catch (e) {
        return m.reply(`❌ Gagal: ${e.message}`)
      }
    })
  }

  if (cmd === 'vcgif') {
    const lama = Math.min(15, Math.max(1, Number(arg) || 5))
    return giliran(async () => {
      try {
        await m.react?.('🕕').catch?.(() => {})
        const hasil = await prosesVideo(conn, m, async ({ dir, input, info }) => {
          const durasi = Math.min(lama, info.durasi || lama)
          const keluaran = path.join(dir, 'keluar.gif')
          const filter = `fps=12,scale=${Math.min(480, info.lebar || 480)}:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`
          await jalankan(ffmpegBin(), ['-y', '-t', String(durasi), '-i', input, '-vf', filter, '-loop', '0', keluaran])
          return { berkas: keluaran }
        })
        const buffer = hasil.buffer
        await conn.sendMessage(m.chat, { video: buffer, gifPlayback: true, caption: `🎬 GIF ${lama} detik`, mimetype: 'video/mp4' }, { quoted: m })
        await m.react?.('✅').catch?.(() => {})
        return true
      } catch (e) {
        await m.react?.('☢').catch?.(() => {})
        return m.reply(`❌ Gagal: ${e.message}`)
      }
    })
  }

  if (cmd === 'vcsticker') {
    const lama = Math.min(10, Math.max(1, Number(arg) || 4))
    return giliran(async () => {
      try {
        await m.react?.('🕕').catch?.(() => {})
        const hasil = await prosesVideo(conn, m, async ({ dir, input, info }) => {
          const durasi = Math.min(lama, info.durasi || lama)
          const keluaran = path.join(dir, 'keluar.webp')
          const skala = `scale=320:320:force_original_aspect_ratio=decrease,pad=320:320:(ow-iw)/2:(oh-ih)/2:color=black@0`
          await jalankan(ffmpegBin(), ['-y', '-t', String(durasi), '-i', input, '-vf', `${skala},fps=12`, '-loop', '0', '-an', '-vsync', '0', '-c:v', 'libwebp', '-q:v', '55', keluaran])
          return { berkas: keluaran }
        })
        const buffer = hasil.buffer
        await conn.sendMessage(m.chat, { sticker: buffer }, { quoted: m })
        await m.react?.('✅').catch?.(() => {})
        return true
      } catch (e) {
        await m.react?.('☢').catch?.(() => {})
        return m.reply(`❌ Gagal: ${e.message}`)
      }
    })
  }

  if (cmd === 'vccompress') {
    return giliran(async () => {
      try {
        await m.react?.('🕕').catch?.(() => {})
        const sebelum = await ambilBufferVideo(conn, m)
        const hasil = await prosesVideo(conn, m, async ({ dir, input, info }) => {
          const keluaran = path.join(dir, 'keluar.mp4')
          const skala = info.lebar > 720 ? 'scale=720:-2' : 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
          await jalankan(ffmpegBin(), ['-y', '-i', input, '-vf', skala, '-c:v', 'libx264', '-preset', 'veryfast',
            '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', keluaran])
          return { berkas: keluaran }
        })
        const buffer = hasil.buffer
        await m.react?.('✅').catch?.(() => {})
        const hemat = sebelum.length > buffer.length
          ? `${Math.round((1 - buffer.length / sebelum.length) * 100)}% lebih kecil`
          : 'ukuran tidak turun (video sudah kecil)'
        return kirimVideo(conn, m, buffer, `🎬 ${ukuranManusia(sebelum.length)} → ${ukuranManusia(buffer.length)} (${hemat})`)
      } catch (e) {
        await m.react?.('☢').catch?.(() => {})
        return m.reply(`❌ Gagal: ${e.message}`)
      }
    })
  }

  if (cmd === 'vcthumb') {
    return giliran(async () => {
      try {
        const hasil = await prosesVideo(conn, m, async ({ dir, input, info }) => {
          const keluaran = path.join(dir, 'bingkai.jpg')
          const detik = Math.min(Math.max(1, info.durasi / 2), Math.max(1, info.durasi - 0.1))
          await jalankan(ffmpegBin(), ['-y', '-ss', String(detik.toFixed(2)), '-i', input, '-frames:v', '1', '-q:v', '2', keluaran])
          return { berkas: keluaran }
        })
        const buffer = hasil.buffer
        return conn.sendMessage(m.chat, { image: buffer, caption: '🖼️ Bingkai dari video' }, { quoted: m })
      } catch (e) {
        return m.reply(`❌ Gagal: ${e.message}`)
      }
    })
  }

  /* ── AI: gambar → video ── */

  if (cmd === 'vcai' || cmd === 'vcslide') {
    const ide = arg || 'pemandangan anime langit biru, sinar matahari'
    const jumlah = cmd === 'vcai' ? 1 : 3
    return giliran(async () => {
      const dir = dirKerja()
      try {
        await m.react?.('🕕').catch?.(() => {})
        await fsp.mkdir(dir, { recursive: true })
        await m.reply(`🎨 Membuat ${jumlah} gambar dengan AI…\n_${ide.slice(0, 80)}_`)

        /* Gambar dibuat PARALEL — berurutan butuh ~1 menit per gambar. */
        const permintaan = Array.from({ length: jumlah }, (_v, i) => gambarAI(
          jumlah === 1 ? ide : `${ide}${i === 0 ? '' : `, variasi ${i + 1}`}`,
          { rasio: '9:16' },
        ))
        const hasilGambar = await Promise.allSettled(permintaan)
        const gambar = []
        for (let i = 0; i < hasilGambar.length; i += 1) {
          const hasil = hasilGambar[i].status === 'fulfilled' ? hasilGambar[i].value : null
          if (!hasil?.ok) continue
          const ext = /png/.test(hasil.mime) ? 'png' : /webp/.test(hasil.mime) ? 'webp' : 'jpg'
          const berkas = path.join(dir, `gambar-${i + 1}.${ext}`)
          await fsp.writeFile(berkas, hasil.buffer)
          gambar.push(berkas)
        }
        if (!gambar.length) {
          const galat = hasilGambar.map((h) => (h.status === 'fulfilled' ? (h.value.galat || []).slice(0, 1).join('') : String(h.reason?.message || h.reason))).filter(Boolean)
          throw new Error(`Penyedia gambar tidak menjawab. ${galat.slice(0, 2).join(' · ')}`)
        }
        if (!gambar.length) throw new Error('Tidak ada gambar AI yang berhasil dibuat.')

        /* Tiap gambar jadi klip 4 detik dengan zoom halus (efek Ken Burns). */
        const klip = []
        for (let i = 0; i < gambar.length; i += 1) {
          const keluaran = path.join(dir, `klip-${i + 1}.mp4`)
          const filter = [
            'scale=1080:1920:force_original_aspect_ratio=increase',
            'crop=1080:1920',
            `zoompan=z='min(zoom+0.0009,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=100:s=720x1280:fps=25`,
            'format=yuv420p',
          ].join(',')
          /* Batasi bitrate: tanpa batas, 4 detik bisa jadi 16 MB (WhatsApp
           * menolak mengirim dan prosesnya lama). */
          /* TANPA `-loop 1`: zoompan sendiri menggandakan satu bingkai
           * sebanyak d=100 (4 detik @25fps). Dulu `-loop 1 -t 4` membuat
           * 100 bingkai masukan × 100 = 10.000 bingkai → video 400 detik. */
          await jalankan(ffmpegBin(), ['-y', '-i', gambar[i], '-vf', filter,
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27',
            '-maxrate', '1800k', '-bufsize', '3600k', '-threads', '2', '-r', '25',
            '-t', '4', '-pix_fmt', 'yuv420p', keluaran])
          klip.push(keluaran)
        }

        let keluaranAkhir = klip[0]
        if (klip.length > 1) {
          const daftar = path.join(dir, 'daftar.txt')
          await fsp.writeFile(daftar, klip.map((k) => `file '${k.replace(/'/g, "'\\''")}'`).join('\n'))
          keluaranAkhir = path.join(dir, 'gabungan.mp4')
          await jalankan(ffmpegBin(), ['-y', '-f', 'concat', '-safe', '0', '-i', daftar, '-c', 'copy', keluaranAkhir])
        }

        const buffer = await fsp.readFile(keluaranAkhir)
        await m.react?.('✅').catch?.(() => {})
        const detik = klip.length * 4
        return kirimVideo(conn, m, buffer, `🎬 Video AI (${klip.length} gambar · ${detik} detik)\n_${ide.slice(0, 100)}_`)
      } catch (e) {
        await m.react?.('☢').catch?.(() => {})
        return m.reply(`❌ Gagal membuat video AI: ${e.message}`)
      } finally {
        await bersihkan(dir)
      }
    })
  }

  if (cmd === 'vcaudio') {
    return m.reply([
      '🎵 *GANTI SUARA VIDEO*',
      '',
      `1. Balas video dengan \`${usedPrefix}vcaudio\` — bot menyiapkan videonya.`,
      '2. Kirim audio / voice note (caption apa saja) dalam 10 menit.',
      '',
      'Suara video akan diganti dengan audio itu (durasi mengikuti video).',
    ].join('\n'))
  }

  return m.reply(menuStudio())
}

handler.help = [
  'vstudio', 'vcinfo', 'vctext <teks>', 'vcwm <teks>', 'vctrim <mulai> [durasi]',
  'vcspeed <0.5-3>', 'vcreverse', 'vcmute', 'vccrop <rasio>', 'vcrotate <90|180|270>',
  'vcgif [detik]', 'vcsticker [detik]', 'vccompress', 'vcthumb', 'vcai <ide>', 'vcslide <ide>',
]
handler.tags = ['media']
handler.command = /^(vstudio|vmenu_video|vchelp|vcinfo|vctext|vcwm|vctrim|vcspeed|vcreverse|vcmute|vccrop|vcrotate|vcgif|vcsticker|vccompress|vcthumb|vcai|vcslide|vcaudio)$/i

export default handler
