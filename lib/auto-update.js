/* ══════════════════════════════════════════════════════════════════════════
 * By AlzRiss - Usanagi Umi AI
 *
 * Task142 — AUTO UPDATE DARI GITHUB (khusus di source code, tidak ada di UI web)
 * Task145 — PERBAIKAN: auto update berhenti memperbarui berkas tanpa alasan.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ CATATAN UNTUK AI / DEVELOPER LAIN — BACA SEBELUM MENYENTUH BERKAS INI
 * ──────────────────────────────────────────────────────────────────────────
 * 1. Alur fitur ini:
 *      .autoupdate cek  → baca commit terbaru repo, bandingkan sha blob Git
 *                         tiap berkas dengan isi di server (tidak menulis apa pun)
 *      .autoupdate now  → unduh berkas yang berubah → backup → `node --check`
 *                         → tulis/hapus → restart bot lewat panel
 *      .autoupdate on/off → menyalakan/mematikan pemeriksaan berkala
 *
 * 2. ATURAN KESELAMATAN YANG TIDAK BOLEH DIHAPUS (pernah jadi masalah nyata):
 *      • HANYA path di IZIN_PATH yang boleh ditimpa. `data/`, `sessions/`,
 *        `node_modules/`, `tmp/`, `database.json`, `.env*`, `.secrets/`
 *        WAJIB ditolak — di server itu berisi sesi hidup, database, dan kunci.
 *      • Setiap berkas .js WAJIB lolos `node --check` sebelum ditulis.
 *        Tanpa ini, satu kurung kurawal salah bikin bot mati total.
 *      • Berkas lama WAJIB dibackup ke data/auto-update-backup/<waktu>/.
 *      • Berkas yang DIEDIT MANUAL SETELAH commit terbaru tidak boleh ditimpa,
 *        kecuali `.autoupdate paksa`.
 *      • Restart hanya dilakukan setelah semua berkas berhasil ditulis.
 *
 * 3. KENAPA DULU "AUTO UPDATE TIDAK BERFUNGSI" (Task145) — jangan diulang:
 *      Versi lama membuat "baseline" pada pemindaian PERTAMA: setiap berkas
 *      yang isinya beda dari repo dicatat ke `state.dasar` dan selanjutnya
 *      dianggap "diedit manual" SELAMANYA. Akibatnya 6 berkas tidak pernah
 *      ikut ter-update lagi (lib/chat.json, lib/jadibot-platform-api.js,
 *      plugins/group/group-jadwalbukatutup.js, plugins/main/usanagi-allmenu.js,
 *      plugins/akun-platform.js, plugins/owner/developer-akun.js) — log server
 *      menunjukkan `ditulis: []` + `dilewati: 4` berulang tiap 10 menit.
 *      Sekarang `state.dasar` TIDAK DIPAKAI LAGI. Aturannya berbasis bukti:
 *        a. isi identik dengan blob Git repo           → tidak diapa-apakan;
 *        b. isi sama dengan yang terakhir ditulis bot  → aman ditimpa;
 *        c. mtime berkas LEBIH TUA dari commit repo    → ketinggalan, ditimpa;
 *        d. mtime berkas LEBIH BARU dari commit repo   → mungkin diedit manual,
 *           dilewati (kecuali `paksa`).
 *      Selain itu berkas yang DIHAPUS di repo sekarang ikut dihapus di server
 *      (dengan backup) — dulu tidak, jadi duplikat seperti plugins/music/play2.js
 *      tertinggal dan bentrok dengan plugin lain.
 *
 * 4. Cara restart (berlapis, berhenti di langkah pertama yang berhasil):
 *      a. `restart.cmd` di data/auto-update.json kalau diisi;
 *      b. API panel Pterodactyl/Pelican: POST /api/client/servers/<id>/power
 *         { "signal": "restart" } memakai restart.panelUrl + restart.apiKey;
 *      c. kalau dua-duanya tidak tersedia: tulis penanda restart lalu
 *         process.exit(0) — bot hidup lagi HANYA kalau panel menyetel
 *         auto-restart. Ini pilihan terakhir dan dicatat di log.
 *
 * 5. JANGAN menyimpan token GitHub / kunci panel di dalam repo. Semua kredensial
 *    ada di data/auto-update.json (mode 600) yang dibuat di server.
 *
 * 6. Berkas terkait: plugins/owner/auto-update.js (perintah WA),
 *    tests/task145-autoupdate.mjs (uji), docs/AUTO-UPDATE.md (penjelasan).
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
  versi: 2,
  aktif: false,
  repo: 'ExisRiss/usanagi-umi-ai-single',
  branch: 'main',
  token: '',
  intervalMenit: 30,
  /* Task147 — saklar `/autorestart`. true  = setelah pembaruan diterapkan bot
   * restart sendiri (perilaku lama). false = berkas tetap diperbarui, tetapi
   * restart ditunda sampai owner mengetik `/restart` atau `.autoupdate restart`.
   * Alasannya: restart di tengah jam ramai membuat bot hilang ±15 detik. */
  restartOtomatis: true,
  restart: { mode: 'panel', panelUrl: '', apiKey: '', serverId: '', cmd: '' },
  diperbarui: '',
}

/*
 * Task147 — BERKAS DATA YANG BERUBAH SAAT BOT HIDUP.
 *
 * `lib/chat.json` berada di folder `lib/` sehingga lolos IZIN_PATH, padahal
 * isinya statistik chat yang ditulis bot setiap ada pesan (dipakai `.totalchat`).
 * Siklus auto update 28-10-2026 pukul 14:35 menimpanya dengan salinan repo
 * (10.254 B → 1.230 B) karena mtime berkas lebih tua dari commit baru.
 * Data seperti ini TIDAK PERNAH boleh ditimpa otomatis — hanya `.autoupdate
 * paksa` yang boleh, dan itu pun setelah owner tahu akibatnya.
 */
export const BERKAS_RUNTIME = ['lib/chat.json']

/** Toleransi selisih jam server vs waktu commit GitHub. */
const TOLERANSI_MS = 60 * 1000
const LOG_MAKS_BARIS = 600

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

/**
 * State kecil yang disimpan:
 *   sha       commit terakhir yang sudah diterapkan/diperiksa
 *   berkas    { path: sha256 } hanya untuk berkas yang SEDANG beda dari repo
 *   pohon     daftar path di commit terakhir (untuk mendeteksi berkas yang dihapus)
 *   dasar     warisan Task142 — tidak dipakai lagi, hanya dibersihkan
 */
export function bacaState() {
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS_STATE, 'utf8'))
    if (!isi || typeof isi !== 'object') throw new Error('state kosong')
    /* Migrasi state lama (Task142): cache `berkas` versi lama berisi ribuan
     * berkas yang cuma "identik", bukan tulisan bot. Jangan dipercaya — mulai
     * dari kosong supaya aturan waktu (mtime vs commit) yang menentukan. */
    const versiBaru = Number(isi.versi) === 2
    return {
      versi: 2,
      sha: isi.sha || '',
      berkas: versiBaru && isi.berkas && typeof isi.berkas === 'object' ? isi.berkas : {},
      pohon: Array.isArray(isi.pohon) ? isi.pohon : [],
      /* Task147 — berkas yang DIPUTUSKAN tidak ditimpa (diedit manual).
       * Disimpan supaya siklus berikutnya tidak menghitungnya sebagai
       * "perubahan" lagi dan supaya status bisa menjelaskannya. */
      dilewati: versiBaru && isi.dilewati && typeof isi.dilewati === 'object' ? isi.dilewati : {},
      perluRestart: isi.perluRestart === true,
      gagalTerakhir: Array.isArray(isi.gagalTerakhir) ? isi.gagalTerakhir : [],
      cekTerakhir: isi.cekTerakhir || '',
      pesan: isi.pesan || '',
    }
  } catch (error) {
    return { sha: '', berkas: {}, pohon: [], dilewati: {}, perluRestart: false, gagalTerakhir: [], cekTerakhir: '', pesan: '' }
  }
}

function tulisState(state) {
  fs.mkdirSync(path.dirname(BERKAS_STATE), { recursive: true })
  fs.writeFileSync(BERKAS_STATE, JSON.stringify({ ...state, versi: 2 }, null, 2))
}

export function catatLog(entri = {}) {
  try {
    fs.mkdirSync(path.dirname(BERKAS_LOG), { recursive: true })
    fs.appendFileSync(BERKAS_LOG, JSON.stringify({ waktu: new Date().toISOString(), ...entri }) + '\n')
    putarLog()
  } catch (error) { /* log tidak boleh menggagalkan proses */ }
}

/** Jaga log tetap kecil: sisakan LOG_MAKS_BARIS terakhir saat melewati 2×. */
function putarLog() {
  try {
    const ukuran = fs.statSync(BERKAS_LOG).size
    if (ukuran < 300 * 1024) return
    const baris = fs.readFileSync(BERKAS_LOG, 'utf8').split('\n').filter(Boolean)
    if (baris.length <= LOG_MAKS_BARIS) return
    fs.writeFileSync(BERKAS_LOG, baris.slice(-LOG_MAKS_BARIS).join('\n') + '\n')
  } catch (error) { /* lewati */ }
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

function mtimeLokal(jalur) {
  try { return fs.statSync(path.join(process.cwd(), jalur)).mtimeMs } catch (error) { return 0 }
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
 * Tentukan nasib satu berkas repo terhadap isi server.
 * @returns {{jenis:'baru'|'sama'|'berubah', aman:boolean, alasan?:string, ukuranLokal?:number}}
 */
export function nilaiBerkas(item, state, waktuCommitMs, opsi = {}) {
  const baca = typeof opsi.bacaLokal === 'function' ? opsi.bacaLokal : bacaLokal
  const mtime = typeof opsi.mtimeLokal === 'function' ? opsi.mtimeLokal : mtimeLokal
  const lokal = baca(item.path)
  if (!lokal) return { jenis: 'baru', aman: true, alasan: 'belum ada di server' }
  if (gitBlobSha(lokal) === item.sha) return { jenis: 'sama', aman: true }
  if (BERKAS_RUNTIME.includes(item.path)) {
    return { jenis: 'dilewati', aman: false, alasan: 'data runtime (ditulis bot saat hidup) — tidak ditimpa otomatis' }
  }
  const sidik = sha256(lokal)
  /*
   * Task147 — keputusan "berkas ini sengaja tidak ditimpa" diingat.
   * Tanpa ini berkas seperti lib/chat.json dievaluasi ulang setiap 10 menit,
   * muncul sebagai `dilewati` di log, dan membuat `state.sha` tidak pernah
   * maju (auto update terlihat "tidak berfungsi"). Catatan hanya berlaku
   * selama isi berkas di repo DAN isi di server sama-sama tidak berubah;
   * begitu owner mengedit berkasnya lagi, berkas itu dinilai ulang.
   */
  const catatanLewat = state.dilewati && state.dilewati[item.path]
  if (catatanLewat && catatanLewat.blob === item.sha && catatanLewat.sha256 === sidik) {
    return { jenis: 'dilewati', aman: false, alasan: catatanLewat.alasan || 'diedit manual — pakai .autoupdate paksa' }
  }
  if (state.berkas[item.path] && state.berkas[item.path].sha256 === sidik) {
    /* Persis seperti yang terakhir ditulis bot sendiri → aman diganti. */
    return { jenis: 'berubah', aman: true, alasan: 'salinan lama dari repo', ukuranLokal: lokal.length }
  }
  const waktuBerkas = mtime(item.path)
  if (waktuCommitMs && waktuBerkas > waktuCommitMs + TOLERANSI_MS) {
    return {
      jenis: 'berubah',
      aman: false,
      alasan: 'server lebih baru dari commit (diedit manual) — pakai .autoupdate paksa',
      ukuranLokal: lokal.length,
    }
  }
  return { jenis: 'berubah', aman: true, alasan: 'versi server ketinggalan', ukuranLokal: lokal.length }
}

/**
 * Bandingkan repo dengan berkas di server. Tidak menulis berkas kode apa pun;
 * hanya memperbarui cache state.
 * @returns {Promise<{commit: object, berubah: Array, dihapus: Array, sama: number, diperiksa: number, baru: number}>}
 */
export async function cekPembaruan() {
  const cfg = bacaKonfig()
  const state = bacaState()
  const commit = await commitTerbaru()
  const pohon = await github('/repos/' + cfg.repo + '/git/trees/' + commit.sha + '?recursive=1', { token: cfg.token })
  const daftar = (pohon && pohon.tree ? pohon.tree : []).filter((x) => x.type === 'blob' && pathDiizinkan(x.path))
  const adaDiRepo = new Set(daftar.map((x) => x.path))
  const waktuCommitMs = Date.parse(commit.waktu) || 0

  const berubah = []
  /* Catatan "berkas ini tulisan bot" hanya boleh berisi berkas yang MEMANG
   * sudah ditulis bot. Berkas yang sekarang beda dari repo justru harus
   * dicabut catatannya, kalau tidak isi buatan tangan akan dianggap aman
   * ditimpa. (Bug Task145: dulu hash isi server dicatat di sini.) */
  const catatanBerkas = { ...state.berkas }
  let sama = 0
  let baru = 0
  const tetapDilewati = []

  for (const item of daftar) {
    const nilai = nilaiBerkas(item, state, waktuCommitMs)
    if (nilai.jenis === 'sama') {
      sama += 1
      continue
    }
    if (nilai.jenis === 'dilewati') {
      tetapDilewati.push({ path: item.path, alasan: nilai.alasan })
      continue
    }
    if (nilai.jenis === 'baru') baru += 1
    delete catatanBerkas[item.path]
    berubah.push({ path: item.path, ...nilai, blob: item.sha, ukuran: item.size || 0 })
  }

  /* Berkas yang PERNAH ada di repo (state.pohon — daftar yang hanya bertambah)
   * tapi sekarang sudah dihapus. Hanya diusulkan kalau masih ada di server DAN
   * tidak diedit setelah commit.
   *
   * Daftar ini sengaja TIDAK diganti dengan pohon commit terbaru di sini:
   * `siklusAuto()` memanggil cek dulu lalu terapkan (yang mengecek ulang),
   * jadi kalau pohon ditimpa saat cek, informasi "berkas ini sudah dihapus di
   * repo" hilang sebelum sempat diterapkan. */
  const dihapus = []
  for (const jalur of state.pohon) {
    if (adaDiRepo.has(jalur)) continue
    if (!pathDiizinkan(jalur)) continue
    const lokal = bacaLokal(jalur)
    if (!lokal) continue
    const sidik = sha256(lokal)
    const catatan = state.berkas[jalur]
    const ditulisBot = Boolean(catatan && catatan.sha256 === sidik)
    const mtime = mtimeLokal(jalur)
    const dieditSetelah = Boolean(waktuCommitMs) && mtime > waktuCommitMs + TOLERANSI_MS
    if (!ditulisBot && dieditSetelah) continue
    dihapus.push({ path: jalur, ukuran: lokal.length, alasan: ditulisBot ? 'dihapus di repo' : 'dihapus di repo (isi masih sama dengan versi lama)' })
  }

  /* Simpan gabungan path yang dikenal + path commit ini. */
  const dikenal = Array.from(new Set([...state.pohon, ...daftar.map((x) => x.path)])).sort()

  /* Buang catatan "dilewati" yang sudah tidak relevan (mis. berkasnya kini
   * identik dengan repo karena sudah di-push). Kalau tidak dibersihkan,
   * status `.autoupdate` terus menghitung berkas yang sebenarnya sudah beres. */
  const dilewatiBaru = {}
  for (const item of tetapDilewati) {
    if (state.dilewati[item.path]) dilewatiBaru[item.path] = state.dilewati[item.path]
  }

  const baruState = {
    ...state,
    berkas: catatanBerkas,
    pohon: dikenal,
    dilewati: dilewatiBaru,
    cekTerakhir: new Date().toISOString(),
    pesan: commit.pesan,
  }
  if (!berubah.length && !dihapus.length) baruState.sha = commit.sha
  try { tulisState(baruState) } catch (error) { /* cache gagal tulis bukan error fatal */ }

  return { commit, berubah, dihapus, sama, diperiksa: daftar.length, baru, dilewati: tetapDilewati }
}

/* ── penerapan ─────────────────────────────────────────────────────────── */

/**
 * Terapkan hasil satu kali penerapan ke `data/auto-update-state.json`.
 *
 * Dipisah dari `terapkanPembaruan()` supaya aturannya bisa diuji tanpa
 * jaringan GitHub (lihat tests/task147-respons-dan-restart.mjs).
 */
export function simpanHasilTerap(cek, hasil) {
  const state = bacaState()
  for (const item of hasil.ditulis) {
    const isi = bacaLokal(item)
    if (isi) state.berkas[item] = { sha256: sha256(isi) }
    else delete state.berkas[item]
  }
  for (const item of hasil.dihapus) delete state.berkas[item]

  /*
   * Task147 — KENAPA state.sha HARUS SELALU MAJU.
   *
   * Task145 menulis: `if (!dilewati.length && !gagal.length) state.sha = …`.
   * Karena lib/chat.json selalu dilewati (diedit manual), state.sha membeku di
   * commit lama (70c04cf1c9) padahal repo sudah jauh di depan. Akibatnya tiap
   * siklus mengunduh ulang seluruh daftar berkas, status `.autoupdate` terus
   * menampilkan commit lama, dan fitur ini dilaporkan "tidak berfungsi" —
   * padahal berkasnya sudah ter-update.
   *
   * Keputusan `dilewati` sekarang DISIMPAN di state (lihat nilaiBerkas), jadi
   * tidak perlu menahan commit. Yang tetap menahan hanya kegagalan nyata
   * (gagal tulis / sintaks rusak) supaya dicoba lagi pada siklus berikutnya.
   */
  state.dilewati = { ...(state.dilewati || {}) }
  for (const catatan of hasil.dilewati || []) {
    const jalur = String(catatan).split(' (')[0]
    const entri = (cek.berubah || []).find((x) => x.path === jalur)
    const lokal = bacaLokal(jalur)
    if (!lokal) continue
    state.dilewati[jalur] = {
      blob: entri ? entri.blob : '',
      sha256: sha256(lokal),
      alasan: catatan,
    }
  }
  for (const jalur of (hasil.ditulis || []).concat(hasil.dihapus || [])) delete state.dilewati[jalur]
  for (const jalur of Object.keys(state.dilewati)) {
    if (!bacaLokal(jalur)) delete state.dilewati[jalur]
  }

  state.gagalTerakhir = (hasil.gagal || []).slice(0, 20)
  /* Commit baru dianggap selesai HANYA kalau tidak ada kegagalan nyata. */
  if (!(hasil.gagal || []).length && cek && cek.commit && cek.commit.sha) state.sha = cek.commit.sha
  if ((hasil.ditulis || []).length || (hasil.dihapus || []).length) state.perluRestart = true
  state.cekTerakhir = new Date().toISOString()
  if (cek && cek.commit) state.pesan = cek.commit.pesan || state.pesan
  tulisState(state)
  return state
}



function cadangkan(jalur, isi) {
  try {
    const cap = new Date().toISOString().replace(/[:.]/g, '-')
    const akar = path.join(DIR_BACKUP, cap)
    const tujuan = path.join(akar, jalur)
    fs.mkdirSync(path.dirname(tujuan), { recursive: true })
    fs.writeFileSync(tujuan, isi)
    return akar
  } catch (error) {
    return ''
  }
}

/**
 * `node --check` untuk berkas JS; berkas lain dianggap lolos.
 *
 * PENTING: berkas sementara ditulis dengan ekstensi `.mjs`, bukan `.js`.
 * Node memeriksa `.js` sebagai CommonJS; isi ESM yang rusak gagal di-parse
 * CJS, lalu Node menganggapnya "bukan CJS" dan keluar dengan status 0 —
 * artinya `.js` ESM yang sintaksnya rusak LOLOS pemeriksaan. Contoh nyata:
 * isi `export const = ;` lolos sebagai .js, tetapi ditolak sebagai .mjs.
 */
export function periksaSintaks(nama, isi) {
  if (!/\.(js|mjs|cjs)$/i.test(nama)) return { ok: true }
  const tmp = path.join(process.cwd(), 'tmp', 'autoupdate-' + crypto.randomBytes(6).toString('hex') + '.mjs')
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

let sedangMenerapkan = false

/**
 * Unduh & terapkan berkas yang berubah, hapus berkas yang hilang dari repo.
 * @param {{ paksa?: boolean, kering?: boolean }} opsi
 */
export async function terapkanPembaruan({ paksa = false, kering = false } = {}) {
  if (sedangMenerapkan && !kering) {
    return { ditolak: 'penerapan lain sedang berjalan', commit: { sha: '', pesan: '' }, ditulis: [], dihapus: [], dilewati: [], gagal: [], backup: '', kering }
  }
  sedangMenerapkan = true
  try {
    const cfg = bacaKonfig()
    const cek = await cekPembaruan()
    const hasil = {
      commit: cek.commit,
      ditulis: [],
      dihapus: [],
      dilewati: [],
      gagal: [],
      backup: '',
      kering,
      tetap: false,
    }

    if (!cek.berubah.length && !cek.dihapus.length) {
      catatLog({ kejadian: 'cek', sha: cek.commit.sha, hasil: 'tidak ada perubahan' })
      return hasil
    }

    for (const item of cek.berubah) {
      if (!pathDiizinkan(item.path)) { hasil.dilewati.push(item.path + ' (di luar izin)'); continue }
      /* Sabuk kedua: sekalipun `nilaiBerkas` berubah di masa depan, data
       * runtime tetap tidak boleh ditimpa tanpa `paksa`. */
      if (BERKAS_RUNTIME.includes(item.path) && !paksa) {
        hasil.dilewati.push(item.path + ' (data runtime — pakai .autoupdate paksa)')
        continue
      }
      if (!item.aman && !paksa) { hasil.dilewati.push(item.path + ' (' + (item.alasan || 'diedit manual') + ')'); continue }
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
        const akarBackup = cadangkan(item.path, lama)
        if (akarBackup && !hasil.backup) hasil.backup = akarBackup
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

    for (const item of cek.dihapus) {
      if (!pathDiizinkan(item.path)) { hasil.dilewati.push(item.path + ' (di luar izin)'); continue }
      if (kering) { hasil.dihapus.push(item.path + ' (rencana)'); continue }
      const lama = bacaLokal(item.path)
      if (!lama) continue
      const akarBackup = cadangkan(item.path, lama)
      if (akarBackup && !hasil.backup) hasil.backup = akarBackup
      try {
        fs.unlinkSync(path.join(process.cwd(), item.path))
        hasil.dihapus.push(item.path)
      } catch (error) {
        hasil.gagal.push(item.path + ' (gagal hapus): ' + error.message)
      }
    }

    if (!kering) {
      simpanHasilTerap(cek, hasil)
      catatLog({
        kejadian: 'terapkan',
        sha: cek.commit.sha,
        ditulis: hasil.ditulis,
        dihapus: hasil.dihapus,
        dilewati: hasil.dilewati,
        gagal: hasil.gagal,
      })
    }

    return hasil
  } finally {
    sedangMenerapkan = false
  }
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
  /* Task147: penanda "menunggu restart" dibersihkan begitu restart benar-benar
   * diminta, supaya status tidak terus berbunyi setelah bot menyala ulang. */
  try {
    const state = bacaState()
    if (state.perluRestart) {
      state.perluRestart = false
      tulisState(state)
    }
  } catch (error) { /* state rusak bukan alasan menahan restart */ }

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
let siklusBerjalan = false
let cekAwalDijadwalkan = false

export function statusPenjadwal() {
  const cfg = bacaKonfig()
  return {
    berjalan: Boolean(penjadwal),
    intervalMenit: cfg.intervalMenit,
    aktif: cfg.aktif,
    sibuk: siklusBerjalan,
  }
}

/**
 * Apakah pembaruan boleh me-restart bot sendiri? (`/autorestart on|off`)
 * Bawaan: ya, sama seperti perilaku Task145.
 */
export function putuskanRestart(cfg = bacaKonfig()) {
  return cfg.restartOtomatis !== false
}

/**
 * Jalankan sekali siklus: cek → (kalau ada perubahan) terapkan → restart.
 * @param {{ paksa?: boolean, hanyaCek?: boolean, deps?: object }} opsi
 *   `deps` hanya untuk pengujian: { cekPembaruan, terapkanPembaruan, restartBot }.
 */
export async function siklusAuto({ paksa = false, hanyaCek = false, deps = {} } = {}) {
  if (siklusBerjalan) return { sibuk: true, cek: null, hasil: null, restart: null }
  siklusBerjalan = true
  try {
    const cekPembaruanFn = deps.cekPembaruan || cekPembaruan
    const terapkanFn = deps.terapkanPembaruan || terapkanPembaruan
    const restartFn = deps.restartBot || restartBot
    const cek = await cekPembaruanFn()
    if (hanyaCek) {
      catatLog({ kejadian: 'siklus', sha: cek.commit.sha, berubah: cek.berubah.length, dihapus: cek.dihapus.length, mode: 'cek' })
      return { cek, hasil: null, restart: null }
    }
    if (!cek.berubah.length && !cek.dihapus.length) {
      catatLog({ kejadian: 'siklus', sha: cek.commit.sha, berubah: 0, mode: 'tidak ada perubahan' })
      return { cek, hasil: null, restart: null }
    }
    const hasil = await terapkanFn({ paksa })
    /* Pembaruan yang seluruhnya dilewati tidak boleh memicu restart. */
    const adaPerubahan = Boolean((hasil.ditulis.length || hasil.dihapus.length) && !hasil.kering)
    if (!adaPerubahan) return { cek, hasil, restart: null, ditunda: false }

    if (!putuskanRestart()) {
      catatLog({ kejadian: 'restart', cara: 'dimatikan', sha: cek.commit.sha })
      return { cek, hasil, restart: null, ditunda: true }
    }
    return { cek, hasil, restart: await restartFn(), ditunda: false }
  } finally {
    siklusBerjalan = false
  }
}

/** Nyalakan pemeriksaan berkala (aman dipanggil berkali-kali). */
export function mulaiPenjadwal() {
  const cfg = bacaKonfig(true)
  if (penjadwal) return { sudahJalan: true, status: statusPenjadwal() }
  if (!cfg.aktif) return { sudahJalan: false, status: statusPenjadwal(), pesan: 'auto update belum diaktifkan' }
  const jeda = Math.max(5, Number(cfg.intervalMenit) || 30) * 60 * 1000

  /* Dulu siklus pertama baru jalan setelah satu interval penuh (10-30 menit).
   * Sekarang diperiksa sekali 45 detik setelah bot hidup, lalu tiap interval. */
  if (!cekAwalDijadwalkan) {
    cekAwalDijadwalkan = true
    const awal = setTimeout(() => {
      siklusAuto({}).catch((error) => catatLog({ kejadian: 'siklus', galat: error.message }))
    }, 45 * 1000)
    awal.unref?.()
  }

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
  IZIN_PATH, TOLAK_PATH, BERKAS_RUNTIME,
  bacaKonfig, simpanKonfig, bacaState, catatLog, bacaLog,
  pathDiizinkan, periksaSintaks, gitBlobSha, nilaiBerkas, simpanHasilTerap,
  commitTerbaru, cekPembaruan, terapkanPembaruan,
  restartBot, siklusAuto, putuskanRestart,
  mulaiPenjadwal, hentikanPenjadwal, statusPenjadwal,
}
