/* By AlzRiss - Usanagi Umi AI
 *
 * .ytmp4 / .ytv — unduh video YouTube jadi MP4.
 *
 * Perbaikan Task110:
 *  1. Dulu batas 80 MB dipakai dengan kualitas tetap 720p, jadi video panjang
 *     gagal TOTAL: "yt-dlp: Sign in to confirm…", "api-faa: 622.5 MB melebihi
 *     batas 80 MB", "savetube: 403.1 MB…" — pengguna tidak dapat apa pun.
 *     Sekarang kualitas diturunkan bertingkat (720 → 480 → 360 → 240) sampai
 *     videonya muat di bawah batas.
 *  2. Kalau memang tidak ada yang muat, jawabannya jelas: sarankan audio saja
 *     (.ytmp3) atau video yang lebih pendek — bukan stack panjang.
 *  3. Kegagalan unduhan tidak lagi dilempar ke pelapor error.
 */

import fs from 'fs-extra'
import { downloadYoutube, isYoutubeUrl } from '../../lib/youtube-media.js'

// Dibatasi 80 MB: WhatsApp menolak media besar dan disk container pernah penuh
// (ENOSPC) saat unduhan 200 MB menumpuk di /tmp.
const MAX_VIDEO = 80 * 1024 * 1024

async function react(conn, m, emoji) {
  try {
    await conn.sendMessage(m.chat, { react: { text: emoji, key: m.raw.key } })
  } catch {}
}

function labelKualitas(provider) {
  const match = /^yt-dlp-(\d+)p$/.exec(String(provider || ''))
  return match ? `${match[1]}p` : ''
}

const handler = async (m, { conn, usedPrefix }) => {
  const input = m.text?.trim()

  if (!input) {
    m.limit?.fail()
    return conn.sendMessage(m.chat, {
      text: `❌ Masukkan link YouTube!\n\nContoh:\n${usedPrefix}ytmp4 https://youtu.be/xxxxx`
    }, { quoted: m.raw })
  }

  if (!isYoutubeUrl(input)) {
    m.limit?.fail()
    return conn.sendMessage(m.chat, { text: '❌ Link tersebut bukan link YouTube.' }, { quoted: m.raw })
  }

  void react(conn, m, '⏳')

  let media = null
  try {
    const hasil = await downloadYoutube(input, { type: 'video', maxBytes: MAX_VIDEO, prefix: 'usanagi-ytmp4' })
    media = hasil.file
    const kualitas = labelKualitas(hasil.provider)

    await conn.sendMessage(m.chat, {
      video: { url: media },
      mimetype: 'video/mp4',
      fileName: 'youtube.mp4',
      ...(kualitas ? { caption: `🎬 YouTube ${kualitas} · ${(hasil.bytes / 1048576).toFixed(1)} MB` } : {})
    }, { quoted: m.raw })

    await react(conn, m, '✅')
    m.limit?.success()
  } catch (error) {
    m.limit?.fail()
    await react(conn, m, '❌')

    const kode = String(error?.code || '')
    const ukuran = /melebihi batas/i.test(String(error?.message || ''))
    const alasan = kode === 'UMI_DISK_FULL'
      ? String(error.message)
      : ukuran
        ? `Videonya terlalu besar untuk WhatsApp (batas ${(MAX_VIDEO / 1048576).toFixed(0)} MB), bahkan setelah diturunkan sampai 240p.`
        : 'Semua sumber video sedang tidak bisa dipakai (yt-dlp ditolak YouTube, sumber cadangan ikut gagal).'

    await conn.sendMessage(m.chat, {
      text:
        `❌ Gagal mengunduh video YouTube.\n\n${alasan}\n\n` +
        `Pilihan lain:\n` +
        `• ${usedPrefix}ytmp3 <link> — ambil audionya saja (jauh lebih kecil)\n` +
        `• pakai video yang lebih pendek\n\n` +
        `_Owner bisa memasang data/cookies.txt di server supaya yt-dlp tidak diblokir YouTube._`
    }, { quoted: m.raw })
    // Jangan throw: bukan bug bot, jadi tidak perlu masuk laporan error.
    console.warn('[USANAGI YTMP4]', error?.message || error)
  } finally {
    if (media) await fs.remove(media).catch(() => {})
  }
}

handler.command = /^(ytmp4|ytv|ytvideo|ytmp4dl)$/i
handler.help = ['ytmp4', 'ytv']
handler.tags = ['download']
handler.description = 'Download video YouTube MP4'
handler.limitCommit = 'manual'

export default handler
