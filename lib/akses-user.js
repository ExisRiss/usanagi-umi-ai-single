/* By AlzRiss - Usanagi Umi AI
 *
 * Daftar "akses" per sesi (fitur OURIN `.addakses`).
 *
 * Latar belakang: mode *self* hanya melayani owner + pesan bot sendiri
 * (`handler.js`: `if (!instancePublic && !m.fromMe && !isOwner) return;`).
 * Di OURIN ada daftar orang yang tetap boleh memakai bot walau mode self.
 *
 * Penyimpanan memakai database bot yang sudah ada:
 *   global.db.data.akses = { '<jid sesi>': ['628…', …] }
 * Jadi otomatis ikut tersimpan, di-backup, dan tidak menambah berkas baru.
 */

function basis() {
  if (!global.db || !global.db.data) return null
  if (!global.db.data.akses || typeof global.db.data.akses !== 'object') global.db.data.akses = {}
  return global.db.data.akses
}

/** Kunci sesi: jid bot (bot utama dan tiap jadibot punya daftar sendiri). */
export function kunciSesi(conn) {
  return String(conn?.user?.jid || conn?.user?.id || 'utama')
}

export function digit(nilai) {
  return String(nilai || '').replace(/[^0-9]/g, '')
}

/** Daftar nomor yang punya akses di sesi ini. */
export function daftarAkses(conn) {
  const db = basis()
  if (!db) return []
  const list = db[kunciSesi(conn)]
  return Array.isArray(list) ? list.slice() : []
}

/** Tambah satu nomor (format apa pun) ke daftar akses sesi ini. */
export function tambahAkses(conn, nomor) {
  const db = basis()
  const angka = digit(nomor)
  if (!db) return { ok: false, alasan: 'database bot belum siap' }
  if (!angka || angka.length < 8) return { ok: false, alasan: 'nomor tidak valid' }
  const key = kunciSesi(conn)
  const list = Array.isArray(db[key]) ? db[key] : []
  if (list.includes(angka)) return { ok: false, alasan: 'nomor sudah ada di daftar' }
  list.push(angka)
  db[key] = list
  return { ok: true, nomor: angka, total: list.length }
}

/** Hapus satu nomor dari daftar akses sesi ini. */
export function hapusAkses(conn, nomor) {
  const db = basis()
  if (!db) return { ok: false, alasan: 'database bot belum siap' }
  const angka = digit(nomor)
  const key = kunciSesi(conn)
  const list = Array.isArray(db[key]) ? db[key] : []
  const sisa = list.filter(item => item !== angka)
  if (sisa.length === list.length) return { ok: false, alasan: 'nomor tidak ada di daftar' }
  db[key] = sisa
  return { ok: true, nomor: angka, total: sisa.length }
}

/**
 * Apakah pengirim punya akses di sesi ini?
 * Dipakai `handler.js` pada pemeriksaan mode self. Aman kalau database
 * belum siap: hasilnya false, jadi perilaku lama tidak berubah.
 */
export function punyaAkses(conn, sender) {
  const angka = digit(sender)
  if (!angka) return false
  try {
    return daftarAkses(conn).includes(angka)
  } catch {
    return false
  }
}

export default { daftarAkses, tambahAkses, hapusAkses, punyaAkses, kunciSesi, digit }
