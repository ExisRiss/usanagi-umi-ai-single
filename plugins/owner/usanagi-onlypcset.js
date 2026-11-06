/* Task205 — ONLYPCSET: pengaturan peringatan saat chat pribadi dibatasi.
 *
 * Berlaku untuk mode ONLY GROUP (.onlygc on) dan ALL BLOCKED (.onlypc off):
 * saat non-owner mengirim command di chat pribadi → warning dulu (atau
 * langsung tindakan bila warning dimatikan) → lewat batas → block/blacklist.
 *
 * Perintah:
 *   .onlygcset                 tampilkan panel + tombol
 *   .onlygcset warn on|off     nyalakan/matikan warning (off = langsung tindakan)
 *   .onlygcset jumlah <n>      jumlah warning sebelum tindakan (1–20)
 *   .onlygcset teks <pesan>    ubah teks warning
 *   .onlygcset tindakan block|blacklist
 *   .onlygcset reset           hapus hitungan warning semua user
 *
 * Tombol (quick reply) mengirim perintah di atas secara otomatis.
 */

import {
  muatConfig,
  simpanConfig,
  tindakanLabel,
  resetHitungan,
  getModeLabelSederhana,
} from './_akses-set-helpers.js'

const handler = async (m, { conn, args, usedPrefix }) => {
  const sub = String(args[0] || '').toLowerCase()
  const sisa = args.slice(1).join(' ').trim()

  if (!sub) {
    return kirimPanel(m, conn, usedPrefix, 'onlygcset')
  }

  if (sub === 'warn' || sub === 'warning') {
    if (sisa !== 'on' && sisa !== 'off') {
      return m.reply(`⚠️ Contoh: ${usedPrefix}onlygcset warn on  (off = langsung ambil tindakan)`)
    }
    const cfg = simpanConfig(global.db.data, { enabled: sisa === 'on' })
    return m.reply(`✅ Warning *${cfg.enabled ? 'ON' : 'OFF'}* — ${cfg.enabled ? 'user dapat peringatan dulu sebelum ditindak' : 'langsung ambil tindakan pada pelanggaran pertama'}.`)
  }

  if (sub === 'jumlah' || sub === 'batas' || sub === 'threshold') {
    const n = Number(sisa)
    if (!Number.isFinite(n) || n < 1 || n > 20) {
      return m.reply('⚠️ Jumlah warning harus angka 1–20. Contoh: ' + usedPrefix + 'onlygcset jumlah 5')
    }
    const cfg = simpanConfig(global.db.data, { threshold: n })
    return m.reply(`✅ Tindakan diambil setelah *${cfg.threshold} warning*.`)
  }

  if (sub === 'teks' || sub === 'text') {
    if (!sisa) return m.reply('⚠️ Contoh: ' + usedPrefix + 'onlygcset teks Jangan spam bot di sini ya!')
    const cfg = simpanConfig(global.db.data, { text: sisa })
    return m.reply('✅ Teks warning disimpan:\n' + cfg.text)
  }

  if (sub === 'tindakan' || sub === 'aksi' || sub === 'action') {
    const aksi = sisa.toLowerCase()
    if (aksi !== 'block' && aksi !== 'blacklist') {
      return m.reply('⚠️ Pilihan: block | blacklist. Atau pakai tombol di ' + usedPrefix + 'onlygcset')
    }
    const cfg = simpanConfig(global.db.data, { action: aksi })
    return m.reply('✅ Tindakan: *' + tindakanLabel(cfg.action) + '*')
  }

  if (sub === 'reset') {
    const n = resetHitungan(global.db.data)
    return m.reply(`✅ Hitungan warning dihapus (${n} catatan).`)
  }

  return kirimPanel(m, conn, usedPrefix, 'onlygcset')
}

async function kirimPanel(m, conn, usedPrefix, perintah) {
  const cfg = muatConfig(global.db.data)
  const mode = await getModeLabelSederhana()
  const body = [
    '╭─「 ' + perintah.toUpperCase() + ' 」',
    '│ Mode saat ini : *' + mode + '*',
    '│ Warning       : *' + (cfg.enabled ? 'ON' : 'OFF (langsung tindakan)') + '*',
    '│ Batas         : *' + cfg.threshold + ' warning*',
    '│ Tindakan      : *' + tindakanLabel(cfg.action) + '*',
    '│ Teks          : ' + cfg.text.slice(0, 60) + (cfg.text.length > 60 ? '…' : ''),
    '╰──────────────',
    '',
    'Berlaku saat chat pribadi dibatasi (ONLY GROUP / OFF).\nSaat mode ONLY PRIVATE, group tidak dilayani (diam tanpa warning).',
    '',
    'Perintah manual:',
    '• ' + usedPrefix + perintah + ' warn on/off',
    '• ' + usedPrefix + perintah + ' jumlah <1-20>',
    '• ' + usedPrefix + perintah + ' teks <pesan>',
    '• ' + usedPrefix + perintah + ' tindakan block/blacklist',
    '• ' + usedPrefix + perintah + ' reset',
  ].join('\n')

  try {
    const { sendInteractive } = await import('../../lib/awang-tombol.js')
    return await sendInteractive(conn, m.chat, {
      title: 'Usanagi - Ai',
      subtitle: perintah.toUpperCase(),
      body,
      footer: 'Task205 · access warning',
      buttons: [
        { label: '⚠️ Warning ON', command: perintah + ' warn on' },
        { label: '🔇 Warning OFF', command: perintah + ' warn off' },
        { label: '➕ Batas +1', command: perintah + ' jumlah ' + Math.min(20, cfg.threshold + 1) },
        { label: '➖ Batas -1', command: perintah + ' jumlah ' + Math.max(1, cfg.threshold - 1) },
        { label: '🔒 Tindakan: Block', command: perintah + ' tindakan block' },
        { label: '🏷️ Tindakan: Blacklist', command: perintah + ' tindakan blacklist' },
        { label: '🧹 Reset Hitungan', command: perintah + ' reset' },
      ],
    }, { quoted: m.raw })
  } catch {
    return m.reply(body)
  }
}

handler.help = ['onlypcset']
handler.tags = ['owner']
handler.command = /^onlypcset$/i
handler.owner = true
handler.description = 'Atur warning+tindakan untuk mode onlypc/onlygc'

export default handler
