/* By AlzRiss - Usanagi Umi AI
 *
 * `.cekyt` — periksa sumber YouTube dari SERVER INI, bukan dari laptop.
 *
 * Kenapa perlu: pada 27 Okt 2026 hampir semua API YouTube mati, dan yang hidup
 * di satu jaringan belum tentu hidup di jaringan server. Perintah ini mencoba
 * setiap sumber (OURIN: izuka & azbry · Kilua: Piped) lalu mengunduh 2 KB
 * pertama untuk memastikan isinya benar-benar audio/video, bukan halaman HTML.
 *
 * Hasilnya jujur: kalau semua ❌, berarti `.ytplay`/`.ytmp3` memang tidak bisa
 * memutar apa pun dari server ini saat itu — bukan bug plugin.
 */

import {
  ambilIdYoutube,
  kandidatAudio,
  kandidatVideo,
  periksaMedia,
} from '../../lib/yt-sumber.js'

const UJI_VIDEO = 'dQw4w9WgXcQ'

function baris(ok, nama, keterangan) {
  return `${ok ? '✅' : '❌'} ${nama.padEnd(22)} ${keterangan}`
}

async function handler(m, { text }) {
  const id = ambilIdYoutube(text) || UJI_VIDEO
  await m.react('🔎')

  const hasil = []
  const mulai = Date.now()

  let audio = []
  let video = []
  try {
    audio = await kandidatAudio(id)
  } catch (e) {
    hasil.push(baris(false, 'izuka/azbry', String(e?.message || e).slice(0, 80)))
  }
  try {
    video = await kandidatVideo(id)
  } catch (e) {
    hasil.push(baris(false, 'piped/ytmp4', String(e?.message || e).slice(0, 80)))
  }

  const cek = async (daftar, jenis, fallbackNama) => {
    if (!daftar.length) {
      hasil.push(baris(false, fallbackNama, 'tidak memberi URL'))
      return
    }
    for (const kandidat of daftar) {
      const hasilCek = await periksaMedia(kandidat.url, jenis)
      hasil.push(
        baris(hasilCek.ok, kandidat.sumber,
          hasilCek.ok ? `${hasilCek.tipe} ${kandidat.kualitas || ''}`.trim() : hasilCek.alasan || 'gagal')
      )
    }
  }

  hasil.push('— *AUDIO (untuk .ytmp3)* —')
  await cek(audio, 'audio', 'sumber audio')
  hasil.push('— *VIDEO (untuk .ytplay/.ytmp4)* —')
  await cek(video, 'video', 'sumber video')

  const hidup = hasil.filter(x => x.startsWith('✅')).length
  const durasi = ((Date.now() - mulai) / 1000).toFixed(1)

  await m.react(hidup ? '✅' : '❌')
  return m.reply(
    `〄 *CEK SUMBER YOUTUBE*\n\n` +
    `〄 Video uji: https://youtu.be/${id}\n` +
    `〄 Diperiksa dari: server bot ini\n\n` +
    `${hasil.join('\n')}\n\n` +
    `〄 Sumber hidup: *${hidup}*\n` +
    `〄 Waktu periksa: ${durasi} s\n\n` +
    (hidup
      ? `〄 Minimal satu sumber jalan, jadi .ytmp3/.ytplay bisa dipakai.`
      : `〄 Semua sumber gagal. Ini masalah jaringan/server, bukan plugin. Coba lagi nanti atau pakai link lain.`)
  )
}

handler.help = ['cekyt [link/ID]']
handler.tags = ['owner']
handler.command = /^(cekyt|ytstatus)$/i
handler.owner = true
handler.limit = false
handler.cooldown = 30

export default handler
