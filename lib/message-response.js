/* By AlzRiss - Usanagi Umi AI
 *
 * Mengambil command ID dari balasan tombol, list, template, atau native flow.
 * Fungsi ini sengaja dependency-free agar aman dipakai serializer dan plugin.
 *
 * Kenapa berkas ini penting (Task106/107):
 *   Tombol menu yang ditekan bisa datang dalam BANYAK bentuk. Kalau bentuknya
 *   tidak dikenali, `m.text` jadi kosong dan bot terlihat "diam" walaupun
 *   tombolnya ditekan. Bentuk-bentuk yang ditangani sekarang:
 *
 *   1. Datar (serializer sudah mengupas satu lapis):
 *        { selectedButtonId } | { singleSelectReply:{selectedRowId} } | { selectedId }
 *        { nativeFlowResponseMessage:{ paramsJson } }
 *   2. Bersarang di dalam interactiveResponseMessage (kasus single_select):
 *        { interactiveResponseMessage:{ nativeFlowResponseMessage:{ paramsJson } } }
 *   3. Utuh satu pesan (bila serializer belum mengupas):
 *        { buttonsResponseMessage:{selectedButtonId} } | { listResponseMessage:{...} }
 *        { templateButtonReplyMessage:{selectedId} }
 *   4. Dibungkus viewOnce / ephemeral / dokumen:
 *        { viewOnceMessage:{ message:{ interactiveResponseMessage:{...} } } }
 */

const WRAPPER_KEYS = [
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'ephemeralMessage',
  'documentWithCaptionMessage',
  'editedMessage',
]

/** Kupas pembungkus pesan (viewOnce/ephemeral) sampai kedalaman aman. */
export function unwrapMessage(message, depth = 0) {
  if (!message || typeof message !== 'object' || depth > 6) return message
  for (const key of WRAPPER_KEYS) {
    const inner = message?.[key]?.message
    if (inner && typeof inner === 'object') return unwrapMessage(inner, depth + 1)
  }
  return message
}

function readDirectId(source) {
  if (!source || typeof source !== 'object') return ''
  const value =
    source?.selectedButtonId ||
    source?.singleSelectReply?.selectedRowId ||
    source?.selectedId ||
    source?.buttonsResponseMessage?.selectedButtonId ||
    source?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    source?.templateButtonReplyMessage?.selectedId ||
    source?.templateButtonReplyMessage?.selectedButtonId
  return typeof value === 'string' ? value.trim() : ''
}

function readParamsJson(paramsJson) {
  if (!paramsJson) return ''
  try {
    const params = typeof paramsJson === 'string' ? JSON.parse(paramsJson) : paramsJson
    const value = params?.id || params?.selectedId || params?.rowId || params?.selectedRowId
    return typeof value === 'string' ? value.trim() : ''
  } catch {
    return ''
  }
}

function readNativeFlowId(source) {
  if (!source || typeof source !== 'object') return ''
  const flat = readParamsJson(source?.nativeFlowResponseMessage?.paramsJson)
  if (flat) return flat
  return readParamsJson(source?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson)
}

/**
 * Kumpulkan semua objek yang mungkin memuat ID: dirinya, hasil kupas
 * pembungkus, dan isi properti satu tingkat.
 */
function candidateObjects(message) {
  const seen = new Set()
  const list = []
  const push = value => {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    list.push(value)
  }

  push(message)
  push(unwrapMessage(message))

  // isi satu tingkat (mis. m.msg, message.interactiveResponseMessage, dll.)
  for (const source of [...list]) {
    for (const key of Object.keys(source)) {
      const value = source[key]
      if (value && typeof value === 'object') push(value)
    }
  }

  // kupas pembungkus pada setiap kandidat juga
  for (const source of [...list]) push(unwrapMessage(source))

  return list
}

export function extractSelectionId(message = {}) {
  if (!message || typeof message !== 'object') return ''

  for (const source of candidateObjects(message)) {
    const direct = readDirectId(source)
    if (direct) return direct
    const native = readNativeFlowId(source)
    if (native) return native
  }

  return ''
}

export default { extractSelectionId, unwrapMessage }
