/* By AlzRiss - Usanagi Umi AI
 *
 * Mengambil command ID dari balasan tombol, list, template, atau native flow.
 * Fungsi ini sengaja dependency-free agar aman dipakai serializer dan plugin.
 *
 * PENTING (Task104): balasan tombol native di WhatsApp datang dalam beberapa
 * bentuk berbeda. Yang paling sering bikin "tombol ditekan tapi bot diam":
 *
 *   { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson } } }
 *
 * Bentuk bersarang itu dulu tidak dibaca, jadi `m.text` kosong dan handler
 * tidak pernah dijalankan. Sekarang semua bentuk di bawah ini dibaca.
 */
export function extractSelectionId(message = {}) {
  if (!message || typeof message !== 'object') return ''

  const direct =
    message?.selectedButtonId ||
    message?.singleSelectReply?.selectedRowId ||
    message?.selectedId ||
    message?.buttonsResponseMessage?.selectedButtonId ||
    message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    message?.templateButtonReplyMessage?.selectedId ||
    message?.templateButtonReplyMessage?.selectedButtonId

  if (typeof direct === 'string' && direct) return direct

  const payloads = [
    message?.nativeFlowResponseMessage?.paramsJson,
    message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson,
  ].filter(Boolean)

  for (const paramsJson of payloads) {
    try {
      const params = typeof paramsJson === 'string' ? JSON.parse(paramsJson) : paramsJson
      const id = params?.id || params?.selectedId || params?.rowId || params?.selectedRowId
      if (typeof id === 'string' && id) return id
    } catch {
      /* paramsJson rusak → coba bentuk berikutnya */
    }
  }

  return ''
}

export default { extractSelectionId }
