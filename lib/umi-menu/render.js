/* By AlzRiss - Usanagi Umi AI
 *
 * Perender menu: teks WhatsApp (utama) dan kartu HTML "Liquid Glass"
 * (opsional, dikirim sebagai rich HTML — hanya tampil di WhatsApp Android).
 *
 * Catatan jujur: HTML TIDAK bisa menjadi tombol WhatsApp. Semua tombol pada
 * kartu HTML adalah tautan `wa.me` biasa (membuka chat dengan perintah terisi)
 * — itu memang bekerja, tapi bukan tombol native WhatsApp. Tombol native ada
 * di pesan menu biasa (lihat buildMainMenuPayload di router.js).
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
  const cpu = server.cpuPercent == null ? 'Tidak tersedia' : `${server.cpuPercent}%`
  const ram = server.rssMb == null ? 'Tidak tersedia' : `${formatNumber(server.rssMb)} MB`
  const uptime = server.uptimeSeconds == null ? 'Tidak tersedia' : formatDuration(server.uptimeSeconds)
  const memoryLine = server.systemTotalGb
    ? `${ram} / ${server.systemTotalGb} GB (sisa ${formatNumber(server.systemFreeMb)} MB)`
    : ram
  const userLine = users.available
    ? `${formatNumber(users.total)} (${formatNumber(users.registered)} terdaftar)`
    : 'Tidak tersedia'

  return [
    `│ 👤 Developer : ${status.ownerName || 'AlzRiss'}`,
    `│ 🕒 Waktu     : ${status.time}`,
    `│ 🔌 Koneksi   : ${status.connection?.label || 'Tidak tersedia'}`,
    `│ 🖥️ Server    : ${memoryLine}`,
    `│ ⚙️ CPU       : ${cpu}${server.cpuCount ? ` (${server.cpuCount} core)` : ''}`,
    `│ ⏱️ Uptime    : ${uptime}`,
    `│ 👥 Pengguna  : ${userLine}`,
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
  { id: 'menu_all', label: 'All Menu', command: 'menu_all', hint: 'seluruh perintah per kategori' },
  { id: 'menu_owner', label: 'Owner Menu', command: 'menu_owner', hint: 'khusus owner/developer' },
  { id: 'menu_group', label: 'Group Menu', command: 'menu_group', hint: 'perintah grup & admin' },
  { id: 'menu_game', label: 'Game Menu', command: 'menu_game', hint: 'game & RPG' },
  { id: 'menu_tools', label: 'Tools Menu', command: 'menu_tools', hint: 'tools, downloader, konverter' },
  { id: 'menu_refresh', label: 'Refresh Status', command: 'menu_refresh', hint: 'ambil status terbaru' },
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * HTML kartu menu. Semua angka berasal dari `status` & `stats` yang dikirim
 * router (data hidup). Tidak ada token/sesi/nomor pribadi di dalamnya.
 */
export function buildDashboardHtml({ status, stats, prefix = '.', assets = {}, botNumber = '' }) {
  const server = status.server || {}
  const users = status.users || {}
  const cpu = server.cpuPercent == null ? 'Tidak tersedia' : `${server.cpuPercent}%`
  const ram = server.rssMb == null ? 'Tidak tersedia' : `${formatNumber(server.rssMb)} MB`
  const uptime = server.uptimeSeconds == null ? 'Tidak tersedia' : formatDuration(server.uptimeSeconds)
  const groupLine = status.group?.available
    ? `${status.group.subject} · ${formatNumber(status.group.members)} anggota`
    : 'Bukan grup'

  const waLink = command => botNumber
    ? `https://wa.me/${String(botNumber).replace(/\D/g, '')}?text=${encodeURIComponent(prefix + command)}`
    : '#'

  const cards = MENU_OPTIONS.map((option, index) => `
      <a class="item" href="${escapeHtml(waLink(option.command))}" ${botNumber ? '' : 'aria-disabled="true"'}>
        <span class="num">${index + 1}</span>
        <span class="text"><b>${escapeHtml(option.label)}</b><small>${escapeHtml(prefix + option.command)}</small></span>
        <span class="chev">›</span>
      </a>`).join('')

  const logo = assets.logoDataUri ? `<img class="logo" src="${assets.logoDataUri}" alt="logo">` : ''
  const bg = assets.backgroundUrl ? `background-image:url('${escapeHtml(assets.backgroundUrl)}');` : ''

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(status.botName || 'Usanagi Umi AI')} — Menu</title>
<style>
  :root{--blue:#2f7bff;--blue2:#68b6ff;--ink:#0b2545;--glass:rgba(255,255,255,.55)}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--ink);
    background:#eaf3ff radial-gradient(circle at 12% 8%,#ffffff 0,#dcecff 42%,#b9d8ff 100%);${bg}
    background-size:cover;background-position:center;min-height:100vh;padding:16px 14px 22px}
  .wrap{max-width:520px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
  .glass{background:var(--glass);border:1px solid rgba(255,255,255,.7);border-radius:22px;
    box-shadow:0 10px 30px rgba(21,66,140,.18), inset 0 1px 0 rgba(255,255,255,.9);
    backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%)}
  header{padding:16px;display:flex;align-items:center;gap:12px}
  .logo{width:52px;height:52px;border-radius:16px;object-fit:cover;box-shadow:0 6px 16px rgba(24,70,150,.25)}
  h1{font-size:17px;font-weight:800;letter-spacing:.2px}
  .sub{font-size:11.5px;opacity:.72;margin-top:2px}
  .pill{margin-left:auto;font-size:11px;font-weight:700;padding:6px 10px;border-radius:999px;
    background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;white-space:nowrap}
  .pill.off{background:linear-gradient(135deg,#8a97ab,#b7c1cf)}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  .stat{padding:12px;border-radius:18px}
  .stat small{display:block;font-size:10.5px;letter-spacing:.4px;text-transform:uppercase;opacity:.62}
  .stat b{display:block;font-size:15px;margin-top:4px;word-break:break-word}
  .list{padding:8px;display:flex;flex-direction:column;gap:6px}
  .item{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:16px;text-decoration:none;color:inherit;
    background:linear-gradient(135deg,rgba(255,255,255,.85),rgba(255,255,255,.55));border:1px solid rgba(255,255,255,.8)}
  .item:active{transform:scale(.985)}
  .num{width:24px;height:24px;border-radius:9px;display:grid;place-items:center;font-size:12px;font-weight:800;color:#fff;
    background:linear-gradient(135deg,var(--blue),var(--blue2))}
  .text{display:flex;flex-direction:column;line-height:1.25}
  .text b{font-size:13.5px}
  .text small{font-size:11px;opacity:.62}
  .chev{margin-left:auto;font-size:18px;opacity:.35}
  footer{padding:12px;text-align:center;font-size:11px;opacity:.7}
</style></head>
<body><div class="wrap">
  <header class="glass">
    ${logo}
    <div><h1>${escapeHtml(status.botName || 'Usanagi Umi AI')}</h1>
      <div class="sub">Developer ${escapeHtml(status.ownerName || 'AlzRiss')} · ${escapeHtml(status.time)}</div></div>
    <span class="pill ${status.connection?.connected ? '' : 'off'}">${escapeHtml(status.connection?.label || 'Tidak terhubung')}</span>
  </header>

  <section class="grid">
    <div class="stat glass"><small>Pengguna</small><b>${users.available ? formatNumber(users.total) : 'Tidak tersedia'}</b></div>
    <div class="stat glass"><small>Fitur</small><b>${formatNumber(stats.commands)}</b></div>
    <div class="stat glass"><small>Alias</small><b>${formatNumber(stats.aliases)}</b></div>
    <div class="stat glass"><small>Kategori</small><b>${formatNumber(stats.categories)}</b></div>
    <div class="stat glass"><small>RAM proses</small><b>${escapeHtml(ram)}</b></div>
    <div class="stat glass"><small>CPU</small><b>${escapeHtml(cpu)}</b></div>
    <div class="stat glass"><small>Uptime</small><b>${escapeHtml(uptime)}</b></div>
    <div class="stat glass"><small>Cakupan</small><b>${escapeHtml(groupLine)}</b></div>
  </section>

  <nav class="list glass">${cards}
  </nav>

  <footer class="glass">Tombol di atas membuka chat WhatsApp dengan perintah terisi.
    Bisa juga diketik langsung di chat: <b>${escapeHtml(prefix)}menu_all</b></footer>
</div></body></html>`
}

export default {
  renderMainMenu, renderCataloguePage, renderCategoryList, renderRefreshSummary,
  buildDashboardHtml, paginateLines, MENU_OPTIONS, statusBlock, groupBlock, featuresBlock,
}
