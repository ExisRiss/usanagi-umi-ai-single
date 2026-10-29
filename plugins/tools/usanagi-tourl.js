/* By AlzRiss - Usanagi Umi AI
 *
 * Task155 — `.tourl` / `.upload`: media & berkas dari WhatsApp menjadi tautan
 * unduhan di server bot sendiri.
 *
 *   https://upload.gwenna.my.id/<id akun>/<nama berkas>
 *
 * Mendukung foto, video, audio, stiker, dokumen (zip, 7z, rar, apk, pdf, …).
 * Cara pakai: kirim/reply berkas lalu ketik `.tourl`, atau kirim berkas dengan
 * keterangan `.tourl`. Tanpa berkas → tutorial singkat.
 *
 * Catatan Task155: sebelumnya plugin ini mengunggah ke host pihak ketiga
 * (catbox, dll.) yang sering mati. Sekarang berkas disimpan di server bot dan
 * disajikan oleh API bot lewat host `upload.gwenna.my.id`.
 */

import {
  simpanBerkas,
  daftarFolder,
  hostUpload,
  batasUkuranUpload,
  idAkun,
  bacaKonfigUpload,
  layaniUpload,
  bersihkanLama,
} from '../../lib/upload-publik.js'
import { getMediaSource, downloadMediaBuffer, getMimeType, getFileName, react } from '../../lib/awang-media.js'
import { adaLampiran, unduhLampiran, namaBerkasLampiran, mimeLampiran, captionLampiran } from '../../lib/lampiran.js'

const TUTORIAL = [
  '📤 *TO URL — upload ke server bot*',
  '',
  '*Cara pakai*',
  '1. Kirim berkasnya (foto/video/dokumen), atau balas berkas yang sudah ada',
  '2. Ketik `.tourl`',
  '   atau kirim berkas dengan keterangan `.tourl`',
  '',
  '*Yang didukung*',
  '• foto & video (jpg, png, webp, mp4, webm …)',
  '• audio, stiker, voice note',
  '• dokumen: zip, 7z, rar, apk, pdf, txt, …',
  '',
  '*Hasil*',
  `https://${hostUpload()}/<id akun>/<nama berkas>`,
  '',
  '*Perintah lain*',
  '`.tourl list` — daftar berkas yang pernah kamu upload',
  '',
  `Batas ${Math.round(batasUkuranUpload() / 1024 / 1024)} MB per berkas · ` +
    `disimpan ${bacaKonfigUpload().simpanHari} hari.`,
].join('\n')

function ukuranTeks(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

/** Ambil buffer + nama + mime dari media langsung maupun kutipan. */
async function ambilBerkas(m, conn) {
  /* Jalur 1: helper media bot (foto/video/audio/stiker/dokumen). */
  try {
    const source = getMediaSource(m, ['image', 'video', 'audio', 'sticker', 'document'])
    if (source) {
      const buffer = await downloadMediaBuffer(source)
      if (buffer && buffer.length) {
        return {
          buffer,
          nama: getFileName(source, ''),
          mime: getMimeType(source, ''),
          tipe: source.type || '',
        }
      }
    }
  } catch (error) { /* lanjut ke jalur 2 */ }

  /* Jalur 2: modul lampiran (sudah terbukti untuk dokumen & berkas besar). */
  if (adaLampiran(m)) {
    const buffer = await unduhLampiran(conn, m).catch(() => null)
    if (buffer && buffer.length) {
      return {
        buffer,
        nama: namaBerkasLampiran(m) || '',
        mime: mimeLampiran(m) || '',
        tipe: m.mtype || '',
      }
    }
  }
  return null
}

const handler = async (m, extra = {}) => {
  const { conn, args = [], text = '', usedPrefix = '.' } = extra
  const perintah = usedPrefix || '.'

  /* Daftar berkas milik pengirim. */
  if (/^(list|daftar|mine)$/i.test(String(args[0] || '').trim())) {
    const id = idAkun(m.sender) || ''
    const daftar = id ? daftarFolder(id) : []
    if (!daftar.length) {
      return m.reply([
        `📂 Belum ada berkas atas nama kamu di ${hostUpload()}.`,
        '',
        `Kirim berkas lalu ketik *${perintah}tourl*.`,
      ].join('\n'))
    }
    const total = daftar.reduce((s, x) => s + Number(x.ukuran || 0), 0)
    const baris = daftar.slice(0, 20).map((x, i) => {
      const tanggal = new Date(x.waktu).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'short', timeStyle: 'short' })
      return `${i + 1}. ${x.nama}\n   ${ukuranTeks(x.ukuran)} · ${tanggal}\n   https://${hostUpload()}/${id}/${encodeURIComponent(x.nama)}`
    })
    if (daftar.length > 20) baris.push(`… dan ${daftar.length - 20} berkas lain.`)
    return m.reply([
      `📂 *BERKAS KAMU* (${daftar.length} · ${ukuranTeks(total)})`,
      '',
      ...baris,
      '',
      `Semua di folder: https://${hostUpload()}/${id}/`,
    ].join('\n'))
  }

  const berkas = await ambilBerkas(m, conn)
  if (!berkas) return m.reply(TUTORIAL)

  try { await react(conn, m, '⏳') } catch (error) { /* reaksi opsional */ }

  try {
    const hasil = simpanBerkas({
      buffer: berkas.buffer,
      nama: berkas.nama,
      mime: berkas.mime,
      jid: m.sender,
      tipe: berkas.tipe,
    })

    /* Bersihkan berkas kedaluwarsa sekali-sekali (murah, non-blokir). */
    setTimeout(() => { try { bersihkanLama() } catch (error) { /* abaikan */ } }, 3000)

    try { await react(conn, m, '✅') } catch (error) { /* abaikan */ }

    const baris = [
      '✅ *BERHASIL DIUPLOAD*',
      '',
      `🔗 ${hasil.url}`,
      '',
      `📦 ${hasil.nama}`,
      `📊 ${ukuranTeks(hasil.ukuran)} · ${String(hasil.mime).split(';')[0]}`,
      `🆔 Folder: ${hasil.id}`,
      '',
      'Tautan bisa dibuka siapa saja yang punya alamat ini.',
      `⬇️ Unduh langsung: ${hasil.urlUnduh}`,
      `📂 Semua berkasmu: ${hasil.daftarUrl}`,
    ]
    return m.reply(baris.join('\n'))
  } catch (error) {
    try { await react(conn, m, '❌') } catch (e) { /* abaikan */ }
    return m.reply(`❌ Upload gagal: ${error.message}`)
  }
}

handler.help = ['tourl', 'upload', 'tourl list']
handler.tags = ['tools', 'upload']
handler.category = 'tools'
handler.command = /^(tourl|tourl2|upload|catbox|url|to?url)$/i
handler.description = 'Ubah foto/video/dokumen (zip, 7z, apk, …) menjadi tautan unduhan di upload.gwenna.my.id'
handler.usage = '.tourl (kirim/reply berkas)'
handler.example = '.tourl'
handler.limit = false
handler.premiumOnly = false

export { layaniUpload, TUTORIAL }
export default handler
