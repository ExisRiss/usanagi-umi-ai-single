/* By AlzRiss - Usanagi Umi AI
 *
 * .scrapr — extractor media universal (Task181, diperbarui Task183)
 * memakai pustaka coflyn/scrapr lewat jembatan lib/scrapr.js.
 *
 * Task183 — pengiriman LANGSUNG sesuai jenis media (bukan link):
 *   • audio (mp3 dari YT/Spotify/SoundCloud/TikTok) → pesan audio
 *   • video (TikTok dsb) → pesan video; TikTok sekaligus kirim MP3-nya
 *   • gambar (foto post/IG/Pinterest) → pesan gambar
 *   • berkas (zip/7z/apk/pdf/dll + host MediaFire/Pixeldrain/Catbox/GDrive/
 *     TeraBox) → dokumen dengan nama asli berkas
 *   • hanya kalau tak ada media sama sekali → link sebagai teks
 */

import { scraprUrl, unshortenUrl, klasifikasiMedia, namaBerkas } from '../../lib/scrapr.js'
import { createRequire } from 'node:module'

const bundleScrapr = createRequire(import.meta.url)('../../lib/vendor/scrapr-bundle.cjs')

const MAKS_VIDEO = 60 * 1024 * 1024   // buffer cadangan pengiriman video
const MAKS_AUDIO = 25 * 1024 * 1024
const MAKS_BERKAS = 64 * 1024 * 1024
const MAKS_GAMBAR = 15 * 1024 * 1024

function tebakMimetype(url) {
  const e = (namaBerkas(url).split('.').pop() || '').toLowerCase()
  const peta = {
    zip: 'application/zip', '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar',
    gz: 'application/gzip', tar: 'application/x-tar', apk: 'application/vnd.android.package-archive',
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', pdf2: 'application/pdf', txt: 'text/plain',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm',
  }
  return peta[e] || 'application/octet-stream'
}

async function ambilBuffer(url, batas) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(120000), redirect: 'follow' })
  if (!res.ok) throw new Error(`unduh gagal (HTTP ${res.status})`)
  const panjang = Number(res.headers.get('content-length') || 0)
  if (panjang > batas) throw new Error(`berkas terlalu besar (${(panjang / 1048576).toFixed(1)} MB > batas ${Math.round(batas / 1048576)} MB)`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > batas) throw new Error(`berkas terlalu besar (${(buf.length / 1048576).toFixed(1)} MB)`)
  return buf
}

/** Kirim {url} dulu; kalau WhatsApp menolak → unduh buffer lalu kirim. */
async function kirimAudio(conn, chat, url, caption, quoted) {
  try {
    return await conn.sendMessage(chat, { audio: { url }, mimetype: 'audio/mpeg', ptt: false, caption }, { quoted })
  } catch {
    const buffer = await ambilBuffer(url, MAKS_AUDIO)
    return conn.sendMessage(chat, { audio: buffer, mimetype: 'audio/mpeg', ptt: false, caption }, { quoted })
  }
}

async function kirimVideo(conn, chat, url, caption, quoted) {
  try {
    return await conn.sendMessage(chat, { video: { url }, caption, mimetype: 'video/mp4' }, { quoted })
  } catch {
    const buffer = await ambilBuffer(url, MAKS_VIDEO)
    return conn.sendMessage(chat, { video: buffer, caption, mimetype: 'video/mp4' }, { quoted })
  }
}

async function kirimGambar(conn, chat, url, caption, quoted) {
  try {
    return await conn.sendMessage(chat, { image: { url }, caption }, { quoted })
  } catch {
    const buffer = await ambilBuffer(url, MAKS_GAMBAR)
    return conn.sendMessage(chat, { image: buffer, caption }, { quoted })
  }
}

async function kirimBerkas(conn, chat, url, quoted) {
  const nama = namaBerkas(url)
  const header = { document: { url }, fileName: nama, mimetype: tebakMimetype(url) }
  try {
    return await conn.sendMessage(chat, header, { quoted })
  } catch {
    const buffer = await ambilBuffer(url, MAKS_BERKAS)
    return conn.sendMessage(chat, { document: buffer, fileName: nama, mimetype: tebakMimetype(url) }, { quoted })
  }
}

function daftarTeks(hasil) {
  const baris = []
  if (hasil.judul) baris.push(`*${hasil.judul}*`)
  baris.push(`Rute: ${hasil.platform}.${hasil.method}`)
  const sisaTautan = hasil.unduhan.filter((d) => d.url).slice(0, 4)
  if (sisaTautan.length) {
    baris.push('')
    sisaTautan.forEach((d) => baris.push(`• ${[d.type, d.quality].filter(Boolean).join(' · ')}\n  ${d.url}`))
  }
  return baris.join('\n')
}

/** TikTok: kalau rute awal tak memberi MP3, coba sumber lain khusus audio. */
async function tambahAudioTiktok(url, hasil, kelompok) {
  if (kelompok.audio.length || hasil.platform !== 'tiktok') return
  try {
    const r = await bundleScrapr.tiktok.tiktokio(url).catch(() => null)
    const mp3 = (r?.result?.downloads || []).find((d) => String(d.type).toLowerCase() === 'audio')
    if (mp3?.url) kelompok.audio.push({ url: mp3.url, type: 'audio', quality: 'MP3' })
  } catch { /* tetap kirim video walau audio gagal */ }
}

const handler = async (m, { conn, args, usedPrefix, command }) => {
  const teks = args.join(' ').trim()
  if (!teks) {
    return m.reply([
      `Gunakan: ${usedPrefix}${command} <link>`,
      '',
      'Contoh:',
      `${usedPrefix}${command} https://www.tiktok.com/@user/video/123  → video + MP3`,
      `${usedPrefix}${command} https://www.mediafire.com/file/xxxx/file.zip  → file langsung`,
      `${usedPrefix}unshorten https://aka.ms/xxxx`,
    ].join('\n'))
  }
  if (!/^https?:\/\//i.test(teks)) return m.reply('Link harus diawali https://')

  if (command.toLowerCase() === 'unshorten') {
    await m.reply('⏳ Membuka link…')
    try {
      const tujuan = await unshortenUrl(teks)
      if (!tujuan) throw new Error('link tujuan tidak ditemukan')
      return m.reply(`✅ *Link asli:*\n${tujuan}`)
    } catch (error) {
      console.warn('[scrapr]', error?.message || error)
      return m.reply(`❌ Gagal: ${error?.message || 'link tidak didukung.'}`)
    }
  }

  await m.reply('⏳ Mengambil media…')
  try {
    const hasil = await scraprUrl(teks)
    const kelompok = klasifikasiMedia(hasil)
    await tambahAudioTiktok(teks, hasil, kelompok)

    const total = kelompok.gambar.length + kelompok.video.length + kelompok.audio.length + kelompok.berkas.length
    if (!total) {
      const tautan = kelompok.tautan[0]?.url || hasil.langsung
      if (!tautan) throw new Error('tidak ada media/link yang ditemukan')
      return m.reply(`✅ *SCRAPR*\n\n${daftarTeks(hasil)}\n\n🔗 ${tautan}`)
    }

    const kutipan = m.raw || m
    let captionPertama = `✅ *SCRAPR* — ${hasil.platform}.${hasil.method}\n\n${hasil.judul ? `*${hasil.judul}*` : ''}`.trim()

    let pertama = true
    const cap = () => { const c = captionPertama; pertama = false; return c }

    for (const g of kelompok.gambar.slice(0, 6)) await kirimGambar(conn, m.chat, g.url, pertama ? cap() : '', kutipan)
    for (const v of kelompok.video.slice(0, 4)) await kirimVideo(conn, m.chat, v.url, pertama ? cap() : '', kutipan)
    for (const a of kelompok.audio.slice(0, 4)) await kirimAudio(conn, m.chat, a.url, pertama ? cap() : '', kutipan)
    for (const b of kelompok.berkas.slice(0, 6)) {
      await kirimBerkas(conn, m.chat, b.url, kutipan)
      if (pertama) pertama = false
    }

    if (kelompok.tautan.length) {
      await m.reply(`🔗 Tautan lain:\n${kelompok.tautan.slice(0, 5).map((t) => t.url).join('\n')}`)
    }
  } catch (error) {
    console.warn('[scrapr]', error?.message || error)
    await m.reply(`❌ Gagal: ${error?.message || 'link tidak didukung.'}`)
  }
}

handler.command = /^(scrapr|unshorten)$/i
handler.help = ['scrapr <link>', 'unshorten <link>']
handler.tags = ['downloader', 'tools']
handler.category = 'downloader'
handler.description = 'Ambil & KIRIM LANGSUNG media 40+ platform: audio→audio, video TikTok→video+MP3, zip/7z→dokumen.'
handler.limit = false

export default handler
