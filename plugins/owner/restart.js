/* By AlzRiss - Usanagi Umi AI
 *
 * Task147 — PERINTAH `/restart` (restart server dari WhatsApp)
 *
 * Kenapa dipisah dari `.autoupdate restart`:
 *   `.autoupdate` khusus developer dan isinya urusan repo GitHub. Owner bot
 *   sering hanya butuh "restart bot sekarang" tanpa menyentuh auto update.
 *   Perintah ini juga dipakai saat `/autorestart off`: pembaruan tetap masuk,
 *   restart-nya dijalankan manual lewat sini.
 *
 * Cara kerja:
 *   1. balas dulu (supaya pengirim tahu perintahnya diterima),
 *   2. tunggu 1,2 detik agar pesan benar-benar terkirim ke WhatsApp,
 *   3. `restartBot()` → API panel `power/restart` (paling andal), cadangan
 *      `restart.cmd`, terakhir keluar proses.
 *
 * Pengaman:
 *   • hanya owner / developer (`handler.owner = true`);
 *   • satu restart per 45 detik, supaya perintah dobel tidak memicu restart
 *     beruntun yang membuat bot tidak pernah selesai menyala;
 *   • kalau kredensial panel kosong, perintah MENJELASKAN itu, bukan diam.
 */

import { bacaKonfig, restartBot, bacaState } from '../../lib/auto-update.js'

let terakhirRestart = 0
const JEDA_RESTART_MS = 45 * 1000

function jamLokal(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'medium', timeStyle: 'short' }) + ' WITA'
  } catch (error) {
    return String(iso)
  }
}

function statusSingkat() {
  const cfg = bacaKonfig(true)
  const state = bacaState()
  const panel = cfg.restart || {}
  return [
    '*Status restart*',
    `Metode panel : ${panel.panelUrl && panel.apiKey && panel.serverId ? 'siap (power/restart)' : 'belum diisi'}`,
    `Perintah cmd : ${panel.cmd ? 'ada' : 'tidak ada'}`,
    `Auto restart : ${cfg.restartOtomatis !== false ? 'ON' : 'OFF'}`,
    `Perlu restart: ${state.perluRestart ? 'ya — ada pembaruan yang belum aktif' : 'tidak'}`,
    `Cek terakhir : ${jamLokal(state.cekTerakhir)}`,
  ].join('\n')
}

let handler = async function (m, { text = '' } = {}) {
  const arg = String(text || '').trim().toLowerCase()

  if (arg === 'status' || arg === 'cek') {
    return m.reply(statusSingkat())
  }

  const sisa = Date.now() - terakhirRestart
  if (terakhirRestart && sisa < JEDA_RESTART_MS) {
    const detik = Math.ceil((JEDA_RESTART_MS - sisa) / 1000)
    return m.reply(`⏳ Restart baru saja dijalankan. Tunggu ${detik} detik lagi kalau bot belum menyala.`)
  }
  terakhirRestart = Date.now()

  const cfg = bacaKonfig(true)
  const panel = cfg.restart || {}
  const adaPanel = Boolean(panel.panelUrl && panel.apiKey && panel.serverId)

  await m.reply([
    '♻️ *Restart server diminta*',
    '',
    adaPanel
      ? `Lewat panel: ${panel.panelUrl.replace(/^https?:\/\//, '')} (server ${panel.serverId})`
      : panel.cmd ? 'Lewat perintah restart di server.' : '⚠️ Kredensial panel kosong — bot akan keluar proses dan berharap panel menyalakannya lagi.',
    '',
    'Bot menyala lagi dalam ±15–30 detik. Kalau tidak kembali, buka panel dan start manual.',
  ].join('\n'))

  /* Beri kesempatan pesan terkirim dulu; restart memutus socket. */
  setTimeout(() => {
    restartBot()
      .then((hasil) => console.log(`[restart] cara=${hasil.cara} ok=${hasil.ok} ${hasil.pesan || ''}`.trim()))
      .catch((error) => console.log('[restart] gagal: ' + (error && error.message ? error.message : error)))
  }, 1200)
  return true
}

handler.help = ['restart', 'restart status']
handler.tags = ['owner']
handler.command = /^restart$/i
handler.description = 'Restart server/bot lewat panel (owner & developer)'
handler.owner = true
handler.group = false
handler.private = false
handler.limit = false
handler.fail = null

export { handler }
export default handler
