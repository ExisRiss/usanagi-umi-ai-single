/* By AlzRiss - Usanagi Umi AI
 *
 * SUMBER NOMOR OWNER YANG SELALU SEGAR (Task124)
 *
 * Masalah yang diselesaikan:
 *   Pemilik bot (nomor yang diisi di setelan bot — website Jadibot maupun
 *   setelan bot utama) tidak langsung diakui sebagai owner setelah nomornya
 *   disimpan. Penyebabnya daftar owner dibaca dari SALINAN konfigurasi yang
 *   dibuat saat bot dinyalakan, jadi perubahan dari website baru terasa
 *   setelah restart.
 *
 * Modul ini membaca berkas setelan langsung dari disk (dengan cache kecil di
 * pemanggil), tanpa menyentuh database, jadi aman dipakai di jalur pesan.
 */

import fs from 'node:fs'
import path from 'node:path'
import { isMainBotSettingsManaged, loadMainBotSettings } from './main-bot-settings.js'

/* Cache 5 detik berbasis mtime: cukup untuk mencegah berkas setelan dibaca
 * pada SETIAP pesan (bot bisa menerima puluhan pesan per detik), tetapi
 * perubahan dari website langsung terlihat tanpa perlu restart. */
const CACHE_TTL_MS = 5000
const bacaCache = new Map()

function bacaJson(file) {
  try {
    const stat = fs.statSync(file)
    const kunci = stat.mtimeMs + ':' + stat.size
    const tersimpan = bacaCache.get(file)
    if (tersimpan && tersimpan.kunci === kunci && Date.now() - tersimpan.at < CACHE_TTL_MS) {
      return tersimpan.nilai
    }
    const nilai = JSON.parse(fs.readFileSync(file, 'utf8'))
    bacaCache.set(file, { kunci, at: Date.now(), nilai })
    while (bacaCache.size > 64) bacaCache.delete(bacaCache.keys().next().value)
    return nilai
  } catch {
    return null
  }
}

/** Digit saja; nomor Indonesia diawali 0 diubah ke 62. */
export function ownerDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits
}

/** Nomor valid untuk daftar owner (8–15 digit, bukan deretan nol). */
export function ownerNumberValid(value) {
  const raw = String(value ?? '').replace(/\D/g, '')
  if (!raw || /^0+$/.test(raw)) return false
  const number = ownerDigits(raw)
  return number.length >= 8 && number.length <= 15 && !/^620+$/.test(number)
}

/**
 * Nomor owner bot utama dari `data/main-bot-settings.json`.
 * Kosong kalau bot utama tidak dikelola website (memakai config.js).
 */
export function freshMainOwnerNumbers({ file = '', settingsFile = '' } = {}) {
  try {
    const target = file || settingsFile
    if (target) {
      const stored = bacaJson(target)
      const number = ownerDigits(stored?.ownerNumber)
      return ownerNumberValid(number) ? [number] : []
    }
    if (!isMainBotSettingsManaged()) return []
    // Jalur normal: lewat modul setelan (punya lokasi berkas resmi).
    const settings = loadMainBotSettings({ fresh: true })
    const number = ownerDigits(settings?.ownerNumber)
    return ownerNumberValid(number) ? [number] : []
  } catch {
    return []
  }
}

/** Nomor owner sesi Jadibot, dibaca ulang dari `bot-config.json` sesi itu. */
export function freshJadibotOwnerNumbers(file) {
  if (!file) return []
  const stored = bacaJson(String(file))
  const list = Array.isArray(stored?.ownerNumbers) ? stored.ownerNumbers : []
  return mergeOwnerNumbers(list.filter(ownerNumberValid))
}

/**
 * Gabungkan beberapa daftar nomor owner: buang kosong, rapikan, buang ganda.
 * Urutan dipertahankan supaya nomor utama tetap paling depan.
 */
export function mergeOwnerNumbers(...lists) {
  const out = []
  const seen = new Set()
  for (const list of lists) {
    const items = Array.isArray(list) ? list : [list]
    for (const item of items) {
      const number = ownerDigits(item)
      if (!ownerNumberValid(number) || seen.has(number)) continue
      seen.add(number)
      out.push(number)
    }
  }
  return out
}

/** Dipakai self-test: apakah berkas setelan sesi bisa dibaca. */
export function ownerSourceFileExists(file) {
  try {
    return Boolean(file) && fs.statSync(path.resolve(String(file))).isFile()
  } catch {
    return false
  }
}

export default {
  ownerDigits,
  ownerNumberValid,
  freshMainOwnerNumbers,
  freshJadibotOwnerNumbers,
  mergeOwnerNumbers,
  ownerSourceFileExists,
}
