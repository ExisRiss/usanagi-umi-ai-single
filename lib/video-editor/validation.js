/* By AlzRiss - Usanagi Umi AI
 *
 * Task146 — validasi masukan sebelum menyentuh FFmpeg.
 *
 * Semua yang datang dari WhatsApp diperlakukan sebagai data tidak tepercaya:
 * jenis MIME, ukuran, jumlah media, durasi, template, font, logo, dan nama
 * berkas. Tidak ada path dari pengguna yang dipakai langsung.
 */
import path from 'node:path'
import { KONFIG } from './config.js'
import { DAFTAR_TEMPLATE } from './templates.js'

const MIME_VIDEO = /^video\/(mp4|quicktime|x-matroska|webm|3gpp)$/i
const MIME_FOTO = /^image\/(jpeg|jpg|png|webp)$/i
const EKST_VIDEO = /\.(mp4|mov|mkv|webm|3gp)$/i
const EKST_FOTO = /\.(jpe?g|png|webp)$/i
const EKST_LOGO = /\.png$/i

export const JENIS_DIDUKUNG = ['video', 'foto']

/** Tebak jenis media dari MIME/nama berkas. */
export function tebakJenis(mime = '', nama = '') {
  const m = String(mime || '').toLowerCase().split(';')[0].trim()
  if (MIME_VIDEO.test(m)) return 'video'
  if (MIME_FOTO.test(m)) return 'foto'
  if (EKST_VIDEO.test(nama)) return 'video'
  if (EKST_FOTO.test(nama)) return 'foto'
  return ''
}

/**
 * Validasi satu media sebelum diunduh penuh.
 * @returns {{ok:boolean, jenis?:string, galat?:string}}
 */
export function validasiMedia({ mime = '', nama = '', ukuran = 0, sudah = 0 } = {}) {
  const jenis = tebakJenis(mime, nama)
  if (!jenis) return { ok: false, galat: 'Jenis media tidak didukung. Kirim video MP4/MOV/WebM atau foto JPG/PNG/WEBP.' }
  const batas = jenis === 'foto' ? Math.min(KONFIG.maksInputBytes, 15 * 1024 * 1024) : KONFIG.maksInputBytes
  const ukuranAngka = Number(ukuran) || 0
  if (ukuranAngka && ukuranAngka > batas) {
    return { ok: false, galat: `Ukuran ${jenis} ${(ukuranAngka / 1048576).toFixed(1)} MB melebihi batas ${(batas / 1048576).toFixed(0)} MB.` }
  }
  if (sudah >= KONFIG.maksMedia) {
    return { ok: false, galat: `Maksimal ${KONFIG.maksMedia} media per sesi. Ketik .edit mulai untuk mengulang.` }
  }
  return { ok: true, jenis }
}

/** Nama berkas aman (tanpa path, hanya karakter wajar). */
export function namaAman(nama, cadangan = 'media') {
  const dasar = path.basename(String(nama || '')).replace(/[^a-zA-Z0-9._-]/g, '')
  return (dasar || cadangan).slice(0, 60)
}

/** Template harus dari whitelist. */
export function templateSah(nama) {
  return DAFTAR_TEMPLATE.includes(String(nama || '').trim().toLowerCase())
}

/** Logo: hanya PNG, ukuran wajar. */
export function logoSah(nama = '', mime = '', ukuran = 0) {
  const m = String(mime || '').toLowerCase()
  if (m && !/^image\/png$/i.test(m)) return { ok: false, galat: 'Logo harus PNG transparan.' }
  if (!EKST_LOGO.test(String(nama || 'logo.png'))) return { ok: false, galat: 'Logo harus berakhiran .png' }
  if (Number(ukuran) > 2 * 1024 * 1024) return { ok: false, galat: 'Ukuran logo maksimal 2 MB.' }
  return { ok: true }
}

/** Sanitasi teks judul/subjudul (untuk ditampilkan & ditulis ke textfile). */
export function teksAman(teks, maks = 60) {
  return String(teks || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maks)
}

export default { validasiMedia, tebakJenis, namaAman, templateSah, logoSah, teksAman, JENIS_DIDUKUNG }
