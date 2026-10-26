/* By AlzRiss - Usanagi Umi AI
 *
 * PERENDER MENU TEKS BARU (Task121)
 *
 * `.menu` (prefix tunggal) mengirim TEKS dengan susunan yang sama seperti
 * kartu rich: sapaan → blok info bot/pengguna → daftar menu bernomor →
 * watermark. Tanpa import apa pun, supaya bisa diuji tanpa dependensi bot.
 */

export const BATAS_TEKS = 6000 // WhatsApp mulai memotong di atas ±65k; 6k cukup lega

const bersih = nilai => String(nilai == null ? '' : nilai).replace(/\s+$/, '')

/**
 * @param {object} opsi
 * @param {string} [opsi.sapaan]     baris pembuka, mis. "Selamat Pagi @Alz aja"
 * @param {string} [opsi.info]       blok info bot & pengguna (sudah diformat)
 * @param {Array}  [opsi.pilihan]    [{ label, hint, command }]
 * @param {string} [opsi.prefix]
 * @param {string} [opsi.watermark]
 * @param {string} [opsi.judul]      judul daftar, bawaan "MENU UTAMA"
 */
export function bangunTeksMenu({
  sapaan = '',
  info = '',
  pilihan = [],
  prefix = '.',
  watermark = '',
  judul = 'MENU UTAMA',
} = {}) {
  const baris = []

  if (bersih(sapaan)) {
    baris.push(bersih(sapaan))
    baris.push('')
  }
  if (bersih(info)) {
    baris.push(bersih(info))
    baris.push('')
  }

  baris.push(`📋 *${judul}*`)
  pilihan.forEach((opsi, index) => {
    const label = String(opsi?.label || opsi?.command || `Menu ${index + 1}`)
    const hint = String(opsi?.hint || opsi?.description || '').trim()
    baris.push(`${index + 1}. ${label}${hint ? ` — ${hint}` : ''}`)
    baris.push(`   ${prefix}${opsi?.command || ''}`)
  })
  baris.push('')
  baris.push(`Ketik nomor (1-${pilihan.length}) atau perintahnya.`)
  if (pilihan.length) {
    baris.push(`Contoh: ${prefix}${pilihan[0].command} · ${prefix}${pilihan[pilihan.length - 1].command}`)
  }
  if (bersih(watermark)) {
    baris.push('')
    baris.push(bersih(watermark))
  }

  const teks = baris.join('\n')
  return teks.length > BATAS_TEKS ? `${teks.slice(0, BATAS_TEKS)}\n…` : teks
}

/* Daftar pilihan bawaan — sama persis dengan tombol yang dulu dikirim. */
export const PILIHAN_BAWAAN = [
  { label: 'All Menu', hint: 'seluruh perintah per kategori', command: 'menu_all' },
  { label: 'Owner Menu', hint: 'khusus owner/developer', command: 'menu_owner' },
  { label: 'Group Menu', hint: 'perintah grup & admin', command: 'menu_group' },
  { label: 'Game Menu', hint: 'game & RPG', command: 'menu_game' },
  { label: 'Tools Menu', hint: 'tools, downloader, konverter', command: 'menu_tools' },
  { label: 'Refresh Status', hint: 'ambil status terbaru', command: 'menu_refresh' },
]

export default { bangunTeksMenu, PILIHAN_BAWAAN, BATAS_TEKS }
