/* By AlzRiss - Usanagi Umi AI
 *
 * MENU UMI — satu sistem menu untuk seluruh bot.
 *
 * Sejak Task105 lanjutan (permintaan owner: "hapus menu lama, ganti pakai menu
 * HTML"), perintah menu lama sudah dihapus dan seluruhnya dilayani di sini:
 *
 *   .menu                  → kartu HTML Liquid Glass (fallback teks otomatis)
 *   .umimenu / .lmenu      → sama dengan .menu
 *   .menu_all [_halaman]   → seluruh perintah terdaftar (berhalaman)
 *   .menu_owner            → menu owner (diperiksa di server)
 *   .menu_group            → menu grup + cek metadata & admin bot
 *   .menu_game             → perintah kategori game
 *   .menu_tools            → perintah kategori tools
 *   .menu_refresh          → status terbaru (dibatasi 30 detik)
 *   .menu_back             → kembali ke menu
 *   .menu_dashboard        → paksa kartu HTML
 *   .allmenu               → alias .menu_all
 *   .kategori [nama]       → daftar perintah satu kategori
 *   .umimenu system umi|legacy  → (kompatibilitas; menu baru kini default)
 *   .umimenu style html|text    → paksa tampilan HTML atau teks
 *
 * Tombol/list WhatsApp mengirim balik ID-nya (mis. ".menu_all") yang oleh
 * serializer menjadi perintah biasa; router di lib/umi-menu/router.js yang
 * menjalankan aksinya, termasuk seluruh pemeriksaan izin.
 */

import {
  dispatchMenuCommand, handleNumericSelection, parseActionId,
  readMenuSettings, writeMenuSettings,
} from '../../lib/umi-menu/router.js'
import { buildCatalogue } from '../../lib/umi-menu/registry.js'
import { isOwner } from '../../lib/awang-cekakses.js'

const COMMAND_RE = /^(umimenu|lmenu|menu|allmenu|kategori|listmenu|menu_(?:all|owner|group|game|tools|refresh|back|dashboard)(?:_\d+)?)$/i

async function handleSettings(m, { conn, args }) {
  let allowed = m.fromMe === true
  if (!allowed) {
    try { allowed = await isOwner(m.sender, conn) } catch { allowed = false }
  }
  if (!allowed) {
    await m.reply('⛔ Hanya owner yang boleh mengubah pengaturan menu.')
    return { ok: false, mode: 'denied' }
  }

  const field = String(args?.[0] || '').toLowerCase()
  const value = String(args?.[1] || '').toLowerCase()
  const current = readMenuSettings()

  if (!field) {
    await m.reply([
      '⚙️ *PENGATURAN MENU*',
      '',
      `Gaya    : ${current.style} (html = kartu Liquid Glass, text = menu teks)`,
      `Sistem  : ${current.system}`,
      '',
      '.umimenu style html|text',
      '.umimenu system umi|legacy',
    ].join('\n'))
    return { ok: true, mode: 'info' }
  }

  if (field === 'style') {
    if (!['html', 'text'].includes(value)) {
      await m.reply('Pilihan gaya: html atau text.\nContoh: .umimenu style text')
      return { ok: false, mode: 'invalid' }
    }
    const saved = writeMenuSettings({ style: value })
    if (!saved.ok) {
      await m.reply(`❌ Gagal menyimpan: ${saved.error}`)
      return { ok: false, mode: 'error' }
    }
    await m.reply(value === 'html'
      ? '✅ Menu kembali memakai kartu HTML Liquid Glass (fallback teks tetap otomatis).'
      : '✅ Menu memakai tampilan teks. Kembalikan dengan `.umimenu style html`.')
    return { ok: true, mode: 'style' }
  }

  if (field === 'system') {
    if (!['umi', 'legacy'].includes(value)) {
      await m.reply('Menu lama sudah dihapus — nilai yang berlaku hanya `umi`.\nGunakan `.umimenu style text` bila ingin tampilan teks.')
      return { ok: false, mode: 'invalid' }
    }
    writeMenuSettings({ system: value })
    await m.reply('✅ Sistem menu: ' + value)
    return { ok: true, mode: 'system' }
  }

  await m.reply('Pilihan: style | system.\nContoh: .umimenu style html')
  return { ok: false, mode: 'invalid' }
}

let handler = async function (m, extra = {}) {
  const conn = extra.conn || this
  const prefix = extra.usedPrefix || global.prefix || '.'
  const command = String(m.command || extra.command || '').toLowerCase().replace(/[^a-z0-9_]/g, '')
  const args = Array.isArray(extra.args) ? extra.args : String(extra.text || '').trim().split(/\s+/).filter(Boolean)

  // .umimenu system|style …
  if ((command === 'umimenu' || command === 'lmenu') && ['system', 'style'].includes(String(args[0] || '').toLowerCase())) {
    return handleSettings(m, { conn, args })
  }

  // .umimenu [aksi]
  if (command === 'umimenu' || command === 'lmenu') {
    const wanted = String(args[0] || '').trim()
    const parsed = wanted ? parseActionId(wanted) : null
    if (parsed) return dispatchMenuCommand(m, { conn, prefix, action: parsed.action, page: parsed.page })
    return dispatchMenuCommand(m, { conn, prefix, action: 'menu_dashboard' })
  }

  // .menu → kartu HTML
  if (command === 'menu') return dispatchMenuCommand(m, { conn, prefix, action: 'menu_dashboard' })

  // .allmenu → daftar semua fitur (halaman 1 atau halaman yang diminta)
  if (command === 'allmenu') {
    const page = Number(String(args[0] || '').replace(/\D/g, '')) || null
    return dispatchMenuCommand(m, { conn, prefix, action: 'menu_all', page })
  }

  // .kategori <nama> / .listmenu
  if (command === 'kategori' || command === 'listmenu') {
    return dispatchMenuCommand(m, { conn, prefix, action: 'menu_kategori', args })
  }

  // ID tombol/list/native-flow
  const parsed = parseActionId(command)
  if (!parsed) return
  return dispatchMenuCommand(m, { conn, prefix, action: parsed.action, page: parsed.page })
}

handler.command = COMMAND_RE
handler.help = ['menu', 'allmenu', 'kategori', 'menu_owner', 'menu_group', 'menu_game', 'menu_tools', 'menu_refresh']
handler.tags = ['main']
handler.category = 'main'
handler.description = 'Menu utama Umi Usanagi AI — kartu HTML Liquid Glass dengan statistik hidup, katalog fitur berhalaman, dan pemeriksaan izin'
handler.limit = false

/**
 * Hook ringan: hanya bereaksi pada balasan angka 1–6 DAN hanya bila menu baru
 * saja yang dikirim ke chat itu (state di router, kedaluwarsa 2 menit).
 */
handler.all = async function (m) {
  try {
    if (!m?.text || m.isBaileys) return
    if (m.text.startsWith('.')) return
    if (!/^[1-6]$/.test(m.text.trim())) return
    return await handleNumericSelection(m, { conn: this, prefix: global.prefix || '.' })
  } catch (error) {
    console.error('[UMI-MENU] hook angka gagal:', error?.message || error)
    return false
  }
}

export { buildCatalogue }
export default handler
