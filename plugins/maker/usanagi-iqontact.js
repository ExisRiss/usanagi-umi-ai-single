/* By AlzRiss - Usanagi Umi AI
 *
 * IQONTACT — kartu kontak gaya iOS (Task182) → TAMPILAN WHATSAPP (Task183)
 *
 * Task183 (keluhan owner: "kaku, harus benar-benar mirip tampilan WA"):
 * kartu dirender seperti halaman "Info kontak" WhatsApp:
 *   • latar hero gradiat lembut, avatar bulat besar + shadow + titik online
 *   • nama tebal, nomor format +62, baris About "Halo! Saya menggunakan WhatsApp."
 *   • tiga tombol bundar hijau (Pesan/Audio/Video) — bukan kotak kaku
 *   • section card rounded dengan PEMISAH TIPIS antar baris (gaya WA)
 *   • palet gelap/terang persis WhatsApp (#111b21 / #ffffff, #e9edef / #111b21)
 *
 * Pakai:
 *   iqontact <nama> | <nomor>              → tema gelap (default)
 *   iqontact <nama> | <nomor> | light      → tema terang
 */

import { createCanvas, loadImage } from '@napi-rs/canvas'
import { settings } from '../../config/settings.js'

const W = 720, H = 1060

const cfg = {
  separator: '|',
  defaultTheme: 'dark',
  fontFamily: 'sans-serif',
  maxNameLength: 25,
  countryCode: '62',
  aboutText: 'Halo! Saya menggunakan WhatsApp.',
  themes: {
    dark: {
      bg: '#111b21', hero: '#0b141a', card: '#202c33',
      text: '#e9edef', sub: '#8696a0', divider: 'rgba(255,255,255,.07)',
      accent: '#00a884', dot: '#25d366', chevron: '#8696a0',
    },
    light: {
      bg: '#ffffff', hero: '#f7f8fa', card: '#f7f8fa',
      text: '#111b21', sub: '#667781', divider: '#e9edef',
      accent: '#25d366', dot: '#25d366', chevron: '#667781',
    },
  },
  labels: { chat: 'Pesan', audio: 'Audio', video: 'Video' },
  rows: [
    ['Media, tautan & dok', '14'],
    ['Kosongkan sebagian penyimpanan', '49,9 MB'],
    ['Berbintang', 'Tidak ada'],
    ['Notifikasi', ''],
    ['Tema obrolan', ''],
  ],
  caption: ({ name, number, jam }) =>
`乂 I Q O N T A C T  I O S

┌─ *Informasi Kontak*
│ ◦ Nama  : *${name}*
│ ◦ Nomor : ${number}
│ ◦ Jam   : *${jam}*
└────`,
  usage: (prefix) => `Format salah.\nContoh: ${prefix}iqontact Gebii | 628587887652\nTema: ${prefix}iqontact Gebii | 628587887652 | light`,
  invalidNumber: 'Nomor tidak valid.',
}

function cleanNumber(raw, cc) {
  let n = String(raw).replace(/\D/g, '')
  if (n.startsWith('0')) n = cc + n.slice(1)
  return n
}

function prettyNumber(n, cc) {
  if (n.startsWith(cc)) {
    const r = n.slice(cc.length)
    return `+${cc} ${r.slice(0, 3)}-${r.slice(3, 7)}-${r.slice(7)}`
  }
  return '+' + n
}

function getJam(tz) {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
  }).format(new Date()).replace(':', '.')
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function fitFont(ctx, text, maxW, size, weight, family) {
  let s = size
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 1 }
  while (ctx.measureText(text).width > maxW && s > 16)
}

/* ── ikon putih untuk tombol aksi (digambar vektor, tak butuh font emoji) ── */

function ikonChat(ctx, cx, cy, warnaIkon) {
  ctx.fillStyle = warnaIkon
  roundRectPath(ctx, cx - 23, cy - 19, 46, 34, 11)
  ctx.fill()
  /* ekor gelembung */
  ctx.beginPath()
  ctx.moveTo(cx - 14, cy + 12)
  ctx.lineTo(cx - 23, cy + 23)
  ctx.lineTo(cx - 4, cy + 14)
  ctx.closePath()
  ctx.fill()
}

function ikonAudio(ctx, cx, cy, warnaIkon) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-Math.PI / 4)
  ctx.fillStyle = warnaIkon
  /* gagang telepon klasik: bar + dua ujung bulat besar */
  roundRectPath(ctx, -24, -7, 48, 14, 7)
  ctx.fill()
  ctx.beginPath(); ctx.ellipse(-24, -4, 11, 14, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(24, 4, 11, 14, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function ikonVideo(ctx, cx, cy, warnaIkon) {
  ctx.fillStyle = warnaIkon
  roundRectPath(ctx, cx - 25, cy - 16, 42, 32, 9)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx + 16, cy - 12)
  ctx.lineTo(cx + 30, cy)
  ctx.lineTo(cx + 16, cy + 12)
  ctx.closePath()
  ctx.fill()
}

async function renderCard({ name, number, avatarUrl, themeName }) {
  const t = cfg.themes[themeName] || cfg.themes[cfg.defaultTheme]
  const f = cfg.fontFamily
  const c = createCanvas(W, H)
  const ctx = c.getContext('2d')

  /* latar + hero gradiat lembut */
  ctx.fillStyle = t.bg
  ctx.fillRect(0, 0, W, H)
  const hero = ctx.createRadialGradient(W / 2, -60, 60, W / 2, 60, 430)
  hero.addColorStop(0, t.hero)
  hero.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = hero
  ctx.fillRect(0, 0, W, 470)

  const cx = W / 2, cy = 165, r = 112

  /* avatar bulat + shadow */
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.35)'
  ctx.shadowBlur = 34
  ctx.shadowOffsetY = 12
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = t.card
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  try {
    ctx.drawImage(await loadImage(avatarUrl), cx - r, cy - r, r * 2, r * 2)
  } catch {
    ctx.fillStyle = t.card
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    /* siluet orang standar WA saat tak ada foto */
    ctx.fillStyle = t.divider
    ctx.beginPath(); ctx.arc(cx, cy - 26, 40, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(cx, cy + 96, 76, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()

  /* titik online */
  ctx.beginPath()
  ctx.arc(cx + 82, cy + 82, 17, 0, Math.PI * 2)
  ctx.fillStyle = t.bg
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx + 82, cy + 82, 13, 0, Math.PI * 2)
  ctx.fillStyle = t.dot
  ctx.fill()

  /* nama, nomor, about */
  ctx.textAlign = 'center'
  ctx.fillStyle = t.text
  fitFont(ctx, name, 640, 42, 'bold', f)
  ctx.fillText(name, cx, 356)

  ctx.fillStyle = t.sub
  ctx.font = `26px ${f}`
  ctx.fillText(prettyNumber(number, cfg.countryCode), cx, 400)

  fitFont(ctx, cfg.aboutText, 620, 21, 'italic', f)
  ctx.fillStyle = t.sub
  ctx.fillText(cfg.aboutText, cx, 436)

  /* tiga tombol bundar aksi */
  const aksi = [
    { ikon: ikonChat, label: cfg.labels.chat },
    { ikon: ikonAudio, label: cfg.labels.audio },
    { ikon: ikonVideo, label: cfg.labels.video },
  ]
  const d = 96, jarak = 68
  const sx = W / 2 - d - jarak
  aksi.forEach((a, i) => {
    const bx = sx + i * (d + jarak)
    const by = 480
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,.28)'
    ctx.shadowBlur = 16
    ctx.shadowOffsetY = 6
    ctx.beginPath()
    ctx.arc(bx + d / 2, by + d / 2, d / 2, 0, Math.PI * 2)
    ctx.fillStyle = a.ikon === ikonAudio ? t.accent : t.accent
    ctx.fill()
    ctx.restore()
    a.ikon(ctx, bx + d / 2, by + d / 2, '#ffffff')
    ctx.textAlign = 'center'
    ctx.fillStyle = t.sub
    ctx.font = `19px ${f}`
    ctx.fillText(a.label, bx + d / 2, by + d + 30)
  })

  /* section card ala WA: baris + pemisah tipis */
  const baris = cfg.rows
  const tinggiBaris = 68
  const y0 = 640
  const tinggi = baris.length * tinggiBaris + 24
  roundRectPath(ctx, 24, y0, W - 48, tinggi, 18)
  ctx.fillStyle = t.card
  ctx.fill()

  baris.forEach(([label, nilai], i) => {
    const y = y0 + 24 + i * tinggiBaris
    if (i > 0) {
      ctx.fillStyle = t.divider
      ctx.fillRect(68, y, W - 92 - 24 + 24 - 24, 1.5)
    }
    ctx.textAlign = 'left'
    ctx.fillStyle = t.text
    ctx.font = `24px ${f}`
    let teks = label
    while (ctx.measureText(teks).width > W - 240 && teks.length > 6) teks = teks.slice(0, -2)
    if (teks !== label) teks += '…'
    ctx.fillText(teks, 68, y + tinggiBaris / 2 + 9)

    ctx.textAlign = 'right'
    ctx.fillStyle = t.sub
    ctx.font = `22px ${f}`
    const nilaiTeks = nilai ? `${nilai}   ›` : '›'
    ctx.fillText(nilaiTeks, W - 60, y + tinggiBaris / 2 + 8)
  })

  /* caption kecil bawah — sentuhan WA */
  ctx.textAlign = 'center'
  ctx.fillStyle = t.sub
  ctx.font = `italic 17px ${f}`
  ctx.fillText('WhatsApp', W / 2, H - 28)

  return await c.encode('png')
}

const handler = async (m, { conn, args, usedPrefix }) => {
  const teks = args.join(' ').trim()
  const [name, rawNumber, themeName] = teks.split('|').map((s) => s.trim())
  if (!name || !rawNumber) return m.reply(cfg.usage(usedPrefix))

  const number = cleanNumber(rawNumber, cfg.countryCode)
  if (number.length < 8 || number.length > 15) return m.reply(cfg.invalidNumber)

  let avatarUrl = null
  try { avatarUrl = await conn.profilePictureUrl(number + '@s.whatsapp.net', 'image') } catch { /* tanpa avatar */ }

  try {
    const image = await renderCard({
      name: name.slice(0, cfg.maxNameLength),
      number,
      avatarUrl,
      themeName: (themeName || cfg.defaultTheme).toLowerCase(),
    })
    await conn.sendMessage(m.chat, {
      image,
      caption: cfg.caption({ name, number, jam: getJam(settings.timezone) }),
    }, { quoted: m.raw || m })
  } catch (err) {
    console.error('[iqontact]', err)
    await m.reply(`Gagal membuat kartu kontak: ${err?.message || 'coba lagi.'}`)
  }
}

handler.command = /^(iqontact)$/i
handler.help = ['iqontact <nama> | <nomor> [dark|light]']
handler.tags = ['maker']
handler.category = 'maker'
handler.description = 'Kartu kontak gaya halaman Info Kontak WhatsApp (avatar+titik online, tombol bundar hijau), jam WITA.'
handler.limit = false

export { renderCard }
export default handler
