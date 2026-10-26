/* By AlzRiss - Usanagi Umi AI
 *
 * PENGIRIM KARTU RICH "LIVE" (Task121)
 *
 * Satu tempat untuk bentuk rich message yang sudah terbukti tampil di HP
 * owner — bentuk yang dipakai `.ping3` sejak awal:
 *
 *   messageContextInfo (botMetadata.botResponseId)
 *   └─ botForwardedMessage.message.richResponseMessage
 *        ├─ messageType: 1
 *        ├─ submessages: [{ messageType: 2, messageText: judul }]
 *        └─ unifiedResponse.data = base64({ __typename: GenAIUnifiedResponse,
 *                                          response_id, sections: [bagian] })
 *
 * `bagian` berisi `view_model` → primitive `GenAIaeacdsnwHtmlPrimitive`
 * dengan `payload` = HTML kartu. HTML dijalankan di WebView WhatsApp yang
 * tidak punya jaringan, jadi semua aset harus disematkan (data URI).
 *
 * Semua pengirim kartu (ping3, menu rich, dll.) memakai fungsi ini supaya
 * bentuknya tidak pernah berbeda-beda lagi.
 */

import { randomUUID } from 'node:crypto'

export const JUDUL_BAWAAN = 'Usanagi Umi AI'

/** Bungkus HTML menjadi `view_model` yang dipahami WhatsApp. */
export function bagianHtml(html) {
  return {
    view_model: {
      __typename: 'GenAISingleLayoutViewModel',
      primitive: {
        __typename: 'GenAIaeacdsnwHtmlPrimitive',
        trusted_sources: [],
        payload: String(html || ''),
      },
    },
  }
}

/**
 * Susun isi pesan (tanpa mengirim).
 * @param {{ bagian: object, title?: string, responseId?: string }} opsi
 */
export function bangunPesanKartuLive({ bagian, title = JUDUL_BAWAAN, responseId } = {}) {
  if (!bagian || typeof bagian !== 'object') throw new TypeError('bagian kartu wajib diisi')
  const id = responseId || randomUUID()
  const unified = {
    __typename: 'GenAIUnifiedResponse',
    response_id: id,
    sections: [
      {
        __typename: 'GenAIUnifiedResponseSection',
        ...bagian,
      },
    ],
  }

  return {
    messageId: id,
    message: {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        botMetadata: {
          messageDisclaimerText: '',
          botResponseId: id,
        },
      },
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: [{ messageType: 2, messageText: String(title).slice(0, 200) }],
            unifiedResponse: {
              data: Buffer.from(JSON.stringify(unified)).toString('base64'),
            },
            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
              forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
              forwardOrigin: 4,
            },
          },
        },
      },
    },
  }
}

/**
 * Kirim kartu rich live ke satu chat.
 * @returns {Promise<{ok:boolean, mode:string, messageId:string}>}
 */
export async function kirimKartuLive(conn, chat, opsi = {}) {
  const { message, messageId } = bangunPesanKartuLive(opsi)
  await conn.relayMessage(chat, message, { messageId })
  return { ok: true, mode: 'rich-live', messageId }
}

export default { bagianHtml, bangunPesanKartuLive, kirimKartuLive, JUDUL_BAWAAN }
