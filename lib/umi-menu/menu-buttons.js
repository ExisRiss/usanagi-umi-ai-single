/* By AlzRiss - Usanagi Umi AI
 *
 * ISI TOMBOL MENU (Task122, diperluas Task123)
 *
 * Owner minta daftar "📋 MENU UTAMA 1–6" di dalam pesan dihapus dan diganti
 * tombol interaktif, lalu tombolnya DILENGKAPI: tools, maker, group, dan
 * semua menu lain.
 *
 * Bentuk tombol (urutan penting — WhatsApp Web memakai batas 10 tombol hanya
 * kalau tombol pertama `quick_reply`, selain itu 3; lihat Utils/native-flow.js
 * di library):
 *   [🛠 TOOLS] [🎨 MAKER] [👥 GROUP]  → quick_reply langsung ke kategorinya
 *   [☰ MENU]                          → single_select: 6 menu utama
 *   [▦ SEMUA MENU]                    → single_select: SEMUA kategori, dibagi
 *                                       per bagian (maks 10 baris/bagian)
 *
 * Semua id baris WAJIB ber-prefix: WhatsApp mengirim balik id apa adanya.
 */

import { PILIHAN_BAWAAN } from './menu-text.js'

export const MAKS_BARIS_PER_BAGIAN = 10
export const MAKS_BAGIAN = 10

const teks = (nilai, batas = 60) => String(nilai == null ? '' : nilai).slice(0, batas)

/** Label kategori → "Tools", "Maker", "Game Html", dst. */
export function namaKategori(key) {
  return String(key || '')
    .split(/[-_]/)
    .map(kata => (kata.length > 1 ? kata.charAt(0).toUpperCase() + kata.slice(1) : kata.toUpperCase()))
    .join(' ')
}

/** Satu bagian berisi 6 menu utama (All/Owner/Group/Game/Tools/Refresh). */
export function bagianMenuUtama({ prefix = '.' } = {}) {
  return [{
    title: 'Menu Utama',
    highlight_label: 'Rekomendasi',
    rows: PILIHAN_BAWAAN.map(opsi => ({
      header: '▸',
      title: teks(opsi.label),
      description: teks(opsi.hint, 120),
      id: `${prefix}${opsi.command}`,
    })),
  }]
}

/**
 * Semua kategori dijadikan baris, dibagi menjadi beberapa bagian
 * (maks 10 baris per bagian supaya tidak ditolak WhatsApp).
 */
export function bagianSemuaMenu({ prefix = '.', kategori = [], perBagian = MAKS_BARIS_PER_BAGIAN, maksBagian = MAKS_BAGIAN } = {}) {
  const baris = (Array.isArray(kategori) ? kategori : [])
    .filter(item => item && item.key)
    .map(item => ({
      header: '▦',
      title: teks(`Menu ${namaKategori(item.key)}${item.total ? ` · ${item.total}` : ''}`),
      description: teks(`Buka daftar perintah ${namaKategori(item.key).toLowerCase()}`, 120),
      id: `${prefix}kategori ${item.key}`,
    }))

  const bagian = []
  for (let i = 0; i < baris.length && bagian.length < maksBagian; i += perBagian) {
    const potong = baris.slice(i, i + perBagian)
    const halaman = bagian.length + 1
    bagian.push({
      title: `Semua Menu ${halaman}/${Math.ceil(baris.length / perBagian)}`,
      highlight_label: '',
      rows: potong,
    })
  }
  return bagian
}

/** Kumpulan tombol lengkap (maks 5). */
export function tombolMenu({ prefix = '.', kategori = [], judulMenu = 'Menu', judulSemua = 'Semua Menu' } = {}) {
  const populer = ['tools', 'maker', 'group']
    .map(key => {
      const ada = (kategori || []).find(item => item.key === key)
      return ada ? ada : null
    })
    .filter(Boolean)

  const tombolCepat = (populer.length ? populer : kategori.slice(0, 3)).map(item => ({
    buttonText: { displayText: `▸ ${namaKategori(item.key).toUpperCase()}`.slice(0, 20) },
    buttonId: `${prefix}kategori ${item.key}`,
    type: 1,
  }))

  return [
    ...tombolCepat,
    {
      buttonText: { displayText: '☰ MENU' },
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
    { buttonText: { displayText: '♕ OWNER BOT' }, buttonId: `${prefix}owner`, type: 1 },
  ]
}

/**
 * Versi ringkas untuk cadangan: kalau WhatsApp menolak tombol lengkap,
 * coba lagi dengan satu daftar kecil (6 menu utama) — bukan langsung teks.
 */
export function tombolRingkas({ prefix = '.', judulMenu = 'Menu' } = {}) {
  return [
    { buttonText: { displayText: '♕ OWNER BOT' }, buttonId: `${prefix}owner`, type: 1 },
    {
      buttonText: { displayText: '☰ MENU' },
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
  namaKategori, bagianMenuUtama, bagianSemuaMenu, tombolMenu, tombolRingkas, jumlahBaris,
  MAKS_BARIS_PER_BAGIAN, MAKS_BAGIAN,
}
