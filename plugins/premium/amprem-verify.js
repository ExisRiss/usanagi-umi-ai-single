/* By AlzRiss - Usanagi Umi AI
 *
 * .ampremverify — Alight Motion Premium (LANGKAH 2: verifikasi link)
 *
 * Cara pakai:
 *   .ampremverify email@gmail.com | <link dari email>
 *   .ampremverify <link dari email>          (pakai email dari sesi 30 menit)
 *
 * Kalau salah format → panduan lengkap, bukan cuma "format salah".
 * Token/isi akun sensitif tidak pernah dicetak.
 */

import {
  accessInfo, deniedText, getSession, setSession, clearSession,
  isEmail, isLink, requestJson, reply, TUTORIAL,
} from './amprem.js'

const PREFIX_TUTORIAL = prefix => [
  '⚠️ *Format verifikasi belum benar*',
  '',
  'Dua cara yang benar:',
  `   ${prefix}ampremverify emailkamu@gmail.com | <link dari email>`,
  `   ${prefix}ampremverify <link dari email>`,
  '',
  TUTORIAL(prefix),
].join('\n')

function accountBlock(data) {
  if (!data || typeof data !== 'object') return []
  const lines = []
  if (data.email) lines.push(`• Email     : ${data.email}`)
  if (data.uid) lines.push(`• UID       : ${data.uid}`)
  if (data.status) lines.push(`• Status    : ${data.status}`)
  if (data.planName) lines.push(`• Paket     : ${data.planName}`)
  if (data.subscriptionType) lines.push(`• Tipe      : ${data.subscriptionType}`)
  if (data.membershipStatus) lines.push(`• Membership: ${data.membershipStatus}`)
  if (data.orderId) lines.push(`• Order ID  : ${data.orderId}`)
  if (data.validUntil) lines.push(`• Berlaku   : ${data.validUntil}`)
  return lines.length ? ['', '👤 *INFO AKUN*', ...lines] : []
}

function successText(result, email) {
  return [
    '✅ *BERHASIL DIVERIFIKASI*',
    '',
    result?.message ? String(result.message) : 'Premium aktif.',
    ...accountBlock(result?.data),
    '',
    'Langkah terakhir:',
    '1. Buka aplikasi Alight Motion.',
    `2. Login dengan email ${email}.`,
    '3. Cek menu akun — label premium harus muncul.',
    '',
    `Kalau mau ganti akun: .amprem email-lain@gmail.com`,
  ].join('\n')
}

async function verify(m, conn, prefix, email, link) {
  await reply(m, conn, `⏳ Memverifikasi ${email} …`)
  const result = await requestJson('/verify-link', { method: 'POST', body: { email, magicLink: link } })
  if (!result?.success) {
    const why = result?.message || result?.code || 'link tidak valid atau sudah kedaluwarsa'
    return reply(m, conn, [
      '❌ *Verifikasi gagal*',
      '',
      `Alasan dari server: ${why}`,
      '',
      '*Biasanya karena:*',
      '  • link sudah dipakai / kedaluwarsa,',
      '  • link tersalin tidak utuh (terpotong),',
      '  • email berbeda dengan yang minta link.',
      '',
      `Minta link baru: ${prefix}amprem ${email}`,
      '',
      TUTORIAL(prefix),
    ].join('\n'))
  }
  clearSession(m)
  setSession(m, { email, verifiedAt: Date.now() })
  return reply(m, conn, successText(result, email))
}

let handler = async function (m, extra = {}) {
  const conn = extra?.conn || this
  const prefix = extra?.usedPrefix || '.'
  const text = String(extra?.text ?? m?.text ?? '').trim()

  const access = accessInfo(m, extra)
  if (!access.allowed) return reply(m, conn, deniedText(prefix))

  if (!text) {
    const session = getSession(m)
    return reply(m, conn, [
      '🔎 *VERIFIKASI ALIGHT MOTION*',
      '',
      session?.email ? `📧 Email di sesi ini: ${session.email}` : '📧 Belum ada email di sesi ini.',
      '',
      'Kirim salah satu:',
      `   ${prefix}ampremverify ${session?.email || 'emailkamu@gmail.com'} | <link dari email>`,
      `   ${prefix}ampremverify <link dari email>`,
      '',
      TUTORIAL(prefix),
    ].join('\n'))
  }

  // Bentuk "email | link"
  if (text.includes('|')) {
    const [rawEmail, ...rest] = text.split('|')
    const email = String(rawEmail || '').trim().toLowerCase()
    const link = rest.join('|').trim()
    if (!isEmail(email) || !isLink(link)) return reply(m, conn, PREFIX_TUTORIAL(prefix))
    return verify(m, conn, prefix, email, link)
  }

  // Link saja → pakai email dari sesi
  if (isLink(text)) {
    const session = getSession(m)
    if (!session?.email) {
      return reply(m, conn, [
        '⚠️ *Belum ada email di sesi ini*',
        '',
        'Sertakan email sekaligus:',
        `${prefix}ampremverify emailkamu@gmail.com | <link>`,
        '',
        'Atau minta link dulu:',
        `${prefix}amprem emailkamu@gmail.com`,
        '',
        TUTORIAL(prefix),
      ].join('\n'))
    }
    return verify(m, conn, prefix, session.email, text)
  }

  // Email saja → arahkan ke langkah 1
  if (isEmail(text)) {
    return reply(m, conn, [
      'ℹ️ Email saja belum cukup untuk verifikasi.',
      '',
      'Langkah 1 — minta link:',
      `   ${prefix}amprem ${text}`,
      '',
      'Langkah 2 — setelah link masuk email:',
      `   ${prefix}ampremverify ${text} | <link dari email>`,
      '',
      TUTORIAL(prefix),
    ].join('\n'))
  }

  return reply(m, conn, PREFIX_TUTORIAL(prefix))
}

handler.help = ['ampremverify <email> | <link>', 'ampremverify <link>']
handler.tags = ['premium']
handler.command = /^ampremverify$/i
handler.description = 'Alight Motion Premium — verifikasi magic link (langkah 2 dari 2)'
handler.example = '.ampremverify email@gmail.com | https://alightcreative.com/...'
handler.limit = false

export default handler
export { handler }
