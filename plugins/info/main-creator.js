/* By AlzRiss - Usanagi Umi AI
 *
 * $developer / .creator — kartu kontak developer.
 *
 * Bug yang diperbaiki (laporan 28-10-2026):
 *   `TypeError: Cannot read properties of undefined (reading 'ratio_16_9')`
 *   Plugin lama membaca `global.images.ratio_16_9` dan `global.ownerInfo`,
 *   padahal dua-duanya TIDAK PERNAH ADA di config.js bot ini. Akibatnya
 *   perintah $developer selalu gagal dan cuma mengirim laporan error.
 *
 * Perbaikan:
 *   1. Semua nilai global dibuat opsional. Gambar diambil dari aset lokal
 *      (assets/menu/) kalau `global.images` tidak ada.
 *   2. Nama/nomor developer dibaca dari `global.owner` (data asli), bukan
 *      `global.ownerInfo` yang tidak ada.
 *   3. Ada jalur cadangan: kalau AIRich gagal, kirim gambar + kartu kontak
 *      (vCard). Jadi perintah ini TIDAK BISA diam.
 */

import path from 'path'
import fs from 'fs'
import { AIRich } from '../../lib/ui/MessageBuilder.js'

/* Aset lokal yang memang ada di server. Dipakai kalau global.images kosong. */
const ASET = [
  path.join(process.cwd(), 'assets', 'menu', 'cover.jpg'),
  path.join(process.cwd(), 'assets', 'menu', 'logo.jpg'),
  path.join(process.cwd(), 'assets', 'menu', 'bg-card.jpg'),
]

function asetAda(jalur) {
  try { return fs.existsSync(jalur) ? jalur : '' } catch (error) { return '' }
}

/** Daftar developer dari global.owner (format: [nomor, nama, isDeveloper]). */
function daftarDeveloper() {
  const owner = Array.isArray(global.owner) ? global.owner : []
  const hasil = owner
    .filter((baris) => Array.isArray(baris) && baris[0])
    .map(([nomor, nama, isDev]) => ({ nomor: String(nomor), nama: String(nama || 'Developer'), dev: isDev !== false }))
  if (!hasil.length) return [{ nomor: '6287813709432', nama: 'AlzRiss', dev: true }]
  return hasil
}

const utama = () => daftarDeveloper()[0]

let handler = async (m, { conn }) => {
  const dev = utama()
  const nomorWa = dev.nomor + '@s.whatsapp.net'

  const gambarBesar = (global.images && global.images.ratio_16_9 && global.images.ratio_16_9.url) || asetAda(ASET[0])
  const gambarKecil = (global.images && global.images.ratio_1_1 && global.images.ratio_1_1.url) || asetAda(ASET[1])
  const info = global.ownerInfo || {}

  const teks = [
    '👨‍💻 *DEVELOPER BOT*',
    '',
    `Nama    : ${info.title || dev.nama}`,
    `Nomor   : wa.me/${dev.nomor}`,
    `Produk  : ${global.namebot || 'Usanagi Umi AI'}`,
    '',
    'Bot ini dibuat dan dirawat oleh ' + dev.nama + '.',
    'Ada kendala, mau titip fitur, atau lapor bug? Chat langsung nomornya.',
    '',
    global.brandCredit || 'By AlzRiss - Usanagi Umi AI',
  ].join('\n')

  /* Jalur utama: kartu rich. Semua langkah dibungkus supaya kegagalan apa pun
   * tidak lagi berakhir sebagai laporan error. */
  try {
    const rich = new AIRich(conn)
    if (gambarBesar) {
      rich.addImage(gambarBesar, {
        width: (global.images && global.images.ratio_16_9 && global.images.ratio_16_9.width) || 1600,
        height: (global.images && global.images.ratio_16_9 && global.images.ratio_16_9.height) || 900,
      })
    }
    rich.addSection({
      view_model: {
        primitive: {
          __typename: 'GenAICompactEntityPrimitive',
          title: info.title || dev.nama,
          subtitle: info.subtitle || 'Developer ' + (global.namebot || 'Usanagi Umi AI'),
          secondary_subtitle: info.secondary_subtitle || 'wa.me/' + dev.nomor,
          entity_id: info.entity_id || dev.nomor,
          entity_url: info.entity_url || 'https://wa.me/' + dev.nomor,
          entity_type: 'PAGE',
          action_type: 'FOLLOW',
          is_verified: true,
          image: {
            url: gambarKecil || gambarBesar,
            url_fallback: gambarKecil || gambarBesar,
          },
        },
        __typename: 'GenAISingleLayoutViewModel',
      },
    })
    rich.addText(global.brandCredit || 'By AlzRiss - Usanagi Umi AI')
    await rich.send(m.chat, { quoted: m })
    return
  } catch (error) {
    console.log('[main-creator] kartu rich gagal, pakai cadangan: ' + (error && error.message ? error.message : error))
  }

  /* Cadangan 1: gambar + caption. */
  try {
    const baca = gambarBesar && fs.existsSync(gambarBesar) ? fs.readFileSync(gambarBesar) : null
    if (baca) {
      await conn.sendMessage(m.chat, { image: baca, caption: teks, mentions: [nomorWa] }, { quoted: m })
      return
    }
  } catch (error) {
    console.log('[main-creator] cadangan gambar gagal: ' + (error && error.message ? error.message : error))
  }

  /* Cadangan 2: teks + kartu kontak. */
  try {
    return await conn.sendMessage(m.chat, {
      contacts: {
        displayName: dev.nama,
        contacts: [{ vcard: [
          'BEGIN:VCARD', 'VERSION:3.0',
          'FN:' + dev.nama,
          'ORG:' + (global.namebot || 'Usanagi Umi AI'),
          'TEL;type=CELL;type=VOICE;waid=' + dev.nomor + ':+' + dev.nomor,
          'END:VCARD',
        ].join('\n') }],
      },
    }, { quoted: m })
  } catch (error) {
    return m.reply(teks)
  }
}

handler.help = ['creator', 'developer']
handler.tags = ['main']
handler.command = /^(creator|developer|ownerbot|pembuat)$/i
handler.description = 'Kartu kontak developer bot'
handler.fail = null

export { handler }
export default handler
