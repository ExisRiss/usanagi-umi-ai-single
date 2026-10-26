/* By AlzRiss - Usanagi Umi AI
 *
 * .stalkch <link saluran> — info saluran dari halaman publik WhatsApp
 * (dipakai kalau bot bukan anggota saluran itu, jadi metadata resmi ditolak).
 * Diadaptasi dari plugin "stalkch" bot VanXone Multi Device (ide: xDonzCode).
 * Hanya membuka alamat whatsapp.com/channel — alamat lain tidak pernah di-fetch.
 */
import * as cheerio from 'cheerio'
import { parseRef } from '../../lib/channel-tools.js'

const MAKS_BYTES = 3 * 1024 * 1024

async function ambil(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
    signal: AbortSignal.timeout(20000),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const panjang = Number(res.headers.get('content-length') || 0)
  if (panjang > MAKS_BYTES) throw new Error('halaman terlalu besar')
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > MAKS_BYTES) throw new Error('halaman terlalu besar')
  return { buffer, contentType: String(res.headers.get('content-type') || '') }
}

function bacaHalaman(html) {
  const $ = cheerio.load(html)
  const og = properti => $(`meta[property="og:${properti}"]`).attr('content') || ''
  let nama = og('title') || $('title').text().trim()
  const mentah = og('description') || $('meta[name="description"]').attr('content') || ''
  let tipe = ''
  let pengikut = ''
  let deskripsi = ''

  const kepala = mentah.match(/^(Channel|Community|Group)\s*[•·]\s*([\d.,]+\s?[KMB]?)\s*(followers?|pengikut)/i)
  if (kepala) {
    tipe = kepala[1]
    pengikut = kepala[2]
    deskripsi = mentah.slice(kepala[0].length).replace(/^[\s•·\-–—]+/, '')
  } else {
    const angka = mentah.match(/([\d.,]+\s?[KMB]?)\s*(followers?|pengikut)/i)
    if (angka) pengikut = angka[1]
    deskripsi = mentah.replace(/^(Channel|Community|Group)\s*[•·][^•·]*[•·]?\s*/i, '')
  }
  deskripsi = deskripsi.replace(/\s+/g, ' ').trim()
  if (/^whatsapp\b/i.test(nama) && deskripsi) nama = $('h1').first().text().trim() || nama
  const terverifikasi = /verified_badge|"is_verified":true|"verified":true/.test(html) || $('[aria-label*="erified" i]').length > 0
  return { name: nama.trim(), desc: deskripsi, followers: pengikut, type: tipe, verified: terverifikasi, image: og('image') }
}

const handler = async (m, { text, usedPrefix, command }) => {
  const ref = parseRef(String(text || '').trim().split(/\s+/)[0])
  if (!ref || ref.type !== 'invite') {
    return m.reply(`Format: ${usedPrefix}${command} <link saluran>\nContoh: ${usedPrefix}${command} https://whatsapp.com/channel/0029VbDT59vC1Fu4nO1w6t2d`)
  }
  const url = `https://whatsapp.com/channel/${ref.code}`

  let info
  try {
    const { buffer } = await ambil(url)
    info = bacaHalaman(buffer.toString('utf8'))
  } catch (error) {
    console.log('[STALKCH]', String(error?.message || error).slice(0, 120))
    return m.reply('❌ Gagal membaca halaman saluran. Pastikan link benar dan saluran masih ada.')
  }
  if (!info.name) return m.reply('❌ Saluran tidak ditemukan atau halamannya tidak memuat data.')

  const teks =
    `📡 *INFO SALURAN (halaman publik)*\n\n` +
    `▬ Nama : ${info.name}\n` +
    `▬ Pengikut : ${info.followers || '-'}\n` +
    `▬ Tipe : ${info.type || 'Channel'}\n` +
    `▬ Status : ${info.verified ? '✅ Terverifikasi' : 'Belum terverifikasi'}\n` +
    `▬ Link : ${url}` +
    (info.desc ? `\n\n📝 *Deskripsi*\n${info.desc.slice(0, 600)}` : '')

  // Foto saluran (kalau ada) dikirim sebagai gambar dengan caption yang sama.
  if (info.image && /^https:\/\//i.test(info.image)) {
    try {
      const { buffer, contentType } = await ambil(info.image)
      if (/^image\//i.test(contentType)) {
        return conn.sendMessage(m.chat, { image: buffer, caption: teks }, { quoted: m.raw })
      }
    } catch {}
  }
  return m.reply(teks)
}

handler.help = ['stalkch <link saluran>']
handler.tags = ['tools']
handler.command = ['stalkch', 'stalkchannel', 'chstalk']
handler.description = 'Info saluran WhatsApp dari halaman publiknya (untuk saluran yang bukan milik bot)'

export default handler
