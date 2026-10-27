/* By AlzRiss - Usanagi Umi AI
 *
 * Menyalurkan balasan tombol / daftar / native-flow menjadi perintah biasa.
 *
 * Perbaikan Task108 (menekan tombol menu tapi bot diam):
 *  1. ID dibaca dengan `extractSelectionId` baru → bentuk bersarang
 *     (`interactiveResponseMessage.nativeFlowResponseMessage`) dan bentuk
 *     terbungkus (`viewOnceMessage`) ikut terbaca.
 *  2. ID tanpa prefix (mis. "allmenu") diberi prefix SEBELUM dikirim ulang.
 *     Prefix diambil dari pengaturan chat yang sebenarnya (core/awang-prefix),
 *     bukan tebakan — dulu salah prefix sehingga handler mengabaikannya.
 *  3. Pengiriman ulang hanya dilakukan bila ID itu memang nama perintah yang
 *     terdaftar, supaya payload tombol lain tidak memicu "perintah tak dikenal".
 *  4. Pesan sintetis hanya dibuat kalau serializer belum mengisi m.text,
 *     supaya tidak ada balasan ganda.
 */

import {
  proto,
  generateWAMessage,
  areJidsSameUser,
  generateMessageIDV2,
} from '@rexxhayanasi/elaina-baileys'
import { extractSelectionId } from '../../lib/message-response.js'
import { actionFromLabel } from '../../lib/umi-menu/label-action.js'
import { bangunDaftarPerintah, cocokPerintah } from '../../lib/plugin-command-match.js'
import { getActivePrefix } from '../../core/awang-prefix.js'
import { prefixStorageKey } from '../../lib/bot-config.js'

const PREFIX_CHARS = ['.', '/', '!', '#', '?', '<', '>', '$', '%', '&', '+', '-', '=', '#']

function fallbackPrefix() {
  const value = String(global?.prefix || '.').trim()
  return value || '.'
}

/** Prefix yang benar-benar dipakai handler untuk chat ini. */
export async function activePrefixFor(conn, chat) {
  try {
    const fallback = conn?.botConfig?.defaultPrefix || fallbackPrefix()
    const value = await getActivePrefix(prefixStorageKey(conn, chat), fallback)
    const text = String(value || fallback).trim()
    return text || '.'
  } catch {
    return fallbackPrefix()
  }
}

/** Pastikan ID punya prefix supaya bisa dieksekusi handler. */
export function withPrefix(id, prefix) {
  const value = String(id || '').trim()
  if (!value) return ''
  if (PREFIX_CHARS.includes(value[0])) return value
  const head = String(prefix || fallbackPrefix()).trim() || '.'
  return `${head}${value}`
}

/* ---------------------------------------------------------------
 * Daftar perintah yang terdaftar (di-cache sebentar supaya ringan).
 * Pencocokan memakai `lib/plugin-command-match.js` — regex diuji UTUH,
 * bukan dipecah dengan split('|') seperti versi lama yang membuat
 * `menu_owner` / `menu_all` tidak pernah dikenali (Task127).
 * --------------------------------------------------------------- */
let commandCache = { at: 0, cmd: new Set(), help: new Set(), regex: [] }

function isKnownCommand(id) {
  if (!commandCache.at || Date.now() - commandCache.at > 60_000) {
    commandCache = bangunDaftarPerintah(global.plugins || {})
  }
  return cocokPerintah(commandCache, id)
}

function responseId(m) {
  if (!m?.message) return ''
  const viaSerializer = extractSelectionId(m.message)
  if (viaSerializer) return viaSerializer
  return extractSelectionId(m.msg)
}

export async function all(m, chatUpdate) {
  try {
    if (!m?.message) return
    const looksLikeResponse =
      m.message.buttonsResponseMessage ||
      m.message.templateButtonReplyMessage ||
      m.message.listResponseMessage ||
      m.message.interactiveResponseMessage ||
      m.message.viewOnceMessage?.message?.interactiveResponseMessage ||
      m.message.viewOnceMessageV2?.message?.interactiveResponseMessage ||
      m.message.pollUpdateMessage
    if (!looksLikeResponse) return

    const raw = responseId(m)
    if (!raw) return

    /* Task127 — label tombol ("All Menu\nseluruh perintah …") bukan nama
     * perintah. Kalau labelnya dikenali sebagai aksi menu, jalankan aksinya;
     * kalau tidak, lewati seperti sebelumnya. */
    const label = raw.includes('\n') || /\s/.test(raw.trim()) ? actionFromLabel(raw) : null
    const target = label ? label.action : raw
    if (!label && !isKnownCommand(raw)) return

    const id = withPrefix(target, await activePrefixFor(this, m.chat))

    // Serializer sudah memasukkan ID ke m.text → handler menanganinya sendiri.
    if (String(m.text || '').trim() === id) return

    const messages = await generateWAMessage(
      m.chat,
      { text: id, mentions: m.mentionedJid },
      {
        userJid: this.user.jid,
        quoted: m.quoted && m.quoted.fakeObj,
      }
    )
    messages.key.remoteJid = m.chat
    messages.key.fromMe = areJidsSameUser(m.sender, this.user.id)
    messages.key.id = typeof generateMessageIDV2 === 'function'
      ? generateMessageIDV2(m.sender)
      : `${m.key?.id || Date.now()}-tap`
    messages.pushName = m.pushName
    if (m.isGroup) messages.key.participant = messages.participant = m.sender

    const wrapped = {
      ...chatUpdate,
      messages: [proto.WebMessageInfo.create(messages)].map(v => ((v.conn = this), v)),
      type: 'append',
    }
    this.ev.emit('messages.upsert', wrapped)
  } catch (error) {
    console.error('[TEMPLATE-RESPONSE] gagal menyalurkan tombol:', error?.message || error)
  }
}
