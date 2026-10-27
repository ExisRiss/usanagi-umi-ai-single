/* By AlzRiss - Usanagi Umi AI
 *
 * CARI PLUGIN (Task127 — diadaptasi dari OURIN V3.4 by AJI, plugins/owner/searchplugin.js)
 *
 * Dengan 2.000+ plugin, mencari fitur lewat `.allmenu` saja tidak praktis.
 * Perintah ini mencari berdasarkan nama perintah, alias, deskripsi, atau nama
 * berkas, lalu menampilkan hasil yang bisa langsung diketik.
 *
 * Perintah:
 *   .cariplugin <kata>   → cari di seluruh plugin
 *   .sp <kata>           → alias
 */

const MAKS_HASIL = 25

function daftarPerintah(plugin) {
  const hasil = []
  const sumber = plugin?.command
  if (sumber instanceof RegExp) {
    const isi = String(sumber.source || '').replace(/^\^|\$$/g, '')
    for (const bagian of isi.split('|')) {
      const bersih = bagian.replace(/[\\^$.*+?()[\]{}]/g, '').trim()
      if (bersih && /^[a-z0-9_-]+$/i.test(bersih)) hasil.push(bersih)
    }
  } else if (Array.isArray(sumber)) {
    for (const item of sumber) if (item) hasil.push(String(item))
  } else if (sumber) {
    hasil.push(String(sumber))
  }
  return hasil
}

/**
 * Cari plugin. Dipisah dari handler supaya bisa diuji tanpa WhatsApp.
 * @param {Record<string, any>} plugins
 * @param {string} kata
 */
export function cariPlugin(plugins, kata) {
  const kueri = String(kata || '').trim().toLowerCase()
  if (!kueri) return []
  const hasil = []
  for (const [berkas, plugin] of Object.entries(plugins || {})) {
    if (!plugin || typeof plugin !== 'object') continue
    const perintah = daftarPerintah(plugin)
    const nama = String(berkas).toLowerCase()
    const deskripsi = String(plugin.description || '').toLowerCase()
    const bantuan = (Array.isArray(plugin.help) ? plugin.help : [plugin.help])
      .filter(Boolean)
      .map(item => String(item).toLowerCase())

    const cocokPerintah = perintah.filter(item => item.toLowerCase().includes(kueri))
    const cocokLain = nama.includes(kueri) || deskripsi.includes(kueri) || bantuan.some(item => item.includes(kueri))
    if (!cocokPerintah.length && !cocokLain) continue

    // Skor: cocok persis di nama perintah paling tinggi, lalu awalan, lalu sisanya.
    let skor = 1
    if (cocokPerintah.some(item => item.toLowerCase() === kueri)) skor = 5
    else if (cocokPerintah.some(item => item.toLowerCase().startsWith(kueri))) skor = 3
    else if (cocokPerintah.length) skor = 2

    hasil.push({
      berkas,
      perintah: perintah.slice(0, 4),
      deskripsi: String(plugin.description || '').slice(0, 90),
      tags: Array.isArray(plugin.tags) ? plugin.tags.join(', ') : String(plugin.tags || ''),
      skor,
    })
  }
  hasil.sort((a, b) => b.skor - a.skor || a.berkas.localeCompare(b.berkas))
  return hasil
}

let handler = async (m, { args, usedPrefix }) => {
  const kata = String((args || []).join(' ') || '').trim()
  if (!kata) {
    return m.reply(
      [
        '🔍 *CARI PLUGIN*',
        '',
        `Cara pakai: ${usedPrefix}cariplugin <kata kunci>`,
        `Contoh: ${usedPrefix}cariplugin stiker`,
      ].join('\n')
    )
  }

  const plugins = global.plugins || {}
  const hasil = cariPlugin(plugins, kata)
  if (!hasil.length) {
    return m.reply(`❌ Tidak ada plugin yang cocok dengan *${kata}*.\nCoba kata lain atau lihat ${usedPrefix}allmenu.`)
  }

  const baris = ['🔍 *HASIL PENCARIAN: ' + kata + '*', `Ditemukan ${hasil.length} plugin` + (hasil.length > MAKS_HASIL ? `, ditampilkan ${MAKS_HASIL}` : ''), '']
  for (const item of hasil.slice(0, MAKS_HASIL)) {
    const perintah = item.perintah.length ? item.perintah.map(c => `${usedPrefix}${c}`).join(' / ') : '(tanpa nama pasti)'
    baris.push(`▸ *${perintah}*`)
    if (item.deskripsi) baris.push(`   ${item.deskripsi}`)
    baris.push(`   📄 ${item.berkas}${item.tags ? ` · 🏷 ${item.tags}` : ''}`)
  }
  if (hasil.length > MAKS_HASIL) {
    baris.push('', `… dan ${hasil.length - MAKS_HASIL} plugin lain. Perjelas kata kuncinya.`)
  }

  await m.reply(baris.join('\n'))
}

handler.command = /^(cariplugin|searchplugin|findplugin|sp)$/i
handler.help = ['cariplugin <kata>']
handler.tags = ['owner', 'tools']
handler.description = 'Mencari plugin berdasarkan nama perintah, deskripsi, atau nama berkas'
handler.owner = true
handler.limit = false

export default handler
