/* By AlzRiss - Usanagi Umi AI
 *
 * .ampremtutorial — panduan lengkap Alight Motion Premium + status server.
 *
 * Berkas ini sengaja dipisah supaya tutorial bisa dibuka kapan saja tanpa
 * mengirim email. Semua angka/status di sini diambil langsung dari backend.
 */

import {
  accessInfo, deniedText, getSession, backendStatus, reply, TUTORIAL,
} from './amprem.js'

const FAQ = [
  '*FAQ*',
  '',
  '❓ Email tidak masuk',
  '   → cek folder SPAM / Promotions, tunggu 1–2 menit,',
  '     lalu kirim ulang: .amprem emailkamu@gmail.com',
  '',
  '❓ "code gak ada" / link tidak valid',
  '   → link sudah dipakai atau kedaluwarsa. Minta link baru,',
  '     lalu verifikasi lagi dengan link yang PALING BARU.',
  '',
  '❓ Link kepotong waktu disalin',
  '   → salin dengan "Copy link", jangan tulis ulang manual.',
  '     Link boleh panjang; tempel utuh setelah tanda |.',
  '',
  '❓ Sudah sukses tapi aplikasi masih biasa',
  '   → keluar dari akun di aplikasi, login ulang dengan email',
  '     yang sama, lalu buka ulang halaman akun/premium.',
  '',
  '❓ Bisa untuk berapa akun?',
  '   → satu email satu proses. Ganti akun = ulangi dari langkah 1.',
].join('\n')

let handler = async function (m, extra = {}) {
  const conn = extra?.conn || this
  const prefix = extra?.usedPrefix || '.'
  const access = accessInfo(m, extra)
  if (!access.allowed) return reply(m, conn, deniedText(prefix))

  const [status, session] = await Promise.all([backendStatus(), Promise.resolve(getSession(m))])

  return reply(m, conn, [
    TUTORIAL(prefix),
    '',
    '*PERINTAH*',
    `   ${prefix}amprem                     panduan singkat + status`,
    `   ${prefix}amprem email@gmail.com      minta magic link`,
    `   ${prefix}ampremverify <email> | <link>   verifikasi`,
    `   ${prefix}ampremtutorial             halaman ini`,
    '',
    '*STATUS SEKARANG*',
    `   🛰️ Server AM : ${status.text}`,
    `   📧 Email sesi : ${session?.email || 'belum ada (kirim .amprem email@gmail.com)'}`,
    `   🔐 Akses      : ${access.isOwner ? 'owner' : access.premium ? 'premium' : access.amMode ? 'AM Mode grup' : 'premium'}`,
    '',
    '📌 Proses ini bekerja karena jawaban server, bukan tebakan bot.',
    '   Kalau server menolak, alasannya ditampilkan apa adanya.',
    '',
    FAQ,
    '',
    'By AlzRiss - Usanagi Umi AI',
  ].join('\n'))
}

handler.help = ['ampremtutorial']
handler.tags = ['premium']
handler.command = /^ampremtutorial$/i
handler.description = 'Tutorial lengkap Alight Motion Premium + status server'
handler.example = '.ampremtutorial'
handler.limit = false

export default handler
export { handler }
