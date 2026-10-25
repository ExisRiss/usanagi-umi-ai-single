/* By AlzRiss - Usanagi Umi AI */

/*
 * Task105b: menu utama sekarang hanya plugin main/umi-menu.js (kartu HTML).
 * Berkas ini tetap menjadi SATU-SATUNYA pemilik perintah .setmenu supaya tidak
 * ada perintah dobel, dan sekarang mengatur dua hal:
 *   1. gaya menu utama  → html (default) / text (cadangan)
 *   2. gaya .help       → 1..5 (perilaku lama plugins/info/main-menu.js)
 */

const LABEL_MENU = {
  1: 'Native Flow',
  2: 'Interactive Button',
  3: 'Classic Text',
  4: 'System Status Dashboard',
  5: 'Interactive Bottom Sheet',
}

async function getMenuStyle() {
  const { readMenuSettings } = await import('../../lib/umi-menu/router.js')
  return readMenuSettings().style === 'text' ? 'text' : 'html'
}

const handler = async (m, { conn, text, isOwner, usedPrefix }) => {
  if (!isOwner) return m.reply('Hanya Owner yang bisa mengganti tampilan menu!')

  if (!global.db) global.db = { data: {} }
  if (!global.db.data) global.db.data = {}
  if (!global.db.data.settings) global.db.data.settings = {}

  const jid = conn.user.jid
  let setting = global.db.data.settings[jid]
  if (!setting) setting = global.db.data.settings[jid] = { setmenu: 1 }

  const prefix = usedPrefix || '.'
  const arg = String(text || (m.args && m.args[0]) || '').trim().toLowerCase()
  const menuStyle = await getMenuStyle()

  if (!arg) {
    return m.reply(
      `*Pengaturan tampilan*\n\n` +
      `Menu utama : *${menuStyle === 'text' ? 'teks' : 'kartu HTML'}*\n` +
      `Gaya .help : *${LABEL_MENU[Number(setting.setmenu) || 1] || LABEL_MENU[1]} (${Number(setting.setmenu) || 1})*\n\n` +
      `*Menu utama:*\n` +
      `${prefix}setmenu html — kartu HTML (disarankan)\n` +
      `${prefix}setmenu text — teks, untuk perangkat yang tidak menampilkan kartu\n\n` +
      `*Gaya .help:*\n` +
      `1. Native Flow\n2. Interactive Button\n3. Classic Text\n4. System Status Dashboard\n5. Interactive Bottom Sheet\n` +
      `Contoh: ${prefix}setmenu 5\n\n` +
      `Catatan: gaya menu lama (modern/legacy) sudah dihapus.`
    )
  }

  if (arg === 'html' || arg === 'modern' || arg === 'default') {
    const { writeMenuSettings } = await import('../../lib/umi-menu/router.js')
    writeMenuSettings({ style: 'html' })
    return m.reply('✅ Menu utama memakai *kartu HTML*.' + (arg === 'html' ? '' : ` (pilihan "${arg}" sekarang = kartu HTML)`))
  }

  if (arg === 'text' || arg === 'teks') {
    const { writeMenuSettings } = await import('../../lib/umi-menu/router.js')
    writeMenuSettings({ style: 'text' })
    return m.reply(`✅ Menu utama memakai *teks*. Kembalikan: ${prefix}setmenu html`)
  }

  const type = parseInt(arg, 10)
  if (isNaN(type) || type < 1 || type > 5) {
    return m.reply(
      `❌ Pilihan "${arg}" tidak dikenal.\n\n` +
      `Menu utama: ${prefix}setmenu html | ${prefix}setmenu text\n` +
      `Gaya .help: ${prefix}setmenu 1..5`
    )
  }

  setting.setmenu = type
  return m.reply(
    `✅ Gaya .help diubah\n\n` +
    `📌 Style: *${LABEL_MENU[type]}* (${type})\n` +
    `👤 Set oleh: Owner\n\n` +
    `Gaya menu utama tidak berubah: *${menuStyle === 'text' ? 'teks' : 'kartu HTML'}*`
  )
}

handler.help = ['setmenu']
handler.tags = ['owner']
handler.command = /^setmenu$/i
handler.category = 'owner'
handler.description = 'Mengatur tampilan menu utama (HTML/teks) dan gaya .help'
handler.ownerOnly = true
handler.owner = true
handler.groupOnly = false
handler.disabled = false
handler.hiddenFromCategory = false

export default handler
