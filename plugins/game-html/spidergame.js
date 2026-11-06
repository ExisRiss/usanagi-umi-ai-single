/* By AlzRiss - Usanagi Umi AI
 *
 * SPIDERGAME (Task197) — RichMassange Explorer V2.
 * Game eksplorasi canvas + joystick virtual (file HTML siap main dari user).
 *
 * Dua cara main:
 *   1. /spidergame       → dikirim sebagai pesan AI Rich (HTML interaktif
 *                          di dalam chat — butuh WA terbaru).
 *   2. Versi web (jagaan): https://spidergame-alzriss.gwenna.my.id/
 *      (disajikan dari situs/spidergame/index.html — fallback kalau rich
 *      tidak didukung perangkat, dan link dikirim otomatis).
 *
 * Prefix mengikuti prefix bot (kebijakan Task117).
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { botJidAktif } from '../../lib/bot-jid.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BERKAS = path.join(HERE, '..', '..', 'lib', 'rich-games', 'spidergame.html')
const WEB_URL = String(process.env.SPIDERGAME_WEB_URL || 'https://spidergame-alzriss.gwenna.my.id/').trim()

let cacheHtml = ''
function muatHtml() {
  if (!cacheHtml) cacheHtml = fs.readFileSync(BERKAS, 'utf8')
  return cacheHtml
}

const handler = async (m, { conn, usedPrefix }) => {
  if (!conn?.relayMessage) {
    await m.reply(`❌ Perangkat ini tidak mendukung pesan HTML interaktif.\n🌐 Versi web (bisa diklik): ${WEB_URL}`)
    return
  }
  await m.reply('🎮 _Memuat Spider Explorer..._')
  try {
    const html = muatHtml()
    const responseId = crypto.randomUUID()
    await conn.relayMessage(
      m.chat,
      {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
          botMetadata: {
            messageDisclaimerText: '',
            botResponseId: responseId,
          },
        },
        botForwardedMessage: {
          message: {
            richResponseMessage: {
              messageType: 1,
              submessages: [
                {
                  messageType: 2,
                  messageText: `Spider Explorer • RichMassange V2 — pakai joystick di layar. Web: ${WEB_URL}`,
                },
              ],
              unifiedResponse: {
                data: Buffer.from(
                  JSON.stringify({
                    response_id: responseId,
                    sections: [
                      {
                        view_model: {
                          primitive: {
                            __typename: 'GenAIaeacdsnwHtmlPrimitive',
                            payload: html,
                            trusted_sources: [],
                          },
                          __typename: 'GenAISingleLayoutViewModel',
                        },
                      },
                    ],
                  }),
                ).toString('base64'),
              },
              contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedAiBotMessageInfo: { botJid: botJidAktif(conn) },
                forwardOrigin: 4,
              },
            },
          },
        },
      },
      { messageId: responseId },
    )
    console.log('[spidergame] rich terkirim ke', m.chat, `${muatHtml().length} B`)
  } catch (e) {
    console.error('[spidergame]', e?.message || e)
    await m.reply(
      `❌ Gagal merender UI game di chat: ${String(e?.message || e).slice(0, 140)}\n\n` +
      `🌐 Main lewat web (selalu bisa): ${WEB_URL}`,
    )
  }
}

handler.help = ['spidergame']
handler.tags = ['game']
handler.command = /^(spidergame|htmlspider)$/i
handler.description = 'Spider Explorer (RichMassange V2) — game eksplorasi joystick di chat & web'
handler.cooldown = 5

export default handler
