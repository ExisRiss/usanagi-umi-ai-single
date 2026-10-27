/* By AlzRiss - Usanagi Umi AI
 *
 * `.tovn` — ubah audio/video pendek yang dibalas menjadi voice note (PTT).
 *
 * Fitur OURIN yang belum ada di Umi. Bedanya dengan `.vn` milik Umi:
 *  - `.vn` membuat voice note dari teks (text to speech),
 *  - `.tovn` mengubah media yang sudah ada menjadi voice note.
 *
 * Cara kerja: media yang dibalas diunduh apa adanya, lalu dikirim ulang
 * sebagai PTT (push to talk) memakai mimetype audio. Tidak ada konversi
 * ffmpeg, jadi tidak butuh binary tambahan di server. Kalau media bukan audio
 * (misalnya video), WhatsApp menerimanya sebagai voice note hanya bila
 * codec-nya sudah opus/aac — karena itu ada peringatan yang jelas di caption
 * gagal, bukan diam-diam mengirim berkas rusak.
 */

function ukuran(n) {
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

async function handler(m, { conn }) {
  const sumber = m.quoted ? m.quoted : null
  if (!sumber) return m.reply('〄 Balas audio atau voice note yang mau dijadikan voice note.')

  const jenis = String(sumber.mtype || '').toLowerCase()
  const audioBiasa = /audio/.test(jenis)
  const video = /video/.test(jenis)
  if (!audioBiasa && !video) {
    return m.reply('〄 Yang dibalas bukan audio/video. Balas file audio (mp3, m4a, ogg) atau video pendek.')
  }

  await m.react('🕐')
  let buffer
  try {
    buffer = await sumber.download()
  } catch (e) {
    await m.react('❌')
    return m.reply(`〄 Gagal mengunduh media: ${String(e?.message || e).slice(0, 140)}`)
  }

  if (!buffer || !buffer.length) {
    await m.react('❌')
    return m.reply('〄 Media kosong, coba kirim ulang.')
  }
  if (buffer.length > 16 * 1024 * 1024) {
    await m.react('❌')
    return m.reply(`〄 Terlalu besar (${ukuran(buffer.length)}). Batas voice note 16 MB.`)
  }

  const mimeAsal = String(sumber.msg?.mimetype || sumber.mimetype || 'audio/mpeg')
  const mimetype = audioBiasa ? (mimeAsal.includes('ogg') ? 'audio/ogg; codecs=opus' : 'audio/mpeg') : 'audio/mp4'

  try {
    await conn.sendMessage(m.chat, { audio: buffer, mimetype, ptt: true }, { quoted: m })
    await m.react('✅')
  } catch (e) {
    await m.react('❌')
    return m.reply(
      `〄 Gagal mengirim voice note: ${String(e?.message || e).slice(0, 140)}\n\n` +
      `〄 Kalau asalnya video, codec-nya mungkin tidak didukung WhatsApp untuk PTT. ` +
      `Coba kirim sebagai audio biasa dulu, lalu balas lagi dengan .tovn.`
    )
  }
}

handler.help = ['tovn']
handler.tags = ['tools']
handler.command = /^(tovn|jadivn|tovoice)$/i
handler.limit = false

export default handler
