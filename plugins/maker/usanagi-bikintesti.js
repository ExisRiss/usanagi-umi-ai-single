/* By AlzRiss - Usanagi Umi AI
 *
 * BIKINTESTI / BUATTESTI — kartu testimoni dari foto bukti transfer (Task182)
 *
 * Sumber: kiriman owner (bikintesti.js, gaya bot lain: npm i canvas + handler
 * manual). Disesuaikan dengan bot ini:
 *   • canvas → @napi-rs/canvas (dependensi resmi repo; node-canvas tak dipakai)
 *   • prefix/parse command diserahkan ke framework handler (owner bisa pakai
 *     .buattesti / /buattesti — tergantung prefix aktif)
 *   • penjejakan foto album memakai hook handler.all (framework bot ini
 *     menjalankan .all untuk SEMUA pesan, jadi 2 foto yang dikirim sebelum
 *     command tetap tercatat)
 *   • unduh media: pesan yang dibalas via m.quoted.download(); pesan dari
 *     cache via downloadMediaMessage (elaina-baileys, sama seperti .rvo)
 *
 * Pakai:
 *   1) Kirim 2 foto bukti transfer (boleh album).
 *   2) Reply salah satu foto dengan:  buattesti 628xxxxxxxxxx | @namatiktok
 *      (atau kirim foto ber-caption perintah itu)
 */

import { createCanvas, loadImage } from '@napi-rs/canvas'
import { downloadMediaMessage } from '@rexxhayanasi/elaina-baileys'

const BW = 1080, BH = 1350
const noopLogger = { info() {}, error() {}, warn() {}, debug() {}, trace() {}, fatal() {}, child() { return this } }

const cfg = {
  minImages: 2,
  maxImages: 2,
  imageMaxAgeMs: 10 * 60 * 1000,
  countryCode: '62',
  autoAt: true,
  maxNameLength: 30,
  format: 'jpeg',
  fontFamily: 'sans-serif',
  fit: 'contain',
  colors: {
    bgInner: '#2b2b2b', bgOuter: '#000000',
    frame: '#cfcfcf',
    slotBg: '#0b0b0b', slotBorder: '#e6e6e6',
    text: '#ffffff', accent: '#25d366',
  },
  texts: {
    title: 'TESTIMONI',
    tagline: "Thank you for trusting us, don't forget to come back",
    contact: 'CONTACT',
    waBadge: 'WA',
    ttBadge: 'TT',
  },
  caption: ({ number, name }) =>
`乂 B I K I N  T E S T I

◦ *Nomor:* ${number}
◦ *Nama:* ${name}

_Template testimoni berhasil dibuat._`,
  usage: (prefix) => `Format salah.\nKirim 2 foto bukti tf, lalu reply salah satunya dengan:\n${prefix}buattesti 628xxxxxxxxxx | @namatiktok`,
  needImages: 'Foto bukti tf kurang. Kirim 2 foto dulu (boleh album), lalu reply salah satunya dengan command-nya.',
  invalidNumber: 'Nomor tidak valid.',
}

/* Jejakan foto per chat:sender — diisi lewat hook handler.all. */
const cacheFoto = new Map()

function trackFoto(key, id, raw, ts = Date.now()) {
  const sekarang = Date.now()
  const list = (cacheFoto.get(key) || []).filter((e) => sekarang - e.ts < cfg.imageMaxAgeMs && e.id !== id)
  list.push({ id, ts, raw })
  cacheFoto.set(key, list.slice(-6))
}

function unwrapPesan(msg = {}) {
  let x = msg
  for (let i = 0; i < 4; i++) {
    const inner = x.ephemeralMessage?.message || x.viewOnceMessage?.message ||
      x.viewOnceMessageV2?.message || x.documentWithCaptionMessage?.message
    if (!inner) break
    x = inner
  }
  return x
}

/* ---------- helpers gambar (port dari sumber, tanpa perubahan mutu) ---------- */

/* Task183 — HD: kanvas diperbesar 2× (2160×2700) dengan smoothing kualitas
 * tinggi; semua koordinat tetap di ruang 1080×1350 lewat ctx.scale. Foto bukti
 * tf kini dirender tajam, bukan blur. */
const SKALA = 2

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r) }

function fitText(ctx, text, maxW, size, weight, family) {
  let s = size
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 2 }
  while (ctx.measureText(text).width > maxW && s > 14)
}

function drawImageFit(ctx, img, x, y, w, h, mode) {
  const k = mode === 'cover' ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height)
  const dw = img.width * k, dh = img.height * k
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

async function drawBackground(ctx) {
  const c = cfg.colors
  const g = ctx.createRadialGradient(BW / 2, BH * 0.4, 80, BW / 2, BH * 0.45, BH * 0.8)
  g.addColorStop(0, c.bgInner); g.addColorStop(1, c.bgOuter)
  ctx.fillStyle = g; ctx.fillRect(0, 0, BW, BH)
  const rnd = mulberry32(7)
  for (let i = 0; i < 160; i++) {
    ctx.globalAlpha = 0.15 + rnd() * 0.6
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(rnd() * BW, rnd() * BH, 0.5 + rnd() * 1.6, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawFrame(ctx) {
  const g = ctx.createLinearGradient(0, 0, BW, BH)
  g.addColorStop(0, '#fff'); g.addColorStop(0.5, cfg.colors.frame); g.addColorStop(1, '#777')
  ctx.strokeStyle = g
  ctx.lineWidth = 6; rr(ctx, 50, 50, BW - 100, BH - 100, 14); ctx.stroke()
  ctx.lineWidth = 2; rr(ctx, 68, 68, BW - 136, BH - 136, 8); ctx.stroke()
}

function drawTitle(ctx) {
  const f = cfg.fontFamily
  ctx.textAlign = 'center'
  fitText(ctx, cfg.texts.title, 820, 150, 'italic 900', f)
  const g = ctx.createLinearGradient(0, 170, 0, 300)
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#b5b5b5')
  g.addColorStop(0.55, '#6d6d6d'); g.addColorStop(1, '#e9e9e9')
  ctx.save()
  ctx.shadowColor = 'rgba(255,255,255,.35)'; ctx.shadowBlur = 28
  ctx.lineWidth = 12; ctx.strokeStyle = '#111'; ctx.lineJoin = 'round'
  ctx.strokeText(cfg.texts.title, BW / 2, 290)
  ctx.fillStyle = g; ctx.fillText(cfg.texts.title, BW / 2, 290)
  ctx.restore()
}

function drawSlots(ctx, images) {
  const n = images.length, sw = 420, sh = 720, gap = 40, y = 360
  const sx = (BW - (n * sw + (n - 1) * gap)) / 2
  images.forEach((img, i) => {
    const x = sx + i * (sw + gap)
    ctx.save()
    rr(ctx, x, y, sw, sh, 18); ctx.fillStyle = cfg.colors.slotBg; ctx.fill(); ctx.clip()
    drawImageFit(ctx, img, x, y, sw, sh, cfg.fit)
    ctx.restore()
    rr(ctx, x, y, sw, sh, 18)
    ctx.lineWidth = 4; ctx.strokeStyle = cfg.colors.slotBorder; ctx.stroke()
  })
}

function drawFooter(ctx, { number, name }) {
  const f = cfg.fontFamily, c = cfg.colors
  ctx.textAlign = 'center'
  ctx.fillStyle = c.text
  fitText(ctx, cfg.texts.tagline, 880, 26, 'italic', f)
  ctx.fillText(cfg.texts.tagline, BW / 2, 1140)

  const y = 1190, h = 80
  rr(ctx, 90, y, 900, h, 12)
  ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fill()
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke()

  rr(ctx, 108, y + 20, 40, 40, 10); ctx.fillStyle = c.accent; ctx.fill()
  ctx.fillStyle = '#fff'; ctx.font = `bold 18px ${f}`; ctx.textAlign = 'center'
  ctx.fillText(cfg.texts.waBadge, 128, y + 47)
  ctx.textAlign = 'left'; ctx.fillStyle = c.text
  fitText(ctx, number, 260, 30, 'bold', f)
  ctx.fillText(number, 160, y + 50)

  ctx.beginPath()
  ctx.moveTo(430, y); ctx.lineTo(650, y); ctx.lineTo(630, y + h); ctx.lineTo(450, y + h); ctx.closePath()
  ctx.fillStyle = '#ececec'; ctx.fill()
  ctx.fillStyle = '#111'; ctx.textAlign = 'center'
  fitText(ctx, cfg.texts.contact, 170, 32, '900', f)
  ctx.fillText(cfg.texts.contact, 540, y + 52)

  rr(ctx, 672, y + 20, 40, 40, 10); ctx.fillStyle = '#111'; ctx.fill()
  ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke()
  ctx.fillStyle = '#fff'; ctx.font = `bold 18px ${f}`; ctx.textAlign = 'center'
  ctx.fillText(cfg.texts.ttBadge, 692, y + 47)
  ctx.textAlign = 'left'
  fitText(ctx, name, 250, 30, 'bold', f)
  ctx.fillText(name, 724, y + 50)
}

async function renderTesti(buffers, info) {
  const canvas = createCanvas(BW * SKALA, BH * SKALA)
  const ctx = canvas.getContext('2d')
  ctx.scale(SKALA, SKALA)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const images = []
  for (const b of buffers) images.push(await loadImage(b))
  await drawBackground(ctx)
  drawFrame(ctx)
  drawTitle(ctx)
  drawSlots(ctx, images)
  drawFooter(ctx, info)
  return await canvas.encode('jpeg', 0.95)
}

/* ---------- command ---------- */

const handler = async (m, { conn, args, usedPrefix }) => {
  const teks = args.join(' ').trim()
  const [rawNumber, rawName] = teks.split('|').map((s) => s.trim())
  if (!rawNumber || !rawName) return m.reply(cfg.usage(usedPrefix))

  let number = rawNumber.replace(/\D/g, '')
  if (number.startsWith('0')) number = cfg.countryCode + number.slice(1)
  if (number.length < 8 || number.length > 15) return m.reply(cfg.invalidNumber)

  let name = rawName.slice(0, cfg.maxNameLength)
  if (cfg.autoAt && !name.startsWith('@')) name = '@' + name

  /* --- kumpulkan foto: reply → foto ber-caption perintah → cache 10 menit --- */
  const picks = new Map()
  const key = `${m.chat}:${m.sender}`
  const cached = cacheFoto.get(key) || []
  const raw = m.raw || m
  const isi = unwrapPesan(raw?.message || {})

  if (m.quoted && m.quoted.mtype === 'imageMessage') {
    picks.set(m.quoted.id, cached.find((e) => e.id === m.quoted.id) || { id: m.quoted.id, ts: 0, quoted: m.quoted })
  }
  if (isi.imageMessage) {
    picks.set(raw?.key?.id || m.key?.id, { id: raw?.key?.id || m.key?.id, ts: Date.now(), raw })
  }
  for (const e of [...cached].reverse()) {
    if (picks.size >= cfg.maxImages) break
    if (!picks.has(e.id)) picks.set(e.id, e)
  }

  const list = [...picks.values()].sort((a, b) => a.ts - b.ts).slice(-cfg.maxImages)
  if (list.length < cfg.minImages) return m.reply(cfg.needImages)

  await m.reply('⏳ Membuat kartu testimoni…')
  try {
    const buffers = await Promise.all(list.map(async (e) => {
      if (e.quoted) return e.quoted.download()
      const sumber = e.raw?.message ? e.raw : { key: { remoteJid: m.chat, id: e.id }, message: {} }
      return downloadMediaMessage(sumber, 'buffer', {}, { logger: noopLogger, reuploadRequest: conn.updateMediaMessage })
    }))
    for (const b of buffers) if (!Buffer.isBuffer(b) || !b.length) throw new Error('gambar gagal diunduh')
    const image = await renderTesti(buffers, { number, name })
    await conn.sendMessage(m.chat, { image, caption: cfg.caption({ number, name }) }, { quoted: m.raw || m })
  } catch (err) {
    console.error('[bikintesti]', err)
    await m.reply(`Gagal membuat testimoni: ${err?.message || 'coba lagi.'}`)
  }
}

/* Hook: jejaki foto bukti tf yang dikirim user (framework jalankan .all untuk semua pesan). */
handler.all = async function (m) {
  try {
    const raw = m.raw || m
    const isi = unwrapPesan(raw?.message || {})
    if (!isi.imageMessage) return
    const key = `${m.chat}:${m.sender}`
    trackFoto(key, raw?.key?.id || m.key?.id, raw)
  } catch { /* tracking tidak boleh mengganggu pesan lain */ }
}

handler.command = /^(bikintesti|buattesti)$/i
handler.help = ['buattesti <nomor> | <nama>']
handler.tags = ['maker']
handler.category = 'maker'
handler.description = 'Buat kartu testimoni dari 2 foto bukti transfer: reply fotonya dengan buattesti <nomor> | <nama>.'
handler.limit = false

export { renderTesti }
export default handler
