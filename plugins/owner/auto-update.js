/* By AlzRiss - Usanagi Umi AI
 *
 * Task142 — perintah AUTO UPDATE (khusus developer, hanya di source code).
 *
 * ⚠️ UNTUK AI / DEVELOPER LAIN:
 *   Logika sebenarnya ada di lib/auto-update.js. Berkas ini hanya lapisan
 *   perintah WhatsApp. Jangan menambah `git pull` manual, jangan menulis
 *   berkas di luar IZIN_PATH, dan jangan pernah melewati `node --check`.
 *   Semua kredensial (token GitHub, API panel) ada di data/auto-update.json
 *   mode 600 — jangan dicetak ke chat, jangan di-push ke repo.
 *
 * Perintah:
 *   .autoupdate                 status + tutorial lengkap
 *   .autoupdate on | off        nyalakan / matikan pemeriksaan berkala
 *   .autoupdate cek             lihat commit terbaru & daftar berkas berubah (tanpa menulis)
 *   .autoupdate now             terapkan pembaruan lalu restart bot
 *   .autoupdate paksa           sama, tapi menimpa berkas yang diedit manual
 *   .autoupdate log             riwayat 10 pemeriksaan/terapan terakhir
 *   .autoupdate restart         restart bot saja (tanpa update)
 */

import { sendInteractive } from '../../lib/awang-tombol.js'
import {
  bacaKonfig,
  simpanKonfig,
  cekPembaruan,
  terapkanPembaruan,
  restartBot,
  siklusAuto,
  mulaiPenjadwal,
  hentikanPenjadwal,
  statusPenjadwal,
  bacaLog,
  bacaState,
} from '../../lib/auto-update.js'

const jamNya = (iso) => {
  if (!iso) return '-'
  try { return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'medium', timeStyle: 'short' }) + ' WITA' } catch (error) { return String(iso) }
}

const TUTORIAL = `🔄 *AUTO UPDATE BOT*

Bot bisa memeriksa repo GitHub sendiri, mengambil berkas yang berubah, lalu
restart. Fitur ini **hanya ada di source code** — tidak muncul di website.

*Perintah*
.autoupdate — status + tutorial
.autoupdate on — aktifkan pemeriksaan berkala
.autoupdate off — matikan
.autoupdate cek — lihat commit terbaru (tidak mengubah apa pun)
.autoupdate now — terapkan pembaruan + restart
.autoupdate paksa — paksa timpa berkas yang diedit manual
.autoupdate log — riwayat 10 kejadian terakhir
.autoupdate restart — restart bot saja

*Pengaman yang berjalan otomatis*
• Hanya folder kode yang boleh ditimpa: lib/, plugins/, core/, scripts/, tests/, docs/,
  handler.js, main.js, config.js
• Ditolak mentah-mentah: data/, sessions/, node_modules/, tmp/, database.json, .env
• Setiap berkas .js wajib lolos \`node --check\` sebelum ditulis
• Berkas lama dibackup ke data/auto-update-backup/<waktu>/
• Berkas yang diedit manual SETELAH commit terbaru tidak ditimpa kecuali pakai "paksa"\n• Berkas yang dihapus di repo ikut dihapus di server (dibackup dulu)
• Restart lewat API panel; kalau kredensial panel kosong, bot mencoba perintah
  restart.cmd lalu (terakhir) keluar proses

*Yang perlu diisi sekali* (di server, mode 600):
data/auto-update.json → repo, branch, token GitHub, restart.panelUrl/apiKey/serverId`

function ringkasCek(cek) {
  const baris = [
    '🔍 *HASIL PEMERIKSAAN*',
    '',
    `Repo    : ${bacaKonfig().repo} (${bacaKonfig().branch})`,
    `Commit  : ${String(cek.commit.sha).slice(0, 10)}`,
    `Pesan   : ${cek.commit.pesan || '-'}`,
    `Waktu   : ${jamNya(cek.commit.waktu)}`,
    '',
    `Berkas diperiksa : ${cek.diperiksa}`,
    `Sama             : ${cek.sama}`,
    `Berubah          : ${cek.berubah.length}`,
    `Hilang di repo   : ${(cek.dihapus || []).length}`,
  ]
  if (cek.berubah.length) {
    baris.push('')
    for (const item of cek.berubah.slice(0, 15)) {
      const tanda = item.jenis === 'baru' ? '➕' : item.aman ? '✏️' : '⚠️'
      baris.push(`${tanda} ${item.path}${item.aman ? '' : ' (diedit manual)'}`)
    }
    if (cek.berubah.length > 15) baris.push(`… dan ${cek.berubah.length - 15} berkas lain`)
  }
  if ((cek.dihapus || []).length) {
    baris.push('', '🗑️ *Akan dihapus di server:*')
    for (const item of cek.dihapus.slice(0, 10)) baris.push(`• ${item.path}`)
  }
  if (!cek.berubah.length && !(cek.dihapus || []).length) {
    baris.push('', '✅ Bot sudah paling baru.')
  } else {
    baris.push('', 'Terapkan: .autoupdate now')
    if (cek.berubah.some((x) => !x.aman)) baris.push('Paksa (timpa yang diedit manual): .autoupdate paksa')
  }
  return baris.join('\n')
}

function ringkasTerap(hasil, restart) {
  const baris = [
    '🔄 *PEMBARUAN DITERAPKAN*',
    '',
    `Commit : ${String(hasil.commit.sha).slice(0, 10)} — ${hasil.commit.pesan || '-'}`,
    `Ditulis: ${hasil.ditulis.length} berkas`,
    hasil.ditulis.length ? hasil.ditulis.slice(0, 12).map((x) => '• ' + x).join('\n') : '• tidak ada',
  ]
  if ((hasil.dihapus || []).length) {
    baris.push('', `🗑️ Dihapus (${hasil.dihapus.length}):`)
    baris.push(hasil.dihapus.slice(0, 8).map((x) => '• ' + x).join('\n'))
  }
  if (hasil.dilewati.length) {
    baris.push('', `⏭️ Dilewati (${hasil.dilewati.length}):`)
    baris.push(hasil.dilewati.slice(0, 8).map((x) => '• ' + x).join('\n'))
  }
  if (hasil.gagal.length) {
    baris.push('', `❌ Gagal (${hasil.gagal.length}):`)
    baris.push(hasil.gagal.slice(0, 8).map((x) => '• ' + x).join('\n'))
  }
  if (hasil.backup) baris.push('', 'Backup: ' + hasil.backup.split('/').slice(-2).join('/'))
  if (restart) {
    baris.push('', restart.cara === 'panel'
      ? '♻️ Restart diminta lewat panel. Bot akan menyala lagi dalam ±15 detik.'
      : restart.cara === 'cmd'
        ? '♻️ Perintah restart dijalankan.'
        : '⚠️ Panel tidak punya kredensial restart — proses keluar, bot hidup lagi kalau panel menyetel auto-restart.')
  }
  return baris.join('\n')
}

let handler = async (m, { conn, command, text = '', isROwner }) => {
  if (!isROwner) return m.reply('🔒 Auto update hanya untuk developer.')
  if (!/^autoupdate$/i.test(String(command || ''))) return
  const arg = String(text || '').trim().toLowerCase()

  try {
    if (!arg) {
      const cfg = bacaKonfig(true)
      const state = bacaState()
      const jadwal = statusPenjadwal()
      const isi = [
        TUTORIAL,
        '',
        '*Status sekarang*',
        `Aktif        : ${cfg.aktif ? 'ya' : 'belum'}`,
        `Interval     : ${Math.max(5, Number(cfg.intervalMenit) || 30)} menit`,
        `Penjadwal    : ${jadwal.berjalan ? 'jalan' : 'berhenti'}`,
        `Commit lokal : ${state.sha ? String(state.sha).slice(0, 10) : 'belum pernah sinkron'}`,
        `Restart panel: ${cfg.restart && cfg.restart.panelUrl ? 'siap' : 'belum diisi'}`,
      ].join('\n')
      try {
        return await sendInteractive(conn, m.chat, {
          title: '🔄 AUTO UPDATE',
          subtitle: cfg.repo,
          body: isi,
          footer: 'Khusus developer.',
          list: {
            listTitle: 'Aksi',
            sections: [{
              title: 'UPDATE',
              rows: [
                { title: '🔍 Cek pembaruan', description: 'Commit & berkas berubah', command: '.autoupdate cek' },
                { title: '⬇️ Terapkan sekarang', description: 'Update + restart bot', command: '.autoupdate now' },
                { title: '♻️ Restart bot', description: 'Tanpa update', command: '.autoupdate restart' },
              ],
            }],
          },
        }, { quoted: m.raw || m })
      } catch (error) {
        return m.reply(isi)
      }
    }

    if (arg === 'on') {
      simpanKonfig({ aktif: true })
      hentikanPenjadwal()
      const hasil = mulaiPenjadwal()
      return m.reply([
        '✅ *AUTO UPDATE AKTIF*',
        '',
        `Pemeriksaan tiap ${hasil.intervalMenit || bacaKonfig().intervalMenit} menit.`,
        'Kalau ada commit baru: berkas diunduh, diperiksa sintaksnya, lalu bot restart.',
        '',
        'Matikan: .autoupdate off',
      ].join('\n'))
    }

    if (arg === 'off') {
      simpanKonfig({ aktif: false })
      hentikanPenjadwal()
      return m.reply('⏹️ Auto update dimatikan. Cek manual tetap bisa dengan .autoupdate cek')
    }

    if (arg === 'cek') {
      await m.reply('🔍 Memeriksa repo…')
      const cek = await cekPembaruan()
      return m.reply(ringkasCek(cek))
    }

    if (arg === 'now' || arg === 'paksa') {
      const paksa = arg === 'paksa'
      await m.reply(paksa ? '⬇️ Menerapkan pembaruan (mode paksa)…' : '⬇️ Menerapkan pembaruan…')
      const hasil = await terapkanPembaruan({ paksa })
      if (!hasil.ditulis.length && !(hasil.dihapus || []).length) {
        return m.reply([
          'ℹ️ *TIDAK ADA YANG DITULIS*',
          '',
          hasil.dilewati.length ? 'Dilewati:\n' + hasil.dilewati.map((x) => '• ' + x).join('\n') : 'Repo sudah sama dengan server.',
          hasil.gagal.length ? '\nGagal:\n' + hasil.gagal.map((x) => '• ' + x).join('\n') : '',
        ].filter(Boolean).join('\n'))
      }
      /* Beri pesan dulu, baru restart, supaya developer tahu apa yang terjadi. */
      await m.reply(ringkasTerap(hasil, null))
      const restart = await restartBot()
      return m.reply(ringkasTerap({ ...hasil, ditulis: [], dihapus: [] }, restart))
    }

    if (arg === 'log') {
      const log = bacaLog(10)
      if (!log.length) return m.reply('📭 Belum ada riwayat auto update.')
      return m.reply(['🗂️ *RIWAYAT AUTO UPDATE*', '', ...log.map((x) => {
        const sha = x.sha ? String(x.sha).slice(0, 8) : '-'
        const tambahan = x.ditulis ? ` · ${x.ditulis.length} berkas` : x.berubah !== undefined ? ` · ${x.berubah} berubah` : ''
        return `• ${jamNya(x.waktu)} · ${x.kejadian} ${sha}${tambahan}${x.galat ? ' · ⚠️ ' + x.galat : ''}`
      })].join('\n'))
    }

    if (arg === 'restart') {
      const hasil = await restartBot()
      return m.reply(hasil.cara === 'panel'
        ? '♻️ Restart diminta lewat panel. Tunggu ±15 detik lalu cek ulang.'
        : hasil.cara === 'cmd' ? '♻️ Perintah restart dijalankan.' : '⚠️ ' + (hasil.pesan || 'Restart lewat proses keluar.'))
    }

    if (arg === 'siklus') {
      const hasil = await siklusAuto({})
      return m.reply(hasil.hasil ? ringkasTerap(hasil.hasil, hasil.restart) : ringkasCek(hasil.cek))
    }

    return m.reply('Perintah tidak dikenal. Ketik .autoupdate untuk melihat panduannya.')
  } catch (error) {
    return m.reply('❌ ' + (error && error.message ? error.message : error))
  }
}

/* Penjadwal ikut hidup sendiri kalau konfigurasi sudah aktif dan ada pesan
 * masuk — tidak perlu mengubah main.js / handler.js. */
handler.all = async function () {
  try {
    const cfg = bacaKonfig()
    if (cfg.aktif) mulaiPenjadwal()
  } catch (error) { /* diamkan */ }
}

handler.help = ['autoupdate', 'autoupdate cek', 'autoupdate now', 'autoupdate on', 'autoupdate off', 'autoupdate log', 'autoupdate restart']
handler.tags = ['owner']
handler.command = /^autoupdate$/i
handler.description = 'Auto update bot dari repo GitHub + restart (developer, source code saja)'
handler.owner = true
handler.group = false
handler.private = false
handler.limit = false
handler.fail = null

export { handler }
export default handler
