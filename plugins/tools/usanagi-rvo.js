/* By AlzRiss - Usanagi Umi AI */

import { downloadMediaMessage } from '@rexxhayanasi/elaina-baileys'
import { getAllOwnerNumbers, normalizeNumber, resolveTargetPhoneNumber } from '../../lib/awang-cekakses.js'
import { getRvoMediaInfo, hasViewOnce } from '../../lib/rvo.js'

async function react(conn, m, emoji) {
  const raw = m.raw || m
  if (!raw?.key) return
  try {
    await conn.sendMessage(m.chat, { react: { text: emoji, key: raw.key } })
  } catch {}
}

async function isProtectedOwnerMessage(m, quoted, conn) {
  // Pesan yang dikirim akun bot sendiri selalu dianggap pesan owner.
  if (quoted?.fromMe === true || quoted?.vM?.key?.fromMe === true) return true

  const owners = new Set(getAllOwnerNumbers(conn))
  const botNumber = normalizeNumber(conn?.user?.id || conn?.user?.jid || '')
  if (botNumber) owners.add(botNumber)

  const candidates = [
    quoted?.sender,
    quoted?.participant,
    quoted?.vM?.participant,
    m.raw?.msg?.contextInfo?.participant,
  ].filter(Boolean)

  for (const candidate of candidates) {
    const number = await resolveTargetPhoneNumber(candidate, conn, m.chat).catch(() => '')
    if (number && owners.has(number)) return true
  }
  return false
}

async function downloadMedia(quotedMessage) {
  return downloadMediaMessage(
    quotedMessage,
    'buffer',
    {},
    {
      logger: {
        info: () => {},
        debug: () => {},
        error: () => {},
        warn: () => {},
        trace: () => {},
      },
    }
  )
}

const handler = async (m, { conn, usedPrefix, command }) => {
  const raw = m.raw || m
  const quoted = raw.quoted || m.quotedMessage
  const quotedMessage = quoted?.vM || quoted?.fakeObj || null
  const usage = `Reply foto, video, atau audio sekali lihat lalu ketik *${usedPrefix}${command}*.`

  if (!quoted || !quotedMessage?.message) {
    await react(conn, m, '❌')
    return m.reply(`💬 ${usage}`)
  }

  if (await isProtectedOwnerMessage(m, quoted, conn)) {
    await react(conn, m, '🔒')
    return m.reply('🔒 Pesan sekali lihat milik owner/developer dilindungi dan tidak dapat dibuka dengan RVO.')
  }

  if (!hasViewOnce(quotedMessage.message)) {
    await react(conn, m, '❌')
    return m.reply(`❌ Pesan yang direply bukan pesan sekali lihat.\n\n${usage}`)
  }

  const media = getRvoMediaInfo(quotedMessage.message)
  if (!media) {
    await react(conn, m, '❌')
    return m.reply('❌ Jenis pesan sekali lihat ini belum didukung. Gunakan pada foto, video, audio, atau dokumen.')
  }

  await react(conn, m, '⏳')

  try {
    /* Task181 — "Cannot derive from empty media key": Baileys versi terpasang
     * tidak selalu membuka bungkus viewOnceMessage(V2/Extension), sehingga
     * downloadMediaMessage menerima wrapper tanpa mediaKey. Sekarang node
     * media hasil unwrap lib/rvo.js (sudah pasti berisi mediaKey) yang
     * dikirim ulang dalam bentuk pesan polos. */
    if (!media.message?.mediaKey) {
      await react(conn, m, '❌')
      return m.reply('❌ Media sekali lihat sudah tidak tersedia (sudah dibuka atau kedaluwarsa). Minta dikirim ulang, lalu reply dengan .rvo.')
    }
    const untukDiunduh = {
      key: raw.quoted?.key || quoted?.key || {},
      message: { [`${media.type}Message`]: media.message },
    }
    const buffer = await downloadMedia(untukDiunduh)
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Media kosong atau sudah tidak tersedia.')

    const content = {
      [media.type]: buffer,
      mimetype: media.mimetype,
    }
    if (media.caption) content.caption = media.caption
    if (media.type === 'audio') content.ptt = media.ptt
    if (media.type === 'document') content.fileName = media.fileName

    await conn.sendMessage(m.chat, content, { quoted: raw })
    await react(conn, m, '✅')
  } catch (error) {
    console.error('[RVO]', error?.message || error)
    await react(conn, m, '❌')
    await m.reply(`❌ Gagal membuka pesan sekali lihat.\n\n> ${error?.message || 'Media tidak dapat diproses.'}`)
  }
}

handler.command = /^rvo$/i
handler.help = ['rvo (reply pesan sekali lihat)']
handler.tags = ['tools']
handler.category = 'tools'
handler.description = 'Membuka foto, video, atau audio sekali lihat; pesan owner/developer tetap dilindungi.'
handler.limit = false

export default handler
