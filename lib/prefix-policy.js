/* By AlzRiss - Usanagi Umi AI
 *
 * Kebijakan prefix untuk pesan MASUK (Task112).
 *
 * Masalah nyata (laporan 26-10-2026, jadibot):
 *   Owner menyetel prefix hanya "/" tetapi bot tetap menjawab ".menu".
 *   Penyebabnya `detectAlternatePrefix()` yang menerima SETIAP simbol pada
 *   daftarnya ( . ! / # $ % & + - , : ; * ~ = > ) asalkan sisa teksnya nama
 *   perintah terdaftar. Fitur itu dibuat untuk kasus "bot diam setelah prefix
 *   diganti", tetapi efek sampingnya filter prefix jadi tidak berfungsi.
 *
 * Aturan sekarang:
 *   - strict (default) : hanya prefix yang benar-benar disetel yang berlaku.
 *     Pesan dengan simbol lain diabaikan sama sekali (tidak dibalas).
 *   - loose (opt-in)   : perilaku lama. Hanya dipakai bila pemilik bot sendiri
 *     menyalakannya lewat `.setprefix mode loose`.
 *
 * Modul ini murni (tanpa I/O) supaya mudah diuji dan dipakai handler.
 */

import { detectAlternatePrefix } from './prefix-detect.js'

export const PREFIX_MODE_STRICT = 'strict'
export const PREFIX_MODE_LOOSE = 'loose'
export const PREFIX_MODES = [PREFIX_MODE_STRICT, PREFIX_MODE_LOOSE]

const ALIAS_STRICT = new Set(['ketat', 'only', 'single', 'off', 'false', '0', 'mati', 'tunggal'])
const ALIAS_LOOSE = new Set(['longgar', 'bebas', 'any', 'multi', 'on', 'true', '1', 'nyasar'])

/** Normalisasi nilai mode dari config/command. Nilai tak dikenal → fallback. */
export function normalizePrefixMode(value, fallback = PREFIX_MODE_STRICT) {
  const mode = String(value == null ? '' : value).trim().toLowerCase()
  if (PREFIX_MODES.includes(mode)) return mode
  if (ALIAS_STRICT.has(mode)) return PREFIX_MODE_STRICT
  if (ALIAS_LOOSE.has(mode)) return PREFIX_MODE_LOOSE
  return fallback === PREFIX_MODE_LOOSE ? PREFIX_MODE_LOOSE : PREFIX_MODE_STRICT
}

/** Apakah nilai ini mode prefix yang dikenal? */
export function isPrefixMode(value) {
  const mode = String(value == null ? '' : value).trim().toLowerCase()
  return PREFIX_MODES.includes(mode) || ALIAS_STRICT.has(mode) || ALIAS_LOOSE.has(mode)
}

/**
 * Tentukan prefix yang berlaku untuk satu pesan masuk.
 *
 * @returns {{ prefix: string, matched: boolean, alternate: boolean, mode: string }}
 *   prefix    : prefix yang dipakai memproses pesan
 *   matched   : pesan benar-benar diawali prefix aktif (boleh dijalankan)
 *   alternate : cocok lewat simbol lain (hanya mungkin di mode loose)
 */
export function resolveIncomingPrefix({ text, plugins, activePrefix, mode } = {}) {
  const active = String(activePrefix == null || activePrefix === '' ? '.' : activePrefix)
  const normalized = normalizePrefixMode(mode, PREFIX_MODE_STRICT)
  const raw = String(text == null ? '' : text).trimStart()

  if (raw.startsWith(active)) {
    return { prefix: active, matched: true, alternate: false, mode: normalized }
  }

  if (normalized === PREFIX_MODE_LOOSE) {
    let alternate = ''
    try {
      alternate = detectAlternatePrefix(raw, plugins || {}, active)
    } catch {
      alternate = ''
    }
    if (alternate) return { prefix: alternate, matched: true, alternate: true, mode: normalized }
  }

  return { prefix: active, matched: false, alternate: false, mode: normalized }
}

/** Teks bantuan singkat untuk perintah `.setprefix`. */
export function describePrefixMode(mode) {
  return normalizePrefixMode(mode) === PREFIX_MODE_LOOSE
    ? 'loose — simbol prefix lain masih diterima bila sisa teksnya nama perintah'
    : 'strict — hanya prefix yang disetel yang dijalankan'
}

export default {
  PREFIX_MODE_STRICT, PREFIX_MODE_LOOSE, PREFIX_MODES,
  normalizePrefixMode, resolveIncomingPrefix, describePrefixMode, isPrefixMode,
}
