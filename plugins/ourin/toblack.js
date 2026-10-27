/* By AlzRiss - Usanagi Umi AI
 *
 * `.toblack` — ubah gambar yang dibalas menjadi hitam putih (grayscale).
 *
 * Fitur OURIN (plugins/image/toblack.js) yang belum ada di Umi. Versi OURIN
 * memakai API luar; versi ini mengolah gambar di server memakai
 * `@napi-rs/canvas` yang memang sudah terpasang untuk menu — jadi tidak ada
 * API yang bisa mati, dan gambar tidak dikirim ke pihak ketiga.
 *
 * Batas: gambar diperkecil dulu ke maksimal 1600 px sisi terpanjang supaya
 * pemrosesan tidak menghabiskan memori bot.
 */

const MAKS_SISI = 1600
const MAKS_BYTE = 12 * 1024 * 1024

async function handler(m, { conn }) {
  const sumber = m.quoted ? m.quoted : m
  if (!/image/.test(String(sumber.mtype || '').toLowerCase())) {
    return m.reply('〄 Balas sebuah *gambar* dengan .toblack (atau kirim gambar dengan caption .toblack).')
  }

  await m.react('🕐')
  let buffer
  try {
    buffer = await sumber.download()
  } catch (e) {
    await m.react('❌')
    return m.reply(`〄 Gagal mengunduh gambar: ${String(e?.message || e).slice(0, 140)}`)
  }
  if (!buffer || !buffer.length) {
    await m.react('❌')
    return m.reply('〄 Gambarnya kosong, coba kirim ulang.')
  }
  if (buffer.length > MAKS_BYTE) {
    await m.react('❌')
    return m.reply(`〄 Gambar terlalu besar (${(buffer.length / 1048576).toFixed(1)} MB). Maksimal 12 MB.`)
  }

  let hasil
  try {
    const { loadImage, createCanvas } = await import('@napi-rs/canvas')
    const gambar = await loadImage(buffer)
    const skala = Math.min(1, MAKS_SISI / Math.max(gambar.width, gambar.height))
    const lebar = Math.max(1, Math.round(gambar.width * skala))
    const tinggi = Math.max(1, Math.round(gambar.height * skala))

    const kanvas = createCanvas(lebar, tinggi)
    const ctx = kanvas.getContext('2d')
    ctx.drawImage(gambar, 0, 0, lebar, tinggi)

    const data = ctx.getImageData(0, 0, lebar, tinggi)
    const piksel = data.data
    for (let i = 0; i < piksel.length; i += 4) {
      // Luminance standar (0.299 R + 0.587 G + 0.114 B)
      const abu = piksel[i] * 0.299 + piksel[i + 1] * 0.587 + piksel[i + 2] * 0.114
      const nilai = abu < 0 ? 0 : abu > 255 ? 255 : abu
      piksel[i] = nilai
      piksel[i + 1] = nilai
      piksel[i + 2] = nilai
    }
    ctx.putImageData(data, 0, 0)
    hasil = await kanvas.encode('png')
  } catch (e) {
    await m.react('❌')
    return m.reply(`〄 Gagal mengolah gambar: ${String(e?.message || e).slice(0, 160)}`)
  }

  await conn.sendMessage(
    m.chat,
    { image: hasil, caption: '〄 *HITAM PUTIH*\n\n〄 Gambar diubah jadi grayscale di server, tanpa API luar.' },
    { quoted: m }
  )
  await m.react('✅')
}

handler.help = ['toblack']
handler.tags = ['maker']
handler.command = /^(toblack|hitamputih)$/i
handler.limit = false
handler.cooldown = 3

export default handler
