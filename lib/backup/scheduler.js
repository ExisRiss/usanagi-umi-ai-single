/* Task171 — penjadwal backup otomatis + unggah ke upload.gwenna.my.id
 * dan notifikasi link ke nomor owner.
 *
 * Alur satu putaran (`jalankanBackup`):
 *   1. cek sisa disk (BACKUP_MIN_FREE_BYTES)
 *   2. buat arsip tar.gz (lib/backup/arsip.js)
 *   3. enkripsi + unggah ke upload.gwenna.my.id (lib/backup/unggah.js)
 *   4. kirim link + ukuran + sha256 ke owner lewat WhatsApp (lib/backup/kirim.js)
 *   5. rapikan arsip lama (lokal & folder unggah)
 *
 * Status terakhir disimpan di `data/backup-system/otomatis.json` sehingga bisa
 * dibaca dari WhatsApp (`.backup status`) tanpa membuka log server.
 */

import fs from 'fs'
import path from 'path'
import { backupConfig } from './config.js'
import { buatArsip, bersihkanArsipLokal, ruangBebasByte } from './arsip.js'
import { unggahArsip } from './unggah.js'
import { kirimKeOwner, kirimAntre } from './kirim.js'
import { folderBackup } from './unggah.js'

export function waktuWita(ms = Date.now()) {
  try {
    return new Date(ms).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', hour12: false }) + ' WITA'
  } catch (error) {
    return new Date(ms).toISOString()
  }
}

function mb(byte) {
  const n = Number(byte) || 0
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

export function mbTeks(byte) { return mb(byte) }

export function bacaStatus(cfg = null) {
  const konf = cfg || backupConfig()
  try {
    return JSON.parse(fs.readFileSync(konf.otomatisFile, 'utf8'))
  } catch (error) {
    return { terakhir: null, riwayat: [], jumlah: { sukses: 0, gagal: 0 } }
  }
}

function simpanStatus(cfg, data) {
  try {
    fs.mkdirSync(cfg.dir, { recursive: true })
    fs.writeFileSync(cfg.otomatisFile, JSON.stringify(data, null, 2), { mode: 0o600 })
  } catch (error) { }
}

/** Hapus arsip unggahan lama (hanya berkas backup milik nomor owner). */
function bersihkanUnggahan(cfg) {
  let dihapus = 0
  try {
    const folderId = folderBackup(cfg)
    if (!folderId) return 0
    const folder = path.join(cfg.root, 'data', 'upload-publik', folderId)
    if (!fs.existsSync(folder)) return 0
    const daftar = fs.readdirSync(folder)
      .filter((n) => n.startsWith('backup_') && (n.endsWith('.tar.gz') || n.endsWith('.tar.gz.enc')))
      .map((n) => ({ n, w: fs.statSync(path.join(folder, n)).mtimeMs }))
      .sort((a, b) => b.w - a.w)
    for (const item of daftar.slice(Math.max(1, cfg.lokalSimpan))) {
      try { fs.rmSync(path.join(folder, item.n), { force: true }); dihapus += 1 } catch (error) { }
    }
  } catch (error) { }
  return dihapus
}

let sedangJalan = false

/* Kunci berkas: mencegah dua putaran berjalan bersamaan (mis. plugin dimuat
 * ulang saat backup sedang menulis arsip). Kunci lebih tua dari 15 menit
 * dianggap sisa proses mati dan boleh diambil alih. */
function ambilKunci(cfg) {
  try {
    const st = fs.statSync(cfg.kunciFile)
    if (Date.now() - st.mtimeMs < 15 * 60 * 1000) return false
  } catch (error) { }
  try {
    fs.mkdirSync(path.dirname(cfg.kunciFile), { recursive: true })
    fs.writeFileSync(cfg.kunciFile, String(process.pid), { mode: 0o600 })
    return true
  } catch (error) {
    return true
  }
}

function lepasKunci(cfg) {
  try { fs.rmSync(cfg.kunciFile, { force: true }) } catch (error) { }
}

/**
 * Jalankan satu siklus backup.
 * @returns {Promise<object>} ringkasan hasil
 */
export async function jalankanBackup({ alasan = 'jadwal', cfg = null } = {}) {
  const konf = cfg || backupConfig()
  if (sedangJalan) return { ok: false, alasan: 'backup lain sedang berjalan' }
  if (!ambilKunci(konf)) return { ok: false, alasan: 'backup lain sedang berjalan (kunci aktif)' }
  sedangJalan = true
  const mulai = Date.now()
  const status = bacaStatus(konf)
  const hasil = {
    waktu: mulai,
    waktuTeks: waktuWita(mulai),
    alasan,
    ok: false,
    tahap: 'mulai',
    arsip: null,
    unggah: null,
    notif: null,
    galat: null,
  }

  try {
    const bebas = ruangBebasByte(konf.root)
    hasil.diskBebas = bebas
    if (bebas < konf.minFreeByte) throw new Error(`disk terlalu penuh (bebas ${mb(bebas)}, minimum ${mb(konf.minFreeByte)})`)

    hasil.tahap = 'arsip'
    const arsip = await buatArsip(konf)
    hasil.arsip = {
      nama: arsip.nama,
      ukuran: arsip.ukuran,
      ukuranTeks: mb(arsip.ukuran),
      sha256: arsip.sha256,
      entri: arsip.jumlahBerkas,
      komponen: arsip.komponen,
      situs: arsip.jumlahSitus,
      jadibot: arsip.jumlahJadibot,
      tunnel: arsip.komponen.includes('.tunnel.env'),
      durasiMs: arsip.durasiMs,
    }

    hasil.tahap = 'unggah'
    if (konf.unggah) {
      const unggah = await unggahArsip(konf, arsip)
      hasil.unggah = unggah
    }

    hasil.tahap = 'notif'
    const baris = [
      '🗄️ *BACKUP BOT — SELESAI*',
      '',
      `Waktu    : ${hasil.waktuTeks}`,
      `Arsip    : ${arsip.nama}`,
      `Ukuran   : ${mb(arsip.ukuran)} (${arsip.jumlahBerkas} entri)`,
      `Isi      : ${arsip.komponen.join(', ')}`,
      `Website  : ${arsip.jumlahSitus} situs deploy ikut (folder situs/)`,
      `Jadibot  : ${arsip.jumlahJadibot} sesi jadibot ikut (sessions/jadibot/)`,
      `Tunnel   : ${arsip.komponen.includes('.tunnel.env') ? 'token .tunnel.env ikut' : '⚠️ .tunnel.env TIDAK ada'}`,
      `SHA-256  : ${arsip.sha256.slice(0, 32)}…`,
      `Durasi   : ${Date.now() - mulai} ms`,
    ]
    if (hasil.unggah) {
      baris.push('', '🔗 *Link unduhan*', hasil.unggah.url)
      baris.push('', '📦 Arsip tidak dienkripsi — langsung ekstrak pakai tar.')
      baris.push(`📥 Unduh langsung: ${hasil.unggah.urlUnduh}`)
      baris.push('', '⚠️ Link ini berisi sesi WhatsApp + token tunnel. Jangan dibagikan.')
    } else {
      baris.push('', '⚠️ Unggah dimatikan (BACKUP_UPLOAD=0) — arsip hanya di server.')
    }
    hasil.notif = await kirimKeOwner(konf, baris.join('\n'))
    hasil.ok = true
    hasil.tahap = 'selesai'
  } catch (error) {
    hasil.ok = false
    hasil.galat = error.message
    hasil.notif = await kirimKeOwner(konf, [
      '⚠️ *BACKUP GAGAL*',
      '',
      `Waktu : ${waktuWita()}`,
      `Tahap : ${hasil.tahap}`,
      `Sebab : ${error.message}`,
    ].join('\n'))
  } finally {
    hasil.durasiMs = Date.now() - mulai
    /* antrean pesan lama dikirim dulu supaya tidak menumpuk */
    try { hasil.antre = await kirimAntre(konf) } catch (error) { }
    hasil.lokalDihapus = bersihkanArsipLokal(konf)
    hasil.unggahanDihapus = bersihkanUnggahan(konf)

    const baru = bacaStatus(konf)
    baru.terakhir = hasil
    baru.riwayat = [hasil, ...(Array.isArray(baru.riwayat) ? baru.riwayat : [])].slice(0, 20)
    baru.jumlah = {
      sukses: Number(baru?.jumlah?.sukses || 0) + (hasil.ok ? 1 : 0),
      gagal: Number(baru?.jumlah?.gagal || 0) + (hasil.ok ? 0 : 1),
    }
    baru.diperbarui = Date.now()
    simpanStatus(konf, baru)
    lepasKunci(konf)
    sedangJalan = false
  }
  return hasil
}

let timer = null
let bootTimer = null

/** Mulai penjadwal. Aman dipanggil berulang (timer lama dibersihkan). */
export function mulaiPenjadwal(cfg = null) {
  const konf = cfg || backupConfig()
  if (!konf.autostart) return { aktif: false, alasan: 'BACKUP_AUTOSTART=0' }

  /* Aman saat plugin dimuat ulang: timer lama (modul lama) dibersihkan. */
  const lama = globalThis.__umiBackupTimer
  if (lama && lama.interval) clearInterval(lama.interval)
  if (lama && lama.boot) clearTimeout(lama.boot)
  if (timer) clearInterval(timer)
  if (bootTimer) clearTimeout(bootTimer)

  const putaran = () => {
    jalankanBackup({ alasan: 'jadwal', cfg: konf }).then((hasil) => {
      console.log(`[BACKUP] ${hasil.ok ? 'sukses' : 'gagal'} — ${hasil.ok ? hasil.unggah?.url || hasil.arsip.nama : hasil.galat}`)
    }).catch((error) => console.warn('[BACKUP]', error.message))
  }

  /* Putaran pertama 90 detik setelah start (menunggu WhatsApp tersambung). */
  bootTimer = setTimeout(() => {
    const st = bacaStatus(konf)
    const terakhir = Number(st?.terakhir?.waktu || 0)
    const formatLama = Boolean(st?.terakhir?.unggah && st.terakhir.unggah.enkripsi)
    /* Task172 — arsip versi lama (terenkripsi) dianggap belum ada: langsung
     * buat arsip baru berformat sekarang sesudah bot naik.
     * Task206 — backup terakhir GAGAL juga langsung diulang saat boot
     * (dulu menunggu satu jam penuh hanya untuk gagal lagi). */
    const perlu = !terakhir || formatLama || st?.terakhir?.ok === false || Date.now() - terakhir >= konf.intervalMs
    if (perlu) putaran()
  }, 90_000)
  bootTimer.unref?.()

  timer = setInterval(putaran, konf.intervalMs)
  timer.unref?.()
  globalThis.__umiBackupTimer = { interval: timer, boot: bootTimer }

  return { aktif: true, intervalMenit: konf.intervalMenit, owner: konf.owner, unggah: konf.unggah }
}

export default { jalankanBackup, mulaiPenjadwal, bacaStatus, waktuWita, mbTeks }
