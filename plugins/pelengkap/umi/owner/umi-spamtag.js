/* Ported from Umi upstream — kredit penulis asli ada di CREDITS.md.
 *
 * Task186 — rewrite spamtag + spamht:
 *   • `/spamtag 50 @tag`          → tag target 50× ("@tag")
 *   • `/spamtag 50 @tag <pesan>`  → tag + pesan ("@tag <pesan>") 50×
 *   • `/spamtag 50 <pesan>`       → (dengan reply) tag pengirim pesan yang
 *                                   dibalas + <pesan>, 50×
 *   • `/spamtag 50 628xxx <pesan>`→ tag nomor langsung + <pesan>, 50×
 *   • `/spamht 50 [pesan]`        → spam hidetag: pesan dengan mention SEMUA
 *                                   member grup, 50× (khusus grup)
 *   • Batas atas dinaikkan ke 100 (MAKS), jaga 150 ms (lebih cepat dari
 *     versi lama 400 ms), dan SEMUA pesan spam dikirim TANPA quote —
 *     tidak ada balasan yang mengutip pesan perintah pengirim.
 */
import { mulaiReactLoading } from '../../../../lib/loading-react.js'

const MAKS = 100   // batas atas spam tag/hidetag (Task186: dari 50 → 100)
const JEDA = 150   // ms antar pesan (Task186: dari 400 → 150, lebih cepat)

function bantuan(usedPrefix, command) {
  if (command === 'spamht') {
    return `> ┃ Menggunakan: ${usedPrefix}spamht <jumlah> [pesan]\n> ┃ Contoh: ${usedPrefix}spamht 30 halo semua\n> ┃ Spam hidetag: pesan dengan mention semua member grup.\n> ┃ Jumlah 1–${MAKS}, khusus grup.`
  }
  return [
    '> ┃ Menggunakan:',
    `> ┃ • ${usedPrefix}spamtag <jumlah> @tag`,
    `> ┃ • ${usedPrefix}spamtag <jumlah> @tag <pesan>`,
    `> ┃ • ${usedPrefix}spamtag <jumlah> <pesan>  (sambil reply pesan target)`,
    `> ┃ Contoh: ${usedPrefix}spamtag 50 @62812345678 halo`,
    '> ┃ Tanpa @tag, target diambil dari pesan yang direply.',
    `> ┃ Jumlah 1–${MAKS}; semua pesan TANPA quote perintah.`,
  ].join('\n')
}

function tokenNomorDariJid(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

const handler = async (m, { conn, args, usedPrefix, command }) => {
  const cmd = String(command || '').toLowerCase()

  /* Animasi loading 1️⃣→🔟 selama loop kirim berjalan. */
  const anim = mulaiReactLoading(conn, m)

  try {
    if (cmd === 'spamht') {
      if (!m.isGroup) {
        await m.reply('ⓘ Hidetag hanya bisa dijalankan di grup.')
        return
      }
      const jumlah = parseInt(args[0], 10)
      if (!Number.isFinite(jumlah) || jumlah < 1) return m.reply(bantuan(usedPrefix, cmd))
      const n = Math.min(jumlah, MAKS)
      const pesan = args.slice(1).join(' ').trim() || '\u00A0'

      let participants = []
      try {
        const meta = await conn.groupMetadata(m.chat)
        participants = meta.participants || []
      } catch {
        await m.reply('ⓘ Gagal membaca data grup. Coba lagi nanti.')
        return
      }
      const mentions = participants.map(p => p.id).filter(Boolean)
      if (!mentions.length) return m.reply('ⓘ Tidak ada member yang bisa ditag di grup ini.')

      await conn.sendMessage(m.chat, { text: `ⓘ Memulai spam hidetag ${n}×…` })
      for (let i = 0; i < n; i++) {
        await conn.sendMessage(m.chat, { text: pesan, mentions })
        if (JEDA) await new Promise(resolve => setTimeout(resolve, JEDA))
      }
      await conn.sendMessage(m.chat, { text: `✅ Spam hidetag selesai — ${n} pesan terkirim.` })
      await anim.stop('✅')
      return
    }

    /* ── spamtag ── */
    const jumlah = parseInt(args[0], 10)
    if (!Number.isFinite(jumlah) || jumlah < 1) return m.reply(bantuan(usedPrefix, cmd))
    const n = Math.min(jumlah, MAKS)
    let sisa = args.slice(1)

    let target = null
    const mentionPertama = Array.isArray(m.mentionedJid) && m.mentionedJid.length ? m.mentionedJid[0] : null
    if (mentionPertama) {
      target = mentionPertama
      const idx = sisa.findIndex(t => String(t).startsWith('@'))
      if (idx >= 0) sisa.splice(idx, 1)
    } else if (m.quoted?.sender) {
      target = m.quoted.sender
    } else if (sisa[0] && /^\d{5,20}$/.test(String(sisa[0]).replace(/[^\d]/g, ''))) {
      target = String(sisa[0]).replace(/[^\d]/g, '') + '@s.whatsapp.net'
      sisa = sisa.slice(1)
    } else {
      return m.reply(bantuan(usedPrefix, cmd))
    }

    const nomor = tokenNomorDariJid(target)
    if (!nomor) return m.reply(bantuan(usedPrefix, cmd))
    const teksPesan = sisa.join(' ').trim()
    const isi = teksPesan ? `@${nomor} ${teksPesan}` : `@${nomor}`

    await conn.sendMessage(m.chat, { text: `ⓘ Memulai spam tag ${n}×…` })
    for (let i = 0; i < n; i++) {
      // Task186: SEMUA pesan spam TANPA quote — tidak mengutip perintah.
      await conn.sendMessage(m.chat, { text: isi, mentions: [target] })
      if (JEDA) await new Promise(resolve => setTimeout(resolve, JEDA))
    }
    await conn.sendMessage(m.chat, { text: `✅ Spam tag selesai — ${n} pesan terkirim.` })
    await anim.stop('✅')
  } catch (error) {
    console.warn('[spamtag]', error?.message || error)
    await anim.stop('⚠️')
    try {
      await conn.sendMessage(m.chat, { text: `ⓘ Terjadi kesalahan saat spam: ${error?.message || error}` })
    } catch { /* balasan error terbaik-usaha */ }
  } finally {
    await anim.stop('✅')
  }
}

handler.command = ['spamtag', 'spamht']
handler.help = ['spamtag <jumlah> [@tag|reply] [pesan]', 'spamht <jumlah> [pesan]']
handler.tags = ['owner']
handler.owner = true
handler.group = false
handler.limit = false
handler.description = `Spam tag/hidetag — batas ${MAKS}×, jaga ${JEDA} ms, tanpa quote perintah.`
export default handler
