/* By AlzRiss - Usanagi Umi AI
 *
 * FAKEDANA — gambar fake saldo DANA (Task181).
 *
 * Diport dari bot VanXone Multi Device (anya/maker/maker-fakedana.js,
 * karya Rin imup — https://whatsapp.com/channel/0029Vb6EHtR5Ui2gHMW9zX2x).
 * Perubahan port: axios → fetch bawaan Node, hasil dikirim sebagai buffer
 * (tanpa berkas sementara), penulisan aset dipindah ke assets/fakedana/.
 */

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ASSETS_DIR = join(process.cwd(), 'assets', 'fakedana')
const FONTS_DIR = join(ASSETS_DIR, 'fonts')
const FONT_PATH = join(FONTS_DIR, 'PlusJakartaSans-SemiBold.ttf')
const BG_LOCAL = join(ASSETS_DIR, 'fkedana.png')
const EYE_LOCAL = join(ASSETS_DIR, 'eye_icon.jpg')

const TTF_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/plus-jakarta-sans@latest/latin-600-normal.ttf'
const BG_URL = 'https://raw.githubusercontent.com/ryyntwx/Image-rinn/refs/heads/main/fkedana.png'
const EYE_URL = 'https://raw.githubusercontent.com/ryyntwx/Image-rinn/refs/heads/main/IMG-20260726-WA1031.jpg'

async function unduhKe(path, url) {
  if (existsSync(path)) return
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`Gagal unduh aset (${res.status}): ${url}`)
  await writeFile(path, Buffer.from(await res.arrayBuffer()))
}

const handler = async (m, { conn, text, command, usedPrefix }) => {
  if (!text) return m.reply(`*Format salah!*\n\nContoh:\n${usedPrefix}${command} 50.000`)

  try {
    await m.reply('⏳ Memproses Fake Saldo DANA...')

    await mkdir(FONTS_DIR, { recursive: true })
    await unduhKe(FONT_PATH, TTF_URL)
    await unduhKe(BG_LOCAL, BG_URL)
    await unduhKe(EYE_LOCAL, EYE_URL)

    GlobalFonts.registerFromPath(FONT_PATH, 'DANA')

    const bgImg = await loadImage(BG_LOCAL)
    const eyeImg = await loadImage(EYE_LOCAL)

    const canvas = createCanvas(bgImg.width, bgImg.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height)

    const valX = 138
    const valY = 52
    const maxFontSize = 37
    const eyeGap = 7
    const eyeScale = 1.3

    const inputSaldo = text.trim()
    let currentFontSize = maxFontSize
    const maxAllowedWidth = canvas.width - valX - 100

    ctx.font = `600 ${currentFontSize}px DANA`
    let textWidth = ctx.measureText(inputSaldo).width
    while (textWidth > maxAllowedWidth && currentFontSize > 16) {
      currentFontSize -= 2
      ctx.font = `600 ${currentFontSize}px DANA`
      textWidth = ctx.measureText(inputSaldo).width
    }

    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(inputSaldo, valX, valY)

    const eyeHeight = currentFontSize * eyeScale
    const eyeWidth = (eyeImg.width / eyeImg.height) * eyeHeight
    const eyeX = valX + textWidth + eyeGap
    const eyeY = valY + (currentFontSize - eyeHeight) / 2
    ctx.drawImage(eyeImg, eyeX, eyeY, eyeWidth, eyeHeight)

    const buffer = await canvas.encode('png')
    await conn.sendMessage(m.chat, {
      image: buffer,
      caption: `— *FAKE SALDO DANA* —\n\n✎ *Nominal:* Rp ${inputSaldo}`,
    }, { quoted: m })
  } catch (e) {
    console.error('[fakedana]', e)
    await m.reply(`❌ Gagal membuat canvas Fake DANA\n\n${e.message}`)
  }
}

handler.help = ['fakedana <nominal>']
handler.tags = ['maker']
handler.category = 'maker'
handler.command = /^(fakedana|danafake|fakedan)$/i
handler.description = 'Buat gambar fake saldo DANA dari nominal teks (port VanXone/Rin imup).'
handler.limit = false

export default handler
