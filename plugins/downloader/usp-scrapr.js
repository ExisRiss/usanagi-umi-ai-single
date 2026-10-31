/* By AlzRiss - Usanagi Umi AI
 *
 * .scrapr — extractor media universal (Task181) memakai pustaka
 * coflyn/scrapr (github.com/coflyn/scrapr, MIT) lewat jembatan lib/scrapr.js.
 *
 * Ketik .scrapr <link> untuk link TikTok/Instagram/Twitter/YouTube/Spotify/
 * Facebook/Pinterest/SoundCloud/Reddit/TeraBox/MediaFire/Pixeldrain/Catbox/
 * GDrive/safelink/sub2unlock dll. Rute otomatis per domain + fallback antar
 * scraper. Hasil: judul + daftar unduhan (atau link tujuan untuk resolver).
 */

import { scraprUrl, unshortenUrl } from '../../lib/scrapr.js'

function daftarTeks(hasil) {
  const baris = []
  if (hasil.judul) baris.push(`*${hasil.judul}*`)
  baris.push(`Rute: ${hasil.platform}.${hasil.method}`)
  if (hasil.unduhan.length) {
    baris.push('')
    hasil.unduhan.slice(0, 6).forEach((d, i) => {
      const label = [d.type, d.quality].filter(Boolean).join(' · ') || `hasil ${i + 1}`
      baris.push(`• ${label}`)
      baris.push(`  ${d.url}`)
    })
    if (hasil.unduhan.length > 6) baris.push(`… +${hasil.unduhan.length - 6} tautan lain`)
  } else if (hasil.langsung) {
    baris.push('')
    baris.push(`🔗 ${hasil.langsung}`)
  }
  return baris.join('\n')
}

const handler = async (m, { args, usedPrefix, command }) => {
  const teks = args.join(' ').trim()
  if (!teks) {
    return m.reply([
      `Gunakan: ${usedPrefix}${command} <link>`,
      '',
      'Contoh:',
      `${usedPrefix}${command} https://www.tiktok.com/@user/video/123`,
      `${usedPrefix}${command} https://www.mediafire.com/file/xxxx/file.zip`,
      `${usedPrefix}unshorten https://aka.ms/xxxx`,
    ].join('\n'))
  }
  if (!/^https?:\/\//i.test(teks)) return m.reply('Link harus diawali https://')

  const kirim = command.toLowerCase() === 'unshorten' ? 'unshorten' : 'scrapr'
  await m.reply('⏳ Mengambil data…')

  try {
    if (kirim === 'unshorten') {
      const tujuan = await unshortenUrl(teks)
      if (!tujuan) throw new Error('link tujuan tidak ditemukan')
      return m.reply(`✅ *Link asli:*\n${tujuan}`)
    }
    const hasil = await scraprUrl(teks)
    const pesan = `✅ *SCRAPR*\n\n${daftarTeks(hasil)}`
    if (hasil.thumb && /^https?:\/\//.test(hasil.thumb)) {
      try {
        await m.reply({ image: { url: hasil.thumb }, caption: pesan })
        return
      } catch { /* thumbnail gagal: kirim teks saja */ }
    }
    await m.reply(pesan)
  } catch (error) {
    console.warn('[scrapr]', error?.message || error)
    await m.reply(`❌ Gagal: ${error?.message || 'link tidak didukung.'}`)
  }
}

handler.command = /^(scrapr|unshorten)$/i
handler.help = ['scrapr <link>', 'unshorten <link>']
handler.tags = ['downloader', 'tools']
handler.category = 'downloader'
handler.description = 'Ambil link unduhan langsung dari 40+ platform (TikTok, IG, YT, MediaFire, safelink, dll) memakai coflyn/scrapr.'
handler.limit = false

export default handler
