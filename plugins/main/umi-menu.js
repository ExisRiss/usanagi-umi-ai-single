/* By AlzRiss - Usanagi Umi AI
 *
 * MENU UMI — kartu HTML + navigasi native.
 *
 * Pembagian perintah (Task105c, permintaan owner):
 *
 *   .menu                  → KARTU HTML (background foto) + daftar menu native
 *   .umimenu / .lmenu      → sama dengan .menu
 *   .menu_all [_halaman]   → All Menu versi HTML (BARU, terpisah)
 *   .menu_owner|group|game|tools → menu lama seperti semula (teks kategori)
 *
 * Perintah lama TIDAK diambil alih lagi:
 *   .allmenu                → tetap milik plugins/main/usanagi-allmenu.js
 *   .kategori / .listmenu   → tetap milik plugins/main/usanagi-kategori.js
 *
 * Kenapa kartu selalu diikuti daftar native: WebView WhatsApp tidak punya
 * jaringan maupun bridge untuk mengirim pesan, jadi tombol di dalam HTML
 * tidak bisa menjalankan perintah. Daftar native di bawah kartu yang bisa.
 */

import {
  dispatchMenuCommand, handleNumericSelection, parseActionId,
  readMenuSettings, writeMenuSettings,
} from '../../lib/umi-menu/router.js'
import { buildCatalogue } from '../../lib/umi-menu/registry.js'
import { isOwner } from '../../lib/awang-cekakses.js'

const COMMAND_RE = /^(umimenu|lmenu|menu|menu_all(?:_\d+)?|menu_(?:owner|group|game|tools))$/i

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

  // .menu_all [halaman] → All Menu versi HTML (baru, terpisah dari .allmenu)
  if (command === 'menu_all' || /^menu_all_\d+$/.test(command)) {
    const fromCommand = Number((command.match(/_all_(\d+)$/) || [])[1]) || 0
    const page = Number(String(args[0] || '').replace(/\D/g, '')) || fromCommand || null
    return dispatchMenuCommand(m, { conn, prefix, action: 'menu_all', page })
  }

  /*
   * .menu_owner / .menu_group / .menu_game / .menu_tools → menu LAMA, apa
   * adanya: plugin kategori yang sama dengan `.kategori <nama>` (teks +
   * tombol navigasi), bukan halaman HTML baru.
   */
  const legacyMenu = command.match(/^menu_(owner|group|game|tools)$/)
  if (legacyMenu) {
    const category = legacyMenu[1]
    const { default: kategoriHandler } = await import('./usanagi-kategori.js')
    // Handler lama membaca nama kategori dari `m.args[0]`, bukan dari extra.
    return kategoriHandler({ ...m, args: [category], text: category }, {
      conn,
      usedPrefix: prefix,
      command: 'kategori',
      args: [category],
      text: category,
    })
  }

  // ID tombol/list/native-flow
  const parsed = parseActionId(command)
  if (!parsed) return
  return dispatchMenuCommand(m, { conn, prefix, action: parsed.action, page: parsed.page })
}

handler.command = COMMAND_RE
handler.help = ['menu', 'menu_all', 'menu_owner', 'menu_group', 'menu_game', 'menu_tools']
handler.tags = ['main']
handler.category = 'main'
handler.description = 'Menu utama Umi Usanagi AI — kartu HTML (background foto) + daftar menu native yang bisa ditekan'
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
