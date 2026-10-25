/* Reaksi bersifat hiasan: kalau koneksi WhatsApp sedang menutup, jangan sampai
 * seluruh perintah ikut gagal (dulu muncul "Connection Closed" di Feedback). */
import { fetchRinMedia, describe } from '../../lib/rin-api.js'

const safeReact = async (m, emoji) => {
    try { if (typeof m.react === 'function') await m.react(emoji) } catch { }
}

let handler = async (m, { conn, text }) => {
    text = m.quoted?.text || text
    if (!text) return m.reply('Reply / masukkan teks')

    await safeReact(m, '🕒')

    try {
        // Sejak 25-10-2026 pemanggilan API dipusatkan di lib/rin-api.js:
        // UA browser, timeout, batas ukuran, dan retry otomatis bila teks yang
        // dikirim kebetulan sama dengan contoh di dokumentasi API (HTTP 400).
        const { buffer } = await fetchRinMedia('/maker/brat', text, { timeoutMs: 60000 })

        if (buffer.length < 100) throw new Error('Response terlalu kecil')

        await conn.sendSticker(
            m.chat,
            buffer,
            m,
            {
                packname: global.stickpack || global.namebot,
                packpublish: global.stickauth || global.author
            }
        )

        await safeReact(m, '✅')
    } catch (e) {
        console.error('[brat]', describe(e))
        await safeReact(m, '❌')
        const reason = describe(e)
        try { await m.reply(`Gagal membuat sticker: ${String(reason).slice(0, 120)}. Coba lagi nanti.`) } catch { }
    }
}

handler.help = ['brat <text>']
handler.tags = ['sticker']
handler.command = /^brat$/i
handler.limit = true
handler.group = true

export default handler