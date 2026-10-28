/* By AlzRiss - Usanagi Umi AI
 *
 * Task147 — `/autorestart on|off`
 *
 * Menyalakan / mematikan restart otomatis SETELAH pembaruan dari GitHub
 * diterapkan (auto update tetap jalan dalam dua keadaan; yang berubah hanya
 * "restart sendiri atau tunggu perintah").
 *
 *   /autorestart on   → pembaruan diterapkan lalu bot restart sendiri
 *                       (perilaku lama; bawaan)
 *   /autorestart off  → pembaruan tetap ditulis ke server, TAPI bot tidak
 *                       restart. Perubahan baru aktif setelah `/restart`.
 *
 * Nilainya disimpan di data/auto-update.json (`restartOtomatis`) sehingga
 * tetap berlaku setelah bot menyala ulang. Kredensial panel tidak pernah
 * dicetak ke chat.
 */

import { bacaKonfig, simpanKonfig, bacaState, putuskanRestart } from '../../lib/auto-update.js'

const TUTORIAL = `♻️ *AUTO RESTART*

Mengatur apakah bot restart SENDIRI setelah pembaruan dari GitHub diterapkan.

.autorestart        status sekarang
.autorestart on     nyalakan (update → restart otomatis)
.autorestart off    matikan (update tetap masuk, restart manual dengan /restart)

Auto update (pemeriksaan repo) tetap berjalan walau auto restart dimatikan.`

function ringkas() {
  const cfg = bacaKonfig(true)
  const state = bacaState()
  const nyala = putuskanRestart(cfg)
  const baris = [
    TUTORIAL,
    '',
    '*Status*',
    `Auto restart  : ${nyala ? 'ON ✅' : 'OFF ⏹️'}`,
    `Auto update   : ${cfg.aktif ? 'ON' : 'OFF'}`,
    `Interval cek  : ${Math.max(5, Number(cfg.intervalMenit) || 30)} menit`,
    `Commit terakhir: ${state.sha ? String(state.sha).slice(0, 10) : 'belum pernah sinkron'}`,
    `Perlu restart : ${state.perluRestart ? 'ya' : 'tidak'}`,
  ]
  if (!nyala && state.perluRestart) {
    baris.push('', '⚠️ Ada pembaruan yang sudah ditulis tetapi belum aktif. Jalankan /restart.')
  }
  return baris.join('\n')
}

let handler = async function (m, { text = '' } = {}) {
  const arg = String(text || '').trim().toLowerCase()

  if (!arg || arg === 'status') return m.reply(ringkas())

  if (arg === 'on' || arg === 'nyala' || arg === 'aktif') {
    simpanKonfig({ restartOtomatis: true })
    return m.reply([
      '✅ *AUTO RESTART AKTIF*',
      '',
      'Setiap pembaruan yang berhasil ditulis akan langsung diikuti restart bot.',
      'Matikan: /autorestart off',
    ].join('\n'))
  }

  if (arg === 'off' || arg === 'mati') {
    simpanKonfig({ restartOtomatis: false })
    return m.reply([
      '⏹️ *AUTO RESTART DIMATIKAN*',
      '',
      'Berkas pembaruan tetap diunduh dan ditulis, tetapi bot TIDAK restart sendiri.',
      'Aktifkan perubahannya kapan pun dengan /restart.',
      '',
      'Nyalakan lagi: /autorestart on',
    ].join('\n'))
  }

  return m.reply('Pilihan: /autorestart on, /autorestart off, /autorestart status')
}

handler.help = ['autorestart', 'autorestart on', 'autorestart off', 'autorestart status']
handler.tags = ['owner']
handler.command = /^autorestart$/i
handler.description = 'Saklar restart otomatis setelah auto update (owner & developer)'
handler.owner = true
handler.group = false
handler.private = false
handler.limit = false
handler.fail = null

export { handler }
export default handler
