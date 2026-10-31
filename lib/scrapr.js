/* By AlzRiss - Usanagi Umi AI
 *
 * JEMBATAN SCRAPR (Task181) — extractor media & link resolver dari
 * https://github.com/coflyn/scrapr (MIT, karya coflyn).
 *
 * Bundel resmi repo (bundle.cjs, self-contained) di-vendor di
 * lib/vendor/scrapr-bundle.cjs supaya tidak menambah dependensi npm dan
 * tetap hidup walau registry/npm tidak tersedia.
 *
 * Rute otomatis per domain dipusatkan di sini supaya plugin cukup memanggil
 * scraprUrl(url) dan mendapat { judul, thumb, unduhan[], resolver } seragam.
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const scrapr = require('./vendor/scrapr-bundle.cjs')

/** @returns {{platform:string, method:string}[] rute berurutan untuk satu URL */
export function ruteUrl(url) {
  const u = String(url || '').toLowerCase()
  const cek = (...polongan) => polongan.some((p) => u.includes(p))
  /* Task183 — tiktokio diprioritaskan: satu-satunya yang konsisten memberi
   * MP3 + video dalam satu hasil; savetik dibuang (butuh Chrome di server). */
  if (cek('tiktok.com', 'vt.tiktok', 'vm.tiktok', 'tt.site'))
    return [['tiktok', 'tiktokio'], ['tiktok', 'snaptik'], ['tiktok', 'ssstik'], ['tiktok', 'tikdownloader']]
  if (cek('twitter.com', 'x.com/', 'fxtwitter', 'vxtwitter', 't.co/'))
    return [['twitter', 'direct'], ['twitter', 'tweeload'], ['twitter', 'savetwt']]
  if (cek('instagram.com', 'instagr.am', 'ddinstagram'))
    return [['instagram', 'direct'], ['instagram', 'indown'], ['instagram', 'snapinsta'], ['instagram', 'snapsave']]
  if (cek('youtube.com', 'youtu.be', 'm.youtube', 'yt.be'))
    return [['youtube', 'ytmp3'], ['youtube', 'ytmp3gg']]
  if (cek('open.spotify.com', 'spotify.link'))
    return [['spotify', 'spotmate'], ['spotify', 'spotidown'], ['spotify', 'soundloaders']]
  if (cek('facebook.com', 'fb.watch', 'm.facebook'))
    return [['facebook', 'snapsave'], ['facebook', 'fdown']]
  if (cek('pinterest.', 'pin.it'))
    return [['pinterest', 'direct'], ['pinterest', 'pindown']]
  if (cek('soundcloud.com', 'on.soundcloud'))
    return [['soundcloud', 'klickaud']]
  if (cek('reddit.com', 'redd.it'))
    return [['reddit', 'rapidsave']]
  if (cek('threads.net', 'threads.com'))
    return [['threads', 'threadster']]
  if (cek('terabox', '1024terabox', 'teraboxapp', '4funbox'))
    return [['terabox', 'sechno']]
  if (cek('bilibili.com', 'b23.tv'))
    return [['bilibili', 'direct']]
  if (cek('douyin.com', 'v.douyin'))
    return [['douyin', 'direct']]
  if (cek('bandcamp.com'))
    return [['bandcamp', 'direct']]
  if (cek('pixiv.net'))
    return [['pixiv', 'ajax']]
  if (cek('rednote', 'xiaohongshu.com'))
    return [['rednote', 'direct']]
  if (cek('mediafire.com'))
    return [['resolver', 'mediafire']]
  if (cek('pixeldrain.com'))
    return [['resolver', 'pixeldrain']]
  if (cek('catbox.moe'))
    return [['resolver', 'catbox']]
  if (cek('drive.google.com', 'docs.google.com'))
    return [['resolver', 'gdrive']]
  if (cek('sfl.gl', 'safelinku', 'safelink'))
    return [['resolver', 'safelinku']]
  if (cek('sfile.mobi'))
    return [['resolver', 'sfile']]
  if (cek('sub2unlock'))
    return [['resolver', 'sub2unlock'], ['resolver', 'unshorten']]
  if (cek('rekonise.com'))
    return [['resolver', 'rekonise']]
  if (cek('krakenfiles.com'))
    return [['resolver', 'krakenfiles']]
  if (cek('doodstream', 'dood.cx', 'dood.watch'))
    return [['resolver', 'doodstream']]
  // pendek umum & host berkas tak dikenal: coba resolver dulu, baru unshorten
  return [['resolver', 'unshorten']]
}

/** Panggil satu method scrapr dengan nama platform+method string. */
async function panggil(platform, method, url) {
  const grup = scrapr[platform]
  const fn = grup?.[method]
  if (typeof fn !== 'function') throw new Error(`metode ${platform}.${method} tidak ada`)
  const hasil = await fn(url)
  if (!hasil || hasil.status !== true) {
    throw new Error(String(hasil?.message || `${platform}.${method} gagal`).slice(0, 140))
  }
  return hasil.result
}

/**
 * Selesaikan URL apa pun lewat rute scrapr.
 * @returns {Promise<{platform:string, method:string, judul:string, thumb:string, unduhan:{url:string,type:string,quality:string}[], langsung:string|null}>}
 */
export async function scraprUrl(url) {
  const rute = ruteUrl(url)
  let galat = []
  for (const [platform, method] of rute) {
    try {
      const result = await panggil(platform, method, url)
      const unduhan = Array.isArray(result?.downloads)
        ? result.downloads.filter((d) => d?.url).map((d) => ({ url: String(d.url), type: String(d.type || ''), quality: String(d.quality || '') }))
        : []
      const langsung = result?.url ? String(result.url) : (unduhan[0]?.url || null)
      return {
        platform, method,
        judul: String(result?.title || ''),
        thumb: String(result?.thumbnail || ''),
        unduhan,
        langsung,
        mentah: result,
      }
    } catch (e) {
      galat.push(`${platform}.${method}: ${e.message || e}`)
    }
  }
  throw new Error(galat.join(' | ').slice(0, 400) || 'semua rute gagal')
}

/** Resolver polos (unshorten) — dipakai perintah .unshorten. */
export async function unshortenUrl(url) {
  const result = await panggil('resolver', 'unshorten', url)
  return String(result?.url || '')
}

/* ── Task183: klasifikasi media supaya plugin bisa LANGSUNG mengirim berkas
   (audio → audio, video → video, zip/7z/dll → dokumen) bukan sekadar link. ── */

const EKSTENSI_AUDIO = ['mp3', 'm4a', 'aac', 'opus', 'flac', 'ogg', 'wav']
const EKSTENSI_GAMBAR = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']
const EKSTENSI_VIDEO = ['mp4', '3gp', 'mkv', 'webm', 'mov', 'avi']
const EKSTENSI_BERKAS = ['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'apk', 'xapk',
  'exe', 'msi', 'deb', 'rpm', 'iso', 'img', 'pdf', 'doc', 'docx', 'xls', 'xlsx',
  'ppt', 'pptx', 'txt', 'csv', 'epub', 'srt', 'ass', 'json', 'xml', 'js', 'c', 'py', 'rar5']

function ekstensi(url) {
  try {
    const path = new URL(url).pathname
    const nama = path.split('/').pop() || ''
    const e = (nama.includes('.') ? nama.split('.').pop() : '').toLowerCase()
    return /^[a-z0-9]{1,5}$/.test(e) ? e : ''
  } catch { return '' }
}

/**
 * Kelompokkan unduhan/tautan hasil scrapr jadi kelas media.
 * @param {ReturnType<typeof scraprUrl>} hasil
 * @returns {{gambar:object[], video:object[], audio:object[], berkas:object[], tautan:object[]}}
 */
export function klasifikasiMedia(hasil) {
  const kelompok = { gambar: [], video: [], audio: [], berkas: [], tautan: [] }
  const dorong = (kategori, item) => kelompok[kategori].push(item)

  for (const d of hasil.unduhan || []) {
    const t = String(d.type || '').toLowerCase()
    const q = String(d.quality || '').toLowerCase()
    const e = ekstensi(d.url)
    if (t === 'audio' || t === 'music' || t === 'mp3' || q === 'mp3' || EKSTENSI_AUDIO.includes(e)) dorong('audio', d)
    else if (t === 'image' || t === 'gambar' || EKSTENSI_GAMBAR.includes(e)) dorong('gambar', d)
    else if (t === 'video' || t === 'mp4' || EKSTENSI_VIDEO.includes(e)) dorong('video', d)
    else if (t === 'file' || t === 'document' || EKSTENSI_BERKAS.includes(e)) dorong('berkas', d)
    else if (t) dorong('berkas', d) // tipe tak dikenal tapi ada: kirim sebagai berkas
    else dorong('tautan', d)
  }

  /* resolver (mediafire/dll) → hasil langsung tanpa daftar unduhan */
  if (hasil.langsung && !kelompok.gambar.length && !kelompok.video.length &&
      !kelompok.audio.length && !kelompok.berkas.length) {
    const e = ekstensi(hasil.langsung)
    const item = { url: hasil.langsung, type: '', quality: '' }
    if (EKSTENSI_AUDIO.includes(e)) dorong('audio', item)
    else if (EKSTENSI_GAMBAR.includes(e)) dorong('gambar', item)
    else if (EKSTENSI_VIDEO.includes(e)) dorong('video', item)
    else if (EKSTENSI_BERKAS.includes(e) || ['mediafire', 'sfile', 'pixeldrain', 'catbox',
      'krakenfiles', 'doodstream', 'gdrive', 'terabox'].includes(hasil.platform === 'resolver' ? hasil.method : '')) {
      dorong('berkas', item)
    } else dorong('tautan', item)
  }
  return kelompok
}

/** Nama berkas dari URL (fallback aman). */
export function namaBerkas(url) {
  try {
    const path = new URL(url).pathname
    const nama = decodeURIComponent(path.split('/').pop() || '')
    if (nama && nama.includes('.')) return nama.slice(0, 120)
  } catch { /* url aneh */ }
  return 'berkas'
}

export default { scraprUrl, unshortenUrl, ruteUrl, klasifikasiMedia, namaBerkas }
