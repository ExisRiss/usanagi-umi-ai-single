/* By AlzRiss - Usanagi Umi AI
 *
 * ISI TOMBOL MENU (Task122 → Task123 → Task125)
 *
 * Riwayat singkat:
 *   Task122 — daftar "📋 MENU UTAMA 1–6" di dalam pesan dihapus, diganti tombol.
 *   Task123 — tombolnya DILENGKAPI: tools, maker, group, dan semua kategori.
 *   Task125 — setiap pilihan diberi IKON + DESKRIPSI supaya pengguna baru
 *             langsung tahu fungsi tiap menu tanpa harus membukanya.
 *
 * Bentuk tombol (urutan penting — WhatsApp memakai batas 10 tombol hanya kalau
 * tombol pertama `quick_reply`, selain itu 3):
 *   [🛠 TOOLS] [🎨 MAKER] [👥 GROUP]  → quick_reply langsung ke kategorinya
 *   [☰ PILIH MENU]                    → single_select: 6 menu utama
 *   [▦ SEMUA MENU]                    → single_select: semua kategori, dibagi
 *                                       maks 10 baris/bagian
 *   [👑 OWNER BOT]                    → kontak owner
 *
 * Semua id baris WAJIB ber-prefix: WhatsApp mengirim balik id apa adanya.
 */

import { PILIHAN_BAWAAN } from './menu-text.js'

export const MAKS_BARIS_PER_BAGIAN = 10
export const MAKS_BAGIAN = 10

const teks = (nilai, batas = 60) => String(nilai == null ? '' : nilai).slice(0, batas)

/** Ikon per kategori bot. Kunci = nama folder di `plugins/`. */
export const IKON_KATEGORI = Object.freeze({
  ai: '🤖',
  anime: '🌸',
  channel: '📣',
  compat: '🧩',
  download: '⬇️',
  downloader: '📥',
  economy: '💰',
  fun: '🎲',
  game: '🎮',
  'game-html': '🕹️',
  'game-rimuru': '🧩',
  group: '👥',
  info: 'ℹ️',
  internet: '🌐',
  main: '🏠',
  maker: '🎨',
  misc: '🧰',
  music: '🎵',
  notif: '🔔',
  owner: '👑',
  ourin: '🌀',
  pelengkap: '📦',
  stalker: '🕵️',
  premium: '💎',
  quotes: '💬',
  relationship: '💞',
  rpg: '⚔️',
  search: '🔍',
  sticker: '🩹',
  store: '🏪',
  tools: '🛠️',
  'umi-extra': '✨',
  voice: '🎙️',
  xrina: '🧬',
  _system: '⚙️',
  data: '🗃️',
})

/** Keterangan singkat fungsi tiap kategori (dipakai di deskripsi tombol). */
export const DESKRIPSI_KATEGORI = Object.freeze({
  ai: 'tanya AI, gambar AI, analisis foto',
  anime: 'fitur bertema anime & waifu',
  channel: 'kelola saluran WhatsApp bot',
  compat: 'plugin format lain: case, scraper, CJS',
  download: 'unduh video, musik, dokumen',
  downloader: 'unduh dari TikTok, IG, Facebook',
  economy: 'koin, bank, jual beli',
  fun: 'hiburan ringan & tebak-tebakan',
  game: 'main game & taruhan koin',
  'game-html': 'game interaktif berbasis web',
  'game-rimuru': 'kumpulan game gaya Umi Usanagi',
  group: 'admin grup, welcome, kick, mute',
  info: 'info bot, status, statistik',
  internet: 'cari data & cek jaringan',
  main: 'menu, ping, peraturan, daftar',
  maker: 'buat stiker, poster, tulisan',
  misc: 'fitur tambahan yang tak berkategori',
  music: 'putar & cari musik',
  notif: 'pengaturan notifikasi',
  owner: 'khusus owner: setelan & kontrol bot',
  ourin: 'fitur hasil porting dari UMI USANAGI: sholat, unduhan',
  pelengkap: 'fitur pelengkap dari sumber lain',
  premium: 'fitur khusus pengguna premium',
  quotes: 'kutipan bijak, bucin, galau, motivasi',
  relationship: 'jodoh, teman, pasangan',
  rpg: 'petualangan, level, inventory',
  search: 'cari gambar, lagu, film, resep',
  stalker: 'intip profil GitHub dan akun publik',
  sticker: 'olah stiker: ambil, ubah, emoji',
  store: 'toko & pesanan otomatis',
  tools: 'konversi, utilitas, hitung-hitungan',
  'umi-extra': 'fitur Umi tambahan',
  voice: 'ubah suara & voice note',
  xrina: 'fitur paket Xrina',
  _system: 'sistem internal bot (pemeliharaan)',
  data: 'berkas data & basis data bot',
})

/** Ikon untuk tiap menu utama. */
export const IKON_PILIHAN = Object.freeze({
  menu_all: '🗂️',
  menu_owner: '👑',
  menu_group: '👥',
  menu_game: '🎮',
  menu_tools: '🛠️',
  menu_refresh: '🔄',
})

/** Deskripsi panjang (lebih jelas) untuk tiap menu utama. */
export const DESKRIPSI_PILIHAN = Object.freeze({
  menu_all: 'seluruh perintah semua kategori, dibagi per halaman',
  menu_owner: 'perintah khusus owner: setelan, backup, kontrol bot',
  menu_group: 'perintah admin grup: welcome, kick, mute, tag',
  menu_game: 'game dan RPG yang bisa dimainkan',
  menu_tools: 'alat bantu: unduh, konversi, hitung, stiker',
  menu_refresh: 'ambil ulang status bot yang terbaru',
})

/** Label kategori → "Tools", "Maker", "Game Html", dst. */
export function namaKategori(key) {
  return String(key || '')
    .split(/[-_]/)
    .map(kata => (kata.length > 1 ? kata.charAt(0).toUpperCase() + kata.slice(1) : kata.toUpperCase()))
    .join(' ')
}

/** Ikon kategori; kategori baru otomatis dapat ikon netral. */
export function ikonKategori(key) {
  return IKON_KATEGORI[String(key || '').toLowerCase()] || '📁'
}

/** Deskripsi kategori; kategori baru tetap dapat kalimat yang masuk akal. */
export function deskripsiKategori(key, total = 0) {
  const nama = namaKategori(key)
  const inti = DESKRIPSI_KATEGORI[String(key || '').toLowerCase()] || `kumpulan perintah ${nama.toLowerCase()}`
  return total > 0 ? `${total} perintah · ${inti}` : inti
}

/** Satu bagian berisi 6 menu utama (ikon + deskripsi masing-masing). */
export function bagianMenuUtama({ prefix = '.' } = {}) {
  return [{
    title: '☰ Menu Utama',
    highlight_label: 'Rekomendasi',
    rows: PILIHAN_BAWAAN.map(opsi => ({
      header: IKON_PILIHAN[opsi.command] || '▸',
      title: teks(opsi.label),
      description: teks(DESKRIPSI_PILIHAN[opsi.command] || opsi.hint, 120),
      id: `${prefix}${opsi.command}`,
    })),
  }]
}

/**
 * Semua kategori dijadikan baris (ikon + jumlah perintah + fungsinya),
 * dibagi menjadi beberapa bagian (maks 10 baris per bagian).
 */
export function bagianSemuaMenu({ prefix = '.', kategori = [], perBagian = MAKS_BARIS_PER_BAGIAN, maksBagian = MAKS_BAGIAN } = {}) {
  const baris = (Array.isArray(kategori) ? kategori : [])
    .filter(item => item && item.key)
    .map(item => ({
      header: ikonKategori(item.key),
      title: teks(`Menu ${namaKategori(item.key)}${item.total ? ` · ${item.total}` : ''}`),
      description: teks(deskripsiKategori(item.key, item.total), 120),
      id: `${prefix}kategori ${item.key}`,
    }))

  const bagian = []
  for (let i = 0; i < baris.length && bagian.length < maksBagian; i += perBagian) {
    const potong = baris.slice(i, i + perBagian)
    const halaman = bagian.length + 1
    bagian.push({
      title: `▦ Semua Menu ${halaman}/${Math.ceil(baris.length / perBagian)}`,
      highlight_label: '',
      rows: potong,
    })
  }
  return bagian
}

/** Kumpulan tombol lengkap (maks 6, tombol pertama quick_reply). */
export function tombolMenu({ prefix = '.', kategori = [], judulMenu = 'Menu', judulSemua = 'Semua Menu' } = {}) {
  const populer = ['tools', 'maker', 'group']
    .map(key => (kategori || []).find(item => item.key === key))
    .filter(Boolean)

  const tombolCepat = (populer.length ? populer : kategori.slice(0, 3)).map(item => ({
    buttonText: { displayText: teks(`${ikonKategori(item.key)} ${namaKategori(item.key).toUpperCase()}`, 24) },
    buttonId: `${prefix}kategori ${item.key}`,
    type: 1,
  }))

  return [
    ...tombolCepat,
    {
      buttonText: { displayText: '☰ PILIH MENU' },
      buttonId: 'menu',
      type: 1,
      nativeFlowInfo: {
        name: 'single_select',
        // tombolKeNative hanya meneruskan paramsJson, jadi `title` inilah yang
        // tampil sebagai label tombol di WhatsApp.
        paramsJson: JSON.stringify({ title: '☰ PILIH MENU', sections: bagianMenuUtama({ prefix }) }),
      },
    },
    {
      buttonText: { displayText: '▦ SEMUA MENU' },
      buttonId: 'menu_semua',
      type: 1,
      nativeFlowInfo: {
        name: 'single_select',
        paramsJson: JSON.stringify({
          title: '▦ SEMUA MENU',
          sections: bagianSemuaMenu({ prefix, kategori }),
        }),
      },
    },
    { buttonText: { displayText: '👑 OWNER BOT' }, buttonId: `${prefix}owner`, type: 1 },
  ]
}

/**
 * Versi ringkas untuk cadangan: kalau WhatsApp menolak tombol lengkap,
 * coba lagi dengan satu daftar kecil (6 menu utama) — bukan langsung teks.
 */
export function tombolRingkas({ prefix = '.', judulMenu = 'Menu' } = {}) {
  return [
    { buttonText: { displayText: '👑 OWNER BOT' }, buttonId: `${prefix}owner`, type: 1 },
    {
      buttonText: { displayText: '☰ PILIH MENU' },
      buttonId: 'menu',
      type: 1,
      nativeFlowInfo: {
        name: 'single_select',
        paramsJson: JSON.stringify({ title: '☰ PILIH MENU', sections: bagianMenuUtama({ prefix }) }),
      },
    },
  ]
}

/** Total baris yang dibawa (dipakai uji & self-test). */
export function jumlahBaris(bagian = []) {
  return (bagian || []).reduce((n, b) => n + (b.rows || []).length, 0)
}

export default {
  namaKategori, ikonKategori, deskripsiKategori,
  bagianMenuUtama, bagianSemuaMenu, tombolMenu, tombolRingkas, jumlahBaris,
  IKON_KATEGORI, DESKRIPSI_KATEGORI, IKON_PILIHAN, DESKRIPSI_PILIHAN,
  MAKS_BARIS_PER_BAGIAN, MAKS_BAGIAN,
}
