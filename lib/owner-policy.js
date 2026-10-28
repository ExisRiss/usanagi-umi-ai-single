/* By AlzRiss - Usanagi Umi AI
 *
 * Kebijakan akses owner untuk sesi Jadibot (bot milik user).
 *
 * Aturan (Task124 — berlaku SAMA untuk bot utama dan Jadibot):
 *   - Owner platform/developer (rowner) selalu boleh semua fitur.
 *   - OWNER BOT — yaitu nomor yang diisi pemilik bot di setelan bot (website
 *     Jadibot `owner_number` maupun setelan bot utama) — memakai SELURUH fitur
 *     bot miliknya, termasuk perintah bertanda `rowner` seperti .addowner,
 *     .addstok, .setpp, .selfthisgc.
 *   - Pengecualian: fitur yang menyentuh website/platform atau data lintas akun
 *     (satu daftar di PLATFORM_ONLY_PLUGINS). Daftar ini sumber kebenaran
 *     tunggal; plugin baru otomatis terbuka untuk owner bot.
 */

/** nama berkas plugin -> alasan dikunci untuk owner Jadibot */
export const PLATFORM_ONLY_PLUGINS = new Map([
  // Website / game (harga saham, deploy, katalog plugin)
  ['usanagi-boost.js', 'menaikkan harga saham di website trading'],
  ['usanagi-jadibotconfig.js', 'mengubah konfigurasi sesi Jadibot lain di platform'],
  ['owner-gp.js', 'mengambil plugin dari katalog website'],
  ['owner-addplugin.js', 'memasang plugin baru ke seluruh bot'],

  // Data lintas akun / global
  ['umi-dellalluser.js', 'menghapus seluruh user platform'],
  ['umi-delpremall.js', 'menghapus status premium semua member'],
  ['usanagi-delowner.js', 'menghapus owner tambahan di database platform'],
  ['umi-gantiapi.js', 'mengganti API key global'],
  ['umi-bcgc.js', 'broadcast ke semua grup'],
  ['umi-swgcv2all.js', 'status ke semua grup'],
  ['umi-public.js', 'mode public/self global'],
  ['umi-modesewa.js', 'mode sewa platform'],
  ['umi-sistemenergi.js', 'aturan energi global'],
  ['umi-setallmenu.js', 'varian allmenu global'],
  ['self.js', 'mode public/self global'],

  /* Task147 — dua perintah ini menyentuh SELURUH server (semua sesi Jadibot
   * ikut mati saat restart), jadi tidak boleh dijalankan pemilik sesi. */
  ['restart.js', 'me-restart seluruh server (semua sesi ikut mati)'],
  ['autorestart.js', 'mengubah perilaku restart global auto update'],
])

/** Ambil nama berkas saja, tanpa folder. */
export function pluginFileName(name = '') {
  return String(name || '').replace(/\\/g, '/').split('/').pop().toLowerCase()
}

export function isPlatformOnlyPlugin(name = '') {
  return PLATFORM_ONLY_PLUGINS.has(pluginFileName(name))
}

export function platformOnlyReason(name = '') {
  return PLATFORM_ONLY_PLUGINS.get(pluginFileName(name)) || ''
}

/**
 * Boleh tidak sebuah plugin ber-gate `rowner` dipakai?
 *
 * Task124: syarat `isJadibot` DIHAPUS. Dulu hanya owner sesi Jadibot yang
 * dibukakan perintah rowner, sehingga pemilik bot UTAMA yang nomornya diisi
 * lewat setelan website tertahan di pesan "khusus developer". Sekarang siapa
 * pun yang sah menjadi owner bot (owner bot utama maupun owner Jadibot)
 * mendapat akses penuh ke fitur bot miliknya, kecuali PLATFORM_ONLY_PLUGINS.
 *
 * @param {string} name nama berkas plugin
 * @param {{isROwner?: boolean, isOwner?: boolean, isJadibot?: boolean}} ctx
 *        `isJadibot` masih diterima demi kecocokan pemanggil lama, tidak dipakai.
 */
export function canUseOwnerPlugin(name, { isROwner = false, isOwner = false, botUtama = false } = {}) {
  if (isROwner) return true
  if (!isOwner) return false
  /* Owner BOT UTAMA = pemilik deployment ini (nomornya diisi lewat konsol/
   * website miliknya sendiri), jadi ia berhak atas seluruh fitur — termasuk
   * yang menyentuh platform. Owner JADIBOT tetap dibatasi: sesi itu menumpang
   * di platform orang lain, sehingga .dellalluser / .gantiapi / .addplugin
   * akan merusak data lintas akun. */
  if (botUtama) return true
  return !isPlatformOnlyPlugin(name)
}

/**
 * Keputusan lengkap untuk satu plugin: boleh atau tidak, plus alasannya.
 * Dipakai handler dan self-test supaya keduanya memakai aturan yang sama.
 * @returns {{allowed: boolean, reason: string}}
 */
export function ownerPluginAccess(name, { isROwner = false, isOwner = false, botUtama = false } = {}) {
  if (!isOwner && !isROwner) return { allowed: false, reason: 'bukan owner bot' }
  if (isROwner) return { allowed: true, reason: 'owner platform' }
  if (botUtama) return { allowed: true, reason: 'owner bot utama' }
  if (isPlatformOnlyPlugin(name)) {
    return { allowed: false, reason: platformOnlyReason(name) || 'fitur platform' }
  }
  return { allowed: true, reason: 'owner bot' }
}
