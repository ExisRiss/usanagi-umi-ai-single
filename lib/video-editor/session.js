/* By AlzRiss - Usanagi Umi AI
 *
 * Task146 — sesi pengguna, antrean render, dan pembersihan berkas.
 *
 * Aturan yang dijaga:
 *   • Satu sesi = satu (chat + pengirim). Media pengguna lain tidak pernah
 *     tercampur walau chat-nya sama (grup).
 *   • Sesi punya TTL; tiap akses memperpanjangnya. Sesi kedaluwarsa dibersihkan
 *     berkala BESERTA berkasnya.
 *   • Render dibatasi (maksConcurrent) dan antrean punya batas panjang.
 *   • Berkas sementara selalu dihapus: sesudah kirim, sesudah gagal, atau saat
 *     sesi kedaluwarsa/dibatalkan.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { KONFIG } from './config.js'

const sesi = new Map()
let pembersih = null

/** Kunci sesi: chat + pengirim. */
export const kunciSesi = (chat, pengirim) => `${chat || '-'}::${pengirim || '-'}`

export function ambilSesi(chat, pengirim, { buat = false } = {}) {
  const kunci = kunciSesi(chat, pengirim)
  const ada = sesi.get(kunci)
  if (ada) {
    if (Date.now() - ada.diperbarui > KONFIG.ttlSesiMs) {
      hapusSesi(kunci, 'kedaluwarsa')
    } else {
      ada.diperbarui = Date.now()
      return ada
    }
  }
  if (!buat) return null
  const baru = {
    id: crypto.randomBytes(6).toString('hex'),
    kunci,
    chat,
    pengirim,
    dibuat: Date.now(),
    diperbarui: Date.now(),
    media: [],
    template: '',
    judul: '',
    subjudul: '',
    meta: '',
    logo: '',
    kualitas: KONFIG.kualitas,
    slowmo: 1,
    tahap: 'awal',
    status: 'kosong',
    antrean: null,
    galat: '',
  }
  sesi.set(kunci, baru)
  mulaiPembersih()
  return baru
}

export function daftarSesi() {
  return [...sesi.values()]
}

export function hapusSesi(kunci, alasan = '') {
  const data = sesi.get(kunci)
  if (!data) return false
  for (const m of data.media) {
    if (m?.folder) hapusFolder(m.folder)
  }
  sesi.delete(kunci)
  if (alasan) console.log(`[video-editor] sesi ${data.id} dihapus: ${alasan}`)
  return true
}

export function batalkanSesi(chat, pengirim) {
  return hapusSesi(kunciSesi(chat, pengirim), 'dibatalkan pengguna')
}

/** Hapus folder kerja tanpa melempar error. */
export function hapusFolder(folder) {
  if (!folder) return
  try {
    fs.rmSync(folder, { recursive: true, force: true })
  } catch (e) { /* berkas mungkin sudah hilang */ }
}

/** Bersihkan sesi kedaluwarsa (dipanggil interval + saat akses). */
export function bersihkanKedaluwarsa() {
  const sekarang = Date.now()
  let jumlah = 0
  for (const [kunci, data] of sesi) {
    if (sekarang - data.diperbarui > KONFIG.ttlSesiMs) {
      if (data.status === 'render') continue // jangan potong render yang sedang jalan
      hapusSesi(kunci, 'TTL habis')
      jumlah += 1
    }
  }
  return jumlah
}

export function mulaiPembersih() {
  if (pembersih) return
  pembersih = setInterval(() => {
    try { bersihkanKedaluwarsa() } catch (e) { /* jangan matikan interval */ }
  }, 60 * 1000)
  pembersih.unref?.()
}

export function hentikanPembersih() {
  if (pembersih) clearInterval(pembersih)
  pembersih = null
}

/* ── antrean render ────────────────────────────────────────────────────── */

const antrean = []
let berjalan = 0
let nomor = 0

export function statusAntrean() {
  return {
    berjalan,
    menunggu: antrean.length,
    maksConcurrent: KONFIG.maksConcurrent,
    maksAntrean: KONFIG.maksAntrean,
  }
}

/**
 * Masukkan pekerjaan ke antrean.
 * @param {{nama?:string, tugas:(info:object)=>Promise<any>}} pekerjaan
 * @returns {Promise<any>} hasil tugas
 */
export function antrekan(pekerjaan) {
  if (antrean.length >= KONFIG.maksAntrean) {
    return Promise.reject(Object.assign(new Error('Antrean rendering penuh. Coba lagi beberapa saat.'), { kode: 'ANTREAN_PENUH' }))
  }
  nomor += 1
  const tiket = { nomor, nama: pekerjaan.nama || 'render' }
  return new Promise((resolve, reject) => {
    antrean.push({ tiket, pekerjaan, resolve, reject })
    jalankanBerikut()
  })
}

function jalankanBerikut() {
  while (berjalan < KONFIG.maksConcurrent && antrean.length) {
    const { tiket, pekerjaan, resolve, reject } = antrean.shift()
    berjalan += 1
    const info = { nomor: tiket.nomor, menunggu: antrean.length, berjalan }
    Promise.resolve()
      .then(() => pekerjaan.tugas(info))
      .then((hasil) => resolve(hasil))
      .catch((galat) => reject(galat))
      .finally(() => {
        berjalan -= 1
        jalankanBerikut()
      })
  }
}

/** Hapus pekerjaan yang masih menunggu untuk sesi tertentu. */
export function batalkanAntrean(kunci) {
  let jumlah = 0
  for (let i = antrean.length - 1; i >= 0; i--) {
    if (antrean[i].pekerjaan.kunci === kunci) {
      antrean[i].reject(Object.assign(new Error('Rendering dibatalkan.'), { kode: 'DIBATALKAN' }))
      antrean.splice(i, 1)
      jumlah += 1
    }
  }
  return jumlah
}

export default {
  kunciSesi, ambilSesi, hapusSesi, batalkanSesi, hapusFolder,
  bersihkanKedaluwarsa, mulaiPembersih, hentikanPembersih,
  antrekan, statusAntrean, batalkanAntrean, daftarSesi,
}
