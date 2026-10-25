/* By AlzRiss - Usanagi Umi AI
 *
 * Menu WhatsApp Umi Usanagi AI — plugin pembuka + router interaksi.
 *
 * Perintah:
 *   .umimenu / .lmenu        → menu utama (daftar native, fallback teks)
 *   .menu_all [_halaman]     → seluruh perintah terdaftar (berhalaman)
 *   .menu_owner              → menu owner (diperiksa di server)
 *   .menu_group              → menu grup + cek metadata & admin bot
 *   .menu_game               → perintah kategori game
 *   .menu_tools              → perintah kategori tools
 *   .menu_refresh            → ambil status terbaru (dibatasi 30 detik)
 *   .menu_back               → kembali ke menu utama
 *   .menu_dashboard          → kartu HTML (rich HTML, fallback teks)
 *   .umimenu system <umi|legacy> [owner] → alihkan `.menu` ke sistem ini
 *
 * Tombol/list WhatsApp mengirim ID (menu_all, menu_owner, …) yang oleh
 * serializer menjadi perintah biasa, jadi router di lib/umi-menu/router.js
 * yang menjalankan semuanya — termasuk pemeriksaan izin.
 */

import { dispatchMenuCommand, handleNumericSelection, parseActionId, readMenuSettings, writeMenuSettings } from '../../lib/umi-menu/router.js'
import { buildCatalogue } from '../../lib/umi-menu/registry.js'
import { isOwner } from '../../lib/awang-cekakses.js'

const COMMAND_RE = /^(umimenu|lmenu|menu_(?:all|owner|group|game|tools|refresh|back|dashboard)(?:_\d+)?)$/i

async function handleSystemToggle(m, { conn, args }) {
  let allowed = m.fromMe === true
  if (!allowed) {
    try { allowed = await isOwner(m.sender, conn) } catch { allowed = false }
  }
  if (!allowed) {
    await m.reply('⛔ Hanya owner yang boleh mengubah sistem menu.')
    return { ok: false, mode: 'denied' }
  }

  const value = String(args?.[0] || '').toLowerCase()
  if (!['umi', 'legacy'].includes(value)) {
    const current = readMenuSettings().system || 'legacy'
    await m.reply([
      `Sistem menu saat ini: *${current}*`,
      '',
      'Ubah:',
      '.umimenu system umi     → .menu memakai menu baru',
      '.umimenu system legacy  → .menu kembali ke menu lama',
    ].join('\n'))
    return { ok: true, mode: 'info' }
  }

  const result = writeMenuSettings({ system: value })
  if (!result.ok) {
    await m.reply(`❌ Gagal menyimpan pengaturan: ${result.error}`)
    return { ok: false, mode: 'error' }
  }
  await m.reply(value === 'umi'
    ? '✅ `.menu` sekarang memakai menu Umi (statistik hidup + router tombol).\nMenu lama tetap ada sebagai `.allmenu`.'
    : '✅ `.menu` kembali ke menu lama. Menu baru tetap bisa dibuka dengan `.umimenu`.')
  return { ok: true, mode: 'toggled' }
}

let handler = async function (m, extra = {}) {
  const conn = extra.conn || this
  const prefix = extra.usedPrefix || global.prefix || '.'
  const command = String(m.command || extra.command || '').toLowerCase().replace(/[^a-z0-9_]/g, '')
  const args = Array.isArray(extra.args) ? extra.args : String(extra.text || '').trim().split(/\s+/).filter(Boolean)

  // .umimenu system <umi|legacy>
  if ((command === 'umimenu' || command === 'lmenu') && String(args[0] || '').toLowerCase() === 'system') {
    return handleSystemToggle(m, { conn, args: args.slice(1) })
  }

  // .umimenu [aksi] — tanpa argumen = menu utama
  if (command === 'umimenu' || command === 'lmenu') {
    const wanted = String(args[0] || '').trim()
    const parsed = wanted ? parseActionId(wanted) : null
    if (parsed) return dispatchMenuCommand(m, { conn, prefix, action: parsed.action, page: parsed.page })
    return dispatchMenuCommand(m, { conn, prefix, action: 'menu_back' })
  }

  // ID tombol/list/native-flow
  const parsed = parseActionId(command)
  if (!parsed) return
  return dispatchMenuCommand(m, { conn, prefix, action: parsed.action, page: parsed.page })
}

handler.command = COMMAND_RE
handler.help = ['umimenu', 'menu_all', 'menu_owner', 'menu_group', 'menu_game', 'menu_tools', 'menu_refresh', 'menu_dashboard']
handler.tags = ['main']
handler.category = 'main'
handler.description = 'Menu interaktif Umi Usanagi AI: statistik hidup, katalog fitur berhalaman, router tombol, cek izin owner/grup'
handler.limit = false

/**
 * Hook ringan: hanya bereaksi pada balasan angka 1–6 DAN hanya bila menu baru
 * saja yang baru dikirim ke chat itu (state disimpan router, kedaluwarsa 2
 * menit). Chat biasa tidak tersentuh.
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
