/* By AlzRiss - Usanagi Umi AI
 *
 * KEMAMPUAN RICH MESSAGE PER CHAT (Task127)
 *
 * Masalah yang dilaporkan owner:
 *   "richmessage hanya support WA bisnis, gabisa WA biasa"
 *
 * Betul. Kartu kita memakai `botForwardedMessage.richResponseMessage` — bentuk
 * pesan bot AI Meta. HP WhatsApp biasa (dan sebagian versi lama/business)
 * TIDAK merendernya: yang terlihat hanya pesan kosong atau "pesan tidak
 * didukung". WhatsApp tidak memberi tahu pengirim bahwa pesannya gagal tampil,
 * jadi bot tidak bisa tahu dari hasil `sendMessage`.
 *
 * Solusi yang dipakai di sini (jujur, tanpa menebak):
 *   1. Default: BELUM tentu mampu → setiap kartu rich SELALU diikuti versi teks.
 *      Jadi pemakai WA biasa tetap menerima menu, tidak pernah kosong.
 *   2. Kalau orang itu menekan tombol dari kartu (artinya kartunya tampil di
 *      HP-nya), chat ditandai MAMPU → kiriman berikutnya tidak lagi digandakan.
 *   3. Bisa dipaksa lewat env `UMI_RICH_ALL=1` (semua chat dianggap mampu) atau
 *      `UMI_RICH_ALL=0` (semua chat selalu dapat teks tambahan).
 *
 * Berkas penanda: `data/rich-capability.json` (maks 2.000 chat, dibersihkan
 * otomatis kalau terlalu besar).
 */

import fs from 'node:fs'
import path from 'node:path'

const BERKAS = path.resolve(process.cwd(), 'data', 'rich-capability.json')
const MAKS_CHAT = 2000
const TTL_KARTU_MS = 15 * 60 * 1000

/** chat → waktu kartu rich terakhir dikirim (di memori, bukan berkas). */
const kartuTerakhir = new Map()

function baca() {
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS, 'utf8'))
    return isi && typeof isi === 'object' ? isi : {}
  } catch {
    return {}
  }
}

function tulis(data) {
  try {
    fs.mkdirSync(path.dirname(BERKAS), { recursive: true })
    fs.writeFileSync(BERKAS, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

function kunci(chat) {
  return String(chat || '').trim()
}

/**
 * Apakah kartu rich layak dikirim TANPA duplikat teks untuk chat ini?
 * `false` = kirim kartu + teks (aman untuk WA biasa).
 */
export function richMampu(chat) {
  const env = String(process.env.UMI_RICH_ALL ?? '').trim()
  if (env === '1' || env.toLowerCase() === 'true') return true
  if (env === '0' || env.toLowerCase() === 'false') return false
  const id = kunci(chat)
  if (!id) return false
  return baca()[id] === true
}

/** Tandai chat ini benar-benar bisa menampilkan kartu rich. */
export function tandaiRichMampu(chat) {
  const id = kunci(chat)
  if (!id) return false
  const data = baca()
  if (data[id] === true) return true
  data[id] = true
  const kunci2 = Object.keys(data)
  if (kunci2.length > MAKS_CHAT) {
    // Buang yang paling awal masuk (objek JSON mempertahankan urutan kunci).
    for (const lama of kunci2.slice(0, kunci2.length - MAKS_CHAT)) delete data[lama]
  }
  return tulis(data)
}

/** Catat bahwa kartu baru saja dikirim — dasar penandaan lewat interaksi. */
export function catatKartuDikirim(chat) {
  const id = kunci(chat)
  if (!id) return
  kartuTerakhir.set(id, Date.now())
  if (kartuTerakhir.size > MAKS_CHAT) {
    const now = Date.now()
    for (const [key, waktu] of kartuTerakhir) {
      if (now - waktu > TTL_KARTU_MS) kartuTerakhir.delete(key)
    }
  }
}

/**
 * Dipanggil saat sebuah aksi menu diterima. Kalau kartu baru saja dikirim ke
 * chat itu, berarti kartunya tampil dan tombolnya bisa ditekan → tandai mampu.
 * @returns {boolean} true kalau chat baru saja ditandai
 */
export function konfirmasiKartuTampil(chat) {
  const id = kunci(chat)
  if (!id) return false
  const waktu = kartuTerakhir.get(id)
  if (!waktu) return false
  if (Date.now() - waktu > TTL_KARTU_MS) {
    kartuTerakhir.delete(id)
    return false
  }
  kartuTerakhir.delete(id)
  if (richMampu(id)) return false
  return tandaiRichMampu(id)
}

export default { richMampu, tandaiRichMampu, catatKartuDikirim, konfirmasiKartuTampil }
