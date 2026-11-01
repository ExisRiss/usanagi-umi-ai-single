/* By AlzRiss - Usanagi Umi AI
 *
 * GAME3D (Task199) — UMI GAME 3D: Catur & UNO 3D
 * Game web 3D dengan animasi, efek suara (WebAudio) & bayangan (shadow)
 * di meja kayu 3D. Dua mode: Catur 3D (lawan komputer) & UNO 3D (3 bot).
 *
 * Tautan: https://game3d-alzriss.gwenna.my.id/
 *   (dihidangkan dari situs/game3d/index.html — satu file + three.min.js)
 *
 * Prefix mengikuti prefix bot (kebijakan Task117).
 */

const WEB_URL = String(process.env.GAME3D_WEB_URL || 'https://game3d-alzriss.gwenna.my.id/').trim()

const handler = async (m, { usedPrefix }) => {
  await m.reply(
    `🎮 *UMI GAME 3D* — Catur & UNO 3D\n\n` +
      `♟️ *Catur 3D* — papan & bidak 3D, animasi langkah, bayangan, lawan komputer.\n` +
      `🃏 *UNO 3D* — kartu 3D di meja, lawan 3 bot, efek suara.\n\n` +
      `🔊 Semua efek suara & bayangan aktif. Ketuk ikon 🔊 untuk matikan suara, 🏠 untuk kembali ke lobi.\n\n` +
      `🌐 Main di sini:\n${WEB_URL}\n\n` +
      `_Atau ketik ${usedPrefix}game3d kembali ke sini._`,
  )
}

handler.help = ['game3d']
handler.tags = ['game']
handler.command = /^(game3d|3dgame|catur3d|uno3d)$/i
handler.description = 'UMI Game 3D — Catur & UNO 3D (animasi, suara, bayangan)'
handler.cooldown = 5

export default handler
