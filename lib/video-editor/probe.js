/* By AlzRiss - Usanagi Umi AI
 *
 * Task146 — pembaca metadata media (ffprobe) + normalisasi dimensi.
 *
 * Hal penting yang ditangani di sini:
 *   • ROTASI. Video HP sering direkam 1080x1920 dengan matriks rotasi 90°.
 *     Kalau rotasi diabaikan, kanvas hasil jadi miring/terpotong.
 *   • SAR/DAR non-square. Lebar efektif dihitung dari display aspect ratio.
 *   • Dimensi ganjil. H.264 yuv420p butuh lebar & tinggi genap.
 *   • ffprobe tidak selalu terpasang → ada jalur cadangan `ffmpeg -i`.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let _ffmpeg = ''
let _ffprobe = ''

function binDariPaket(namaPaket) {
  try {
    const mod = require(namaPaket)
    if (mod && mod.path && fs.existsSync(mod.path)) return mod.path
  } catch (e) { /* paket tidak ada */ }
  return ''
}

function cariDiPath(nama) {
  const hasil = spawnSync(process.platform === 'win32' ? 'where' : 'which', [nama], { encoding: 'utf8' })
  const baris = String(hasil.stdout || '').split('\n').map((x) => x.trim()).filter(Boolean)
  return baris[0] || ''
}

/** Path biner ffmpeg. Urutan: env → @ffmpeg-installer → PATH. */
export function ffmpegBin() {
  if (_ffmpeg) return _ffmpeg
  const env = String(process.env.VIDEO_EDITOR_FFMPEG || process.env.FFMPEG_PATH || '').trim()
  if (env && fs.existsSync(env)) return (_ffmpeg = env)
  const paket = binDariPaket('@ffmpeg-installer/ffmpeg')
  if (paket) return (_ffmpeg = paket)
  return (_ffmpeg = cariDiPath('ffmpeg') || 'ffmpeg')
}

/** Path biner ffprobe. Urutan: env → @ffprobe-installer → PATH → kosong. */
export function ffprobeBin() {
  if (_ffprobe) return _ffprobe
  const env = String(process.env.VIDEO_EDITOR_FFPROBE || process.env.FFPROBE_PATH || '').trim()
  if (env && fs.existsSync(env)) return (_ffprobe = env)
  const paket = binDariPaket('@ffprobe-installer/ffprobe')
  if (paket) return (_ffprobe = paket)
  return (_ffprobe = cariDiPath('ffprobe') || '')
}

/** Apakah ffmpeg bisa dijalankan (versi pertama dari stderr). */
export function cekFfmpeg() {
  try {
    const hasil = spawnSync(ffmpegBin(), ['-hide_banner', '-version'], { encoding: 'utf8', timeout: 15000 })
    if (hasil.status !== 0) return { ok: false, pesan: String(hasil.stderr || '').slice(0, 200) || 'ffmpeg tidak bisa dijalankan' }
    return { ok: true, versi: String(hasil.stdout || '').split('\n')[0] || 'ffmpeg' }
  } catch (error) {
    return { ok: false, pesan: error.message }
  }
}

/** Filter ffmpeg yang benar-benar tersedia. */
export function filterTersedia() {
  try {
    const hasil = spawnSync(ffmpegBin(), ['-hide_banner', '-filters'], { encoding: 'utf8', timeout: 20000 })
    const teks = String(hasil.stdout || '')
    const set = new Set()
    for (const baris of teks.split('\n')) {
      const cocok = baris.match(/^\s*[A-Z.|]{2,4}\s+([a-zA-Z0-9_]+)\s/)
      if (cocok) set.add(cocok[1])
    }
    return set
  } catch (error) {
    return new Set()
  }
}

const angkaAtau = (nilai, bawaan = 0) => {
  const n = Number(nilai)
  return Number.isFinite(n) ? n : bawaan
}

/** Jalankan ffprobe dan kembalikan JSON. */
function ffprobeJson(berkas) {
  const bin = ffprobeBin()
  if (!bin) return Promise.resolve(null)
  return new Promise((resolve) => {
    const anak = spawn(bin, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-show_entries', 'stream_side_data_list:stream_tags:format_tags',
      berkas,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    let keluar = ''
    let galat = ''
    const jam = setTimeout(() => { try { anak.kill('SIGKILL') } catch (e) { /* sudah mati */ } }, 20000)
    anak.stdout.on('data', (d) => { keluar += d.toString() })
    anak.stderr.on('data', (d) => { galat += d.toString() })
    anak.on('error', () => { clearTimeout(jam); resolve(null) })
    anak.on('close', () => {
      clearTimeout(jam)
      try { resolve(JSON.parse(keluar)) } catch (e) { resolve(null) }
      void galat
    })
  })
}

/** Jalur cadangan tanpa ffprobe: baca keluaran `ffmpeg -i`. */
function probeDariFfmpeg(berkas) {
  const hasil = spawnSync(ffmpegBin(), ['-hide_banner', '-i', berkas], { encoding: 'utf8', timeout: 30000 })
  const teks = String(hasil.stderr || '')
  const info = { lebar: 0, tinggi: 0, durasi: 0, fps: 0, punyaAudio: false, rotasi: 0, sar: '1:1', codec: '' }
  const durasi = teks.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
  if (durasi) info.durasi = Number(durasi[1]) * 3600 + Number(durasi[2]) * 60 + Number(durasi[3])
  const video = teks.match(/Stream #\d+:\d+.*?: Video: ([a-zA-Z0-9_]+).*?(\d{2,5})x(\d{2,5})/)
  if (video) {
    info.codec = video[1]
    info.lebar = Number(video[2])
    info.tinggi = Number(video[3])
  }
  info.punyaAudio = /Stream #\d+:\d+.*?: Audio:/.test(teks)
  const fps = teks.match(/([\d.]+) fps/)
  if (fps) info.fps = Number(fps[1])
  const rotate = teks.match(/rotate\s*:\s*(-?\d+)/)
  if (rotate) info.rotasi = Math.abs(Number(rotate[1])) % 360
  return info
}

/** Ambil rotasi dari side_data (display matrix) atau tag lama `rotate`. */
function bacaRotasi(stream) {
  let rotasi = 0
  const side = Array.isArray(stream?.side_data_list) ? stream.side_data_list : []
  for (const sd of side) {
    if (sd && (sd.rotation !== undefined || sd.rotate !== undefined)) {
      rotasi = angkaAtau(sd.rotation ?? sd.rotate, 0)
    }
  }
  if (!rotasi && stream?.tags?.rotate) rotasi = angkaAtau(stream.tags.rotate, 0)
  /* Normalisasi: -270 = 90, 270 = 270, 180 = 180. */
  rotasi = ((Math.round(rotasi) % 360) + 360) % 360
  return rotasi
}

/** Bulatkan ke bilangan genap terdekat (minimal 2). */
export function genap(n) {
  const v = Math.max(2, Math.round(Number(n) || 0))
  return v % 2 === 0 ? v : v + 1
}

/**
 * Baca metadata lengkap satu berkas media.
 * @returns {Promise<object>} {ok, jenis, lebar, tinggi, rotasi, fps, durasi, punyaAudio, ...}
 */
export async function periksaMedia(berkas, { jenisPetunjuk = '' } = {}) {
  if (!berkas || !fs.existsSync(berkas)) return { ok: false, galat: 'Berkas tidak ditemukan.' }
  const ukuran = fs.statSync(berkas).size
  if (!ukuran) return { ok: false, galat: 'Berkas kosong (0 byte).' }

  const json = await ffprobeJson(berkas)
  let data

  if (json && Array.isArray(json.streams) && json.streams.length) {
    const video = json.streams.find((s) => s.codec_type === 'video')
    const audio = json.streams.find((s) => s.codec_type === 'audio')
    if (!video) {
      if (audio) return { ok: false, galat: 'Berkas ini audio saja, bukan video/foto.' }
      return { ok: false, galat: 'Tidak ada stream video di dalam berkas.' }
    }
    const rotasi = bacaRotasi(video)
    const [sarNum, sarDen] = String(video.sample_aspect_ratio || '1:1').split(':').map(Number)
    data = {
      lebar: angkaAtau(video.width),
      tinggi: angkaAtau(video.height),
      rotasi,
      sar: sarNum && sarDen ? sarNum / sarDen : 1,
      dar: String(video.display_aspect_ratio || ''),
      fps: (() => {
        const r = String(video.avg_frame_rate || video.r_frame_rate || '0/1').split('/').map(Number)
        if (!r[0] || !r[1]) return 0
        const v = r[0] / r[1]
        return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0
      })(),
      durasi: angkaAtau(json.format?.duration ?? video.duration, 0),
      punyaAudio: Boolean(audio),
      codec: String(video.codec_name || ''),
      audioCodec: String(audio?.codec_name || ''),
      jumlahFrame: angkaAtau(video.nb_frames, 0),
      ukuran,
      format: String(json.format?.format_name || ''),
    }
  } else {
    const fb = probeDariFfmpeg(berkas)
    if (!fb.lebar || !fb.tinggi) {
      return { ok: false, galat: 'Berkas tidak bisa dibaca sebagai video/foto (mungkin rusak atau bukan media).' }
    }
    data = { ...fb, sar: 1, dar: '', jumlahFrame: 0, ukuran, audioCodec: '', format: '' }
  }

  if (!data.lebar || !data.tinggi) return { ok: false, galat: 'Ukuran video tidak terbaca.' }

  /* Foto: durasi 0 dan biasanya 1 frame. */
  const jenis = jenisPetunjuk || (data.durasi <= 0.1 || data.jumlahFrame === 1 ? 'foto' : 'video')

  /* Dimensi efektif SETELAH rotasi 90/270 ditukar. */
  const tukar = data.rotasi === 90 || data.rotasi === 270
  const lebarEfektif = Math.round(tukar ? data.tinggi : data.lebar)
  const tinggiEfektif = Math.round(tukar ? data.lebar : data.tinggi)

  /* SAR non-square: lebar tampilan = lebar * sar. */
  const lebarTampil = Math.round(lebarEfektif * (data.sar && data.sar > 0 ? data.sar : 1))

  return {
    ok: true,
    jenis,
    berkas,
    ukuran,
    ...data,
    lebarSumber: data.lebar,
    tinggiSumber: data.tinggi,
    lebar: lebarEfektif,
    tinggi: tinggiEfektif,
    lebarTampil,
    rasio: tinggiEfektif ? Math.round((lebarTampil / tinggiEfektif) * 10000) / 10000 : 0,
    orientasi: Math.abs(lebarTampil - tinggiEfektif) <= Math.max(2, tinggiEfektif * 0.01)
      ? 'square'
      : lebarTampil > tinggiEfektif ? 'landscape' : 'portrait',
  }
}

/** Folder sementara khusus satu pekerjaan (dibuat sekarang, dihapus pemanggil). */
export function folderSementara(awalan = 'video-editor') {
  const dasar = process.env.VIDEO_EDITOR_TEMP_DIR || os.tmpdir()
  fs.mkdirSync(dasar, { recursive: true })
  return fs.mkdtempSync(path.join(dasar, awalan + '-'))
}

export default { periksaMedia, ffmpegBin, ffprobeBin, cekFfmpeg, filterTersedia, genap, folderSementara }
