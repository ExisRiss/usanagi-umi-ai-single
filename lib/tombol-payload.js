/* By AlzRiss - Usanagi Umi AI
 *
 * Tombol interaktif yang PASTI berbentuk `interactiveMessage` polos.
 *
 * Kenapa file ini ada (Task120):
 *   `lib/awang-tombol.js` versi lama membungkus interactiveMessage dengan
 *   `viewOnceMessage` (pesan "lihat sekali"). Akibatnya di banyak HP pesan
 *   rich tidak bisa dibuka sama sekali — hanya pengirim (bot) dan sebagian
 *   penerima yang client-nya kebetulan masih membuka bungkus itu.
 *
 *   Library resmi yang dipakai bot (@rexxhayanasi/elaina-baileys, MessageBuilder
 *   v4.7) mengirim `interactiveMessage` LANGSUNG di level atas pesan, tanpa
 *   bungkus view-once sama sekali. Bentuk itulah yang dipakai di sini.
 *
 * File ini sengaja TANPA import apa pun supaya bentuk payload bisa diuji
 * tanpa memasang seluruh dependensi bot (lihat tests/task120-menu-interaktif.mjs).
 */

/* Batas tombol mengikuti library (Utils/native-flow.js):
 *   10 kalau tombol PERTAMA quick_reply, selain itu 3. */
export const MAKS_TOMBOL = 3
export const MAKS_TOMBOL_QUICK = 10
export const MAKS_BAGIAN = 10 // daftar pilihan: maksimal 10 bagian
export const MAKS_BARIS_PER_BAGIAN = 10 // maksimal 10 baris per bagian
export const MAKS_BARIS = MAKS_BAGIAN * MAKS_BARIS_PER_BAGIAN

const teks = (nilai, batas = 1024) => String(nilai == null ? '' : nilai).slice(0, batas)

function paramsJson(nilai) {
  if (typeof nilai === 'string') {
    // Sudah berupa JSON? Pastikan valid, kalau tidak bungkus sebagai objek.
    try {
      JSON.parse(nilai)
      return nilai
    } catch {
      return JSON.stringify({ display_text: nilai })
    }
  }
  return JSON.stringify(nilai || {})
}

/**
 * Ubah satu tombol "gaya lama" (ButtonV2 / raw) menjadi tombol native flow.
 *
 * Bentuk yang diterima:
 *   { buttonText: { displayText }, buttonId, type: 1 }          → quick_reply
 *   { buttonText: { displayText }, nativeFlowInfo: {...} }      → nama native flow
 *   { name, buttonParamsJson }                                  → sudah native
 *   { text, url } / { text, copyCode }                          → cta_url / cta_copy
 */
export function tombolKeNative(btn) {
  const label = teks(btn?.buttonText?.displayText || btn?.text || btn?.label || 'Pilihan', 40)

  if (btn?.name && btn?.buttonParamsJson !== undefined) {
    return { name: String(btn.name), buttonParamsJson: paramsJson(btn.buttonParamsJson) }
  }

  if (btn?.nativeFlowInfo?.name) {
    return {
      name: String(btn.nativeFlowInfo.name),
      buttonParamsJson: paramsJson(btn.nativeFlowInfo.paramsJson),
    }
  }

  if (btn?.url) {
    return {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: label,
        url: String(btn.url),
        merchant_url: String(btn.merchantUrl || btn.url),
      }),
    }
  }

  if (btn?.copyCode) {
    return {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({
        display_text: label,
        id: String(btn.id || btn.copyCode),
        copy_code: String(btn.copyCode),
      }),
    }
  }

  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: label,
      id: String(btn?.buttonId || btn?.id || label),
    }),
  }
}

/**
 * Batasi bagian daftar pilihan supaya WhatsApp tidak menolak payload
 * (406 not-acceptable). Sisa pilihan tetap bisa dijelajahi lewat perintah.
 */
export function rapikanBagian(sections = [], { maksBagian = MAKS_BAGIAN, maksBaris = MAKS_BARIS, prefix = '.' } = {}) {
  let sisaBaris = maksBaris
  const hasil = []
  for (const bagian of Array.isArray(sections) ? sections : []) {
    if (hasil.length >= maksBagian || sisaBaris <= 0) break
    const baris = (bagian?.rows || [])
      // maksimal 10 baris per bagian (batas yang sama dipakai periksaPayload)
      .slice(0, Math.min(MAKS_BARIS_PER_BAGIAN, sisaBaris))
      .map(row => ({
        header: teks(row?.header, 60),
        title: teks(row?.title || row?.command, 60),
        description: teks(row?.description, 120),
        id: String(row?.id || row?.command || ''),
      }))
      .filter(row => row.id && row.title)
    if (!baris.length) continue
    sisaBaris -= baris.length
    hasil.push({
      title: teks(bagian?.title || 'Pilihan', 60),
      highlight_label: teks(bagian?.highlightLabel || bagian?.highlight_label || '', 30),
      rows: baris,
    })
  }
  return hasil
}

/**
 * Media header dari bentuk `ButtonV2.setMedia({ headerType, imageMessage })`.
 * Mengembalikan objek siap-tempel di `header`, atau null.
 */
export function pilihMediaHeader(data) {
  if (!data || typeof data !== 'object') return null
  if (data.imageMessage) return { imageMessage: data.imageMessage }
  if (data.videoMessage) return { videoMessage: data.videoMessage }
  if (data.documentMessage) return { documentMessage: data.documentMessage }
  if (data.locationMessage) return { locationMessage: data.locationMessage }
  // Sudah berupa { imageMessage } / { videoMessage } hasil prepareWAMessageMedia.
  if (data.headerType && data.mimetype) return null
  return null
}

/**
 * Bangun isi pesan interaktif (TANPA bungkus view-once).
 *
 * @returns {{ interactiveMessage: object }}
 */
export function bangunInteractive({
  title = '',
  subtitle = '',
  body = ' ',
  footer = '',
  media = null,
  contextInfo = null,
  buttons = [],
  messageParams = {},
} = {}) {
  const headerMedia = pilihMediaHeader(media) || {}
  const header = {
    ...(teks(title, 60) ? { title: teks(title, 60) } : {}),
    ...(teks(subtitle, 60) ? { subtitle: teks(subtitle, 60) } : {}),
    hasMediaAttachment: Boolean(Object.keys(headerMedia).length),
    ...headerMedia,
  }

  const daftar = (Array.isArray(buttons) ? buttons : []).map(tombolKeNative)
  const batas = daftar[0]?.name === 'quick_reply' ? MAKS_TOMBOL_QUICK : MAKS_TOMBOL
  const native = daftar.slice(0, batas)

  return {
    interactiveMessage: {
      header,
      body: { text: teks(body || ' ', 1024) },
      footer: { text: teks(footer, 1024) },
      ...(contextInfo && typeof contextInfo === 'object' ? { contextInfo } : {}),
      nativeFlowMessage: {
        messageParamsJson: JSON.stringify(messageParams || {}),
        buttons: native,
      },
    },
  }
}

/**
 * Periksa payload sebelum dikirim. Dipakai uji otomatis dan self-test server.
 * @returns {{ ok: boolean, masalah: string[], info: object }}
 */
export function periksaPayload(content) {
  const masalah = []
  const pesan = content?.interactiveMessage
  if (!pesan) {
    masalah.push('tidak ada interactiveMessage di level atas')
  }
  if (content?.viewOnceMessage || content?.viewOnceMessageV2 || pesan?.viewOnce) {
    masalah.push('masih dibungkus view-once (penyebab tidak bisa dibuka di HP lain)')
  }
  if (content?.buttonsMessage) {
    masalah.push('memakai buttonsMessage lama (tidak tampil di WhatsApp terbaru)')
  }

  const tombol = pesan?.nativeFlowMessage?.buttons || []
  if (!tombol.length) masalah.push('tidak ada tombol native flow')
  // WhatsApp Web: 10 tombol bila tombol pertama quick_reply, selain itu 3.
  const batasTombol = tombol[0]?.name === 'quick_reply' ? MAKS_TOMBOL_QUICK : MAKS_TOMBOL
  if (tombol.length > batasTombol) masalah.push(`tombol ${tombol.length} > ${batasTombol}`)

  for (const [index, btn] of tombol.entries()) {
    if (!btn?.name) masalah.push(`tombol #${index + 1} tanpa nama native flow`)
    try {
      const params = JSON.parse(btn.buttonParamsJson)
      if (btn.name === 'quick_reply' && !params.display_text) masalah.push(`quick_reply #${index + 1} tanpa display_text`)
      if (btn.name === 'single_select') {
        const sections = params.sections || []
        if (!sections.length) masalah.push('single_select tanpa bagian')
        const total = sections.reduce((n, s) => n + (s.rows || []).length, 0)
        if (total === 0) masalah.push('single_select tanpa baris')
        if (sections.length > MAKS_BAGIAN) masalah.push(`bagian daftar ${sections.length} > ${MAKS_BAGIAN}`)
        for (const bagian of sections) {
          const jumlah = (bagian.rows || []).length
          if (jumlah > MAKS_BARIS_PER_BAGIAN) masalah.push(`bagian "${bagian.title}" punya ${jumlah} baris > ${MAKS_BARIS_PER_BAGIAN}`)
        }
        for (const baris of sections.flatMap(s => s.rows || [])) {
          if (!baris.id) masalah.push('baris daftar tanpa id perintah')
        }
      }
    } catch {
      masalah.push(`tombol #${index + 1} buttonParamsJson bukan JSON valid`)
    }
  }

  const bodyText = pesan?.body?.text
  if (!bodyText) masalah.push('body kosong (WhatsApp menolak)')

  return {
    ok: masalah.length === 0,
    masalah,
    info: {
      tombol: tombol.length,
      jenisTombol: tombol.map(t => t.name),
      adaMedia: Boolean(pesan?.header?.hasMediaAttachment),
      panjangBody: String(bodyText || '').length,
      panjangFooter: String(pesan?.footer?.text || '').length,
    },
  }
}

export default { tombolKeNative, rapikanBagian, pilihMediaHeader, bangunInteractive, periksaPayload }
