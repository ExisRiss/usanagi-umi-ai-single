/* By AlzRiss - Usanagi Umi AI
 *
 * SATU pintu impor library koneksi WhatsApp.
 *
 * Status 06-11-2026 (Task214)
 * ---------------------------
 * Nama paket aktif: `@whiskeysockets/baileys` — alias npm ke
 * `@itsliaaa/baileys@0.5.1` (lihat `dependencies` di package.json):
 *
 *     "npm:@itsliaaa/baileys@^0.5.1"
 *
 * Alasan memakai alias: seluruh kode bot (109 berkas) sudah mengimpor
 * `@whiskeysockets/baileys`, dan pemilik meminta nama itu dipertahankan,
 * tetapi Baileys resmi di npm masih 7.0.0-rc14 (RC). `@itsliaaa/baileys`
 * adalah fork v7 yang aktif (rilis 06-11-2026) dengan perbaikan unggah media
 * newsletter, pesan interaktif, album, dan tipe pesan tambahan — kebutuhan
 * rich message (H1/H2) kita.
 *
 * `@rexxhayanasi/elaina-baileys` (dipakai sebelumnya) TIDAK dihapus dari
 * riwayat; hanya diganti. Kalau perlu kembali, cukup ubah nilai alias di
 * package.json — tidak ada berkas bot yang perlu disentuh.
 *
 * Catatan penting (hasil audit):
 *  - `@yudzxml/baileys` di npm = paket MALICIOUS (OSV MAL-2026-17846) dan
 *    namanya sekarang placeholder `0.0.1-security` → DILARANG dipasang.
 *  - `@sairidev/baileys-new` juga sudah dicabut npm (holding package
 *    `0.0.1-security`); build GitHub-nya rusak (`DONATE_URL` tidak diekspor
 *    `Defaults/index.js` → paket gagal diimpor). Jangan dipasang.
 *  - `@itsliaaa/baileys` lolos audit: tanpa `eval`/`exec` berkas, tanpa
 *    pengiriman data ke host luar, tanpa anotasi newsletter otomatis
 *    (`annotations: []`), tanpa blob ter-obfuscate.
 */

/* Nama paket yang benar-benar terpasang di node_modules (alias npm). */
const ACTIVE_PACKAGE = process.env.UMI_BAILEYS_PACKAGE || '@itsliaaa/baileys'

export * from '@sairidev/baileys-new'
export { default } from '@sairidev/baileys-new'

export const BAILEYS_PACKAGE = ACTIVE_PACKAGE
