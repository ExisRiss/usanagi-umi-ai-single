/* By AlzRiss - Usanagi Umi AI
 *
 * Task146 — CINEMATIC TYPOGRAPHY VIDEO EDITOR · perintah WhatsApp
 *
 * Fitur ini nyata: media diunduh, diperiksa ffprobe, dirender ffmpeg, hasilnya
 * dikirim balik sebagai MP4. Tidak ada tombol atau menu hiasan.
 *
 * Perintah:
 *   .edit                        panduan + status sesi
 *   .edit mulai                  kosongkan sesi (mulai dari nol)
 *   .edit template [nama]        tanpa nama: daftar; pakai nama: pilih
 *   .edit judul <teks>
 *   .edit sub <teks>
 *   .edit meta <teks>            teks kecil (lokasi/tanggal/koordinat)
 *   .edit logo                   pakai gambar PNG yang sedang dibalas
 *   .edit tanpa logo
 *   .edit durasi <detik>
 *   .edit slow <0.4-1>           slow motion (1 = normal)
 *   .edit kualitas <rendah|sedang|tinggi>
 *   .edit render                 render sekarang
 *   .edit batal                  batalkan + hapus berkas sementara
 *
 * Kirim media tanpa perintah juga boleh: kalau ada sesi berjalan, media
 * otomatis ditambahkan. Foto/video pertama = media utama (penentu ukuran).
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  getMediaSource,
  downloadMediaBuffer,
  getMimeType,
  getFileName,
  getExtensionFromMime,
} from '../../lib/awang-media.js'
import { KONFIG } from '../../lib/video-editor/config.js'
import { menuTemplate, ambilTemplate } from '../../lib/video-editor/templates.js'
import { periksaMedia, cekFfmpeg, folderSementara } from '../../lib/video-editor/probe.js'
import { renderVideo } from '../../lib/video-editor/render.js'
import { fontSemua } from '../../lib/video-editor/fonts.js'
import { validasiMedia, tebakJenis, namaAman, templateSah, logoSah, teksAman } from '../../lib/video-editor/validation.js'
import {
  ambilSesi, batalkanSesi, hapusFolder, antrekan, statusAntrean, batalkanAntrean,
} from '../../lib/video-editor/session.js'

const FOOT = '\n\n> ~ *ᴜᴍɪ ᴜꜱᴀɴᴀɢɪ ᴀɪ* 🌸'
const MAX = KONFIG

const rp = (angka) => `${(Number(angka) / 1048576).toFixed(1)} MB`

function panduan(prefix = '.') {
  return [
    '🎬 *CINEMATIC TYPOGRAPHY VIDEO EDITOR*',
    '',
    '*Cara pakai*',
    `1. Kirim video atau foto (boleh dibalas juga).`,
    `2. ${prefix}edit template nature — pilih gaya`,
    `3. ${prefix}edit judul NATURE`,
    `4. ${prefix}edit sub Mountain Prau`,
    `5. ${prefix}edit meta DIENG · 28 OKT 2026`,
    `6. ${prefix}edit render`,
    '',
    '*Perintah lain*',
    `${prefix}edit — panduan + status sesi`,
    `${prefix}edit mulai — mulai sesi baru`,
    `${prefix}edit batal — batalkan & hapus berkas`,
    `${prefix}edit logo — pakai PNG yang dibalas`,
    `${prefix}edit durasi 15 — panjang hasil (detik)`,
    `${prefix}edit slow 0.6 — slow motion`,
    `${prefix}edit kualitas tinggi — rendah/sedang/tinggi`,
    '',
    '*Template*',
    ...menuTemplate().map((t) => `${prefix}edit template ${t.id} — ${t.nama.replace(/^\S+\s/, '')}`),
    '',
    '*Yang dijaga otomatis*',
    `• Ukuran & rasio hasil = media utama (tidak dipaksa 9:16/16:9)`,
    `• Rotasi HP diikuti, foto tidak diregangkan`,
    `• Batas ${MAX.maksMedia} media, ${rp(MAX.maksInputBytes)}/berkas, ${MAX.maksDurasi} detik`,
    `• Berkas sementara dihapus setelah selesai`,
  ].join('\n') + FOOT
}

function ringkasSesi(s, prefix = '.') {
  if (!s || !s.media.length) {
    return ['📭 *Belum ada media di sesi ini.*', '', `Kirim video/foto lalu ketik ${prefix}edit untuk melihat pilihan.`].join('\n')
  }
  const utama = s.media[0]
  const baris = [
    '🎬 *SESI VIDEO EDITOR*',
    '',
    `Media   : ${s.media.length}/${MAX.maksMedia}`,
    `Utama   : ${utama.jenis} ${utama.lebar}x${utama.tinggi} (${utama.orientasi})`,
    utama.durasi ? `Durasi  : ${utama.durasi.toFixed(1)} detik` : '',
    utama.punyaAudio ? 'Audio   : ada (dipertahankan)' : 'Audio   : tidak ada (kanvas sunyi)',
    `Template: ${s.template || '— belum dipilih'}`,
    `Judul   : ${s.judul || '—'}`,
    `Subjudul: ${s.subjudul || '—'}`,
    `Meta    : ${s.meta || '—'}`,
    `Logo    : ${s.logo ? 'dipakai' : 'tidak'}`,
    `Durasi hasil: ${s.durasi || (utama.jenis === 'foto' ? MAX.durasiFoto : Math.min(utama.durasi || MAX.maksDurasi, MAX.maksDurasi))} detik`,
    `Slow    : ${s.slowmo}x`,
    `Kualitas: ${s.kualitas}`,
  ].filter(Boolean)
  if (s.media.length > 1) {
    baris.push('', '*Media tambahan*', ...s.media.slice(1).map((m, i) => `${i + 2}. ${m.jenis} ${m.lebar}x${m.tinggi}`))
  }
  baris.push('')
  if (!s.template) baris.push(`➡️ Pilih gaya dulu: ${prefix}edit template`)
  else if (s.tahap !== 'siap') baris.push(`➡️ Lengkapi info, lalu ${prefix}edit render`)
  else baris.push(`➡️ Siap: ${prefix}edit render`)
  return baris.join('\n') + FOOT
}

function perbaruiTahap(s) {
  s.tahap = s.media.length && s.template ? 'siap' : s.media.length ? 'tanpa-template' : 'awal'
}

/** Unduh media dari pesan (langsung atau balasan) ke folder sesi. */
async function simpanMedia(conn, m, s) {
  const sumber = getMediaSource(m, ['image', 'video', 'document'])
  if (!sumber) return { ok: false, galat: '' }
  const tipe = sumber.type
  const mime = getMimeType(sumber, tipe === 'image' ? 'image/jpeg' : 'video/mp4')
  const namaAsli = getFileName(sumber, `${tipe}-${Date.now()}`)
  const jenis = tebakJenis(mime, namaAsli)
  const info = sumber.message || {}
  const ukuranKlaim = Number(info.fileLength || info.fileEncSha256?.length || 0) || 0

  const cek = validasiMedia({ mime, nama: namaAsli, ukuran: ukuranKlaim, sudah: s.media.length })
  if (!cek.ok) return { ok: false, galat: cek.galat }
  if (tipe === 'document' && !jenis) {
    return { ok: false, galat: 'Dokumen ini bukan video/foto yang didukung.' }
  }

  const folder = folderSementara('edit')
  let buffer
  try {
    buffer = await downloadMediaBuffer(sumber)
  } catch (e) {
    hapusFolder(folder)
    return { ok: false, galat: 'Gagal mengunduh media dari WhatsApp.' }
  }
  if (buffer.length > MAX.maksInputBytes) {
    hapusFolder(folder)
    return { ok: false, galat: `Berkas ${rp(buffer.length)} melebihi batas ${rp(MAX.maksInputBytes)}.` }
  }

  const ekstensi = getExtensionFromMime(mime) || (jenis === 'foto' ? 'jpg' : 'mp4')
  const berkas = path.join(folder, namaAman(`media-${s.media.length + 1}.${ekstensi}`))
  fs.writeFileSync(berkas, buffer)

  const meta = await periksaMedia(berkas, { jenisPetunjuk: jenis })
  if (!meta.ok) {
    hapusFolder(folder)
    return { ok: false, galat: meta.galat || 'Media tidak bisa dibaca.' }
  }
  if (meta.jenis === 'video' && meta.durasi > MAX.maksDurasi + 0.5) {
    hapusFolder(folder)
    return { ok: false, galat: `Durasi ${meta.durasi.toFixed(0)} detik melebihi batas ${MAX.maksDurasi} detik.` }
  }
  if (meta.jenis === 'video' && (!meta.fps || meta.fps < 5)) {
    /* fps aneh (VFR ekstrem / metadata rusak) — masih bisa, tapi dicatat. */
    meta.catatan = 'frame rate tidak lazim'
  }

  meta.folder = folder
  meta.ukuranBerkas = buffer.length
  s.media.push(meta)
  s.diperbarui = Date.now()
  perbaruiTahap(s)
  return { ok: true, meta }
}

function ringkasMediaBaru(meta) {
  const baris = [
    `✅ *Media ${meta.urutan || ''} diterima*`,
    '',
    `${meta.jenis === 'foto' ? '🖼️ Foto' : '🎬 Video'} ${meta.lebar}x${meta.tinggi} (${meta.orientasi})`,
    meta.durasi ? `Durasi : ${meta.durasi.toFixed(1)} detik` : '',
    meta.rotasi ? `Rotasi : ${meta.rotasi}° (diikuti)` : '',
    meta.fps ? `FPS    : ${meta.fps}` : '',
    `Audio  : ${meta.punyaAudio ? 'ada' : 'tidak ada'}`,
    `Ukuran : ${rp(meta.ukuranBerkas || meta.ukuran)}`,
  ].filter(Boolean)
  return baris.join('\n')
}

/* ── render ─────────────────────────────────────────────────────────────── */

async function jalankanRender(m, conn, s) {
  const template = ambilTemplate(s.template)
  if (!template) return m.reply(`Pilih template dulu: .edit template${FOOT}`)
  if (!s.media.length) return m.reply(`Kirim video/foto dulu.${FOOT}`)

  const antrean = statusAntrean()
  await m.reply([
    '🎬 *RENDERING DIMULAI*',
    '',
    `Template : ${template.nama}`,
    `Kanvas   : ${s.media[0].lebar}x${s.media[0].tinggi} (${s.media[0].orientasi})`,
    `Durasi   : ${s.media[0].jenis === 'foto' ? (s.durasi || MAX.durasiFoto) : (s.durasi || Math.min(Math.round(s.media[0].durasi || MAX.maksDurasi), MAX.maksDurasi))} detik`,
    `Antrean  : ${antrean.berjalan} berjalan, ${antrean.menunggu} menunggu`,
    '',
    '_Proses 10-60 detik tergantung panjang video & beban server._',
  ].filter(Boolean).join('\n'))

  s.status = 'render'
  const kunci = s.kunci
  const hasil = await antrekan({
    nama: `edit-${s.id}`,
    kunci,
    tugas: async (info) => {
      const folder = folderSementara('render')
      try {
        const keluaran = await renderVideo({
          media: s.media,
          template,
          folder,
          judul: s.judul || '',
          subjudul: s.subjudul || '',
          meta: s.meta || '',
          logo: s.logo,
          durasi: s.durasi,
          kualitas: s.kualitas,
          slowmo: s.slowmo,
          onTahap: () => {},
        })
        keluaran.folder = folder
        keluaran.info.antrean = info
        return keluaran
      } catch (e) {
        hapusFolder(folder)
        throw e
      }
    },
  }).catch((e) => ({ galat: e }))

  s.status = 'kosong'
  s.diperbarui = Date.now()

  if (hasil?.galat) {
    const pesan = hasil.galat.kode === 'TIMEOUT'
      ? '⏱️ Rendering melebihi batas waktu. Coba durasi lebih pendek atau kualitas rendah.'
      : hasil.galat.kode === 'ANTREAN_PENUH'
        ? '🚦 Antrean rendering penuh. Coba lagi beberapa saat.'
        : `❌ Rendering gagal.\n\n${String(hasil.galat.message || hasil.galat).slice(0, 300)}`
    return m.reply(pesan + FOOT)
  }

  if (hasil.ukuran > MAX.maksOutputBytes) {
    hapusFolder(hasil.folder)
    return m.reply(`❌ Hasil ${rp(hasil.ukuran)} melebihi batas kirim ${rp(MAX.maksOutputBytes)}.\n\nCoba durasi lebih pendek atau kualitas rendah.${FOOT}`)
  }

  let caption = [
    '🎬 *CINEMATIC TYPOGRAPHY*',
    '',
    `Template : ${template.nama}`,
    `Ukuran   : ${hasil.info?.lebar || hasil.diminta.W}x${hasil.info?.tinggi || hasil.diminta.H}`,
    `Durasi   : ${(hasil.info?.durasi || hasil.diminta.durasi).toFixed(1)} detik`,
    `Audio    : ${hasil.audioSumber ? 'audio asli dipertahankan' : 'tanpa audio (sumber tidak punya audio)'}`,
    `Ukuran file : ${rp(hasil.ukuran)}`,
    hasil.catatan?.length ? `Catatan : ${hasil.catatan.join('; ')}` : '',
    '',
    `_Render ${hasil.detik} detik._`,
  ].filter(Boolean).join('\n') + FOOT

  try {
    const buffer = fs.readFileSync(hasil.berkas)
    await conn.sendMessage(m.chat, {
      video: buffer,
      mimetype: 'video/mp4',
      fileName: `usanagi-cinematic-${Date.now()}.mp4`,
      caption,
    }, { quoted: m })
  } catch (e) {
    console.error('[video-editor] gagal kirim:', e?.message || e)
    await m.reply('❌ Video sudah dirender tetapi gagal dikirim ke WhatsApp. Coba lagi.')
    caption = ''
  } finally {
    hapusFolder(hasil.folder)
  }
  return true
}

/* ── handler utama ──────────────────────────────────────────────────────── */

let handler = async (m, { conn, text = '', usedPrefix = '.', command = 'edit', isROwner }) => {
  if (!MAX.aktif) return m.reply('🎬 Video editor dimatikan owner (VIDEO_EDITOR_ENABLED=0).')

  const prefix = usedPrefix || '.'
  const arg = String(text || '').trim()
  const bagian = arg.split(/\s+/)
  const sub = (bagian[0] || '').toLowerCase()
  const sisa = arg.slice(bagian[0] ? bagian[0].length : 0).trim()

  /* Sesi khusus chat + pengirim ini. */
  const s = ambilSesi(m.chat, m.sender, { buat: ['', 'mulai', 'template', 'judul', 'sub', 'meta', 'render', 'logo', 'tanpa', 'durasi', 'slow', 'kualitas'].includes(sub) })

  const periksaFfmpeg = () => {
    const c = cekFfmpeg()
    if (!c.ok) {
      m.reply(`❌ FFmpeg tidak bisa dijalankan di server ini.\n\n${String(c.pesan).slice(0, 200)}`)
      return false
    }
    return true
  }

  try {
    /* ── tanpa argumen: panduan / status ── */
    if (!sub || sub === 'help' || sub === 'menu') {
      if (s && s.media.length) return m.reply(ringkasSesi(s, prefix))
      return m.reply(panduan(prefix))
    }

    /* ── mulai / batal ── */
    if (sub === 'mulai' || sub === 'baru' || sub === 'reset') {
      if (s && s.media.length) batalkanSesi(m.chat, m.sender)
      ambilSesi(m.chat, m.sender, { buat: true })
      return m.reply(`🆕 Sesi baru siap.\n\nKirim video atau foto, lalu ${prefix}edit template${FOOT}`)
    }

    if (sub === 'batal' || sub === 'cancel') {
      const jumlahAntrean = batalkanAntrean(s?.kunci || '')
      batalkanSesi(m.chat, m.sender)
      return m.reply(`🗑️ Sesi dibatalkan dan berkas sementara dihapus.${jumlahAntrean ? `\n${jumlahAntrean} rendering di antrean ikut dibatalkan.` : ''}${FOOT}`)
    }

    /* ── template ── */
    if (sub === 'template' || sub === 'gaya' || sub === 'tpl') {
      const nama = sisa.toLowerCase().replace(/[^a-z]/g, '')
      if (!nama) {
        const daftar = menuTemplate().map((t) => `${prefix}edit template ${t.id} — ${t.nama}\n   _${t.deskripsi}_`)
        return m.reply(['🎬 *PILIH TEMPLATE*', '', ...daftar, '', `Sekarang: ${s?.template || '— belum'}`].join('\n') + FOOT)
      }
      if (!templateSah(nama)) {
        return m.reply(`⚠️ Template "${namaAman(sisa)}" tidak ada.\n\nPilihan: ${menuTemplate().map((t) => t.id).join(', ')}${FOOT}`)
      }
      if (!s) return m.reply(`Kirim video/foto dulu, lalu pilih template.${FOOT}`)
      s.template = nama
      s.diperbarui = Date.now()
      perbaruiTahap(s)
      const t = ambilTemplate(nama)
      return m.reply([
        `✅ Template: *${t.nama}*`,
        '',
        t.deskripsi,
        '',
        s.media.length ? `➡️ Lanjut: ${prefix}edit judul <teks>` : `➡️ Sekarang kirim video/foto.`,
      ].join('\n') + FOOT)
    }

    /* ── teks ── */
    for (const [kata, kunci] of [['judul', 'judul'], ['title', 'judul'], ['sub', 'subjudul'], ['subjudul', 'subjudul'], ['meta', 'meta'], ['lokasi', 'meta']]) {
      if (sub === kata) {
        if (!s) return m.reply(`Kirim video/foto dulu.${FOOT}`)
        if (!sisa) return m.reply(`Contoh: ${prefix}edit ${kata} Mountain Prau${FOOT}`)
        s[kunci] = teksAman(sisa, kunci === 'meta' ? 80 : 60)
        s.diperbarui = Date.now()
        return m.reply(`✅ ${kunci === 'subjudul' ? 'Subjudul' : kunci === 'meta' ? 'Teks kecil' : 'Judul'}: *${s[kunci]}*${FOOT}`)
      }
    }

    /* ── logo ── */
    if (sub === 'logo') {
      if (!s) return m.reply(`Kirim video/foto dulu.${FOOT}`)
      const sumber = getMediaSource(m, ['image', 'document'])
      if (!sumber) return m.reply(`Balas gambar PNG dengan ${prefix}edit logo, atau ketik ${prefix}edit tanpa logo.${FOOT}`)
      const mime = getMimeType(sumber, 'image/png')
      const nama = getFileName(sumber, 'logo.png')
      const cek = logoSah(nama, mime, sumber.message?.fileLength || 0)
      if (!cek.ok) return m.reply(`⚠️ ${cek.galat}${FOOT}`)
      const buffer = await downloadMediaBuffer(sumber)
      if (buffer.length > 2 * 1024 * 1024) return m.reply(`⚠️ Logo terlalu besar (maks 2 MB).${FOOT}`)
      const berkas = path.join(s.media[0].folder, 'logo.png')
      fs.writeFileSync(berkas, buffer)
      s.logo = berkas
      s.diperbarui = Date.now()
      return m.reply(`✅ Logo dipakai (${rp(buffer.length)}). Posisi & ukuran mengikuti template.${FOOT}`)
    }

    if (sub === 'tanpa' && sisa.toLowerCase() === 'logo') {
      if (!s) return m.reply(`Kirim video/foto dulu.${FOOT}`)
      s.logo = ''
      return m.reply('✅ Logo dilepas. Rendering tetap jalan tanpa logo.' + FOOT)
    }

    /* ── durasi / slow / kualitas ── */
    if (sub === 'durasi') {
      if (!s) return m.reply(`Kirim video/foto dulu.${FOOT}`)
      const nilai = Number(String(sisa).replace(/[^0-9.]/g, ''))
      if (!nilai || nilai < 2 || nilai > MAX.maksDurasi) {
        return m.reply(`⚠️ Durasi harus 2-${MAX.maksDurasi} detik. Contoh: ${prefix}edit durasi 15${FOOT}`)
      }
      s.durasi = Math.round(nilai)
      return m.reply(`✅ Durasi hasil: ${s.durasi} detik${FOOT}`)
    }

    if (sub === 'slow' || sub === 'slowmo') {
      if (!s) return m.reply(`Kirim video/foto dulu.${FOOT}`)
      const nilai = Number(String(sisa).replace(/,/g, '.'))
      if (!nilai || nilai < 0.4 || nilai > 1) {
        return m.reply(`⚠️ Slow motion 0.4-1. Contoh: ${prefix}edit slow 0.6 (1 = normal).${FOOT}`)
      }
      if (s.media[0]?.jenis === 'video' && s.media[0]?.fps && s.media[0].fps < 24 && nilai < 0.6) {
        return m.reply(`⚠️ Video sumber ${s.media[0].fps} fps — slow motion di bawah 0.6x akan terlihat patah-patah. Dibatalkan.${FOOT}`)
      }
      s.slowmo = Math.round(nilai * 100) / 100
      return m.reply(`✅ Slow motion ${s.slowmo}x. Audio ikut diperlambat dengan pitch dijaga.${FOOT}`)
    }

    if (sub === 'kualitas' || sub === 'quality') {
      if (!s) return m.reply(`Kirim video/foto dulu.${FOOT}`)
      const nilai = sisa.toLowerCase()
      if (!['rendah', 'sedang', 'tinggi'].includes(nilai)) {
        return m.reply(`⚠️ Pilihan: rendah, sedang, tinggi.${FOOT}`)
      }
      s.kualitas = nilai
      return m.reply(`✅ Kualitas: ${nilai}${FOOT}`)
    }

    /* ── status & render ── */
    if (sub === 'status') {
      if (!s) return m.reply('📭 Belum ada sesi di chat ini.' + FOOT)
      return m.reply(ringkasSesi(s, prefix))
    }

    if (sub === 'render' || sub === 'gas' || sub === 'buat') {
      if (!s) return m.reply(`Belum ada media. Kirim video/foto dulu.${FOOT}`)
      if (!periksaFfmpeg()) return
      return jalankanRender(m, conn, s)
    }

    /* ── kata kunci template langsung: .edit nature ── */
    if (templateSah(sub)) {
      if (!s) {
        return m.reply(`Kirim video/foto dulu, lalu ketik ${prefix}edit ${sub}${FOOT}`)
      }
      s.template = sub
      perbaruiTahap(s)
      return m.reply(`✅ Template: *${ambilTemplate(sub).nama}*\n\n➡️ ${prefix}edit judul <teks>, lalu ${prefix}edit render${FOOT}`)
    }

    /* ── kirim media ── */
    return m.reply(`Perintah "${namaAman(sub)}" tidak dikenal.\n\nKetik ${prefix}edit untuk panduan.${FOOT}`)
  } catch (error) {
    console.error('[video-editor]', error)
    return m.reply(`❌ ${String(error?.message || error).slice(0, 250)}${FOOT}`)
  }
}

/* Media yang dikirim tanpa perintah: kalau ada sesi, langsung dipakai. */
handler.all = async function (m, { conn } = {}) {
  try {
    if (!MAX.aktif) return
    const sumber = getMediaSource(m, ['image', 'video', 'document'])
    if (!sumber) return
    const s = ambilSesi(m.chat, m.sender, { buat: false })
    if (!s) return
    if (s.status === 'render') return
    const hasil = await simpanMedia(conn, m, s)
    if (!hasil.ok) {
      if (hasil.galat) await m.reply(`⚠️ ${hasil.galat}${FOOT}`)
      return
    }
    const meta = hasil.meta
    meta.urutan = `${s.media.length}/${MAX.maksMedia}`
    const tambahan = [
      ringkasMediaBaru(meta),
      '',
      s.template ? '' : '➡️ Pilih gaya: edit template',
      s.media.length > 1 ? `Panel kolase memakai ${s.media.length} media (template gallery).` : '',
      '➡️ edit render bila sudah siap.',
    ].filter(Boolean).join('\n')
    await m.reply(tambahan + FOOT)
  } catch (error) {
    console.error('[video-editor][all]', error?.message || error)
  }
}

handler.help = ['edit', 'edit template', 'edit judul', 'edit render', 'edit batal']
handler.tags = ['tools', 'maker']
handler.command = /^(edit|videoeditor|veledit)$/i
handler.limit = true
handler.description = 'Cinematic typography video editor: video/foto -> MP4 aesthetic (template, blur reveal, kolase, audio asli)'

/* Informasi font untuk owner (dipakai .edit font? tidak—hanya diagnostik log) */
export function infoFont() {
  return fontSemua()
}

export default handler
