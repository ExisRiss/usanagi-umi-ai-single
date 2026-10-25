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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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

const CARD_CSS = `
:root{color-scheme:dark;--bg:#080b14;--glass:rgba(255,255,255,.075);--border:rgba(255,255,255,.14);
--text:#f5f7ff;--muted:#a7b0c7;--accent:#8c9cff;--cyan:#6de7f7}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;color:var(--text);background:var(--bg);
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow-x:hidden}
.ambient{position:fixed;width:250px;height:250px;border-radius:50%;filter:blur(85px);opacity:.2;pointer-events:none}
.ambient.one{top:8%;left:-130px;background:#6579ff}
.ambient.two{top:46%;right:-140px;background:#1fb9d6}
.page{position:relative;z-index:1;width:min(100% - 26px,600px);margin:0 auto;padding:20px 0 28px}
.glass{background:var(--glass);border:1px solid var(--border);border-radius:22px;
backdrop-filter:blur(18px) saturate(150%);-webkit-backdrop-filter:blur(18px) saturate(150%);
box-shadow:0 16px 38px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.08)}
.topbar{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:22px}
.logo{width:46px;height:46px;border-radius:14px;object-fit:cover;flex:0 0 auto;
background:linear-gradient(135deg,#1a2450,#123a44);box-shadow:0 8px 18px rgba(0,0,0,.4)}
.brand{min-width:0}
.brand h1{margin:0;font-size:15.5px;letter-spacing:.2px}
.brand p{margin:3px 0 0;font-size:10.5px;color:var(--muted)}
.live{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:10px;color:var(--muted);white-space:nowrap}
.dot{width:7px;height:7px;border-radius:50%;background:#5ee6a8;box-shadow:0 0 10px #5ee6a8}
.dot.off{background:#f2778a;box-shadow:0 0 10px #f2778a}
.hero{position:relative;margin-top:14px;border-radius:26px;overflow:hidden;min-height:210px;
display:flex;align-items:flex-end;background:linear-gradient(135deg,#192447,#133943)}
.hero-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 22%;
opacity:.9;display:block}
.hero::after{content:"";position:absolute;inset:0;
background:linear-gradient(180deg,rgba(6,9,18,.15) 0,rgba(6,9,18,.55) 55%,rgba(6,9,18,.92) 100%)}
.hero-text{position:relative;z-index:2;padding:16px 16px 18px;width:100%}
.eyebrow{font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--cyan);font-weight:700}
.hero-text h2{margin:6px 0 0;font-size:21px;line-height:1.25}
.hero-text p{margin:7px 0 0;font-size:11.5px;line-height:1.55;color:#c9d2e6}
.section-head{display:flex;align-items:baseline;justify-content:space-between;margin:18px 4px 9px}
.section-head h3{margin:0;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.section-head span{font-size:10px;color:#7d87a0}
.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.stat{padding:12px 13px;border-radius:18px}
.stat-label{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.stat-value{margin-top:6px;font-size:15px;font-weight:700;word-break:break-word}
.stat-note{margin-top:3px;font-size:9.5px;color:#7d87a0}
.meta{display:flex;flex-wrap:wrap;gap:7px;padding:10px 12px;margin-top:10px;border-radius:16px}
.meta span{font-size:10px;color:#c3cbdd;background:rgba(255,255,255,.06);
border:1px solid rgba(255,255,255,.09);border-radius:999px;padding:5px 9px}
.meta b{color:#fff;font-weight:700}
.menu-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.menu-card{position:relative;min-height:92px;display:flex;align-items:center;gap:11px;padding:13px;border-radius:20px}
.menu-icon{width:40px;height:40px;flex:0 0 auto;display:grid;place-items:center;border-radius:13px;
background:rgba(255,255,255,.09);font-size:19px}
.menu-copy{min-width:0}
.menu-copy strong{display:block;font-size:12.5px}
.menu-copy small{display:block;margin-top:4px;font-size:9.5px;line-height:1.4;color:var(--muted)}
.menu-copy code{display:inline-block;margin-top:5px;font-size:9.5px;font-family:ui-monospace,Menlo,monospace;
color:var(--cyan);background:rgba(109,231,247,.1);border:1px solid rgba(109,231,247,.22);
border-radius:6px;padding:2px 5px}
.note{margin-top:13px;padding:12px 13px;border-radius:16px;font-size:10.5px;line-height:1.6;color:#c9d2e6}
.note b{color:#fff}
.footer{margin-top:14px;text-align:center;color:#828ca6;font-size:9.5px;line-height:1.7}
.cat-row{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:14px;
background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
.cat-row+.cat-row{margin-top:6px}
.cat-row b{font-size:11.5px}
.cat-row small{margin-left:auto;font-size:9.5px;color:var(--muted);white-space:nowrap}
.cmd{margin-top:7px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.04);
border:1px solid rgba(255,255,255,.07);font-size:10px;line-height:1.5}
.cmd code{color:var(--cyan);font-family:ui-monospace,Menlo,monospace;font-size:10px}
.cmd span{color:#93a0bb;display:block;margin-top:2px}
.cat-title{margin:15px 2px 7px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.pager{margin-top:14px;padding:10px 12px;border-radius:14px;font-size:10px;color:#c3cbdd;text-align:center}
`

const AUTO_SIZE = '<script>(function(){function r(){try{if(window.AndroidBridge&&AndroidBridge.updateSize)AndroidBridge.updateSize(Math.min(4000,Math.max(80,document.body.scrollHeight)))}catch(e){}}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",r);else r();setTimeout(r,450)})();</script>'

/**
 * Kartu menu utama: foto background + statistik hidup + daftar menu.
 * Tanpa tautan keluar dan tanpa tombol palsu — navigasi dikirim sebagai
 * daftar native sesudah kartu ini (lihat router.actionDashboard).
 */
export function buildDashboardHtml({ status, stats, prefix = '.', assets = {}, botNumber = '', categories = [] }) {
  const server = status.server || {}
  const users = status.users || {}
  const cpu = server.cpuPercent == null ? 'Tidak tersedia' : `${server.cpuPercent}%`
  const ram = server.rssMb == null ? 'Tidak tersedia' : `${formatNumber(server.rssMb)} MB`
  const uptime = server.uptimeSeconds == null ? 'Tidak tersedia' : formatDuration(server.uptimeSeconds)
  const groupLine = status.group?.available
    ? `${status.group.subject} · ${formatNumber(status.group.members)} anggota`
    : 'Bukan grup'
  const connected = Boolean(status.connection?.connected)
  const botName = status.botName || 'Usanagi Umi AI'
  const ownerName = status.ownerName || 'AlzRiss'

  const logo = assets.logoDataUri
    ? `<img class="logo" src="${assets.logoDataUri}" alt="logo">`
    : '<div class="logo"></div>'
  const heroBg = assets.backgroundDataUri
    ? `<img class="hero-bg" src="${assets.backgroundDataUri}" alt="">`
    : ''

  const menuCards = MENU_OPTIONS.filter(option => option.command !== 'menu_refresh').map(option => `
      <div class="menu-card glass">
        <div class="menu-icon">${escapeHtml(option.icon || '▦')}</div>
        <div class="menu-copy">
          <strong>${escapeHtml(option.label)}</strong>
          <small>${escapeHtml(option.hint)}</small>
          <code>${escapeHtml(prefix + option.command)}</code>
        </div>
      </div>`).join('')

  const topCategories = (categories || []).slice(0, 6)
  const catRows = topCategories.map(category => `
      <div class="cat-row"><b>${escapeHtml(category.label)}</b><small>${formatNumber(category.commands.length)} fitur</small></div>`).join('')

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#080b14">
<title>${escapeHtml(botName)} — Menu</title>
<style>${CARD_CSS}</style></head>
<body>
<div class="ambient one"></div><div class="ambient two"></div>
<main class="page">
  <header class="topbar glass">
    ${logo}
    <div class="brand"><h1>${escapeHtml(botName)}</h1><p>Developer: ${escapeHtml(ownerName)}</p></div>
    <div class="live"><span class="dot ${connected ? '' : 'off'}"></span>${connected ? 'Terhubung' : 'Offline'}</div>
  </header>

  <section class="hero glass">
    ${heroBg}
    <div class="hero-text">
      <div class="eyebrow">Liquid Glass Experience</div>
      <h2>Menu Utama</h2>
      <p>${formatNumber(stats.commands)} perintah · ${formatNumber(stats.categories)} kategori<br>
      Tombol menu ada di daftar WhatsApp di bawah pesan ini.</p>
    </div>
  </section>

  <div class="section-head"><h3>Status</h3><span>${escapeHtml(status.time || '')}</span></div>
  <section class="stats">
    <article class="stat glass"><div class="stat-label">Server</div><div class="stat-value">${connected ? 'Aktif' : 'Offline'}</div><div class="stat-note">Uptime ${escapeHtml(uptime)}</div></article>
    <article class="stat glass"><div class="stat-label">Pengguna</div><div class="stat-value">${users.available ? formatNumber(users.total) : 'Tidak tersedia'}</div><div class="stat-note">${users.available ? `${formatNumber(users.registered || 0)} terdaftar` : 'data DB tidak ada'}</div></article>
    <article class="stat glass"><div class="stat-label">Fitur</div><div class="stat-value">${formatNumber(stats.commands)}</div><div class="stat-note">dari plugin aktif</div></article>
    <article class="stat glass"><div class="stat-label">Alias</div><div class="stat-value">${formatNumber(stats.aliases)}</div><div class="stat-note">nama alternatif</div></article>
  </section>
  <div class="meta">
    <span>RAM <b>${escapeHtml(ram)}</b></span>
    <span>CPU <b>${escapeHtml(cpu)}</b></span>
    <span>Kategori <b>${formatNumber(stats.categories)}</b></span>
    <span>Konteks <b>${escapeHtml(groupLine)}</b></span>
  </div>

  <div class="section-head"><h3>Menu Cepat</h3><span>ketik perintahnya</span></div>
  <section class="menu-grid">${menuCards}</section>

  <div class="note glass"><b>Cara buka menu:</b> ketuk daftar menu di pesan WhatsApp
    berikutnya (Semua Fitur, Owner, Grup, Game, Tools). Kartu ini hanya ringkasan —
    WhatsApp tidak mengizinkan tombol di dalam kartu HTML untuk mengirim perintah.</div>

  <div class="section-head"><h3>Kategori Populer</h3><span>${prefix}kategori &lt;nama&gt;</span></div>
  <section>${catRows || '<div class="cat-row"><b>Tidak tersedia</b></div>'}</section>

  <footer class="footer">
    <div>${escapeHtml(botName)} · By AlzRiss</div>
    <div>${escapeHtml(status.time || '')}</div>
  </footer>
</main>
${AUTO_SIZE}
</body></html>`
}

/**
 * Halaman HTML "All Menu" versi baru (terpisah dari `.allmenu` teks lama).
 * Ringan: tanpa foto, hanya kartu kategori + perintah per halaman.
 */
export function buildAllMenuHtml({ status, stats, catalogue, page = 1, prefix = '.', perPage = 48 }) {
  const commands = Array.isArray(catalogue?.commands) ? catalogue.commands : []
  const totalPages = Math.max(1, Math.ceil(commands.length / perPage))
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages)
  const slice = commands.slice((current - 1) * perPage, current * perPage)

  const groups = []
  for (const entry of slice) {
    const key = entry.label || entry.category
    let bucket = groups.find(item => item.key === key)
    if (!bucket) { bucket = { key, rows: [] }; groups.push(bucket) }
    bucket.rows.push(entry)
  }

  const body = groups.map(group => `
    <div class="cat-title">${escapeHtml(group.key)}</div>
    ${group.rows.map(entry => `
      <div class="cmd"><code>${escapeHtml(prefix + entry.command)}</code>
        <span>${escapeHtml(entry.description || 'Tanpa deskripsi')}${entry.ownerOnly ? ' · owner' : ''}</span></div>`).join('')}
  `).join('')

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#080b14">
<title>${escapeHtml(status?.botName || 'Usanagi Umi AI')} — All Menu ${current}/${totalPages}</title>
<style>${CARD_CSS}</style></head>
<body>
<div class="ambient one"></div><div class="ambient two"></div>
<main class="page">
  <header class="topbar glass">
    <div class="brand"><h1>All Menu · HTML</h1>
      <p>${formatNumber(stats.commands)} perintah · halaman ${current}/${totalPages}</p></div>
    <div class="live"><span class="dot"></span>read only</div>
  </header>
  ${body}
  <div class="pager glass">Halaman ${current} dari ${totalPages} ·
    <code>${escapeHtml(prefix + 'menu_all ' + (current + 1))}</code> untuk lanjut ·
    <code>${escapeHtml(prefix + 'allmenu')}</code> untuk versi teks</div>
  <footer class="footer"><div>${escapeHtml(status?.botName || 'Usanagi Umi AI')} · By AlzRiss</div></footer>
</main>
${AUTO_SIZE}
</body></html>`
}

export default {
  renderMainMenu, renderCataloguePage, renderCategoryList, renderRefreshSummary,
  buildDashboardHtml, buildAllMenuHtml, paginateLines, MENU_OPTIONS, statusBlock, groupBlock, featuresBlock,
}
