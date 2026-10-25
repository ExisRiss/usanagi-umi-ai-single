/* By AlzRiss - Usanagi Umi AI
 *
 * .amprem — Alight Motion Premium (LANGKAH 1: kirim magic link)
 *
 * Satu-satunya tempat kunci/logika bersama untuk tiga perintah AM:
 *   .amprem              → panduan singkat + status server
 *   .amprem <email>      → minta server kirim magic link ke email itu
 *   .ampremverify        → (berkas plugins/premium/amprem-verify.js)
 *   .ampremtutorial      → (berkas plugins/premium/amprem-tutorial.js)
 *
 * Kalau pemakaian salah, balasannya SELALU memuat panduan lengkap — bukan
 * cuma "format salah".
 *
 * Backend: https://am.neonode.my.id/api  (dicek hidup lewat /status)
 * Bot hanya meneruskan jawaban backend; tidak ada klaim premium palsu.
 */

const API_BASE = 'https://am.neonode.my.id/api'
const TIMEOUT_MS = 30000
const SESSION_TTL_MS = 30 * 60 * 1000

/** email per pengirim, hanya di memori proses (hilang saat restart). */
const sessions = new Map()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* ============================================================
 * UTIL
 * ============================================================ */

export function senderKey(m) {
  return String(m?.sender || m?.key?.participant || m?.chat || '').trim()
}

export function setSession(m, patch) {
  const key = senderKey(m)
  if (!key) return
  sessions.set(key, { ...(sessions.get(key) || {}), ...patch, at: Date.now() })
}

export function getSession(m) {
  const key = senderKey(m)
  if (!key) return null
  const row = sessions.get(key)
  if (!row) return null
  if (Date.now() - row.at > SESSION_TTL_MS) {
    sessions.delete(key)
    return null
  }
  return row
}

export function clearSession(m) {
  sessions.delete(senderKey(m))
}

export function isEmail(value) {
  const text = String(value || '').trim()
  return text.length <= 120 && EMAIL_RE.test(text)
}

export function isLink(value) {
  const text = String(value || '').trim()
  if (!text) return false
  if (/^https?:\/\//i.test(text)) return true
  return /oobCode=/i.test(text) || (text.length >= 20 && !text.includes(' ') && !text.includes('@'))
}

export async function requestJson(path, { method = 'GET', body, timeout = TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    let data = null
    try { data = await response.json() } catch { data = null }
    if (!response.ok && (!data || typeof data !== 'object')) {
      return { success: false, message: `Server menjawab HTTP ${response.status}.` }
    }
    return data || { success: false, message: `Server menjawab HTTP ${response.status} tanpa isi.` }
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'server tidak menjawab (timeout)' : String(error?.message || error)
    return { success: false, message: reason }
  } finally {
    clearTimeout(timer)
  }
}

export async function reply(m, conn, text) {
  try {
    if (typeof m?.reply === 'function') return await m.reply(text)
  } catch {}
  try {
    if (typeof conn?.reply === 'function') return await conn.reply(m.chat, text, m)
  } catch {}
  try {
    if (typeof conn?.sendMessage === 'function') return await conn.sendMessage(m.chat, { text }, { quoted: m })
  } catch {}
  return null
}

/* ============================================================
 * HAK AKSES
 * ============================================================ */

/**
 * Boleh dipakai kalau: owner, user premium, atau grup dengan `am_mode` aktif
 * (flag lama tetap dihormati supaya grup yang sudah pernah mengaktifkannya
 * tidak kehilangan akses).
 */
export function accessInfo(m, extra = {}) {
  const chat = global?.db?.data?.chats?.[m?.chat] || {}
  const user = global?.db?.data?.users?.[m?.sender] || {}
  const isOwner = Boolean(extra?.isOwner || m?.isOwner)
  const premium = Boolean(user?.premium)
  const amMode = Boolean(chat?.am_mode)
  return { allowed: isOwner || premium || amMode, isOwner, premium, amMode }
}

export function deniedText(prefix = '.') {
  return [
    '🔒 *Akses ditolak*',
    '',
    'Fitur Alight Motion Premium hanya untuk:',
    '  • owner bot,',
    '  • user premium, atau',
    '  • grup yang sudah punya *AM Mode* aktif.',
    '',
    `Lihat tutorial: ${prefix}ampremtutorial`,
  ].join('\n')
}

/* ============================================================
 * TEKS TUTORIAL
 * ============================================================ */

export const TUTORIAL = (prefix = '.') => [
  '🎨 *ALIGHT MOTION PREMIUM — TUTORIAL*',
  '',
  '*1. Minta magic link*',
  `   ${prefix}amprem emailkamu@gmail.com`,
  '   → server mengirim link aktivasi ke email itu.',
  '',
  '*2. Salin link dari email*',
  '   Buka inbox (atau folder SPAM), cari email dari Alight Motion,',
  '   lalu salin SELURUH tautannya.',
  '',
  '*3. Verifikasi*',
  `   ${prefix}ampremverify emailkamu@gmail.com | <link tadi>`,
  '   atau cukup link-nya saja (bot ingat email 30 menit):',
  `   ${prefix}ampremverify <link tadi>`,
  '',
  '*4. Selesai*',
  '   Bot menampilkan status akun. Login ke aplikasi Alight Motion',
  '   dengan email yang sama, premium langsung aktif.',
  '',
  '*Bantuan*',
  `   ${prefix}ampremtutorial     tutorial lengkap + FAQ`,
  `   ${prefix}amprem             panduan singkat + status server`,
].join('\n')

/** Ambil status backend sungguhan (bukan tebakan). */
export async function backendStatus() {
  const data = await requestJson('/status', { timeout: 8000 })
  if (data && String(data.status || '').toLowerCase() === 'online') {
    return { online: true, text: 'online ✅' }
  }
  const why = data?.message ? ` (${String(data.message).slice(0, 60)})` : ''
  return { online: false, text: `tidak merespons${why}` }
}

/* ============================================================
 * HANDLER
 * ============================================================ */

let handler = async function (m, extra = {}) {
  const conn = extra?.conn || this
  const prefix = extra?.usedPrefix || '.'
  const text = String(extra?.text ?? m?.text ?? '').trim()

  const access = accessInfo(m, extra)
  if (!access.allowed) return reply(m, conn, deniedText(prefix))

  // Tanpa argumen → panduan singkat + status server nyata
  if (!text) {
    const status = await backendStatus()
    return reply(m, conn, [
      '🎨 *ALIGHT MOTION PREMIUM*',
      '',
      'Kirim email kamu:',
      `   ${prefix}amprem emailkamu@gmail.com`,
      '',
      'Setelah dapat link dari email:',
      `   ${prefix}ampremverify emailkamu@gmail.com | <link>`,
      '',
      `🛰️ Server AM: ${status.text}`,
      '',
      TUTORIAL(prefix),
    ].join('\n'))
  }

  // Sudah ada tanda "|" atau berupa link → arahkan ke perintah verifikasi
  if (text.includes('|') || (isLink(text) && !isEmail(text))) {
    return reply(m, conn, [
      'ℹ️ Sepertinya ini data verifikasi.',
      '',
      'Gunakan perintah verifikasi:',
      `   ${prefix}ampremverify ${text}`.trim(),
      '',
      TUTORIAL(prefix),
    ].join('\n'))
  }

  // Email → minta magic link
  if (isEmail(text)) {
    const email = text.toLowerCase()
    setSession(m, { email })
    const result = await requestJson('/send-link', { method: 'POST', body: { email } })
    if (!result?.success) {
      const why = result?.message || 'server AM menolak permintaan'
      return reply(m, conn, [
        '❌ *Gagal mengirim magic link*',
        '',
        `Alasan dari server: ${why}`,
        '',
        `Coba lagi sebentar: ${prefix}amprem ${email}`,
        '',
        TUTORIAL(prefix),
      ].join('\n'))
    }
    return reply(m, conn, [
      '✅ *MAGIC LINK DIKIRIM*',
      '',
      `📧 Email: ${email}`,
      result.message ? `ℹ️ ${result.message}` : '',
      '',
      '*LANGKAH BERIKUTNYA*',
      '1. Buka inbox / folder spam.',
      '2. Salin seluruh link verifikasi.',
      `3. Kirim: ${prefix}ampremverify ${email} | <link>`,
      '',
      '⏱️ Link biasanya cepat kedaluwarsa — kerjakan langsung.',
      '⚠️ Jangan bagikan link ke orang lain.',
    ].filter(Boolean).join('\n'))
  }

  // Selain email/link → panduan lengkap, tanpa melempar error
  return reply(m, conn, [
    '⚠️ *Itu bukan email*',
    '',
    `"${text.slice(0, 40)}" tidak dikenali. Contoh benar:`,
    `   ${prefix}amprem budi@gmail.com`,
    '',
    TUTORIAL(prefix),
  ].join('\n'))
}

handler.help = ['amprem <email>']
handler.tags = ['premium']
handler.command = /^amprem$/i
handler.description = 'Alight Motion Premium — minta magic link (langkah 1 dari 2)'
handler.example = '.amprem email@gmail.com'
handler.limit = false

export default handler

export { handler, sessions, API_BASE }
