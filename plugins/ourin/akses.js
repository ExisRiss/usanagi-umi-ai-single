/* By AlzRiss - Usanagi Umi AI
 *
 * `.addakses`, `.delakses`, `.listakses`, `.akses`
 *
 * Apa ini?
 * Mode *self* (bot privat) di Umi hanya melayani owner dan pesan bot sendiri.
 * OURIN punya daftar "akses": orang tertentu tetap boleh memakai bot walau bot
 * sedang mode self. Fitur itu belum ada di Umi, jadi sekarang ditambahkan.
 *
 * Penyimpanan: `global.db.data.akses[jidSesi] = [nomor, ...]`
 *  - per sesi (bot utama dan tiap jadibot punya daftar sendiri),
 *  - memakai database bot yang sudah ada, jadi ikut tersimpan/backup,
 *  - nomor disimpan sebagai digit saja (62…), dicocokkan dengan nomor pengirim.
 *
 * Dipakai oleh `handler.js` pada pemeriksaan mode self. Tanpa daftar ini,
 * menambah pengguna baru tidak akan berpengaruh apa pun.
 */

import { daftarAkses, tambahAkses, hapusAkses, digit } from '../../lib/akses-user.js'

/* ───────────────────────── plugin ───────────────────────── */

let handler = async (m, { conn, command, args, usedPrefix }) => {
  const target = m.mentionedJid?.[0] || m.quoted?.sender || (args[0] ? `${digit(args[0])}@s.whatsapp.net` : '')
  const nomor = digit(target)

  if (command === 'akses' || command === 'listakses') {
    const list = daftarAkses(conn)
    const kepala = `〄 *DAFTAR AKSES SESI INI*\n\n`
    const isi = list.length
      ? list.map((n, i) => `${i + 1}. ${n}`).join('\n')
      : '_Belum ada. Tambah dengan .addakses 628xxx atau balas/mention orangnya._'
    return m.reply(
      `${kepala}${isi}\n\n` +
      `〄 Total: *${list.length}* nomor\n` +
      `〄 Tambah : ${usedPrefix}addakses 628xxx\n` +
      `〄 Hapus  : ${usedPrefix}delakses 628xxx\n\n` +
      `〄 Daftar ini dipakai saat bot dalam mode *self* (privat).`
    )
  }

  if (!nomor) {
    return m.reply(`〄 Balas pesan orangnya, mention, atau tulis nomornya.\n\nContoh: ${usedPrefix}${command} 628123456789`)
  }

  if (command === 'addakses') {
    const hasil = tambahAkses(conn, nomor)
    if (!hasil.ok) return m.reply(`〄 Gagal menambah akses: ${hasil.alasan}.`)
    return m.reply(`✅ *AKSES DITAMBAH*\n\n〄 Nomor: ${hasil.nomor}\n〄 Total: ${hasil.total}\n\n〄 Orang ini sekarang tetap bisa memakai bot walau bot mode self.`)
  }

  if (command === 'delakses') {
    const hasil = hapusAkses(conn, nomor)
    if (!hasil.ok) return m.reply(`〄 Gagal menghapus akses: ${hasil.alasan}.`)
    return m.reply(`✅ *AKSES DIHAPUS*\n\n〄 Nomor: ${hasil.nomor}\n〄 Sisa : ${hasil.total}`)
  }
}

handler.help = ['akses', 'addakses <nomor>', 'delakses <nomor>', 'listakses']
handler.tags = ['owner']
handler.command = /^(akses|addakses|delakses|listakses)$/i
handler.owner = true
handler.limit = false

export default handler
