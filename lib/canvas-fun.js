/* By AlzRiss - Usanagi Umi AI
 *
 * KARTU HASIL "CEK" (Task130 — diadaptasi dari Kilua MD by Naren V2)
 *
 * Kilua memakai pustaka `kyzz-canvas` yang tidak ada di proyek ini. Supaya
 * tidak menambah dependensi native baru, kartunya digambar ulang memakai
 * `@napi-rs/canvas` yang sudah terpasang dan dipakai `lib/profile-card.js`.
 *
 * Tampilan: kartu neo-brutalism (garis hitam tebal, bayangan blok, warna
 * kontras) berisi judul, avatar bulat, nama, skor besar, meter persentase,
 * dan satu kalimat vonis. Ukuran 900×540 (16:9) seperti aslinya.
 */

import { createCanvas, loadImage } from '@napi-rs/canvas'

const W = 900
const H = 540
const LATAR = '#fffae5'
const TINTA = '#111111'

function bulat(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

/** Kotak bergaya neo-brutalism: isi warna + garis tebal + bayangan menggeser. */
function kotakNeo(ctx, x, y, w, h, { isi = '#ffffff', radius = 16, tebal = 4, bayangan = 8 } = {}) {
  ctx.save()
  ctx.fillStyle = TINTA
  bulat(ctx, x + bayangan, y + bayangan, w, h, radius)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.fillStyle = isi
  bulat(ctx, x, y, w, h, radius)
  ctx.fill()
  ctx.lineWidth = tebal
  ctx.strokeStyle = TINTA
  ctx.stroke()
  ctx.restore()
}

/**
 * Buang emoji dari teks yang digambar di canvas.
 *
 * Alasan: container bot tidak punya font emoji (berkas "AppleColorEmoji.ttf"
 * di arsip Kilua ternyata hanya HTML 3 KB, bukan font). Emoji yang digambar
 * canvas jadi kotak kosong "tofu". Emoji tetap dikirim di caption WhatsApp,
 * karena di sana HP pengguna yang merendernya.
 */
export function tanpaEmoji(teks) {
  try {
    return String(teks == null ? '' : teks)
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/[\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  } catch {
    // Node lama tanpa properti Unicode: buang rentang emoji umum saja.
    return String(teks == null ? '' : teks).replace(/[\uD800-\uDFFF\u2600-\u27BF]/g, '').trim()
  }
}

function potongTeks(ctx, teks, maksLebar) {
  const isi = String(teks == null ? '' : teks)
  if (ctx.measureText(isi).width <= maksLebar) return isi
  let hasil = isi
  while (hasil.length > 4 && ctx.measureText(`${hasil}…`).width > maksLebar) {
    hasil = hasil.slice(0, -1)
  }
  return `${hasil}…`
}

/** Bungkus teks menjadi beberapa baris sesuai lebar kotak. */
export function bungkusTeks(ctx, teks, maksLebar, maksBaris = 3) {
  const kata = String(teks || '').split(/\s+/).filter(Boolean)
  const baris = []
  let sekarang = ''
  for (const k of kata) {
    const calon = sekarang ? `${sekarang} ${k}` : k
    if (ctx.measureText(calon).width <= maksLebar) {
      sekarang = calon
    } else {
      if (sekarang) baris.push(sekarang)
      sekarang = k
      if (baris.length >= maksBaris) break
    }
  }
  if (sekarang && baris.length < maksBaris) baris.push(sekarang)
  if (baris.length === maksBaris && kata.length) {
    const sisa = baris[maksBaris - 1]
    if (ctx.measureText(sisa).width > maksLebar) baris[maksBaris - 1] = potongTeks(ctx, sisa, maksLebar)
  }
  return baris
}

/** Ambil avatar pengguna sebagai buffer; null kalau tidak ada (pakai inisial). */
export async function ambilAvatar(conn, jid) {
  if (!conn || !jid) return null
  try {
    const url = await conn.profilePictureUrl(jid, 'image')
    if (!url) return null
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length ? buf : null
  } catch {
    return null
  }
}

/**
 * Gambar kartu.
 * @param {{judul:string, nama:string, skor:number, vonis:string,
 *          kategori?:string, emoji?:string, warna?:string, avatar?:Buffer|null}} opsi
 * @returns {Promise<Buffer>}
 */
export async function renderKartuCek(opsi = {}) {
  const judul = tanpaEmoji(opsi.judul || 'CEK SKOR')
  const nama = tanpaEmoji(opsi.nama || 'Kak')
  const skor = Math.max(0, Math.min(100, Math.round(Number(opsi.skor) || 0)))
  const vonis = tanpaEmoji(opsi.vonis || '-')
  const kategori = tanpaEmoji(opsi.kategori || '')
  const warna = String(opsi.warna || '#ff4794')
  const emoji = String(opsi.emoji || '✨')

  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // latar
  ctx.fillStyle = LATAR
  ctx.fillRect(0, 0, W, H)

  // titik-titik halus
  ctx.fillStyle = 'rgba(0,0,0,0.06)'
  for (let x = 13; x < W; x += 26) {
    for (let y = 13; y < H; y += 26) {
      ctx.beginPath()
      ctx.arc(x, y, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // bingkai utama
  kotakNeo(ctx, 16, 16, W - 32, H - 32, { isi: '#ffffff', radius: 24, tebal: 4, bayangan: 8 })

  // judul
  kotakNeo(ctx, 34, 34, 560, 56, { isi: warna, radius: 16, tebal: 3.5, bayangan: 5 })
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 27px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(potongTeks(ctx, judul.toUpperCase(), 520), 52, 63)

  /* Badge: emoji tidak bisa dirender canvas (tidak ada font emoji), jadi yang
   * digambar adalah kode singkat dari judulnya + persentase skor. */
  kotakNeo(ctx, W - 190, 34, 150, 56, { isi: '#ffd000', radius: 16, tebal: 3.5, bayangan: 5 })
  ctx.fillStyle = TINTA
  ctx.font = 'bold 22px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`${skor}%`, W - 115, 63)

  // avatar
  const avatarBuf = opsi.avatar || null
  let img = null
  if (avatarBuf) {
    try {
      img = await loadImage(avatarBuf)
    } catch {
      img = null
    }
  }
  const cx = 130
  const cy = 210
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, 66, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  if (img) {
    const sisi = Math.min(img.width, img.height)
    ctx.drawImage(img, (img.width - sisi) / 2, (img.height - sisi) / 2, sisi, sisi, cx - 66, cy - 66, 132, 132)
  } else {
    ctx.fillStyle = warna
    ctx.fillRect(cx - 66, cy - 66, 132, 132)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 62px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(nama).replace(/^@/, '').charAt(0).toUpperCase() || '?', cx, cy + 3)
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(cx, cy, 66, 0, Math.PI * 2)
  ctx.lineWidth = 5
  ctx.strokeStyle = TINTA
  ctx.stroke()

  // nama
  ctx.fillStyle = TINTA
  ctx.font = 'bold 30px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(potongTeks(ctx, nama, 240), cx, 306)

  if (kategori) {
    ctx.fillStyle = '#555555'
    ctx.font = '18px sans-serif'
    ctx.fillText(potongTeks(ctx, kategori, 240), cx, 336)
  }

  // skor besar
  kotakNeo(ctx, 300, 120, 260, 150, { isi: '#ffffff', radius: 20, tebal: 4, bayangan: 6 })
  ctx.fillStyle = warna
  ctx.font = 'bold 86px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${skor}%`, 430, 190)
  ctx.fillStyle = '#666666'
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText('HASIL PENGECEKAN', 430, 246)

  // meter
  const mx = 300
  const my = 292
  const mw = 570
  const mh = 34
  kotakNeo(ctx, mx, my, mw, mh, { isi: '#f0e6cf', radius: 17, tebal: 3, bayangan: 5 })
  ctx.save()
  bulat(ctx, mx, my, mw * (skor / 100), mh, 17)
  ctx.clip()
  ctx.fillStyle = warna
  ctx.fillRect(mx, my, mw * (skor / 100), mh)
  ctx.restore()

  // vonis
  kotakNeo(ctx, 300, 350, 570, 130, { isi: '#fff7d6', radius: 18, tebal: 3.5, bayangan: 6 })
  ctx.fillStyle = TINTA
  ctx.font = 'bold 21px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  const baris = bungkusTeks(ctx, vonis, 520, 4)
  baris.forEach((b, i) => ctx.fillText(b, 322, 372 + i * 30))

  // footer
  ctx.fillStyle = '#7a7a7a'
  ctx.font = '17px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Usanagi Umi AI · hasil acak untuk hiburan, jangan dibawa serius ya', W / 2, 512)

  return canvas.toBuffer('image/png')
}

export default { renderKartuCek, ambilAvatar, bungkusTeks, tanpaEmoji }
