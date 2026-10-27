/* By AlzRiss - Usanagi Umi AI
 *
 * `.swgcall` — Status grup (ringkasan cepat).
 *
 * Di OURIN perintah ini ada di plugins/group/swgcall.js dan dipakai untuk
 * melihat keadaan grup: nama, jumlah anggota, admin, bot admin atau bukan,
 * dan saklar keamanan grup yang tersimpan di database.
 *
 * Versi Umi ini TIDAK memposting apa pun ke WhatsApp (OURIN memakai SWGC =
 * status WhatsApp grup yang bisa mengganggu). Yang ditampilkan hanya ringkasan
 * data yang memang sudah dibaca dari grup, jadi aman dan cepat.
 */

const LABEL = {
  antilink: 'Anti link',
  antispam: 'Anti spam',
  antitagall: 'Anti tag all',
  antitoxic: 'Anti toxic',
  antibug: 'Anti bug',
  antivirtex: 'Anti virtex',
  antitagsw: 'Anti tag SW',
  antidel: 'Anti hapus pesan',
  antiunadmin: 'Anti unadmin',
  welcome: 'Welcome',
  detect: 'Deteksi',
  delete: 'Hapus pesan',
  adminOnly: 'Hanya admin',
  mute: 'Bungkam',
}

async function handler(m, { conn }) {
  if (!m.isGroup) return m.reply('〄 Perintah ini hanya untuk grup.')

  let meta
  try {
    meta = await conn.groupMetadata(m.chat)
  } catch (e) {
    return m.reply(`〄 Gagal membaca data grup: ${String(e?.message || e).slice(0, 120)}`)
  }

  const peserta = Array.isArray(meta?.participants) ? meta.participants : []
  const admin = peserta.filter(p => p.admin === 'admin' || p.admin === 'superadmin')
  const superadmin = peserta.filter(p => p.admin === 'superadmin')
  const botJid = String(conn?.user?.jid || conn?.user?.id || '')
  const botAngka = botJid.replace(/[^0-9]/g, '')
  const saya = peserta.find(p => String(p.id || p.jid || '').replace(/[^0-9]/g, '') === botAngka)
  const botAdmin = Boolean(saya && saya.admin)
  const sayaAdmin = admin.some(p => String(p.id || p.jid || '').replace(/[^0-9]/g, '') === String(m.sender).replace(/[^0-9]/g, ''))

  const chatCfg = (global.db?.data?.chats?.[m.chat]) || {}
  const aktif = Object.keys(LABEL).filter(k => chatCfg[k] === true).map(k => LABEL[k])
  const nonaktif = Object.keys(LABEL).filter(k => chatCfg[k] !== true).map(k => LABEL[k])

  const dibuat = meta?.creation ? new Date(Number(meta.creation) * 1000).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : 'tidak diketahui'

  return m.reply(
    `〄 *STATUS GRUP*\n\n` +
    `〄 Nama      : *${meta?.subject || '-'}*\n` +
    `〄 ID        : ${m.chat}\n` +
    `〄 Dibuat    : ${dibuat}\n` +
    `〄 Anggota   : *${peserta.length}* orang\n` +
    `〄 Admin     : ${admin.length} (superadmin ${superadmin.length})\n` +
    `〄 Kamu      : ${sayaAdmin ? 'Admin' : 'Anggota biasa'}\n` +
    `〄 Bot admin : ${botAdmin ? 'Ya' : 'Tidak'}\n\n` +
    `〄 *Fitur menyala:* ${aktif.length ? aktif.join(', ') : '-'}\n` +
    `〄 *Fitur mati:* ${nonaktif.length ? nonaktif.join(', ') : '-'}\n\n` +
    `〄 Deskripsi: ${meta?.desc ? String(meta.desc).slice(0, 300) : '-'}`
  )
}

handler.help = ['swgcall']
handler.tags = ['group']
handler.command = /^(swgcall|statusgrup)$/i
handler.group = true
handler.limit = false
handler.cooldown = 3

export default handler
