/* By AlzRiss - Usanagi Umi AI
 *
 * Setelan filter "Auto-AI jangan balas sesama bot".
 *
 *   {prefix}setbotfilter                 → status filter
 *   {prefix}setbotfilter on|off          → aktifkan / matikan filter
 *   {prefix}setbotfilter web on|off      → [hati-hati] anggap semua device web sebagai bot
 *   {prefix}setbotfilter stopper on|off  → pemutus loop otomatis (≥4 balasan/60 detik)
 *   {prefix}setbotfilter add <nomor>     → tambah nomor bot lain ke daftar pantau
 *   {prefix}setbotfilter del <nomor>     → hapus dari daftar pantau
 *   {prefix}setbotfilter list            → lihat daftar pantau
 *   {prefix}setbotfilter cek             → periksa pesan yang di-reply (bukan bot atau bukan)
 *
 * Nomor bot milik kita sendiri (bot utama + semua sesi jadibot di server ini)
 * selalu difilter otomatis, tidak perlu dimasukkan ke daftar.
 */
import {
  getBotFilterSettings, updateBotFilter, addBotNumber, removeBotNumber,
  detectBotMessage, normalizeNumber,
} from '../../lib/bot-filter.js'

const STATUS = (prefix) => {
  const s = getBotFilterSettings()
  return [
    '🤖 *FILTER AUTO-AI (pesan sesama bot)*',
    '',
    `Filter           : *${s.enabled ? 'AKTIF' : 'NONAKTIF'}*`,
    `Mode device web  : *${s.filterWebDevice ? 'AKTIF' : 'NONAKTIF'}*`,
    `Pemutus loop     : *${s.stopper ? 'AKTIF' : 'NONAKTIF'}* (${4} balasan / 60 detik)`,
    `Nomor pantau     : *${s.numbers.length}* nomor`,
    '',
    'Yang selalu dilewati Auto-AI:',
    '• nomor bot kita sendiri (bot utama + semua jadibot)',
    '• nomor di daftar pantau',
    '• pesan buatan library (device tidak dikenal / id BAE5)',
    '• pesan interaktif buatan API (tombol/list/template)',
    '',
    'Cara pakai:',
    `${prefix}setbotfilter on|off`,
    `${prefix}setbotfilter web on|off`,
    `${prefix}setbotfilter stopper on|off`,
    `${prefix}setbotfilter add <nomor>`,
    `${prefix}setbotfilter del <nomor>`,
    `${prefix}setbotfilter list`,
    `${prefix}setbotfilter cek (reply pesan yang mau diperiksa)`,
  ].join('\n')
}

const handler = async (m, { conn, usedPrefix, isOwner, isROwner, botConfig }) => {
  if (!isOwner && !isROwner) {
    return conn.sendMessage(m.chat, { text: 'Perintah ini hanya untuk owner bot.' }, { quoted: m.raw })
  }

  const parts = (Array.isArray(m.args) && m.args.length ? m.args : String(m.text || '').trim().split(/\s+/))
    .map(value => String(value)).filter(Boolean)
  if (parts.length && /^setbotfilter$/i.test(parts[0])) parts.shift()
  const action = String(parts[0] || '').toLowerCase()
  const value = String(parts[1] || '').toLowerCase()

  if (!action) return conn.sendMessage(m.chat, { text: STATUS(usedPrefix) }, { quoted: m.raw })

  if (action === 'on' || action === 'off') {
    const settings = updateBotFilter({ enabled: action === 'on' })
    return conn.sendMessage(m.chat, {
      text: settings.enabled
        ? '✅ Filter bot *diaktifkan*. Auto-AI tidak akan membalas pesan sesama bot.'
        : '⚠️ Filter bot *dimatikan*. Auto-AI bisa membalas pesan bot lain lagi.',
    }, { quoted: m.raw })
  }

  if (action === 'web') {
    if (value !== 'on' && value !== 'off') {
      const s = getBotFilterSettings()
      return conn.sendMessage(m.chat, {
        text: `Mode device web saat ini: *${s.filterWebDevice ? 'AKTIF' : 'NONAKTIF'}*\n\n`
          + `${usedPrefix}setbotfilter web on\n${usedPrefix}setbotfilter web off\n\n`
          + 'Catatan: mode ini juga melewati orang yang chat dari WhatsApp Web, jadi hanya pakai kalau grup benar-benar penuh bot.',
      }, { quoted: m.raw })
    }
    const settings = updateBotFilter({ filterWebDevice: value === 'on' })
    return conn.sendMessage(m.chat, {
      text: settings.filterWebDevice
        ? '✅ Mode device web *diaktifkan*. Semua pesan dari perangkat web dianggap bot.'
        : '✅ Mode device web *dimatikan*. Pesan dari WhatsApp Web dilayani seperti biasa.',
    }, { quoted: m.raw })
  }

  if (action === 'stopper') {
    if (value !== 'on' && value !== 'off') {
      const s = getBotFilterSettings()
      return conn.sendMessage(m.chat, {
        text: `Pemutus loop saat ini: *${s.stopper ? 'AKTIF' : 'NONAKTIF'}*\n\n${usedPrefix}setbotfilter stopper on|off`,
      }, { quoted: m.raw })
    }
    const settings = updateBotFilter({ stopper: value === 'on' })
    return conn.sendMessage(m.chat, { text: `Pemutus loop: *${settings.stopper ? 'AKTIF' : 'NONAKTIF'}*` }, { quoted: m.raw })
  }

  if (action === 'add') {
    if (!parts[1]) return conn.sendMessage(m.chat, { text: `Contoh: ${usedPrefix}setbotfilter add 628123456789` }, { quoted: m.raw })
    const result = addBotNumber(parts[1])
    if (!result.ok) return conn.sendMessage(m.chat, { text: `Gagal: ${result.reason}` }, { quoted: m.raw })
    return conn.sendMessage(m.chat, {
      text: result.added
        ? `✅ ${result.number} masuk daftar pantau. Pesannya tidak akan dibalas Auto-AI.`
        : `ℹ️ ${result.number} sudah ada di daftar pantau.`,
    }, { quoted: m.raw })
  }

  if (action === 'del' || action === 'hapus') {
    if (!parts[1]) return conn.sendMessage(m.chat, { text: `Contoh: ${usedPrefix}setbotfilter del 628123456789` }, { quoted: m.raw })
    const result = removeBotNumber(parts[1])
    if (!result.ok) return conn.sendMessage(m.chat, { text: `Gagal: ${result.reason}` }, { quoted: m.raw })
    return conn.sendMessage(m.chat, { text: `🗑️ ${result.number} dihapus dari daftar pantau.` }, { quoted: m.raw })
  }

  if (action === 'list') {
    const s = getBotFilterSettings()
    if (!s.numbers.length) return conn.sendMessage(m.chat, { text: 'Daftar pantau masih kosong.' }, { quoted: m.raw })
    return conn.sendMessage(m.chat, {
      text: `📋 *Daftar pantau bot* (${s.numbers.length})\n\n` + s.numbers.map((n, i) => `${i + 1}. ${n}`).join('\n'),
    }, { quoted: m.raw })
  }

  if (action === 'cek') {
    const target = m.quoted || m
    const detection = detectBotMessage(target, conn, botConfig)
    return conn.sendMessage(m.chat, {
      text: [
        '🔍 *Pemeriksaan pesan*',
        '',
        `Pengirim   : ${target.sender || '-'}`,
        `Nomor      : ${normalizeNumber(target.sender) || '-'}`,
        `Device     : ${detection.device}`,
        `Skor       : ${detection.score}`,
        `Keputusan  : *${detection.bot ? 'BOT' : 'BUKAN BOT'}*`,
        detection.reason ? `Alasan     : ${detection.reason}` : '',
        '',
        detection.bot
          ? 'Pesan seperti ini akan dilewati Auto-AI.'
          : 'Pesan seperti ini akan dilayani Auto-AI.',
      ].filter(Boolean).join('\n'),
    }, { quoted: m.raw })
  }

  return conn.sendMessage(m.chat, { text: STATUS(usedPrefix) }, { quoted: m.raw })
}

handler.command = /^(setbotfilter|botfilter)$/i
handler.help = ['setbotfilter [on|off|web|stopper|add|del|list|cek]']
handler.tags = ['owner']
handler.description = 'Mengatur filter Auto-AI agar tidak membalas pesan sesama bot'
handler.owner = true

export default handler
