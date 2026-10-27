/* By AlzRiss - Usanagi Umi AI
 *
 * PENJAGA ID CHAT (Task131)
 *
 * Kenapa ada berkas ini:
 * banyak plugin hasil porting dari bot lain memanggil seperti ini —
 *
 *     m.reply('teks', m)          // maksudnya: balas pesan ini
 *     conn.reply(m, 'teks')       // maksudnya: kirim ke chat pesan ini
 *     conn.sendFile(m, gambar, …)
 *
 * Padahal di Umi, argumen pertama/kedua fungsi-fungsi itu adalah **id chat**
 * berupa string ('628xx@s.whatsapp.net' atau '…@g.us'). Kalau yang masuk objek
 * pesan, baileys meledak dengan pesan yang bikin bingung:
 *
 *     TypeError: jid?.endsWith is not a function
 *         at isJidNewsletter (…/WABinary/jid-utils.js)
 *
 * Contoh nyata: `.tebakwarna` di grup (laporan owner 27/10) — plugin mengirim
 * `m.reply(teks, m)`, objek pesan dipakai sebagai tujuan kirim, pesan tidak
 * pernah sampai dan yang muncul justru error di pusat error.
 *
 * `jidTujuan()` mengambil id chat dari mana pun objek itu menyimpannya, dan
 * kalau tetap tidak ada, memakai cadangan (biasanya `this.chat`). Semua
 * pemanggilan yang tadinya benar tidak berubah perilakunya.
 */

/**
 * Ambil id chat yang sah dari sebuah nilai.
 * @param {unknown} nilai bisa string id, objek pesan, atau apa saja
 * @param {string|null} cadangan id chat pengganti kalau `nilai` tidak memuat id
 * @returns {string} id chat, atau '' kalau benar-benar tidak ada
 */
export function jidTujuan(nilai, cadangan = null) {
  if (typeof nilai === 'string') {
    const teks = nilai.trim()
    if (teks) return teks
  }

  if (nilai && typeof nilai === 'object') {
    const calon = [
      nilai.chat,
      nilai.jid,
      nilai.chatId,
      nilai.remoteJid,
      nilai.key && nilai.key.remoteJid,
      nilai.vM && nilai.vM.chat,
      nilai.vM && nilai.vM.key && nilai.vM.key.remoteJid,
    ]
    for (const c of calon) {
      if (typeof c === 'string' && c.trim()) return c.trim()
    }
  }

  if (typeof cadangan === 'string' && cadangan.trim()) return cadangan.trim()
  return ''
}

/**
 * Apakah sebuah nilai berbentuk "opsi kirim" (bukan objek pesan)?
 *
 * Plugin gaya lama kadang mengisi argumen `options` dengan objek `m`. Kalau
 * diteruskan apa adanya, isi objek pesan ikut tersebar ke dalam pesan keluar —
 * bahkan menimpa `text` dengan teks perintah aslinya.
 */
export function opsiKirim(nilai) {
  if (!nilai || typeof nilai !== 'object' || Array.isArray(nilai)) return undefined
  const tandaPesan = ['key', 'chat', 'sender', 'text', 'mtype', 'vM', 'quoted']
  for (const tanda of tandaPesan) {
    if (tanda in nilai) return undefined
  }
  return nilai
}

export default { jidTujuan, opsiKirim }
