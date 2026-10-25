/* By AlzRiss - Usanagi Umi AI
 *
 * .amprem — SATU perintah untuk Alight Motion Premium.
 *
 * Menggantikan semua perintah lama (amprem2, amprem-send, amprem-verif,
 * am-prem2, amsend/amverif, dll). Alurnya cuma dua langkah:
 *
 *   1) .amprem email@gmail.com            → bot minta server kirim magic link
 *   2) .amprem email@gmail.com | <link>   → bot verifikasi + aktifkan premium
 *
 * Kalau formatnya salah, bot SELALU membalas dengan tutorial lengkap
 * (bukan hanya "format salah"), sesuai permintaan owner.
 *
 * Catatan jujur: aktivasi dikerjakan backend https://am.neonode.my.id/api —
 * hasil akhir (premium aktif/tidak) adalah jawaban backend itu, bot hanya
 * meneruskan. Kalau backend mati, pesan errornya ditampilkan apa adanya.
 */

const API_BASE = 'https://am.neonode.my.id/api'
const TIMEOUT_MS = 30000
const SESSION_TTL_MS = 30 * 60 * 1000

/** email → { email, at } per pengirim (hanya di memori proses). */
const sessions = new Map()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function senderKey(m) {
  return String(m?.sender || m?.key?.participant || m?.chat || '').trim()
}

function setSession(m, patch) {
  const key = senderKey(m)
  if (!key) return
  sessions.set(key, { ...(sessions.get(key) || {}), ...patch, at: Date.now() })
}

function getSession(m) {
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

function isEmail(value) {
  const text = String(value || '').trim()
  return text.length <= 120 && EMAIL_RE.test(text)
}

function isLink(value) {
  const text = String(value || '').trim()
  if (!text) return false
  if (/^https?:\/\//i.test(text)) return true
  return /oobCode=/i.test(text) || (text.length >= 20 && !text.includes(' ') && !text.includes('@'))
}

async function requestJson(path, { method = 'GET', body, timeout = TIMEOUT_MS } = {}) {
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

const TUTORIAL = (prefix = '.') => [
  '🎨 *ALIGHT MOTION PREMIUM — TUTORIAL*',
  '',
  'Cukup satu perintah: *' + prefix + 'amprem*',
  '',
  '*LANGKAH 1 — minta link*',
  `  ${prefix}amprem emailkamu@gmail.com`,
  '  → bot menyuruh server mengirim magic link ke email itu.',
  '',
  '*LANGKAH 2 — verifikasi*',
  `  ${prefix}amprem emailkamu@gmail.com | <link dari email>`,
  '  → tempel link apa adanya setelah tanda | (boleh panjang).',
  '',
  '*Contoh utuh*',
  `  ${prefix}amprem budi@gmail.com`,
  `  ${prefix}amprem budi@gmail.com | https://alightcreative.com/__/auth/action?oobCode=ABC123...`,
  '',
  '*Aturan*',
  '  • satu email per pengirim, sesi berlaku 30 menit;',
  '  • link hanya berlaku sekali — kalau gagal, ulangi langkah 1;',
  '  • jangan kirim link ke orang lain (link itu akses akunmu);',
  '  • bot tidak menyimpan password/magic link setelah proses selesai.',
  '',
  '*Kalau macet*',
  `  ${prefix}amprem            → tutorial ini + status server`,
].join('\n')

async function backendStatus() {
  const data = await requestJson('/status', { timeout: 8000 })
  if (data && String(data.status || '').toLowerCase() === 'online') {
    return { online: true, text: 'online ✅' }
  }
  return { online: false, text: `tidak merespons${data?.message ? ` (${String(data.message).slice(0, 60)})` : ''}` }
}

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

async function reply(m, conn, text) {
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
 * HANDLER
 * ============================================================ */

let handler = async function (m, extra = {}) {
  const conn = extra?.conn || this
  const prefix = extra?.usedPrefix || '.'
  const text = String(extra?.text ?? m?.text ?? '').trim()
  const chat = global?.db?.data?.chats?.[m?.chat] || {}
  const user = global?.db?.data?.users?.[m?.sender] || {}
  const isOwner = Boolean(extra?.isOwner || m?.isOwner)
  const allowed = isOwner || Boolean(user?.premium) || Boolean(chat?.am_mode)

  if (!allowed) {
    return reply(m, conn, [
      '🔒 *Akses ditolak*',
      '',
      'Fitur AM Premium khusus *premium* atau grup dengan *AM Mode* aktif.',
      '',
      `Owner grup bisa: ${prefix}ammode on`,
      'Atau upgrade akunmu jadi premium.',
    ].join('\n'))
  }

  // 1. Tanpa argumen → tutorial lengkap + status server nyata
  if (!text) {
    const status = await backendStatus()
    return reply(m, conn, [TUTORIAL(prefix), '', `🛰️ Server AM: ${status.text}`].join('\n'))
  }

  // 2. Format "email | link" → verifikasi
  if (text.includes('|')) {
    const [rawEmail, ...rest] = text.split('|')
    const email = String(rawEmail || '').trim()
    const link = rest.join('|').trim()
    if (!isEmail(email) || !isLink(link)) {
      return reply(m, conn, [
        '⚠️ *Format verifikasi belum benar*',
        '',
        'Harus: *email | link* — dua-duanya wajib diisi.',
        '',
        TUTORIAL(prefix),
      ].join('\n'))
    }

    await reply(m, conn, `⏳ Memverifikasi ${email} …`)
    const result = await requestJson('/verify-link', { method: 'POST', body: { email, magicLink: link } })
    if (!result?.success) {
      const why = result?.message || result?.code || 'link tidak valid atau sudah kedaluwarsa'
      return reply(m, conn, [
        '❌ *Verifikasi gagal*',
        '',
        `Alasan dari server: ${why}`,
        '',
        `Ulangi langkah 1: ${prefix}amprem ${email}`,
        '',
        TUTORIAL(prefix),
      ].join('\n'))
    }

    sessions.delete(senderKey(m))
    setSession(m, { email, verifiedAt: Date.now() })
    return reply(m, conn, [
      '✅ *BERHASIL DIVERIFIKASI*',
      '',
      result.message ? String(result.message) : 'Premium aktif.',
      ...accountBlock(result.data),
      '',
      'Cek di aplikasi Alight Motion (login email yang sama).',
      `Kalau mau ganti akun: ${prefix}amprem email-lain@gmail.com`,
    ].join('\n'))
  }

  // 3. Link saja → pakai email dari sesi
  if (isLink(text) && !isEmail(text)) {
    const session = getSession(m)
    if (!session?.email) {
      return reply(m, conn, [
        '⚠️ *Belum ada email di sesi ini*',
        '',
        'Kirim email dulu, lalu tempel link-nya bersamaan:',
        `${prefix}amprem emailkamu@gmail.com | <link>`,
        '',
        TUTORIAL(prefix),
      ].join('\n'))
    }
    await reply(m, conn, `⏳ Memverifikasi ${session.email} …`)
    const result = await requestJson('/verify-link', { method: 'POST', body: { email: session.email, magicLink: text } })
    if (!result?.success) {
      const why = result?.message || result?.code || 'link tidak valid'
      return reply(m, conn, [
        '❌ *Verifikasi gagal*',
        '',
        `Alasan dari server: ${why}`,
        '',
        `Minta link baru: ${prefix}amprem ${session.email}`,
      ].join('\n'))
    }
    sessions.delete(senderKey(m))
    return reply(m, conn, [
      '✅ *BERHASIL DIVERIFIKASI*',
      '',
      result.message ? String(result.message) : 'Premium aktif.',
      ...accountBlock(result.data),
    ].join('\n'))
  }

  // 4. Email → minta magic link
  if (isEmail(text)) {
    const email = text
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
      '3. Kirim ke bot:',
      `   ${prefix}amprem ${email} | <link>`,
      '',
      '⏱️ Link biasanya kedaluwarsa dalam beberapa menit — kerjakan langsung.',
    ].filter(Boolean).join('\n'))
  }

  // 5. Apa pun selain di atas → tutorial lengkap, tanpa lempar error
  return reply(m, conn, [
    '⚠️ *Perintah tidak dikenali*',
    '',
    `"${text.slice(0, 40)}" bukan email dan bukan link.`,
    '',
    TUTORIAL(prefix),
  ].join('\n'))
}

handler.help = ['amprem', 'amprem <email>', 'amprem <email> | <link>']
handler.tags = ['premium']
handler.command = /^amprem$/i
handler.description = 'Alight Motion Premium: kirim magic link + verifikasi (satu perintah)'
handler.example = '.amprem email@gmail.com'

export default handler

export { handler, TUTORIAL, sessions }
