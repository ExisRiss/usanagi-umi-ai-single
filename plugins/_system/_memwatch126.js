/* By AlzRiss - Usanagi Umi AI
 *
 * PENJAGA MEMORI (Task126)
 *
 * Kenapa ada: server lama "penuh memori" — RSS naik terus sampai ±1 GB dalam
 * beberapa jam, lalu bot mati/OOM. Tanpa catatan, penyebabnya cuma dugaan.
 *
 * Plugin ini TIDAK mengubah perilaku bot. Tugasnya:
 *   1. mencatat pemakaian memori tiap 5 menit (rss, heapUsed, heapTotal,
 *      external, jumlah sesi jadibot, jumlah plugin) ke data/mem-watch.json;
 *   2. menyimpan hanya 120 catatan terakhir supaya berkasnya tidak membesar;
 *   3. memberi perintah owner `.memwatch` untuk melihat kondisi sekarang.
 *
 * Kalau catatan menunjukkan heapUsed mendekati batas heap (mis. 700 MB dari
 * 768 MB), batas `--max-old-space-size` di CMD_RUN bisa dinaikkan; kalau RSS
 * naik terus walau heap stabil, berarti memori native (sharp/canvas/buffer)
 * yang bocor, bukan JavaScript-nya.
 */

import fs from 'node:fs'
import path from 'node:path'
import v8 from 'node:v8'

const MAKS_CATATAN = 120
const JARAK_MS = 5 * 60 * 1000
const AMBANG_PERINGATAN = 0.85 // 85% dari batas heap

const BERKAS = (() => {
  const kandidat = [
    path.join(process.cwd(), 'data', 'mem-watch.json'),
    '/data/mem-watch.json',
  ]
  for (const jalur of kandidat) {
    try {
      fs.mkdirSync(path.dirname(jalur), { recursive: true })
      fs.appendFileSync(jalur, '')
      return jalur
    } catch {}
  }
  return null
})()

const mb = nilai => Math.round((Number(nilai) || 0) / 1048576)

function batasHeapMb() {
  try {
    return mb(v8.getHeapStatistics().heap_size_limit)
  } catch {
    return 0
  }
}

function jumlahSesi() {
  const map = global.jadibotConns || globalThis.__usanagiJadibotConns
  if (map && typeof map.size === 'number') return map.size
  return 0
}

function jumlahPlugin() {
  const daftar = global.plugins
  return daftar && typeof daftar === 'object' ? Object.keys(daftar).length : 0
}

export function bacaCatatan() {
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS, 'utf8'))
    return Array.isArray(isi) ? isi : []
  } catch {
    return []
  }
}

export function potretMemori() {
  const pakai = process.memoryUsage()
  return {
    at: new Date().toISOString(),
    uptimeMenit: Math.round(process.uptime() / 60),
    rssMb: mb(pakai.rss),
    heapUsedMb: mb(pakai.heapUsed),
    heapTotalMb: mb(pakai.heapTotal),
    externalMb: mb(pakai.external),
    batasHeapMb: batasHeapMb(),
    sesiJadibot: jumlahSesi(),
    plugin: jumlahPlugin(),
  }
}

export function catatMemori() {
  const potret = potretMemori()
  const catatan = bacaCatatan()
  catatan.push(potret)
  while (catatan.length > MAKS_CATATAN) catatan.shift()
  try {
    if (BERKAS) fs.writeFileSync(BERKAS, JSON.stringify(catatan, null, 1))
  } catch (error) {
    console.warn('[MEMWATCH] gagal menulis catatan:', error?.message || error)
  }
  return potret
}

/** Ringkasan tren: rata-rata kenaikan RSS per jam dari catatan yang ada. */
export function tren() {
  const catatan = bacaCatatan()
  if (catatan.length < 2) return { sampel: catatan.length, naikPerJamMb: null }
  const awal = catatan[0]
  const akhir = catatan[catatan.length - 1]
  const menit = Math.max(1, (new Date(akhir.at) - new Date(awal.at)) / 60000)
  const naik = akhir.rssMb - awal.rssMb
  return {
    sampel: catatan.length,
    menitTerpantau: Math.round(menit),
    rssAwalMb: awal.rssMb,
    rssAkhirMb: akhir.rssMb,
    naikPerJamMb: Math.round((naik / menit) * 60 * 10) / 10,
  }
}

const handler = async (m, { conn }) => {
  const potret = catatMemori()
  const t = tren()
  const persenHeap = potret.batasHeapMb ? Math.round((potret.heapUsedMb / potret.batasHeapMb) * 100) : 0
  const baris = [
    '🧠 *PENJAGA MEMORI*',
    '',
    `RSS          : ${potret.rssMb} MB`,
    `Heap dipakai : ${potret.heapUsedMb} / ${potret.batasHeapMb} MB (${persenHeap}%)`,
    `Heap total   : ${potret.heapTotalMb} MB`,
    `Native/buffer: ${potret.externalMb} MB`,
    `Uptime       : ${potret.uptimeMenit} menit`,
    `Sesi jadibot : ${potret.sesiJadibot}`,
    `Plugin       : ${potret.plugin}`,
    '',
    t.naikPerJamMb === null
      ? 'Tren: butuh minimal 2 catatan.'
      : `Tren RSS     : ${t.naikPerJamMb} MB/jam (${t.rssAwalMb} → ${t.rssAkhirMb} MB dalam ${t.menitTerpantau} menit)`,
    persenHeap >= AMBANG_PERINGATAN * 100 ? '⚠️ Heap mendekati batas — pertimbangkan restart.' : '',
    `Berkas       : ${BERKAS || '-'}`,
  ].filter(Boolean)
  await conn.sendMessage(m.chat, { text: baris.join('\n') }, { quoted: m.raw })
}

handler.command = /^(memwatch|cekram|cekmemori)$/i
handler.help = ['memwatch']
handler.tags = ['system', 'owner']
handler.owner = true
handler.description = 'Melihat pemakaian memori bot & trennya (penjaga OOM)'
handler.limit = false

export default handler

// Catat sekali saat boot, lalu tiap 5 menit.
setTimeout(() => {
  try { catatMemori() } catch {}
  setInterval(() => { try { catatMemori() } catch {} }, JARAK_MS).unref?.()
}, 20_000)
