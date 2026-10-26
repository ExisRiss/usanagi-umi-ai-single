/* By AlzRiss - Usanagi Umi AI
 *
 * .calc <ekspresi> — kalkulator (+ - * / % ^ dan kurung).
 * Diadaptasi dari plugin "calc" bot VanXone Multi Device, dengan tambahan:
 * ekspresi divalidasi karakter per karakter sebelum dihitung (tidak ada eval
 * bebas), dan hasil desimal panjang dipotong rapi.
 */
function hitungAman(ekspresi) {
  // Hanya angka, titik, operator, dan kurung. Tidak ada huruf/simbol lain,
  // jadi tidak ada jalan untuk menyisipkan kode ke Function().
  if (!/^[\d+\-*/%().\s]+$/.test(ekspresi)) return null
  if (/\.\s*\./.test(ekspresi)) return null
  const buka = (ekspresi.match(/\(/g) || []).length
  const tutup = (ekspresi.match(/\)/g) || []).length
  if (buka !== tutup) return null
  try {
    const nilai = Function(`"use strict"; return (${ekspresi})`)()
    return typeof nilai === 'number' && Number.isFinite(nilai) ? nilai : null
  } catch {
    return null
  }
}

const handler = async (m, { text, usedPrefix, command }) => {
  const asli = String(text || '').trim()
  if (!asli) return m.reply(`Contoh:\n${usedPrefix}${command} (12+8)*3/4\n${usedPrefix}${command} 15%4`)

  const ekspresi = asli
    .replace(/[x×]/gi, '*')
    .replace(/[:÷]/g, '/')
    .replace(/\^/g, '**')
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ')

  if (ekspresi.length > 120) return m.reply('Ekspresi terlalu panjang (maksimal 120 karakter).')
  const nilai = hitungAman(ekspresi)
  if (nilai === null) {
    return m.reply('Ekspresi tidak valid. Hanya angka dan operator + − × ÷ % ^ ( ) yang diperbolehkan.')
  }
  const rapi = Number(nilai.toFixed(10))
  return m.reply(`${asli} = *${rapi.toLocaleString('id-ID', { maximumFractionDigits: 10 })}*`)
}

handler.help = ['calc <ekspresi>']
handler.tags = ['tools']
handler.command = ['calc', 'hitung', 'kalkulator']
handler.description = 'Kalkulator sederhana dengan kurung dan pangkat'

export default handler
