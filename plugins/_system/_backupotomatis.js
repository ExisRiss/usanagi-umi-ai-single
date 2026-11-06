/* By AlzRiss - Usanagi Umi AI
 *
 * Task171 — BACKUP OTOMATIS lewat tunnel.
 *
 * Alurnya (semua di server yang dilayani tunnel):
 *   tiap BACKUP_INTERVAL_MINUTES → buat arsip tar.gz (tanpa enkripsi) →
 *   unggah ke https://upload.gwenna.my.id/<id akun>/<nama>.tar.gz.enc →
 *   bot kirim LINK hasil unggah ke nomor owner.
 *
 * Perintah (khusus owner/developer):
 *   .backup                → status + jadwal + link terakhir
 *   .backup sekarang       → jalankan backup saat ini juga
 *   .backup daftar         → 10 backup terakhir + link
 *   .backup uji            → uji cepat (buat + unggah, tanpa menunggu jadwal)
 *   .backup pulih <link|berkas> → siapkan pemulihan pada restart berikutnya
 *
 * Isi arsip: sesi bot utama + jadibot, data/, situs/ (website yang di-deploy),
 * public/, kode bot, .tunnel.env (token tunnel) → bisa dipulihkan penuh di
 * server tunnel baru tanpa pairing ulang & tanpa deploy ulang situs.
 *
 * Modul inti: lib/backup/{config,arsip,unggah,kirim,scheduler,restore}.js
 */

import fs from 'fs'
import path from 'path'
import { backupConfig } from '../../lib/backup/config.js'
import { jalankanBackup, mulaiPenjadwal, bacaStatus, waktuWita, mbTeks } from '../../lib/backup/scheduler.js'
import { pratinjauArsip } from '../../lib/backup/restore.js'

function akar() {
  return process.cwd()
}

function ownerNomor(cfg) {
  return String(cfg.owner || '6287813709432')
}

function kartuStatus(cfg) {
  const st = bacaStatus(cfg)
  const t = st?.terakhir || null
  const baris = [
    '🗄️ *BACKUP OTOMATIS*',
    '',
    `Jadwal    : tiap ${cfg.intervalMenit} menit`,
    `Target    : ${cfg.unggah ? 'upload.gwenna.my.id' : 'server saja'}`,
    `Owner     : +${ownerNomor(cfg)}`,
    `Enkripsi  : 🚫 tanpa enkripsi — arsip .tar.gz langsung diekstrak`,
    `Arsip lokal disimpan: ${cfg.lokalSimpan}`,
    `Jumlah    : ${Number(st?.jumlah?.sukses || 0)} sukses · ${Number(st?.jumlah?.gagal || 0)} gagal`,
  ]
  if (t) {
    baris.push('', '*Backup terakhir*')
    baris.push(`${t.ok ? '✅ sukses' : '❌ gagal'} · ${t.waktuTeks || waktuWita(t.waktu)}`)
    if (t.arsip) {
      baris.push(`Arsip  : ${t.arsip.nama} · ${t.arsip.ukuranTeks} · ${t.arsip.entri} entri`)
      baris.push(`Isi    : ${t.arsip.situs || 0} situs · ${t.arsip.jadibot || 0} sesi jadibot · tunnel ${t.arsip.tunnel ? 'ikut ✅' : 'tidak ikut ⚠️'}`)
    }
    if (t.unggah) baris.push(`Link   : ${t.unggah.url}`)
    if (t.galat) baris.push(`Sebab  : ${t.galat}`)
    if (t.notif) baris.push(`Kirim  : ${t.notif.terkirim ? 'terkirim ke owner' : 'tertunda — ' + (t.notif.alasan || 'bot belum siap')}`)
  } else {
    baris.push('', 'Belum ada backup yang dijalankan.')
  }
  baris.push('', '*Perintah*')
  baris.push('• .backup sekarang — backup & kirim link sekarang')
  baris.push('• .backup daftar — riwayat + link')
  baris.push('• .backup uji — uji cepat')
  baris.push('• .backup pulih <link|berkas> — pulihkan saat restart')
  return baris.join('\n')
}

const handler = async (m, { args = [], isOwner, isROwner }) => {
  const admin = Boolean(isOwner || isROwner)
  if (!admin) return m.reply('🔒 Perintah backup khusus owner/developer bot.')
  const cfg = backupConfig(akar())
  const aksi = String(args[0] || '').trim().toLowerCase()

  if (!aksi || aksi === 'status' || aksi === 'info') return m.reply(kartuStatus(cfg))

  if (aksi === 'sekarang' || aksi === 'now' || aksi === 'jalan' || aksi === 'uji') {
    await m.reply(`⏳ Menjalankan backup (${aksi === 'uji' ? 'uji cepat' : 'manual'})… arsip + unggah + kirim link ke +${ownerNomor(cfg)}.`).catch(() => { })
    const hasil = await jalankanBackup({ alasan: aksi === 'uji' ? 'uji' : 'manual', cfg })
    return m.reply([
      hasil.ok ? '✅ *BACKUP SELESAI*' : '❌ *BACKUP GAGAL*',
      '',
      `Waktu  : ${hasil.waktuTeks}`,
      hasil.arsip ? `Arsip  : ${hasil.arsip.nama} · ${hasil.arsip.ukuranTeks} · ${hasil.arsip.entri} entri` : '',
      hasil.unggah ? `Link   : ${hasil.unggah.url}` : '',
      hasil.galat ? `Sebab  : ${hasil.galat}` : '',
      hasil.notif ? `Kirim  : ${hasil.notif.terkirim ? '✅ terkirim ke owner' : '⏳ tertunda — ' + (hasil.notif.alasan || '-')}` : '',
      `Durasi : ${hasil.durasiMs} ms`,
    ].filter(Boolean).join('\n'))
  }

  if (aksi === 'daftar' || aksi === 'list' || aksi === 'riwayat') {
    const st = bacaStatus(cfg)
    const riwayat = Array.isArray(st.riwayat) ? st.riwayat.slice(0, 10) : []
    if (!riwayat.length) return m.reply('Belum ada riwayat backup. Jalankan: .backup sekarang')
    const baris = ['🗄️ *RIWAYAT BACKUP*', '']
    riwayat.forEach((item, i) => {
      baris.push(`${i + 1}. ${item.ok ? '✅' : '❌'} ${item.waktuTeks || waktuWita(item.waktu)}`)
      if (item.arsip) baris.push(`   ${item.arsip.nama} · ${item.arsip.ukuranTeks}`)
      if (item.unggah) baris.push(`   ${item.unggah.url}`)
      if (item.galat) baris.push(`   galat: ${item.galat}`)
    })
    /* Berkas arsip yang masih ada di server (bisa dipulihkan). */
    try {
      const lokal = fs.readdirSync(cfg.arsipDir).filter((n) => n.startsWith('backup_')).sort().slice(-6)
      if (lokal.length) {
        baris.push('', '*Arsip di server*')
        for (const n of lokal) {
          const ukuran = fs.statSync(path.join(cfg.arsipDir, n)).size
          baris.push(`• ${n} · ${mbTeks(ukuran)}`)
        }
      }
    } catch (error) { }
    return m.reply(baris.join('\n'))
  }

  if (aksi === 'pulih' || aksi === 'restore') {
    const berkas = String(args[1] || '').trim()

    /* Task171/172 — boleh langsung dari LINK hasil upload (arsip .tar.gz). */
    if (/^https?:\/\//i.test(berkas)) {
      await m.reply('⏳ Mengunduh arsip dari link…').catch(() => { })
      try {
        fs.mkdirSync(cfg.arsipDir, { recursive: true })
        const res = await fetch(berkas)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        let nama = 'unduhan.tar.gz.enc'
        try { nama = decodeURIComponent(new URL(berkas).pathname.split('/').pop() || '') || nama } catch (error) { }
        const tujuan = path.join(cfg.arsipDir, nama.replace(/[^\w.-]/g, '_'))
        fs.writeFileSync(tujuan, buf, { mode: 0o600 })
        fs.writeFileSync(cfg.pendingRestore, JSON.stringify({ berkas: tujuan, oleh: m.sender, waktu: Date.now() }, null, 2), { mode: 0o600 })
        return m.reply([
          '♻️ *PEMULIHAN DISIAPKAN*',
          '',
          `Berkas : ${path.basename(tujuan)}`,
          `Ukuran : ${mbTeks(buf.length)}`,
          'Sumber : link upload',
          '',
          'Diterapkan otomatis saat restart. Jalankan: `.restart`',
        ].join('\n'))
      } catch (error) {
        return m.reply(`❌ Gagal mengunduh: ${error.message}`)
      }
    }

    if (!berkas) {
      return m.reply([
        '♻️ *PEMULIHAN BACKUP*',
        '',
        'Pakai: `.backup pulih <berkas atau link>`',
        'Bisa pakai LINK hasil backup, atau nama berkas di server. Contoh:',
        '   .backup pulih https://upload.gwenna.my.id/<id>/backup_….tar.gz',
        '   .backup pulih data/backup-system/archives/backup_….tar.gz',
        '',
        'Setelah itu restart bot: `.restart` (data lama ditimpa arsip).',
      ].join('\n'))
    }
    const sumber = path.isAbsolute(berkas) ? berkas : path.join(akar(), berkas.replace(/^[\\/]+/, ''))
    if (!fs.existsSync(sumber)) return m.reply(`❌ Berkas tidak ditemukan: ${berkas}`)
    let ringkas = { jumlah: 0 }
    try { ringkas = pratinjauArsip(sumber) } catch (error) { }
    try {
      fs.mkdirSync(cfg.dir, { recursive: true })
      fs.writeFileSync(cfg.pendingRestore, JSON.stringify({ berkas: sumber, oleh: m.sender, waktu: Date.now() }, null, 2), { mode: 0o600 })
    } catch (error) {
      return m.reply(`❌ Gagal menyiapkan pemulihan: ${error.message}`)
    }
    return m.reply([
      '♻️ *PEMULIHAN DISIAPKAN*',
      '',
      `Berkas : ${path.basename(sumber)}`,
      `Ukuran : ${mbTeks(fs.statSync(sumber).size)}`,
      `Isi    : ${ringkas.jumlah} entri`,
      `  • sesi bot utama : ${ringkas.adaSesi ? '✅' : '—'}`,
      `  • sesi jadibot   : ${ringkas.adaJadibot ? '✅' : '—'}`,
      `  • website deploy : ${ringkas.adaSitus ? '✅' : '—'}`,
      `  • token tunnel   : ${ringkas.adaTunnel ? '✅' : '—'}`,
      `  • folder data    : ${ringkas.adaData ? '✅' : '—'}`,
      '',
      'Arsip diterapkan otomatis saat bot restart (sebelum database dibuka).',
      'Sekarang jalankan: `.restart`',
    ].join('\n'))
  }

  return m.reply(['🗄️ Pakai:', '• .backup', '• .backup sekarang', '• .backup daftar', '• .backup uji', '• .backup pulih <link|berkas>'].join('\n'))
}

handler.command = /^(backup|backupotomatis|backupsistem)$/i
handler.help = ['backup', 'backup sekarang', 'backup daftar', 'backup daftar', 'backup pulih <link|berkas>']
handler.tags = ['system', 'owner']
handler.owner = true
handler.description = 'Backup otomatis: arsip → upload.gwenna.my.id → link dikirim ke owner'

/* ── penjadwal: hidup bersama proses bot ─────────────────────────────── */
try {
  const info = mulaiPenjadwal()
  if (info.aktif) {
    console.log(`[BACKUP] penjadwal aktif: tiap ${info.intervalMenit} menit · owner +${info.owner} · unggah ${info.unggah ? 'upload.gwenna.my.id' : 'nonaktif'}`)
  } else {
    console.log(`[BACKUP] penjadwal tidak aktif (${info.alasan})`)
  }
} catch (error) {
  console.warn('[BACKUP] gagal memulai penjadwal:', error.message)
}

export default handler
export { handler }
