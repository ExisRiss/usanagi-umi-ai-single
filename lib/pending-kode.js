/* By AlzRiss - Usanagi Umi AI
 *
 * Task151/152 — antrean kode dari WhatsApp.
 *
 * `.addplugin` dan `.addcase` butuh dua langkah: perintah dulu, kode menyusul.
 * Pesan kode biasanya dikirim TANPA prefix (apalagi di grup), sehingga
 * handler.js berhenti sebelum plugin dipanggil dan bot tampak diam.
 *
 * Modul ini menyimpan status "sedang menunggu kode" per chat+pengirim, dipakai
 * bersama oleh kedua plugin lewat registry `lib/pending-aksi.js`
 * (diperiksa handler.js SEBELUM gerbang prefix — termasuk di grup).
 */

import fs from 'fs'
import path from 'path'

const BERKAS = path.join(process.cwd(), 'data', 'pending-kode.json')
const BATAS_TUNGGU = 20 * 60 * 1000
const MAP = new Map()

let sudahMuat = false

function kunci(m) {
  return `${m.chat}:${m.sender}`
}

function muatSekali() {
  if (sudahMuat) return
  sudahMuat = true
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS, 'utf8'))
    const sekarang = Date.now()
    for (const [k, v] of Object.entries(isi || {})) {
      if (!v || sekarang - Number(v.waktu || 0) > BATAS_TUNGGU) continue
      MAP.set(k, v)
    }
  } catch (error) { /* belum ada antrean */ }
}

function simpanDisk() {
  try {
    const isi = {}
    for (const [k, v] of MAP) isi[k] = v
    fs.mkdirSync(path.dirname(BERKAS), { recursive: true })
    fs.writeFileSync(BERKAS, JSON.stringify(isi, null, 2), { mode: 0o600 })
  } catch (error) { /* abaikan — antrean di memori tetap jalan */ }
}

export function pasangKode(m, data) {
  muatSekali()
  MAP.set(kunci(m), { ...data, waktu: Date.now() })
  simpanDisk()
}

export function ambilKode(m) {
  muatSekali()
  const data = MAP.get(kunci(m))
  if (!data) return null
  if (Date.now() - Number(data.waktu || 0) > BATAS_TUNGGU) {
    hapusKode(m)
    return null
  }
  return data
}

export function hapusKode(m) {
  muatSekali()
  MAP.delete(kunci(m))
  simpanDisk()
}

/** Deteksi cepat: teks ini kelihatan seperti kode, bukan obrolan biasa. */
export function tampakKode(teks) {
  const isi = String(teks || '').trim()
  if (!isi) return false
  if (/^[.\/#!]/.test(isi)) return false           /* perintah biasa */
  if (isi.length < 4) return false
  return /(^|\n)\s*case\s*['"`]|m\.\w+\s*\(|conn\.\w+\s*\(|=>|\bfunction\s|\bconst\s|\bawait\s|handler\s*\.|export\s+default/.test(isi)
}

export { BATAS_TUNGGU }
