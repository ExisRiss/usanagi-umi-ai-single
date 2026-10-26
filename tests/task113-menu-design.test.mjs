/* Task113 — kartu menu memakai desain "Sea Glass" dari menu-bot.html milik
 * owner, DAN benar-benar lolos validator resmi perpustakaan WhatsApp
 * (`checkHtmlApp` dari @rexxhayanasi/elaina-baileys 1.4.7). */
import {
  buildHomeCard, buildCatalogueCard, paginateCatalogue,
  perkiraanTinggiBeranda, MAX_CARD_PX, CSS,
} from '../lib/umi-menu/html.js'
import { checkHtmlApp } from '@rexxhayanasi/elaina-baileys/src/Utils/html-app.js'

const hasil = []
const cek = (n, l, i = '') => { hasil.push(l); console.log(`${l ? 'LULUS' : 'GAGAL'} · ${n}${i ? ' — ' + i : ''}`) }

const status = {
  botName: 'Usanagi Umi AI', ownerName: 'AlzRiss', time: '26/10/2026, 09.10.00 WITA',
  connection: { connected: true },
  server: { rssMb: 745, cpuPercent: 12, uptimeSeconds: 5400, nodeVersion: 'v23.11.1' },
  users: { available: true, total: 253, registered: 214 },
  web: { available: true, users: 253, active24h: 40 },
  group: { available: true, subject: 'Grup Uji', members: 87, admins: 4, botIsAdmin: true },
}
const stats = { commands: 2044, aliases: 3310, categories: 12, plugins: 2055 }
const kategori = ['GAME', 'TOOLS', 'OWNER', 'GRUP', 'DOWNLOAD', 'AI', 'STICKER', 'FUN']
  .map((label, i) => ({ key: label.toLowerCase(), label, commands: new Array(40 + i * 13).fill(0) }))
const menuOptions = [
  { label: 'All Menu', hint: 'semua perintah', command: 'menu_all', icon: '▦' },
  { label: 'Owner Menu', hint: 'khusus owner', command: 'menu_owner', icon: '♛' },
  { label: 'Group Menu', hint: 'perintah grup', command: 'menu_group', icon: '◎' },
]
const top = [
  { command: 'menu', count: 812 }, { command: 'allmenu', count: 470 },
  { command: 'ytmp3', count: 333 }, { command: 'ping', count: 120 }, { command: 'brat', count: 66 },
]

const beranda = buildHomeCard({
  status, stats, prefix: '/', assets: {}, menuOptions, categories: kategori, top,
  jadibot: 20, owner: { name: 'AlzRiss', number: '6287813709432' },
  developer: { name: 'AlzRiss', number: '6287813709432' },
})

/* ── 1. Desain owner dipakai ───────────────────────────────────── */
{
  cek('palet laut dipakai (--deep/--sea/--azure)', /--deep:#031a2e/.test(CSS) && /--azure:#1e90ff/.test(CSS))
  cek('kartu kaca (backdrop-filter blur)', /backdrop-filter:blur/.test(beranda))
  cek('ada banner', beranda.includes('class="glass banner"'))
  for (const judul of ['Info bot', 'Owner &amp; developer', 'Info grup', 'Menu cepat', 'Top 10 fitur terpopuler', 'Daftar menu']) {
    cek(`bagian "${judul.replace('&amp;', '&')}" ada`, beranda.includes(judul))
  }
  cek('developer terkunci', /Developer<i class="lock">terkunci<\/i>/.test(beranda))
  cek('angka statistik besar (.stat b)', /\.stat b\{display:block;font-size:22px/.test(CSS))
  cek('bar top memakai gradasi aqua→azure', /linear-gradient\(90deg,var\(--aqua\),var\(--azure\)\)/.test(CSS))
}

/* ── 2. Data NYATA, bukan demo ─────────────────────────────────── */
{
  cek('nama bot dari status', beranda.includes('Usanagi Umi AI'))
  cek('user terdaftar dari DB', beranda.includes('253'))
  cek('jadibot dari jumlah koneksi', /<b>20<\/b><small>Jadibot<\/small>/.test(beranda))
  cek('nomor owner dari config', beranda.includes('6287813709432'))
  cek('top fitur dari statistik pemakaian', beranda.includes('/menu') && beranda.includes('812x'))
  cek('top fitur urut terbanyak dulu', beranda.indexOf('812x') < beranda.indexOf('470x'))
  cek('grup memakai metadata asli', beranda.includes('Grup Uji') && beranda.includes('<b>87</b>'))
  cek('daftar menu memakai jumlah kategori asli', /<small id="m-total">\(8\)<\/small>/.test(beranda), 'kategori=8')
  cek('prefix yang dipakai benar-benar "/"', beranda.includes('/menu_all') && !beranda.includes('.menu_all'))
  cek('tidak ada angka demo palsu "Bot"', !beranda.includes('>Bot<'))
}

/* ── 3. Aturan WebView WhatsApp (validator resmi perpustakaan) ─── */
{
  const laporan = checkHtmlApp(beranda, { height: 1800 })
  cek('checkHtmlApp: tidak ada masalah', laporan.ok === true, JSON.stringify(laporan.problems).slice(0, 220))
  cek('tidak ada aset luar (remote src/href)', !/(src|href)\s*=\s*["']?(https?:)?\/\//i.test(beranda))
  cek('tidak memakai fetch/XHR', !/\bfetch\s*\(|XMLHttpRequest|sendBeacon|EventSource/.test(beranda))
  cek('tidak memakai localStorage/sessionStorage/cookie', !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(beranda))
  cek('tidak ada aspect-ratio (tinggi tidak berubah-ubah)', !/aspect-ratio/.test(beranda))
  cek('tinggi dilaporkan lewat AndroidBridge.updateSize', /AndroidBridge\s*\.\s*updateSize/.test(beranda))
  cek('timer berhenti saat kartu tidak terlihat', /visibilitychange/.test(beranda) && /document\.hidden/.test(beranda) && /clearTimeout/.test(beranda))
  cek('ukuran halaman wajar (< 120 KB)', Buffer.byteLength(beranda, 'utf8') < 120 * 1024, Buffer.byteLength(beranda, 'utf8') + ' B')
}

/* ── 4. Tidak ada yang terpotong ───────────────────────────────── */
{
  const tinggi = perkiraanTinggiBeranda({ kategori: 8, menuCepat: 3, top: 5, grup: true })
  cek(`perkiraan tinggi beranda ≤ ${MAX_CARD_PX}px`, tinggi <= MAX_CARD_PX, tinggi + ' px')

  const entries = Array.from({ length: 1500 }, (_, i) => ({
    command: 'cmd' + i, label: kategori[i % kategori.length].label,
    description: 'deskripsi perintah ' + i, flags: [],
  }))
  const pages = paginateCatalogue(entries)
  const katalog = buildCatalogueCard({ status, stats, prefix: '/', page: 2, pages })
  const laporan = checkHtmlApp(katalog, { height: 2000 })
  cek('checkHtmlApp kartu katalog: tidak ada masalah', laporan.ok === true, JSON.stringify(laporan.problems).slice(0, 200))
  cek('halaman katalog tetap di bawah batas', Math.max(...pages.map(p => p.tinggi)) <= MAX_CARD_PX)
  const semua = pages.flatMap(p => p.items.map(i => i.entry.command))
  cek('semua perintah kebagian halaman (1500)', semua.length === 1500 && new Set(semua).size === 1500)
  cek('kartu katalog memakai prefix "/"', katalog.includes('/cmd'))
}

/* ── 5. Keamanan teks ──────────────────────────────────────────── */
{
  const jahat = buildHomeCard({
    status: { ...status, botName: '<script>alert(1)</script>', group: { available: false } },
    stats, prefix: '.', menuOptions: [], categories: [], top: [],
    owner: { name: '"><b>x</b>', number: '123' }, developer: { name: 'AlzRiss', number: '6287813709432' },
  })
  cek('nama bot di-escape', !jahat.includes('<script>alert(1)</script>') && jahat.includes('&lt;script&gt;'))
  cek('nama owner di-escape', jahat.includes('&quot;&gt;&lt;b&gt;'))
  cek('tanpa grup → bagian grup tidak dirender', !jahat.includes('Info grup'))
  cek('tanpa data top → jujur "Belum ada data pemakaian"', jahat.includes('Belum ada data pemakaian'))
}

const gagal = hasil.filter(x => !x).length
console.log(`\n${hasil.length - gagal}/${hasil.length} lulus`)
process.exit(gagal ? 1 : 0)
