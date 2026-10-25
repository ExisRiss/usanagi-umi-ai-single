/* By AlzRiss - Usanagi Umi AI
 *
 * Router menu — semua ID interaksi (menu_all, menu_owner, …) dipetakan ke
 * handler di sini, dan SETIAP aksi memeriksa izinnya sendiri di server.
 *
 * Alur satu interaksi:
 *   1. ID dari tombol/list/native-flow sudah menjadi `m.text` (lib/simple.js
 *      memakai extractSelectionId), jadi ID diperlakukan sebagai perintah.
 *   2. Router mem-parse ID → { action, page }.
 *   3. Cek rate limit per pengguna.
 *   4. Cek izin (owner untuk menu_owner, konteks grup untuk menu_group).
 *   5. Jalankan aksi, kirim ke chat asal `m.chat` saja.
 *   6. Semua kegagalan → pesan teks, tidak pernah melempar ke handler.
 */

import fs from 'fs'
import path from 'path'
import { isOwner } from '../awang-cekakses.js'
import { settings } from '../../config/settings.js'
import { buildCatalogue, ownerCommands, groupCommands, commandsOfCategory } from './registry.js'
import {
  renderMainMenu, renderCataloguePage, renderCategoryList, renderRefreshSummary,
  buildDashboardHtml, buildAllMenuHtml, MENU_OPTIONS,
} from './render.js'
import { collectStatus, formatNumber, formatDuration } from './status.js'

const SETTINGS_FILE = path.resolve(process.cwd(), 'data', 'umi-menu.json')

const ACTION_RE = /^menu_(all|owner|group|game|tools|refresh|back|dashboard)(?:_(\d+))?$/i

const chatState = new Map()      // chat → { page, updatedAt }
const lastActionAt = new Map()   // chat:sender → ms
const lastRefreshAt = new Map()  // chat → ms

const RATE_LIMIT_MS = 1200
const REFRESH_COOLDOWN_MS = 30000
const AWAIT_TTL_MS = 120000

/* ============================================================
 * KONFIGURASI SISTEM MENU (opt-in, tidak mengubah perilaku lama)
 * ============================================================ */

export function readMenuSettings() {
  try {
    const value = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
    return { system: 'umi', style: 'html', ...value }
  } catch {
    return { system: 'umi', style: 'html' }
  }
}

export function writeMenuSettings(patch = {}) {
  const current = readMenuSettings()
  const next = { ...current, ...patch }
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2))
    return { ok: true, settings: next }
  } catch (error) {
    return { ok: false, error: String(error?.message || error) }
  }
}

/** Dipakai plugins/main/usanagi-menu.js: apakah `.menu` dialihkan ke sistem baru. */
export function shouldDelegateToUmiMenu() {
  return String(readMenuSettings().system || 'legacy').toLowerCase() === 'umi'
}

/* ============================================================
 * UTIL
 * ============================================================ */

export function parseActionId(commandText) {
  const value = String(commandText || '').trim().replace(/^[^\w]+/, '').toLowerCase()
  const match = value.match(ACTION_RE)
  if (!match) return null
  return { action: `menu_${match[1].toLowerCase()}`, page: match[2] ? Number(match[2]) : null }
}

function rateLimited(chat, sender) {
  const key = `${chat}:${sender}`
  const now = Date.now()
  const last = lastActionAt.get(key) || 0
  if (now - last < RATE_LIMIT_MS) return true
  lastActionAt.set(key, now)
  if (lastActionAt.size > 500) {
    for (const [key2, time] of lastActionAt) if (now - time > 60000) lastActionAt.delete(key2)
  }
  return false
}

function rememberChat(chat, patch) {
  const current = chatState.get(chat) || {}
  chatState.set(chat, { ...current, ...patch, updatedAt: Date.now() })
  if (chatState.size > 500) {
    const now = Date.now()
    for (const [key, value] of chatState) if (now - (value.updatedAt || 0) > 600000) chatState.delete(key)
  }
}

export function recallChat(chat) {
  const state = chatState.get(chat)
  if (!state) return null
  if (Date.now() - (state.updatedAt || 0) > AWAIT_TTL_MS) return null
  return state
}

export function forgetChat(chat) {
  chatState.delete(chat)
}

/**
 * Bersihkan seluruh state router (rate limit, cooldown refresh, state chat).
 * Dipakai uji otomatis; juga berguna saat reload plugin agar state lama tidak
 * menggantung.
 */
export function resetMenuState() {
  chatState.clear()
  lastActionAt.clear()
  lastRefreshAt.clear()
}

async function sendText(conn, jid, text, m) {
  try {
    await conn.sendMessage(jid, { text: String(text).slice(0, 65000) }, m?.raw ? { quoted: m.raw } : undefined)
    return true
  } catch (error) {
    console.error('[UMI-MENU] gagal kirim teks:', error?.message || error)
    return false
  }
}

/** Baca aset menu lokal; mengembalikan null bila tidak ada. */
export function readAsset(name) {
  try {
    return fs.readFileSync(path.resolve(process.cwd(), 'assets', 'menu', name))
  } catch {
    return null
  }
}

/**
 * Kirim kartu HTML lewat jalur yang tersedia di server.
 *
 * Urutan: `conn.sendRichHtml` (bila wrapper ada) → `sendHtmlApp` dari
 * elaina-baileys → kembalikan { ok:false } supaya pemanggil tetap mengirim
 * daftar native (menu tidak boleh mati hanya karena kartu gagal).
 */
async function sendHtmlCard(conn, jid, html, options = {}) {
  if (typeof conn?.sendRichHtml === 'function') {
    try {
      return await conn.sendRichHtml(jid, html, options)
    } catch (error) {
      console.warn('[UMI-MENU] sendRichHtml gagal:', error?.message || error)
    }
  }
  try {
    const { sendHtmlApp } = await import('@rexxhayanasi/elaina-baileys')
    if (typeof sendHtmlApp !== 'function') throw new Error('sendHtmlApp tidak tersedia di paket ini')
    await sendHtmlApp(conn, jid, html, {
      title: String(options.title || 'Menu').slice(0, 60),
      height: 0,
      autoHeight: true,
    })
    return { ok: true, mode: 'sendHtmlApp' }
  } catch (error) {
    return { ok: false, mode: 'failed', error: String(error?.message || error).slice(0, 160) }
  }
}

function botNumber(conn) {
  const id = String(conn?.user?.id || '')
  const digits = id.split('@')[0].split(':')[0].replace(/\D/g, '')
  return digits.length >= 7 ? digits : ''
}

/* ============================================================
 * PENGIRIM MENU UTAMA (native list → fallback teks)
 * ============================================================ */

/**
 * Coba kirim menu sebagai pesan daftar (native). Kalau WhatsApp menolak
 * (406 not-acceptable / akun tidak mendukung), kirim versi teks.
 */
export async function sendMainMenu(conn, m, { prefix = '.', status, stats }) {
  const rendered = renderMainMenu({ status, stats, prefix })
  const jid = m.chat

  try {
    const { ButtonV2 } = await import('../awang-tombol.js')
    const { prepareWAMessageMedia } = await import('@rexxhayanasi/elaina-baileys')
    const { readMenuMedia } = await import('../menu-media.js')

    const button = new ButtonV2(conn)
      .setTitle(status.botName || settings.botName || 'Usanagi Umi AI')
      .setSubtitle(`Developer ${status.ownerName || 'AlzRiss'}`)
      .setBody(rendered.text.slice(0, 3200))
      .setFooter(`${formatNumber(stats.commands)} perintah · ${formatNumber(stats.aliases)} alias`)

    try {
      // Pakai media menu milik bot bila ada; kalau belum disetel, pakai cover
      // bawaan menu Umi (assets/menu/cover.jpg) — bukan video default yang
      // 2,5 MB dan memperlambat pengiriman.
      let media
      try {
        media = readMenuMedia(conn)
      } catch {
        media = { type: 'image', mimetype: 'image/jpeg', data: readAsset('cover.jpg') }
      }
      const prepared = await prepareWAMessageMedia(
        media.type === 'image'
          ? { image: media.data, mimetype: media.mimetype }
          : { video: media.data, mimetype: media.mimetype },
        { upload: conn.waUploadToServer },
      )
      if (prepared.imageMessage) button.setMedia({ headerType: 4, imageMessage: prepared.imageMessage })
      if (prepared.videoMessage) button.setMedia({ headerType: 5, videoMessage: prepared.videoMessage })
    } catch (mediaError) {
      console.warn('[UMI-MENU] media menu dilewati:', mediaError?.message || mediaError)
    }

    button.addRawButton({
      buttonText: { displayText: '☰ BUKA MENU' },
      buttonId: 'menu_all',
      type: 1,
      nativeFlowInfo: {
        name: 'single_select',
        paramsJson: JSON.stringify({
          title: 'Menu Utama',
          sections: [{
            title: 'Navigasi',
            // ID baris WAJIB memuat prefix: WhatsApp mengirim balik ID apa
            // adanya dan handler baru memprosesnya sebagai perintah bila ada
            // prefix. Menu lama di repo ini memakai pola yang sama.
            rows: MENU_OPTIONS.map(option => ({
              title: option.label,
              description: option.hint,
              id: `${prefix}${option.command}`,
            })),
          }],
        }),
      },
    })

    await button.send(jid, m?.raw ? { quoted: m.raw } : undefined)
    return { ok: true, mode: 'list' }
  } catch (error) {
    console.warn(`[UMI-MENU] daftar native ditolak (${error?.message || error}); kirim teks.`)
    const ok = await sendText(conn, jid, rendered.text, m)
    return { ok, mode: 'text', fallbackUsed: true }
  }
}


/* ============================================================
 * DAFTAR NATIVE (tombol yang benar-benar berfungsi)
 * ------------------------------------------------------------
 * Kartu HTML tidak bisa mengirim perintah (WebView WhatsApp tanpa
 * jaringan & tanpa bridge). Karena itu setiap kartu selalu diikuti satu
 * pesan daftar native: barisnya memakai perintah berprefix, persis pola
 * menu lama, sehingga bisa ditekan dan dijalankan handler.
 * ============================================================ */

function navSections(rawSections, prefix) {
  const sections = []
  let budget = 10
  for (const section of rawSections) {
    if (budget <= 0 || sections.length >= 5) break
    const rows = []
    for (const row of section.rows || []) {
      if (budget <= 0) break
      const id = String(row.command || row.id || '')
      if (!id) continue
      rows.push({
        header: row.header || '',
        title: row.title || '',
        description: row.description || '',
        // ID harus membawa prefix: WhatsApp mengirim balik apa adanya.
        id: id.startsWith(prefix) ? id : `${prefix}${id.replace(/^[./!#]/, '')}`,
      })
      budget -= 1
    }
    if (!rows.length) continue
    sections.push({ title: section.title || '', highlight_label: section.highlightLabel || '', rows })
  }
  return sections
}

async function sendNavList(conn, m, { title, subtitle, sections, fallbackText, footer }) {
  const jid = m.chat
  try {
    const { ButtonV2 } = await import('../awang-tombol.js')
    const button = new ButtonV2(conn)
      .setTitle(title)
      .setSubtitle(subtitle || '')
      .setBody('Pilih menu di bawah ini.')
      .setFooter(footer || 'By AlzRiss - Usanagi Umi AI')
      .addRawButton({
        buttonText: { displayText: '☰ PILIH MENU' },
        buttonId: 'menu',
        type: 1,
        nativeFlowInfo: {
          name: 'single_select',
          paramsJson: JSON.stringify({ title: title.slice(0, 60), sections }),
        },
      })
    await button.send(jid, m?.raw ? { quoted: m.raw } : undefined)
    return { ok: true, mode: 'nav-list' }
  } catch (error) {
    console.warn(`[UMI-MENU] daftar native ditolak (${error?.message || error}); kirim teks.`)
    const ok = await sendText(conn, jid, fallbackText, m)
    return { ok, mode: 'nav-text', fallbackUsed: true }
  }
}

/* Daftar menu gaya lama (lib/awang-menu.js) — dipakai apa adanya supaya
 * susunan tombol sama seperti sebelum menu HTML dipasang. */
async function legacyMenuSections(prefix) {
  try {
    const { buildCategoryList } = await import('../awang-menu.js')
    return navSections(buildCategoryList({ prefix }).sections, prefix)
  } catch (error) {
    console.warn('[UMI-MENU] buildCategoryList gagal:', error?.message || error)
    return []
  }
}

/* ============================================================
 * AKSI
 * ============================================================ */

async function actionMain(ctx) {
  const status = await ctx.status()
  const catalogue = ctx.catalogue()
  const result = await sendMainMenu(ctx.conn, ctx.m, { prefix: ctx.prefix, status, stats: catalogue.stats })
  rememberChat(ctx.m.chat, { awaiting: true, page: 1 })
  return result
}

async function actionAll(ctx, page) {
  const catalogue = ctx.catalogue()
  const status = await ctx.status()
  const wanted = page || recallChat(ctx.m.chat)?.page || 1

  const textFallback = renderCataloguePage({ catalogue, prefix: ctx.prefix, page: wanted, title: 'SEMUA FITUR' })
  const html = buildAllMenuHtml({ status, stats: catalogue.stats, catalogue, page: wanted, prefix: ctx.prefix })
  const perPage = 48
  const totalPages = Math.max(1, Math.ceil(catalogue.commands.length / perPage))
  const current = Math.min(Math.max(1, Number(wanted) || 1), totalPages)

  const rows = []
  if (current < totalPages) rows.push({ header: '›', title: `Halaman ${current + 1}`, description: 'lanjut ke halaman berikutnya', id: `${ctx.prefix}menu_all ${current + 1}` })
  if (current > 1) rows.push({ header: '‹', title: `Halaman ${current - 1}`, description: 'kembali ke halaman sebelumnya', id: `${ctx.prefix}menu_all ${current - 1}` })
  rows.push({ header: '☰', title: 'Versi teks', description: 'All Menu klasik (tanpa kartu)', id: `${ctx.prefix}allmenu` })
  rows.push({ header: '⌂', title: 'Menu utama', description: 'kembali ke kartu menu', id: `${ctx.prefix}menu` })

  const card = await sendHtmlCard(ctx.conn, ctx.m.chat, html, {
    title: `All Menu ${current}/${totalPages}`,
    quoted: ctx.m.raw,
  })
  const cardMode = card?.ok ? `html-${card.mode || 'rich'}` : 'html-failed'

  const nav = await sendNavList(ctx.conn, ctx.m, {
    title: `Semua Fitur ${current}/${totalPages}`,
    subtitle: `${formatNumber(catalogue.stats.commands)} perintah`,
    sections: [{ title: 'Navigasi', rows }],
    fallbackText: textFallback.text,
  })

  rememberChat(ctx.m.chat, { awaiting: false, page: current })
  return { ok: nav.ok, mode: `${cardMode}+${nav.mode}`, page: current, pages: totalPages }
}

async function actionRefresh(ctx, { force = false } = {}) {
  const chat = ctx.m.chat
  const now = Date.now()
  const last = lastRefreshAt.get(chat) || 0
  if (!force && now - last < REFRESH_COOLDOWN_MS) {
    const wait = Math.ceil((REFRESH_COOLDOWN_MS - (now - last)) / 1000)
    const ok = await sendText(ctx.conn, chat, `⏳ Refresh dibatasi. Coba lagi dalam ${wait} detik.`, ctx.m)
    return { ok, mode: 'throttled', wait }
  }
  lastRefreshAt.set(chat, now)
  ctx.invalidate()
  const status = await ctx.status()
  const catalogue = ctx.catalogue()
  const rendered = renderRefreshSummary({ status, stats: catalogue.stats, prefix: ctx.prefix, previous: ctx.previousStatus?.() })
  const ok = await sendText(ctx.conn, chat, rendered.text, ctx.m)
  rememberChat(chat, { awaiting: true, page: 1 })
  return { ok, mode: 'refresh' }
}

async function actionOwner(ctx) {
  let allowed = false
  try {
    allowed = await isOwner(ctx.m.sender, ctx.conn)
  } catch (error) {
    console.error('[UMI-MENU] cek owner gagal:', error?.message || error)
  }
  // Owner bot otomatis boleh; `m.fromMe` juga (perintah dikirim dari HP bot).
  if (!allowed && ctx.m.fromMe) allowed = true

  if (!allowed) {
    const ok = await sendText(ctx.conn, ctx.m.chat, [
      '⛔ *Menu Owner ditolak*',
      '',
      'Menu ini hanya untuk owner/developer bot.',
      `Kembali ke menu: ${ctx.prefix}menu_back`,
    ].join('\n'), ctx.m)
    console.warn(`[UMI-MENU] owner menu ditolak untuk ${String(ctx.m.sender).split('@')[0]}`)
    return { ok, mode: 'denied' }
  }

  const catalogue = ctx.catalogue()
  const entries = ownerCommands(catalogue)
  const rendered = renderCategoryList({
    catalogue,
    entries,
    title: 'OWNER MENU',
    prefix: ctx.prefix,
    extraHeader: ['│ 🔐 Akses  : owner terverifikasi'],
  })
  const ok = await sendText(ctx.conn, ctx.m.chat, rendered.text, ctx.m)
  return { ok, mode: 'owner', count: entries.length }
}

async function actionGroup(ctx) {
  const catalogue = ctx.catalogue()
  const group = await ctx.groupStats()
  const entries = groupCommands(catalogue)
  const header = []
  if (!ctx.m.isGroup) {
    header.push('│ ℹ️ Chat ini bukan grup')
  } else if (group?.available) {
    header.push(`│ 👥 ${group.subject} · ${formatNumber(group.members)} anggota`)
    header.push(`│ 🛡️ Bot admin : ${group.botIsAdmin ? 'Ya' : 'Tidak — sebagian perintah ditolak'}`)
  } else {
    header.push(`│ ⚠️ Metadata grup gagal: ${group?.reason || 'tidak diketahui'}`)
  }

  const rendered = renderCategoryList({
    catalogue, entries, title: 'GROUP MENU', prefix: ctx.prefix, extraHeader: header,
  })
  const ok = await sendText(ctx.conn, ctx.m.chat, rendered.text, ctx.m)
  return { ok, mode: 'group', count: entries.length }
}

async function actionCategory(ctx, category, title) {
  const catalogue = ctx.catalogue()
  const entries = commandsOfCategory(catalogue, category)
  const rendered = renderCategoryList({ catalogue, entries, title, prefix: ctx.prefix })
  const ok = await sendText(ctx.conn, ctx.m.chat, rendered.text, ctx.m)
  return { ok, mode: category, count: entries.length }
}

async function actionKategori(ctx, name) {
  const catalogue = ctx.catalogue()
  const key = String(name || '').trim().toLowerCase()
  if (!key) {
    const list = catalogue.categories.map(c => `• ${c.key} — ${c.label} (${c.commands.length})`).join('\n')
    const ok = await sendText(ctx.conn, ctx.m.chat, `*DAFTAR KATEGORI*\n\n${list}\n\nPakai: ${ctx.prefix}kategori <nama>`, ctx.m)
    return { ok, mode: 'kategori-index' }
  }
  const category = catalogue.categories.find(c => c.key === key || c.label.toLowerCase() === key)
  if (!category) {
    const hint = catalogue.categories.slice(0, 8).map(c => c.key).join(', ')
    const ok = await sendText(ctx.conn, ctx.m.chat, `Kategori *${key}* tidak ditemukan.\nContoh yang ada: ${hint}\n\n${ctx.prefix}kategori`, ctx.m)
    return { ok, mode: 'kategori-missing' }
  }
  const rendered = renderCataloguePage({ catalogue, categories: [category], prefix: ctx.prefix, page: 1, title: category.label })
  const ok = await sendText(ctx.conn, ctx.m.chat, rendered.text, ctx.m)
  return { ok, mode: 'kategori', count: category.commands.length }
}

async function actionDashboard(ctx) {
  const status = await ctx.status()
  const catalogue = ctx.catalogue()
  const style = String(readMenuSettings().style || 'html').toLowerCase()

  const fallbackText = renderMainMenu({ status, stats: catalogue.stats, prefix: ctx.prefix }).text
  const sections = await legacyMenuSections(ctx.prefix)

  if (style === 'text') {
    // Cadangan yang disengaja: owner bisa memaksa teks murni (tanpa kartu).
    const ok = await sendText(ctx.conn, ctx.m.chat, fallbackText, ctx.m)
    rememberChat(ctx.m.chat, { awaiting: true, page: 1 })
    return { ok, mode: 'text-forced' }
  }

  const logo = readAsset('logo.jpg')
  const background = readAsset('bg-card.jpg') || readAsset('bg.jpg')
  const assets = {}
  if (logo) assets.logoDataUri = `data:image/jpeg;base64,${logo.toString('base64')}`
  if (background) assets.backgroundDataUri = `data:image/jpeg;base64,${background.toString('base64')}`

  const html = buildDashboardHtml({
    status, stats: catalogue.stats, prefix: ctx.prefix, botNumber: botNumber(ctx.conn),
    assets, categories: catalogue.categories,
  })

  /* Kartu dulu (visual), lalu daftar native (yang benar-benar bisa ditekan).
   * Kalau kartu gagal, daftar tetap dikirim — .menu tidak boleh mati. */
  const card = await sendHtmlCard(ctx.conn, ctx.m.chat, html, {
    title: 'Menu Umi Usanagi AI',
    quoted: ctx.m.raw,
  })
  const cardMode = card?.ok ? `dashboard-${card.mode || 'rich'}` : 'dashboard-failed'
  if (!card?.ok) console.warn('[UMI-MENU] kartu HTML gagal:', card?.error || card?.mode)

  const nav = await sendNavList(ctx.conn, ctx.m, {
    title: status.botName || settings.botName || 'Usanagi Umi AI',
    subtitle: `Developer ${status.ownerName || 'AlzRiss'} · ${formatNumber(catalogue.stats.commands)} perintah`,
    sections,
    fallbackText,
    footer: `${formatNumber(catalogue.stats.commands)} perintah · ${formatNumber(catalogue.stats.aliases)} alias`,
  })

  rememberChat(ctx.m.chat, { awaiting: true, page: 1 })
  return { ok: nav.ok, mode: `${cardMode}+${nav.mode}`, card: cardMode, nav: nav.mode }
}

/* ============================================================
 * ENTRY POINT
 * ============================================================ */

/**
 * Jalankan satu aksi menu.
 * @returns {Promise<{ok:boolean, mode:string, action?:string, error?:string}>}
 */
export async function dispatchMenuCommand(m, { conn, prefix = '.', action, page = null, args = [] } = {}) {
  const actionId = action || parseActionId(m?.command || '')?.action || parseActionId(m?.text || '')?.action
  const pageNumber = page ?? parseActionId(m?.command || '')?.page ?? null
  if (!actionId) return { ok: false, mode: 'unknown-action' }

  if (!m?.chat || !conn) return { ok: false, mode: 'no-context' }

  if (rateLimited(m.chat, m.sender)) {
    return { ok: false, mode: 'rate-limited' }
  }

  let statusCache = null
  let previousStatus = null
  let catalogueCache = null

  const ctx = {
    m,
    conn,
    prefix,
    catalogue() {
      if (!catalogueCache) catalogueCache = buildCatalogue()
      return catalogueCache
    },
    invalidate() { catalogueCache = null },
    async status() {
      if (!statusCache) statusCache = await collectStatus({ conn, chat: m.chat, timezone: settings.timezone })
      return statusCache
    },
    previousStatus() { return previousStatus },
    async groupStats() {
      const { getGroupStats } = await import('./status.js')
      return getGroupStats(conn, m.chat)
    },
  }

  try {
    switch (actionId) {
      case 'menu_back': return { ...(await actionMain(ctx)), action: 'menu_back' }
      case 'menu_all': return { ...(await actionAll(ctx, pageNumber)), action: 'menu_all' }
      case 'menu_owner': return { ...(await actionOwner(ctx)), action: 'menu_owner' }
      case 'menu_group': return { ...(await actionGroup(ctx)), action: 'menu_group' }
      case 'menu_game': return { ...(await actionCategory(ctx, 'game', 'GAME MENU')), action: 'menu_game' }
      case 'menu_tools': return { ...(await actionCategory(ctx, 'tools', 'TOOLS MENU')), action: 'menu_tools' }
      case 'menu_refresh': return { ...(await actionRefresh(ctx)), action: 'menu_refresh' }
      case 'menu_dashboard': return { ...(await actionDashboard(ctx)), action: 'menu_dashboard' }
      case 'menu_kategori': return { ...(await actionKategori(ctx, args?.[0])), action: 'menu_kategori' }
      default: return { ok: false, mode: 'unhandled', action: actionId }
    }
  } catch (error) {
    console.error('[UMI-MENU] aksi gagal:', actionId, '→', error?.message || error)
    if (previousStatus === null) previousStatus = undefined
    await sendText(conn, m.chat, `❌ Menu gagal diproses (${String(error?.message || error).slice(0, 120)}). Coba ${prefix}menu_back.`, m)
    return { ok: false, mode: 'error', action: actionId, error: String(error?.message || error) }
  }
}

/** Balasan angka 1–6 setelah menu dikirim (dipanggil dari hook `all`). */
export async function handleNumericSelection(m, { conn, prefix = '.' } = {}) {
  const text = String(m?.text || '').trim()
  if (!/^[1-6]$/.test(text)) return false
  const state = recallChat(m.chat)
  if (!state?.awaiting) return false
  const option = MENU_OPTIONS[Number(text) - 1]
  if (!option) return false
  await dispatchMenuCommand(m, { conn, prefix, action: option.command })
  return true
}

export { ACTION_RE, REFRESH_COOLDOWN_MS, RATE_LIMIT_MS }
export default { dispatchMenuCommand, parseActionId, sendMainMenu, handleNumericSelection, shouldDelegateToUmiMenu }
