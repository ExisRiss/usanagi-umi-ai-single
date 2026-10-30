/* By AlzRiss - Usanagi Umi AI
 *
 * PUSAT PENYEDIA API — Task177
 *
 * Kenapa berkas ini ada
 * ---------------------
 * Banyak fitur (AI, gambar, unduhan) menembak layanan pihak ketiga sendiri-
 * sendiri. Diuji 30-10-2026 dari server:
 *
 *   apiii-xrina.my.id  /ai/gemini, /ai/claudehaiku, /ai/qwen,
 *                      /ai-image/flux, /ai-image/text2img ......... HIDUP (200)
 *   api-faa.my.id      /faa/ai .................................. MATI (halaman Cloudflare)
 *   api.deline.web.id  /ai/gemini ............................... MATI (balasan kosong)
 *
 * Jadi semua fitur memakai penyedia yang benar-benar hidup, dengan urutan:
 *   xrina → faa → deline
 * Penyedia yang gagal dicatat dan otomatis dilewati, sehingga satu layanan
 * mati tidak mematikan fitur.
 *
 * Kunci (kalau endpoint memerlukannya) dibaca dari config/api-keys.js —
 * tidak ada kunci yang ditulis di sini.
 */

import axios from 'axios'
import { apiKey } from '../config/api-keys.js'

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

export const PENYEDIA = {
  xrina: {
    nama: 'xrina',
    dasar: 'https://apiii-xrina.my.id',
    /* Endpoint teks yang sudah diuji hidup, urut dari yang paling cepat. */
    ai: ['/ai/gemini', '/ai/claudehaiku', '/ai/qwen', '/ai/gpt', '/ai/chatgpt'],
    gambar: ['/ai-image/flux', '/ai-image/text2img'],
  },
  faa: { nama: 'faa', dasar: 'https://api-faa.my.id', ai: ['/faa/ai'], gambar: [] },
  deline: { nama: 'deline', dasar: 'https://api.deline.web.id', ai: ['/ai/gemini'], gambar: [] },
}

const gagalTerakhir = new Map()

function catatGagal(penyedia, pesan) {
  gagalTerakhir.set(penyedia, { waktu: Date.now(), pesan: String(pesan || '').slice(0, 160) })
}

/** Status penyedia terakhir (dipakai perintah diagnosa). */
export function statusPenyedia() {
  return Object.fromEntries([...gagalTerakhir.entries()].map(([k, v]) => [k, v]))
}

/** Ambil teks jawaban dari bentuk balasan apa pun yang umum dipakai. */
export function ambilTeks(data) {
  if (!data) return ''
  if (typeof data === 'string') return data.trim()
  if (typeof data !== 'object') return ''
  const kandidat = [
    data.result, data.response, data.answer, data.message, data.text, data.reply,
    data.data?.response, data.data?.answer, data.data?.result, data.data?.text,
    data.data?.message, data.result?.response, data.result?.message,
  ]
  for (const nilai of kandidat) {
    if (typeof nilai === 'string' && nilai.trim()) return nilai.trim()
  }
  if (Array.isArray(data.data) && typeof data.data[0] === 'string') return data.data[0].trim()
  return ''
}

/**
 * Tanya AI teks ke penyedia hidup (xrina → faa → deline).
 *
 * @param {string} teks pertanyaan
 * @param {{timeout?:number, urutan?:string[], penyedia?:string[]}} [opsi]
 * @returns {Promise<{ok:boolean, teks:string, penyedia:string, endpoint:string, galat:string[]}>}
 */
export async function aiTeks(teks, opsi = {}) {
  const prompt = String(teks || '').trim()
  if (!prompt) return { ok: false, teks: '', penyedia: '', endpoint: '', galat: ['pertanyaan kosong'] }

  const timeout = Number(opsi.timeout) || 45_000
  const urutan = Array.isArray(opsi.urutan) && opsi.urutan.length ? opsi.urutan : ['xrina', 'faa', 'deline']
  const galat = []

  for (const nama of urutan) {
    const penyedia = PENYEDIA[nama]
    if (!penyedia) continue
    for (const jalur of penyedia.ai || []) {
      const url = `${penyedia.dasar}${jalur}`
      try {
        const respons = await axios.get(url, {
          params: { text: prompt, q: prompt, query: prompt, message: prompt, prompt },
          timeout,
          validateStatus: () => true,
          headers: { 'user-agent': UA, accept: 'application/json, text/plain, */*' },
          responseType: 'text',
          transformResponse: [(d) => d],
        })
        const isi = String(respons.data || '')
        if (respons.status >= 200 && respons.status < 300 && /<html/i.test(isi)) {
          galat.push(`${nama}${jalur}: balasan HTML (diblokir)`)
          catatGagal(nama, 'balasan HTML')
          continue
        }
        let json = null
        try { json = JSON.parse(isi) } catch { /* bukan JSON */ }
        if (json && json.status === false) {
          galat.push(`${nama}${jalur}: ${json.message || json.error || 'status false'}`)
          catatGagal(nama, json.message || 'status false')
          continue
        }
        const jawab = ambilTeks(json) || (json ? '' : isi.trim().slice(0, 4000))
        if (jawab) return { ok: true, teks: jawab, penyedia: nama, endpoint: jalur, galat }
        galat.push(`${nama}${jalur}: jawaban kosong`)
        catatGagal(nama, 'jawaban kosong')
      } catch (error) {
        const pesan = String(error?.code || error?.message || error).slice(0, 100)
        galat.push(`${nama}${jalur}: ${pesan}`)
        catatGagal(nama, pesan)
      }
    }
  }
  return { ok: false, teks: '', penyedia: '', endpoint: '', galat }
}

/**
 * Buat gambar dari teks lewat penyedia hidup.
 *
 * @returns {Promise<{ok:boolean, buffer?:Buffer, mime?:string, penyedia?:string, endpoint?:string, galat:string[]}>}
 */
export async function gambarAI(prompt, opsi = {}) {
  const teks = String(prompt || '').trim()
  if (!teks) return { ok: false, galat: ['prompt kosong'] }
  const timeout = Number(opsi.timeout) || 90_000
  const galat = []

  const daftar = []
  for (const nama of opsi.urutan || ['xrina', 'faa', 'deline']) {
    const penyedia = PENYEDIA[nama]
    if (!penyedia) continue
    for (const jalur of penyedia.gambar || []) daftar.push({ nama, dasar: penyedia.dasar, jalur })
  }

  for (const { nama, dasar, jalur } of daftar) {
    try {
      const respons = await axios.get(`${dasar}${jalur}`, {
        params: { prompt: teks, text: teks, q: teks, ratio: opsi.rasio || '1:1', shape: opsi.rasio || '1:1' },
        responseType: 'arraybuffer',
        timeout,
        maxRedirects: 4,
        maxContentLength: 40 * 1024 * 1024,
        validateStatus: () => true,
        headers: { 'user-agent': UA, accept: 'image/*,application/json,*/*' },
      })
      const mime = String(respons.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
      const buf = Buffer.from(respons.data || [])
      if (respons.status === 200 && mime.startsWith('image/') && buf.length > 2048) {
        return { ok: true, buffer: buf, mime, penyedia: nama, endpoint: jalur, galat }
      }
      /* Sebagian endpoint membalas JSON berisi tautan gambar. */
      if (mime.includes('json')) {
        let json = null
        try { json = JSON.parse(buf.toString('utf8')) } catch { /* - */ }
        const tautan =
          json?.data?.url || json?.url || json?.result?.url || json?.data?.[0]?.url || json?.image || ''
        if (typeof tautan === 'string' && /^https?:\/\//i.test(tautan)) {
          const unduh = await unduhMedia(tautan)
          if (unduh.ok) return { ok: true, buffer: unduh.buffer, mime: unduh.mime, penyedia: nama, endpoint: jalur, galat }
        }
      }
      galat.push(`${nama}${jalur}: bukan gambar (${mime || 'tanpa tipe'}, ${buf.length} B)`)
      catatGagal(nama, 'bukan gambar')
    } catch (error) {
      const pesan = String(error?.code || error?.message || error).slice(0, 100)
      galat.push(`${nama}${jalur}: ${pesan}`)
      catatGagal(nama, pesan)
    }
  }
  return { ok: false, galat }
}

/** Unduh tautan media menjadi Buffer (dipakai video/gambar). */
export async function unduhMedia(url, opsi = {}) {
  if (!/^https?:\/\//i.test(String(url || ''))) return { ok: false, alasan: 'tautan tidak valid' }
  try {
    const respons = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: Number(opsi.timeout) || 90_000,
      maxContentLength: Number(opsi.maxBytes) || 80 * 1024 * 1024,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { 'user-agent': UA, accept: '*/*' },
    })
    const mime = String(respons.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
    const buffer = Buffer.from(respons.data || [])
    if (respons.status >= 200 && respons.status < 300 && buffer.length > 512) {
      return { ok: true, buffer, mime, ukuran: buffer.length }
    }
    return { ok: false, alasan: `HTTP ${respons.status}`, mime, ukuran: buffer.length }
  } catch (error) {
    return { ok: false, alasan: String(error?.code || error?.message || error).slice(0, 120) }
  }
}

/**
 * Cek cepat semua penyedia: apakah hidup dan bisa menjawab.
 * @returns {Promise<object>} ringkasan per penyedia
 */
export async function cekPenyedia() {
  const hasil = {}
  for (const [nama, penyedia] of Object.entries(PENYEDIA)) {
    const baris = { dasar: penyedia.dasar, ai: [], gambar: [] }
    for (const jalur of penyedia.ai || []) {
      const mulai = Date.now()
      try {
        const r = await axios.get(`${penyedia.dasar}${jalur}`, {
          params: { text: 'ping' }, timeout: 20_000, validateStatus: () => true,
          headers: { 'user-agent': UA }, responseType: 'text', transformResponse: [(d) => d],
        })
        const isi = String(r.data || '')
        baris.ai.push({ jalur, status: r.status, ms: Date.now() - mulai, html: /<html/i.test(isi), panjang: isi.length })
      } catch (error) {
        baris.ai.push({ jalur, status: 'gagal', galat: String(error?.code || error?.message || error).slice(0, 60) })
      }
    }
    hasil[nama] = baris
  }
  if (apiKey('xrina')) hasil.xrina.kunci = 'terisi'
  return hasil
}

export default { aiTeks, gambarAI, unduhMedia, cekPenyedia, statusPenyedia, ambilTeks, PENYEDIA }
