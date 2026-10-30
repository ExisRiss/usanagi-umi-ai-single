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

/**
 * CSS gulir untuk SEMUA kartu rich (Task176).
 *
 * Keluhan owner: kartu rich selain `..menu` tidak bisa digeser. Penyebabnya
 * halaman tidak pernah diberi tinggi layar + overflow, jadi WebView memotong
 * isi yang lebih panjang dari layar.
 *
 * Kartu yang sudah punya wadah gulir sendiri (menu "Sea & Sun") menandai
 * <body class="umi-scroll-sendiri"> supaya aturan ini tidak dobel.
 */
const CSS_GULIR = `<style id="umi-gulir-kartu">
/* html overflow:hidden WAJIB — kalau tidak, overflow body "merembes" ke viewport
   dan body tidak pernah jadi wadah gulir yang sebenarnya. */
html{height:100%;overflow:hidden}
body{height:100%;margin:0;overflow:hidden}
body:not(.umi-scroll-sendiri){overflow-y:auto;overflow-x:hidden;
-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;touch-action:pan-y}
</style>`

/**
 * Sisipkan CSS gulir ke HTML kartu (idempoten).
 *
 * Task177 — kartu yang mengatur gulirnya sendiri (`umi-scroll-sendiri`,
 * misalnya menu "Sea & Sun" dengan tab tetap dan area isi bergulir) TIDAK
 * boleh ditimpa `html,body{height:100%;overflow:hidden}`: aturan itu datang
 * belakangan sehingga menang, dan di WebView dengan tinggi kecil seluruh
 * bagian bawah kartu (termasuk tab) ikut terpotong.
 */
export function sisipGulir(html) {
  const teks = String(html || '')
  if (!teks || teks.includes('umi-gulir-kartu')) return teks
  if (/umi-scroll-sendiri/.test(teks)) return teks
  if (/<\/head>/i.test(teks)) return teks.replace(/<\/head>/i, `${CSS_GULIR}</head>`)
  if (/<body[^>]*>/i.test(teks)) return teks.replace(/<body[^>]*>/i, (tag) => `${CSS_GULIR}${tag}`)
  return `${CSS_GULIR}${teks}`
}

/** Bungkus HTML menjadi `view_model` yang dipahami WhatsApp. */
export function bagianHtml(html) {
  return {
    view_model: {
      __typename: 'GenAISingleLayoutViewModel',
      primitive: {
        __typename: 'GenAIaeacdsnwHtmlPrimitive',
        trusted_sources: [],
        payload: sisipGulir(html),
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

export default { bagianHtml, sisipGulir, bangunPesanKartuLive, kirimKartuLive, JUDUL_BAWAAN }
