/* By AlzRiss - Usanagi Umi AI */

import fs from 'fs-extra'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { ytDlpDownloadBest, getFfmpegBinPath } from '../../lib/awang-ytdlp.js'
import { sendLocalMediaFast, sendRemoteMediaFast } from '../../lib/awang-media-transfer.js'
import { sendInteractive } from '../../lib/awang-tombol.js'
import { scraprUrl, klasifikasiMedia } from '../../lib/scrapr.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
const MAX_VIDEO = 95 * 1024 * 1024

const API_URL = 'https://gateway.gencipta.com/api/downloader/tiktok'
const API_KEY = process.env.USANAGI_TIKTOK_KEY || 'YOUR_GENCIPTA_API_KEY'

async function fetchWithTimeout(url, options = {}) {
  const { timeoutMs = 20000, ...rest } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...rest, signal: controller.signal })
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('Permintaan timeout, coba lagi.')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

function tempBase() {
  return path.join(os.tmpdir(), `usanagi-tt-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`)
}

async function writeTemp(buffer, ext = 'mp4') {
  const file = `${tempBase()}.${ext}`
  await fs.writeFile(file, buffer)
  return file
}

async function ffmpegBin() {
  const installerPath = await getFfmpegBinPath()
  return installerPath || 'ffmpeg'
}

async function ytDlpDownload(url, max) {
  const file = await ytDlpDownloadBest(url, max, { prefix: 'usanagi-tt' })
  return { file, title: null }
}

function jsonFromScript(html, id) {
  const re = new RegExp(`<script[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i')
  const match = html.match(re)
  if (!match) return null

  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

function findVideoItem(json) {
  const modern = json?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct
  if (modern) return modern

  const legacy = json?.ItemModule
  if (legacy) {
    const first = Object.values(legacy)[0]
    if (first) return first
  }

  return null
}

async function directScrape(inputUrl) {
  const r = await fetchWithTimeout(inputUrl, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeoutMs: 9000,
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)

  const html = await r.text()
  const json = jsonFromScript(html, '__UNIVERSAL_DATA_FOR_REHYDRATION__') || jsonFromScript(html, 'SIGI_STATE')
  if (!json) throw new Error('Halaman TikTok tidak terbaca.')

  const item = findVideoItem(json)
  if (!item) throw new Error('Data video TikTok tidak ditemukan.')

  const playUrl = item?.video?.playAddr
    || item?.video?.downloadAddr
    || item?.video?.bitrateInfo?.[0]?.PlayAddr?.UrlList?.[0]

  if (!playUrl) throw new Error('URL video TikTok tidak ditemukan.')

  return { url: playUrl, title: item?.desc || null }
}

async function tikwmDownload(inputUrl) {
  const r = await fetchWithTimeout(`https://www.tikwm.com/api/?url=${encodeURIComponent(inputUrl)}&hd=1`, {
    headers: { 'User-Agent': UA },
    timeoutMs: 8000,
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)

  const json = await r.json()
  if (json?.code !== 0 || !json?.data) throw new Error('tikwm tidak mengembalikan data.')

  const playUrl = json.data.hdplay || json.data.play
  if (!playUrl) throw new Error('URL video dari tikwm tidak ditemukan.')

  const full = playUrl.startsWith('http') ? playUrl : `https://www.tikwm.com${playUrl}`
  return { url: full, title: json.data.title || null }
}

async function gencipta(inputUrl) {
  const endpoint = `${API_URL}?url=${encodeURIComponent(inputUrl)}`
  const response = await fetchWithTimeout(endpoint, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
      'User-Agent': UA,
    },
    timeoutMs: 8000,
  })

  if (!response.ok) throw new Error(`API HTTP ${response.status}`)
  const result = await response.json()

  if (!result || result.status !== true) throw new Error('API tidak mengembalikan data TikTok.')

  const data = Array.isArray(result.data) ? result.data : []
  const hdVideo = data.find(item => item?.type === 'nowatermark_hd' && item?.url)
  const normalVideo = data.find(item => item?.type === 'nowatermark' && item?.url)
  const videoUrl = hdVideo?.url || normalVideo?.url

  if (!videoUrl) throw new Error('Video No-Watermark tidak ditemukan.')

  return { url: videoUrl, title: result.title || null }
}

async function urlToFile(resolver, inputUrl, max) {
  const { url, title } = await resolver(inputUrl)

  const r = await fetchWithTimeout(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      Accept: 'video/mp4,video/*,*/*',
      Referer: 'https://www.tiktok.com/',
    },
    timeoutMs: 45000,
  })
  if (!r.ok) throw new Error(`Video HTTP ${r.status}`)

  const size = Number(r.headers.get('content-length') || 0)
  if (size && size > max) throw new Error('Ukuran video terlalu besar.')

  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length > max) throw new Error('Ukuran video terlalu besar.')

  const file = await writeTemp(buf)
  return { file, title }
}

export async function resolveTikTokUrl(inputUrl) {
  try {
    return await Promise.any([
      gencipta(inputUrl),
      tikwmDownload(inputUrl),
      directScrape(inputUrl),
    ])
  } catch {
    throw new Error('Sumber TikTok tidak tersedia.')
  }
}

async function resolveTikTokFile(inputUrl, max) {
  try {
    const resolved = await resolveTikTokUrl(inputUrl)
    return await urlToFile(() => Promise.resolve(resolved), inputUrl, max)
  } catch {}

  return ytDlpDownload(inputUrl, max)
}

async function extractAudioFromUrl(inputUrl) {
  const bin = await ffmpegBin()
  const file = `${tempBase()}.mp3`

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(bin, [
      '-hide_banner', '-loglevel', 'error',
      '-user_agent', UA,
      '-referer', 'https://www.tiktok.com/',
      '-i', inputUrl,
      '-vn',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-y',
      file,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })

    let errorText = ''
    const timer = setTimeout(() => {
      ffmpeg.kill('SIGKILL')
      fs.remove(file).catch(() => {})
      reject(new Error('FFmpeg timeout.'))
    }, 120000)

    ffmpeg.stderr.on('data', chunk => { errorText += chunk.toString() })
    ffmpeg.on('error', error => { clearTimeout(timer); fs.remove(file).catch(() => {}); reject(error) })
    ffmpeg.on('close', async code => {
      clearTimeout(timer)
      if (code !== 0) {
        await fs.remove(file).catch(() => {})
        reject(new Error(errorText.slice(-300) || `FFmpeg exit code ${code}`))
        return
      }
      if (!(await fs.pathExists(file))) {
        reject(new Error('Audio tidak tersedia.'))
        return
      }
      resolve(file)
    })
  })
}

async function react(conn, m, emoji) {
  try {
    await conn.sendMessage(m.chat, { react: { text: emoji, key: m.raw.key } })
  } catch {}
}

function sanitizeFilename(name) {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'tiktok'
}

/* ── Task183: dukungan foto post + pilihan tombol audio ── */

/** Foto post TikTok (slideshow) — lewat scrapr; null kalau bukan foto. */
async function fotoTikTok(inputUrl) {
  try {
    const hasil = await scraprUrl(inputUrl)
    if (hasil.platform !== 'tiktok') return null
    const k = klasifikasiMedia(hasil)
    if (k.gambar.length && !k.video.length) return { gambar: k.gambar, judul: hasil.judul || 'Foto TikTok' }
    return null
  } catch { return null }
}

/** Audio MP3 dari URL video TikTok: ffmpeg dulu, scrapr cadangan. */
async function audioMp3(inputUrl, resolvedUrl) {
  if (resolvedUrl) {
    const file = await extractAudioFromUrl(resolvedUrl).catch(() => '')
    if (file) return { file, url: null }
  }
  try {
    const k = klasifikasiMedia(await scraprUrl(inputUrl))
    const mp3 = k.audio[0]
    if (mp3?.url) return { file: null, url: mp3.url }
  } catch { /* gagal */ }
  return null
}

/** Kirim tombol "Unduh audio" (fallback teks biasa). */
async function tawarkanAudio(conn, m, usedPrefix, inputUrl, judul) {
  try {
    await sendInteractive(conn, m.chat, {
      title: '🎵 Audio TikTok',
      subtitle: String(judul || '').slice(0, 60),
      body: 'Mau sekalian unduh audio (MP3) dari hasil ini?',
      footer: 'Usanagi Umi AI',
      buttons: [{ label: '🎵 Unduh audio (MP3)', command: `${usedPrefix}tt-audio ${inputUrl}` }],
    }, { quoted: m.raw })
  } catch {
    await conn.sendMessage(m.chat, {
      text: `🎵 Mau audionya? Ketik:\n${usedPrefix}tt-audio ${inputUrl}`,
    }, { quoted: m.raw }).catch(() => {})
  }
}

function normalizeTikTokInput(value) {
  // WhatsApp messages can contain invisible formatting/spam characters after a
  // shared URL. They are not part of the TikTok URL and make third-party
  // resolvers reject an otherwise valid link.
  const cleaned = String(value || '')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .trim()
  const match = cleaned.match(/https?:\/\/[^\s<>"'`]+/i)
  return (match?.[0] || cleaned).replace(/[),.;!?]+$/g, '')
}

async function sendLocalTikTokVideo(conn, m, file, title) {
  // Upload the already verified local file. This avoids asking WhatsApp to
  // fetch a short-lived TikTok CDN URL itself.
  return sendLocalMediaFast(conn, m, file, {
    type: 'video',
    mimeType: 'video/mp4',
    fileName: `${sanitizeFilename(title)}.mp4`,
    caption: `🎬 ${title}\n\n✅ Video TikTok`,
    maxBytes: MAX_VIDEO,
  })
}

const handler = async (m, { conn, usedPrefix, command }) => {
  const input = normalizeTikTokInput(m.text)
  const modeAudio = /^(tt-audio|ttaudio)$/i.test(String(command || ''))

  if (!input) {
    m.limit?.fail()
    return conn.sendMessage(m.chat, {
      text: `❌ Masukkan link TikTok!\n\nContoh:\n${usedPrefix}tiktok https://vt.tiktok.com/xxxxx`
    }, { quoted: m.raw })
  }

  let parsedUrl
  try {
    parsedUrl = new URL(input)
  } catch {
    m.limit?.fail()
    return conn.sendMessage(m.chat, { text: '❌ URL TikTok tidak valid.' }, { quoted: m.raw })
  }

  const allowedHosts = ['tiktok.com', 'www.tiktok.com', 'vt.tiktok.com', 'vm.tiktok.com', 'm.tiktok.com']
  if (!allowedHosts.includes(parsedUrl.hostname)) {
    m.limit?.fail()
    return conn.sendMessage(m.chat, { text: '❌ Link tersebut bukan link TikTok.' }, { quoted: m.raw })
  }

  void react(conn, m, '⏳')

  /* ── Task183 modeAudio: dipanggil lewat tombol "Unduh audio (MP3)" ── */
  if (modeAudio) {
    try {
      const resolved = await resolveTikTokUrl(input)
      const hasil = await audioMp3(input, resolved?.url || '')
      if (!hasil) throw new Error('audio tidak tersedia')
      if (hasil.file) {
        try {
          await conn.sendMessage(m.chat, {
            audio: { url: hasil.file },
            mimetype: 'audio/mpeg',
            fileName: `${sanitizeFilename(resolved.title || 'tiktok')}.mp3`,
            ptt: false,
            caption: '🎵 Audio dari TikTok',
          }, { quoted: m.raw })
        } finally {
          await fs.remove(hasil.file).catch(() => {})
        }
      } else {
        await conn.sendMessage(m.chat, {
          audio: { url: hasil.url },
          mimetype: 'audio/mpeg',
          ptt: false,
          caption: '🎵 Audio dari TikTok',
        }, { quoted: m.raw })
      }
      await react(conn, m, '🎵')
      return
    } catch (error) {
      console.warn('[tt-audio]', error?.message || error)
      await react(conn, m, '❌')
      return m.reply('❌ Gagal mengambil audio MP3 dari link itu. Coba lagi atau pakai link lain.')
    }
  }

  /* ── Task183 foto post: kirim sebagai foto, bukan video ── */
  const foto = await fotoTikTok(input)
  if (foto) {
    for (const g of foto.gambar.slice(0, 8)) {
      await conn.sendMessage(m.chat, {
        image: { url: g.url },
        caption: g === foto.gambar[0] ? `🖼️ *${foto.judul}*\n\n✅ Foto TikTok` : '',
      }, { quoted: m.raw })
    }
    m.limit?.success()
    await react(conn, m, '✅')
    await tawarkanAudio(conn, m, usedPrefix, input, foto.judul)
    return
  }

  try {
    let resolved
    try {
      resolved = await resolveTikTokUrl(input)
    } catch {
      // Resolver providers are occasionally rate-limited or reject short links.
      // yt-dlp is a local fallback that resolves TikTok independently.
      const fallback = await resolveTikTokFile(input, MAX_VIDEO)
      await sendLocalTikTokVideo(conn, m, fallback.file, fallback.title || 'TikTok Video')
      m.limit?.success()
      await react(conn, m, '✅')
      await tawarkanAudio(conn, m, usedPrefix, input, fallback.title || 'TikTok')
      return
    }

    const title = resolved.title || 'TikTok Video'
    try {
      await sendRemoteMediaFast(conn, m, resolved.url, {
        caption: `🎬 ${title}\n\n✅ HD No Watermark`,
        fallbackType: 'video',
        maxBytes: MAX_VIDEO,
        fileName: `${sanitizeFilename(title)}.mp4`,
        headers: {
          Referer: 'https://www.tiktok.com/',
          Accept: 'video/mp4,video/*,*/*',
        },
        forceStream: true,
        probe: false,
        preferDirect: true,
      })
    } catch {
      // Direct CDN forwarding can fail even when the resolver URL is valid.
      // Download locally and send the resulting file as the final fallback.
      const fallback = await resolveTikTokFile(input, MAX_VIDEO)
      await sendLocalTikTokVideo(conn, m, fallback.file, fallback.title || title)
    }

    m.limit?.success()
    await react(conn, m, '✅')

    /* Task183 — audio tak lagi dikirim otomatis: user diberi PILIHAN tombol
     * "Unduh audio (MP3)" (permintaan owner), id tombol → tt-audio <link>. */
    await tawarkanAudio(conn, m, usedPrefix, input, title)
  } catch (error) {
    m.limit?.fail()
    await react(conn, m, '❌')
    return m.reply('❌ Gagal mendownload TikTok. Pastikan link masih aktif lalu coba lagi.')
  }
}

handler.command = /^(tiktok|tt|ttdl|tt-audio|ttaudio)$/i
handler.help = ['tiktok <link>', 'tt <link>', 'tt-audio <link>']
handler.tags = ['download']
handler.description = 'Download TikTok HD No Watermark (video/foto) + tombol pilihan unduh audio MP3.'
handler.limitCommit = 'manual'

export { resolveTikTokFile, MAX_VIDEO }
export default handler
