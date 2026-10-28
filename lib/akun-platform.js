/* By AlzRiss - Usanagi Umi AI
 *
 * Task140 — kelola akun pengguna platform dari WhatsApp (khusus developer).
 *
 * Perintah yang dilayani (lihat plugins/owner/developer-akun.js):
 *   buatakun  <gmail> | <password> | <username>
 *   delakun   <gmail>              → pilih situs/server mana yang dihapus
 *   delakunall [<gmail>|KONFIRMASI] → hapus di SEMUA server website
 *
 * "Server website" yang benar-benar bisa dihapus bot (bukan klaim):
 *   1. website-jadibot — tabel auth Supabase + tabel `users`/`platform_profiles`
 *      (dipakai https://jadibot-alzriss.gwenna.my.id)
 *   2. bot-lokal       — data/jadibot-platform.json + folder sessions/jadibot/<nomor>
 *
 * Kunci service role TIDAK ditulis di berkas ini. Disimpan di
 * `data/akun-platform.json` (mode 600, tidak masuk repo), sama seperti
 * `data/subdomain-kaira.json`.
 */

import fs from 'fs'
import path from 'path'

const BERKAS = path.join(process.cwd(), 'data', 'akun-platform.json')
const BERKAS_PLATFORM = path.join(process.cwd(), 'data', 'jadibot-platform.json')
const DIR_SESI = path.join(process.cwd(), 'sessions', 'jadibot')
const DIR_BACKUP = path.join(process.cwd(), 'data', 'akun-backup')

const BATAS_WAKTU = 20000

export const SITUS_BAWAAN = [
  {
    id: 'website-jadibot',
    nama: 'Website Jadibot',
    keterangan: 'Akun login di jadibot-alzriss.gwenna.my.id (Supabase)',
    alamat: 'https://jadibot-alzriss.gwenna.my.id/#login',
    backend: 'supabase',
  },
  {
    id: 'bot-lokal',
    nama: 'Bot lokal (sesi jadibot)',
    keterangan: 'Sesi WhatsApp yang tertaut ke akun ini di server bot',
    alamat: '',
    backend: 'lokal',
  },
]

let cache = null

export function bacaKonfig(kuatUlang = false) {
  if (cache && !kuatUlang) return cache
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS, 'utf8'))
    cache = {
      supabaseUrl: String(isi.supabaseUrl || '').replace(/\/+$/, ''),
      serviceRoleKey: String(isi.serviceRoleKey || ''),
      situs: Array.isArray(isi.situs) && isi.situs.length ? isi.situs : SITUS_BAWAAN,
    }
  } catch (error) {
    cache = null
  }
  return cache
}

export function akunSiap() {
  const cfg = bacaKonfig()
  return Boolean(cfg && cfg.supabaseUrl && cfg.serviceRoleKey)
}

export function daftarSitus() {
  const cfg = bacaKonfig()
  return (cfg && cfg.situs) || SITUS_BAWAAN
}

export function cariSitus(id) {
  const kunci = String(id || '').toLowerCase().trim()
  return daftarSitus().find((s) => s.id === kunci || String(s.nama).toLowerCase() === kunci) || null
}

/* ── validasi ──────────────────────────────────────────────────────────── */

export function validasiEmail(email) {
  const nilai = String(email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(nilai)) return ''
  return nilai
}

export function validasiSandi(sandi) {
  const nilai = String(sandi || '')
  if (nilai.length < 8) return 'Password minimal 8 karakter.'
  if (!/[A-Za-z]/.test(nilai)) return 'Password harus memuat huruf.'
  if (!/[0-9]/.test(nilai)) return 'Password harus memuat angka.'
  return ''
}

export function validasiUsername(nama) {
  const nilai = String(nama || '').trim()
  if (!/^[A-Za-z0-9_.-]{3,20}$/.test(nilai)) return 'Username 3–20 karakter, hanya huruf/angka/titik/garis bawah/strip.'
  return ''
}

/** Pisahkan `email | password | username`. */
export function parseBuatAkun(teks) {
  const bagian = String(teks || '').split('|').map((x) => x.trim())
  return { email: bagian[0] || '', password: bagian[1] || '', username: bagian[2] || '' }
}

/* ── klien Supabase (service role) ─────────────────────────────────────── */

async function sb(jalur, opsi = {}) {
  const cfg = bacaKonfig()
  if (!cfg || !cfg.supabaseUrl || !cfg.serviceRoleKey) {
    throw new Error('Kunci Supabase belum terpasang di data/akun-platform.json')
  }
  const url = cfg.supabaseUrl + jalur
  const kontrol = new AbortController()
  const jam = setTimeout(() => kontrol.abort(), BATAS_WAKTU)
  try {
    const res = await fetch(url, {
      method: opsi.method || 'GET',
      headers: {
        apikey: cfg.serviceRoleKey,
        Authorization: 'Bearer ' + cfg.serviceRoleKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(opsi.headers || {}),
      },
      body: opsi.body === undefined ? undefined : JSON.stringify(opsi.body),
      signal: kontrol.signal,
    })
    const teks = await res.text()
    let data = null
    try { data = teks ? JSON.parse(teks) : null } catch (error) { data = teks }
    if (!res.ok) {
      const pesan = (data && (data.msg || data.message || data.error_description || data.error)) || ''
      throw new Error('Supabase ' + res.status + (pesan ? ': ' + String(pesan).slice(0, 160) : ''))
    }
    return data
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('Supabase tidak menjawab (20 detik).')
    throw error
  } finally {
    clearTimeout(jam)
  }
}

/* ── pencarian akun ────────────────────────────────────────────────────── */

export async function cariAkunAuth(email) {
  const target = validasiEmail(email)
  if (!target) return { akun: [], profil: [] }
  const akun = []
  for (let halaman = 1; halaman <= 25; halaman += 1) {
    const data = await sb('/auth/v1/admin/users?page=' + halaman + '&per_page=200')
    const baris = (data && data.users) || []
    for (const user of baris) {
      if (String(user.email || '').toLowerCase() !== target) continue
      akun.push({
        id: user.id,
        email: user.email,
        dibuat: user.created_at || '',
        masukTerakhir: user.last_sign_in_at || '',
        terkonfirmasi: Boolean(user.email_confirmed_at),
      })
    }
    if (baris.length < 200) break
  }
  let profil = []
  try {
    profil = await sb('/rest/v1/users?select=id,email,username,role,created_at&email=eq.' + encodeURIComponent(target))
  } catch (error) {
    profil = []
  }
  return { akun, profil: Array.isArray(profil) ? profil : [] }
}

export function bacaPlatform() {
  try {
    return JSON.parse(fs.readFileSync(BERKAS_PLATFORM, 'utf8'))
  } catch (error) {
    return { sessions: {}, backups: {} }
  }
}

function tulisPlatform(data) {
  try {
    fs.writeFileSync(BERKAS_PLATFORM, JSON.stringify(data, null, 2))
    return true
  } catch (error) {
    return false
  }
}

/** Sesi jadibot yang tertaut ke email ini (dari data/jadibot-platform.json). */
export function cariSesiLokal(email) {
  const target = validasiEmail(email)
  if (!target) return []
  const data = bacaPlatform()
  const hasil = []
  const sesi = data.sessions || {}
  for (const nomor of Object.keys(sesi)) {
    const baris = sesi[nomor] || {}
    if (String(baris.email || '').toLowerCase() !== target) continue
    hasil.push({ nomor, dibuat: baris.createdAt || '', sesiAdaDiDisk: fs.existsSync(path.join(DIR_SESI, nomor)) })
  }
  return hasil
}

/** Apa saja yang tersimpan untuk satu email, di semua situs. */
export async function inventarisAkun(email) {
  const target = validasiEmail(email)
  const hasil = { email: target, situs: [] }
  if (!target) return hasil

  if (akunSiap()) {
    try {
      const auth = await cariAkunAuth(target)
      if (auth.akun.length || auth.profil.length) {
        hasil.situs.push({
          id: 'website-jadibot',
          nama: 'Website Jadibot',
          detail: auth.akun.length
            ? 'akun login' + (auth.profil[0] && auth.profil[0].username ? ' · @' + auth.profil[0].username : '') + (auth.profil[0] && auth.profil[0].role ? ' · ' + auth.profil[0].role : '')
            : 'hanya profil (akun login sudah tidak ada)',
          jumlah: auth.akun.length,
          profil: auth.profil.length,
        })
      }
    } catch (error) {
      hasil.galat = hasil.galat || []
      hasil.galat.push('website-jadibot: ' + error.message)
    }
  }

  const sesi = cariSesiLokal(target)
  if (sesi.length) {
    hasil.situs.push({
      id: 'bot-lokal',
      nama: 'Bot lokal (sesi jadibot)',
      detail: sesi.length + ' sesi: ' + sesi.map((s) => s.nomor).join(', '),
      jumlah: sesi.length,
    })
  }

  return hasil
}

/* ── pembuatan akun ────────────────────────────────────────────────────── */

export async function buatAkun({ email, password, username }) {
  const surel = validasiEmail(email)
  if (!surel) throw new Error('Email tidak valid.')
  const salahSandi = validasiSandi(password)
  if (salahSandi) throw new Error(salahSandi)
  const salahNama = validasiUsername(username)
  if (salahNama) throw new Error(salahNama)

  const sudah = await cariAkunAuth(surel)
  if (sudah.akun.length) throw new Error('Email ' + surel + ' sudah punya akun. Pakai .delakun dulu kalau mau dibuat ulang.')

  const dibuat = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: {
      email: surel,
      password: String(password),
      email_confirm: true,
      user_metadata: { username: String(username).trim() },
    },
  })

  /* Trigger database biasanya sudah membuat baris `users`. Kalau belum,
   * baris itu dibuat di sini supaya akun langsung bisa dipakai di website. */
  let profil = null
  try {
    const baris = await sb('/rest/v1/users?email=eq.' + encodeURIComponent(surel) + '&select=id,email,username,role')
    if (Array.isArray(baris) && baris.length) {
      profil = baris[0]
      if (String(profil.username || '') !== String(username).trim()) {
        await sb('/rest/v1/users?email=eq.' + encodeURIComponent(surel), {
          method: 'PATCH',
          body: { username: String(username).trim(), updated_at: new Date().toISOString() },
          headers: { Prefer: 'return=representation' },
        })
        profil.username = String(username).trim()
      }
    } else {
      const sisip = await sb('/rest/v1/users', {
        method: 'POST',
        body: [{ id: dibuat && dibuat.id ? dibuat.id : undefined, email: surel, username: String(username).trim(), role: 'free' }],
        headers: { Prefer: 'return=representation' },
      })
      profil = Array.isArray(sisip) ? sisip[0] : null
    }
  } catch (error) {
    profil = { email: surel, username: String(username).trim(), catatan: error.message }
  }

  return {
    id: dibuat && dibuat.id ? dibuat.id : '',
    email: surel,
    username: String(username).trim(),
    profil,
  }
}

/* ── penghapusan ───────────────────────────────────────────────────────── */

function pastikanBackup(data) {
  try {
    fs.mkdirSync(DIR_BACKUP, { recursive: true })
    const nama = 'akun-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'
    const jalur = path.join(DIR_BACKUP, nama)
    fs.writeFileSync(jalur, JSON.stringify(data, null, 2))
    return jalur
  } catch (error) {
    return ''
  }
}

/** Hapus akun login + baris profil di Supabase. */
export async function hapusAkunSupabase(email) {
  const target = validasiEmail(email)
  if (!target) throw new Error('Email tidak valid.')
  const hasil = { hapusAuth: 0, hapusProfil: 0, backup: '', sisa: 0 }
  const cari = await cariAkunAuth(target)
  hasil.backup = pastikanBackup({ email: target, dihapusPada: new Date().toISOString(), auth: cari.akun, profil: cari.profil })

  for (const akun of cari.akun) {
    await sb('/auth/v1/admin/users/' + akun.id, { method: 'DELETE' })
    hasil.hapusAuth += 1
  }
  for (const tabel of ['users', 'platform_profiles', 'api_profiles']) {
    try {
      const sisa = await sb('/rest/v1/' + tabel + '?email=eq.' + encodeURIComponent(target) + '&select=id', { method: 'GET' })
      if (Array.isArray(sisa) && sisa.length) {
        await sb('/rest/v1/' + tabel + '?email=eq.' + encodeURIComponent(target), { method: 'DELETE' })
        hasil.hapusProfil += sisa.length
      }
    } catch (error) {
      /* tabel tanpa kolom email / tanpa izin → lewati, jangan gagalkan semuanya */
    }
  }

  const sisa = await cariAkunAuth(target)
  hasil.sisa = sisa.akun.length + sisa.profil.length
  return hasil
}

/** Hapus sesi jadibot + folder sesinya untuk email ini. */
export async function hapusAkunLokal(email) {
  const target = validasiEmail(email)
  const sesi = cariSesiLokal(target)
  const hasil = { diputus: 0, folder: 0, catatan: [] }

  if (sesi.length) {
    let jadibot = null
    try { jadibot = await import('./jadibot.js') } catch (error) { jadibot = null }
    for (const item of sesi) {
      try {
        if (jadibot && typeof jadibot.disconnectSubBot === 'function') {
          await jadibot.disconnectSubBot(item.nomor, { deleteSession: false })
          hasil.diputus += 1
        }
      } catch (error) {
        hasil.catatan.push(item.nomor + ': ' + error.message)
      }
      const folder = path.join(DIR_SESI, item.nomor)
      try {
        if (fs.existsSync(folder)) {
          fs.rmSync(folder, { recursive: true, force: true })
          hasil.folder += 1
        }
      } catch (error) {
        hasil.catatan.push(item.nomor + ': folder gagal dihapus (' + error.message + ')')
      }
    }
  }

  const data = bacaPlatform()
  let berubah = false
  const sesiData = data.sessions || {}
  for (const nomor of Object.keys(sesiData)) {
    if (String((sesiData[nomor] || {}).email || '').toLowerCase() !== target) continue
    delete sesiData[nomor]
    berubah = true
  }
  const backupData = data.backups || {}
  for (const id of Object.keys(backupData)) {
    if (String((backupData[id] || {}).email || '').toLowerCase() !== target) continue
    delete backupData[id]
    berubah = true
  }
  if (berubah) {
    data.sessions = sesiData
    data.backups = backupData
    tulisPlatform(data)
  }

  return hasil
}

/** Hapus akun dari satu situs (dipakai tombol pilihan). */
export async function hapusAkunDi(email, idSitus) {
  const situs = cariSitus(idSitus)
  if (!situs) throw new Error('Situs "' + idSitus + '" tidak dikenal.')
  if (situs.backend === 'supabase') {
    const hasil = await hapusAkunSupabase(email)
    return { situs: situs.nama, ...hasil }
  }
  if (situs.backend === 'lokal') {
    const hasil = await hapusAkunLokal(email)
    return { situs: situs.nama, ...hasil }
  }
  throw new Error('Backend situs ' + situs.nama + ' belum didukung bot.')
}

/** Hapus akun di SEMUA situs yang terdaftar. */
export async function hapusAkunSemuaSitus(email) {
  const ringkasan = []
  for (const situs of daftarSitus()) {
    try {
      const hasil = await hapusAkunDi(email, situs.id)
      ringkasan.push({ situs: situs.nama, ok: true, hasil })
    } catch (error) {
      ringkasan.push({ situs: situs.nama, ok: false, galat: error.message })
    }
  }
  return ringkasan
}

/**
 * Hapus SEMUA akun di semua situs. Dipakai `.delakunall KONFIRMASI`.
 * Sebelum menghapus, daftar akun disimpan ke data/akun-backup/.
 */
export async function hapusSeluruhAkun({ batas = 2000 } = {}) {
  const cfg = bacaKonfig()
  if (!cfg) throw new Error('Konfigurasi akun belum ada.')
  const ringkasan = { auth: 0, gagal: [], backup: '', sesiLokal: 0 }

  const semua = []
  for (let halaman = 1; halaman <= 25; halaman += 1) {
    const data = await sb('/auth/v1/admin/users?page=' + halaman + '&per_page=200')
    const baris = (data && data.users) || []
    for (const user of baris) semua.push({ id: user.id, email: user.email, dibuat: user.created_at || '' })
    if (baris.length < 200) break
    if (semua.length >= batas) break
  }

  ringkasan.backup = pastikanBackup({ mode: 'hapus-semua', dihapusPada: new Date().toISOString(), jumlah: semua.length, akun: semua })

  const terhapus = []
  for (const user of semua) {
    try {
      await sb('/auth/v1/admin/users/' + user.id, { method: 'DELETE' })
      ringkasan.auth += 1
      if (user.email) terhapus.push(String(user.email).toLowerCase())
    } catch (error) {
      ringkasan.gagal.push((user.email || user.id) + ': ' + error.message)
    }
  }

  /* Bersihkan sisa baris profil HANYA untuk akun yang benar-benar terhapus.
   * Jangan menyapu seluruh tabel: kalau ada akun yang gagal dihapus, datanya
   * harus tetap utuh. */
  const daftarEmail = Array.from(new Set(terhapus))
  for (const tabel of ['users', 'platform_profiles', 'api_profiles']) {
    for (let mulai = 0; mulai < daftarEmail.length; mulai += 50) {
      const potong = daftarEmail.slice(mulai, mulai + 50)
      if (!potong.length) continue
      const filter = potong.map((x) => '"' + x + '"').join(',')
      try {
        await sb('/rest/v1/' + tabel + '?email=in.(' + encodeURIComponent(filter) + ')', { method: 'DELETE' })
      } catch (error) { /* tabel tanpa kolom email → lewati */ }
    }
  }
  const data = bacaPlatform()
  const sesi = data.sessions || {}
  for (const nomor of Object.keys(sesi)) {
    try {
      const folder = path.join(DIR_SESI, nomor)
      if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true })
      delete sesi[nomor]
      ringkasan.sesiLokal += 1
    } catch (error) { /* lewati */ }
  }
  data.sessions = sesi
  data.backups = {}
  tulisPlatform(data)

  return ringkasan
}

export default {
  bacaKonfig, akunSiap, daftarSitus, cariSitus,
  validasiEmail, validasiSandi, validasiUsername, parseBuatAkun,
  cariAkunAuth, cariSesiLokal, inventarisAkun,
  buatAkun, hapusAkunSupabase, hapusAkunLokal, hapusAkunDi, hapusAkunSemuaSitus, hapusSeluruhAkun,
}
