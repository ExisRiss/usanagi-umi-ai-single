/* By AlzRiss - Usanagi Umi AI
 *
 * Task143 — status "OWNER UTAMA".
 *
 * Permintaan owner: ada satu tingkat di atas "owner bot" yang **aksesnya
 * setara developer** — boleh memakai SEMUA perintah, termasuk yang bertanda
 * `rowner` / platform.
 *
 * Aturan yang dipakai handler.js:
 *   developer (isROwner)  → nomor terkunci di config.js (global.owner)
 *   owner utama           → nomor di data/owner-utama.json atau global.ownerUtama
 *   owner bot             → nomor owner dari setelan bot di website
 *
 * `aksesPenuh` = developer ATAU owner utama → dipakai semua gerbang perintah,
 * jadi owner utama diperlakukan sama seperti developer.
 *
 * Yang TIDAK bisa dilakukan owner utama: mengubah daftar developer
 * (Task113 — developer terkunci) dan mengubah daftar owner utama. Dua hal itu
 * tetap milik developer supaya kendali platform tidak berpindah tangan.
 */

import fs from 'fs'
import path from 'path'
import { normalizeNumber } from './awang-cekakses.js'

const BERKAS = path.join(process.cwd(), 'data', 'owner-utama.json')

function bacaMentah() {
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS, 'utf8'))
    return Array.isArray(isi.nomor) ? isi : { versi: 1, nomor: [] }
  } catch (error) {
    return { versi: 1, nomor: [] }
  }
}

function tulisMentah(data) {
  fs.mkdirSync(path.dirname(BERKAS), { recursive: true })
  fs.writeFileSync(BERKAS, JSON.stringify(data, null, 2), { mode: 0o600 })
  try { fs.chmodSync(BERKAS, 0o600) } catch (error) { /* Windows */ }
  return data
}

/** Nomor owner utama dari config.js (opsional). */
function dariConfig() {
  const daftar = Array.isArray(global.ownerUtama) ? global.ownerUtama : []
  return daftar.map((baris) => {
    if (Array.isArray(baris)) return { nomor: normalizeNumber(baris[0]), nama: String(baris[1] || 'Owner Utama') }
    return { nomor: normalizeNumber(baris), nama: 'Owner Utama' }
  }).filter((x) => x.nomor)
}

export function daftarOwnerUtama() {
  const hasil = new Map()
  for (const item of dariConfig()) hasil.set(item.nomor, { ...item, sumber: 'config' })
  for (const item of bacaMentah().nomor) {
    if (!item || !item.nomor) continue
    const nomor = normalizeNumber(item.nomor)
    if (!nomor) continue
    hasil.set(nomor, { nomor, nama: String(item.nama || 'Owner Utama'), sumber: 'data', waktu: item.waktu || '' })
  }
  return [...hasil.values()]
}

export function nomorOwnerUtama() {
  return daftarOwnerUtama().map((x) => x.nomor)
}

export function isOwnerUtama(nomor) {
  const n = normalizeNumber(nomor || '')
  if (!n) return false
  return nomorOwnerUtama().includes(n)
}

export function tambahOwnerUtama(nomor, nama = 'Owner Utama', oleh = '') {
  const n = normalizeNumber(nomor || '')
  if (!n || n.length < 8) throw new Error('Nomor tidak valid. Contoh: .addownerutama 6281234567890 AlzRiss')
  const data = bacaMentah()
  const sudah = data.nomor.find((x) => normalizeNumber(x.nomor) === n)
  if (sudah) {
    sudah.nama = String(nama || sudah.nama || 'Owner Utama')
    sudah.diperbarui = new Date().toISOString()
  } else {
    data.nomor.push({
      nomor: n,
      nama: String(nama || 'Owner Utama'),
      oleh: String(oleh || ''),
      waktu: new Date().toISOString(),
    })
  }
  tulisMentah(data)
  return { nomor: n, nama: String(nama || 'Owner Utama'), baru: !sudah }
}

export function hapusOwnerUtama(nomor) {
  const n = normalizeNumber(nomor || '')
  if (!n) throw new Error('Nomor tidak valid.')
  const data = bacaMentah()
  const sebelum = data.nomor.length
  data.nomor = data.nomor.filter((x) => normalizeNumber(x.nomor) !== n)
  tulisMentah(data)
  return { nomor: n, dihapus: sebelum !== data.nomor.length }
}

/**
 * Status akses satu nomor — dipakai `.statusakses` supaya developer bisa
 * memastikan siapa sebenarnya punya akses apa.
 */
export function statusAkses(nomor, { developer = [], ownerBot = [] } = {}) {
  const n = normalizeNumber(nomor || '')
  const hasil = { nomor: n, peran: 'pengguna', aksesPenuh: false }
  if (developer.includes(n)) {
    hasil.peran = 'developer'
    hasil.aksesPenuh = true
    return hasil
  }
  if (nomorOwnerUtama().includes(n)) {
    hasil.peran = 'owner utama'
    hasil.aksesPenuh = true
    return hasil
  }
  if (ownerBot.includes(n)) {
    hasil.peran = 'owner bot'
    return hasil
  }
  return hasil
}

export default {
  daftarOwnerUtama, nomorOwnerUtama, isOwnerUtama,
  tambahOwnerUtama, hapusOwnerUtama, statusAkses,
}
