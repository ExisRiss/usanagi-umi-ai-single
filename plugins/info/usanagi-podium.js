/* By AlzRiss - Usanagi Umi AI
 *
 * .podium — papan peringkat level bergambar (juara 1-3, lalu 4-8).
 *
 * Diadaptasi dari plugin "podium" bot VanXone Multi Device. Nama `toplevel`
 * sudah dipakai plugin lain (umi-leaderboard), jadi dipakai `podium` / `juara`.
 */
import { renderPodium } from '../../lib/profile-card.js'

const handler = async (m, { conn }) => {
  const users = global.db?.data?.users || {}
  const top = Object.entries(users)
    .filter(([, data]) => data && !data.banned)
    .map(([jid, data]) => ({
      name: data.name || String(jid).split('@')[0],
      level: Number(data.level || 0),
      exp: Number(data.exp || 0),
    }))
    .sort((a, b) => b.level - a.level || b.exp - a.exp)
    .slice(0, 8)

  if (!top.length) return m.reply('Belum ada data peringkat.')

  let gambar
  try {
    gambar = await renderPodium({ top, botName: conn.botConfig?.values?.namebot || 'Usanagi Umi AI' })
  } catch (error) {
    console.log('[PODIUM] gagal menggambar:', String(error?.message || error).slice(0, 140))
    const medali = ['🥇', '🥈', '🥉']
    return m.reply(
      '🏆 *PODIUM LEVEL*\n\n' +
      top.map((user, i) => `${medali[i] || `#${i + 1}`} ${user.name} • Level ${user.level}`).join('\n')
    )
  }

  return conn.sendMessage(m.chat, { image: gambar, caption: '🏆 *Podium level tertinggi*' }, { quoted: m.raw })
}

handler.help = ['podium']
handler.tags = ['info']
handler.command = ['podium', 'juara', 'podiumlevel']
handler.description = 'Papan peringkat level bergambar (juara 1-3 + peringkat 4-8)'

export default handler
