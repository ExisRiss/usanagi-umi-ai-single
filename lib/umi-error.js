/* By AlzRiss - Usanagi Umi AI
 *
 * Pesan error untuk PENGGUNA.
 *
 * Sebelum ini, handler mengirim `format(e)` mentah ke chat sehingga yang
 * muncul di WhatsApp adalah "Error: forbidden", "ENOSPC", atau
 * "API HTTP 401 Unauthorized: Invalid token". Pengguna tidak bisa berbuat
 * apa-apa dengan teks itu, dan pemilik bot jadi sulit tahu masalah aslinya.
 *
 * Modul ini hanya mengubah TEKS yang dikirim ke pengguna. Detail teknis
 * tetap dicetak ke log dan tetap dikirim ke owner (recordError), jadi tidak
 * ada informasi yang hilang untuk penelusuran.
 */

const POLA = [
  {
    nama: 'disk-penuh',
    uji: (pesan, kode) => kode === 'ENOSPC' || /ENOSPC|no space left on device/i.test(pesan),
    teks: '💾 *Ruang penyimpanan server penuh.*\n\nFitur yang butuh menyimpan berkas (unduh video/audio, simpan media) sedang tidak bisa dipakai. Data obrolan tetap aman. Owner sudah menerima detailnya — coba lagi setelah ruang dibersihkan.',
  },
  {
    nama: 'grup-terlarang',
    uji: (pesan, kode) => kode === 'GROUP_FORBIDDEN' || /forbidden|\b403\b/i.test(pesan),
    teks: '🔒 *Bot tidak bisa mengakses grup ini (403).*\n\nBiasanya karena bot sudah dikeluarkan, atau nomor bot kena batas dari WhatsApp. Cek lagi apakah bot masih ada di grup ini, lalu ulangi.',
  },
  {
    nama: 'grup-tidak-ada',
    uji: (pesan, kode) => kode === 'GROUP_NOT_FOUND' || /item-?not-?found|\b404\b/i.test(pesan),
    teks: '🔎 *Grup atau data yang dituju tidak ditemukan.*\n\nBisa jadi grupnya sudah dibubarkan, atau bot belum pernah bergabung. Coba `.listgroup`/`.swgroup list` untuk melihat daftar grup yang benar.',
  },
  {
    nama: 'api-401',
    uji: (pesan) => /\b401\b|invalid token|unauthorized|api key/i.test(pesan),
    teks: '🔑 *Layanan pihak ketiga menolak kunci API bot (401).*\n\nFitur ini butuh kunci API yang valid di server. Owner sudah menerima detailnya; fitur lain tetap bisa dipakai.',
  },
  {
    nama: 'youtube-blokir',
    uji: (pesan) => /not a bot|sign in to confirm|confirm you.{0,3}re not a bot/i.test(pesan),
    teks: '🤖 *YouTube menolak unduhan dari server ini.*\n\nYouTube kadang memblokir server tanpa login. Coba lagi beberapa menit lagi, atau minta owner memasang cookie YouTube di server.',
  },
  {
    nama: 'berkas-hilang',
    uji: (pesan, kode) => kode === 'ENOENT' || /ENOENT|no such file or directory/i.test(pesan),
    teks: '📁 *Berkas yang dibutuhkan tidak ada di server.*\n\nBiasanya aset atau sesi yang terhapus. Owner sudah menerima detailnya.',
  },
]

/** Kembalikan { text, kind } untuk ditampilkan ke pengguna. */
export function describeError(error) {
  const pesan = String(error?.message || error || '')
  const kode = String(error?.code || '')
  for (const pola of POLA) {
    let cocok = false
    try { cocok = Boolean(pola.uji(pesan, kode)) } catch { cocok = false }
    if (cocok) return { kind: pola.nama, text: pola.teks }
  }
  return { kind: 'lain', text: null }
}

/** Teks siap kirim: pesan ramah bila dikenali, selain itu format lama. */
export function errorReplyText(error, formatError) {
  const hasil = describeError(error)
  if (hasil.text) return hasil.text
  try {
    return typeof formatError === 'function' ? formatError(error) : String(error?.message || error)
  } catch {
    return String(error?.message || error)
  }
}

export default { describeError, errorReplyText }
