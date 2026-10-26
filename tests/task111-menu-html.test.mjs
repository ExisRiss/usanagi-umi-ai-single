/* Task111 — kartu menu HTML dibangun ulang: TIDAK ADA isi yang terpotong.
 *
 * Yang diuji:
 *   1. Semua perintah kebagian halaman (tidak hilang, tidak dobel).
 *   2. Tinggi tiap halaman di bawah batas tampilan WhatsApp.
 *   3. Halaman benar-benar memuat semua perintahnya + nomor halaman.
 *   4. Tidak ada lagi `.slice(0, ...)` yang memotong isi menu.
 *   5. Ringkasan body pesan interaktif tetap utuh & di bawah batas WhatsApp.
 */
import fs from 'node:fs'
import {
  paginateCatalogue, buildCatalogueCard, buildHomeCard, perkiraanTinggiBeranda,
  MAX_CARD_PX, escapeHtml,
} from '../lib/umi-menu/html.js'
import { ringkasMenuUtama } from '../lib/umi-menu/router.js'
import { MENU_OPTIONS } from '../lib/umi-menu/render.js'

const hasil = []
const cek = (n, l, i = '') => { hasil.push(l); console.log(`${l ? 'LULUS' : 'GAGAL'} · ${n}${i ? ' — ' + i : ''}`) }

const KATEGORI = ['GAME', 'TOOLS', 'OWNER', 'GRUP', 'DOWNLOAD', 'AI', 'RANDOM', 'STICKER']

function katalog(n) {
  return Array.from({ length: n }, (_, i) => ({
    command: 'perintah' + String(i).padStart(4, '0'),
    aliases: [],
    category: KATEGORI[i % KATEGORI.length].toLowerCase(),
    label: KATEGORI[i % KATEGORI.length],
    description: i % 7 === 0
      ? 'Deskripsi yang sengaja dibuat lebih panjang supaya baris teks membungkus dan tingginya bertambah ' + i
      : 'Deskripsi perintah nomor ' + i,
    flags: i % 11 === 0 ? ['owner'] : [],
    ownerOnly: i % 11 === 0,
    hidden: false,
    source: 'uji/perintah' + i,
  }))
}

const stats = { commands: 2200, aliases: 3100, categories: 8, plugins: 2200 }

/* 1. Kelengkapan halaman */
{
  const entries = katalog(2200)
  const pages = paginateCatalogue(entries)
  const semua = pages.flatMap(p => p.items.map(item => item.entry.command))
  cek('2200 perintah → semua masuk halaman', semua.length === 2200, `tercatat=${semua.length}`)
  cek('tidak ada perintah dobel', new Set(semua).size === semua.length, `unik=${new Set(semua).size}`)
  cek('tidak ada perintah hilang', entries.every(e => semua.includes(e.command)))
  cek('setiap halaman punya isi', pages.every(p => p.items.length > 0), `halaman=${pages.length}`)
  const maks = Math.max(...pages.map(p => p.tinggi))
  cek(`tinggi maks halaman ≤ ${MAX_CARD_PX}px`, maks <= MAX_CARD_PX, `maks=${maks}px`)
  cek('nomor halaman berurutan', pages.every((p, i) => p.index === i + 1 && p.total === pages.length))
}

/* 2. Halaman kecil / kosong tidak bikin error */
{
  const satu = paginateCatalogue(katalog(3))
  cek('katalog kecil → 1 halaman berisi 3', satu.length === 1 && satu[0].perintah === 3)
  const kosong = paginateCatalogue([])
  cek('katalog kosong → tetap 1 halaman aman', kosong.length === 1 && kosong[0].perintah === 0)
}

/* 3. Isi kartu halaman */
{
  const entries = katalog(2200)
  const pages = paginateCatalogue(entries)
  const json = buildCatalogueCard({ status: { botName: 'Umi' }, stats, prefix: '.', page: 3, pages })
  const halaman3 = pages[2]
  cek('kartu memuat semua perintah halaman 3', halaman3.items.every(item => json.includes('.' + item.entry.command)), `${halaman3.perintah} perintah`)
  cek('kartu menulis nomor halaman', json.includes('All Menu · 3/' + pages.length))
  cek('kartu menulis jumlah perintah halaman', json.includes(String(halaman3.perintah)))
  const terakhir = buildCatalogueCard({ status: {}, stats, prefix: '.', page: pages.length, pages })
  cek('halaman terakhir ditandai', /halaman terakhir/i.test(terakhir))
  cek('halaman terakhir memuat semua sisa perintah', pages[pages.length - 1].items.every(item => terakhir.includes('.' + item.entry.command)))
  const diluar = buildCatalogueCard({ status: {}, stats, prefix: '.', page: 9999, pages })
  cek('nomor halaman di luar batas dijepit ke halaman terakhir', diluar.includes('All Menu · ' + pages.length + '/' + pages.length))
}

/* 4. Tidak memotong teks: escape benar, tidak ada elipsis buatan di nama perintah */
{
  const entries = [{ command: 'uji<script>', label: 'UJI', description: 'pakai & < > "kutip"', flags: [] }]
  const pages = paginateCatalogue(entries)
  const html = buildCatalogueCard({ status: {}, stats, prefix: '.', page: 1, pages })
  cek('nama perintah di-escape', html.includes('.uji&lt;script&gt;'))
  cek('tidak ada tag script dari input', !html.includes('<script>uji'))
  cek('deskripsi di-escape', html.includes('&amp;') && html.includes('&lt;'))
  cek('helper escape utuh', escapeHtml('<a&b>') === '&lt;a&amp;b&gt;')
}

/* 5. Beranda tidak pernah dipotong & tinggi terukur */
{
  const menuOptions = [
    { label: 'Semua Fitur', hint: 'semua perintah', command: 'menu_all', icon: '☰' },
    { label: 'Owner', hint: 'khusus owner', command: 'menu_owner', icon: '♛' },
    { label: 'Grup', hint: 'perintah grup', command: 'menu_group', icon: '👥' },
    { label: 'Game', hint: 'permainan', command: 'menu_game', icon: '🎮' },
    { label: 'Tools', hint: 'alat bantu', command: 'menu_tools', icon: '🧰' },
    { label: 'Dashboard', hint: 'statistik', command: 'menu_dashboard', icon: '📊' },
  ]
  const html = buildHomeCard({
    status: { botName: 'Umi', ownerName: 'AlzRiss', time: '26/10 08.00', connection: { connected: true }, server: { rssMb: 500, cpuPercent: 12, uptimeSeconds: 900 }, users: { available: true, total: 253, registered: 200 }, web: { available: true, users: 253 } },
    stats, prefix: '.', assets: {}, menuOptions,
    categories: KATEGORI.map((label, i) => ({ label, commands: new Array(10 + i).fill(0) })),
  })
  cek('beranda memuat semua menu cepat', menuOptions.every(o => html.includes('.' + o.command)))
  const tinggi = perkiraanTinggiBeranda({ stats: { menuOptions: 6 }, kategori: 6 })
  cek(`tinggi beranda ≤ ${MAX_CARD_PX}px`, tinggi <= MAX_CARD_PX, `perkiraan=${tinggi}px`)
}

/* 6. Tidak ada pemotongan isi di kode menu */
{
  const router = fs.readFileSync(new URL('../lib/umi-menu/router.js', import.meta.url), 'utf8')
  const html = fs.readFileSync(new URL('../lib/umi-menu/html.js', import.meta.url), 'utf8')
  const render = fs.readFileSync(new URL('../lib/umi-menu/render.js', import.meta.url), 'utf8')
  cek('router tidak lagi memotong body menu', !/slice\(0,\s*3200\)/.test(router))
  cek('router memakai paginator tinggi', /paginateCatalogue\(/.test(router))
  cek('router memakai kartu baru', /buildCatalogueCard|buildHomeCard/.test(router))
  cek('render.js tidak lagi berisi pembangun HTML lama', !/buildDashboardHtml|buildAllMenuHtml/.test(render))
  cek('html.js tidak memotong daftar perintah', !/commands\.slice\(0,\s*\d+\)/.test(html))
}

/* 7. Ringkasan body pesan interaktif */
{
  const teks = ringkasMenuUtama({ status: { botName: 'Umi', connection: { connected: true } }, stats, prefix: '.' })
  cek('ringkasan ≤ 1024 karakter (batas WhatsApp)', teks.length <= 1024, `${teks.length} karakter`)
  cek('ringkasan memuat semua pilihan menu', MENU_OPTIONS.every(option => teks.includes('.' + option.command)), MENU_OPTIONS.map(o => o.command).join(','))
  cek('ringkasan tidak memakai elipsis potongan', !teks.includes('…'))
  cek('ringkasan menunjuk daftar lengkap', /menu_all/.test(teks) && /tidak dipotong/i.test(teks))
}

const gagal = hasil.filter(x => !x).length
console.log(`\n${hasil.length - gagal}/${hasil.length} lulus`)
process.exit(gagal ? 1 : 0)
