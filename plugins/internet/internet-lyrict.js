import { cariLirik } from '../../lib/lyrics-source.js'

let handler = async (m, { text }) => {
  if (!text) throw 'Masukkan judul lagu!\n\nContoh: .lyrics bunga maaf'
  try {
    const song = await cariLirik(text)
    if (!song) return m.reply('❌ Lirik tidak ditemukan. Coba judul atau artis yang lebih spesifik ya.')

    let hasil = `🎵 *Lyrics Finder*

*Judul:* ${song.judul || '-'}
*Artis:* ${song.artis || '-'}
*Album:* ${song.album || '-'}
*Sumber:* ${song.sumber}

📑 *Lirik:*
${String(song.lirik || '').slice(0, 3500)}`

    m.reply(hasil)
  } catch (e) {
    m.reply(`❌ Error: ${e.message}`)
  }
}

handler.help = ['lyrics <judul>']
handler.tags = ['internet']
handler.command = /^(lyrics|lirik)$/i
handler.limit = false

export default handler
