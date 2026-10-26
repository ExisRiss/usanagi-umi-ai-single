/* By AlzRiss - Usanagi Umi AI
 *
 * Setelan prefix.
 *
 *   {prefix}setprefix                → lihat prefix aktif
 *   {prefix}setprefix <p>            → prefix untuk chat ini (owner / admin grup / chat pribadi)
 *   {prefix}setprefix default        → kembalikan chat ini ke prefix default bot
 *   {prefix}setprefix global <p>     → [owner] default semua chat bot ini
 *                                      (di bot utama tersimpan di data/prefix-settings.json;
 *                                       di jadibot tersimpan di config sesi jadibot itu sendiri)
 *
 * Semua menu dan pesan perintah otomatis memakai prefix ini.
 */
import { setPrefix, resetPrefix, syncMainPrefix, clearScopedPrefixes } from '../../core/awang-prefix.js'
import { normalizePrefixMode, describePrefixMode, isPrefixMode, PREFIX_MODE_STRICT, PREFIX_MODE_LOOSE } from '../../lib/prefix-policy.js'
import { saveDefaultPrefix, savePrefixMode, isValidPrefix } from '../../core/awang-prefix-text.js'
import { saveJadibotConfig } from '../../lib/bot-config.js'
import { clearPrefixRewriteCache } from '../../lib/prefix-rewrite.js'

const HELP = (p, mode = PREFIX_MODE_STRICT) => [
  `Prefix aktif saat ini: *${p}*`,
  `Mode prefix: *${normalizePrefixMode(mode)}* — ${describePrefixMode(mode)}`,
  '',
  'Cara pakai:',
  `${p}setprefix <prefix_baru>      → untuk chat ini`,
  `${p}setprefix default            → kembali ke prefix default`,
  `${p}setprefix global <prefix>    → [owner] default semua chat bot ini`,
  `${p}setprefix mode strict        → hanya prefix yang disetel yang jalan (disarankan)`,
  `${p}setprefix mode loose         → simbol prefix lain masih diterima`,
].join('\n')

const handler = async (m, { conn, usedPrefix, botConfig, prefixStorageKey, isOwner, isAdmin, isROwner }) => {
  /*
   * Plugin `usanagi-*` menerima `m.text` TANPA nama perintah (runtime sudah
   * memotong prefix + command) dan `m.args` berisi argumennya. Versi lama
   * membaca `m.text` seolah-olah masih memuat "setprefix", sehingga:
   *   .setprefix !        -> parts = ["!"]        -> parts[1] kosong -> hanya HELP
   *   .setprefix global ! -> parts = ["global","!"] -> parts[1] = "!" -> dianggap per-chat
   * Akibatnya prefix global tidak pernah tersimpan (bug dilaporkan 24-10-2026).
   * Di sini argumen diambil dari `m.args`, dengan cadangan `m.text`, dan nama
   * perintah dibuang kalau runtime lain masih menyertakannya.
   */
  const rawText = String(m.text || '').trim()
  let parts = Array.isArray(m.args) && m.args.length
    ? m.args.map(value => String(value))
    : rawText.split(/\s+/).filter(Boolean)
  if (parts.length && /^setprefix$/i.test(parts[0])) parts = parts.slice(1)
  const storageKey = prefixStorageKey || m.prefixStorageKey || m.chat
  const defaultPrefix = botConfig?.defaultPrefix || global.mainBot?.defaultPrefix || '.'
  const owner = Boolean(isOwner || isROwner)
  const isGlobal = String(parts[0] || '').toLowerCase() === 'global'
  const value = isGlobal ? parts[1] : parts[0]

  if (!value) return conn.sendMessage(m.chat, { text: HELP(usedPrefix, botConfig?.prefixMode) }, { quoted: m.raw })

  /* Task112 — mode prefix.
   *   strict : hanya prefix yang disetel yang dijalankan (bawaan).
   *   loose  : simbol lain masih diterima bila sisa teksnya nama perintah.
   * Disimpan per sesi jadibot supaya tidak mengganggu bot lain.
   */
  if (String(parts[0] || '').toLowerCase() === 'mode') {
    if (!owner) {
      return conn.sendMessage(m.chat, { text: 'Hanya owner yang boleh mengubah mode prefix.' }, { quoted: m.raw })
    }
    const wanted = String(parts[1] || '').toLowerCase()
    if (!wanted) {
      return conn.sendMessage(m.chat, {
        text: `Mode prefix bot ini: *${normalizePrefixMode(botConfig?.prefixMode)}*\n\n${describePrefixMode(botConfig?.prefixMode)}`,
      }, { quoted: m.raw })
    }
    if (!isPrefixMode(wanted)) {
      return conn.sendMessage(m.chat, {
        text: 'Pilihan mode: strict atau loose.\nContoh: .setprefix mode strict',
      }, { quoted: m.raw })
    }
    const next = normalizePrefixMode(wanted)
    if (botConfig) botConfig.prefixMode = next
    if (botConfig?.type === 'jadibot' && botConfig.file) {
      saveJadibotConfig(botConfig)
    } else {
      // Bot utama: disimpan di data/prefix-settings.json (berkas yang sama
      // dengan defaultPrefix), lalu dipakai handler pada pesan berikutnya.
      savePrefixMode(next)
      if (!global.mainBot) global.mainBot = {}
      global.mainBot.prefixMode = next
    }
    clearPrefixRewriteCache()
    return conn.sendMessage(m.chat, {
      text: `✅ Mode prefix: *${next}*\n${describePrefixMode(next)}\n\n` +
        (next === PREFIX_MODE_STRICT
          ? `Hanya *${botConfig?.defaultPrefix || usedPrefix}* yang akan dijalankan.`
          : 'Simbol prefix lain masih diterima selama sisa teksnya nama perintah.'),
    }, { quoted: m.raw })
  }

  if (isGlobal) {
    if (!owner) {
      return conn.sendMessage(m.chat, { text: 'Hanya owner yang boleh mengubah prefix default semua chat.' }, { quoted: m.raw })
    }
    if (!isValidPrefix(value)) {
      return conn.sendMessage(m.chat, { text: 'Prefix harus 1–3 karakter tanpa spasi.' }, { quoted: m.raw })
    }

    if (botConfig?.type === 'jadibot' && botConfig.file) {
      // Jadibot menyimpan default prefix di config sesinya sendiri.
      botConfig.defaultPrefix = value
      if (botConfig.values) botConfig.values.defaultPrefix = value
      saveJadibotConfig(botConfig)
      /* Task112 — baris prefix lama milik sesi ini harus ikut dibuang.
       * Tanpa ini, chat yang pernah memakai prefix "." tetap memakai "."
       * walaupun default sudah "/", lalu terlihat seperti filter prefix rusak. */
      try {
        if (botConfig.scope) clearScopedPrefixes(botConfig.scope)
      } catch {}
    } else {
      saveDefaultPrefix(value)
      if (!global.mainBot) global.mainBot = {}
      global.mainBot.defaultPrefix = value
      syncMainPrefix(value, `manual-${Date.now()}`)
    }
    clearPrefixRewriteCache()
    return conn.sendMessage(
      m.chat,
      { text: `Prefix default bot ini diubah menjadi: *${value}*\n\nContoh: ${value}menu\nSemua chat tanpa prefix khusus otomatis mengikuti.` },
      { quoted: m.raw }
    )
  }

  // Perubahan untuk satu chat: owner, admin grup, atau chat pribadi.
  const privateChat = String(m.chat || '').endsWith('@s.whatsapp.net')
  if (!owner && !isAdmin && !privateChat) {
    return conn.sendMessage(m.chat, { text: 'Hanya owner atau admin grup yang bisa mengubah prefix di grup ini.' }, { quoted: m.raw })
  }

  if (value.toLowerCase() === 'default') {
    clearPrefixRewriteCache()
    const reverted = await resetPrefix(storageKey, defaultPrefix)
    return conn.sendMessage(m.chat, { text: `Prefix chat ini dikembalikan ke default: *${reverted}*` }, { quoted: m.raw })
  }

  if (!isValidPrefix(value)) {
    return conn.sendMessage(m.chat, { text: 'Prefix harus 1–3 karakter tanpa spasi.' }, { quoted: m.raw })
  }

  await setPrefix(storageKey, value)
  clearPrefixRewriteCache()
  return conn.sendMessage(
    m.chat,
    { text: `Prefix chat ini diubah menjadi: *${value}*\n\nContoh: ${value}menu\nMenu & contoh perintah otomatis ikut memakai prefix ini.` },
    { quoted: m.raw }
  )
}

handler.command = /^setprefix$/i
handler.help = ['setprefix [global|default] <prefix>']
handler.tags = ['owner']
handler.description = 'Mengubah prefix bot (per chat atau default semua chat)'
handler.owner = false

export default handler
