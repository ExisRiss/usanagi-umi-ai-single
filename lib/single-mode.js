/**
 * Penghubung mode single: menyalakan hanya nomor yang didaftarkan user.
 *
 * Alurnya:
 *   1. `config/users.json` dibaca (daftar nomor).
 *   2. Nomor yang sudah punya folder `sessions/jadibot/<nomor>/` dibiarkan —
 *      `restoreSubBots()` di main.js yang menyambungkannya.
 *   3. Nomor yang belum punya sesi diminta kode pairing, lalu kode itu dicetak
 *      di console. User mengetik kode tersebut di WhatsApp > Perangkat tertaut,
 *      sama seperti memasang WhatsApp Web.
 *
 * Tidak ada HTTP API, tidak ada website, tidak ada bot utama.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSingleUsers, normalizeUserNumber } from '../config/single-mode.js'
import { startSubBotForApi } from './jadibot.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SESSIONS_DIR = path.join(ROOT, 'sessions', 'jadibot')

export function sessionExists(number) {
  try {
    return fs.existsSync(path.join(SESSIONS_DIR, normalizeUserNumber(number), 'creds.json'))
  } catch {
    return false
  }
}

function banner(line) {
  const text = String(line ?? '')
  console.log(`\u001b[36m[SINGLE]\u001b[39m ${text}`)
}

/**
 * Minta kode pairing untuk satu nomor lalu tunggu sampai tersambung.
 * @returns {Promise<{number:string, code?:string, status:string, error?:string}>}
 */
export async function pairSingleUser(rawNumber, { timeoutMs = 180000 } = {}) {
  const number = normalizeUserNumber(rawNumber)
  if (number.length < 8 || number.length > 15) {
    return { number, status: 'invalid', error: 'Nomor harus 8–15 digit, contoh 628123456789.' }
  }

  if (sessionExists(number)) {
    return { number, status: 'session-ada' }
  }

  let result
  try {
    result = await startSubBotForApi(number, null)
  } catch (error) {
    const raw = String(error?.message || error)
    // `bad-request` dari WhatsApp berarti nomor tidak terdaftar / tidak bisa dipasangkan.
    const friendly = /bad-request/i.test(raw)
      ? 'WhatsApp menolak nomor ini (bad-request). Pastikan nomor terdaftar di WhatsApp dan memakai kode negara, contoh 628123456789.'
      : raw
    banner(`…${String(number).slice(-4)} gagal pairing: ${friendly}`)
    return { number, status: 'gagal', error: friendly }
  }

  if (!result?.code) return { number, status: 'tanpa-kode' }

  /*
   * Task104: nomor TIDAK dicetak utuh, dan kode pairing hanya ditampilkan pada
   * terminal interaktif (TTY) atau bila UMI_PAIRING_SHOW_CODE=1. Di Pterodactyl
   * konsol bukan TTY, jadi kode tidak lagi tertinggal di log panel yang bisa
   * dibaca admin lain. Kode tetap dikembalikan lewat `result.code` dan
   * diteruskan ke saluran resmi (DM WhatsApp / API panel).
   */
  const showCode = Boolean(process.stdout.isTTY) || process.env.UMI_PAIRING_SHOW_CODE === '1'
  banner('════════════════════════════════════════════')
  banner(`  KODE PAIRING untuk …${String(number).slice(-4)}${showCode ? `:  ${result.code}` : '  (kode dikirim lewat DM WhatsApp / API panel)'}`)
  banner('  WhatsApp > Perangkat tertaut > Tautkan perangkat')
  banner('  > Tautkan dengan nomor telepon, lalu masukkan kode di atas.')
  banner('════════════════════════════════════════════')

  // Tunggu sampai socket benar-benar terbuka, supaya sesi tersimpan rapi
  // sebelum proses bot lanjut. Kalau tidak, sesi tetap dicoba lagi pada boot
  // berikutnya (folder sesi hanya dibuat setelah kredensial tersimpan).
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const conn = global.jadibotConns?.get?.(number)
    if (conn?.__jadibotConnected) return { number, status: 'tersambung', code: result.code }
    if (!conn) break
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  const conn = global.jadibotConns?.get?.(number)
  return { number, status: conn ? 'menunggu-kode' : 'socket-tertutup', code: result.code }
}

/**
 * Dipanggil sekali saat boot (main.js) setelah handler siap.
 * Mode aman: kalau berkas tidak ada / kosong, bot tetap jalan seperti biasa.
 */
export async function startSingleModeUsers() {
  const { numbers, invalid, file, missing, error, autoPair } = readSingleUsers()

  if (missing) {
    banner(`config/users.json belum ada — bot menyala tanpa nomor user.`)
    banner(`Buat berkasnya (contoh ada di config/users.example.json) lalu restart.`)
    return { numbers: [], paired: [] }
  }
  if (error) {
    banner(`config/users.json tidak terbaca: ${error}`)
    return { numbers: [], paired: [] }
  }
  if (invalid?.length) banner(`Nomor dilewati (format salah): ${invalid.join(', ')}`)
  if (!numbers.length) {
    banner('Daftar user kosong — tidak ada nomor yang dinyalakan.')
    return { numbers: [], paired: [] }
  }

  banner(`${numbers.length} nomor terdaftar di ${path.relative(ROOT, file)}`)
  const paired = []
  for (const number of numbers) {
    if (sessionExists(number)) {
      banner(`${number} — sesi sudah ada, disambungkan oleh restoreSubBots.`)
      paired.push({ number, status: 'session-ada' })
      continue
    }
    if (!autoPair) {
      banner(`${number} — belum punya sesi, pairing otomatis dimatikan (autoPair:false).`)
      paired.push({ number, status: 'menunggu-pairing' })
      continue
    }
    banner(`${number} — belum punya sesi, meminta kode pairing...`)
    paired.push(await pairSingleUser(number))
  }
  return { numbers, paired }
}

export default { startSingleModeUsers, pairSingleUser, sessionExists }
