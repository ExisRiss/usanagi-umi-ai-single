/* By AlzRiss - Usanagi Umi AI
 *
 * SPAM TAG — permintaan owner (Task178)
 *
 *   /spamtag <jumlah max 50> <nomor | @tag>
 *
 * Bot mengirim `<jumlah>` pesan beruntun, masing-masing menandai user yang
 * dipilih. Kalau pesan berupa reply, target boleh ditulis tanpa argumen
 * (memakai pengirim yang di-reply). Khusus owner.
 */

const JEDA_MS = 400
const MAKS = 50

function tidur(ms) { return new Promise((r) => setTimeout(r, ms)) }

const handler = async (m, { conn, args = [] }) => {
  const jumlahMentah = String(args?.[0] ?? '').replace(/\D/g, '')
  const jumlah = Number(jumlahMentah)
  if (!jumlah || jumlah < 1 || jumlah > MAKS) {
    return m.reply(`Format: ${m.prefix || '.'}spamtag <1-${MAKS}> <nomor | @tag>\nContoh: ${m.prefix || '.'}spamtag 10 @user`)
  }

  let target = (m.mentionedJid || [])[0] || ''
  if (!target) {
    const dariReply = m.quoted?.sender
    const argNomor = String(args?.[1] ?? '').replace(/\D/g, '')
    if (dariReply && !argNomor) target = dariReply
    else if (argNomor) target = `${argNomor}@s.whatsapp.net`
  }
  if (!target || !/^\d{1,25}@(s\.whatsapp\.net|lid)$/.test(target)) {
    return m.reply(`Target tidak dikenal. Tag orangnya atau tulis nomornya, mis.:\n${m.prefix || '.'}spamtag 10 628xxxxxxx`)
  }

  const tag = `@${target.split('@')[0]}`
  await m.reply(`⚠️ Spam tag ${tag} × ${jumlah} dimulai…`)
  let terkirim = 0
  for (let i = 0; i < jumlah; i++) {
    try {
      await conn.sendMessage(m.chat, { text: tag, mentions: [target] }, { quoted: m.raw || m })
      terkirim += 1
    } catch (e) {
      console.warn('[SPAMTAG] gagal ke-', i + 1, String(e?.message || e).slice(0, 100))
      break
    }
    if (i < jumlah - 1) await tidur(JEDA_MS)
  }
  return m.reply(terkirim === jumlah
    ? `✅ Selesai — ${tag} ditandai ${terkirim}×.`
    : `⚠️ Terkirim ${terkirim}/${jumlah} untuk ${tag} (berhenti karena error).`)
}

handler.command = ['spamtag']
handler.help = ['spamtag <jumlah> <nomor/@tag>']
handler.tags = ['owner']
handler.owner = true
handler.description = 'Spam tag user pilihan owner (maks 50 tag)'

export default handler
