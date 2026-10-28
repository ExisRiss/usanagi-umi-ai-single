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
import { normalizeNumber, resolveTargetPhoneNumber } from '../../lib/awang-cekakses.js'
import { isBotAdmin as botAdminGrup } from '../../lib/awang-aksesgrub.js'
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

/**
 * Kumpulkan nomor sasaran dari SEMUA sumber yang wajar:
 *   - mention  (@tag)
 *   - pesan yang dibalas (reply)
 *   - nomor yang diketik langsung
 * Dipakai bersama oleh perintah tambah dan `deluser`, supaya @tag maupun
 * balasan sama-sama dikenali.
 */
/**
 * Argumen perintah. Utamakan `args` dari handler; kalau kosong (mis. dipanggil
 * dari hook atau pengurai berbeda), teks pesan dipakai sebagai cadangan supaya
 * `.autodelmsg deluser @user` tetap dikenali.
 */
function argumenPerintah(args, text, m, command) {
  const bersihkan = (daftar) => daftar.map((x) => String(x).trim()).filter(Boolean)
  if (Array.isArray(args) && args.length) return bersihkan(args)
  const sumber = String(text || '').trim()
  if (sumber) return bersihkan(sumber.split(/\s+/))
  const mentah = String(m && m.text ? m.text : '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim()
  const kata = mentah.split(/\s+/).filter(Boolean)
  const nama = String(command || 'autodelmsg').toLowerCase()
  if (kata.length && kata[0].toLowerCase() === nama) kata.shift()
  return bersihkan(kata)
}

function kumpulkanSasaran(m, daftarKata = []) {
  const hasil = new Set()

  for (const jid of Array.isArray(m.mentionedJid) ? m.mentionedJid : []) {
    const n = normalizeNumber(namaDariJid(jid))
    if (n) hasil.add(n)
  }

  /* Balasan: bentuknya beda-beda tergantung versi Baileys. */
  const kutip = m.quoted || m.reply_message || {}
  const jidKutip = kutip.sender || kutip.participant || kutip.key?.participant || kutip.key?.remoteJid || ''
  if (jidKutip && String(jidKutip).endsWith('@s.whatsapp.net')) {
    const n = normalizeNumber(namaDariJid(jidKutip))
    if (n) hasil.add(n)
  }

  for (const kata of daftarKata) {
    const bersih = namaDariJid(String(kata).replace('@', ''))
    if (!/^[0-9]{8,16}$/.test(bersih)) continue
    const n = normalizeNumber(bersih)
    if (n) hasil.add(n)
  }

  return hasil
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
  const argumen = argumenPerintah(args, text, m, cmd)
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
      'Keluarkan: .autodelmsg deluser <nomor|@tag>',
      'Matikan: .autodelmsg off',
    ].join('\n'))
  }

  if (sub === 'status' || sub === 'cek' || sub === 'debug') {
    /* Diagnosa cepat: kalau pesan tidak terhapus, di sini kelihatan sebabnya. */
    const admin = await botAdminGrup(conn, m.chat).catch(() => false)
    const nomorSaya = await nomorPengirim(conn, m)
    const dilindungi = terlindungi()
    return m.reply([
      '🧹 *STATUS AUTO DELETE (GRUP INI)*',
      '',
      `Saklar        : ${grup.aktif ? 'AKTIF' : 'NONAKTIF'}`,
      `Nomor terdaftar: ${Object.keys(grup.nomor).length}`,
      `Bot admin     : ${admin ? 'ya' : 'TIDAK — penghapusan tidak akan jalan'}`,
      `Nomormu dibaca sebagai: ${nomorSaya.join(', ') || '(tidak terbaca)'}`,
      `Nomormu dilindungi    : ${nomorSaya.some((n) => dilindungi.has(n)) ? 'ya (owner/developer)' : 'tidak'}`,
      '',
      admin ? 'Penghapusan siap berjalan.' : 'Jadikan bot admin grup (izin hapus pesan) lalu ulangi.',
      Object.keys(grup.nomor).length ? '' : 'Belum ada nomor terdaftar: .autodelmsg @user',
    ].filter(Boolean).join('\n'))
  }

  if (sub === 'on' || sub === 'off') {
    grup.aktif = sub === 'on'
    tulisData(data)
    return m.reply(sub === 'on'
      ? `✅ Auto delete pesan *AKTIF* di grup ini (${Object.keys(grup.nomor).length} nomor terdaftar).`
      : '⏹️ Auto delete pesan dimatikan di grup ini. Daftar nomor tetap disimpan.')
  }

  /* deluser / hapus / del / remove — keluarkan dari daftar.
   * Bisa lewat @tag, balasan pesannya, nomor manual, atau `all`. */
  if (sub === 'deluser' || sub === 'hapus' || sub === 'del' || sub === 'remove') {
    const kata = argumen.slice(1)
    if (String(kata[0] || '').toLowerCase() === 'all') {
      const jumlah = Object.keys(grup.nomor).length
      grup.nomor = {}
      tulisData(data)
      return m.reply(`🧹 Daftar auto delete grup ini dikosongkan (${jumlah} nomor dihapus).`)
    }

    const dicari = kumpulkanSasaran(m, kata)
    if (!dicari.size) {
      return m.reply([
        '🧹 *KELUARKAN DARI DAFTAR AUTO DELETE*',
        '',
        'Pilih salah satu cara:',
        '.autodelmsg deluser @user',
        '.autodelmsg deluser (balas pesan user)',
        '.autodelmsg deluser 62812xxxx',
        '.autodelmsg deluser all',
      ].join('\n'))
    }

    const dihapus = []
    const tidakAda = []
    for (const n of dicari) {
      if (grup.nomor[n]) {
        const nama = grup.nomor[n].nama || ''
        delete grup.nomor[n]
        dihapus.push(nama ? `${nama} · ${n}` : n)
      } else {
        tidakAda.push(n)
      }
    }
    tulisData(data)

    return m.reply([
      '🧹 *AUTO DELETE — DAFTAR DIUBAH*',
      '',
      `Grup : ${m.chat}`,
      `Sisa : ${Object.keys(grup.nomor).length} nomor terdaftar`,
      '',
      dihapus.length ? 'Dikeluarkan:\n' + dihapus.map((x) => '• ' + x).join('\n') : '',
      tidakAda.length ? '\nTidak ada di daftar (tidak perlu dihapus):\n' + tidakAda.map((x) => '• ' + x).join('\n') : '',
      '',
      'Pesan mereka sekarang dibiarkan lagi.',
      'Lihat daftar: .autodelmsg list',
    ].filter(Boolean).join('\n'))
  }

  /* Tambah sasaran: mention, balasan, atau nomor manual. */
  const sasaran = kumpulkanSasaran(m, argumen)

  if (!sasaran.size) {
    return m.reply([
      '🧹 *AUTO DELETE PESAN*',
      '',
      '*Cara pakai*',
      '.autodelmsg @user — hapus otomatis pesan orang itu',
      '.autodelmsg (balas pesannya) — sama, tanpa mention',
      '.autodelmsg 62812xxxx — pakai nomor langsung',
      '.autodelmsg list — lihat daftar',
      '.autodelmsg deluser @user — keluarkan dari daftar',
      '.autodelmsg deluser (balas pesannya)',
      '.autodelmsg deluser all',
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

/*
 * BUG YANG DIPERBAIKI (laporan 28-10-2026, grup 120363430111128574):
 *   ".autodelmsg sudah aktif tapi pesan user tidak terhapus".
 *
 * Ada DUA penyebab nyata di kode lama:
 *   1. handler.all dipanggil handler.js dengan konteks { chatUpdate, __dirname,
 *      __filename } SAJA — `isBotAdmin` tidak pernah dikirim. Variabel itu
 *      undefined, pengecekan admin jadi false, dan hook berhenti diam-diam
 *      SETIAP pesan. Sekarang status admin bot diambil sendiri dari metadata
 *      grup (lib/awang-aksesgrub.js).
 *   2. Di grup, WhatsApp sering mengirim pengirim sebagai `@lid`, bukan nomor
 *      telepon. Nomor terdaftar (62882…) tidak pernah cocok dengan LID.
 *      Sekarang nomor diselesaikan lewat resolveTargetPhoneNumber() yang juga
 *      membaca senderPn / participantPn / participantAlt.
 */

/* Penjaga agar satu pesan tidak diproses dua kali (all + before). */
const SUDAH = new Map()
const TTL_SUDAH = 60000

function sudahDiproses(kunci) {
  const sekarang = Date.now()
  if (SUDAH.size > 2000) {
    for (const [k, waktu] of SUDAH) if (sekarang - waktu > TTL_SUDAH) SUDAH.delete(k)
  }
  const lama = SUDAH.get(kunci)
  if (lama && sekarang - lama < TTL_SUDAH) return true
  SUDAH.set(kunci, sekarang)
  return false
}

/** Nomor-nomor yang pesannya TIDAK BOLEH dihapus. */
function terlindungi(nomorTambahan = []) {
  const set = new Set()
  for (const [id] of Array.isArray(global.owner) ? global.owner : []) {
    const n = normalizeNumber(id || '')
    if (n) set.add(n)
  }
  const terkunci = normalizeNumber(global.jadibotPlatform?.lockedOwnerNumber || '')
  if (terkunci) set.add(terkunci)
  for (const n of nomorOwnerUtama()) if (n) set.add(n)
  for (const n of nomorTambahan) if (n) set.add(normalizeNumber(n))
  return set
}

/** Semua nomor yang mungkin mewakili pengirim (PN, LID yang sudah dipetakan). */
async function nomorPengirim(conn, m) {
  const kandidat = new Set()
  const langsung = normalizeNumber(m.sender || m.key?.participant || '')
  if (langsung) kandidat.add(langsung)
  try {
    const selesai = await resolveTargetPhoneNumber(
      m.sender || m.key?.participant,
      conn,
      m.chat,
      [m.key?.senderPn, m.key?.participantPn, m.key?.participantAlt, m.senderPn, m.participantAlt],
    )
    if (selesai) kandidat.add(normalizeNumber(selesai))
  } catch (error) { /* biarkan kandidat apa adanya */ }
  return [...kandidat].filter((x) => x && x.length >= 7)
}

/**
 * Inti penghapus. Dipakai handler.all DAN handler.before.
 * @param {object} conn
 * @param {object} m
 * @param {{ isBotAdmin?: boolean, groupMetadata?: object }} konteks
 */
async function hapusOtomatis(conn, m, konteks = {}) {
  if (!m || !m.isGroup || !m.chat) return false
  if (!m.key || m.key.fromMe) return false
  const kelas = String(m.mtype || (m.message ? Object.keys(m.message)[0] : '') || '')
  if (kelas === 'protocolMessage' || kelas === 'senderKeyDistributionMessage') return false

  const teks = String(m.text || '')
  if (/^[.$/!#].{0,3}autodel/i.test(teks)) return false

  const data = bacaData()
  const grup = data.grup[m.chat]
  if (!grup || !grup.aktif) return false
  const daftar = grup.nomor || {}
  if (!Object.keys(daftar).length) return false

  const kandidat = await nomorPengirim(conn, m)
  if (!kandidat.length) return false
  const cocok = kandidat.find((n) => daftar[n])
  if (!cocok) return false

  /* Perlindungan keras: owner/developer/owner utama tidak pernah dihapus.
   * PENTING: daftar ini TIDAK boleh diisi nomor pengirim (pernah salah dan
   * membuat semua pesan dianggap terlindungi sehingga tidak ada yang dihapus). */
  const lindung = terlindungi()
  if (kandidat.some((n) => lindung.has(n))) return false

  /* Bot harus admin. Kalau konteks tidak memberi jawabannya, tanya metadata. */
  let admin = typeof konteks.isBotAdmin === 'boolean' ? konteks.isBotAdmin : undefined
  if (admin === undefined) {
    try {
      admin = await botAdminGrup(conn, m.chat, konteks.groupMetadata || null)
    } catch (error) {
      admin = false
    }
  }
  if (!admin) {
    console.log('[autodelmsg] lewati: bot bukan admin di ' + m.chat)
    return false
  }

  if (sudahDiproses(m.chat + '|' + (m.key.id || m.id || ''))) return false

  try {
    await conn.sendMessage(m.chat, {
      delete: {
        remoteJid: m.chat,
        fromMe: false,
        id: m.key.id,
        participant: m.key.participant || m.sender,
      },
    })
    return true
  } catch (error) {
    console.log('[autodelmsg] gagal hapus: ' + (error && error.message ? error.message : error))
    return false
  }
}

/* Hook 1 — all: konteksnya minim, jadi admin dicari sendiri. */
handler.all = async function (m, konteks = {}) {
  try {
    return await hapusOtomatis(this, m, konteks)
  } catch (error) {
    return false
  }
}

/* Hook 2 — before: handler.js mengirim isBotAdmin/groupMetadata di sini.
 * Dipakai sebagai jalur cadangan kalau hook all dilewati. */
handler.before = async function (m, konteks = {}) {
  try {
    await hapusOtomatis(this, m, konteks)
  } catch (error) { /* diam */ }
  return undefined
}

handler.help = [
  'autodelmsg @user',
  'autodelmsg (balas pesan)',
  'autodelmsg list',
  'autodelmsg deluser @user',
  'autodelmsg deluser (balas pesan)',
  'autodelmsg deluser all',
  'autodelmsg hapus @user',
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
