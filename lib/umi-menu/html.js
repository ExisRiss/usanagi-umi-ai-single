/* By AlzRiss - Usanagi Umi AI
 *
 * KARTU MENU HTML — desain "Sea Glass" dari `menu-bot.html` milik owner
 * (Task113). Menggantikan desain kartu sebelumnya.
 *
 * Yang DIPERTAHANKAN dari desain owner:
 *   - palet laut (deep → sea → azure), kartu kaca (glass + blur), sudut 22px;
 *   - susunan: banner → info bot → owner & developer → info grup →
 *     menu cepat → top fitur → daftar menu;
 *   - angka besar di kotak statistik, bar oranye-biru pada daftar top,
 *     developer terkunci (tidak bisa diubah dari server).
 *
 * Yang DIUBAH supaya benar-benar hidup di dalam WhatsApp — semuanya
 * berdasarkan pemeriksaan `checkHtmlApp()` milik @rexxhayanasi/elaina-baileys:
 *   1. Video/aset luar TIDAK BISA dimuat (WebView tanpa jaringan) →
 *      banner memakai gradasi + logo milik bot sebagai data URI.
 *   2. `fetch()` mati di WebView itu → semua angka diambil dari bot saat
 *      kartu dibangun, bukan diambil halaman sendiri. Tidak ada demo/kosong.
 *   3. Tombol yang mengirim perintah tidak ada jembatannya → "menu cepat"
 *      dan daftar menu berisi PERINTAH yang bisa dibaca/disalin, dan daftar
 *      yang benar-benar bisa diketuk tetap dikirim bot sebagai pesan native
 *      tepat setelah kartu ini.
 *   4. `aspect-ratio` membuat tinggi kartu berubah-ubah → ukuran tetap.
 *   5. Timer tanpa penjaga → skrip ukur berhenti saat kartu tidak terlihat.
 *   6. Tidak ada pemotongan isi: halaman katalog dipisah menurut tinggi.
 */

import { WALLPAPER_BANNER, wallpaperEnabled, wallpaperCss, wallpaperLayer } from './wallpaper.js'

const MAX_CARD_PX = 3600

/* Perkiraan tinggi blok kartu (px) untuk menjaga halaman tidak terpotong. */
const UKURAN = {
  banner: 168,
  kartu: 26,
  headerSeksi: 34,
  baris: 34,
  stat: 76,
  chip: 58,
  itemMenu: 62,
  barisTop: 44,
  judulKategori: 34,
  pager: 74,
  footer: 40,
}

/* ── CSS: diturunkan dari menu-bot.html milik owner ─────────────── */
const CSS = `
:root{--deep:#031a2e;--sea:#0a4f7a;--azure:#1e90ff;--aqua:#5fd4f4;
--glass:rgba(255,255,255,.12);--glass-b:rgba(255,255,255,.24);
--txt:#f2f9ff;--mute:rgba(235,246,255,.68);--r:22px}
*{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,sans-serif;
color:var(--txt);background:linear-gradient(160deg,var(--deep),var(--sea) 55%,var(--azure));
background-attachment:fixed;min-height:100%;overflow-y:auto;overflow-x:hidden;
-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain}
.wrap{max-width:560px;margin:0 auto;padding:12px 12px 26px;display:grid;gap:12px}
.glass{background:var(--glass);border:1px solid var(--glass-b);border-radius:var(--r);
-webkit-backdrop-filter:blur(26px) saturate(170%);backdrop-filter:blur(26px) saturate(170%);
box-shadow:inset 0 1px 0 rgba(255,255,255,.45),inset 0 -1px 0 rgba(255,255,255,.08),
0 10px 30px rgba(0,20,50,.35);padding:14px}
h2{font-size:14px;font-weight:700;margin-bottom:10px;letter-spacing:.2px;display:flex;align-items:center;gap:8px}
h2 small{margin-left:auto;font-weight:400;color:var(--mute);font-size:12px}
.banner{padding:0;overflow:hidden;position:relative;min-height:150px;display:flex;
align-items:flex-end;background:linear-gradient(135deg,var(--sea),var(--azure))}
.banner .glow{position:absolute;inset:0;background:
radial-gradient(120% 90% at 15% 0%,rgba(95,212,244,.55),transparent 60%),
radial-gradient(100% 80% at 90% 10%,rgba(30,144,255,.6),transparent 55%)}
.banner img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.92}
.banner img.wall{opacity:.96}
.banner .hero-badge{position:absolute;top:12px;right:12px;z-index:2;font-size:11px;padding:4px 10px;
border-radius:999px;background:rgba(3,26,46,.55);border:1px solid var(--glass-b);color:#d8f4ff}
.banner .cap .tag{display:block;font-size:11.5px;color:var(--aqua);margin-top:2px}
.banner .cap{position:relative;width:100%;padding:30px 14px 12px;
background:linear-gradient(transparent,rgba(3,26,46,.88))}
.banner .cap b{font-size:21px;display:block;line-height:1.2}
.banner .cap span{font-size:12.5px;color:var(--mute)}
.logo{width:38px;height:38px;border-radius:12px;object-fit:cover;position:absolute;top:12px;left:12px;
border:1px solid var(--glass-b);z-index:2}
.row{display:flex;justify-content:space-between;gap:10px;padding:7px 0;
border-bottom:1px solid rgba(255,255,255,.1);font-size:13.5px}
.row:last-child{border:0}
.row span:first-child{color:var(--mute)}
.row span:last-child{text-align:right;font-weight:600;word-break:break-word}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
.stat{background:rgba(255,255,255,.1);border-radius:16px;padding:11px;text-align:center}
.stat b{display:block;font-size:22px;line-height:1.2}
.stat small{color:var(--mute);font-size:11.5px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#5dffa0;
margin-right:6px;box-shadow:0 0 8px #5dffa0}
.dot.off{background:#ff7a7a;box-shadow:0 0 8px #ff7a7a}
.lock{font-size:10.5px;color:var(--aqua);margin-left:6px;font-weight:400}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.chip{border:1px solid var(--glass-b);border-radius:16px;padding:11px 8px;text-align:center;
background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.06))}
.chip b{display:block;font-size:12.5px;font-family:ui-monospace,Menlo,monospace;color:var(--aqua);
word-break:break-all}
.chip small{display:block;margin-top:4px;font-size:10.5px;color:var(--mute)}
.top{list-style:none;display:grid;gap:9px;padding:0}
.top li{display:flex;align-items:center;gap:10px;font-size:13.5px}
.rank{width:24px;height:24px;border-radius:8px;background:rgba(255,255,255,.18);
display:grid;place-items:center;font-size:11.5px;font-weight:700;flex:none}
.top li:first-child .rank{background:linear-gradient(135deg,var(--aqua),var(--azure))}
.bar{flex:1;min-width:0}
.bar code{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:var(--aqua)}
.bar i{display:block;height:5px;border-radius:5px;
background:linear-gradient(90deg,var(--aqua),var(--azure));margin-top:5px}
.top em{font-style:normal;color:var(--mute);font-size:11.5px;margin-left:6px}
.menus{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.mi{padding:11px;border-radius:15px;border:1px solid var(--glass-b);
background:rgba(255,255,255,.09)}
.mi b{display:block;font-size:13px}
.mi code{display:inline-block;margin-top:5px;font-family:ui-monospace,Menlo,monospace;
font-size:11px;color:var(--aqua);word-break:break-all}
.mi small{display:block;margin-top:4px;color:var(--mute);font-size:11px}
.note{font-size:12px;line-height:1.6;color:var(--mute);margin-top:10px}
.note b{color:var(--txt)}
.cat-title{margin:14px 2px 8px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;
color:var(--aqua);font-weight:700}
.cat-title:first-of-type{margin-top:2px}
.cmd{padding:9px 11px;border-radius:13px;background:rgba(255,255,255,.07);
border:1px solid rgba(255,255,255,.1);font-size:12.5px;line-height:1.5}
.cmd+.cmd{margin-top:7px}
.cmd code{color:var(--aqua);font-family:ui-monospace,Menlo,monospace;font-size:12.5px;word-break:break-all}
.cmd span{color:rgba(235,246,255,.75);display:block;margin-top:3px;font-size:11.5px}
.pager{padding:11px 12px;border-radius:14px;font-size:12px;color:#dbe9f7;text-align:center;line-height:1.7}
.pager code{color:var(--aqua);font-family:ui-monospace,Menlo,monospace}
.footer{text-align:center;font-size:11px;color:var(--mute);padding:4px 0 0}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
.glass{background:rgba(10,60,100,.72)}}
`

/* Skrip ukur tinggi. Berhenti sendiri saat kartu tidak terlihat, jadi tidak
 * ada timer yang jalan terus di latar belakang. */
const AUTO_SIZE = `<script>(function(){
var last=0,tries=0,timer=null;
function stop(){if(timer){clearTimeout(timer);timer=null}}
function send(){
  if(document.hidden)return;
  /* Task176 — tinggi kartu TIDAK boleh melebihi layar: kalau isinya lebih
   * panjang, WhatsApp memotong kartu dan isinya tidak bisa digeser. */
  /* Task186 — batas diturunkan ke ~72% layar supaya masih ada ruang chat
   * yang bisa digeser & pesan daftar native (tombol yang benar-benar bisa
   * dipencet) cepat terlihat di bawah kartu. Isi panjang digeser DI DALAM
   * kartu: gesture biasa atau tombol ▲▼ (scrollControls). */
  var layar=(window.innerHeight||0)||720;
  var batas=Math.max(260,Math.round(layar*0.72));
  var h=Math.min(Math.min(9000,batas),Math.max(80,document.documentElement.scrollHeight||document.body.scrollHeight||0));
  if(!h||Math.abs(h-last)<4)return;
  last=h;
  try{if(window.AndroidBridge&&AndroidBridge.updateSize)AndroidBridge.updateSize(h)}catch(e){}
}
function tick(){send();if(tries++>5){stop();return}timer=setTimeout(tick,260)}
document.addEventListener("visibilitychange",function(){document.hidden?stop():tick()});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",tick);else tick();
})();</script>`

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return number.toLocaleString('id-ID')
}

export function durasi(detik) {
  const total = Math.max(0, Math.floor(Number(detik) || 0))
  const hari = Math.floor(total / 86400)
  const jam = Math.floor((total % 86400) / 3600)
  const menit = Math.floor((total % 3600) / 60)
  if (hari) return hari + 'h ' + jam + 'j'
  if (jam) return jam + 'j ' + menit + 'm'
  return menit + 'm ' + (total % 60) + 'd'
}

/** Perkiraan tinggi satu baris perintah (px). Hanya mengukur, tidak memotong. */
export function perkiraanTinggiPerintah(entry) {
  const nama = String(entry.command || '')
  const deskripsi = String(entry.description || '')
  const barisDeskripsi = Math.max(1, Math.ceil((deskripsi.length + 12) / 44))
  const barisNama = nama.length > 40 ? 2 : 1
  return 16 + barisNama * 15 + barisDeskripsi * 14 + 7 + 2
}

/**
 * Bagi katalog jadi halaman berdasarkan TINGGI.
 * Jaminan: gabungan semua halaman = seluruh entri, tanpa duplikat.
 */
export function paginateCatalogue(entries, options = {}) {
  const daftar = Array.isArray(entries) ? entries : []
  const maxPx = Number(options.maxPx) > 0 ? Number(options.maxPx) : MAX_CARD_PX
  const overhead = Number.isFinite(options.overhead)
    ? Number(options.overhead)
    : UKURAN.banner + UKURAN.kartu + UKURAN.headerSeksi + UKURAN.pager + UKURAN.footer + 30

  const halaman = []
  let sekarang = { items: [], tinggi: overhead, kategori: '' }

  for (const entry of daftar) {
    const label = String(entry.label || entry.category || 'UMUM')
    const tinggiEntri = perkiraanTinggiPerintah(entry)
    const perluJudul = label !== sekarang.kategori
    const tambahan = tinggiEntri + (perluJudul ? UKURAN.judulKategori : 0)

    if (sekarang.items.length && sekarang.tinggi + tambahan > maxPx) {
      halaman.push(sekarang)
      sekarang = { items: [], tinggi: overhead, kategori: '' }
    }

    const judul = label !== sekarang.kategori ? label : ''
    sekarang.items.push({ entry, judulKategori: judul })
    sekarang.tinggi += tinggiEntri + (judul ? UKURAN.judulKategori : 0)
    sekarang.kategori = label
  }

  if (sekarang.items.length) halaman.push(sekarang)
  if (!halaman.length) halaman.push({ items: [], tinggi: overhead, kategori: '' })

  const total = halaman.length
  return halaman.map((page, index) => ({
    index: index + 1,
    total,
    items: page.items,
    tinggi: Math.round(page.tinggi),
    perintah: page.items.length,
  }))
}

/** Tinggi tetap kartu beranda — dipakai uji supaya tidak pernah "kepotong". */
export function perkiraanTinggiBeranda({ kategori = 6, menuCepat = 3, top = 5, grup = false } = {}) {
  const barisKategori = Math.ceil(Math.min(8, kategori) / 2)
  const barisMenu = Math.ceil(Math.min(6, menuCepat) / 3)
  const barisTop = Math.min(10, top)
  return UKURAN.banner
    + UKURAN.kartu + UKURAN.headerSeksi + UKURAN.baris * 2 + UKURAN.stat
    + UKURAN.kartu + UKURAN.headerSeksi + UKURAN.baris * 3
    + (grup ? UKURAN.kartu + UKURAN.headerSeksi + UKURAN.baris + UKURAN.stat : 0)
    + UKURAN.kartu + UKURAN.headerSeksi + barisMenu * UKURAN.chip
    + UKURAN.kartu + UKURAN.headerSeksi + barisTop * UKURAN.barisTop
    + UKURAN.kartu + UKURAN.headerSeksi + barisKategori * UKURAN.itemMenu
    + UKURAN.footer + 30
}

function kerangka(judul, isi) {
  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(judul)}</title>
<style>${CSS}${wallpaperCss()}</style></head>
<body>
${wallpaperLayer()}
<main class="wrap">
${isi}
  <div class="footer">By AlzRiss - Usanagi Umi AI</div>
</main>
${AUTO_SIZE}
</body></html>`
}

function bannerCard({ botName, tagline, logoDataUri, backgroundDataUri, connected, badge = '' }) {
  const gambar = backgroundDataUri
    ? `<img class="${backgroundDataUri === WALLPAPER_BANNER ? 'wall' : ''}" src="${backgroundDataUri}" alt="">`
    : ''
  return `  <section class="glass banner">
    <div class="glow"></div>
    ${gambar}
    ${badge ? `<span class="hero-badge">${escapeHtml(badge)}</span>` : ''}
    ${logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="">` : ''}
    <div class="cap"><b>${escapeHtml(botName)}</b><span>${escapeHtml(tagline)}</span></div>
  </section>`
}

/**
 * Kartu beranda `.menu` — desain menu-bot.html, data asli dari bot.
 */
export function buildHomeCard({
  status = {}, stats = {}, prefix = '.', assets = {}, menuOptions = [],
  categories = [], top = [], owner = {}, developer = {}, jadibot = 0,
} = {}) {
  const server = status.server || {}
  const users = status.users || {}
  const grup = status.group || {}
  const connected = Boolean(status.connection && status.connection.connected)
  const botName = status.botName || 'Usanagi Umi AI'
  const ownerName = owner.name || status.ownerName || 'AlzRiss'
  const ownerNumber = owner.number || '-'
  const devName = developer.name || 'AlzRiss'
  const devNumber = developer.number || '-'

  const info = `  <section class="glass">
    <h2>Info bot</h2>
    <div class="row"><span>Nama</span><span>${escapeHtml(botName)}</span></div>
    <div class="row"><span>Status</span><span><i class="dot${connected ? '' : ' off'}"></i>${escapeHtml(connected ? 'online' : 'offline')}</span></div>
    <div class="row"><span>Aktif</span><span>${escapeHtml(server.uptimeSeconds == null ? 'Tidak tersedia' : durasi(server.uptimeSeconds))}</span></div>
    <div class="row"><span>Perintah</span><span>${formatNumber(stats.commands)} · ${formatNumber(stats.categories)} kategori</span></div>
    <div class="stats">
      <div class="stat"><b>${users.available ? formatNumber(users.total) : 'Tidak tersedia'}</b><small>User terdaftar</small></div>
      <div class="stat"><b>${formatNumber(jadibot)}</b><small>Jadibot</small></div>
    </div>
  </section>`

  const ownerCard = `  <section class="glass">
    <h2>Owner &amp; developer</h2>
    <div class="row"><span>Owner</span><span>${escapeHtml(ownerName)}</span></div>
    <div class="row"><span>Nomor owner</span><span>${escapeHtml(ownerNumber)}</span></div>
    <div class="row"><span>Developer<i class="lock">terkunci</i></span><span>${escapeHtml(devName)}</span></div>
    <div class="row"><span>Nomor developer</span><span>${escapeHtml(devNumber)}</span></div>
  </section>`

  const grupCard = grup.available ? `  <section class="glass">
    <h2>Info grup</h2>
    <div class="row"><span>Nama grup</span><span>${escapeHtml(grup.subject || '-')}</span></div>
    <div class="row"><span>Admin bot</span><span>${grup.botIsAdmin ? 'ya' : 'belum'}</span></div>
    <div class="stats">
      <div class="stat"><b>${formatNumber(grup.members)}</b><small>Member</small></div>
      <div class="stat"><b>${formatNumber(grup.admins)}</b><small>Admin</small></div>
    </div>
  </section>` : ''

  const cepat = menuOptions.slice(0, 6).map(option => `
      <div class="chip"><b>${escapeHtml(prefix + option.command)}</b><small>${escapeHtml(option.label)}</small></div>`).join('')

  const cepatCard = `  <section class="glass">
    <h2>Menu cepat</h2>
    <div class="grid3">${cepat}</div>
    <p class="note">Daftar yang <b>bisa diketuk</b> dikirim bot di pesan setelah kartu ini.</p>
  </section>`

  const topList = (Array.isArray(top) ? top : []).slice(0, 10)
  const maxTop = topList.length ? Math.max(1, Number(topList[0].count) || 1) : 1
  const topIsi = topList.length
    ? topList.map((item, index) => `
      <li><span class="rank">${index + 1}</span><div class="bar">
        <code>${escapeHtml(prefix + item.command)}</code><em>${formatNumber(item.count)}x</em>
        <i style="width:${Math.max(6, Math.round((Number(item.count) || 0) / maxTop * 100))}%"></i>
      </div></li>`).join('')
    : '<li><em>Belum ada data pemakaian.</em></li>'

  const topCard = `  <section class="glass">
    <h2>Top 10 fitur terpopuler</h2>
    <ul class="top">${topIsi}</ul>
  </section>`

  const kategori = (Array.isArray(categories) ? categories : []).slice(0, 8)
  const menus = kategori.map(item => `
      <div class="mi"><b>${escapeHtml(item.label)}</b>
        <code>${escapeHtml(prefix)}kategori ${escapeHtml(String(item.key || '').toLowerCase())}</code>
        <small>${formatNumber(item.commands.length)} fitur</small></div>`).join('')

  const menusCard = `  <section class="glass">
    <h2>Daftar menu <small id="m-total">(${formatNumber(kategori.length)})</small></h2>
    <div class="menus">${menus || '<div class="mi"><b>Tidak tersedia</b></div>'}</div>
    <p class="note">Semua perintah: <b>${escapeHtml(prefix)}menu_all</b> — dibagi per halaman, tidak ada yang dipotong.</p>
  </section>`

  return kerangka(botName + ' — Menu', [
    bannerCard({
      botName,
      tagline: 'Pilih menu di bawah, bot akan membalas',
      logoDataUri: assets.logoDataUri,
      // Task117: wallpaper dari owner menggantikan bg-card.jpg lama.
      backgroundDataUri: wallpaperEnabled() ? WALLPAPER_BANNER : assets.backgroundDataUri,
      badge: connected ? 'ONLINE' : 'OFFLINE',
      connected,
    }),
    info,
    ownerCard,
    grupCard,
    cepatCard,
    topCard,
    menusCard,
  ].filter(Boolean).join('\n\n'))
}

/**
 * Kartu satu halaman All Menu dengan desain yang sama.
 * Isinya LENGKAP untuk halaman itu (lihat paginateCatalogue).
 */
export function buildCatalogueCard({ status = {}, stats = {}, prefix = '.', page = 1, pages = [] } = {}) {
  const total = Array.isArray(pages) && pages.length ? pages.length : 1
  const current = Math.min(Math.max(1, Number(page) || 1), total)
  const halaman = Array.isArray(pages) && pages[current - 1]
    ? pages[current - 1]
    : { items: [], perintah: 0, tinggi: 0 }
  const botName = status.botName || 'Usanagi Umi AI'
  const sisa = total - current

  let terakhir = ''
  const baris = halaman.items.map(item => {
    const entry = item.entry
    const judul = item.judulKategori && item.judulKategori !== terakhir
      ? '<div class="cat-title">' + escapeHtml(item.judulKategori) + '</div>'
      : ''
    terakhir = item.judulKategori || terakhir
    const tanda = (entry.flags || []).length ? ' · ' + entry.flags.join(', ') : ''
    return judul + '\n      <div class="cmd"><code>' + escapeHtml(prefix + entry.command) + '</code>\n        <span>' + escapeHtml(entry.description || 'Tanpa deskripsi') + escapeHtml(tanda) + '</span></div>'
  }).join('')

  const isi = `${bannerCard({
    botName,
    tagline: `All Menu halaman ${current} dari ${total} · ${formatNumber(halaman.perintah)} perintah`,
    logoDataUri: '',
    backgroundDataUri: wallpaperEnabled() ? WALLPAPER_BANNER : '',
    connected: true,
    badge: `${current}/${total}`,
  })}

  <section class="glass">
    <h2>Perintah <small>${formatNumber(stats.commands)} total${sisa > 0 ? ' · ' + sisa + ' halaman lagi' : ' · halaman terakhir'}</small></h2>
    ${baris || '<div class="cmd"><span>Tidak ada perintah di halaman ini.</span></div>'}
  </section>

  <section class="glass pager">
    ${current < total ? 'Lanjut: <code>' + escapeHtml(prefix + 'menu_all ' + (current + 1)) + '</code>' : 'Ini halaman terakhir.'}
    ${current > 1 ? ' · Mundur: <code>' + escapeHtml(prefix + 'menu_all ' + (current - 1)) + '</code>' : ''}
    <br>Halaman 1: <code>${escapeHtml(prefix)}menu_all 1</code> · terakhir: <code>${escapeHtml(prefix + 'menu_all ' + total)}</code>
  </section>`

  return kerangka(`All Menu ${current}/${total}`, isi)
}

export { MAX_CARD_PX, UKURAN, CSS }
export default {
  buildHomeCard, buildCatalogueCard, paginateCatalogue,
  perkiraanTinggiPerintah, perkiraanTinggiBeranda, escapeHtml, durasi, MAX_CARD_PX,
}
