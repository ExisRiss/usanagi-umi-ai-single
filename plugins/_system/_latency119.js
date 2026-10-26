/* By AlzRiss - Usanagi Umi AI
 *
 * PROBE LATENSI — Task119
 *
 * Tujuan: mengukur keluhan "bot delay banget" dari data nyata, bukan tebakan.
 * Probe ini TIDAK mengubah perilaku bot; hanya menulis angka ke
 *   /data/latency-119.jsonl
 *
 * Yang dicatat per pesan:
 *   queueMs  → jarak waktu pesan dibuat WhatsApp sampai handler mulai bekerja
 *   handleMs → jarak waktu sejak pesan diterima sampai bot MENGIRIM balasan
 *   sendMs   → lama proses kirim (sampai WhatsApp menerima/ack)
 *   lambat   → hook plugin yang makan > 50 ms (nama + durasi)
 *
 * Probe berhenti sendiri setelah 4000 baris supaya berkas tidak membengkak.
 * Hapus berkas plugin ini (atau restart tanpa berkasnya) untuk mematikan.
 */

import fs from 'node:fs'
import path from 'node:path'

/* Di server panel, /data adalah folder data bot. Kalau tidak bisa ditulis
 * (mis. saat uji lokal), pakai ./data. */
const BERKAS = (() => {
  const utama = '/data/latency-119.jsonl'
  try {
    fs.appendFileSync(utama, '')
    return utama
  } catch {
    const cadangan = path.join(process.cwd(), 'data', 'latency-119.jsonl')
    try {
      fs.mkdirSync(path.dirname(cadangan), { recursive: true })
      fs.appendFileSync(cadangan, '')
    } catch {}
    return cadangan
  }
})()
const MAKS_BARIS = 4000
const LAMBAT_MS = 50

let baris = 0
let aktif = true
let hookDibungkus = false

const awalPesan = new Map() // chat → { at, text }

function catat(data) {
  if (!aktif) return
  try {
    if (baris >= MAKS_BARIS) {
      aktif = false
      fs.appendFileSync(BERKAS, JSON.stringify({ at: new Date().toISOString(), jenis: 'stop', baris }) + '\n')
      return
    }
    fs.appendFileSync(BERKAS, JSON.stringify({ at: new Date().toISOString(), ...data }) + '\n')
    baris += 1
  } catch {}
}

function bungkusHook() {
  if (hookDibungkus) return
  hookDibungkus = true
  const plugins = global.plugins || {}
  for (const nama of Object.keys(plugins)) {
    const plugin = plugins[nama]
    if (!plugin || typeof plugin !== 'object') continue
    for (const jenis of ['all', 'before', 'after']) {
      const asli = plugin[jenis]
      if (typeof asli !== 'function' || asli.__latensi119) continue
      const bungkus = async function (...args) {
        const mulai = Date.now()
        try {
          return await asli.apply(this, args)
        } finally {
          const durasi = Date.now() - mulai
          if (durasi >= LAMBAT_MS) catat({ jenis: 'hook', hook: `${nama}:${jenis}`, durasi })
        }
      }
      bungkus.__latensi119 = true
      try { plugin[jenis] = bungkus } catch {}
    }
  }
}

const DIBUNGKUS = Symbol.for('umi.latensi119.send')

function bungkusKirim(conn) {
  if (!conn || conn[DIBUNGKUS] || typeof conn.sendMessage !== 'function') return
  try {
    Object.defineProperty(conn, DIBUNGKUS, { value: true, configurable: true })
  } catch {
    return
  }
  const asli = conn.sendMessage.bind(conn)
  conn.sendMessage = async function kirimTerukur(jid, content, options = {}) {
    const mulai = Date.now()
    const jejak = awalPesan.get(String(jid || '')) || null
    try {
      const hasil = await asli(jid, content, options)
      catat({
        jenis: 'kirim',
        chat: String(jid || '').slice(0, 6),
        grup: String(jid || '').endsWith('@g.us'),
        handleMs: jejak ? mulai - jejak.at : null,
        sendMs: Date.now() - mulai,
        isi: Object.keys(content || {}).join('+').slice(0, 40),
        panjang: typeof content?.text === 'string' ? content.text.length : 0,
        perintah: jejak ? jejak.text : '',
      })
      return hasil
    } catch (error) {
      catat({
        jenis: 'kirim-gagal',
        chat: String(jid || '').slice(0, 6),
        handleMs: jejak ? mulai - jejak.at : null,
        sendMs: Date.now() - mulai,
        galat: String(error?.message || error).slice(0, 120),
      })
      throw error
    }
  }
}

let handler = m => m

handler.all = async function (m) {
  bungkusHook()
  bungkusKirim(this)
  if (!m) return
  try {
    const cap = Number(m.messageTimestamp?.low ?? m.messageTimestamp ?? 0) * 1000
    const queueMs = cap ? Date.now() - cap : null
    awalPesan.set(String(m.chat || ''), { at: Date.now(), text: String(m.text || '').slice(0, 24) })
    while (awalPesan.size > 200) awalPesan.delete(awalPesan.keys().next().value)
    catat({
      jenis: 'pesan',
      grup: Boolean(m.isGroup),
      dariSaya: Boolean(m.fromMe),
      queueMs,
      prefix: String(m.text || '').slice(0, 1),
      text: String(m.text || '').slice(0, 24),
    })
  } catch {}
}

export default handler
