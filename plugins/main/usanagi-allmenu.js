/* By AlzRiss - Usanagi Umi AI
 *
 * .allmenu — daftar SELURUH perintah (versi teks, isi tidak diubah).
 *
 * Perbaikan Task106: isi menu dulu dimasukkan ke *footer* tombol. Footer
 * WhatsApp punya batas panjang kecil, jadi teks 72 ribu karakter terpotong
 * dan pengguna melihat menu "kosong / kepotong". Sekarang:
 *   1. header bertombol (media + tombol MENU UTAMA) — tetap seperti dulu;
 *   2. isi lengkap dikirim sebagai pesan teks bertahap (maks ~30 rb per pesan).
 */

import { settings } from '../../config/settings.js'
import { prepareWAMessageMedia } from '@rexxhayanasi/elaina-baileys'
import { buildFullMenuText, getGreeting, resolveMenuMention } from '../../lib/awang-menu.js'
import { ButtonV2 } from '../../lib/awang-tombol.js'
import { readMenuMedia } from '../../lib/menu-media.js'

const MAX_CHUNK = 30000

/** Bagi teks per baris supaya tidak memotong perintah di tengah jalan. */
export function splitMenuText(value, maxLength = MAX_CHUNK) {
  const lines = String(value || '').split('\n')
  const chunks = []
  let current = ''
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line
    if (candidate.length > maxLength && current) {
      chunks.push(current)
      current = line
    } else if (candidate.length > maxLength) {
      chunks.push(line.slice(0, maxLength))
      current = line.slice(maxLength)
    } else {
      current = candidate
    }
  }
  if (current) chunks.push(current)
  return chunks.filter(Boolean)
}

const handler = async (m, { conn, usedPrefix }) => {
  const mention = await resolveMenuMention(m, conn)
  const subtitle = `${getGreeting()} ${mention.text}`
  const fullText = buildFullMenuText({ prefix: usedPrefix })

  // 1) Header bertombol, footer singkat (bukan isi menu).
  try {
    const button = new ButtonV2(conn)
      .setTitle(settings.botName)
      .setSubtitle(subtitle)
      .setContextInfo({ mentionedJid: mention.jid ? [mention.jid] : [] })
      .setBody('Semua perintah dikirim setelah pesan ini.')
      .setFooter(`By AlzRiss - Usanagi Umi AI · ${usedPrefix}menu`)

    const menuMedia = readMenuMedia(conn)
    const preparedMedia = await prepareWAMessageMedia(
      menuMedia.type === 'image'
        ? { image: menuMedia.data, mimetype: menuMedia.mimetype }
        : { video: menuMedia.data, mimetype: menuMedia.mimetype, gifPlayback: true },
      { upload: conn.waUploadToServer }
    )
    if (preparedMedia.imageMessage) button.setMedia({ headerType: 4, imageMessage: preparedMedia.imageMessage })
    if (preparedMedia.videoMessage) button.setMedia({ headerType: 5, videoMessage: preparedMedia.videoMessage })

    button.addButton('⌂ MENU UTAMA', `${usedPrefix}menu`)
    await button.send(m.chat, { quoted: m.raw })
  } catch (error) {
    console.warn('[ALLMENU] header tombol gagal, lanjut kirim teks:', error?.message || error)
  }

  // 2) Isi menu lengkap — tidak lagi bergantung pada footer.
  const chunks = splitMenuText(fullText)
  for (let index = 0; index < chunks.length; index += 1) {
    await conn.sendMessage(
      m.chat,
      {
        text: chunks.length > 1 ? `${chunks[index]}\n\n— bagian ${index + 1}/${chunks.length} —` : chunks[index],
        mentions: mention.jid ? [mention.jid] : [],
      },
      index === 0 ? { quoted: m.raw } : {}
    )
  }
}

handler.command = /^allmenu$/i
handler.help = ['allmenu']
handler.tags = ['main']
handler.description = 'Menampilkan seluruh menu dalam satu tampilan lengkap'
handler.all = false

export default handler
