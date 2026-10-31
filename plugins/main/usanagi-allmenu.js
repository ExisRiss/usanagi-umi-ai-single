/* By AlzRiss - Usanagi Umi AI
 *
 * `.allmenu` — All Menu ASLI (gaya AlzRiss) dengan animasi LOADING.
 *
 * Task125: owner mengeluh `.allmenu` sekarang mengirim 35 pesan teks panjang
 * ("Halaman 1/35 · navigasi ..."). Penyebabnya Task106: isi menu ditaruh di
 * footer tombol, terpotong, lalu "diperbaiki" dengan membagi teks jadi puluhan
 * pesan. Sekarang kembali ke bentuk ASLI:
 *
 *   1. bot mengirim satu pesan lalu MENYUNTINGNYA berulang kali menjadi bar
 *      progres  🌸 *AlzRiss Loading* [■■□□□□□□□□] 35%  > _mengumpulkan plugin..._
 *   2. setelah selesai, menu dikirim SATU pesan (media menu + caption lengkap
 *      berisi statistik + semua kategori) dengan trik "read more" supaya
 *      WhatsApp mau menampilkan teks panjang.
 *
 * Kalau media menu tidak ada, menu tetap dikirim sebagai pesan teks — tidak
 * pernah gagal diam-diam. Kalau penyuntingan tidak didukung server WhatsApp,
 * bar progres dilewati dan menu tetap terkirim.
 *
 * Isi menu dibangun dari `global.plugins` seperti versi asli (bukan dari
 * database), jadi cepat dan tidak menyentuh library berat.
 */

import os from 'node:os'
import { readMenuMedia } from '../../lib/menu-media.js'

/* Batas WhatsApp untuk satu pesan = 65.536 BYTE. Karena menu bisa berisi
 * ribuan perintah, batas dihitung dalam byte (bukan karakter) dan disisakan
 * ruang untuk trik read-more + tautan website. */
const READ_MORE = String.fromCharCode(8206).repeat(1200)
export const BATAS_CAPTION = 50_000 // byte, untuk isi menu (tanpa read-more)

const websiteUrl = () => global.links?.websiteUrl || global.scriptUrl || ''

function clockString(ms) {
  const angka = value => (Number.isFinite(value) ? String(value).padStart(2, '0') : '--')
  return [
    angka(Math.floor(ms / 3600000)),
    angka(Math.floor(ms / 60000) % 60),
    angka(Math.floor(ms / 1000) % 60),
  ].join(':')
}

function tanggalJakarta() {
  const now = new Date(Date.now() + 3600000)
  const tanggal = now.toLocaleDateString('id', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
  const jam = now.toLocaleTimeString('id', { timeZone: 'Asia/Jakarta' }).replace(/[.]/g, ':')
  return { tanggal, jam }
}

/* ── Loading khas AlzRiss ─────────────────────────────────────────────── */

export const FRAMES = [
  { percent: 15, text: 'mencari kacang...' },
  { percent: 35, text: 'membaca pikiran user...' },
  { percent: 60, text: 'mengumpulkan plugin...' },
  { percent: 85, text: 'menyusun kategori...' },
  { percent: 100, text: 'menu siap ditampilkan!' },
]

function barProgres(percent) {
  const isi = Math.floor(percent / 10)
  return '■'.repeat(isi) + '□'.repeat(10 - isi)
}

export function teksLoading(frame) {
  return `🌸 *AlzRiss Loading* [${barProgres(frame.percent)}] ${frame.percent}%\n> _${frame.text}_`
}

/** Sunting pesan loading. Coba API edit, lalu relay protocolMessage (cara asli). */
async function suntingPesan(conn, chat, key, teks) {
  /* Jalur utama = protocolMessage type 14 (sama seperti plugin game di repo ini
   * yang sudah terbukti menyunting pesan). Kalau gagal, coba API `edit`. */
  try {
    if (typeof conn.relayMessage === 'function') {
      await conn.relayMessage(chat, {
        protocolMessage: { key, type: 14, editedMessage: { conversation: teks } },
      }, {})
      return true
    }
  } catch {}
  try {
    if (typeof conn.sendMessage === 'function') {
      await conn.sendMessage(chat, { text: teks, edit: key }, {})
      return true
    }
  } catch (error) {
    console.warn('[ALLMENU] gagal menyunting pesan loading:', error?.message || error)
  }
  return false
}

/** Kirim pesan loading lalu animasikan sampai 100%. */
export async function loadingAlzRiss(conn, m, { jeda = 400 } = {}) {
  let pesan = null
  try {
    pesan = await conn.sendMessage(m.chat, { text: `🌸 _Membangunkan AlzRiss..._` }, { quoted: m.raw || m })
  } catch (error) {
    console.warn('[ALLMENU] pesan loading gagal dikirim:', error?.message || error)
    return null
  }

  for (const frame of FRAMES) {
    await new Promise(resolve => setTimeout(resolve, jeda))
    const sukses = await suntingPesan(conn, m.chat, pesan?.key, teksLoading(frame))
    if (!sukses) break
  }
  return pesan
}

/* ── Isi menu ─────────────────────────────────────────────────────────── */

const TEMPLATE = {
  before: [
    'こんにちは、お姉さん %name 🌸',
    '',
    '私は *%botname* — bot WhatsApp yang siap bantu apapun.',
    '',
    '乂  *S T A T I S T I K* 乂',
    '╭─ ︿︿︿︿︿ ︿︿︿︿︿ ︿︿︿︿︿',
    '┊ ‹‹ *ɴᴀᴍᴇ* :: %name',
    '┊ ›› *ᴘʀᴇғɪx* :: %p',
    '┊ ›› *ʀᴜɴᴛɪᴍᴇ* :: %muptime',
    '┊ ›› *ᴜsᴇʀ* :: %totalreg',
    '┊ ›› *ᴅᴀᴛᴇ* :: %date',
    '┊ ›› *ᴘʟᴀᴛғᴏʀᴍ* :: %platform',
    '┊ ›› *ᴅᴇᴠᴇʟᴏᴘᴇʀ* :: AlzRiss × Arena',
    '╰─────────╮',
    '%readmore',
  ].join('\n'),
  header: '❖━━━━━━[ *%category* ]━━━━━━❖\n╔═━───╍━╍╍┄',
  body: '╠➺ %cmd %islimit %isPremium',
  footer: '╚═─━╍╍━╍╾',
  after: '𝐔𝐬𝐚𝐧𝐚𝐠𝐢 𝐔𝐦𝐢 𝐀𝐈 %versi',
}

/** Kumpulkan perintah per kategori dari plugin yang benar-benar termuat. */
export function kumpulkanKategori(prefix = '.') {
  const daftar = global.plugins && typeof global.plugins === 'object' ? global.plugins : {}
  const kategori = new Map()

  for (const plugin of Object.values(daftar)) {
    if (!plugin || typeof plugin !== 'function' || plugin.disabled) continue
    const tags = Array.isArray(plugin.tags) ? plugin.tags : plugin.tags ? [plugin.tags] : []
    const help = Array.isArray(plugin.help) ? plugin.help : plugin.help ? [plugin.help] : []
    if (!tags.length || !help.length) continue
    const tetap = plugin.customPrefix === true
    const penanda = `${plugin.limit ? ' Ⓛ' : ''}${plugin.premium ? ' Ⓟ' : ''}`.trim()
    for (const tag of tags) {
      if (!tag) continue
      if (!kategori.has(tag)) kategori.set(tag, [])
      for (const item of help) {
        const nama = String(item || '').trim()
        if (!nama) continue
        const baris = `${tetap ? nama : `${prefix}${nama}`}${penanda ? ` ${penanda}` : ''}`
        kategori.get(tag).push(baris)
      }
    }
  }

  return [...kategori.entries()]
    .map(([tag, perintah]) => ({
      tag,
      perintah: [...new Set(perintah)].sort((a, b) => a.localeCompare(b)),
    }))
    .filter(item => item.perintah.length)
    .sort((a, b) => String(a.tag).localeCompare(String(b.tag)))
}

/** Ganti variabel %name %p %muptime … seperti versi asli. */
export function gantiVariabel(teks, nilai = {}) {
  const kunci = Object.keys(nilai).sort((a, b) => b.length - a.length)
  if (!kunci.length) return String(teks || '')
  return String(teks || '').replace(new RegExp(`%(${kunci.join('|')})`, 'g'), (_, key) => String(nilai[key] ?? ''))
}

/** Rapatkan daftar perintah jadi beberapa baris panjang (maks `lebar` huruf). */
export function rapikanPadat(perintah, lebar = 68) {
  const baris = []
  let sekarang = ''
  for (const cmd of perintah) {
    const calon = sekarang ? `${sekarang} · ${cmd}` : cmd
    if (calon.length > lebar && sekarang) {
      baris.push(sekarang)
      sekarang = cmd
    } else {
      sekarang = calon
    }
  }
  if (sekarang) baris.push(sekarang)
  return baris.join('\n')
}

/**
 * Susun teks menu lengkap.
 * @returns {{ teks: string, kategori: number, perintah: number, dipotong: boolean }}
 */
export function bangunTeksAllMenu({
  prefix = '.',
  name = 'Kak',
  botname = 'Usanagi Umi AI',
  uptime = '00:00:00',
  muptime = '00:00:00',
  totalreg = 0,
  platform = os.platform(),
  tanggal = tanggalJakarta().tanggal,
  versi = String(global.version || 'v7.1'),
  daftar = null,
  batas = BATAS_CAPTION,
} = {}) {
  const kategori = Array.isArray(daftar) ? daftar : kumpulkanKategori(prefix)
  // `%readmore` sengaja TIDAK diganti di sini; trik read-more baru dipasang
  // saat caption dikirim (lihat susunCaption).
  const kepala = gantiVariabel(TEMPLATE.before, {
    name, botname, p: prefix, muptime, uptime, totalreg, date: tanggal, platform,
  })

  /* Dua gaya isi:
   *   'baris' — gaya ASLI: satu perintah per baris (╠➺ .cmd)
   *   'padat' — dipakai kalau daftar terlalu panjang: perintah dirapatkan
   *             ' · ' per baris sehingga SELURUH perintah tetap terkirim
   *             dalam satu pesan.
   * Tidak ada kategori yang dibuang. */
  const susunBlok = (item, gaya) => {
    const kepalaKategori = TEMPLATE.header.replace(/%category/g, String(item.tag).toUpperCase())
    const isi = gaya === 'padat'
      ? rapikanPadat(item.perintah, 68)
      : item.perintah
          .map(cmd => TEMPLATE.body.replace(/%cmd/g, cmd).replace(/%islimit/g, '').replace(/%isPremium/g, '').trim())
          .join('\n')
    return [kepalaKategori, isi, TEMPLATE.footer].join('\n')
  }

  const ukur = gay => {
    const blok = kategori.map(item => susunBlok(item, gay))
    const sisa = [`${TEMPLATE.after.replace(/%versi/g, versi)}`]
    const isi = [kepala, ...blok, '', ...sisa].join('\n')
    return { blok, teks: isi, byte: Buffer.byteLength(isi, 'utf8') }
  }

  let gaya = 'baris'
  let hasil = ukur('baris')
  if (hasil.byte > batas) {
    gaya = 'padat'
    hasil = ukur('padat')
  }

  // Kalau masih terlalu besar (kasus ekstrem), buang argumen perintah
  // (<nomor>, [opsi]) pada mode padat — perintahnya tetap lengkap.
  if (hasil.byte > batas) {
    const ringkas = kategori.map(item => ({ ...item, perintah: item.perintah.map(cmd => cmd.replace(/\s*[<[(][^>)\]]*[>)\]]/g, '')) }))
    const blok = ringkas.map(item => susunBlok(item, 'padat'))
    hasil = { blok, teks: [kepala, ...blok, '', TEMPLATE.after.replace(/%versi/g, versi)].join('\n') }
    hasil.byte = Buffer.byteLength(hasil.teks, 'utf8')
  }

  const jumlahPerintah = kategori.reduce((n, item) => n + item.perintah.length, 0)
  return {
    teks: hasil.teks,
    kategori: hasil.blok.length,
    perintah: jumlahPerintah,
    byte: hasil.byte,
    gaya,
    dipotong: false,
  }
}

/** Susun caption: judul situs + menu + trik read-more (bila perlu). */
export function susunCaption(teks, url = '') {
  const isi = String(teks || '').replace('%readmore', '')
  const kepala = url ? `${url}\n\n` : ''
  if (Buffer.byteLength(isi, 'utf8') <= 900) return kepala + isi
  /* Trik asli AlzRiss: sisipkan karakter tak terlihat sesudah kepala menu
   * supaya WhatsApp menampilkan "Baca selengkapnya" dan SELURUH isi menu tetap
   * terkirim dalam satu pesan. */
  const bagian = isi.split('\n')
  const potong = Math.min(bagian.length, 24)
  const atas = bagian.slice(0, potong).join('\n')
  const bawah = bagian.slice(potong).join('\n')
  return `${kepala}${atas}\n${READ_MORE}${bawah}`
}

/**
 * Tampilkan allmenu lengkap (animasi loading + SATU pesan).
 * Dipakai `.allmenu`, `.menu_all`, dan tombol "All Menu" supaya ketiganya
 * menghasilkan tampilan yang sama — dulu tombolnya memakai versi halaman
 * (SEMUA FITUR 1/35) yang berbeda dari perintah.
 */
export async function tampilkanAllMenu(m, { conn, prefix = '.' } = {}) {
  const usedPrefix = prefix
  let nama = m.pushName || ''
  if (!nama) {
    try { nama = await conn.getName(m.sender) } catch { nama = '' }
  }
  nama = nama || 'Kak'

  // 1) Animasi loading khas AlzRiss (dilewati kalau server menolak edit).
  await loadingAlzRiss(conn, m)

  // 2) Bangun menu.
  const { teks, kategori, perintah, dipotong } = bangunTeksAllMenu({
    prefix,
    name: nama,
    botname: String(global.namebot || 'Usanagi Umi AI'),
    muptime: clockString(process.uptime() * 1000),
    uptime: clockString(os.uptime() * 1000),
    totalreg: global.db?.data?.users ? Object.keys(global.db.data.users).length : 0,
  })
  if (dipotong) console.warn('[ALLMENU] teks dipotong pada batas caption:', teks.length)

  const caption = susunCaption(teks, websiteUrl())
  const mentions = [m.sender]

  // 3) Kirim SATU pesan: media menu + caption lengkap.
  try {
    const media = readMenuMedia(conn)
    const isi = media.type === 'image'
      ? { image: media.data, mimetype: media.mimetype }
      : { video: media.data, mimetype: media.mimetype, gifPlayback: true }
    await conn.sendMessage(m.chat, { ...isi, caption, mentions }, { quoted: m.raw || m })
  } catch (error) {
    console.warn('[ALLMENU] media menu gagal, kirim teks:', error?.message || error)
    await conn.sendMessage(m.chat, { text: caption, mentions }, { quoted: m.raw || m })
  }

  return { ok: true, mode: 'allmenu-asli+loading', kategori, perintah, panjang: caption.length, dipotong }
}

const handler = async (m, extra = {}) => {
  /* Task186 — animasi reaction 1️⃣→🔟 selama allmenu dibangun (di luar
   * animasi edit-pesan loadingAlzRiss yang sudah ada). */
  const { mulaiReactLoading } = await import('../../lib/loading-react.js')
  const anim = mulaiReactLoading(extra.conn, m)
  try {
    return await tampilkanAllMenu(m, { conn: extra.conn, prefix: extra.usedPrefix || extra.prefix || '.' })
  } catch (error) {
    await anim.stop('⚠️')
    throw error
  } finally {
    await anim.stop('✅')
  }
}

handler.command = /^allmenu$/i
handler.help = ['allmenu']
handler.tags = ['main']
handler.description = 'Menampilkan seluruh menu dalam satu tampilan lengkap (dengan animasi loading)'
handler.all = false
handler.limit = false

export default handler
