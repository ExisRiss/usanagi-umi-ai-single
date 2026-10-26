/* By AlzRiss - Usanagi Umi AI
 *
 * .kartuprofil [@user] — kartu profil bergambar (avatar, level, EXP, uang, peringkat).
 *
 * Diadaptasi dari plugin "kartu" bot VanXone Multi Device. Di bot ini nama
 * `kartu` sudah dipakai plugin lama (umi-usercard), jadi perintahnya
 * `kartuprofil` / `idcard` / `kartuplayer` supaya tidak saling menimpa.
 * Datanya dari global.db.data.users (bukan database bot lain).
 */
import { renderProfileCard } from '../../lib/profile-card.js'
import { xpRange } from '../../lib/levelling.js'

function nomorDari(jid) {
  return String(jid || '').split('@')[0].split(':')[0]
}

function samarkan(nomor) {
  const angka = String(nomor || '')
  if (angka.length <= 6) return angka
  return `${angka.slice(0, 4)}${'•'.repeat(Math.max(3, angka.length - 7))}${angka.slice(-3)}`
}

function targetDari(m, args) {
  const daftar = m.mentionedJid || []
  if (daftar.length) return daftar[0]
  if (m.quoted && m.quoted.sender) return m.quoted.sender
  const kandidat = (Array.isArray(args) ? args : String(m.text || '').split(/\s+/)).find(bagian => /^\d{8,15}$/.test(bagian))
  return kandidat ? `${kandidat}@s.whatsapp.net` : m.sender
}

const handler = async (m, { conn, args, usedPrefix, command }) => {
  const target = targetDari(m, args)
  const users = global.db?.data?.users || {}
  const user = users[target]
  if (!user) return m.reply(`Orang itu belum terdaftar di database bot.\nContoh: ${usedPrefix}${command} @user`)

  const nomor = nomorDari(target)
  const level = Number(user.level || 1)
  const exp = Number(user.exp || 0)
  let butuh = 10000
  try {
    const rentang = xpRange(level, global.multiplier || 1)
    butuh = Number(rentang.max || 0) > 0 ? Number(rentang.max) : Math.max(1, Number(rentang.xp || 10000))
  } catch {}

  // Peringkat: urut level lalu exp, sama seperti papan peringkat lain.
  const peringkat = Object.entries(users)
    .filter(([, data]) => data && !data.banned)
    .map(([jid, data]) => ({ jid, level: Number(data.level || 0), exp: Number(data.exp || 0) }))
    .sort((a, b) => b.level - a.level || b.exp - a.exp)
  const posisi = peringkat.findIndex(item => item.jid === target) + 1

  const isOwner = (global.owner || []).some(item => nomorDari(Array.isArray(item) ? item[0] : item) === nomor)
  const status = isOwner ? 'OWNER' : user.premium ? 'PREMIUM' : 'MEMBER'

  let avatar = null
  try { avatar = await conn.profilePictureUrl(target, 'image') } catch {}

  let gambar
  try {
    gambar = await renderProfileCard({
      name: user.name || m.pushName || nomor,
      number: samarkan(nomor),
      status,
      level,
      exp,
      expNeed: butuh,
      money: Number(user.money || 0),
      bank: Number(user.bank || 0),
      limit: user.limit ?? '-',
      rank: posisi,
      rankTotal: peringkat.length,
      avatar,
      botName: conn.botConfig?.values?.namebot || 'Usanagi Umi AI',
    })
  } catch (error) {
    console.log('[KARTU] gagal menggambar:', String(error?.message || error).slice(0, 140))
    return m.reply(
      `👤 *KARTU PROFIL*\n\n` +
      `Nama : ${user.name || nomor}\nStatus : ${status}\nLevel : ${level}\n` +
      `EXP : ${exp} / ${butuh}\nUang : ${Number(user.money || 0).toLocaleString('id-ID')}\n` +
      `Bank : ${Number(user.bank || 0).toLocaleString('id-ID')}\n` +
      (posisi ? `Peringkat : #${posisi} dari ${peringkat.length}\n` : '')
    )
  }

  return conn.sendMessage(m.chat, { image: gambar, caption: '@' + nomor }, { quoted: m.raw, mentions: [target] })
}

handler.help = ['kartuprofil [@user]']
handler.tags = ['info']
handler.command = ['kartuprofil', 'idcard', 'kartuplayer']
handler.description = 'Kartu profil bergambar: level, EXP, uang, bank, peringkat'

export default handler
