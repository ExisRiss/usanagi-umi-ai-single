/* By AlzRiss - Usanagi Umi AI
 *
 * .swgroup — kirim STATUS grup (group status) ke grup yang dipilih.
 *
 * Perbaikan Task110:
 *  1. Daftar grup diambil dari grup yang benar-benar diikuti bot
 *     (`groupFetchAllParticipating`, fallback: metadata per chat). Dulu daftar
 *     diambil dari `conn.chats` yang masih menyimpan grup lama/ sudah ditinggal,
 *     sehingga memilih nomor tersebut langsung gagal `Error: forbidden (403)`.
 *  2. Setiap grup diperiksa metadata-nya lebih dulu; grup yang tidak bisa
 *     diakses (403/404) dilewati dan tidak ditampilkan sebagai pilihan.
 *  3. Semua pengiriman dibungkus try/catch → pengguna menerima pesan jelas,
 *     bukan stack panjang di laporan error.
 */

import * as baileys from '@rexxhayanasi/elaina-baileys'
import crypto from 'node:crypto'
import { PassThrough } from 'stream'
import ffmpeg from 'fluent-ffmpeg'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Cache daftar grup per koneksi, umur 60 detik. */
const groupListCache = new Map()

function cacheKey(conn) {
  return String(conn?.user?.id || conn?.user?.jid || 'conn')
}

async function listMyGroups(conn, { force = false } = {}) {
  const key = cacheKey(conn)
  const cached = groupListCache.get(key)
  if (!force && cached && Date.now() - cached.at < 60000) return cached.groups

  const groups = []
  const push = (jid, subject) => {
    const id = String(jid || '').trim()
    if (!id.endsWith('@g.us')) return
    if (groups.some((item) => item.jid === id)) return
    groups.push({ jid: id, subject: String(subject || '').trim() || id })
  }

  // 1) Sumber paling akurat: hanya grup tempat bot masih menjadi anggota.
  try {
    if (typeof conn?.groupFetchAllParticipating === 'function') {
      const map = await conn.groupFetchAllParticipating()
      for (const [jid, meta] of Object.entries(map || {})) push(jid, meta?.subject)
    }
  } catch (error) {
    console.warn('[SWGROUP] groupFetchAllParticipating gagal:', error?.message || error)
  }

  // 2) Cadangan: metadata per chat (dibatasi supaya tidak membanjiri WhatsApp).
  if (!groups.length) {
    const chats = Object.keys(conn?.chats || {}).filter((jid) => String(jid).endsWith('@g.us'))
    for (const jid of chats.slice(0, 40)) {
      try {
        const meta = await conn.groupMetadata(jid)
        if (meta?.participants) push(jid, meta.subject)
      } catch {
        /* grup tidak bisa diakses → lewati */
      }
      await delay(400)
    }
  }

  groupListCache.set(key, { at: Date.now(), groups })
  return groups
}

let handler = async (m, { conn, text }) => {
  const raw = String(text || '').trim()

  // ── .swgroup list ──────────────────────────────────────────
  if (!raw || /^(list|daftar)$/i.test(raw)) {
    const groups = await listMyGroups(conn, { force: Boolean(raw) })
    if (!groups.length) {
      return m.reply('📢 Bot belum mengikuti grup apa pun (atau metadata grup tidak bisa dibaca).')
    }
    const list = groups.map((item, index) => `${index + 1}. ${item.subject}`).join('\n')
    return m.reply(
      `📢 *LIST GRUP*\n\n${list}\n\n` +
      `Contoh:\n.swgroup 1|Halo semua\n\n` +
      `Reply gambar/video/audio:\n.swgroup 1\n\n` +
      `_Daftar diambil dari grup yang benar-benar diikuti bot._`
    )
  }

  const parts = raw.split('|')
  const nomor = Number(String(parts[0] || '').trim()) - 1
  const groups = await listMyGroups(conn)

  if (!Number.isInteger(nomor) || nomor < 0 || !groups[nomor]) {
    return m.reply(
      `Nomor grup tidak valid.\n\n` +
      `Lihat daftar dulu: .swgroup list\n` +
      `Jumlah grup yang bisa dipakai: ${groups.length}`
    )
  }

  const target = groups[nomor].jid
  const quoted = m.quoted || m
  const mime = quoted?.mimetype || ''
  const caption = parts.slice(1).join('|').trim() || quoted?.caption || ''

  // ── Pastikan grup benar-benar bisa diakses sebelum mengirim ──
  try {
    const meta = await conn.groupMetadata(target)
    if (!Array.isArray(meta?.participants)) throw new Error('metadata grup kosong')
  } catch (error) {
    const code = error?.code || error?.data
    return m.reply(
      `❌ Grup *${groups[nomor].subject}* tidak bisa diakses bot (${code || 'gagal'}).\n\n` +
      `Kemungkinan bot sudah keluar dari grup itu. Coba \`.swgroup list\` lagi untuk daftar terbaru.`
    )
  }

  // ── Kirim status ───────────────────────────────────────────
  try {
    if (/image|video|audio/.test(mime)) {
      const buffer = await quoted.download().catch(() => null)
      if (!buffer) return m.reply('❌ Gagal mengunduh media yang kamu reply.')

      let content = {}
      if (/image/.test(mime)) {
        content = { image: buffer, caption }
      } else if (/video/.test(mime)) {
        content = { video: buffer, caption }
      } else {
        const vn = await toVN(buffer)
        content = { audio: vn, ptt: true, mimetype: 'audio/ogg; codecs=opus' }
      }

      await groupStatus(conn, target, content)
      return m.reply('✅ Status grup berhasil dikirim')
    }

    if (!caption) {
      return m.reply(
        `Contoh:\n.swgroup 1|Halo semua\n\nAtau reply media:\n.swgroup 1`
      )
    }

    await groupStatus(conn, target, { text: caption })
    return m.reply('✅ Status grup berhasil dikirim')
  } catch (error) {
    const code = error?.code || error?.data || error?.output?.statusCode || ''
    const pesan = String(error?.message || error || '')
    const alasan = String(code) === '403' || /forbidden/i.test(pesan)
      ? 'WhatsApp menolak (403 forbidden). Pastikan bot masih anggota grup dan kamu admin grup.'
      : String(code) === '404'
        ? 'Grup tidak ditemukan (404). Kemungkinan grup sudah dibubarkan.'
        : pesan.slice(0, 180) || 'Alasan tidak diketahui.'
    return m.reply(`❌ Gagal mengirim status grup.\n\n${alasan}`)
  }
}

async function groupStatus(conn, jid, content) {
  const inside = await baileys.generateWAMessageContent(content, {
    upload: conn.waUploadToServer
  })

  const secret = crypto.randomBytes(32)

  const msg = baileys.generateWAMessageFromContent(
    jid,
    {
      messageContextInfo: {
        messageSecret: secret
      },
      groupStatusMessageV2: {
        message: {
          ...inside,
          messageContextInfo: {
            messageSecret: secret
          }
        }
      }
    },
    {}
  )

  await conn.relayMessage(
    jid,
    msg.message,
    {
      messageId: msg.key.id
    }
  )

  return msg
}

async function toVN(buffer) {
  return new Promise((resolve, reject) => {
    const input = new PassThrough()
    const output = new PassThrough()
    const chunks = []

    input.end(buffer)

    ffmpeg(input)
      .noVideo()
      .audioCodec('libopus')
      .format('ogg')
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(chunks)))
      .pipe(output)

    output.on('data', chunk => chunks.push(chunk))
  })
}

handler.help = ['swgroup']
handler.tags = ['owner']
handler.command = /^(swgroup|swgc2)$/i
handler.owner = true

export default handler
