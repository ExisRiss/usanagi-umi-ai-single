/* By AlzRiss - Usanagi Umi AI
 *
 * Task150 — MODE PRIVAT = BOT DIAM.
 *
 * Laporan owner (29-10-2026): "user udah setting bot nya private tapi bot masih
 * bales, harus bot diam kecuali kalau role owner, owner utama, developer yang
 * melakukan command".
 *
 * Kenapa dulu masih membalas — tiga kebocoran nyata, semuanya di `handler.js`:
 *
 *   1. Task147 menambahkan balasan ramah "🔒 Bot ini sedang mode privat" untuk
 *      pengguna yang ditolak. Balasan itu sendiri yang dikeluhkan.
 *   2. Petunjuk prefix (Task147) dikirim SEBELUM gerbang mode privat. Jadi
 *      orang yang mengetik `.menu` di sesi ber-prefix `/` dibalas walaupun
 *      botnya private.
 *   3. Notifikasi AFK (`handleAfkMessage`) juga berjalan sebelum gerbang.
 *
 * Aturan yang dipakai sekarang (satu tempat, mudah diuji):
 *
 *   private  → HANYA developer, owner utama, dan owner bot yang dilayani.
 *              Selain itu: proses berhenti TANPA satu pun balasan
 *              (tidak ada baca, tidak ada reaksi, tidak ada petunjuk).
 *   public   → semua dilayani seperti biasa.
 *
 * Catatan penting:
 *   • "diam" berarti benar-benar tidak ada `reply`/`sendMessage`. Petunjuk,
 *     emoji, dan pesan "bot sedang privat" DIHAPUS — itu permintaan owner.
 *   • daftar akses sesi (`.addakses`, Task132) TIDAK lagi membuka mode privat.
 *     Nomor yang perlu memakai bot saat private harus dijadikan owner
 *     (`.addowner`) — jadi kewenangannya jelas, bukan setengah-setengah.
 *   • `m.fromMe` (pesan dari akun bot sendiri) tetap dilayani: itu pemilik
 *     perangkat yang tertaut.
 *
 * Modul ini murni (tanpa I/O) supaya bisa diuji tanpa WhatsApp.
 */

/** Role yang boleh memakai bot saat mode privat. */
export const ROLE_DIIZINKAN = Object.freeze(['developer', 'ownerUtama', 'ownerBot'])

/**
 * Apakah sesi ini sedang mode privat?
 *
 * Sumber kebenaran sama seperti handler:
 *   - jadibot / bot utama yang setelannya dikelola website → `botConfig.public`
 *   - bot utama lama → `settings.public` di database
 *
 * @param {{ key?: string }} opsi `key` hanya untuk uji: 'public' | 'self' |
 *        'private' | undefined. Kalau diisi, nilai itu yang dipakai.
 */
export function apakahPrivat(botConfig = {}, settings = null, opsi = {}) {
  if (opsi.key !== undefined) {
    const kunci = String(opsi.key || '').toLowerCase()
    return kunci === 'self' || kunci === 'private' || kunci === 'private_only'
  }
  const tipe = String(botConfig && botConfig.type || '').toLowerCase()
  if (tipe === 'jadibot' || (botConfig && botConfig.managedSettings === true)) {
    return botConfig.public === false
  }
  if (settings && typeof settings === 'object' && 'public' in settings) return settings.public === false
  /* Tidak ada informasi setelan → anggap publik (perilaku lama). */
  return false
}

/**
 * Siapa yang masih dilayani saat mode privat.
 * @returns {{ dilayani: boolean, role: string, alasan: string }}
 */
export function putusanModePrivat({ privat = false, isDeveloper = false, isOwnerUtama = false, isOwnerBot = false, fromMe = false } = {}) {
  if (!privat) return { dilayani: true, role: 'semua', alasan: 'bot publik' }
  if (fromMe) return { dilayani: true, role: 'perangkat', alasan: 'pesan dari akun bot sendiri' }
  if (isDeveloper) return { dilayani: true, role: 'developer', alasan: 'developer terkunci' }
  if (isOwnerUtama) return { dilayani: true, role: 'ownerUtama', alasan: 'owner utama' }
  if (isOwnerBot) return { dilayani: true, role: 'ownerBot', alasan: 'owner bot ini' }
  return { dilayani: false, role: 'pengguna', alasan: 'mode privat: hanya developer, owner utama, dan owner bot' }
}

/**
 * Ambil tiga flag role dari objek handler.
 * `isOwner` di handler sudah mencakup owner bot + owner utama + developer,
 * tetapi dipisah lagi di sini supaya keputusannya bisa diaudit.
 */
export function roleDari({ isROwner = false, isOwnerUtama = false, isOwner = false } = {}) {
  return {
    isDeveloper: Boolean(isROwner),
    isOwnerUtama: Boolean(isOwnerUtama),
    isOwnerBot: Boolean(isOwner),
  }
}

/** Teks untuk log server (bukan untuk pengguna — bot tetap diam). */
export function catatanDiam(hasil, info = {}) {
  const siapa = String(info.sender || '').split('@')[0].replace(/\D/g, '') || '?'
  const chat = String(info.chat || '') || '?'
  return `[mode-privat] abaikan pesan dari ${siapa} di ${chat} (${hasil.alasan})`
}

export default { ROLE_DIIZINKAN, apakahPrivat, putusanModePrivat, roleDari, catatanDiam }
