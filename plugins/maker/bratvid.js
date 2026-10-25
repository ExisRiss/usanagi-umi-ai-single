import { fetchRinMedia, describe } from '../../lib/rin-api.js'

let handler = async (m, { conn, args }) => {
  const text = args.join(' ') || m.quoted?.text

  if (!text) {
    return m.reply(
      `✨ Masukin teks dong!\nContoh: .bratvid halo dunia`
    )
  }

  try {
    await m.react('⏳').catch(() => {})
    const { buffer, type } = await fetchRinMedia('/maker/bratvid', text, { timeoutMs: 90000 })
    if (!buffer.length) throw new Error('API mengembalikan data kosong.')
    // GIF dikirim sebagai stiker animasi; kalau API berubah jadi MP4, kirim video.
    if (/video\/(mp4|webm)/.test(type)) {
      await conn.sendMessage(m.chat, { video: buffer, mimetype: type.split(';')[0], gifPlayback: true }, { quoted: m })
      await m.react('✅').catch(() => {})
      return
    }

    await conn.sendSticker(
      m.chat,
      buffer,
      m,
      {
        packname: global.stickpack || global.namebot,
        packpublish: global.stickauth || global.author
      }
    )
    await m.react('✅').catch(() => {})
  } catch (e) {
    console.error('[BRATVID]', describe(e))
    await m.react('❌').catch(() => {})
    m.reply(`❌ Gagal membuat bratvid.\n${describe(e)}`)
  }
}

handler.help = ['bratvid <teks>']
handler.tags = ['sticker']
handler.command = /^bratvid$/i
handler.limit = true

export default handler