#!/usr/bin/env node
/**
 * BOOTSTRAP SERVER BARU — Usanagi Umi AI (single bot)
 *
 * Kenapa berkas ini ada:
 *   Panel "SimpleBot" ini hanya punya variabel GIT_ADDRESS/BRANCH untuk clone,
 *   tetapi perintah start-nya cuma `/usr/local/bin/${CMD_RUN}` — tidak ada
 *   langkah clone. Jadi server baru akan kosong selamanya kalau tidak disiapkan.
 *
 * Skrip ini bekerja otomatis dan aman dijalankan berulang:
 *   1. kalau `main.js` belum ada  → ambil source dari GitHub (git fetch/checkout)
 *   2. kalau `node_modules` belum ada → `npm install`
 *   3. jalankan bot lewat `scripts/boot.js` (sudah menangani masalah native
 *      module + folder temp di panel)
 *
 * Semua keluaran juga ditulis ke `boot.log` supaya bisa diperiksa dari file
 * manager panel tanpa akses console.
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const REPO = 'https://github.com/ExisRiss/usanagi-umi-ai-single.git'
const BRANCH = process.env.UMI_BRANCH || 'main'
const LOG = path.join(process.cwd(), 'boot.log')

function log(...args) {
  const baris = `[bootstrap ${new Date().toISOString()}] ${args.join(' ')}`
  console.log(baris)
  try {
    fs.appendFileSync(LOG, baris + '\n')
  } catch {
    /* ruang disk penuh: jangan sampai bootstrap ikut mati */
  }
}

function jalankan(cmd, args, opsi = {}) {
  log('$', cmd, ...args)
  const hasil = spawnSync(cmd, args, { stdio: 'inherit', ...opsi })
  if (hasil.error) {
    log(`${cmd} gagal dijalankan:`, hasil.error.code || hasil.error.message)
    return -1
  }
  log(`${cmd} selesai (kode ${hasil.status})`)
  return hasil.status
}

/* 1. Source ---------------------------------------------------------------- */
if (!fs.existsSync('main.js')) {
  log('source belum ada — menyiapkan git')
  if (!fs.existsSync('.git')) {
    jalankan('git', ['init', '-q'])
    jalankan('git', ['remote', 'add', 'origin', REPO])
  }
  const statusFetch = jalankan('git', ['fetch', '--depth', '1', 'origin', BRANCH])
  if (statusFetch === 0) jalankan('git', ['checkout', '-q', '-f', 'FETCH_HEAD'])
}

if (!fs.existsSync('main.js')) {
  log('BERHENTI: main.js tidak ditemukan. Cek koneksi GitHub / ruang disk.')
  process.exit(1)
}

/* 2. Dependensi ------------------------------------------------------------ */
if (!fs.existsSync('node_modules')) {
  log('memasang dependensi (beberapa menit pada boot pertama)…')
  jalankan('npm', ['install', '--no-audit', '--no-fund'], {
    env: { ...process.env, NODE_ENV: 'production' },
  })
} else {
  log('node_modules sudah ada — lewati npm install')
}

/* 2b. Mode --sync: samakan source dengan repo GitHub tanpa menyentuh data ---
 * Dipakai sekali saat memperbarui bot (mis. memasang perbaikan .ytplay).
 * Yang DICADANGKAN dulu: config.js, config/users.json, .main-bot.env, plugins/.
 * Berkas data (database.json, sessions/, .env*, data/) tidak pernah disentuh
 * karena tidak dilacak git. */
if (process.argv.includes('--sync')) {
  log('mode SINKRON: mencadangkan berkas milik pemilik server dulu')
  fs.mkdirSync('_user-backup', { recursive: true })
  const penting = ['config/users.json', 'config.js', '.main-bot.env']
  const cadangan = []
  for (const berkas of penting) {
    if (!fs.existsSync(berkas)) continue
    const tujuan = path.join('_user-backup', berkas.replace(/[\\/]/g, '__'))
    fs.copyFileSync(berkas, tujuan)
    cadangan.push([berkas, tujuan])
    log('cadangan:', berkas, '→', tujuan)
  }
  if (fs.existsSync('plugins')) {
    jalankan('tar', ['-czf', '_user-backup/plugins-sebelum-sync.tar.gz', 'plugins'])
  }

  if (!fs.existsSync('.git')) {
    jalankan('git', ['init', '-q'])
    jalankan('git', ['remote', 'add', 'origin', REPO])
  }
  const ambil = jalankan('git', ['fetch', '--depth', '1', 'origin', BRANCH])
  if (ambil === 0) {
    jalankan('git', ['symbolic-ref', 'HEAD', `refs/heads/${BRANCH}`])
    const reset = jalankan('git', ['reset', '--hard', 'FETCH_HEAD'])
    log('sinkron source:', reset === 0 ? 'berhasil' : 'GAGAL')
  } else {
    log('GAGAL mengambil source terbaru — bot tetap dijalankan dengan versi lama')
  }

  for (const [berkas, tujuan] of cadangan) {
    try {
      fs.copyFileSync(tujuan, berkas)
      log('dipulihkan:', berkas)
    } catch (error) {
      log('gagal memulihkan', berkas, String(error.message))
    }
  }
  log('mencadangkan node_modules lama agar dependensi baru ikut terpasang')
  jalankan('npm', ['install', '--no-audit', '--no-fund'], {
    env: { ...process.env, NODE_ENV: 'production' },
  })
}


log('menjalankan bot (scripts/boot.js)…')
/* stdout/stderr bot ditampilkan di console panel DAN disalin ke boot.log,
 * supaya pemilik server bisa membaca jejak boot tanpa membuka console. */
function salin(ke, data) {
  try {
    ke.write(data)
  } catch {
    /* console kadang tertutup; jangan sampai bot ikut berhenti */
  }
  try {
    fs.appendFileSync(LOG, data.toString())
  } catch {
    /* disk penuh */
  }
}
const anak = spawn('node', ['scripts/boot.js'], { stdio: ['inherit', 'pipe', 'pipe'] })
anak.stdout.on('data', (data) => salin(process.stdout, data))
anak.stderr.on('data', (data) => salin(process.stderr, data))

anak.on('exit', (kode, sinyal) => {
  log(`bot berhenti (kode=${kode} sinyal=${sinyal})`)
  // Panel akan menyalakan ulang server; jangan biarkan proses menggantung.
  process.exit(kode === null ? 1 : kode)
})

for (const sinyal of ['SIGTERM', 'SIGINT']) {
  process.on(sinyal, () => {
    log(`menerima ${sinyal}, menghentikan bot…`)
    anak.kill(sinyal)
  })
}
