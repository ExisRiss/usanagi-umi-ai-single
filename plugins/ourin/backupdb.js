/* By AlzRiss - Usanagi Umi AI
 *
 * `.savedb`, `.backupdb`, `.listbackup` — cadangan database dari WhatsApp.
 *
 * Fitur OURIN (plugins/owner/savedb.js, backupdb.js) yang belum ada di Umi.
 * Sebelumnya cadangan hanya bisa dibuat dari panel/website; kalau owner sedang
 * di HP dan ingin menyelamatkan data sebelum restart, tidak ada jalan.
 *
 * Aman karena:
 *  - HANYA MENYALIN berkas, tidak pernah menimpa database yang sedang dipakai,
 *  - cadangan lama dipangkas otomatis (maksimal 5 berkas per jenis),
 *  - berkas > 100 MB dilewati dengan pesan jelas (bukan memenuhi disk),
 *  - tidak ada perintah restore di sini: memulihkan database tetap lewat panel
 *    supaya tidak ada risiko menimpa data hidup karena salah ketik.
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const FOLDER = path.join(process.cwd(), 'data', 'backup-owner')
const MAKS_SIMPAN = 5
const MAKS_BYTE = 100 * 1024 * 1024

function stempel() {
  const d = new Date(Date.now() + 8 * 3600 * 1000) // WITA
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function ukuran(n) {
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

async function pangkas(pola) {
  const isi = await fsp.readdir(FOLDER).catch(() => [])
  const cocok = isi.filter(n => pola.test(n)).sort()
  while (cocok.length > MAKS_SIMPAN) {
    const buang = cocok.shift()
    await fsp.rm(path.join(FOLDER, buang), { force: true }).catch(() => {})
  }
}

async function salin(namaSumber, namaTujuan) {
  const sumber = path.join(process.cwd(), namaSumber)
  const stat = await fsp.stat(sumber).catch(() => null)
  if (!stat || !stat.isFile()) return { ok: false, alasan: `${namaSumber} tidak ada` }
  if (stat.size > MAKS_BYTE) return { ok: false, alasan: `${namaSumber} terlalu besar (${ukuran(stat.size)})` }
  const tujuan = path.join(FOLDER, namaTujuan)
  await fsp.copyFile(sumber, tujuan)
  return { ok: true, nama: namaTujuan, byte: stat.size }
}

let handler = async (m, { command }) => {
  await fsp.mkdir(FOLDER, { recursive: true }).catch(() => {})

  if (command === 'listbackup' || command === 'cekcadangan') {
    const isi = await fsp.readdir(FOLDER).catch(() => [])
    if (!isi.length) return m.reply('〄 Belum ada cadangan.\n〄 Buat dengan .savedb (database saja) atau .backupdb (database + setting).')
    const baris = []
    for (const nama of isi.sort().reverse().slice(0, 20)) {
      const stat = await fsp.stat(path.join(FOLDER, nama)).catch(() => null)
      if (stat) baris.push(`〄 ${nama} — ${ukuran(stat.size)}`)
    }
    return m.reply(`〄 *CADANGAN TERSIMPAN*\n\n${baris.join('\n')}\n\n〄 Folder: data/backup-owner\n〄 Maksimal ${MAKS_SIMPAN} berkas per jenis (otomatis dipangkas).`)
  }

  const waktu = stempel()
  const hasil = []
  const gagal = []

  const db = await salin('database.json', `database-${waktu}.json`)
  if (db.ok) hasil.push(`database.json — ${ukuran(db.byte)}`)
  else gagal.push(db.alasan)

  if (command === 'backupdb') {
    /* Setting kecil di data/ ikut disalin supaya konfigurasi tidak hilang. */
    const daftar = ['prefix-settings.json', 'umi-menu.json', 'main-bot-settings.json']
    for (const nama of daftar) {
      const info = await salin(path.join('data', nama), `${nama.replace(/\.json$/, '')}-${waktu}.json`)
      if (info.ok) hasil.push(`${nama} — ${ukuran(info.byte)}`)
    }
  }

  await pangkas(/^database-/)
  await pangkas(/^prefix-settings-|^umi-menu-|^main-bot-settings-/)

  if (!hasil.length) {
    return m.reply(`〄 Cadangan gagal dibuat.\n〄 Alasan: ${gagal.join('; ') || 'tidak diketahui'}`)
  }

  const total = fs.readdirSync(FOLDER).length
  return m.reply(
    `✅ *CADANGAN DIBUAT*\n\n` +
    hasil.map(x => `〄 ${x}`).join('\n') +
    `\n\n〄 Folder: data/backup-owner\n〄 Total berkas cadangan: ${total}\n` +
    `〄 Lihat daftar: .listbackup`
  )
}

handler.help = ['savedb', 'backupdb', 'listbackup']
handler.tags = ['owner']
handler.command = /^(savedb|backupdb|listbackup|cekcadangan)$/i
handler.owner = true
handler.limit = false
handler.cooldown = 15

export default handler
