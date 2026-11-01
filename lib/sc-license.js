/* By AlzRiss - Usanagi Umi AI
 *
 * Task196 — LISENSI SC FULL AKSES.
 *
 * Instansi bot hasil distribusi /getsc (versi full) membawa berkas
 * `data/sc-license.enc` (hash password — BUKAN password mentah). Selama
 * hash belum tervalidasi, alur PAIRING BOT UTAMA meminta password lebih
 * dulu;3 kali salah → seluruh isi folder bot DIHANCURKAN (hanya di server
 * pengguna — berkas di luar folder bot tidak tersentuh).
 *
 * Instansi normal (repo kita sendiri) TIDAK punya berkas license →
 * semua fungsi di sini nonaktif dan pairing berjalan seperti biasa.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const BERKAS_LISENSI = path.join(process.cwd(), 'data', 'sc-license.enc')
const BERKAS_STATE = path.join(process.cwd(), 'data', 'sc-license.state.json')

/** Instansi ini memakai sc berlisensi? (hanya bila berkas license ada) */
export function scLicenseAktif() {
  try { return fs.statSync(BERKAS_LISENSI).isFile() } catch { return false }
}

function bacaJson(berkas, bawaan) {
  try { return JSON.parse(fs.readFileSync(berkas, 'utf8')) } catch { return bawaan }
}

/** Hash password dibanding timing-safe. */
export function passwordCocok(password, lisan) {
  const pw = Buffer.from(String(password || ''), 'utf8')
  const salt = Buffer.from(String(lisan?.salt || ''), 'hex')
  if (!pw.length || salt.length < 8) return false
  const hitung = crypto.createHash('sha256').update(salt).update(pw).digest('hex')
  const disimpan = String(lisan?.hash || '')
  if (hitung.length !== disimpan.length) return false
  try { return crypto.timingSafeEqual(Buffer.from(hitung, 'hex'), Buffer.from(disimpan, 'hex')) } catch { return false }
}

/** Bangun isi berkas license dari sebuah password (dipakai /getsc saat build). */
export function buatIsiLisensi(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.createHash('sha256').update(Buffer.from(salt, 'hex')).update(Buffer.from(String(password), 'utf8')).digest('hex')
  return { v: 1, salt, hash, maks: 3, dibuat: new Date().toISOString() }
}

/**
 * Validasi password sc. Mengembalikan { ok, sisa, hancur }.
 * Salah sebanyak `maks` → hancurkanInstansi() dipanggil otomatis (tidak kembali).
 */
export function validasiScLicense(password) {
  const lisan = bacaJson(BERKAS_LISENSI, null)
  if (!lisan?.hash) return { ok: true, sisa: 0, hancur: false } // tanpa license = selalu lolos
  if (passwordCocok(password, lisan)) {
    const state = bacaJson(BERKAS_STATE, {})
    state.valid = true
    state.validPada = new Date().toISOString()
    state.gagal = 0
    try { fs.writeFileSync(BERKAS_STATE, JSON.stringify(state), { mode: 0o600 }) } catch {}
    return { ok: true, sisa: 0, hancur: false }
  }
  const state = bacaJson(BERKAS_STATE, { valid: false, gagal: 0 })
  state.gagal = Number(state.gagal || 0) + 1
  const maks = Math.max(1, Number(lisan.maks) || 3)
  state.valid = false
  try { fs.writeFileSync(BERKAS_STATE, JSON.stringify(state), { mode: 0o600 }) } catch {}
  if (state.gagal >= maks) {
    hancurkanInstansi()
    return { ok: false, sisa: 0, hancur: true } // praktis tidak pernah tercapai (exit)
  }
  return { ok: false, sisa: maks - state.gagal, hancur: false }
}

/** Password sudah tervalidasi sesi ini / sebelumnya? */
export function scLicenseValid() {
  if (!scLicenseAktif()) return true
  return bacaJson(BERKAS_STATE, {}).valid === true
}

/**
 * HANCURKAN seluruh isi folder bot (server pengguna). Tidak menyentuh
 * apa pun di luar process.cwd() — server upload & server lain aman.
 */
export function hancurkanInstansi(akar = process.cwd()) {
  console.error('[SC-LISENSI] Password salah berkali-kali — menghancurkan seluruh isi instalasi...')
  let entries = []
  try { entries = fs.readdirSync(akar) } catch { entries = [] }
  for (const nama of entries) {
    const tujuan = path.join(akar, nama)
    for (let coba = 0; coba < 3; coba++) {
      try { fs.rmSync(tujuan, { recursive: true, force: true, maxRetries: 3 }); break } catch { /* coba lagi */ }
    }
  }
  console.error('[SC-LISENSI] Instalasi dihancurkan. Folder bot dikosongkan.')
  process.exit(70)
}
