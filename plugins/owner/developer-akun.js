/* By AlzRiss - Usanagi Umi AI
 *
 * Task140 — perintah akun untuk DEVELOPER.
 *
 *   .buatakun                        → tutorial lengkap membuat akun
 *   .buatakun <gmail> | <password> | <username>
 *                                    → akun BENAR-BENAR dibuat di website jadibot
 *   .delakun <gmail>                 → bot kirim pilihan: hapus di server website mana
 *   .delakunhapus <gmail>|<situs>    → dipanggil dari tombol, tidak perlu diketik manual
 *   .delakunall                      → peringatan + cara konfirmasi
 *   .delakunall <gmail>              → hapus email itu di SEMUA server website
 *   .delakunall KONFIRMASI           → hapus SEMUA akun di semua server website
 *
 * Semua perintah khusus developer (isROwner).
 */

import { sendInteractive } from '../../lib/awang-tombol.js'
import {
  akunSiap,
  daftarSitus,
  inventarisAkun,
  buatAkun,
  hapusAkunDi,
  hapusAkunSemuaSitus,
  hapusSeluruhAkun,
  parseBuatAkun,
  validasiEmail,
} from '../../lib/akun-platform.js'

const LOGIN = 'https://jadibot-alzriss.gwenna.my.id/#login'

const TUTORIAL = [
  '📝 *BUAT AKUN WEBSITE JADIBOT*',
  '',
  '*Cara 1 — lewat bot (paling cepat)*',
  '.buatakun <gmail> | <password> | <username>',
  '',
  'Contoh:',
  '.buatakun umi@gmail.com | Rahasia123 | umi',
  '',
  '*Cara 2 — lewat website*',
  '1. Buka ' + LOGIN,
  '2. Isi email, password, dan username',
  '3. Klik *Daftar* / *Sign up*, lalu cek inbox untuk konfirmasi',
  '4. Setelah masuk, buka menu *Pairing* untuk menautkan nomor WhatsApp',
  '',
  '*Syarat*',
  '• Email harus aktif (dipakai untuk konfirmasi)',
  '• Password minimal 8 karakter, ada huruf dan angka',
  '• Username 3–20 karakter (huruf, angka, titik, garis bawah, strip)',
  '',
  '*Setelah akun jadi*',
  '• Login di website → hubungkan nomor lewat Pairing',
  '• Sesi bot muncul di dashboard; status bisa dicek dengan .cekwa',
  '',
  'Kalau akun mau dihapus: .delakun <gmail>',
].join('\n')

function belumSiap() {
  return [
    '⚙️ *Fitur akun belum aktif.*',
    '',
    'Berkas `data/akun-platform.json` belum ada / belum lengkap, jadi bot tidak',
    'punya kunci untuk menghubungi website. Buat berkas itu dulu:',
    '',
    '{',
    '  "supabaseUrl": "https://<proyek>.supabase.co",',
    '  "serviceRoleKey": "<service role key>"',
    '}',
  ].join('\n')
}

function rupiah(n) {
  return Number(n || 0).toLocaleString('id-ID')
}

function jamNya(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'medium', timeStyle: 'short' }) + ' WITA'
  } catch (error) {
    return String(iso)
  }
}

const daftarSitusTeks = () => daftarSitus().map((s, i) => `${i + 1}. ${s.nama}${s.alamat ? ' — ' + s.alamat : ''}`).join('\n')

/* ── buatakun ──────────────────────────────────────────────────────────── */

async function tanganiBuatAkun(m, teks) {
  const mentah = String(teks || '').trim()
  if (!mentah || mentah.indexOf('|') === -1) {
    return m.reply(TUTORIAL)
  }
  if (!akunSiap()) return m.reply(belumSiap())

  const { email, password, username } = parseBuatAkun(mentah)
  if (!email || !password || !username) {
    return m.reply([
      '⚠️ Format belum lengkap. Tiga bagian dipisah tanda `|`:',
      '',
      '.buatakun <gmail> | <password> | <username>',
      '',
      'Contoh: .buatakun umi@gmail.com | Rahasia123 | umi',
    ].join('\n'))
  }

  await m.reply('⏳ Membuat akun ' + email + ' …')
  try {
    const hasil = await buatAkun({ email, password, username })
    return m.reply([
      '✅ *AKUN DIBUAT*',
      '',
      `Email    : ${hasil.email}`,
      `Username : @${hasil.username}`,
      `ID       : ${String(hasil.id || '-').slice(0, 8)}…`,
      `Status   : ${hasil.profil && hasil.profil.role ? hasil.profil.role : 'free'} · email terkonfirmasi`,
      '',
      '*Langkah berikutnya*',
      `1. Buka ${LOGIN}`,
      `2. Masuk dengan ${hasil.email} dan password yang tadi dikirim`,
      '3. Buka *Pairing* → masukkan nomor WhatsApp yang mau dijadikan bot',
      '4. Tunggu kode pairing muncul, masukkan di WhatsApp (Perangkat Tertaut)',
      '',
      'Password TIDAK disimpan bot. Catat sekarang.',
      'Salah ketik data? Hapus dengan .delakun ' + hasil.email,
    ].join('\n'))
  } catch (error) {
    return m.reply('❌ Gagal membuat akun: ' + error.message)
  }
}

/* ── delakun ───────────────────────────────────────────────────────────── */

async function tanganiDelAkun(m, conn, teks) {
  const email = validasiEmail(String(teks || '').trim())
  if (!email) {
    return m.reply([
      '🗑️ *HAPUS AKUN*',
      '',
      'Format: .delakun <gmail>',
      'Contoh: .delakun umi@gmail.com',
      '',
      'Bot akan mengecek dulu akun itu ada di server website mana,',
      'lalu mengirim tombol pilihan sebelum menghapus.',
      '',
      'Untuk menghapus di semua server sekaligus: .delakunall ' + '<gmail>',
    ].join('\n'))
  }
  if (!akunSiap()) return m.reply(belumSiap())

  await m.reply('🔎 Mencari akun ' + email + ' …')
  let data
  try {
    data = await inventarisAkun(email)
  } catch (error) {
    return m.reply('❌ Gagal memeriksa: ' + error.message)
  }

  if (!data.situs.length) {
    return m.reply([
      'ℹ️ *Akun tidak ditemukan*',
      '',
      `Email ${email} tidak ada di server website mana pun yang terdaftar:`,
      daftarSitusTeks(),
      '',
      'Kalau yakin akunnya ada, cek ejaannya.',
    ].join('\n'))
  }

  const baris = data.situs.map((s) => ({
    title: '🗑️ ' + s.nama,
    description: String(s.detail || '').slice(0, 60),
    command: '.delakunhapus ' + email + '|' + s.id,
  }))
  baris.push({ title: '🧨 Hapus di semua server', description: 'Sekali jalan untuk semua situs', command: '.delakunall ' + email })

  const isi = [
    '🗑️ *AKUN DITEMUKAN*',
    '',
    `Email : ${email}`,
    '',
    ...data.situs.map((s) => `• *${s.nama}*\n  ${s.detail}`),
    data.galat && data.galat.length ? '\n⚠️ ' + data.galat.join('\n⚠️ ') : '',
    '',
    'Pilih tombol di bawah untuk menghapus di server yang mana.',
    'Tidak ada yang dihapus sampai kamu memilih.',
    '',
    'Ketik manual kalau tombol tidak muncul:',
    '.delakunhapus ' + email + '|' + data.situs.map((s) => s.id).join('  /  '),
  ].join('\n')

  try {
    return await sendInteractive(conn, m.chat, {
      title: '🗑️ HAPUS AKUN',
      subtitle: email,
      body: isi,
      footer: 'Pilih server website yang akan dihapus.',
      list: { listTitle: 'Pilih server', sections: [{ title: 'SERVER WEBSITE', rows: baris }] },
    }, { quoted: m.raw || m })
  } catch (error) {
    return m.reply(isi)
  }
}

async function tanganiDelAkunPilih(m, teks) {
  const mentah = String(teks || '').trim()
  const potong = mentah.split('|')
  const email = validasiEmail((potong[0] || '').trim())
  const idSitus = (potong[1] || '').trim()
  if (!email || !idSitus) {
    return m.reply('Format: .delakunhapus <gmail>|<situs>\nContoh: .delakunhapus umi@gmail.com|website-jadibot')
  }
  await m.reply('⏳ Menghapus ' + email + ' dari ' + idSitus + ' …')
  try {
    const hasil = await hapusAkunDi(email, idSitus)
    const rincian = []
    if (typeof hasil.hapusAuth === 'number') rincian.push(`akun login dihapus: ${rupiah(hasil.hapusAuth)}`)
    if (typeof hasil.hapusProfil === 'number') rincian.push(`baris profil dihapus: ${rupiah(hasil.hapusProfil)}`)
    if (typeof hasil.diputus === 'number') rincian.push(`sesi diputus: ${rupiah(hasil.diputus)}`)
    if (typeof hasil.folder === 'number') rincian.push(`folder sesi dihapus: ${rupiah(hasil.folder)}`)
    return m.reply([
      '✅ *SELESAI DIHAPUS*',
      '',
      `Email  : ${email}`,
      `Server : ${hasil.situs}`,
      '',
      rincian.length ? rincian.map((x) => '• ' + x).join('\n') : '• tidak ada data yang cocok',
      typeof hasil.sisa === 'number' ? `\nSisa data di server itu: ${hasil.sisa}` : '',
      hasil.backup ? `\nCadangan sebelum hapus: ${hasil.backup.split('/').slice(-2).join('/')}` : '',
    ].filter(Boolean).join('\n'))
  } catch (error) {
    return m.reply('❌ Gagal menghapus: ' + error.message)
  }
}

/* ── delakunall ────────────────────────────────────────────────────────── */

async function tanganiDelSemua(m, teks) {
  const arg = String(teks || '').trim()

  if (!arg) {
    return m.reply([
      '🧨 *HAPUS AKUN — SEMUA SERVER*',
      '',
      'Ada dua pemakaian:',
      '',
      '1. Satu email di semua server',
      '   .delakunall umi@gmail.com',
      '',
      '2. SEMUA akun di semua server (berbahaya)',
      '   .delakunall KONFIRMASI',
      '',
      'Mode 2 menghapus seluruh akun login website, semua baris profil,',
      'dan semua sesi bot lokal. Sebelum menghapus, bot menyimpan daftar',
      'akun ke data/akun-backup/ supaya masih bisa diperiksa.',
      '',
      'Server yang terdampak:',
      daftarSitusTeks(),
    ].join('\n'))
  }

  if (!akunSiap()) return m.reply(belumSiap())

  if (arg.toUpperCase() === 'KONFIRMASI') {
    await m.reply('🧨 Menghapus SEMUA akun di semua server website …')
    try {
      const hasil = await hapusSeluruhAkun()
      return m.reply([
        '✅ *SELURUH AKUN DIHAPUS*',
        '',
        `Akun login terhapus : ${rupiah(hasil.auth)}`,
        `Sesi lokal dihapus  : ${rupiah(hasil.sesiLokal)}`,
        `Cadangan            : ${hasil.backup ? hasil.backup.split('/').slice(-2).join('/') : '-'}`,
        hasil.gagal.length ? `\n⚠️ Gagal ${hasil.gagal.length}:\n` + hasil.gagal.slice(0, 10).map((x) => '• ' + x).join('\n') : '',
        '',
        'Catatan: password tidak pernah tersimpan, jadi akun yang dihapus',
        'tidak bisa dipulihkan — hanya bisa dibuat ulang dengan .buatakun.',
      ].filter(Boolean).join('\n'))
    } catch (error) {
      return m.reply('❌ Gagal: ' + error.message)
    }
  }

  const email = validasiEmail(arg)
  if (!email) {
    return m.reply('⚠️ Bukan email yang sah. Contoh: .delakunall umi@gmail.com\nAtau .delakunall KONFIRMASI untuk semua akun.')
  }

  await m.reply('🧨 Menghapus ' + email + ' di semua server website …')
  try {
    const ringkasan = await hapusAkunSemuaSitus(email)
    const baris = ringkasan.map((r) => {
      if (!r.ok) return `❌ ${r.situs} — ${r.galat}`
      const h = r.hasil || {}
      const bagian = []
      if (h.hapusAuth) bagian.push(`${h.hapusAuth} akun login`)
      if (h.hapusProfil) bagian.push(`${h.hapusProfil} profil`)
      if (h.diputus) bagian.push(`${h.diputus} sesi`)
      if (h.folder) bagian.push(`${h.folder} folder`)
      return `✅ ${r.situs} — ${bagian.length ? bagian.join(', ') : 'tidak ada data'}`
    })
    return m.reply(['🧨 *HASIL HAPUS SEMUA SERVER*', '', `Email: ${email}`, '', ...baris].join('\n'))
  } catch (error) {
    return m.reply('❌ Gagal: ' + error.message)
  }
}

/* ── handler ───────────────────────────────────────────────────────────── */

let handler = async (m, { conn, command, text = '', args = [], isROwner, isOwner }) => {
  const dev = Boolean(isROwner)
  if (!dev) {
    return m.reply('🔒 Perintah akun hanya untuk developer.')
  }

  const cmd = String(command || '').toLowerCase()

  try {
    if (cmd === 'buatakun') return await tanganiBuatAkun(m, text)
    if (cmd === 'delakun' || cmd === 'hapusakun') return await tanganiDelAkun(m, conn, text)
    if (cmd === 'delakunhapus') return await tanganiDelAkunPilih(m, text)
    if (cmd === 'delakunall' || cmd === 'hapusakunall') return await tanganiDelSemua(m, text)
    return m.reply('Perintah tidak dikenal. Pakai .buatakun / .delakun / .delakunall.')
  } catch (error) {
    return m.reply('❌ ' + (error && error.message ? error.message : error))
  }
}

handler.help = [
  'buatakun',
  'buatakun email | password | username',
  'delakun email',
  'delakunall email',
  'delakunall KONFIRMASI',
]
handler.tags = ['owner']
handler.command = /^(buatakun|delakun|hapusakun|delakunhapus|delakunall|hapusakunall)$/i
handler.description = 'Kelola akun website jadibot (developer): buat, hapus per server, atau hapus semua'
handler.owner = false
handler.group = false
handler.private = false
handler.limit = false
handler.fail = null

export { handler }
export default handler
