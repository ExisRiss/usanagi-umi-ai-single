/* By AlzRiss - Usanagi Umi AI
 *
 * IQONTACT — kartu kontak gaya iOS (Task182)
 *
 * Sumber: kiriman owner (iqontact.js, gaya bot lain: npm i canvas + handler
 * manual). Disesuaikan dengan bot ini:
 *   • canvas → @napi-rs/canvas (dependensi resmi repo)
 *   • prefix/parse command diserahkan ke framework handler
 *   • jam kartu memakai timezone bot (config/settings.js → Asia/Makassar/WITA)
 *
 * Pakai:
 *   iqontact <nama> | <nomor>              → tema default (gelap)
 *   iqontact <nama> | <nomor> | light      → tema terang
 */

import { createCanvas, loadImage } from '@napi-rs/canvas'
import { settings } from '../../config/settings.js'

const W = 720, H = 1000

const cfg = {
  separator: '|',
  defaultTheme: 'dark',
  accent: '#25d366',
  fontFamily: 'sans-serif',
  maxNameLength: 25,
  countryCode: '62',
  themes: {
    dark: { bg: '#000000', card: '#1c1c1e', text: '#ffffff', sub: '#8e8e93' },
    light: { bg: '#f2f2f7', card: '#ffffff', text: '#000000', sub: '#6c6c70' },
  },
  labels: { voice: 'Suara', video: 'Video', search: 'Cari' },
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

function box(ctx, x, y, w, h, r, fill) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
}

async function renderCard({ name, number, avatarUrl, themeName }) {
  const t = cfg.themes[themeName] || cfg.themes[cfg.defaultTheme]
  const f = cfg.fontFamily
  const c = createCanvas(W, H)
  const ctx = c.getContext('2d')

  ctx.fillStyle = t.bg
  ctx.fillRect(0, 0, W, H)

  /* Avatar bulat (avatar WA target → kosong = kotak tema seperti sumber) */
  const cx = W / 2, cy = 190, r = 130
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  try {
    ctx.drawImage(await loadImage(avatarUrl), cx - r, cy - r, r * 2, r * 2)
  } catch {
    ctx.fillStyle = t.card
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
  }
  ctx.restore()

  ctx.textAlign = 'center'
  ctx.fillStyle = t.text
  ctx.font = `bold 40px ${f}`
  ctx.fillText(name, cx, 385)
  ctx.fillStyle = t.sub
  ctx.font = `26px ${f}`
  ctx.fillText(prettyNumber(number, cfg.countryCode), cx, 430)

  const btns = [cfg.labels.voice, cfg.labels.video, cfg.labels.search]
  const bw = 210, gap = 20, sx = (W - (bw * 3 + gap * 2)) / 2
  btns.forEach((b, i) => {
    const x = sx + i * (bw + gap)
    box(ctx, x, 480, bw, 85, 16, t.card)
    ctx.fillStyle = cfg.accent
    ctx.font = `24px ${f}`
    ctx.fillText(b, x + bw / 2, 545)
  })

  const rows = cfg.rows
  box(ctx, 40, 610, W - 80, rows.length * 70 + 20, 18, t.card)
  rows.forEach(([l, v], i) => {
    const y = 660 + i * 70
    ctx.textAlign = 'left'
    ctx.fillStyle = t.text
    ctx.font = `25px ${f}`
    ctx.fillText(l.length > 26 ? l.slice(0, 26) + '…' : l, 70, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = t.sub
    ctx.fillText(v ? `${v}  ›` : '›', W - 70, y)
  })

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
handler.description = 'Kartu kontak gaya iOS dari nama & nomor, tema gelap/terang, jam WITA.'
handler.limit = false

export { renderCard }
export default handler
