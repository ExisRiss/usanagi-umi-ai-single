/* By AlzRiss - Usanagi Umi AI
 *
 * ATURAN PREFIX PER JENIS BOT (Task117).
 *
 * Permintaan owner:
 *   1. Bot UTAMA  : menu hanya muncul dengan prefix `$`. Simbol lain diabaikan.
 *   2. Bot JADIBOT: prefix bebas — `/`, `.`, `&`, `+`, simbol apa pun —
 *      KECUALI `$`. Jadi jadibot tidak boleh memakai `$` untuk memunculkan menu.
 *   3. Prefix TUNGGAL  (`$menu`, `/menu`) → menu versi TEKS.
 *   4. Prefix GANDA    (`$$menu`, `//menu`) → menu versi RICH (kartu HTML).
 *      Aturan ganda ini juga berlaku untuk `ping`.
 *
 * Modul ini murni (tanpa I/O, tanpa socket) supaya aturannya bisa diuji
 * langsung dan handler tidak perlu tahu detailnya.
 */

/** Prefix wajib bot utama. */
export const MAIN_BOT_PREFIX = '$'

/** Prefix cadangan jadibot saat setelannya tidak sah (kosong / '$'). */
export const JADIBOT_FALLBACK_PREFIX = '.'

/**
 * Jenis bot dari botConfig.
 * apa pun selain 'jadibot' dianggap bot utama — sama seperti handler.
 */
export function botKind(botConfig) {
  const type = botConfig && botConfig.type != null ? String(botConfig.type).toLowerCase() : ''
  return type === 'jadibot' ? 'jadibot' : 'main'
}

/** Satu karakter simbol, bukan huruf/angka/spasi. */
export function isSymbolPrefix(value) {
  if (typeof value !== 'string' || value.length !== 1) return false
  return !/[0-9A-Za-z\s]/.test(value)
}

/**
 * Apakah `value` boleh dipakai sebagai prefix TUNGGAL oleh jenis bot ini?
 * Bot utama: hanya `$`. Jadibot: simbol apa pun kecuali `$`.
 */
export function isAllowedSinglePrefix(botType, value) {
  if (!isSymbolPrefix(value)) return false
  if (botType === 'jadibot') return value !== MAIN_BOT_PREFIX
  return value === MAIN_BOT_PREFIX
}

/**
 * Paksa prefix aktif sesuai jenis bot.
 *
 * Bot utama SELALU `$` — setelan lama (mis. `.`) tidak boleh melanggarnya.
 * Jadibot yang masih menyimpan `$` (atau setelan tidak sah) jatuh ke `.`.
 */
export function sanitizeActivePrefix(botType, prefix, fallback = JADIBOT_FALLBACK_PREFIX) {
  if (botType !== 'jadibot') return MAIN_BOT_PREFIX
  const active = String(prefix == null ? '' : prefix).trim()
  if (isAllowedSinglePrefix('jadibot', active)) return active
  const cadangan = String(fallback == null ? '' : fallback).trim()
  return isAllowedSinglePrefix('jadibot', cadangan) ? cadangan : JADIBOT_FALLBACK_PREFIX
}

/**
 * Pisahkan prefix tunggal / ganda dari awal pesan.
 *
 * @returns {{ matched: boolean, rich: boolean, body: string, prefix: string }}
 *   matched : pesan benar-benar diawali prefix aktif
 *   rich    : prefix GANDA (prefix aktif dua kali) → minta tampilan rich
 *   body    : sisa pesan setelah prefix (yang dipakai mencari nama perintah)
 */
export function splitPrefix(text, prefix) {
  const aktif = String(prefix == null ? '' : prefix)
  const raw = String(text == null ? '' : text).trimStart()
  if (!aktif || !raw.startsWith(aktif)) {
    return { matched: false, rich: false, body: '', prefix: aktif }
  }
  const setelah = raw.slice(aktif.length)
  if (setelah.startsWith(aktif)) {
    return { matched: true, rich: true, body: setelah.slice(aktif.length), prefix: aktif }
  }
  return { matched: true, rich: false, body: setelah, prefix: aktif }
}

/**
 * Normalisasi pesan masuk: tentukan prefix sah + apakah minta tampilan rich.
 *
 * `text` hasil normalisasi memakai prefix TUNGGAL, jadi seluruh pipeline lama
 * (pencocokan plugin, usedPrefix, args) berjalan tanpa perubahan; hanya
 * `rich` yang diteruskan lewat `m.__richMenu`.
 *
 * @returns {{ matched: boolean, rich: boolean, prefix: string, body: string, text: string }}
 */
export function normalizeIncoming({ text, botType = 'main', activePrefix } = {}) {
  const prefix = sanitizeActivePrefix(botType, activePrefix)
  const split = splitPrefix(text, prefix)
  return {
    matched: split.matched,
    rich: split.rich,
    prefix,
    body: split.body,
    text: split.matched ? prefix + split.body : String(text == null ? '' : text),
  }
}

/**
 * Pesan bantuan singkat aturan prefix untuk jenis bot tertentu.
 * Dipakai `.setprefix` dan `menuinfo`.
 */
export function describeBotPrefixRule(botType) {
  if (botType === 'jadibot') {
    return 'jadibot — prefix tunggal bebas (/ . & + …) = menu teks, prefix ganda (// .. &&) = menu rich, `$` tidak dipakai'
  }
  return 'bot utama — hanya `$`; `$menu` = teks, `$$menu` = rich'
}

export default {
  MAIN_BOT_PREFIX, JADIBOT_FALLBACK_PREFIX,
  botKind, isSymbolPrefix, isAllowedSinglePrefix, sanitizeActivePrefix,
  splitPrefix, normalizeIncoming, describeBotPrefixRule,
}
