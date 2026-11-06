/* Task172 — pembuatan arsip backup (tar.gz) LENGKAP untuk pindah server tunnel.
 *
 * Tujuan: satu berkas backup cukup untuk membangun ulang server bot + tunnel
 * di mesin/panel baru tanpa kehilangan apa pun.
 *
 * Isi arsip:
 *   sessions/            → sesi bot utama + sessions/jadibot/<nomor> (sesi jadibot)
 *   data/                → registry situs, domain-kontrol, jadibot-platform,
 *                          akun-platform, backup jadibot, setting, database
 *   situs/               → SEMUA website yang di-deploy user (HTML/asset)
 *   public/              → halaman web milik bot (studio, realms)
 *   .tunnel.env          → token tunnel Cloudflare (supaya tunnel hidup lagi)
 *   config.js .env*      → kunci API & konfigurasi bot
 *   core/ lib/ plugins/ scripts/ src/ json/ assets/ font/ integrations/
 *                        → kode bot (tanpa node_modules, tanpa .git)
 *   package.json package-lock.json database.json
 *   TUTORIAL-BACKUP-OTOMATIS.md
 *
 * Yang DILEWATI (bukan data, atau bisa dibuat ulang otomatis):
 *   node_modules .git .cache .npm tmp media sessions-backup
 *   data/upload-publik (media publik)  data/backup-system/archives|logs|restore-kerja
 *   data/cloudflared.log .pi  cloudflared (biner 40 MB, diunduh ulang otomatis)
 *   archive-*.tar.gz .  _user-backup . backup lama
 */

import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'

const KOMPONEN = [
  'sessions',
  'data',
  'situs',
  'public',
  'core',
  'lib',
  'plugins',
  'scripts',
  'json',
  'integrations',
  'src',
  'assets',
  'font',
  'config.js',
  'database.json',
  'package.json',
  'package-lock.json',
  'TUTORIAL-BACKUP-OTOMATIS.md',
  '.tunnel.env',
  '.backup-system.env',
]

const POLA_ENV = /^\.env(\..*)?$/

const LEWATI = [
  'node_modules',
  '.git',
  '.cache',
  '.npm',
  'tmp',
  'media',
  'sessions-backup',
  '_user-backup',
  'data/upload-publik',
  'data/backup-system/archives',
  'data/backup-system/logs',
  'data/backup-system/restore-kerja',
  'data/cloudflared.log',
  'data/cloudflared.pid',
  'data/tofile',
  'cloudflared',
  'archive-*.tar.gz',
  '*.log',
  /* Task206 — pres arsip di bawah batas unggah 100 MB (pengukuran 4/11/2026:
   * arsip 142 MB dari total mentah ±268 MB). Yang dibuang: log latency
   * (21 MB mentah), salinan sesi/backup-dalam-backup, foto seleksi (33 MB
   * PNG tak termampatkan — db.json TETAP ikut), template QC/meme statis
   * (68 MB JSON), video, dan public/ (ada di repo git — ikut saat clone). */
  'data/latency-*.jsonl',
  'data/jadibot-backups',
  'data/auto-update-backup',
  'data/akun-backup',
  'data/seleksi/foto',
  'assets/igqc',
  'assets/ttqc',
  'assets/wacall_meme',
  'assets/video',
  '*.mp4',
  '*.webm',
  'public',
]

/* Peringatan yang TIDAK menggagalkan arsip: file hidup berubah saat dibaca
 * (sesi jadibot aktif) — arsip tetap valid, hanya status keluar tar = 1. */
const GALAT_LUNAK = /file changed as we read it|File removed as we read it|socket ignored/i

function jalankanTar(args, batasMs = 300000) {
  return new Promise((selesai, gagal) => {
    const anak = spawn('tar', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let keluaran = ''
    let galat = ''
    const timer = setTimeout(() => {
      try { anak.kill('SIGKILL') } catch (error) { }
      gagal(new Error('tar melebihi batas waktu'))
    }, batasMs)
    anak.stdout.on('data', (c) => { keluaran += c.toString() })
    anak.stderr.on('data', (c) => { galat += c.toString() })
    anak.on('error', (e) => { clearTimeout(timer); gagal(e) })
    anak.on('close', (kode) => {
      clearTimeout(timer)
      if (kode === 0) { selesai(keluaran); return }
      /* Keluaran1 karena file berubah saat dibaca → arsip tetap dipakai
       * (verifikasi -tzf di bawah yang memastikan isi utuh). */
      if (kode === 1 && GALAT_LUNAK.test(galat)) { selesai(keluaran); return }
      /* Task206 — jejak argumen memudahkan diagnosis bila tar gagal lagi. */
      console.warn('[BACKUP-TAR] kode', kode, '| args:', args.join(' ').slice(0, 600))
      gagal(new Error(`tar gagal (${kode}): ${galat.trim().slice(0, 200)}`))
    })
  })
}

function ada(berkas) {
  try { fs.accessSync(berkas); return true } catch (error) { return false }
}

/** Catatan singkat di dalam arsip: cara memulihkan di server baru.
 * Task206 — ditulis di AKAR root (bukan os.tmpdir()): dulu berkas ini dibuat
 * di /tmp lalu dijadikan member lewat `-C <dir>`, dan tar gagal (2) tiap kali
 * direktori itu tidak ditemukan saat spawn (bug yang menghantui backup
 * berhari-hari). File akar dijamin ada (satu proses menulis → langsung dipakai)
 * dan dihapus setelah tar selesai. */
function tulisPanduan(komponen, tujuan) {
  const berkas = tujuan
  const isi = [
    'BACKUP UMI USANAGI AI',
    '======================',
    `Dibuat : ${new Date().toISOString()}`,
    `Isi    : ${komponen.join(', ')}`,
    '',
    'CARA PULIH DI SERVER TUNNEL BARU',
    '1. Siapkan server Node.js + tar (sama seperti server lama).',
    '2. Ekstrak arsip ini ke folder kerja bot:',
    '      tar -xzf <berkas>.tar.gz -C /path/ke/bot',
    '3. npm install   (node_modules tidak ikut, dibuat ulang)',
    '4. Pastikan .tunnel.env ada (token tunnel Cloudflare) — ikut di arsip.',
    '   Biner cloudflared (40 MB) tidak ikut; lib/tunnel-otomatis.js',
    '   mengunduhnya otomatis saat pertama jalan.',
    '5. Jalankan bot: npm start / node scripts/boot.js',
    '6. Situs user di folder situs/ langsung dilayani lagi karena',
    '   data/subdomain-registry.json ikut di arsip.',
    '7. Sesi WhatsApp (bot utama + jadibot) ikut, jadi tidak perlu pairing',
    '   ulang selama sesi belum kedaluwarsa.',
    '',
    'Kalau memakai perintah WhatsApp: .backup pulih <link> lalu .restart',
  ].join('\n')
  try {
    fs.writeFileSync(berkas, isi, { mode: 0o600 })
    return berkas
  } catch (error) {
    return ''
  }
}

/** Daftar berkas/komponen yang benar-benar ada di root. */
export function komponenAda(root) {
  const daftar = []
  for (const nama of KOMPONEN) {
    if (ada(path.join(root, nama))) daftar.push(nama)
  }
  try {
    for (const isi of fs.readdirSync(root)) {
      if (POLA_ENV.test(isi) && ada(path.join(root, isi)) && !daftar.includes(isi)) daftar.push(isi)
    }
  } catch (error) { }
  return daftar
}

function sha256Berkas(berkas) {
  const hash = crypto.createHash('sha256')
  const fd = fs.openSync(berkas, 'r')
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024)
    let dibaca = 0
    while ((dibaca = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, dibaca))
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest('hex')
}

function hitungSitus(root) {
  try {
    const reg = JSON.parse(fs.readFileSync(path.join(root, 'data', 'subdomain-registry.json'), 'utf8'))
    return Object.keys(reg || {}).length
  } catch (error) {
    try { return fs.readdirSync(path.join(root, 'situs')).length } catch (e) { return 0 }
  }
}

function hitungJadibot(root) {
  try {
    return fs.readdirSync(path.join(root, 'sessions', 'jadibot'), { withFileTypes: true })
      .filter((d) => d.isDirectory()).length
  } catch (error) {
    return 0
  }
}

function stempel() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

/** Sisa ruang disk (byte) — pakai statvfs, tanpa memanggil `df`. */
export function ruangBebasByte(root) {
  try {
    const stat = fs.statvfsSync ? fs.statvfsSync(root) : null
    if (stat) return Number(stat.bavail) * Number(stat.bsize)
  } catch (error) { }
  return Number.MAX_SAFE_INTEGER
}

/**
 * Buat arsip tar.gz lengkap.
 * @returns {Promise<{berkas:string, nama:string, ukuran:number, sha256:string, komponen:string[], jumlahBerkas:number, durasiMs:number}>}
 */
export async function buatArsip(cfg) {
  const mulai = Date.now()
  fs.mkdirSync(cfg.arsipDir, { recursive: true, mode: 0o700 })

  const komponen = komponenAda(cfg.root)
  if (!komponen.some((k) => k === 'sessions' || k === 'data')) {
    throw new Error('Tidak ada sessions/ atau data/ untuk dibackup — folder kerja salah?')
  }

  /* Panduan versi lama sempat ditulis di dalam data/ — bersihkan sisa. */
  try { fs.rmSync(path.join(cfg.dir, '_CARA-PULIH.txt'), { force: true }) } catch (error) { }
  /* Task206 — panduan ditulis di AKAR root (di jamin ada saat tar jalan,
   * tanpa `-C` ke folder tmp yang pernah hilang → tar gagal (2)). */
  const panduanBerkas = path.join(cfg.root, '_CARA-PULIH.txt')
  try { fs.rmSync(panduanBerkas, { force: true }) } catch (error) { }
  const panduan = tulisPanduan(komponen, panduanBerkas)
  const id = crypto.randomBytes(4).toString('hex')
  const nama = `backup_${stempel()}_${id}.tar.gz`
  const berkas = path.join(cfg.arsipDir, nama)

  /* Task206 — gzip -9 (pres lebih rapat dari bawaan -6) + abaikan peringatan
   * file berubah saat dibaca (sudah ditangani jalankanTar). */
  const argsDasar = ['-c', '-f', berkas, '-I', 'gzip -9', '--warning=no-file-changed', '-C', cfg.root]
  for (const lewati of LEWATI) argsDasar.push(`--exclude=${lewati}`)
  argsDasar.push(...komponen)

  /* Panduan hanya diikutkan bila berkasnya benar-benar ada; kegagalan panduan
   * TIDAK boleh menggagalkan seluruh backup (backstop: ulang tanpa panduan). */
  const argsPanduan = (panduan && ada(panduan)) ? ['_CARA-PULIH.txt'] : []
  try {
    await jalankanTar([...argsDasar, ...argsPanduan])
  } catch (error) {
    const karenaPanduan = /_CARA-PULIH|umi-backup-panduan/.test(String(error?.message || ''))
    if (!argsPanduan.length || !kenapaPanduan) throw error
    console.warn('[BACKUP] panduan bermasalah — ulang tanpa panduan:', error?.message || error)
    await jalankanTar(argsDasar)
  } finally {
    if (panduan) { try { fs.rmSync(panduan, { force: true }) } catch (error) { } }
  }

  const ukuran = fs.statSync(berkas).size
  if (!ukuran) {
    fs.rmSync(berkas, { force: true })
    throw new Error('Arsip kosong.')
  }

  /* Verifikasi: arsip harus bisa dibaca ulang dan berisi banyak berkas. */
  const daftar = await jalankanTar(['-tzf', berkas], 180000)
  const jumlahBerkas = daftar.split('\n').filter(Boolean).length
  if (jumlahBerkas < 20) {
    fs.rmSync(berkas, { force: true })
    throw new Error(`Arsip tidak wajar (hanya ${jumlahBerkas} entri) — dibatalkan.`)
  }

  return {
    berkas,
    nama,
    ukuran,
    sha256: sha256Berkas(berkas),
    komponen,
    jumlahBerkas,
    jumlahSitus: hitungSitus(cfg.root),
    jumlahJadibot: hitungJadibot(cfg.root),
    durasiMs: Date.now() - mulai,
  }
}

/** Hapus arsip lokal lama, sisakan `simpan` berkas terbaru. */
export function bersihkanArsipLokal(cfg, simpan = cfg.lokalSimpan) {
  let dihapus = 0
  try {
    const daftar = fs.readdirSync(cfg.arsipDir)
      .filter((n) => n.startsWith('backup_') && (n.endsWith('.tar.gz') || n.endsWith('.tar.gz.enc')))
      .map((n) => ({ n, w: fs.statSync(path.join(cfg.arsipDir, n)).mtimeMs }))
      .sort((a, b) => b.w - a.w)
    for (const item of daftar.slice(simpan)) {
      try { fs.rmSync(path.join(cfg.arsipDir, item.n), { force: true }); dihapus += 1 } catch (error) { }
    }
  } catch (error) { }
  return dihapus
}

export { sha256Berkas }
export default { buatArsip, bersihkanArsipLokal, komponenAda, ruangBebasByte, sha256Berkas }
