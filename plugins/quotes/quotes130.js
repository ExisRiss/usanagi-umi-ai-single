/* By AlzRiss - Usanagi Umi AI
 *
 * KUTIPAN / QUOTES (Task130 — diadaptasi dari Kilua MD by Naren V2)
 *
 * 196 kutipan dari Kilua, 7 kategori:
 *   bijak (32) · bucin (29) · galau (24) · gombal (24) · motivasi (29)
 *   bacot (29) · heker (29)
 *
 * Perintah milik plugin ini:
 *   .kutipan             → kutipan acak dari kategori apa saja
 *   .kutipan bucin       → kutipan acak kategori bucin (argumen, bukan perintah)
 *   .kutipan daftar      → daftar kategori
 *   .bijak .galau .heker → pintasan per kategori
 *
 * Perintah .quotes .bucin .gombal .motivasi .bacot SENGAJA tidak didaftarkan:
 * kelimanya sudah dipakai plugin lain di repo ini (umi-quotetokoh,
 * umi-renungan, umi-bacot, usanagi-bucin). Kategori bucin & gombal tetap bisa
 * dibuka lewat .kutipan bucin / .kutipan gombal.
 */

import { KUTIPAN } from '../../lib/data-cek130.js'

const KATEGORI = Object.keys(KUTIPAN)

/* Perintah pintasan: hanya kategori yang belum punya perintah sendiri. */
const PINTASAN = ['bijak', 'galau', 'heker']
const PERINTAH = ['kutipan', ...PINTASAN]

function acakDari(daftar) {
  return daftar[Math.floor(Math.random() * daftar.length)]
}

function bersihkan(teks) {
  // Buang penanda "❝ ... ❞" atau tanda kutip berlebih dari sumber.
  return String(teks || '')
    .replace(/^[\s"“”'❝❞]+|[\s"“”'❝❞]+$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

let handler = async (m, { conn, command, text, usedPrefix }) => {
  const perintah = String(command || '').toLowerCase()
  const arg = String(text || '').trim().toLowerCase()

  if (perintah === 'kutipan' && (arg === 'daftar' || arg === 'list' || arg === 'kategori')) {
    const daftar = KATEGORI.map(k => `▸ ${usedPrefix}${k} — ${KUTIPAN[k].length} kutipan`).join('\n')
    await conn.sendMessage(
      m.chat,
      {
        text: `📚 *KATEGORI KUTIPAN*\n\n${daftar}\n\nTotal: ${KATEGORI.reduce((n, k) => n + KUTIPAN[k].length, 0)} kutipan\n\nContoh: ${usedPrefix}kutipan bucin`,
      },
      m.raw ? { quoted: m.raw } : undefined
    )
    return { ok: true, mode: 'daftar' }
  }

  // Pilih kategori: dari argumen, atau dari perintah pintasan.
  let kategori = KATEGORI.includes(perintah) ? perintah : ''
  if (!kategori && KATEGORI.includes(arg)) kategori = arg
  if (!kategori && arg) {
    const cocok = KATEGORI.find(k => k.startsWith(arg))
    if (cocok) kategori = cocok
  }
  if (!kategori) kategori = acakDari(KATEGORI)

  const teks = bersihkan(acakDari(KUTIPAN[kategori] || []))
  if (!teks) {
    await conn.sendMessage(m.chat, { text: 'Kutipan untuk kategori itu belum ada.' }, m.raw ? { quoted: m.raw } : undefined)
    return { ok: false, kategori }
  }

  const judul = `❝ ${kategori.toUpperCase()} ❞`
  const pintasan = PINTASAN.includes(kategori) ? `${usedPrefix}${kategori}` : `${usedPrefix}kutipan ${kategori}`
  const caption = `${judul}\n\n${teks}\n\n...\n\n> ${pintasan} · ${usedPrefix}kutipan daftar`

  // Kirim sebagai teks kutipan (bukan gambar) supaya ringan.
  await conn.sendMessage(m.chat, { text: caption }, m.raw ? { quoted: m.raw } : undefined)
  return { ok: true, kategori, panjang: teks.length }
}

handler.command = new RegExp(`^(${PERINTAH.join('|')})$`, 'i')
handler.help = ['kutipan [kategori]', 'kutipan daftar', ...PINTASAN.map(k => `${k}`)]
handler.tags = ['quotes', 'fun']
handler.description = '196 kutipan Kilua dalam 7 kategori (5 di antaranya lewat argumen)'
handler.limit = false

export { KATEGORI, PINTASAN, PERINTAH, KUTIPAN }
export default handler
