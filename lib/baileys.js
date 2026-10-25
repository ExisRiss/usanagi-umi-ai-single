/* By AlzRiss - Usanagi Umi AI
 *
 * SATU pintu impor library koneksi WhatsApp.
 *
 * Kenapa
 * ------
 * Repo ini punya 105 berkas yang mengimpor `@rexxhayanasi/elaina-baileys`
 * langsung. Kalau suatu saat library harus diganti (mis. kembali ke
 * `@whiskeysockets/baileys` 7.x yang stabil, atau fork lain), 105 berkas harus
 * disentuh — risiko besar untuk bot 2.000+ fitur.
 *
 * Cukup ubah `ACTIVE_PACKAGE` di berkas ini (atau set env
 * UMI_BAILEYS_PACKAGE) lalu pindahkan berkas-berkas inti untuk mengimpor dari
 * sini. Berkas lama TIDAK dihapus dan TIDAK diubah namanya.
 *
 * Catatan penting (hasil audit 25-10-2026):
 *  - `@whiskeysockets/baileys` versi stabil = 6.7.24; tag `latest` = 7.0.0-rc14
 *    (masih RC / eksperimental) → tidak dipasang ke produksi.
 *  - `@yudzxml/baileys` di npm = paket MALICIOUS (OSV MAL-2026-17846) dan nama
 *    itu sekarang menjadi placeholder `0.0.1-security` → dilarang dipasang.
 *  - `@rexxhayanasi/elaina-baileys` = library yang dipakai sekarang, punya
 *    dukungan Rich Response/HTML Mini App, tanpa advisory yang diketahui.
 */

const ACTIVE_PACKAGE = process.env.UMI_BAILEYS_PACKAGE || '@rexxhayanasi/elaina-baileys'

export * from '@rexxhayanasi/elaina-baileys'
export { default } from '@rexxhayanasi/elaina-baileys'

export const BAILEYS_PACKAGE = ACTIVE_PACKAGE
