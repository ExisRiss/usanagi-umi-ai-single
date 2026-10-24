/**
 * Mode SINGLE — bot murni WhatsApp tanpa bot utama, tanpa API, tanpa website.
 *
 * Kenapa ini ada:
 *   Versi "single" dulu tetap menyalakan HTTP API platform (port 2176/2144) dan
 *   adapter Telegram, serta mencoba menyambung "bot utama" dari sesi di root
 *   `sessions/`. Kalau repo ini dipakai sendiri oleh orang lain, semua jalur itu
 *   hanya menambah port terbuka, token yang harus diisi, dan prompt pairing yang
 *   membingungkan.
 *
 * Mode single artinya:
 *   - bot utama TIDAK ADA (tidak menyambung, tidak minta pairing)
 *   - HTTP API platform & adapter Telegram MATI
 *   - yang jalan hanya nomor WhatsApp yang didaftarkan user di `config/users.json`
 *     (folder sesinya di `sessions/jadibot/<nomor>/`, sama seperti jadibot biasa)
 *
 * Bisa dikembalikan ke mode penuh tanpa mengubah kode:
 *   UMI_SINGLE_MODE=false npm start
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

/** Path berkas daftar nomor. Bisa dipindah lewat env untuk panel. */
export function usersFile() {
  return process.env.UMI_USERS_FILE || path.join(ROOT, 'config', 'users.json')
}

/** True = mode single (default). Isi `UMI_SINGLE_MODE=false` untuk mematikan. */
export function singleModeEnabled() {
  const raw = process.env.UMI_SINGLE_MODE
  if (raw === undefined || raw === null || String(raw).trim() === '') return true
  return !/^(0|false|off|no)$/i.test(String(raw).trim())
}

export const SINGLE_MODE = singleModeEnabled()

/** Normalisasi nomor: hanya digit, buang awalan `+`, spasi, tanda hubung. */
export function normalizeUserNumber(value) {
  return String(value ?? '').replace(/[^0-9]/g, '')
}

/**
 * Baca daftar nomor user dari `config/users.json`.
 * Format: { "users": ["628123456789", "628987654321"] }
 * Nomor ganda/invalid dibuang, bukan bikin bot gagal boot.
 */
export function readSingleUsers() {
  const file = usersFile()
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return { numbers: [], file, missing: true }
    return { numbers: [], file, error: error.message }
  }

  let data
  try {
    data = JSON.parse(raw)
  } catch (error) {
    return { numbers: [], file, error: `JSON tidak valid: ${error.message}` }
  }

  const list = Array.isArray(data) ? data : Array.isArray(data?.users) ? data.users : []
  const numbers = []
  const invalid = []
  for (const item of list) {
    const number = normalizeUserNumber(item)
    if (number.length < 8 || number.length > 15) {
      if (String(item ?? '').trim()) invalid.push(String(item))
      continue
    }
    if (!numbers.includes(number)) numbers.push(number)
  }
  return { numbers, invalid, file, autoPair: data?.autoPair !== false }
}

/** Tulis daftar nomor (dipakai saat script pairing menambah nomor baru). */
export function writeSingleUsers(numbers, extra = {}) {
  const file = usersFile()
  const data = {
    _catatan: 'Isi nomor WhatsApp yang boleh memakai bot ini (format 628xxx). Simpan berkas ini rapi; jangan bagikan.',
    autoPair: true,
    ...extra,
    users: [...new Set((numbers || []).map(normalizeUserNumber).filter(n => n.length >= 8 && n.length <= 15))],
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
  try { fs.chmodSync(file, 0o600) } catch {}
  return file
}

export default { SINGLE_MODE, singleModeEnabled, readSingleUsers, writeSingleUsers, usersFile, normalizeUserNumber }
