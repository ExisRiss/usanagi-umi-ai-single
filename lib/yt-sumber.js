/* By AlzRiss - Usanagi Umi AI
 *
 * SUMBER MEDIA YOUTUBE (Task132)
 *
 * Kenapa berkas ini ada:
 * `.ytplay` (dan `.ytmp3` / `.ytmp4` / `.play`) selama ini bergantung pada
 * api-faa, SaveTube, Piped, dan Invidious. Per 27 Okt 2026 semuanya mati dari
 * server:
 *   api-faa.my.id            → HTTP 403
 *   media.savetube.vip       → balasannya HTML (bukan audio/video)
 *   pipedapi.kavin.rocks     → 403
 *   invidious.*              → 403 / 401 / 530
 * Akibatnya `.ytplay` hanya menampilkan kartu "Sumber video tidak tersedia".
 *
 * Solusi: pakai API yang dipakai **OURIN** dan **Kilua**, tetapi setiap URL
 * DIPERIKSA DULU (unduh 2 KB pertama, lihat content-type) sebelum dikirim ke
 * WhatsApp. Jadi tidak ada lagi "link ada tapi isinya halaman HTML".
 *
 * Urutan sumber (yang pertama lolos pemeriksaan yang dipakai):
 *
 *   AUDIO : izuka (OURIN)  → azbry (OURIN)  → savetube (Kilua/bot ini)
 *   VIDEO : piped (Kilua)  → izuka (OURIN)  → azbry (OURIN)
 *
 * Catatan: server YouTube makin ketat menolak IP datacenter. Karena itu
 * pemeriksaan di sini wajib — lebih baik jujur "video tidak tersedia" lalu
 * kirim audionya, daripada mengirim kartu player yang tidak bisa diputar.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'

/** Batas waktu tiap permintaan API (ms). */
const TIMEOUT_API = 45000
/** Batas waktu saat memeriksa/unduh media (ms). */
const TIMEOUT_MEDIA = 60000

/** Instance Piped publik yang masih menjawab (dicek 27 Okt 2026). */
const PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.darkness.services',
]

/** Ambil id video dari URL atau dari teks biasa. */
export function ambilIdYoutube(nilai) {
  const teks = String(nilai || '').trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(teks)) return teks
  try {
    const u = new URL(teks)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'youtu.be') return u.pathname.split('/').filter(Boolean)[0] || ''
    if (host.endsWith('youtube.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v')
      const bagian = u.pathname.split('/').filter(Boolean)
      if (['shorts', 'embed', 'live', 'v'].includes(bagian[0])) return bagian[1] || ''
    }
  } catch {
    /* bukan URL */
  }
  return ''
}

const tautanTonton = id => `https://www.youtube.com/watch?v=${id}`

function jam(detik) {
  const n = Math.max(0, Math.round(Number(detik) || 0))
  const m = Math.floor(n / 60)
  const s = n % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Periksa apakah sebuah URL benar-benar media.
 * Ini yang membedakan sumber hidup dari sumber mati.
 *
 * @param {string} url
 * @param {'video'|'audio'|'any'} jenis
 * @returns {Promise<{ok:boolean, tipe?:string, ukuran?:number, alasan?:string}>}
 */
export async function periksaMedia(url, jenis = 'any') {
  if (!url || !/^https?:\/\//i.test(url)) return { ok: false, alasan: 'url kosong' }
  const { controller, selesai } = batasWaktu(TIMEOUT_MEDIA)
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': UA,
        accept: jenis === 'audio' ? 'audio/*,*/*' : 'video/*,*/*',
        range: 'bytes=0-2047',
        referer: 'https://www.youtube.com/',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    const isi = Buffer.from(await res.arrayBuffer())
    const tipe = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!res.ok) return { ok: false, alasan: `HTTP ${res.status}` }
    if (/text\/html|application\/json|text\/plain/.test(tipe)) {
      return { ok: false, alasan: `isinya ${tipe || 'bukan media'} (halaman web, bukan audio/video)` }
    }
    if (jenis === 'video' && !/^video\/|octet-stream/.test(tipe)) {
      return { ok: false, alasan: `tipe ${tipe || '-'} bukan video` }
    }
    if (jenis === 'audio' && !/^audio\/|octet-stream/.test(tipe)) {
      return { ok: false, alasan: `tipe ${tipe || '-'} bukan audio` }
    }
    if (isi.length < 256) return { ok: false, alasan: `isi cuma ${isi.length} byte` }
    return { ok: true, tipe: tipe || 'application/octet-stream', ukuran: isi.length }
  } catch (error) {
    return { ok: false, alasan: String(error?.message || error).slice(0, 120) }
  } finally {
    selesai()
  }
}

function batasWaktu(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { controller, selesai: () => clearTimeout(timer) }
}

async function ambilJson(url, { timeout = TIMEOUT_API, metode = 'GET', isi = null, headers = {} } = {}) {
  const { controller, selesai } = batasWaktu(timeout)
  try {
    const res = await fetch(url, {
      method: metode,
      headers: { 'user-agent': UA, accept: 'application/json', ...(isi ? { 'content-type': 'application/json' } : {}), ...headers },
      body: isi,
      signal: controller.signal,
    })
    const teks = await res.text()
    let json = null
    try {
      json = JSON.parse(teks)
    } catch {
      json = null
    }
    return { status: res.status, ok: res.ok, json, teks }
  } finally {
    selesai()
  }
}

/** Ambil URL media dari struktur JSON apa pun (kunci yang umum dipakai API bot). */
function cariUrlMedia(payload) {
  const calon = [
    payload?.result?.download_url,
    payload?.result?.download,
    payload?.result?.url,
    payload?.data?.download_url,
    payload?.data?.url,
    payload?.download_url,
    payload?.url,
  ]
  for (const nilai of calon) {
    if (typeof nilai === 'string' && /^https?:\/\//i.test(nilai)) return nilai
  }
  return ''
}

/* ============================================================
 * PENCARIAN
 * ============================================================ */

/**
 * Cari video YouTube.
 * @param {string} query judul atau URL
 * @returns {Promise<{id:string, url:string, judul:string, channel:string, durasi:number,
 *                    durasiTeks:string, thumb:string, sumber:string}|null>}
 */
export async function cariYouTube(query) {
  const teks = String(query || '').trim()
  if (!teks) return null

  // 1. Kalau yang dikirim sudah berupa link / id, tidak perlu mencari.
  const idLangsung = ambilIdYoutube(teks)
  if (idLangsung) {
    const meta = await infoVideo(idLangsung).catch(() => null)
    if (meta) return meta
    return {
      id: idLangsung,
      url: tautanTonton(idLangsung),
      judul: 'YouTube Video',
      channel: 'YouTube',
      durasi: 0,
      durasiTeks: '',
      thumb: `https://i.ytimg.com/vi/${idLangsung}/hqdefault.jpg`,
      sumber: 'link',
    }
  }

  // 2. yt-search (dipakai bot ini sejak lama). Di sandbox bisa tidak ada.
  try {
    const { default: yts } = await import('yt-search')
    const hasil = await yts(teks)
    const video = hasil?.videos?.[0]
    if (video?.videoId) {
      return {
        id: video.videoId,
        url: video.url || tautanTonton(video.videoId),
        judul: video.title || 'YouTube Video',
        channel: video.author?.name || 'YouTube',
        durasi: Number(video.seconds) || 0,
        durasiTeks: video.duration?.timestamp || jam(video.seconds),
        thumb: video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
        sumber: 'yt-search',
      }
    }
  } catch (error) {
    console.warn('[YTSUMBER] yt-search tidak tersedia:', String(error?.message || error).slice(0, 80))
  }

  // 3. Piped search (cadangan; ini jalur yang dipakai Kilua).
  for (const base of PIPED) {
    try {
      const { ok, json } = await ambilJson(`${base}/search?q=${encodeURIComponent(teks)}&filter=videos`, { timeout: 20000 })
      if (!ok || !json) continue
      const item = (json.items || []).find(x => x?.url && /^\/watch\?v=/.test(x.url))
      const id = ambilIdYoutube(item?.url ? `https://www.youtube.com${item.url}` : '')
      if (!id) continue
      return {
        id,
        url: tautanTonton(id),
        judul: item.title || 'YouTube Video',
        channel: item.uploaderName || 'YouTube',
        durasi: Number(item.duration) || 0,
        durasiTeks: jam(item.duration),
        thumb: item.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        sumber: 'piped-search',
      }
    } catch {
      /* lanjut instance berikutnya */
    }
  }

  return null
}

/** Info video lewat oEmbed YouTube (ringan, hampir selalu hidup). */
export async function infoVideo(id) {
  const { ok, json } = await ambilJson(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(tautanTonton(id))}&format=json`,
    { timeout: 15000 }
  )
  if (!ok || !json?.title) return null
  return {
    id,
    url: tautanTonton(id),
    judul: json.title,
    channel: json.author_name || 'YouTube',
    durasi: 0,
    durasiTeks: '',
    thumb: json.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    sumber: 'oembed',
  }
}

/* ============================================================
 * SUMBER AUDIO
 * ============================================================ */

/**
 * Daftar kandidat audio (belum diperiksa).
 * @param {string} id
 * @returns {Promise<Array<{url:string, sumber:string, judul?:string}>>}
 */
export async function kandidatAudio(id) {
  const watch = tautanTonton(id)
  const enc = encodeURIComponent(watch)
  const hasil = []

  // 1. izuka (dipakai OURIN di plugins/download/ytmp3.js) — terbukti 206 audio/mpeg
  try {
    const { ok, json } = await ambilJson(`https://my.izuka-api.xyz/api/downloader/ytmp3?url=${enc}`, { timeout: 60000 })
    const url = cariUrlMedia(json)
    if (ok && url) hasil.push({ url, sumber: 'izuka (OURIN)', judul: json?.result?.title || '' })
  } catch {
    /* lanjut */
  }

  // 2. azbry (dipakai OURIN di plugins/search/play.js)
  try {
    const { ok, json } = await ambilJson(`https://api.azbry.com/api/download/ytmp3?url=${enc}`, { timeout: 30000 })
    const url = cariUrlMedia(json)
    if (ok && url) hasil.push({ url, sumber: 'azbry (OURIN)', judul: json?.result?.title || '' })
  } catch {
    /* lanjut */
  }

  return hasil
}

/* ============================================================
 * SUMBER VIDEO
 * ============================================================ */

/**
 * Daftar kandidat video (belum diperiksa).
 * @param {string} id
 * @returns {Promise<Array<{url:string, sumber:string, kualitas?:string}>>}
 */
export async function kandidatVideo(id) {
  const watch = tautanTonton(id)
  const enc = encodeURIComponent(watch)
  const hasil = []

  // 1. Piped (jalur Kilua) — ambil stream yang sudah ada audionya.
  for (const base of PIPED) {
    try {
      const { ok, json } = await ambilJson(`${base}/streams/${id}`, { timeout: 15000 })
      if (!ok || !json) continue
      const daftar = (json.videoStreams || [])
        .filter(s => s?.url && s.videoOnly === false && /mp4/i.test(String(s.mimeType || '')))
        .sort((a, b) => (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0))
      for (const s of daftar.slice(0, 3)) {
        hasil.push({ url: s.url, sumber: `piped ${new URL(base).hostname}`, kualitas: s.quality })
      }
    } catch {
      /* lanjut */
    }
  }

  // 2. izuka ytmp4 (OURIN)
  try {
    const { ok, json } = await ambilJson(`https://my.izuka-api.xyz/api/downloader/ytmp4?url=${enc}`, { timeout: 45000 })
    const url = cariUrlMedia(json)
    if (ok && url) hasil.push({ url, sumber: 'izuka (OURIN)', kualitas: json?.result?.duration || '' })
  } catch {
    /* lanjut */
  }

  // 3. azbry ytmp4 (OURIN)
  try {
    const { ok, json } = await ambilJson(`https://api.azbry.com/api/download/ytmp4?url=${enc}`, { timeout: 30000 })
    const url = cariUrlMedia(json)
    if (ok && url) hasil.push({ url, sumber: 'azbry (OURIN)', kualitas: '' })
  } catch {
    /* lanjut */
  }

  return hasil
}

/**
 * Cari sumber media yang benar-benar hidup.
 * @param {string} id
 * @param {'video'|'audio'} jenis
 * @returns {Promise<{url:string, sumber:string, tipe:string, kualitas?:string, dicoba:Array}|null>}
 */
export async function sumberMedia(id, jenis = 'video') {
  const dicoba = []
  const daftar = jenis === 'video' ? await kandidatVideo(id) : await kandidatAudio(id)
  for (const kandidat of daftar) {
    const cek = await periksaMedia(kandidat.url, jenis)
    dicoba.push({ sumber: kandidat.sumber, url: kandidat.url.slice(0, 90), ok: cek.ok, alasan: cek.alasan || '' })
    if (cek.ok) {
      return { ...kandidat, tipe: cek.tipe, ukuranAwal: cek.ukuran, dicoba }
    }
  }
  return { url: '', sumber: '', tipe: '', dicoba }
}

/** Unduh seluruh isi media ke Buffer dengan batas ukuran. */
export async function unduhMedia(url, { maksByte = 64 * 1024 * 1024, timeout = 300000 } = {}) {
  const { controller, selesai } = batasWaktu(timeout)
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'video/*,audio/*,*/*', referer: 'https://www.youtube.com/' },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} saat mengunduh media`)
    const tipe = String(res.headers.get('content-type') || '').split(';')[0].toLowerCase()
    if (/text\/html|application\/json/.test(tipe)) throw new Error('server mengirim halaman web, bukan media')
    const panjang = Number(res.headers.get('content-length') || 0)
    if (panjang && panjang > maksByte) {
      throw new Error(`ukuran ${(panjang / 1048576).toFixed(1)} MB melebihi batas ${Math.round(maksByte / 1048576)} MB`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error('berkas media kosong')
    if (buf.length > maksByte) throw new Error(`ukuran ${(buf.length / 1048576).toFixed(1)} MB melebihi batas`)
    return { buffer: buf, tipe, byte: buf.length }
  } finally {
    selesai()
  }
}

export default {
  ambilIdYoutube,
  cariYouTube,
  infoVideo,
  kandidatAudio,
  kandidatVideo,
  sumberMedia,
  periksaMedia,
  unduhMedia,
}
