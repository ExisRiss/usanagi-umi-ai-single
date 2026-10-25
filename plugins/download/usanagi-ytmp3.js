/* By AlzRiss - Usanagi Umi AI
 *
 * .ytmp3 / .yta — unduh audio YouTube jadi MP3.
 *
 * Perbaikan Task110:
 *  1. Dulu plugin memanggil API `gateway.gencipta.com` dengan kunci bawaan
 *     placeholder. Kuncinya tidak valid, jadi setiap permintaan berakhir
 *     `API HTTP 401 - {"error":"Unauthorized: Invalid token"}` dan error itu
 *     dilempar mentah ke pelapor error.
 *  2. Sekarang seluruh sumber (yt-dlp → SaveTube → api-faa) ditangani
 *     `lib/youtube-media.js`, jadi kalau satu gagal yang lain tetap dicoba.
 *  3. Kegagalan dijawab dengan pesan yang bisa dibaca pengguna, tanpa stack.
 */

import fs from 'fs-extra'
import { downloadYoutube, isYoutubeUrl } from '../../lib/youtube-media.js'

const MAX_AUDIO = 100 * 1024 * 1024

async function react(conn, m, emoji) {
  try {
    await conn.sendMessage(m.chat, { react: { text: emoji, key: m.raw.key } })
  } catch {}
}

function sanitizeFilename(name) {
  return String(name || 'youtube')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'youtube'
}

const handler = async (m, { conn, usedPrefix }) => {
  const input = m.text?.trim()

  if (!input) {
    m.limit?.fail()
    return conn.sendMessage(m.chat, {
      text: `❌ Masukkan link YouTube!\n\nContoh:\n${usedPrefix}ytmp3 https://youtu.be/xxxxx`
    }, { quoted: m.raw })
  }

  if (!isYoutubeUrl(input)) {
    m.limit?.fail()
    return conn.sendMessage(m.chat, { text: '❌ Link tersebut bukan link YouTube.' }, { quoted: m.raw })
  }

  void react(conn, m, '⏳')

  let media = null
  try {
    media = await downloadYoutube(input, { type: 'audio', maxBytes: MAX_AUDIO, prefix: 'usanagi-ytmp3' })

    await conn.sendMessage(m.chat, {
      audio: { url: media.file },
      mimetype: 'audio/mpeg',
      fileName: `${sanitizeFilename(media.title)}.mp3`,
      ptt: false
    }, { quoted: m.raw })

    await react(conn, m, '✅')
    m.limit?.success()
  } catch (error) {
    m.limit?.fail()
    await react(conn, m, '❌')
    const kode = String(error?.code || '')
    const alasan = kode === 'UMI_DISK_FULL'
      ? String(error.message)
      : 'Semua sumber audio sedang tidak bisa dipakai (yt-dlp ditolak YouTube, sumber cadangan ikut gagal).'
    await conn.sendMessage(m.chat, {
      text: `❌ Gagal mengunduh audio YouTube.\n\n${alasan}\n\nCoba lagi nanti atau pakai link lain.`
    }, { quoted: m.raw })
    // Jangan throw: kegagalan unduhan adalah kejadian normal, bukan bug bot.
    console.warn('[USANAGI YTMP3]', error?.message || error)
  } finally {
    if (media?.file) await fs.remove(media.file).catch(() => {})
  }
}

handler.command = /^(ytmp3|yta|ytmusic|ytmp3dl)$/i
handler.help = ['ytmp3', 'yta']
handler.tags = ['download']
handler.description = 'Download audio YouTube MP3'
handler.limitCommit = 'manual'

export default handler
