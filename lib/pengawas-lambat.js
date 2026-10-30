/* By AlzRiss - Usanagi Umi AI
 *
 * PENGAWAS PERINTAH LAMBAT — Task177
 *
 * Keluhan owner: "bot kok delay dan kadang engga respon".
 * Probe /data/latency-119.jsonl membuktikan dua hal nyata:
 *   • p90 waktu balas 9,7 detik, p99 150 detik;
 *   • 1.142 balasan lebih dari 1 detik, 490 lebih dari 5 detik.
 *
 * Tetapi probe lama hanya melihat "kirim pesan", sehingga perintah yang TIDAK
 * pernah mengirim balasan (hang menunggu API tanpa timeout) tidak tercatat —
 * itulah "kadang engga respon".
 *
 * Berkas ini memberi dua hal:
 *   1. catatan perintah yang lambat / hang  → data/lambat.jsonl (dibatasi
 *      400 baris, jadi tidak membengkak seperti latency-119.jsonl yang 10 MB);
 *   2. pemberitahuan sekali ke chat kalau perintah berjalan > 20 detik, supaya
 *      pengguna tidak menunggu tanpa kabar.
 *
 * Tidak ada perilaku bot yang diubah selain itu: perintah tetap dijalankan
 * seperti biasa sampai selesai.
 */

import fs from 'node:fs'
import path from 'node:path'

const BERKAS = path.join(process.cwd(), 'data', 'lambat.jsonl')
const MAKS_BARIS = 400
const BATAS_CATAT = 2000      // ms — mulai dicatat
const BATAS_KABAR = Number(process.env.UMI_KABAR_LAMBAT_MS) || 20000

let jumlahTulis = 0

function catat(data) {
  try {
    fs.mkdirSync(path.dirname(BERKAS), { recursive: true })
    if (jumlahTulis === 0) {
      // Pangkas sekali per proses supaya berkas tidak tumbuh tanpa batas.
      try {
        const isi = fs.readFileSync(BERKAS, 'utf8').trim().split('\n').filter(Boolean)
        if (isi.length > MAKS_BARIS) {
          fs.writeFileSync(BERKAS, isi.slice(-Math.floor(MAKS_BARIS / 2)).join('\n') + '\n')
        }
      } catch { /* berkas belum ada */ }
    }
    fs.appendFileSync(BERKAS, JSON.stringify({ at: new Date().toISOString(), ...data }) + '\n')
    jumlahTulis += 1
    if (jumlahTulis % 50 === 0) {
      const isi = fs.readFileSync(BERKAS, 'utf8').trim().split('\n').filter(Boolean)
      if (isi.length > MAKS_BARIS) fs.writeFileSync(BERKAS, isi.slice(-MAKS_BARIS).join('\n') + '\n')
    }
  } catch { /* pencatatan tidak boleh mengganggu perintah */ }
}

/**
 * Jalankan satu perintah sambil mengukur waktunya.
 *
 * @param {string} nama nama plugin/perintah
 * @param {object} m pesan (dipakai untuk mengirim kabar)
 * @param {object} conn koneksi WhatsApp
 * @param {() => Promise<any>} kerja fungsi yang menjalankan perintah
 */
export async function pantauPerintah(nama, m, conn, kerja) {
  const mulai = Date.now()
  let kabarTerkirim = false

  const pengingat = BATAS_KABAR > 0
    ? setTimeout(() => {
        kabarTerkirim = true
        const detik = Math.round((Date.now() - mulai) / 1000)
        try {
          if (m && typeof m.reply === 'function') {
            m.reply(`⏳ *${nama || 'Perintah'}* masih diproses (${detik} detik).\nBot tidak lupa, tunggu sebentar ya — kalau terlalu lama, coba lagi nanti.`).catch(() => {})
          }
        } catch { /* abaikan */ }
      }, BATAS_KABAR)
    : null
  pengingat?.unref?.()

  try {
    const hasil = await kerja()
    const durasi = Date.now() - mulai
    if (durasi >= BATAS_CATAT) {
      catat({
        jenis: 'perintah',
        plugin: String(nama || '').slice(0, 80),
        ms: durasi,
        chat: String(m?.chat || '').slice(0, 24),
        kabar: kabarTerkirim,
      })
    }
    return hasil
  } catch (error) {
    catat({
      jenis: 'gagal',
      plugin: String(nama || '').slice(0, 80),
      ms: Date.now() - mulai,
      galat: String(error?.message || error).slice(0, 180),
    })
    throw error
  } finally {
    if (pengingat) clearTimeout(pengingat)
  }
}

/** Ringkasan untuk perintah diagnosa (`/lambat`). */
export function ringkasLambat() {
  let baris = []
  try {
    baris = fs.readFileSync(BERKAS, 'utf8').trim().split('\n').filter(Boolean).map((b) => JSON.parse(b))
  } catch { return { ada: false, total: 0, teratas: [] } }
  const peta = new Map()
  for (const b of baris) {
    if (b.jenis !== 'perintah') continue
    const k = b.plugin || '?'
    const d = peta.get(k) || { plugin: k, n: 0, total: 0, maks: 0 }
    d.n += 1
    d.total += Number(b.ms) || 0
    d.maks = Math.max(d.maks, Number(b.ms) || 0)
    peta.set(k, d)
  }
  return {
    ada: baris.length > 0,
    total: baris.length,
    teratas: [...peta.values()]
      .map((d) => ({ ...d, rata: Math.round(d.total / d.n) }))
      .sort((a, b) => b.maks - a.maks)
      .slice(0, 15),
    gagal: baris.filter((b) => b.jenis === 'gagal').length,
  }
}

export default { pantauPerintah, ringkasLambat }
