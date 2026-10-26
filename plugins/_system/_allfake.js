import fs from 'fs'
import moment from 'moment-timezone'
import path from 'path'

let sharp
try {
  sharp = (await import('sharp')).default
} catch {}

let handler = m => m

/* ============================================================
 * Task119 — thumbnail TIDAK lagi dibaca dari disk tiap pesan.
 *
 * Dulu setiap pesan memanggil fs.readFileSync('media/thumbnail.jpg'); di
 * server yang tidak punya folder media berarti satu exception + syscall per
 * pesan, dan kalau file ada isinya di-resize ulang dengan sharp setiap kali
 * (kerja native 20–80 ms per balasan). Sekarang hasil baca & resize disimpan.
 * ============================================================ */

let cacheThumb = { at: 0, mtimeMs: -1, buffer: Buffer.alloc(0) }
let cacheResize = { key: '', at: 0, buffer: null }

function bacaThumb() {
  const file = path.resolve(process.cwd(), 'media/thumbnail.jpg')
  try {
    const info = fs.statSync(file)
    if (cacheThumb.at && cacheThumb.mtimeMs === info.mtimeMs && Date.now() - cacheThumb.at < 120_000) {
      return cacheThumb.buffer
    }
    const buffer = fs.readFileSync(file)
    cacheThumb = { at: Date.now(), mtimeMs: info.mtimeMs, buffer }
    return buffer
  } catch {
    cacheThumb = { at: Date.now(), mtimeMs: -1, buffer: Buffer.alloc(0) }
    return cacheThumb.buffer
  }
}

async function thumbKecil(thumb) {
  if (!sharp || !thumb?.length) return thumb
  const key = `${thumb.length}:${thumb[0]}:${thumb[thumb.length - 1]}`
  if (cacheResize.key === key && Date.now() - cacheResize.at < 600_000) return cacheResize.buffer
  try {
    const kecil = await sharp(thumb).resize(300, 300, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer()
    cacheResize = { key, at: Date.now(), buffer: kecil }
    return kecil
  } catch {
    return thumb
  }
}

handler.all = async function (m, { __dirname }) {

  global.wm = '❀ USANAGI UMI AI ❀'
  global.fsizedoc = 2024

  const thumb = bacaThumb()

  global.thumb = thumb

  if (this._autoFakePatched) return

  this._autoFakePatched = true

  const originalSend = this.sendMessage.bind(this)

  this.sendMessage = async (
    jid,
    content = {},
    options = {}
  ) => {

    try {

      if (!jid) {
        console.log('[AUTOFAKE] Invalid JID:', jid)
        return
      }

      if (Array.isArray(jid)) {

        const results = []

        for (const id of jid) {

          if (!id) continue

          results.push(
            await this.sendMessage(
              id,
              content,
              options
            )
          )
        }

        return results
      }

      if (typeof jid !== 'string') {
        console.log('[AUTOFAKE] JID bukan string:', jid)
        return originalSend(jid, content, options)
      }

      jid = jid.trim()

      jid = jid.replace(
        /@s\.whatsapp\.net@s\.whatsapp\.net$/i,
        '@s.whatsapp.net'
      )

      jid = jid.replace(
        /@g\.us@g\.us$/i,
        '@g.us'
      )

      if (
        content.pin ||
        content.react ||
        content.delete ||
        content.poll ||
        content.protocolMessage ||
        content.contacts
      ) {
        return originalSend(jid, content, options)
      }

      const isPlainText =
        content.text &&
        !content.linkPreview &&
        !content.image &&
        !content.video &&
        !content.audio &&
        !content.document &&
        !content.sticker &&
        !content.buttons &&
        !content.templateButtons &&
        !content.sections &&
        !content.nativeFlow &&
        !content.nativeFlowMessage &&
        !content.interactiveMessage

      /* Tanpa URL di setelan tidak ada yang bisa dipratinjau: jangan bikin
       * objek linkPreview (dan jangan resize thumbnail) untuk setiap balasan. */
      const urlPratinjau = String(global.links?.websiteUrl || global.scriptUrl || '').trim()
      if (isPlainText && (!urlPratinjau || !thumb.length)) {
        return originalSend(jid, content, options)
      }

      if (isPlainText) {

        const resizedThumb = await thumbKecil(thumb)

        return originalSend(
          jid,
          {
            ...content,
            // Preview metadata must not inject a URL, slash or invisible padding
            // into replies. Keep ordinary text and real command examples intact.
            text: content.text,

            linkPreview: {
              'matched-text': urlPratinjau,
              title: '❀ USANAGI UMI AI ❀',
              description: momentGreeting(),
              previewType: 0,
              jpegThumbnail: resizedThumb
            }
          },
          {
            ...options
          }
        )
      }

      return originalSend(
        jid,
        content,
        options
      )

    } catch (err) {

      console.error(
        '[AUTOFAKE ERROR]',
        err,
        '\nJID:',
        jid
      )

      return originalSend(
        jid,
        content,
        options
      )
    }
  }
}

export default handler

function momentGreeting() {

  const hour = moment
    .tz('Asia/Jakarta')
    .hour()

  if (hour >= 4 && hour < 10) {
    return '🥜 Waku waku! Ohayou~'
  }

  if (hour >= 10 && hour < 15) {
    return '🌸 Konnichiwa! AlzRiss siap membantu~'
  }

  if (hour >= 15 && hour < 18) {
    return '🍃 Sore yang indah desu~'
  }

  if (hour >= 18 && hour < 24) {
    return '🌙 Konbanwa! Jangan tidur kemalaman ya~'
  }

  return '💫 Oyasumi... mimpi indah~'
}