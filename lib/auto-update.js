/* ══════════════════════════════════════════════════════════════════════════
 * By AlzRiss - Usanagi Umi AI
 *
 * Task142 — AUTO UPDATE DARI GITHUB (khusus di source code, tidak ada di UI web)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ CATATAN UNTUK AI / DEVELOPER LAIN — BACA SEBELUM MENYENTUH BERKAS INI
 * ──────────────────────────────────────────────────────────────────────────
 * 1. Alur fitur ini:
 *      .autoupdate cek  → baca commit terbaru repo, bandingkan sha256 tiap
 *                         berkas dengan yang ada di server (tidak menulis apa pun)
 *      .autoupdate now  → unduh berkas yang berubah → backup → `node --check`
 *                         → tulis → restart bot lewat panel
 *      .autoupdate on/off → menyalakan/mematikan pemeriksaan otomatis berkala
 *
 * 2. ATURAN KESELAMATAN YANG TIDAK BOLEH DIHAPUS (pernah jadi masalah nyata):
 *      • HANYA path di IZIN_PATH yang boleh ditimpa. `data/`, `sessions/`,
 *        `node_modules/`, `tmp/`, `database.json`, `.env*`, `.secrets/`
 *        WAJIB ditolak — di server itu berisi sesi hidup, database, dan kunci.
 *      • Setiap berkas .js WAJIB lolos `node --check` sebelum ditulis.
 *        Tanpa ini, satu kurung kurawal salah bikin bot mati total.
 *      • Berkas lama WAJIB dibackup ke data/auto-update-backup/<waktu>/.
 *      • Kalau berkas di server lebih baru daripada catatan sinkronisasi
 *        (pernah diedit manual), JANGAN ditimpa kecuali `.autoupdate paksa`.
 *      • Restart hanya dilakukan setelah semua berkas berhasil ditulis.
 *
 * 3. Cara restart (berlapis, berhenti di langkah pertama yang berhasil):
 *      a. `restart.cmd` di data/auto-update.json kalau diisi;
 *      b. API panel Pterodactyl/Pelican: POST /api/client/servers/<id>/power
 *         { "signal": "restart" } memakai restart.panelUrl + restart.apiKey;
 *      c. kalau dua-duanya tidak tersedia: tulis penanda restart lalu
 *         process.exit(0) — bot hidup lagi HANYA kalau panel menyetel
 *         auto-restart. Ini pilihan terakhir dan dicatat di log.
 *
 * 4. JANGAN menyimpan token GitHub / kunci panel di dalam repo. Semua kredensial
 *    ada di data/auto-update.json (mode 600) yang dibuat di server.
 *
 * 5. Berkas terkait: plugins/owner/auto-update.js (perintah WA),
 *    tests/task142-autoupdate.mjs (uji), docs/AUTO-UPDATE.md (penjelasan).
 * ══════════════════════════════════════════════════════════════════════════ */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawnSync, spawn } from 'child_process'

const BERKAS_KONFIG = path.join(process.cwd(), 'data', 'auto-update.json')
const BERKAS_STATE = path.join(process.cwd(), 'data', 'auto-update-state.json')
const BERKAS_LOG = path.join(process.cwd(), 'data', 'auto-update-log.jsonl')
const DIR_BACKUP = path.join(process.cwd(), 'data', 'auto-update-backup')

/** Path yang boleh ditimpa auto-update. Sengaja sempit. */
export const IZIN_PATH = [
  'lib/',
  'plugins/',
  'core/',
  'scripts/',
  'tests/',
  'docs/',
  'handler.js',
  'main.js',
  'config.js',
]

/** Path yang HARAM disentuh, apa pun isi konfigurasinya. */
export const TOLAK_PATH = [
  'data/',
  'sessions/',
  'node_modules/',
  'tmp/',
  'database.json',
  '.env',
  '.secrets/',
  '.git/',
]

const KONFIG_BAWAAN = {
  versi: 1,
  aktif: false,
  repo: 'ExisRiss/usanagi-umi-ai-single',
  branch: 'main',
  token: '',
  intervalMenit: 30,
  restart: { mode: 'panel', panelUrl: '', apiKey: '', serverId: '', cmd: '' },
  diperbarui: '',
}

/* ── konfigurasi & state ───────────────────────────────────────────────── */

export function bacaKonfig(kuatUlang = false) {
  if (bacaKonfig._cache && !kuatUlang) return bacaKonfig._cache
  let isi = {}
  try { isi = JSON.parse(fs.readFileSync(BERKAS_KONFIG, 'utf8')) } catch (error) { isi = {} }
  const konfig = {
    ...KONFIG_BAWAAN,
    ...isi,
    restart: { ...KONFIG_BAWAAN.restart, ...(isi.restart || {}) },
  }
  bacaKonfig._cache = konfig
  return konfig
}

export function simpanKonfig(patch = {}) {
  const lama = bacaKonfig(true)
  const baru = {
    ...lama,
    ...patch,
    restart: { ...lama.restart, ...(patch.restart || {}) },
    diperbarui: new Date().toISOString(),
  }
  fs.mkdirSync(path.dirname(BERKAS_KONFIG), { recursive: true })
  fs.writeFileSync(BERKAS_KONFIG, JSON.stringify(baru, null, 2), { mode: 0o600 })
  try { fs.chmodSync(BERKAS_KONFIG, 0o600) } catch (error) { /* Windows */ }
  bacaKonfig._cache = baru
  return baru
}

export function bacaState() {
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS_STATE, 'utf8'))
    return isi && typeof isi === 'object' ? { sha: '', berkas: {}, dasar: {}, ...isi } : { sha: '', berkas: {}, dasar: {} }
  } catch (error) {
    return { sha: '', berkas: {}, dasar: {} }
  }
}

function tulisState(state) {
  fs.mkdirSync(path.dirname(BERKAS_STATE), { recursive: true })
  fs.writeFileSync(BERKAS_STATE, JSON.stringify(state, null, 2))
}

export function catatLog(entri = {}) {
  try {
    fs.appendFileSync(BERKAS_LOG, JSON.stringify({ waktu: new Date().toISOString(), ...entri }) + '\n')
  } catch (error) { /* log tidak boleh menggagalkan proses */ }
}

export function bacaLog(batas = 10) {
  try {
    const baris = fs.readFileSync(BERKAS_LOG, 'utf8').trim().split('\n').filter(Boolean)
    return baris.slice(-batas).map((b) => { try { return JSON.parse(b) } catch (e) { return null } }).filter(Boolean)
  } catch (error) {
    return []
  }
}

/* ── aturan path ───────────────────────────────────────────────────────── */

export function pathDiizinkan(jalur) {
  const bersih = String(jalur || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!bersih || bersih.includes('..')) return false
  if (TOLAK_PATH.some((t) => bersih === t || bersih.startsWith(t))) return false
  return IZIN_PATH.some((i) => (i.endsWith('/') ? bersih.startsWith(i) : bersih === i))
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

/**
 * SHA-1 blob versi Git untuk sebuah isi berkas: sha1("blob <panjang>\0<isi>").
 * Dipakai supaya pembandingan bisa dilakukan LOKAL tanpa mengunduh 2500 berkas
 * setiap kali memeriksa. Kalau sha1 ini sama dengan `sha` di GitHub tree,
 * isinya identik — tanpa perlu jaringan.
 */
export function gitBlobSha(buf) {
  const isi = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf))
  return crypto.createHash('sha1').update('blob ' + isi.length + '\0').update(isi).digest('hex')
}

function bacaLokal(jalur) {
  try { return fs.readFileSync(path.join(process.cwd(), jalur)) } catch (error) { return null }
}

/* ── GitHub ────────────────────────────────────────────────────────────── */

async function github(jalur, { token = '', mentah = false } = {}) {
  const url = jalur.startsWith('http') ? jalur : 'https://api.github.com' + jalur
  const kontrol = new AbortController()
  const jam = setTimeout(() => kontrol.abort(), 25000)
  try {
    const res = await fetch(url, {
      headers: {
        Accept: mentah ? 'application/vnd.github.raw' : 'application/vnd.github+json',
        'User-Agent': 'Usanagi-Umi-AutoUpdate',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      signal: kontrol.signal,
    })
    if (!res.ok) {
      const teks = await res.text()
      throw new Error('GitHub ' + res.status + (teks ? ': ' + teks.slice(0, 140) : ''))
    }
    return mentah ? Buffer.from(await res.arrayBuffer()) : await res.json()
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('GitHub tidak menjawab (25 detik).')
    throw error
  } finally {
    clearTimeout(jam)
  }
}

/** Commit terbaru di branch. */
export async function commitTerbaru() {
  const cfg = bacaKonfig()
  const data = await github('/repos/' + cfg.repo + '/commits?sha=' + encodeURIComponent(cfg.branch || 'main') + '&per_page=1', { token: cfg.token })
  const commit = Array.isArray(data) ? data[0] : null
  if (!commit) throw new Error('Repo tidak mengembalikan commit.')
  return {
    sha: commit.sha,
    pesan: String((commit.commit && commit.commit.message) || '').split('\n')[0].slice(0, 160),
    waktu: (commit.commit && commit.commit.author && commit.commit.author.date) || '',
    penulis: (commit.commit && commit.commit.author && commit.commit.author.name) || '',
  }
}

/**
 * Bandingkan repo dengan berkas di server.
 * @returns {Promise<{commit: object, berubah: Array, sama: number, dilewati: number}>}
 */
export async function cekPembaruan() {
  const cfg = bacaKonfig()
  const state = bacaState()
  const commit = await commitTerbaru()
  const pohon = await github('/repos/' + cfg.repo + '/git/trees/' + commit.sha + '?recursive=1', { token: cfg.token })
  const daftar = (pohon && pohon.tree ? pohon.tree : []).filter((x) => x.type === 'blob' && pathDiizinkan(x.path))

  const berubah = []
  let sama = 0
  let baru = 0
  const segarkan = {}
  /* Baseline: pemindaian PERTAMA hanya mencatat isi berkas yang sudah ada.
   * Selama baseline belum selesai, tidak ada satu berkas pun yang ditimpa.
   * Ini melindungi berkas di server yang lebih baru daripada repo (mis. hasil
   * patch darurat) supaya tidak "downgrade" diam-diam. */
  const baselineBaru = !state.dasar || !Object.keys(state.dasar).length
  const dasar = { ...(state.dasar || {}) }

  for (const item of daftar) {
    const lokal = bacaLokal(item.path)
    if (!lokal) {
      berubah.push({ path: item.path, jenis: 'baru', blob: item.sha, ukuran: item.size || 0 })
      baru += 1
      continue
    }
    /* Identik kalau sha blob Git-nya sama. Ini pembandingan offline & eksak. */
    if (gitBlobSha(lokal) === item.sha) {
      sama += 1
      segarkan[item.path] = { blob: item.sha, sha256: sha256(lokal), waktu: new Date().toISOString() }
      continue
    }
    const sidik = sha256(lokal)
    if (baselineBaru) dasar[item.path] = sidik
    berubah.push({
      path: item.path,
      jenis: 'berubah',
      blob: item.sha,
      ukuran: item.size || 0,
      ukuranLokal: lokal.length,
      /* Berkas ini sudah berbeda dari repo sejak baseline → anggap server yang
       * benar. Hanya ditimpa kalau developer memakai `.autoupdate paksa`. */
      dieditLokal: baselineBaru || Boolean(dasar[item.path]),
    })
  }

  /* Cache pembandingan hanya berisi berkas yang MEMANG identik — tidak pernah
   * menandai berkas yang berbeda sebagai sudah sinkron. */
  if (Object.keys(segarkan).length || baselineBaru) {
    const baruState = {
      ...state,
      berkas: { ...state.berkas, ...segarkan },
      dasar,
      cekTerakhir: new Date().toISOString(),
    }
    if (!baruState.sha) baruState.sha = commit.sha
    try { tulisState(baruState) } catch (error) { /* cache gagal tulis bukan error fatal */ }
  }

  return { commit, berubah, sama, diperiksa: daftar.length, baru, baselineBaru }
}

/* ── penerapan ─────────────────────────────────────────────────────────── */

function cadangkan(jalur, isi) {
  try {
    const cap = new Date().toISOString().replace(/[:.]/g, '-')
    const tujuan = path.join(DIR_BACKUP, cap, jalur)
    fs.mkdirSync(path.dirname(tujuan), { recursive: true })
    fs.writeFileSync(tujuan, isi)
    return tujuan
  } catch (error) {
    return ''
  }
}

/** `node --check` untuk berkas JS; berkas lain dianggap lolos. */
export function periksaSintaks(nama, isi) {
  if (!/\.(js|mjs|cjs)$/i.test(nama)) return { ok: true }
  const tmp = path.join(process.cwd(), 'tmp', 'autoupdate-' + crypto.randomBytes(6).toString('hex') + '.js')
  try {
    fs.mkdirSync(path.dirname(tmp), { recursive: true })
    fs.writeFileSync(tmp, isi)
    const hasil = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8', timeout: 20000 })
    const pesan = (hasil.stderr || hasil.stdout || '').replace(/\s+/g, ' ').trim().slice(0, 400)
    return { ok: hasil.status === 0, pesan }
  } catch (error) {
    return { ok: false, pesan: error.message }
  } finally {
    try { fs.unlinkSync(tmp) } catch (error) { /* lewati */ }
  }
}

/**
 * Unduh & terapkan berkas yang berubah.
 * @param {{ paksa?: boolean, kering?: boolean }} opsi
 */
export async function terapkanPembaruan({ paksa = false, kering = false } = {}) {
  const cfg = bacaKonfig()
  const cek = await cekPembaruan()
  const hasil = { commit: cek.commit, ditulis: [], dilewati: [], gagal: [], backup: '', kering, baseline: Boolean(cek.baselineBaru) }

  /* Pemindaian pertama = baseline. Tidak boleh menulis apa pun: daftar ini
   * masih memuat semua berkas yang memang berbeda sejak awal. */
  if (cek.baselineBaru && !paksa) {
    catatLog({ kejadian: 'baseline', sha: cek.commit.sha, berubah: cek.berubah.length })
    hasil.dilewati.push('baseline baru dibuat — belum ada yang ditulis')
    return hasil
  }

  if (!cek.berubah.length) {
    catatLog({ kejadian: 'cek', sha: cek.commit.sha, hasil: 'tidak ada perubahan' })
    return hasil
  }

  for (const item of cek.berubah) {
    if (!pathDiizinkan(item.path)) { hasil.dilewati.push(item.path + ' (di luar izin)'); continue }
    if (item.dieditLokal && !paksa) {
      hasil.dilewati.push(item.path + ' (versi server lebih baru / diedit manual — pakai .autoupdate paksa)')
      continue
    }
    if (kering) { hasil.ditulis.push(item.path + ' (rencana)'); continue }

    let isi
    try {
      isi = await github('/repos/' + cfg.repo + '/contents/' + item.path.split('/').map(encodeURIComponent).join('/') + '?ref=' + cek.commit.sha, { token: cfg.token, mentah: true })
    } catch (error) {
      hasil.gagal.push(item.path + ': ' + error.message)
      continue
    }

    const sintaks = periksaSintaks(item.path, isi)
    if (!sintaks.ok) {
      hasil.gagal.push(item.path + ' (sintaks rusak, TIDAK ditulis): ' + sintaks.pesan)
      continue
    }

    const lama = bacaLokal(item.path)
    if (lama) {
      const jalurBackup = cadangkan(item.path, lama)
      if (jalurBackup) hasil.backup = path.dirname(jalurBackup)
    }
    try {
      const tujuan = path.join(process.cwd(), item.path)
      fs.mkdirSync(path.dirname(tujuan), { recursive: true })
      fs.writeFileSync(tujuan, isi)
      hasil.ditulis.push(item.path)
    } catch (error) {
      hasil.gagal.push(item.path + ' (gagal tulis): ' + error.message)
    }
  }

  if (!kering) {
    const state = bacaState()
    for (const item of cek.berubah) {
      if (!hasil.ditulis.includes(item.path)) continue
      const isi = bacaLokal(item.path)
      state.berkas[item.path] = { blob: item.blob, sha256: isi ? sha256(isi) : '', waktu: new Date().toISOString() }
    }
    state.sha = cek.commit.sha
    state.cekTerakhir = new Date().toISOString()
    state.pesan = cek.commit.pesan
    tulisState(state)
    catatLog({
      kejadian: 'terapkan', sha: cek.commit.sha, ditulis: hasil.ditulis,
      dilewati: hasil.dilewati, gagal: hasil.gagal,
    })
  }

  return hasil
}

/* ── restart ───────────────────────────────────────────────────────────── */

async function mintaPanelRestart(restart) {
  if (!restart || !restart.panelUrl || !restart.apiKey || !restart.serverId) {
    throw new Error('kredensial panel belum diisi')
  }
  const url = String(restart.panelUrl).replace(/\/+$/, '') + '/api/client/servers/' + encodeURIComponent(restart.serverId) + '/power'
  const kontrol = new AbortController()
  const jam = setTimeout(() => kontrol.abort(), 25000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + restart.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ signal: 'restart' }),
      signal: kontrol.signal,
    })
    if (!res.ok && res.status !== 204) throw new Error('panel HTTP ' + res.status)
    return { cara: 'panel', ok: true }
  } finally {
    clearTimeout(jam)
  }
}

/**
 * Restart bot. Berlapis: cmd → panel → exit.
 * @returns {Promise<{cara: string, ok: boolean, pesan?: string}>}
 */
export async function restartBot() {
  const cfg = bacaKonfig()
  const restart = cfg.restart || {}

  if (restart.cmd) {
    try {
      spawn(String(restart.cmd), { shell: true, detached: true, stdio: 'ignore' }).unref()
      catatLog({ kejadian: 'restart', cara: 'cmd' })
      return { cara: 'cmd', ok: true }
    } catch (error) {
      catatLog({ kejadian: 'restart', cara: 'cmd', galat: error.message })
    }
  }

  try {
    const hasil = await mintaPanelRestart(restart)
    catatLog({ kejadian: 'restart', cara: 'panel' })
    return hasil
  } catch (error) {
    catatLog({ kejadian: 'restart', cara: 'panel', galat: error.message })
  }

  /* Terakhir: keluar dan berharap panel menyalakan ulang. */
  catatLog({ kejadian: 'restart', cara: 'exit' })
  setTimeout(() => process.exit(0), 1500)
  return { cara: 'exit', ok: true, pesan: 'keluar proses; butuh auto-restart panel' }
}

/* ── pemeriksaan berkala ───────────────────────────────────────────────── */

let penjadwal = null

export function statusPenjadwal() {
  return {
    berjalan: Boolean(penjadwal),
    intervalMenit: bacaKonfig().intervalMenit,
    aktif: bacaKonfig().aktif,
  }
}

/**
 * Jalankan sekali siklus: cek → (kalau aktif) terapkan → restart.
 * @param {{ paksa?: boolean, hanyaCek?: boolean }} opsi
 */
export async function siklusAuto({ paksa = false, hanyaCek = false } = {}) {
  const cfg = bacaKonfig(true)
  const cek = await cekPembaruan()
  if (cek.baselineBaru) {
    catatLog({ kejadian: 'baseline', sha: cek.commit.sha, berubah: cek.berubah.length })
    return { cek, hasil: null, restart: null, baseline: true }
  }
  if (hanyaCek || !cek.berubah.length) {
    catatLog({ kejadian: 'siklus', sha: cek.commit.sha, berubah: cek.berubah.length, mode: hanyaCek ? 'cek' : 'tidak ada perubahan' })
    return { cek, hasil: null, restart: null }
  }
  const hasil = await terapkanPembaruan({ paksa })
  let restart = null
  if (hasil.ditulis.length && !hasil.kering) restart = await restartBot()
  return { cek, hasil, restart }
}

/** Nyalakan pemeriksaan berkala (aman dipanggil berkali-kali). */
export function mulaiPenjadwal() {
  const cfg = bacaKonfig(true)
  if (penjadwal) return { sudahJalan: true, status: statusPenjadwal() }
  if (!cfg.aktif) return { sudahJalan: false, status: statusPenjadwal(), pesan: 'auto update belum diaktifkan' }
  const jeda = Math.max(5, Number(cfg.intervalMenit) || 30) * 60 * 1000
  penjadwal = setInterval(() => {
    siklusAuto({}).catch((error) => catatLog({ kejadian: 'siklus', galat: error.message }))
  }, jeda)
  penjadwal.unref?.()
  catatLog({ kejadian: 'penjadwal', aktif: true, intervalMenit: jedaAman(cfg.intervalMenit) })
  return { sudahJalan: false, berjalan: true, intervalMenit: jedaAman(cfg.intervalMenit) }
}

function jedaAman(nilai) {
  return Math.max(5, Number(nilai) || 30)
}

export function hentikanPenjadwal() {
  if (penjadwal) {
    clearInterval(penjadwal)
    penjadwal = null
  }
  return true
}

export default {
  IZIN_PATH, TOLAK_PATH,
  bacaKonfig, simpanKonfig, bacaState, catatLog, bacaLog,
  pathDiizinkan, periksaSintaks,
  commitTerbaru, cekPembaruan, terapkanPembaruan,
  restartBot, siklusAuto, mulaiPenjadwal, hentikanPenjadwal, statusPenjadwal,
}
