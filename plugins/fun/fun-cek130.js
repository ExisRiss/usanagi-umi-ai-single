/* By AlzRiss - Usanagi Umi AI
 *
 * CEK-CEKAN SERU (Task130 — diadaptasi dari Kilua MD by Naren V2)
 *
 * Kilua punya 13 perintah "cek" yang menggambar kartu hasil acak. Semuanya saya
 * pindahkan: teks vonisnya diambil dari plugin Kilua (lihat catatan di
 * lib/data-cek130.js soal isi arsipnya yang tercampur), kartunya digambar
 * dengan `@napi-rs/canvas` — bukan `kyzz-canvas` yang tidak terpasang.
 *
 * Perintah (semua bisa tanpa argumen, tag, atau balas pesan):
 *   .cekgay .cekbego .cekdosa .cekharam .ceklesbi .ceksadboy .ceksange
 *   .cekstres .cektolol .cekwatak .cekalim  + alias .*check
 *
 * Tiga cek dari Kilua (cekbucin, cekjodoh, ceksial) sengaja TIDAK didaftarkan
 * karena perintah itu sudah ada di Umi (`plugins/fun/usanagi-cek*.js`);
 * mendaftarkan ulang akan membuat perintah kembar.
 *
 * Hasilnya ACAK dan hanya untuk hiburan — ada tulisan itu di kartu dan caption.
 * Skor memakai hash nama supaya orang yang sama mendapat angka yang sama
 * sepanjang hari (tidak berubah-ubah tiap kali diketik).
 */

import { renderKartuCek, ambilAvatar } from '../../lib/canvas-fun.js'
import { CEK } from '../../lib/data-cek130.js'

/* Perintah yang sudah dipegang plugin lain di repo ini — jangan didaftarkan. */
const SUDAH_ADA = new Set(['cekbucin', 'cekjodoh', 'ceksial'])

/* Perintah = kunci data. Warna diambil dari data supaya tidak dobel di sini. */
const PERINTAH = {}
for (const [kunci, data] of Object.entries(CEK)) {
  if (SUDAH_ADA.has(kunci)) continue
  PERINTAH[kunci] = { kunci, warna: data.warna || '#ff4794' }
}

/* Alias gaya Kilua (beberapa perintah punya nama lain). */
const ALIAS = {
  dosacheck: 'cekdosa',
  haramcheck: 'cekharam',
  sangecheck: 'ceksange',
  watakcheck: 'cekwatak',
}

/** Skor stabil per (perintah + nama) per hari, supaya tidak berubah-ubah. */
export function skorStabil(kunci, nama, tanggal = new Date()) {
  const bahan = `${kunci}|${String(nama || '').toLowerCase()}|${tanggal.toISOString().slice(0, 10)}`
  let h = 2166136261
  for (let i = 0; i < bahan.length; i += 1) {
    h ^= bahan.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % 101
}

/** Pilih vonis + kategori berdasarkan skor (0-100). */
export function pilihVonis(kunci, skor) {
  const data = CEK[kunci]
  if (!data || !data.vonis.length) return { vonis: '-', kategori: '' }
  const n = data.vonis.length
  // Skor besar → vonis makin "ekstrem" (indeks makin tinggi).
  const indeks = Math.min(n - 1, Math.floor((skor / 101) * n))
  return {
    vonis: data.vonis[indeks] || data.vonis[0],
    kategori: data.kategori[indeks] || '',
  }
}

/** Tentukan siapa yang dicek: tag, balasan, nomor, atau diri sendiri. */
export async function targetCek(m, teks, conn) {
  let jid = null
  let nama = ''
  const arg = String(teks || '').trim()

  if (m.mentionedJid?.length) jid = m.mentionedJid[0]
  else if (m.quoted?.sender) jid = m.quoted.sender
  else if (arg) {
    const angka = arg.replace(/[^0-9]/g, '')
    if (angka.length >= 7 && angka.length <= 15) jid = `${angka}@s.whatsapp.net`
    else nama = arg
  }
  if (!jid && !nama) jid = m.sender

  if (jid) {
    const tag = String(jid).split('@')[0]
    nama = `@${tag}`
    let ketemu = ''
    try {
      ketemu = String((await conn?.getName?.(jid)) || '')
    } catch {
      ketemu = ''
    }
    if (!ketemu || ketemu === 'User' || /^\d+$/.test(ketemu)) {
      ketemu = global.db?.data?.users?.[jid]?.name || ''
    }
    if (!ketemu && jid === m.sender && m.pushName) ketemu = m.pushName
    if (ketemu) nama = ketemu
  }

  return { jid, nama: String(nama || 'Kak').slice(0, 40) }
}

let handler = async (m, { conn, command, text, usedPrefix }) => {
  const perintah = String(command || '').toLowerCase()
  const kunci = ALIAS[perintah] || perintah
  const konf = PERINTAH[kunci]
  if (!konf) return

  const data = CEK[konf.kunci]
  const { jid, nama } = await targetCek(m, text, conn)
  const skor = skorStabil(konf.kunci, nama || jid || 'kak')
  const { vonis, kategori } = pilihVonis(konf.kunci, skor)

  const caption = [
    `${data.judul}`,
    '',
    `👤 Nama  : ${nama}`,
    `📊 Skor  : ${skor}%`,
    kategori ? `🏷️ Kelas : ${kategori}` : '',
    '',
    `💬 ${vonis}`,
    '',
    '> hasil acak untuk hiburan, jangan dibawa serius ya',
    `> coba lagi: ${usedPrefix}${perintah}`,
  ].filter(Boolean).join('\n')

  try {
    const avatar = await ambilAvatar(conn, jid)
    const gambar = await renderKartuCek({
      judul: data.judul,
      nama,
      skor,
      vonis,
      kategori,
      warna: konf.warna,
    })
    const mentions = jid && String(nama).startsWith('@') ? [jid] : []
    await conn.sendMessage(m.chat, { image: gambar, caption, mentions }, m.raw ? { quoted: m.raw } : undefined)
    return { ok: true, perintah: kunci, skor }
  } catch (error) {
    console.warn(`[CEK130] canvas gagal (${kunci}):`, error?.message || error)
    // Cadangan: tetap kirim hasilnya walau gambar gagal dibuat.
    await conn.sendMessage(
      m.chat,
      { text: `${data.judul}\n\n👤 ${nama}\n📊 ${skor}%\n\n💬 ${vonis}\n\n> hasil acak untuk hiburan` },
      m.raw ? { quoted: m.raw } : undefined
    )
    return { ok: true, mode: 'teks', perintah: kunci, skor }
  }
}

handler.command = new RegExp(`^(${Object.keys(PERINTAH).join('|')}|${Object.keys(ALIAS).join('|')})$`, 'i')
handler.help = Object.keys(PERINTAH).map(k => `${k} [tag/balas]`)
handler.tags = ['fun', 'game']
handler.description = 'Cek-cekan seru ala Kilua MD: skor acak (stabil harian) + kartu gambar'
handler.limit = false

export { PERINTAH, ALIAS }
export default handler
