/* By AlzRiss - Usanagi Umi AI
 *
 * JADWAL SHOLAT (Task127 — diadaptasi dari OURIN V3.4 by AJI, plugins/religi/jadwalsholat.js)
 *
 * Sumber: myquran.com (API publik, tanpa API key).
 * Ditulis ulang mengikuti format plugin Umi (ESM, `export default handler`,
 * tanpa `||=`/`??=`, semua jaringan dibungkus try-catch + timeout).
 *
 * Perintah:
 *   .jadwalsholat            → pakai kota terakhir yang disimpan, atau Makassar
 *   .jadwalsholat <kota>     → cari kota lalu tampilkan jadwal hari ini
 *   .sholat <kota>           → alias
 *
 * Kota terakhir disimpan per pengguna di data/sholat-user.json supaya tidak
 * perlu mengetik ulang. Kalau file gagal ditulis, fitur tetap jalan.
 */

import fs from 'node:fs'
import path from 'node:path'

const BASIS = 'https://api.myquran.com/v2/sholat'
const BERKAS_KOTA = () => path.resolve(process.cwd(), 'data', 'sholat-user.json')
const TIMEOUT_MS = 15000

function bacaKota() {
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS_KOTA(), 'utf8'))
    return isi && typeof isi === 'object' ? isi : {}
  } catch {
    return {}
  }
}

function simpanKota(peta) {
  try {
    fs.mkdirSync(path.dirname(BERKAS_KOTA()), { recursive: true })
    fs.writeFileSync(BERKAS_KOTA(), JSON.stringify(peta))
  } catch {
    /* diamkan — bukan fitur inti */
  }
}

async function ambilJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Usanagi-Umi-AI/7.1' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Cari kota/kabupaten berdasarkan kata kunci. */
export async function cariKota(kata) {
  const kueri = String(kata || '').trim()
  if (!kueri) return null
  const data = await ambilJson(`${BASIS}/kota/cari/${encodeURIComponent(kueri.toLowerCase())}`)
  const daftar = Array.isArray(data?.data) ? data.data : []
  if (!daftar.length) return null
  // Utamakan yang namanya paling mirip (paling pendek), mis. "MAKASSAR" > "KOTA MAKASSAR".
  const tepat = daftar.find(item => String(item.lokasi || '').toLowerCase() === kueri.toLowerCase())
  return tepat || daftar[0]
}

/** Jadwal sholat satu hari (YYYY-MM-DD) untuk id kota myquran. */
export async function jadwalHari(id, tanggal) {
  const tgl = tanggal || new Date().toISOString().slice(0, 10)
  const data = await ambilJson(`${BASIS}/jadwal/${encodeURIComponent(id)}/${tgl}`)
  const isi = data?.data
  if (!isi || !isi.jadwal) throw new Error('jadwal tidak tersedia')
  return isi
}

/** Susun teks jadwal (dipisah supaya bisa diuji tanpa jaringan). */
export function susunTeksJadwal(isi) {
  const w = isi.jadwal || {}
  const baris = [
    '🕌 *JADWAL SHOLAT*',
    `📍 ${isi.lokasi || '-'}${isi.daerah ? ` — ${isi.daerah}` : ''}`,
    `📅 ${w.tanggal || '-'}`,
    '',
    `🌙 Imsak    : ${w.imsak || '-'}`,
    `🌅 Subuh    : ${w.subuh || '-'}`,
    `☀️ Terbit   : ${w.terbit || '-'}`,
    `🌤️ Dhuha    : ${w.dhuha || '-'}`,
    `🌞 Dzuhur   : ${w.dzuhur || '-'}`,
    `🌇 Ashar    : ${w.ashar || '-'}`,
    `🌆 Maghrib  : ${w.maghrib || '-'}`,
    `🌃 Isya     : ${w.isya || '-'}`,
    '',
    '> Sumber: myquran.com · jangan lupa sholat ya 🤲',
  ]
  return baris.join('\n')
}

let handler = async (m, { conn, args, usedPrefix }) => {
  const pengguna = String(m.sender || '')
  const tersimpan = bacaKota()
  const kueri = String((args || []).join(' ') || '').trim()
  const kota = kueri || tersimpan[pengguna] || 'Makassar'

  let pesanTunggu = null
  try {
    pesanTunggu = await m.reply(`🕌 Mencari jadwal sholat *${kota}*…`)
  } catch {
    /* gagal kirim pesan tunggu bukan masalah */
  }

  try {
    const dataKota = await cariKota(kota)
    if (!dataKota) {
      const teks = [
        '❌ *Kota tidak ditemukan*',
        '',
        `Kata kunci: *${kota}*`,
        `Coba: ${usedPrefix}jadwalsholat makassar`,
      ].join('\n')
      if (pesanTunggu?.key && conn) {
        await conn.sendMessage(m.chat, { text: teks, edit: pesanTunggu.key })
      } else {
        await m.reply(teks)
      }
      return
    }

    const isi = await jadwalHari(dataKota.id)
    // Ingat pilihan kota hanya kalau pengguna mengetik sendiri.
    if (kueri) {
      const peta = bacaKota()
      peta[pengguna] = String(dataKota.lokasi || kota)
      simpanKota(peta)
    }

    const teks = susunTeksJadwal(isi)
    if (pesanTunggu?.key && conn) {
      await conn.sendMessage(m.chat, { text: teks, edit: pesanTunggu.key })
    } else {
      await m.reply(teks)
    }
  } catch (error) {
    console.error('[SHOLAT]', error?.message || error)
    const teks = [
      '❌ *Gagal mengambil jadwal sholat*',
      '',
      `Alasan: ${String(error?.message || error).slice(0, 120)}`,
      'Coba lagi beberapa saat lagi ya.',
    ].join('\n')
    try {
      if (pesanTunggu?.key && conn) await conn.sendMessage(m.chat, { text: teks, edit: pesanTunggu.key })
      else await m.reply(teks)
    } catch {
      /* sudah dicoba */
    }
  }
}

handler.command = /^(jadwalsholat|jadwalsolat|waktusholat|waktusolat|prayertime)$/i
handler.help = ['jadwalsholat <kota>']
handler.tags = ['islamic', 'info']
handler.description = 'Jadwal sholat hari ini untuk kota/kabupaten di Indonesia (sumber myquran.com)'
handler.limit = false

export default handler
