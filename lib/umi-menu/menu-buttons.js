/* By AlzRiss - Usanagi Umi AI
 *
 * ISI TOMBOL MENU (Task122)
 *
 * Owner minta daftar "📋 MENU UTAMA 1–6" di dalam pesan **dihapus total** dan
 * diganti tombol interaktif. Isi tombolnya dirakit di sini supaya:
 *   - bentuknya bisa diuji tanpa dependensi bot,
 *   - batas WhatsApp (maks 5 bagian, 10 baris) dijaga di satu tempat,
 *   - id tiap baris SELALU perintah ber-prefix (WhatsApp mengirim balik apa
 *     adanya, jadi tanpa prefix perintahnya tidak jalan).
 */

import { PILIHAN_BAWAAN } from './menu-text.js'

export const MAKS_BARIS = 10
export const MAKS_BAGIAN = 5
export const MAKS_KATEGORI = 4

const teks = (nilai, batas = 60) => String(nilai == null ? '' : nilai).slice(0, batas)

/**
 * Bagian untuk tombol `single_select`.
 *
 * @param {string} prefix          prefix aktif (mis. ".")
 * @param {object} opsi
 * @param {Array}  [opsi.kategori] [{ key, label, total }]
 * @param {number} [opsi.maksBaris]
 * @param {number} [opsi.maksKategori]
 * @returns {Array<{title:string, highlight_label:string, rows:Array}>}
 */
export function bagianMenu({ prefix = '.', kategori = [], maksBaris = MAKS_BARIS, maksKategori = MAKS_KATEGORI } = {}) {
  const bagian = []

  const menuUtama = PILIHAN_BAWAAN.slice(0, maksBaris).map(opsi => ({
    header: '▸',
    title: teks(opsi.label),
    description: teks(opsi.hint, 120),
    id: `${prefix}${opsi.command}`,
  }))
  if (menuUtama.length) {
    bagian.push({ title: 'Menu Utama', highlight_label: 'Rekomendasi', rows: menuUtama })
  }

  let sisa = maksBaris - menuUtama.length
  const barisKategori = (Array.isArray(kategori) ? kategori : [])
    .slice(0, Math.max(0, Math.min(maksKategori, sisa)))
    .map(item => ({
      header: '▦',
      title: teks(`${item.label || item.key}${item.total ? ` · ${item.total} fitur` : ''}`),
      description: teks(`Kumpulan fitur ${String(item.label || item.key || '').toLowerCase()}`, 120),
      id: `${prefix}kategori ${item.key}`,
    }))
  if (barisKategori.length) {
    bagian.push({ title: 'Kategori', highlight_label: '', rows: barisKategori })
  }

  return bagian.slice(0, MAKS_BAGIAN)
}

/** Tombol siap pakai (bentuk yang diterima ButtonV2.addRawButton). */
export function tombolMenu({ prefix = '.', kategori = [], judulMenu = 'Menu' } = {}) {
  return [
    { buttonText: { displayText: '♕ OWNER BOT' }, buttonId: `${prefix}owner`, type: 1 },
    {
      buttonText: { displayText: '☰ MENU' },
      buttonId: 'menu',
      type: 1,
      nativeFlowInfo: {
        name: 'single_select',
        paramsJson: JSON.stringify({
          title: teks(judulMenu),
          sections: bagianMenu({ prefix, kategori }),
        }),
      },
    },
  ]
}

/** Hitung total baris (dipakai uji & self-test). */
export function jumlahBaris(bagian = []) {
  return (bagian || []).reduce((n, b) => n + (b.rows || []).length, 0)
}

export default { bagianMenu, tombolMenu, jumlahBaris, MAKS_BARIS, MAKS_BAGIAN, MAKS_KATEGORI }
