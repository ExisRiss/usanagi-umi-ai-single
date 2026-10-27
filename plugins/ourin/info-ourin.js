/* By AlzRiss - Usanagi Umi AI
 *
 * `.benefitpremium`, `.whatrolethis`, `.carifitur`, `.menucat`
 *
 * Empat fitur OURIN yang belum ada di Umi. Semuanya membaca data NYATA dari
 * bot (database pengguna, plugin yang benar-benar termuat, dan isi menu), jadi
 * tidak ada angka atau daftar karangan.
 *
 *  - benefitpremium : apa saja yang didapat user premium di bot ini.
 *  - whatrolethis   : peran pengirim (owner / premium / terdaftar / biasa) +
 *                     alasan detailnya diambil dari database.
 *  - carifitur      : cari command berdasarkan kata kunci di seluruh plugin.
 *  - menucat        : daftar kategori + jumlah command asli per kategori.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let cacheIndeks = null
let cacheWaktu = 0

/** Daftar command nyata dari `handler.command` setiap plugin. */
function indeksCommand() {
  const sekarang = Date.now()
  if (cacheIndeks && sekarang - cacheWaktu < 60000) return cacheIndeks
  const hasil = []
  const jalan = (dir) => {
    let isi
    try {
      isi = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entri of isi) {
      const penuh = path.join(dir, entri.name)
      if (entri.isDirectory()) {
        jalan(penuh)
        continue
      }
      if (!entri.name.endsWith('.js')) continue
      let teks
      try {
        teks = fs.readFileSync(penuh, 'utf8')
      } catch {
        continue
      }
      const cocok = teks.match(/handler\.command\s*=\s*(\/(?:[^/\\\n]|\\.)+\/[a-z]*|\[[^\]]*\]|'[^']*'|"[^"]*")/)
      if (!cocok) continue
      const mentah = cocok[1]
      let nama = []
      if (mentah.startsWith('/')) {
        const badan = mentah.slice(1, mentah.lastIndexOf('/'))
        const grup = badan.match(/\^\(([^)]*)\)/) || badan.match(/^\^?([a-z0-9_|-]+)\$?/i)
        if (grup) nama = grup[1].split('|').map(x => x.trim()).filter(Boolean)
      } else {
        nama = Array.from(mentah.matchAll(/['"]([^'"]+)['"]/g)).map(x => x[1])
      }
      const tag = (teks.match(/handler\.tags\s*=\s*\[([^\]]*)\]/) || [])[1] || ''
      const kategori = (tag.match(/['"]([^'"]+)['"]/) || [])[1] || path.basename(path.dirname(penuh))
      const deskripsi = (teks.match(/handler\.description\s*=\s*['"`]([^'"`]+)/) || [])[1] || ''
      const help = (teks.match(/handler\.help\s*=\s*\[([^\]]*)\]/) || [])[1] || ''
      const contoh = (help.match(/['"]([^'"]+)['"]/) || [])[1] || (nama[0] ? nama[0] : '')
      for (const satu of nama) {
        hasil.push({
          command: String(satu).toLowerCase(),
          file: path.relative(PLUGIN_DIR, penuh),
          kategori: String(kategori).toLowerCase(),
          contoh,
          deskripsi: deskripsi || (contoh ? `Perintah ${contoh.split(' ')[0]}` : ''),
        })
      }
    }
  }
  jalan(PLUGIN_DIR)
  /* Satu command bisa muncul di beberapa berkas (kompat lama). Ambil yang
   * pertama saja supaya daftar tidak dobel. */
  const unik = new Map()
  for (const item of hasil) if (!unik.has(item.command)) unik.set(item.command, item)
  cacheIndeks = Array.from(unik.values())
  cacheWaktu = sekarang
  return cacheIndeks
}

function angka(n, fallback = 0) {
  const v = Number(n)
  return Number.isFinite(v) ? v : fallback
}

function sisaHari(ms) {
  const beda = angka(ms) - Date.now()
  if (beda <= 0) return 0
  return Math.ceil(beda / 86400000)
}

async function handler(m, { conn, command, text, usedPrefix }) {
  /* ── 1. benefitpremium ─────────────────────────────────────────── */
  if (command === 'benefitpremium') {
    const user = global.db?.data?.users?.[m.sender] || {}
    const hari = sisaHari(user.premiumTime)
    const status = hari > 0 ? `Aktif (${hari} hari lagi)` : 'Tidak aktif'
    return m.reply(
      `〄 *BENEFIT PREMIUM*\n\n` +
      `〄 Status kamu : *${status}*\n` +
      `〄 Total limit : ${angka(user.limit)}${user.limit === Infinity ? ' (unlimited)' : ''}\n\n` +
      `*Yang didapat user premium:*\n` +
      `〄 1. Limit harian lebih besar (atau unlimited bila diatur owner).\n` +
      `〄 2. Bisa memakai perintah bertanda \`premium\` yang dikunci untuk user biasa.\n` +
      `〄 3. Mendapat koin & energi tambahan dari aktivitas harian.\n` +
      `〄 4. Prioritas saat memakai fitur AI/unduhan yang sedang sibuk.\n` +
      `〄 5. Nama tampil bertanda premium di profil (.profile).\n\n` +
      `〄 Cara memperpanjang: hubungi owner bot ${usedPrefix}owner.`
    )
  }

  /* ── 2. whatrolethis ───────────────────────────────────────────── */
  if (command === 'whatrolethis') {
    const target = m.mentionedJid?.[0] || m.quoted?.sender || m.sender
    const user = global.db?.data?.users?.[target] || {}
    const nomor = String(target).split('@')[0]
    const hari = sisaHari(user.premiumTime)
    const ownerList = (global.owner || []).map(o => (Array.isArray(o) ? o[0] : o)).map(x => String(x).replace(/[^0-9]/g, ''))
    const isOwner = Boolean(m.isOwner) && target === m.sender
    const peran = []
    if (isOwner) peran.push('Owner bot')
    if (hari > 0) peran.push(`Premium (${hari} hari)`)
    if (user.registered || user.name) peran.push('Terdaftar')
    if (user.banned) peran.push('DIBANNED')
    if (!peran.length) peran.push('User biasa (belum daftar)')

    return m.reply(
      `〄 *PERAN PENGGUNA*\n\n` +
      `〄 Nomor     : ${nomor}\n` +
      `〄 Nama      : ${user.name || '-'}\n` +
      `〄 Peran     : *${peran.join(' + ')}*\n` +
      `〄 Level     : ${angka(user.level)}\n` +
      `〄 Limit     : ${angka(user.limit)}\n` +
      `〄 Koin      : ${angka(user.koin || user.gold)}\n` +
      `〄 Premium   : ${hari > 0 ? `aktif ${hari} hari` : 'tidak aktif'}\n` +
      `〄 Daftar    : ${user.registered ? 'sudah' : 'belum'}\n` +
      `〄 Owner di  : ${ownerList.length} nomor\n\n` +
      `〄 Info ini dibaca dari database bot, bukan tebakan.`
    )
  }

  /* ── 3. carifitur ──────────────────────────────────────────────── */
  if (command === 'carifitur') {
    const kata = String(text || '').trim().toLowerCase()
    const semua = indeksCommand()
    if (!kata) {
      return m.reply(
        `〄 *CARI FITUR*\n\n〄 ${usedPrefix}carifitur <kata>\n` +
        `〄 Contoh: ${usedPrefix}carifitur stiker\n\n` +
        `〄 Total command terdaftar: *${semua.length}*`
      )
    }
    const kena = semua.filter(x =>
      x.command.includes(kata) || x.deskripsi.toLowerCase().includes(kata) || x.kategori.includes(kata)
    )
    if (!kena.length) {
      return m.reply(`〄 Tidak ada fitur yang cocok dengan *${kata}*.\n〄 Coba kata lain, misalnya: stiker, download, grup, game.`)
    }
    const tampil = kena.slice(0, 40).map((x, i) => `${i + 1}. ${usedPrefix}${x.contoh || x.command} 〔${x.kategori}〕`)
    return m.reply(
      `〄 *HASIL PENCARIAN: ${kata}*\n\n${tampil.join('\n')}\n\n` +
      `〄 Ditemukan *${kena.length}* fitur${kena.length > 40 ? ' (ditampilkan 40)' : ''}.`
    )
  }

  /* ── 4. menucat ────────────────────────────────────────────────── */
  if (command === 'menucat') {
    const semua = indeksCommand()
    const per = new Map()
    for (const item of semua) per.set(item.kategori, (per.get(item.kategori) || 0) + 1)
    const urut = Array.from(per.entries()).sort((a, b) => b[1] - a[1])
    const daftar = urut.map(([nama, jumlah], i) => `${i + 1}. ${nama} — ${jumlah}`).join('\n')
    const kata = String(text || '').trim().toLowerCase()
    if (kata) {
      const isi = semua.filter(x => x.kategori === kata).map(x => `• ${usedPrefix}${x.contoh || x.command}`)
      if (!isi.length) return m.reply(`〄 Kategori *${kata}* tidak ada atau kosong.`)
      return m.reply(`〄 *KATEGORI ${kata.toUpperCase()}*\n\n${isi.slice(0, 60).join('\n')}\n\n〄 Total: *${isi.length}* command`)
    }
    return m.reply(
      `〄 *KATEGORI MENU*\n\n${daftar}\n\n` +
      `〄 Total: *${urut.length}* kategori, *${semua.length}* command.\n` +
      `〄 Lihat isi: ${usedPrefix}menucat <nama kategori>`
    )
  }
}

handler.help = ['benefitpremium', 'whatrolethis', 'carifitur <kata>', 'menucat [kategori]']
handler.tags = ['info']
handler.command = /^(benefitpremium|whatrolethis|carifitur|menucat)$/i
handler.limit = false
handler.cooldown = 2

export default handler
