/* By AlzRiss - Usanagi Umi AI */


const handler = async (m, { conn }) => {
  const metadata = await conn.groupMetadata(m.chat)
  const participants = metadata.participants.map((p) => p.id)

  await conn.sendMessage(
    m.chat,
    { text: m.text || '📢 Perhatian!', mentions: participants },
    { quoted: m.raw }
  )
}

/* Task188 — dimatikan: duplikat command `hidetag` dengan group-hidetag.js.
 * Fitur hidetag/ht kini SEMUA di plugins/group/group-hidetag.js (prefix bebas,
 * LID-aware, fallback metadata). File dipertahankan — hanya tidak mendaftar
 * command agar tidak berebut dengan implementasi utama. */
handler.disabled = true
handler.command = /^hidetag$/i
handler.help = ['hidetag']
handler.tags = ['group']
handler.description = 'Menandai seluruh anggota group tanpa menampilkan tag'
handler.groupOnly = true

export default handler
