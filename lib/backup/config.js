/* By AlzRiss - Usanagi Umi AI
 *
 * Task171 — konfigurasi sistem backup otomatis.
 *
 * Sumber setelan: `.backup-system.env` di akar server (mode 600). Kunci yang
 * sudah ada (BACKUP_AUTOSTART, BACKUP_INTERVAL_MINUTES, …) tetap dipakai;
 * kunci baru untuk Task171:
 *   BACKUP_UPLOAD=1              → unggah arsip ke upload.gwenna.my.id
 *   BACKUP_OWNER_NUMBER=6287…    → nomor yang dikirimi link
 *   BACKUP_ENC_KEY=<rahasia>     → kunci enkripsi arsip (WAJIB, arsip publik)
 *   BACKUP_LOCAL_KEEP=6          → arsip lokal yang disimpan
 *
 * Tidak memakai dotenv: parser kecil di bawah supaya tidak menambah dependensi.
 */

import fs from 'fs'
import path from 'path'

export const BAWAAN = {
  intervalMenit: 60,
  retensi: 48,
  minFreeByte: 384 * 1024 * 1024,
  maksArsipByte: 60 * 1024 * 1024,
  owner: '6287813709432',
  autostart: true,
  unggah: true,
  lokalSimpan: 6,
  retensiHari: 14,
}

export function bacaEnvBerkas(berkas) {
  const hasil = {}
  let isi = ''
  try {
    isi = fs.readFileSync(berkas, 'utf8')
  } catch (error) {
    return hasil
  }
  for (const baris of isi.split(/\r?\n/)) {
    const bersih = baris.trim()
    if (!bersih || bersih.startsWith('#')) continue
    const posisi = bersih.indexOf('=')
    if (posisi <= 0) continue
    const kunci = bersih.slice(0, posisi).trim()
    let nilai = bersih.slice(posisi + 1).trim()
    if ((nilai.startsWith('"') && nilai.endsWith('"')) || (nilai.startsWith("'") && nilai.endsWith("'"))) {
      nilai = nilai.slice(1, -1)
    }
    hasil[kunci] = nilai
  }
  return hasil
}

function angka(nilai, cadangan) {
  const teks = String(nilai === undefined || nilai === null ? '' : nilai).trim()
  if (!teks) return cadangan
  const n = Number(teks)
  return Number.isFinite(n) && n >= 0 ? n : cadangan
}

function benar(nilai, cadangan) {
  if (nilai === undefined || nilai === null || nilai === '') return cadangan
  return !['0', 'false', 'no', 'off', 'tidak', 'mati'].includes(String(nilai).trim().toLowerCase())
}

/** Konfigurasi lengkap. `root` default = folder kerja bot (sama seperti boot.js). */
export function backupConfig(root = process.cwd()) {
  const env = { ...bacaEnvBerkas(path.join(root, '.backup-system.env')), ...process.env }
  const dir = path.join(root, 'data', 'backup-system')
  const arsipDir = path.join(dir, 'archives')
  const logDir = path.join(dir, 'logs')
  const intervalMenit = Math.max(5, angka(env.BACKUP_INTERVAL_MINUTES, BAWAAN.intervalMenit))
  return {
    root,
    dir,
    arsipDir,
    logDir,
    indexFile: path.join(dir, 'index.json'),
    stateFile: path.join(dir, 'state.json'),
    otomatisFile: path.join(dir, 'otomatis.json'),
    antreNotif: path.join(dir, 'antre-notif.json'),
    kunciFile: path.join(dir, 'scheduler.lock'),
    pendingRestore: path.join(dir, 'restore-pending.json'),
    intervalMenit,
    intervalMs: intervalMenit * 60 * 1000,
    retensi: Math.max(1, angka(env.BACKUP_RETENTION_COUNT, BAWAAN.retensi)),
    lokalSimpan: Math.max(1, angka(env.BACKUP_LOCAL_KEEP, BAWAAN.lokalSimpan)),
    minFreeByte: angka(env.BACKUP_MIN_FREE_BYTES, BAWAAN.minFreeByte),
    maksArsipByte: angka(env.BACKUP_MAKS_ARSIP_BYTES, BAWAAN.maksArsipByte),
    owner: String(env.BACKUP_OWNER_NUMBER || BAWAAN.owner).replace(/\D/g, '') || BAWAAN.owner,
    autostart: benar(env.BACKUP_AUTOSTART, BAWAAN.autostart),
    unggah: benar(env.BACKUP_UPLOAD, BAWAAN.unggah),
    retensiHari: Math.max(1, angka(env.BACKUP_RETENTION_DAYS, BAWAAN.retensiHari)),
    enkripsiKey: String(env.BACKUP_ENC_KEY || env.BACKUP_ADMIN_SECRET || '').trim(),
  }
}

export default backupConfig
