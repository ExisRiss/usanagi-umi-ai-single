/* By AlzRiss - Usanagi Umi AI
 *
 * LABEL TOMBOL → AKSI MENU (Task127)
 *
 * Modul ini sengaja TANPA dependensi supaya bisa diuji langsung dan dipakai
 * dari mana saja (router, hook tombol, uji otomatis).
 *
 * Kenapa perlu: sebagian WhatsApp (terutama WA biasa, bukan Business) tidak
 * mengirim balik `id` tombol, melainkan LABEL yang terlihat pengguna — judul +
 * "\n" + deskripsi. Teks asli yang masuk ke bot dari owner:
 *
 *     All Menu
 *     seluruh perintah semua kategori, dibagi per halaman
 *
 *     Owner Menu
 *     perintah khusus owner: setelan, backup, kontrol bot
 *
 * Dulu teks itu tidak cocok regex perintah mana pun → bot diam. Sekarang label
 * dipetakan ke aksi menu yang sama dengan ID-nya.
 */

export const LABEL_AKSI = Object.freeze({
  'all menu': 'all',
  'owner menu': 'owner',
  'group menu': 'group',
  'grup menu': 'group',
  'game menu': 'game',
  'tools menu': 'tools',
  'tool menu': 'tools',
  'refresh status': 'refresh',
  'menu utama': 'back',
  'menu back': 'back',
  'pilih menu': 'back',
  'dashboard': 'dashboard',
})

const TAK_TERLIHAT = /[\u200e\u200f\u2060\ufeff\u00a0]/g

/**
 * Bersihkan label: buang karakter arah tak terlihat, emoji, dan ikon,
 * ambil baris pertama, rapikan spasi, kecilkan huruf.
 */
export function normalisasiLabel(value) {
  const teks = String(value == null ? '' : value).replace(TAK_TERLIHAT, ' ').trim()
  if (!teks) return ''
  const baris = teks.split(/\r?\n/)[0] || ''
  return baris
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * @param {string} value label tombol (boleh judul + deskripsi)
 * @returns {{action:string, page:number|null}|null}
 */
export function actionFromLabel(value) {
  const kunci = normalisasiLabel(value)
  if (!kunci) return null
  const aksi = LABEL_AKSI[kunci]
  return aksi ? { action: `menu_${aksi}`, page: null } : null
}

export default { actionFromLabel, normalisasiLabel, LABEL_AKSI }
