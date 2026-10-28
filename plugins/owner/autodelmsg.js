/* By AlzRiss - Usanagi Umi AI
 *
 * Task143 — AUTO DELETE PESAN (khusus owner & developer).
 *
 * Perintah:
 *   .autodelmsg @tag [@tag2 …]     → pesan mereka di grup ini dihapus otomatis
 *   .autodelmsg (balas pesannya)   → orang yang dibalas ikut terdaftar
 *   .autodelmsg 62812xxxx          → daftarkan lewat nomor
 *   .autodelmsg list               → siapa saja yang terdaftar di grup ini
 *   .autodelmsg hapus @tag         → keluarkan dari daftar
 *   .autodelmsg hapus 62812xxxx
 *   .autodelmsg hapus all          → bersihkan daftar grup ini
 *   .autodelmsg on | off           → saklar per grup
 *
 * Syarat yang ditegakkan (sesuai permintaan):
 *   1. Bot WAJIB admin di grup itu, kalau tidak bot menolak dan menjelaskan.
 *   2. Bot TIDAK PERNAH menghapus pesan owner / developer / owner utama.
 *   3. Hanya berlaku di grup tempat perintah dijalankan.
 *
 * Data disimpan di data/autodelmsg.json (tidak masuk repo, tidak menyentuh
 * database pengguna).
 */

import fs from 'fs'
import path from 'path'
import { normalizeNumber } from '../../lib/awang-cekakses.js'
import { nomorOwnerUtama } from '../../lib/owner-utama.js'

const BERKAS = path.join(process.cwd(), 'data', 'autodelmsg.json')
const MAKS_PER_GRUP = 200

function bacaData() {
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS, 'utf8'))
    return isi && typeof isi === 'object' && isi.grup ? isi : { versi: 1, grup: {} }
  } catch (error) {
    return { versi: 1, grup: {} }
  }
}

function tulisData(data) {
  try {
    fs.mkdirSync(path.dirname(BERKAS), { recursive: true })
    fs.writeFileSync(BERKAS, JSON.stringify(data, null, 2), { mode: 0o600 })
    try { fs.chmodSync(BERKAS, 0o600) } catch (error) { /* Windows */ }
    return true
  } catch (error) {
    console.log('[autodelmsg] gagal simpan: ' + error.message)
    return false
  }
}

const grupDari = (data, chat) => {
  data.grup[chat] = data.grup[chat] || { aktif: true, nomor: {} }
  data.grup[chat].nomor = data.grup[chat].nomor || {}
  return data.grup[chat]
}

/** Nomor yang tidak boleh dihapus pesannya: developer, owner utama, owner bot. */
function nomorTerlindungi({ isROwner, isOwner } = {}) {
  const hasil = new Set()
  for (const [id] of Array.isArray(global.owner) ? global.owner : []) {
    const n = normalizeNumber(id || '')
    if (n) hasil.add(n)
  }
  const terkunci = normalizeNumber(global.jadibotPlatform?.lockedOwnerNumber || '')
  if (terkunci) hasil.add(terkunci)
  for (const n of nomorOwnerUtama()) hasil.add(n)
  if (isROwner === true || isOwner === true) {
    /* penanda saja; nomor pengirim ditambahkan oleh pemanggil */
  }
  return hasil
}

function namaDariJid(jid) {
  return String(jid || '').split('@')[0]
}

/* ── perintah ──────────────────────────────────────────────────────────── */

let handler = async (m, { conn, command, args = [], text = '', isROwner, isOwner, isDeveloper, isBotAdmin, isAdmin }) => {
  const cmd = String(command || '').toLowerCase()
  if (!/^autodelmsg$/.test(cmd)) return
  if (!m.isGroup) return m.reply('👥 Fitur ini hanya untuk grup.')

  /* Hanya owner & developer (owner utama ikut lewat isROwner karena aksesnya
   * setara developer di handler). */
  const bolehAtur = Boolean(isROwner || isOwner || isDeveloper || isAdmin)
  if (!bolehAtur) return m.reply('🔒 Hanya owner/developer yang bisa memakai .autodelmsg')
  if (!isBotAdmin) {
    return m.reply([
      '⚠️ *BOT BELUM ADMIN*',
      '',
      'Untuk menghapus pesan, bot harus admin grup ini.',
      'Jadikan admin dulu (jadikan admin → izin "Hapus pesan" aktif), lalu ulangi.',
    ].join('\n'))
  }

  const data = bacaData()
  const grup = grupDari(data, m.chat)
  const perlindungan = nomorTerlindungi({ isROwner, isOwner })
  const argumen = args.map((x) => String(x).trim()).filter(Boolean)
  const sub = String(argumen[0] || '').toLowerCase()

  if (sub === 'list') {
    const nomor = Object.keys(grup.nomor)
    if (!nomor.length) return m.reply('📭 Belum ada nomor terdaftar di grup ini.')
    return m.reply([
      '📋 *AUTO DELETE PESAN — GRUP INI*',
      '',
      `Status: ${grup.aktif ? 'AKTIF' : 'NONAKTIF'}`,
      `Jumlah: ${nomor.length}`,
      '',
      ...nomor.map((n, i) => `${i + 1}. ${grup.nomor[n].nama ? grup.nomor[n].nama + ' · ' : ''}${n}`),
      '',
      'Hapus: .autodelmsg hapus <nomor>',
      'Matikan: .autodelmsg off',
    ].join('\n'))
  }

  if (sub === 'on' || sub === 'off') {
    grup.aktif = sub === 'on'
    tulisData(data)
    return m.reply(sub === 'on'
      ? `✅ Auto delete pesan *AKTIF* di grup ini (${Object.keys(grup.nomor).length} nomor terdaftar).`
      : '⏹️ Auto delete pesan dimatikan di grup ini. Daftar nomor tetap disimpan.')
  }

  if (sub === 'hapus' || sub === 'del' || sub === 'remove') {
    const sasaran = argumen.slice(1)
    if (!sasaran.length) return m.reply('Format: .autodelmsg hapus <nomor|@tag|all>')
    if (String(sasaran[0]).toLowerCase() === 'all') {
      grup.nomor = {}
      tulisData(data)
      return m.reply('🧹 Daftar auto delete grup ini dikosongkan.')
    }
    const dicari = sasaran.map((x) => normalizeNumber(namaDariJid(String(x).replace('@', '')))).filter(Boolean)
    const dihapus = []
    for (const n of dicari) {
      if (grup.nomor[n]) {
        delete grup.nomor[n]
        dihapus.push(n)
      }
    }
    tulisData(data)
    return m.reply(dihapus.length
      ? `✅ Dikeluarkan dari auto delete:\n${dihapus.map((x) => '• ' + x).join('\n')}`
      : 'ℹ️ Nomor itu tidak ada di daftar grup ini.')
  }

  /* Tambah sasaran: mention, balasan, atau nomor manual. */
  const sasaran = new Set()
  for (const jid of Array.isArray(m.mentionedJid) ? m.mentionedJid : []) {
    const n = normalizeNumber(namaDariJid(jid))
    if (n) sasaran.add(n)
  }
  const dikutip = m.quoted || m.reply_message || (m.message && m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo && m.message.extendedTextMessage.contextInfo.participant)
  const jidKutip = (dikutip && (dikutip.sender || dikutip.participant)) || ''
  if (jidKutip) {
    const n = normalizeNumber(namaDariJid(jidKutip))
    if (n) sasaran.add(n)
  }
  for (const kata of argumen) {
    const bersih = namaDariJid(String(kata).replace('@', ''))
    if (!/^[0-9]{8,16}$/.test(bersih)) continue
    const n = normalizeNumber(bersih)
    if (n) sasaran.add(n)
  }

  if (!sasaran.size) {
    return m.reply([
      '🧹 *AUTO DELETE PESAN*',
      '',
      '*Cara pakai*',
      '.autodelmsg @user — hapus otomatis pesan orang itu',
      '.autodelmsg (balas pesannya) — sama, tanpa mention',
      '.autodelmsg 62812xxxx — pakai nomor langsung',
      '.autodelmsg list — lihat daftar',
      '.autodelmsg hapus @user | hapus all',
      '.autodelmsg on | off',
      '',
      '*Syarat*',
      '• Bot harus admin grup (izin hapus pesan)',
      '• Pesan owner/developer/owner utama TIDAK PERNAH dihapus',
      '• Hanya berlaku di grup ini',
    ].join('\n'))
  }

  const ditolak = []
  const diterima = []
  for (const n of sasaran) {
    if (perlindungan.has(n)) { ditolak.push(n); continue }
    grup.nomor[n] = { nama: '', oleh: normalizeNumber(namaDariJid(m.sender)), waktu: new Date().toISOString() }
    diterima.push(n)
  }
  grup.aktif = true

  if (Object.keys(grup.nomor).length > MAKS_PER_GRUP) {
    const kunci = Object.keys(grup.nomor).slice(0, Object.keys(grup.nomor).length - MAKS_PER_GRUP)
    for (const k of kunci) delete grup.nomor[k]
  }
  tulisData(data)

  const baris = [
    '🧹 *AUTO DELETE PESAN DIAKTIFKAN*',
    '',
    `Grup   : ${m.chat}`,
    `Jumlah : ${Object.keys(grup.nomor).length} nomor terdaftar`,
    '',
    diterima.length ? 'Ditambahkan:\n' + diterima.map((x) => '• ' + x).join('\n') : 'Tidak ada nomor baru.',
    ditolak.length ? '\n⚠️ Dilewati (owner/developer — dilindungi):\n' + ditolak.map((x) => '• ' + x).join('\n') : '',
    '',
    'Mulai sekarang pesan mereka di grup ini dihapus otomatis.',
    'Lihat daftar: .autodelmsg list · Matikan: .autodelmsg off',
  ].filter(Boolean).join('\n')

  return m.reply(baris)
}

/* ── penghapus otomatis ────────────────────────────────────────────────── */

handler.all = async function (m, { isBotAdmin, isAdmin } = {}) {
  try {
    if (!m || !m.isGroup || !m.chat) return
    if (m.key && m.key.fromMe) return
    /* Jangan pernah menyentuh perintah bot sendiri (biar admin tetap bisa
     * memakai .autodelmsg / .autodelmsg list walaupun nomornya terdaftar). */
    const teksAwal = String(m.text || '').trim()
    if (/^[.$/!#]/.test(teksAwal) && /autodel/i.test(teksAwal)) return

    const data = bacaData()
    const grup = data.grup[m.chat]
    if (!grup || !grup.aktif) return
    if (!grup.nomor || !Object.keys(grup.nomor).length) return

    const nomorPengirim = normalizeNumber(namaDariJid(m.sender))
    if (!nomorPengirim || !grup.nomor[nomorPengirim]) return

    /* Perlindungan keras: owner/developer/owner utama tidak pernah dihapus. */
    if (nomorTerlindungi({}).has(nomorPengirim)) return
    if (isAdmin === true) {
      /* admin grup lain tetap dihapus kalau memang didaftarkan; hanya
       * owner/developer yang dilindungi. */
    }

    const admin = typeof isBotAdmin === 'boolean' ? isBotAdmin : (m.isBotAdmin === true)
    if (!admin) return

    await this.sendMessage(m.chat, {
      delete: {
        remoteJid: m.chat,
        fromMe: false,
        id: m.key.id,
        participant: m.sender,
      },
    })
  } catch (error) {
    /* Diam: jangan pernah membanjiri grup dengan galat hapus pesan. */
  }
}

handler.help = [
  'autodelmsg @user',
  'autodelmsg (balas pesan)',
  'autodelmsg list',
  'autodelmsg hapus @user',
  'autodelmsg hapus all',
  'autodelmsg on',
  'autodelmsg off',
]
handler.tags = ['owner']
handler.command = /^autodelmsg$/i
handler.description = 'Hapus otomatis pesan user tertentu di grup (khusus owner/developer, bot wajib admin)'
handler.group = true
handler.owner = false
handler.limit = false
handler.fail = null

export { handler, bacaData as bacaDataAutodel }
export default handler
