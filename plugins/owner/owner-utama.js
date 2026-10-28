/* By AlzRiss - Usanagi Umi AI
 *
 * Task143 — kelola status OWNER UTAMA.
 *
 * Owner utama = akses SETARA developer (semua perintah, termasuk yang
 * bertanda `rowner`). Daftar developer sendiri tetap terkunci, dan hanya
 * developer yang boleh mengubah daftar owner utama — supaya kendali platform
 * tidak berpindah tangan (Task113).
 *
 * Perintah:
 *   .ownerutama                  → penjelasan + daftar
 *   .ownerutama <nomor> [nama]   → tambah (alias .addownerutama)
 *   .ownerutama hapus <nomor>    → cabut
 *   .statusakses [nomor|@tag]    → peran sebenarnya dari nomor itu
 */

import { sendInteractive } from '../../lib/awang-tombol.js'
import { normalizeNumber } from '../../lib/awang-cekakses.js'
import {
  daftarOwnerUtama,
  tambahOwnerUtama,
  hapusOwnerUtama,
  statusAkses,
} from '../../lib/owner-utama.js'

const jamNya = (iso) => {
  if (!iso) return '-'
  try { return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'medium', timeStyle: 'short' }) + ' WITA' } catch (error) { return String(iso) }
}

const daftarTeks = () => {
  const items = daftarOwnerUtama()
  if (!items.length) return '_belum ada owner utama_'
  return items.map((x, i) => `${i + 1}. ${x.nama} — ${x.nomor}${x.sumber === 'config' ? ' (dari config.js)' : ''}`).join('\n')
}

const TUTORIAL = () => [
  '👑 *OWNER UTAMA*',
  '',
  'Status baru dengan akses *setara developer*: semua perintah bisa dipakai,',
  'termasuk yang bertanda khusus developer.',
  '',
  '*Perintah*',
  '.ownerutama <nomor> [nama] — tambah',
  '.ownerutama hapus <nomor> — cabut',
  '.statusakses <nomor|@tag> — cek peran',
  '',
  '*Yang tidak bisa dilakukan owner utama*',
  '• mengubah daftar developer (terkunci sejak Task113)',
  '• mengubah daftar owner utama (hanya developer)',
  '',
  '*Daftar sekarang*',
  daftarTeks(),
].join('\n')

function nomorDari(m, teks) {
  const mentah = String(teks || '').trim()
  if (!mentah) return ''
  const jid = Array.isArray(m.mentionedJid) && m.mentionedJid.length ? m.mentionedJid[0] : ''
  if (jid) return normalizeNumber(String(jid).split('@')[0])
  const angka = mentah.match(/[0-9]{8,16}/)
  return angka ? normalizeNumber(angka[0]) : ''
}

let handler = async (m, { conn, command, text = '', args = [], isROwner, isDeveloper }) => {
  const cmd = String(command || '').toLowerCase()
  const dev = Boolean(isDeveloper || isROwner)
  const mentah = String(text || '').trim()
  const argumen = String(text || '').trim().split(/\s+/).filter(Boolean)

  if (cmd === 'statusakses' || cmd === 'cekakses') {
    const nomor = nomorDari(m, mentah) || normalizeNumber(String(m.sender || '').split('@')[0])
    const developer = (Array.isArray(global.owner) ? global.owner : []).map(([id]) => normalizeNumber(id || '')).filter(Boolean)
    const peran = statusAkses(nomor, { developer, ownerBot: [] })
    return m.reply([
      '🪪 *STATUS AKSES*',
      '',
      `Nomor : ${nomor || '-'}`,
      `Peran : ${peran.peran}`,
      `Akses semua perintah : ${peran.aksesPenuh ? 'ya' : 'tidak'}`,
      '',
      'Urutan: developer > owner utama > owner bot > pengguna',
    ].join('\n'))
  }

  if (!dev) return m.reply('🔒 Hanya developer yang boleh mengubah daftar owner utama.')

  if (cmd === 'delownerutama') {
    const nomor = nomorDari(m, mentah)
    if (!nomor) return m.reply('Format: .delownerutama <nomor|@tag>')
    const hasil = hapusOwnerUtama(nomor)
    return m.reply(hasil.dihapus
      ? `✅ ${nomor} dicabut dari owner utama. Akses kembali seperti pengguna biasa.`
      : `ℹ️ ${nomor} memang tidak ada di daftar owner utama.`)
  }

  if (cmd === 'addownerutama') {
    if (!argumen.length) return m.reply('Format: .addownerutama <nomor> [nama]')
    const nomor = nomorDari(m, argumen[0])
    const nama = argumen.slice(1).join(' ') || 'Owner Utama'
    if (!nomor) return m.reply('Nomor tidak valid. Contoh: .addownerutama 6281234567890 AlzRiss')
    const hasil = tambahOwnerUtama(nomor, nama, normalizeNumber(String(m.sender || '').split('@')[0]))
    return m.reply([
      hasil.baru ? '✅ *OWNER UTAMA DITAMBAHKAN*' : '♻️ *OWNER UTAMA DIPERBARUI*',
      '',
      `Nomor : ${hasil.nomor}`,
      `Nama  : ${hasil.nama}`,
      '',
      'Nomor ini sekarang bisa memakai SEMUA perintah (setara developer).',
      'Cabut: .delownerutama ' + hasil.nomor,
    ].join('\n'))
  }

  /* .ownerutama — tanpa argumen = daftar; dengan argumen = tambah */
  if (!argumen.length) {
    const isi = TUTORIAL()
    try {
      return await sendInteractive(conn, m.chat, {
        title: '👑 OWNER UTAMA',
        subtitle: 'Akses setara developer',
        body: isi,
        footer: 'Hanya developer yang bisa menambah/mencabut.',
        list: {
          listTitle: 'Aksi',
          sections: [{
            title: 'OWNER UTAMA',
            rows: [
              { title: '📋 Lihat daftar', description: 'Siapa saja owner utama', command: '.ownerutama' },
              { title: '🪪 Status akses saya', description: 'Peran nomor ini', command: '.statusakses' },
            ],
          }],
        },
      }, { quoted: m.raw || m })
    } catch (error) {
      return m.reply(isi)
    }
  }

  const nomor = nomorDari(m, argumen[0])
  const nama = argumen.slice(1).join(' ') || 'Owner Utama'
  if (!nomor) return m.reply('Nomor tidak valid. Contoh: .ownerutama 6281234567890 AlzRiss')
  const hasil = tambahOwnerUtama(nomor, nama, normalizeNumber(String(m.sender || '').split('@')[0]))
  return m.reply([
    hasil.baru ? '✅ *OWNER UTAMA DITAMBAHKAN*' : '♻️ *OWNER UTAMA DIPERBARUI*',
    '',
    `Nomor : ${hasil.nomor}`,
    `Nama  : ${hasil.nama}`,
    `Waktu : ${jamNya(new Date().toISOString())}`,
    '',
    'Akses: setara developer (semua perintah).',
    'Daftar: .ownerutama · Cabut: .delownerutama ' + hasil.nomor,
  ].join('\n'))
}

handler.help = ['ownerutama', 'ownerutama 6281234567890 Nama', 'delownerutama 6281234567890', 'statusakses']
handler.tags = ['owner']
handler.command = /^(ownerutama|addownerutama|delownerutama|statusakses|cekakses)$/i
handler.description = 'Kelola status owner utama (akses setara developer)'
handler.owner = false
handler.group = false
handler.private = false
handler.limit = false
handler.fail = null

export { handler }
export default handler
