/**
 * Tes Task126b — penjaga disk (_diskwatch126.js).
 *
 * Yang diuji nyata (bukan klaim):
 *   1. ruangDisk() membaca filesystem dan memberi angka masuk akal;
 *   2. bersihkanDisk() menghapus sampah lama & memangkas log error ke batas;
 *   3. bersihkanDisk() TIDAK menyentuh sesi hidup / database / berkas baru;
 *   4. perintah `.disk` dan `.disk bersih` menjawab dengan teks yang benar.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const modul = await import('../plugins/_system/_diskwatch126.js')

function siapkanAkar() {
  const akar = fs.mkdtempSync(path.join(os.tmpdir(), 'umi-disk-'))
  fs.mkdirSync(path.join(akar, 'tmp'), { recursive: true })
  fs.mkdirSync(path.join(akar, 'data', 'errors'), { recursive: true })
  fs.mkdirSync(path.join(akar, 'data', 'jadibot-backups'), { recursive: true })
  fs.mkdirSync(path.join(akar, 'sessions', 'jadibot', '628123'), { recursive: true })
  fs.mkdirSync(path.join(akar, 'data', 'database'), { recursive: true })
  return akar
}

function buat(jalur, byte, umurMs = 0) {
  fs.writeFileSync(jalur, Buffer.alloc(byte, 120))
  if (umurMs) {
    const waktu = new Date(Date.now() - umurMs)
    fs.utimesSync(jalur, waktu, waktu)
  }
}

const JAM = 3600 * 1000

test('ruangDisk memberi angka nyata dari filesystem', () => {
  const r = modul.ruangDisk()
  assert.ok(r.totalMb > 0, 'totalMb harus > 0')
  assert.ok(r.bebasMb >= 0)
  assert.ok(r.persen >= 0 && r.persen <= 100, 'persen 0..100')
  assert.ok(['aman', 'waspada', 'kritis'].includes(r.status))
  // terpakai + bebas harus mendekati total (toleransi pembulatan)
  assert.ok(Math.abs(r.terpakaiMb + r.bebasMb - r.totalMb) <= 5)
})

test('bersihkanDisk menghapus sampah lama dan menyisakan yang baru', async () => {
  const akar = siapkanAkar()
  const lama = path.join(akar, 'tmp', 'media-lama.bin')
  const baru = path.join(akar, 'tmp', 'media-baru.bin')
  const logLama = path.join(akar, 'data', 'errors', '2026-10-20.jsonl')
  const logBaru = path.join(akar, 'data', 'errors', '2026-10-27.jsonl')
  const backupLama = path.join(akar, 'data', 'jadibot-backups', 'old.json')
  const tmpDb = path.join(akar, '.database.json.99.tmp')
  buat(lama, 4096, 3 * JAM)
  buat(baru, 4096)
  buat(logLama, 1024, 5 * 24 * JAM)
  buat(logBaru, 1024)
  buat(backupLama, 2048, 4 * 24 * JAM)
  buat(tmpDb, 2048, 1 * JAM)

  const asli = process.cwd()
  process.chdir(akar)
  try {
    const h = await modul.bersihkanDisk({})
    assert.ok(h.dihapus >= 4, `harus menghapus >= 4 entri, dapat ${h.dihapus}`)
    assert.equal(fs.existsSync(lama), false, 'media lama harus terhapus')
    assert.equal(fs.existsSync(baru), true, 'media baru harus utuh')
    assert.equal(fs.existsSync(logLama), false, 'log > 3 hari harus terhapus')
    assert.equal(fs.existsSync(logBaru), true, 'log hari ini harus utuh')
    assert.equal(fs.existsSync(backupLama), false, 'backup > 48 jam harus terhapus')
    assert.equal(fs.existsSync(tmpDb), false, 'sisa .tmp harus terhapus')
  } finally {
    process.chdir(asli)
    fs.rmSync(akar, { recursive: true, force: true })
  }
})

test('bersihkanDisk tidak pernah menyentuh sesi hidup & database', async () => {
  const akar = siapkanAkar()
  const sesi = path.join(akar, 'sessions', 'jadibot', '628123', 'creds.json')
  const db = path.join(akar, 'database.json')
  const sqlite = path.join(akar, 'data', 'database', 'usanagi.sqlite')
  const env = path.join(akar, '.env.apikeys')
  for (const f of [sesi, db, sqlite, env]) buat(f, 512, 30 * 24 * JAM) // sengaja sangat tua

  const asli = process.cwd()
  process.chdir(akar)
  try {
    await modul.bersihkanDisk({ darurat: true })
    assert.equal(fs.existsSync(sesi), true, 'sesi WhatsApp tidak boleh dihapus')
    assert.equal(fs.existsSync(db), true, 'database tidak boleh dihapus')
    assert.equal(fs.existsSync(sqlite), true, 'sqlite tidak boleh dihapus')
    assert.equal(fs.existsSync(env), true, 'berkas API key tidak boleh dihapus')
  } finally {
    process.chdir(asli)
    fs.rmSync(akar, { recursive: true, force: true })
  }
})

test('log error dipangkas ke batas ukuran walau belum tua', async () => {
  const akar = siapkanAkar()
  const berkas = []
  for (let i = 0; i < 4; i += 1) {
    const f = path.join(akar, 'data', 'errors', `2026-10-2${i + 2}.jsonl`)
    buat(f, 3 * 1048576, (4 - i) * JAM) // masing-masing 3 MB, total 12 MB > 8 MB
    berkas.push(f)
  }
  const asli = process.cwd()
  process.chdir(akar)
  try {
    await modul.bersihkanDisk({})
    const sisa = berkas.filter(f => fs.existsSync(f))
    const total = sisa.reduce((n, f) => n + fs.statSync(f).size, 0)
    assert.ok(total <= 8 * 1048576, `log harus <= 8 MB, masih ${(total / 1048576).toFixed(1)} MB`)
    assert.ok(sisa.length < berkas.length, 'harus ada berkas log yang dipangkas')
  } finally {
    process.chdir(asli)
    fs.rmSync(akar, { recursive: true, force: true })
  }
})

function connPalsu() {
  const terkirim = []
  return {
    terkirim,
    sendMessage: async (chat, isi) => {
      terkirim.push({ chat, isi })
      return { key: { id: 'x' } }
    },
  }
}

test('perintah .disk membalas laporan disk', async () => {
  const akar = siapkanAkar()
  const asli = process.cwd()
  process.chdir(akar)
  try {
    const conn = connPalsu()
    const m = { chat: '123@g.us', raw: {} }
    await modul.default(m, { conn, args: [], usedPrefix: '.', command: 'disk' })
    assert.equal(conn.terkirim.length, 1)
    const teks = conn.terkirim[0].isi.text
    assert.match(teks, /PENJAGA DISK/)
    assert.match(teks, /Bebas\s+:/)
    assert.match(teks, /Status\s+:/)
  } finally {
    process.chdir(asli)
    fs.rmSync(akar, { recursive: true, force: true })
  }
})

test('perintah .disk bersih menjalankan pembersihan dan melapor', async () => {
  const akar = siapkanAkar()
  const lama = path.join(akar, 'tmp', 'sampah.bin')
  buat(lama, 8192, 3 * JAM)
  const asli = process.cwd()
  process.chdir(akar)
  try {
    const conn = connPalsu()
    const m = { chat: '123@g.us', raw: {} }
    await modul.default(m, { conn, args: ['bersih'], usedPrefix: '.', command: 'disk' })
    const teks = conn.terkirim[0].isi.text
    assert.match(teks, /BERSIH DISK SELESAI/)
    assert.match(teks, /Dihapus\s+:/)
    assert.equal(fs.existsSync(lama), false, 'sampah harus benar-benar terhapus')
  } finally {
    process.chdir(asli)
    fs.rmSync(akar, { recursive: true, force: true })
  }
})

test('perintah .disk menulis data/disk-watch.json', async () => {
  const akar = siapkanAkar()
  const asli = process.cwd()
  process.chdir(akar)
  try {
    const conn = connPalsu()
    await modul.default({ chat: '1@g.us', raw: {} }, { conn, args: [], usedPrefix: '.', command: 'disk' })
    const berkas = path.join(akar, 'data', 'disk-watch.json')
    assert.equal(fs.existsSync(berkas), true, 'catatan disk harus dibuat')
    const isi = JSON.parse(fs.readFileSync(berkas, 'utf8'))
    assert.ok(isi.totalMb > 0)
    assert.ok(isi.at)
    assert.equal(isi.aksi, 'cek-manual')
  } finally {
    process.chdir(asli)
    fs.rmSync(akar, { recursive: true, force: true })
  }
})
