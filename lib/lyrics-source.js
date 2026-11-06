/* By AlzRiss - Usanagi Umi AI — Task204
 * Sumber lirik tangguh untuk fitur .lirik/.lyrics.
 * Urutan: LrcLib (API resmi, gratis) → scraper Genius (cadangan).
 * Keduanya pernah dipakai bot Rem Assistant V2 (rem/lib/scrape/lirik.js) —
 * diadaptasi ke sini supaya fitur lirik bot ini tidak mati saat satu API
 * sedang sibuk/rusak (bukti awal: api.nexray.eu.cc selalu balas lyrics "-"
 * dan lrclib sempat503 → fitur .lyrics error).
 */
import axios from 'axios'
import cheerio from 'cheerio'

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
const TIMEOUT = 12000

/* LrcLib search makin banyak kata justru makin sering kosong (terbukti:
 * "bumi berputar navicula"→0, "bumi berputar"→5; "sempurna andre"→0,
 * "sempurna"→ok). Karena itu dicoba bertahap: kueri penuh → format
 * "judul - artis" → buang kata terakhir satu per satu. */
function kueriBertahap(q) {
  const daftar = [q]
  if (q.includes(' - ')) {
    const [a, b] = q.split(' - ').map((s) => s.trim()).filter(Boolean)
    if (a && b) daftar.push(`${b} ${a}`)
  }
  const kata = q.split(/\s+/).filter(Boolean)
  for (let n = kata.length - 1; n >= 1; n--) daftar.push(kata.slice(0, n).join(' '))
  return [...new Set(daftar)]
}

async function cariDiLrclib(q) {
  let galat = null
  for (let percobaan = 0; percobaan < 3; percobaan++) {
    try {
      const { data } = await axios.get('https://lrclib.net/api/search', {
        params: { q },
        timeout: TIMEOUT,
        headers: { 'User-Agent': UA, Referer: `https://lrclib.net/search/${encodeURIComponent(q)}` },
      })
      if (Array.isArray(data) && data.length) return data
      return [] // kueri sah tapi memang kosong — tak perlu diulang
    } catch (e) {
      galat = e
      // lrclib suka503 sesaat (ServerOverloaded) — ulang sebentar lalu lanjut.
      await new Promise((r) => setTimeout(r, 350 * (percobaan + 1)))
    }
  }
  throw galat
}

async function dariLrclib(judul) {
  let song = null
  for (const q of kueriBertahap(judul)) {
    try {
      const data = await cariDiLrclib(q)
      song = data.find((x) => x && x.plainLyrics) || (data ? data[0] : null)
      if (song) break
    } catch { /* kueri berikutnya */ }
  }
  if (!song) return null
  const teks = String(song.plainLyrics || song.syncedLyrics || '')
    .replace(/\[.*?\]/g, '')
    .trim()
  if (!teks) return null
  return {
    judul: song.trackName || judul,
    artis: song.artistName || '-',
    album: song.albumName || '-',
    lirik: teks,
    sumber: 'LrcLib',
  }
}

async function dariGenius(judul) {
  const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    Referer: 'https://genius.com/',
  }
  const sr = await axios.get('https://genius.com/api/search/multi', {
    params: { per_page: 1, q: judul },
    timeout: TIMEOUT,
    headers,
  })
  const sections = sr.data?.response?.sections || []
  let url = ''
  for (const section of sections) {
    if (section.type === 'song' && Array.isArray(section.hits) && section.hits.length) {
      url = section.hits[0]?.result?.url || ''
      break
    }
  }
  if (!url) return null
  const { data: html } = await axios.get(url, { timeout: TIMEOUT, responseType: 'text', headers })
  const $ = cheerio.load(String(html))
  const title = $('h1[class^="SongHeader"]').first().text().trim() || judul
  const artis = $('a[class^="SongHeader"]').first().text().trim() || '-'
  const potongan = []
  $('[class^="Lyrics__Container"]').each((_, el) => {
    $(el).contents().each((__, node) => {
      if (node.type === 'text') potongan.push($(node).text())
      else if (node.type === 'tag' && node.name === 'br') potongan.push('\n')
      else if (node.type === 'tag') potongan.push($(node).text())
    })
    potongan.push('\n')
  })
  const teks = potongan.join('').replace(/\n{3,}/g, '\n\n').trim()
  if (!teks) return null
  return { judul: title, artis, album: '-', lirik: teks, sumber: 'Genius' }
}

/** Cari lirik. Mengembalikan { judul, artis, album, lirik, sumber } atau null. */
export async function cariLirik(query) {
  const q = String(query || '').trim()
  if (!q) return null
  try {
    const r = await dariLrclib(q)
    if (r) return r
  } catch { /* lanjut ke cadangan */ }
  try {
    return await dariGenius(q)
  } catch {
    return null
  }
}

export default cariLirik
