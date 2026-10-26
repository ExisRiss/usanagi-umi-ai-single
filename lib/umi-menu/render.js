/* By AlzRiss - Usanagi Umi AI
 *
 * Perender menu TEKS WhatsApp: menu utama, katalog per halaman, daftar
 * kategori, dan ringkasan refresh.
 *
 * Kartu HTML dipisah ke `lib/umi-menu/html.js` (Task111) dan dibangun ulang
 * di sana, jadi berkas ini tidak lagi memuat CSS/HTML apa pun. Tombol native
 * tetap dikirim router sebagai daftar interaktif.
 */

import { formatDuration, formatNumber } from './status.js'

const LINE = '─'
const MAX_CHARS = 3200

function pad(text, width) {
  const value = String(text ?? '')
  if (value.length >= width) return value
  return value + ' '.repeat(width - value.length)
}

function rule(title, width = 30) {
  const left = `╭${LINE.repeat(2)}「 ${title} `
  const length = Math.max(4, width - left.length)
  return `${left}${LINE.repeat(length)}`
}

function boxFooter(width = 30) {
  return `╰${LINE.repeat(width)}`
}

export function statusBlock(status) {
  const server = status.server || {}
  const users = status.users || {}
  const web = status.web || {}
  const cpu = server.cpuPercent == null ? 'Tidak tersedia' : `${server.cpuPercent}%`
  const ram = server.rssMb == null ? 'Tidak tersedia' : `${formatNumber(server.rssMb)} MB`
  const uptime = server.uptimeSeconds == null ? 'Tidak tersedia' : formatDuration(server.uptimeSeconds)
  const memoryLine = server.systemTotalGb
    ? `${ram} / ${server.systemTotalGb} GB (sisa ${formatNumber(server.systemFreeMb)} MB)`
    : ram
  const userLine = users.available
    ? `${formatNumber(users.total)} (${formatNumber(users.registered)} terdaftar)`
    : 'Tidak tersedia'
  const webLine = web.available
    ? `${formatNumber(web.users)} user · ${formatNumber(web.active24h)} aktif 24 jam`
    : `Tidak tersedia${web.reason ? ` (${String(web.reason).slice(0, 42)})` : ''}`
  const serviceLine = web.available
    ? `${formatNumber(web.services?.online)}/${formatNumber(web.services?.total)} online${web.checkedText ? ` · ${web.checkedText}` : ''}`
    : 'Tidak tersedia'

  return [
    `│ 👤 Developer : ${status.ownerName || 'AlzRiss'}`,
    `│ 🕒 Waktu     : ${status.time}`,
    `│ 🔌 Koneksi   : ${status.connection?.label || 'Tidak tersedia'}`,
    `│ 🖥️ Server    : ${memoryLine}`,
    `│ ⚙️ CPU       : ${cpu}${server.cpuCount ? ` (${server.cpuCount} core)` : ''}`,
    `│ ⏱️ Uptime    : ${uptime}`,
    `│ 👥 Pengguna  : ${userLine}`,
    `│ 🌐 Website   : ${webLine}`,
    `│ 🛰️ Layanan   : ${serviceLine}`,
  ]
}

export function groupBlock(group) {
  if (!group?.available) {
    if (group?.reason === 'bukan-grup') return []
    return [`│ 👥 Grup      : metadata tidak tersedia (${group?.reason || 'gagal'})`]
  }
  return [
    `│ 👥 Grup      : ${group.subject}`,
    `│ 🧑 Anggota   : ${formatNumber(group.members)} (${formatNumber(group.admins)} admin)`,
    `│ 🛡️ Bot admin : ${group.botIsAdmin ? 'Ya' : 'Tidak'}`,
  ]
}

export function featuresBlock(stats) {
  return [
    `│ 🧩 Fitur     : ${formatNumber(stats.commands)} perintah`,
    `│ 🔗 Alias     : ${formatNumber(stats.aliases)}`,
    `│ 📚 Kategori  : ${formatNumber(stats.categories)}`,
  ]
}

/** Pilihan menu utama — dipakai untuk teks maupun tombol native. */
export const MENU_OPTIONS = [
  { id: 'menu_all', label: 'All Menu', command: 'menu_all', hint: 'seluruh perintah per kategori', icon: '▦' },
  { id: 'menu_owner', label: 'Owner Menu', command: 'menu_owner', hint: 'khusus owner/developer', icon: '♛' },
  { id: 'menu_group', label: 'Group Menu', command: 'menu_group', hint: 'perintah grup & admin', icon: '◎' },
  { id: 'menu_game', label: 'Game Menu', command: 'menu_game', hint: 'game & RPG', icon: '♧' },
  { id: 'menu_tools', label: 'Tools Menu', command: 'menu_tools', hint: 'tools, downloader, konverter', icon: '⌘' },
  { id: 'menu_refresh', label: 'Refresh Status', command: 'menu_refresh', hint: 'ambil status terbaru', icon: '⟳' },
]

export function renderMainMenu({ status, stats, prefix = '.' }) {
  const lines = []
  lines.push(rule('UMI USANAGI AI'))
  lines.push(...statusBlock(status))
  lines.push(...featuresBlock(stats))
  if (status.group) lines.push(...groupBlock(status.group))
  lines.push(boxFooter())

  lines.push('')
  lines.push('📋 *MENU UTAMA*')
  MENU_OPTIONS.forEach((option, index) => {
    lines.push(`${index + 1}. ${option.label} — ${option.hint}`)
    lines.push(`   ${prefix}${option.command}`)
  })
  lines.push('')
  lines.push(`Ketik nomor (1-${MENU_OPTIONS.length}) atau perintahnya.`)
  lines.push(`Contoh: ${prefix}menu_all · ${prefix}menu_game`)
  return { text: lines.join('\n'), options: MENU_OPTIONS }
}

/** Bagi baris menjadi halaman dengan batas karakter WhatsApp. */
export function paginateLines(lines, budget = MAX_CHARS) {
  const pages = []
  let current = []
  let size = 0
  for (const line of lines) {
    const length = line.length + 1
    if (size + length > budget && current.length) {
      pages.push(current)
      current = []
      size = 0
    }
    current.push(line)
    size += length
  }
  if (current.length) pages.push(current)
  return pages.length ? pages : [[]]
}

function commandLine(entry) {
  const alias = entry.aliases.length
    ? ` · alias: ${entry.aliases.slice(0, 4).join(', ')}${entry.aliases.length > 4 ? ', …' : ''}`
    : ''
  const desc = entry.description ? ` — ${entry.description}` : ''
  const flags = entry.flags.length ? ` [${entry.flags.join(',')}]` : ''
  return `▸ ${entry.command}${desc}${alias}${flags}`
}

function flattenCategory(category) {
  const lines = [`\n❖ *${category.label}* (${category.commands.length})`]
  for (const entry of category.commands) lines.push(commandLine(entry))
  return lines
}

/**
 * Halaman katalog. `filter` membatasi kategori (mis. ['game']).
 */
export function renderCataloguePage({ catalogue, categories, prefix = '.', page = 1, title = 'SEMUA FITUR' }) {
  const source = categories || catalogue.categories
  const lines = []
  for (const category of source) lines.push(...flattenCategory(category))
  const pages = paginateLines(lines, MAX_CHARS)
  const index = Math.min(Math.max(1, Number(page) || 1), pages.length)
  const body = pages[index - 1]

  const header = [
    rule(`${title} · ${index}/${pages.length}`),
    `│ 🧩 ${formatNumber(catalogue.stats.commands)} perintah · 🔗 ${formatNumber(catalogue.stats.aliases)} alias`,
    boxFooter(),
  ]

  const nav = []
  if (index > 1) nav.push(`${prefix}menu_all_${index - 1}`)
  if (index < pages.length) nav.push(`${prefix}menu_all_${index + 1}`)
  nav.push(`${prefix}menu_back`)

  const footer = [
    '',
    `Halaman ${index}/${pages.length} · navigasi: ${nav.join(' · ')}`,
  ]

  return {
    text: [...header, ...body, ...footer].join('\n'),
    page: index,
    pages: pages.length,
    isEmpty: body.length === 0,
  }
}

/** Daftar ringkas satu kategori (dipakai Owner/Group/Game/Tools). */
export function renderCategoryList({ catalogue, entries, title, prefix = '.', status, extraHeader = [] }) {
  const lines = []
  lines.push(rule(title))
  if (status) lines.push(...statusBlock(status).slice(0, 3))
  lines.push(...extraHeader)
  lines.push(`│ 🧩 ${formatNumber(entries.length)} perintah`)
  lines.push(boxFooter())
  lines.push('')

  const grouped = new Map()
  for (const entry of entries) {
    const bucket = grouped.get(entry.category) || []
    bucket.push(entry)
    grouped.set(entry.category, bucket)
  }
  if (!grouped.size) {
    lines.push('Belum ada perintah pada kategori ini.')
  }
  for (const [category, list] of [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`❖ *${list[0].label}* (${list.length})`)
    for (const entry of list) lines.push(commandLine(entry))
    lines.push('')
  }
  lines.push(`Kembali: ${prefix}menu_back`)

  const pages = paginateLines(lines, MAX_CHARS)
  const text = pages.length > 1 ? pages[0].join('\n') + `\n\n(daftar dipotong, ${pages.length} halaman — gunakan ${prefix}menu_all untuk daftar lengkap)` : lines.join('\n')
  return { text, pages: pages.length }
}

export function renderRefreshSummary({ status, stats, prefix = '.', previous }) {
  const lines = []
  lines.push(rule('STATUS DIPERBARUI'))
  lines.push(...statusBlock(status))
  lines.push(...featuresBlock(stats))
  if (previous?.time) lines.push(`│ 🔁 Sebelumnya: ${previous.time}`)
  lines.push(boxFooter())
  lines.push('')
  lines.push(`${prefix}menu_back untuk kembali ke menu utama.`)
  return { text: lines.join('\n') }
}

/* ============================================================
 * KARTU HTML (Liquid Glass) — opsional
 * ============================================================ */


/* ============================================================
 * KARTU HTML — desain dari berkas menu.html milik owner
 * ------------------------------------------------------------
 * Aturan yang dipegang:
 *  - tidak ada tautan/aset eksternal (WebView WhatsApp tanpa jaringan);
 *  - tidak ada tombol palsu: kartu hanya menampilkan informasi & perintah;
 *    tombol yang benar-benar bisa ditekan dikirim sebagai daftar native
 *    tepat setelah kartu ini;
 *  - semua angka berasal dari `status`/`stats` hidup.
 * ============================================================ */

/* Kartu HTML dipindah ke lib/umi-menu/html.js (Task111) — di sini tinggal
 * renderer teks: menu utama, katalog, kategori, dan ringkasan refresh. */
export default {
  renderMainMenu, renderCataloguePage, renderCategoryList, renderRefreshSummary,
  paginateLines, MENU_OPTIONS, statusBlock, groupBlock, featuresBlock,
}
