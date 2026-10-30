/* Task177 — diagnosa "bot delay / kadang tidak merespons" + cek paket integrasi.
 *
 * Menulis SATU berkas kecil /data/task177-diagnosa.json lalu berhenti.
 * Tidak mengirim WhatsApp, tidak mengubah perilaku bot.
 *
 * Isi laporan:
 *   latensi  → ringkasan /data/latency-119.jsonl (hanya 3 MB terakhir dibaca):
 *              kestabilan event loop (lag), simpan database (dbwrite),
 *              hook plugin yang lambat, dan waktu balas (handleMs) per perintah.
 *   impor    → uji impor beberapa plugin integrations/umi (penyebab error
 *              "Cannot find module .../integrations/umi/config.js").
 *   ffmpeg   → ketersediaan ffmpeg untuk fitur video.
 *   sistem   → memori, jumlah plugin, ukuran berkas besar.
 */
import fs from 'node:fs'
import path from 'node:path'

const HASIL = path.resolve(process.cwd(), 'data', 'task177-diagnosa.json')

function bacaEkor(berkas, maksBita = 3 * 1024 * 1024) {
  try {
    const stat = fs.statSync(berkas)
    const mulai = Math.max(0, stat.size - maksBita)
    const fd = fs.openSync(berkas, 'r')
    const buf = Buffer.alloc(stat.size - mulai)
    fs.readSync(fd, buf, 0, buf.length, mulai)
    fs.closeSync(fd)
    const baris = buf.toString('utf8').split('\n')
    // buang baris pertama (kemungkinan terpotong)
    if (mulai > 0) baris.shift()
    const out = []
    for (const b of baris) {
      const t = b.trim()
      if (!t || t[0] !== '{') continue
      try { out.push(JSON.parse(t)) } catch { /* lewati */ }
    }
    return { baris: out, ukuranBerkas: stat.size }
  } catch (e) {
    return { baris: [], error: String(e?.message || e) }
  }
}

function persentil(daftar, p) {
  if (!daftar.length) return 0
  const urut = [...daftar].sort((a, b) => a - b)
  const idx = Math.min(urut.length - 1, Math.max(0, Math.round((p / 100) * (urut.length - 1))))
  return urut[idx]
}

function analisaLatensi() {
  const { baris, ukuranBerkas, error } = bacaEkor(path.join(process.cwd(), 'data', 'latency-119.jsonl'))
  if (error) return { error, ukuranBerkas }
  const out = { ukuranBerkas, barisDibaca: baris.length, jenis: {}, hooks: [], handleMs: {}, perPerintah: [], lag: {}, dbwrite: {} }

  const hooks = new Map()
  const handle = []
  const perintah = new Map()
  const lag = []
  const dbw = []

  for (const b of baris) {
    out.jenis[b.jenis] = (out.jenis[b.jenis] || 0) + 1
    if (b.jenis === 'hook') {
      const h = hooks.get(b.hook) || { hook: b.hook, jumlah: 0, totalMs: 0, maksMs: 0 }
      h.jumlah += 1
      h.totalMs += Number(b.durasi) || 0
      h.maksMs = Math.max(h.maksMs, Number(b.durasi) || 0)
      hooks.set(b.hook, h)
    } else if (b.jenis === 'lag') {
      lag.push(Number(b.drift) || 0)
    } else if (b.jenis === 'dbwrite') {
      dbw.push(Number(b.durasi) || 0)
    } else if (b.jenis === 'kirim' || b.jenis === 'kirim-gagal') {
      const ms = Number(b.handleMs)
      if (Number.isFinite(ms) && ms >= 0) {
        handle.push(ms)
        const k = String(b.perintah || '(tanpa perintah)').slice(0, 30)
        const p = perintah.get(k) || { perintah: k, n: 0, total: 0, maks: 0 }
        p.n += 1
        p.total += ms
        p.maks = Math.max(p.maks, ms)
        perintah.set(k, p)
      }
    }
  }

  out.hooks = [...hooks.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, 15)
  out.handleMs = {
    n: handle.length,
    p50: persentil(handle, 50),
    p90: persentil(handle, 90),
    p99: persentil(handle, 99),
    maks: handle.length ? Math.max(...handle) : 0,
    lebih1detik: handle.filter((x) => x > 1000).length,
    lebih5detik: handle.filter((x) => x > 5000).length,
  }
  out.perPerintah = [...perintah.values()]
    .filter((p) => p.n >= 2)
    .map((p) => ({ perintah: p.perintah, n: p.n, rataMs: Math.round(p.total / p.n), maksMs: p.maks }))
    .sort((a, b) => b.rataMs - a.rataMs)
    .slice(0, 20)
  out.lag = { n: lag.length, maks: lag.length ? Math.max(...lag) : 0, total: lag.reduce((a, b) => a + b, 0) }
  out.dbwrite = { n: dbw.length, maks: dbw.length ? Math.max(...dbw) : 0, total: dbw.reduce((a, b) => a + b, 0) }
  return out
}

async function ujiImpor() {
  const daftar = [
    ['src/lib/rimuru-error.js', 'lib error (yang error di .fakeff)'],
    ['plugins/canvas/fakeff.js', 'fakeff'],
    ['plugins/tools/ascii.js', 'ascii'],
    ['plugins/ai/deepseek.js', 'ai deepseek'],
    ['plugins/ai/gpt5.js', 'ai gpt5'],
    ['plugins/maker/fakebca.js', 'fakebca'],
  ]
  const hasil = []
  for (const [rel, nama] of daftar) {
    const mulai = Date.now()
    try {
      const url = new URL(`../../integrations/umi/${rel}`, import.meta.url)
      url.searchParams.set('diagnosa', String(Date.now()))
      const mod = await import(url.href)
      hasil.push({ nama, berkas: rel, ok: true, ms: Date.now() - mulai, ekspor: Object.keys(mod).slice(0, 5) })
    } catch (e) {
      hasil.push({ nama, berkas: rel, ok: false, ms: Date.now() - mulai, error: String(e?.message || e).slice(0, 220) })
    }
  }
  return hasil
}

async function cekFfmpeg() {
  const out = { ada: false }
  try {
    const mod = await import('@ffmpeg-installer/ffmpeg')
    const jalur = mod.default?.path || mod.path || ''
    out.paket = '@ffmpeg-installer/ffmpeg'
    out.jalur = jalur
    out.ada = Boolean(jalur && fs.existsSync(jalur))
    if (out.ada) {
      const { execFileSync } = await import('node:child_process')
      const v = execFileSync(jalur, ['-version'], { timeout: 15000 }).toString('utf8').split('\n')[0]
      out.versi = v.slice(0, 120)
    }
  } catch (e) {
    out.error = String(e?.message || e).slice(0, 160)
  }
  for (const kandidat of ['ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    try {
      const { execFileSync } = await import('node:child_process')
      const v = execFileSync(kandidat, ['-version'], { timeout: 10000 }).toString('utf8').split('\n')[0]
      out[kandidat] = v.slice(0, 100)
      out.ada = true
    } catch { /* tidak ada */ }
  }
  return out
}

function cekSistem() {
  const out = { memoriMB: Math.round(process.memoryUsage().rss / 1048576), plugin: 0, berkasBesar: [] }
  try { out.plugin = Object.keys(global.plugins || {}).length } catch { /* - */ }
  try {
    const dir = path.join(process.cwd(), 'data')
    for (const n of fs.readdirSync(dir)) {
      const s = fs.statSync(path.join(dir, n))
      if (s.isFile() && s.size > 1024 * 1024) out.berkasBesar.push({ nama: n, mb: +(s.size / 1048576).toFixed(1) })
    }
  } catch { /* - */ }
  return out
}

async function jalankan() {
  const hasil = { waktu: new Date().toISOString(), node: process.version }
  hasil.latensi = analisaLatensi()
  hasil.impor = await ujiImpor()
  hasil.ffmpeg = await cekFfmpeg()
  hasil.sistem = cekSistem()
  fs.mkdirSync(path.dirname(HASIL), { recursive: true })
  fs.writeFileSync(HASIL, JSON.stringify(hasil, null, 2))
}

if (!fs.existsSync(HASIL)) {
  setTimeout(() => {
    jalankan().catch((e) => {
      try { fs.writeFileSync(HASIL, JSON.stringify({ error: String(e?.message || e) }, null, 2)) } catch { /* - */ }
    })
  }, 12000)
}

export default { name: 'task177-diagnosa' }
