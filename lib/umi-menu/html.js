/* By AlzRiss - Usanagi Umi AI
 *
 * KARTU MENU HTML — ditulis ulang dari nol (Task111).
 *
 * Kenapa ditulis ulang:
 *   1. Versi lama memotong isi. `sendMainMenu` mengirim body dengan
 *      `.slice(0, 3200)` dan halaman All Menu dipotong tetap 48 perintah
 *      tanpa melihat tinggi sebenarnya, sehingga sisa perintah hilang dari
 *      kartu dan bagian bawah kartu terpotong di WebView WhatsApp.
 *   2. Skrip auto-size lama melaporkan `Math.min(4000, tinggi)` sehingga
 *      kartu yang lebih tinggi dari 4000 px tetap terlihat terpotong.
 *
 * Aturan modul ini:
 *   - TIDAK ADA pemotongan isi: setiap perintah masuk tepat satu halaman.
 *   - Tinggi tiap halaman dihitung dulu (px) dan dijaga di bawah
 *     MAX_CARD_PX (3600) supaya tidak melewati batas tampilan WhatsApp.
 *   - Kalau satu halaman sudah penuh, sisa perintah pindah ke halaman
 *     berikutnya — bukan dibuang.
 *   - Tidak ada aset/tautan luar, tidak ada tombol palsu: tombol yang benar
 *     bisa ditekan tetap dikirim sebagai daftar native sesudah kartu.
 */

const MAX_CARD_PX = 3600

/* Batas aman tinggi blok-blok kartu (px) — dipakai untuk memastikan
 * halaman tidak melewati MAX_CARD_PX. Angka ini konservatif: lebih baik
 * halaman terlihat agak lega daripada terpotong. */
const UKURAN = {
  topbar: 78,
  hero: 210,
  sectionHead: 30,
  stat: 74,
  metaBaris: 30,
  menuCard: 92,
  catRow: 42,
  note: 74,
  footer: 44,
  pager: 74,
  judulKategori: 34,
}

const CSS = `
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
.body{padding-bottom:6px}
.cat-title:first-of-type{margin-top:6px}
`

const AUTO_SIZE = '<script>(function(){function r(){try{if(window.AndroidBridge&&AndroidBridge.updateSize)AndroidBridge.updateSize(Math.min(4000,Math.max(80,document.body.scrollHeight)))}catch(e){}}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",r);else r();setTimeout(r,450)})();</script>'

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

/** Perkiraan tinggi satu baris perintah (px). Tidak memotong, hanya mengukur. */
export function perkiraanTinggiPerintah(entry) {
  const nama = String(entry.command || '')
  const deskripsi = String(entry.description || '')
  // code 1 baris (15 px) + deskripsi dibungkus ~44 karakter/baris (14 px/baris)
  const barisDeskripsi = Math.max(1, Math.ceil((deskripsi.length + 12) / 44))
  const barisNama = nama.length > 40 ? 2 : 1
  // padding 16 + baris nama 15/baris + deskripsi 14/baris + margin 7 + border 2
  return 16 + barisNama * 15 + barisDeskripsi * 14 + 7 + 2
}

/**
 * Bagi katalog jadi halaman berdasarkan TINGGI, bukan jumlah tetap.
 * Jaminan: gabungan semua halaman = seluruh entri, tanpa duplikat.
 */
export function paginateCatalogue(entries, options = {}) {
  const daftar = Array.isArray(entries) ? entries : []
  const maxPx = Number(options.maxPx) > 0 ? Number(options.maxPx) : MAX_CARD_PX
  const overhead = Number.isFinite(options.overhead) ? Number(options.overhead) : UKURAN.topbar + UKURAN.pager + UKURAN.footer + 24

  const halaman = []
  let sekarang = { items: [], tinggi: overhead, kategori: '' }
  let totalKategori = 0

  for (const entry of daftar) {
    const label = String(entry.label || entry.category || 'UMUM')
    const tinggiEntri = perkiraanTinggiPerintah(entry)
    const perluJudul = label !== sekarang.kategori
    const tambahan = tinggiEntri + (perluJudul ? UKURAN.judulKategori : 0)

    if (sekarang.items.length && sekarang.tinggi + tambahan > maxPx) {
      halaman.push(sekarang)
      sekarang = { items: [], tinggi: overhead, kategori: '' }
      totalKategori += 1
    }

    const judul = label !== sekarang.kategori ? label : ''
    sekarang.items.push({ entry, judulKategori: judul })
    sekarang.tinggi += tinggiEntri + (judul ? UKURAN.judulKategori : 0)
    sekarang.kategori = label
  }

  if (sekarang.items.length) halaman.push(sekarang)

  const total = halaman.length || 1
  if (!halaman.length) halaman.push({ items: [], tinggi: overhead, kategori: '' })

  return halaman.map((page, index) => ({
    index: index + 1,
    total,
    items: page.items,
    tinggi: Math.round(page.tinggi),
    perintah: page.items.length,
  }))
}

function kartu(judul, isi, footerKanan) {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#080b14">
<title>${escapeHtml(judul)}</title>
<style>${CSS}</style></head>
<body>
<div class="ambient one"></div><div class="ambient two"></div>
<main class="page">
${isi}
  <footer class="footer"><div>${escapeHtml(footerKanan)}</div></footer>
</main>
${AUTO_SIZE}
</body></html>`
}

/** Tinggi tetap kartu beranda — dipakai uji supaya tidak pernah "kepotong". */
export function perkiraanTinggiBeranda({ stats, kategori = 0 } = {}) {
  const menuTerpakai = Math.max(1, Number(stats && stats.menuOptions) || 6)
  const barisMenu = Math.ceil(menuTerpakai / 2)
  const barisStat = Math.ceil(4 / 2)
  const barisKategori = Math.max(1, Math.min(6, kategori))
  return UKURAN.topbar + UKURAN.hero + UKURAN.sectionHead + barisStat * UKURAN.stat
    + UKURAN.metaBaris * 2 + UKURAN.sectionHead + barisMenu * UKURAN.menuCard
    + UKURAN.note + UKURAN.sectionHead + barisKategori * UKURAN.catRow + UKURAN.footer + 24
}

/**
 * Kartu beranda `.menu`.
 * Semua data tampil apa adanya — tidak ada `.slice()` pada teks isi.
 */
export function buildHomeCard({ status, stats, prefix = '.', assets = {}, menuOptions = [], categories = [] }) {
  const server = status && status.server ? status.server : {}
  const users = status && status.users ? status.users : {}
  const web = status && status.web ? status.web : {}
  const connected = Boolean(status && status.connection && status.connection.connected)
  const botName = (status && status.botName) || 'Usanagi Umi AI'
  const ownerName = (status && status.ownerName) || 'AlzRiss'
  const cpu = server.cpuPercent == null ? 'Tidak tersedia' : server.cpuPercent + '%'
  const ram = server.rssMb == null ? 'Tidak tersedia' : formatNumber(server.rssMb) + ' MB'
  const uptime = server.uptimeSeconds == null ? 'Tidak tersedia' : durasi(server.uptimeSeconds)
  const groupLine = status && status.group && status.group.available
    ? status.group.subject + ' · ' + formatNumber(status.group.members) + ' anggota'
    : 'Bukan grup'

  const logo = assets.logoDataUri
    ? '<img class="logo" src="' + assets.logoDataUri + '" alt="logo">'
    : '<div class="logo"></div>'
  const heroBg = assets.backgroundDataUri
    ? '<img class="hero-bg" src="' + assets.backgroundDataUri + '" alt="">'
    : ''

  const kartuMenu = menuOptions.map(option => `
      <div class="menu-card glass">
        <div class="menu-icon">${escapeHtml(option.icon || '▦')}</div>
        <div class="menu-copy">
          <strong>${escapeHtml(option.label)}</strong>
          <small>${escapeHtml(option.hint)}</small>
          <code>${escapeHtml(prefix + option.command)}</code>
        </div>
      </div>`).join('')

  const kategori = (Array.isArray(categories) ? categories : []).slice(0, 6)
  const barisKategori = kategori.map(item => `
      <div class="cat-row"><b>${escapeHtml(item.label)}</b><small>${formatNumber(item.commands.length)} fitur</small></div>`).join('')

  const isi = `  <header class="topbar glass">
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
      Semua perintah ada di <code>${escapeHtml(prefix)}menu_all</code> (halaman, tanpa dipotong).</p>
    </div>
  </section>

  <div class="section-head"><h3>Status</h3><span>${escapeHtml(status.time || '')}</span></div>
  <section class="stats">
    <article class="stat glass"><div class="stat-label">Server</div><div class="stat-value">${connected ? 'Aktif' : 'Offline'}</div><div class="stat-note">Uptime ${escapeHtml(uptime)}</div></article>
    <article class="stat glass"><div class="stat-label">Pengguna</div><div class="stat-value">${users.available ? formatNumber(users.total) : 'Tidak tersedia'}</div><div class="stat-note">${users.available ? formatNumber(users.registered || 0) + ' terdaftar' : 'data DB tidak ada'}</div></article>
    <article class="stat glass"><div class="stat-label">Fitur</div><div class="stat-value">${formatNumber(stats.commands)}</div><div class="stat-note">dari plugin aktif</div></article>
    <article class="stat glass"><div class="stat-label">Alias</div><div class="stat-value">${formatNumber(stats.aliases)}</div><div class="stat-note">nama alternatif</div></article>
  </section>
  <div class="meta">
    <span>RAM <b>${escapeHtml(ram)}</b></span>
    <span>CPU <b>${escapeHtml(cpu)}</b></span>
    <span>Kategori <b>${formatNumber(stats.categories)}</b></span>
    <span>Konteks <b>${escapeHtml(groupLine)}</b></span>
    <span>Website <b>${web.available ? formatNumber(web.users) + ' pengguna' : 'Tidak tersedia'}</b></span>
  </div>

  <div class="section-head"><h3>Menu Cepat</h3><span>ketuk daftar di pesan berikutnya</span></div>
  <section class="menu-grid">${kartuMenu}</section>

  <div class="note glass"><b>Cara buka:</b> kartu ini ringkasan. Tombol yang bisa ditekan ada di
    daftar WhatsApp pada pesan berikutnya. Daftar perintah lengkap: <code>${escapeHtml(prefix)}menu_all</code>
    (dibagi per halaman, tidak ada yang dipotong).</div>

  <div class="section-head"><h3>Kategori Populer</h3><span>${escapeHtml(prefix)}kategori &lt;nama&gt;</span></div>
  <section>${barisKategori || '<div class="cat-row"><b>Tidak tersedia</b></div>'}</section>
`

  return kartu(botName + ' — Menu', isi, botName + ' · By AlzRiss')
}

/** Kartu satu halaman All Menu. Isinya LENGKAP untuk halaman itu. */
export function buildCatalogueCard({ status, stats, prefix = '.', page, pages }) {
  const total = pages && pages.length ? pages.length : 1
  const current = Math.min(Math.max(1, Number(page) || 1), total)
  const halaman = pages && pages[current - 1] ? pages[current - 1] : { items: [], perintah: 0, tinggi: 0 }

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

  const belum = total - current
  const isi = `  <header class="topbar glass">
    <div class="brand"><h1>All Menu · ${current}/${total}</h1>
      <p>${formatNumber(stats.commands)} perintah · halaman ini ${formatNumber(halaman.perintah)} perintah</p></div>
    <div class="live"><span class="dot"></span>${belum > 0 ? belum + ' halaman lagi' : 'halaman terakhir'}</div>
  </header>
  ${baris || '<div class="cat-row"><b>Tidak ada perintah di halaman ini</b></div>'}
  <div class="pager glass">
    ${current < total
      ? 'Lanjut: <code>' + escapeHtml(prefix + 'menu_all ' + (current + 1)) + '</code>'
      : 'Ini halaman terakhir.'}
    ${current > 1 ? ' · Mundur: <code>' + escapeHtml(prefix + 'menu_all ' + (current - 1)) + '</code>' : ''}
    · Semua: <code>${escapeHtml(prefix)}menu_all 1</code> s.d. <code>${escapeHtml(prefix + 'menu_all ' + total)}</code>
  </div>
`

  return kartu('All Menu ' + current + '/' + total, isi, 'Usanagi Umi AI · By AlzRiss')
}

function durasi(detik) {
  const total = Math.max(0, Math.floor(Number(detik) || 0))
  const hari = Math.floor(total / 86400)
  const jam = Math.floor((total % 86400) / 3600)
  const menit = Math.floor((total % 3600) / 60)
  if (hari) return hari + 'h ' + jam + 'j'
  if (jam) return jam + 'j ' + menit + 'm'
  return menit + 'm ' + (total % 60) + 'd'
}

export { MAX_CARD_PX, UKURAN, CSS }
export default { buildHomeCard, buildCatalogueCard, paginateCatalogue, perkiraanTinggiPerintah, perkiraanTinggiBeranda, MAX_CARD_PX }
