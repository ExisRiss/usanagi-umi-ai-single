/* By AlzRiss - Usanagi Umi AI
 *
 * `menuinfo` (Task117) — laporan kondisi bot saat perintah dijalankan.
 *
 * Semua angka dibaca langsung dari sumber nyata:
 *   bot        : botConfig / config/settings + jenis bot + prefix aktif
 *   server     : os & process (lib/umi-menu/status.js)
 *   user       : global.db.data.users
 *   jadibot    : global.jadibotConns (hidup = sudah tersambung WhatsApp)
 *   member grup: metadata grup WhatsApp (bila perintah dikirim di grup)
 *   fitur      : global.db.data.stats (dihitung handler.js tiap perintah)
 *   top 10     : lib/umi-menu/registry.js#topCommands
 *   game/saham : server game (game.gwenna.my.id) — endpoint publik
 *   pelaku     : baris user pengirim perintah di database
 *
 * Tidak ada angka contoh. Nilai yang tidak terbaca ditulis "Tidak tersedia".
 */

import { collectStatus, getGroupStats, formatNumber, formatDuration, formatClock } from '../../lib/umi-menu/status.js'
import { buildCatalogue, topCommands, countJadibot } from '../../lib/umi-menu/registry.js'
import { findLevel } from '../../lib/levelling.js'
import { settings } from '../../config/settings.js'
import { botKind, describeBotPrefixRule, sanitizeActivePrefix } from '../../lib/prefix-bot.js'

const GAME_BASE = String(process.env.UMI_GAME_BASE || 'https://game.gwenna.my.id').replace(/\/+$/, '')
const FETCH_TIMEOUT_MS = 4500

const ada = value => value != null && String(value).trim() !== ''
const teks = (value, fallback = 'Tidak tersedia') => (ada(value) ? String(value) : fallback)

async function ambilJson(pathname) {
  const res = await fetch(`${GAME_BASE}${pathname}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Status server game + pasar saham — dari endpoint publik, bukan karangan. */
async function statusLayanan() {
  const hasil = {
    game: { online: false, detail: 'tidak terjangkau' },
    saham: { online: false, detail: 'tidak terjangkau' },
  }

  const [market, board] = await Promise.all([
    ambilJson('/api/trading/market/public').catch(error => ({ __error: error?.message || 'gagal' })),
    ambilJson('/api/trading/leaderboard').catch(error => ({ __error: error?.message || 'gagal' })),
  ])

  if (!market.__error) {
    const simbol = Array.isArray(market.symbols) ? market.symbols.length : 0
    const sesi = market.session || {}
    const tick = Number(market.tickMs) > 0 ? `${Math.round(Number(market.tickMs) / 1000)} dtk` : null
    const pemain = Number(board && board.total)
    hasil.game = {
      online: true,
      detail: [
        simbol ? `${formatNumber(simbol)} simbol pasar` : null,
        Number.isFinite(pemain) ? `${formatNumber(pemain)} akun permainan` : null,
        tick ? `pembaruan ${tick}` : null,
      ].filter(Boolean).join(' · ') || 'terhubung',
    }
    hasil.saham = {
      online: true,
      detail: [
        sesi.label || (sesi.active ? 'sesi boost aktif' : 'pasar normal'),
        Number(sesi.boostPct) > 0 ? `boost ${formatNumber(sesi.boostPct)}%` : null,
        market.time ? `jam server ${market.time}` : null,
      ].filter(Boolean).join(' · '),
    }
  } else {
    hasil.game.detail = `tidak terjangkau (${market.__error})`
    hasil.saham.detail = `tidak terjangkau (${market.__error})`
  }

  return hasil
}

function ringkasJadibot() {
  const conns = global?.jadibotConns
  if (!conns || typeof conns.size !== 'number') {
    return { tersedia: false, total: null, hidup: null, mati: null }
  }
  const total = conns.size
  const hidup = countJadibot()
  return { tersedia: true, total, hidup, mati: Math.max(0, total - hidup) }
}

function ringkasFitur() {
  const stats = (global?.db?.data?.stats) || {}
  let dipakai = 0
  let eksekusi = 0
  for (const value of Object.values(stats)) {
    const total = Number(value && value.total) || 0
    if (total > 0) dipakai += 1
    if (total > 0) eksekusi += total
  }
  let tersedia = null
  try {
    tersedia = buildCatalogue().stats.commands
  } catch {
    tersedia = null
  }
  return { tersedia, dipakai, eksekusi }
}

function ringkasPelaku(m) {
  const user = (global?.db?.data?.users || {})[m.sender] || {}
  const nomor = String(m.sender || '').split('@')[0].split(':')[0]
  const premiumSampai = Number(user.premiumTime) || 0
  const exp = Number(user.exp) || 0
  let level = Number(user.level)
  if (!Number.isFinite(level)) {
    try { level = findLevel(exp) } catch { level = null }
  }
  const pemilik = Array.isArray(global?.owner)
    ? global.owner.some(entry => String(Array.isArray(entry) ? entry[0] : entry).replace(/\D/g, '') === nomor)
    : false
  const peran = []
  if (user.role) peran.push(String(user.role))
  if (pemilik || user.owner === true) peran.push('owner')
  if (premiumSampai > Date.now()) peran.push('premium')
  if (!peran.length) peran.push('user')
  return {
    nama: teks(user.name || m.pushName, '(tanpa nama)'),
    nomor: teks(nomor, '-'),
    peran: peran.join(' · '),
    limit: Number.isFinite(Number(user.limit)) ? formatNumber(user.limit) : 'Tidak tersedia',
    level: Number.isFinite(Number(level)) ? formatNumber(level) : 'Tidak tersedia',
    exp: Number.isFinite(exp) ? formatNumber(exp) : 'Tidak tersedia',
    premium: premiumSampai > Date.now()
      ? `aktif s/d ${new Date(premiumSampai).toLocaleString('id-ID', { timeZone: settings.timezone })}`
      : 'tidak aktif',
    terdaftar: user.registered === true ? 'sudah' : 'belum',
  }
}

let handler = async function (m, extra = {}) {
  const conn = extra.conn || this
  const jenisBot = m.__botKind || botKind(extra.botConfig)
  const prefix = sanitizeActivePrefix(jenisBot, extra.usedPrefix || settings.defaultPrefix)
  const ganda = prefix + prefix
  const waktu = formatClock(settings.timezone)

  const [status, grup, layanan] = await Promise.all([
    collectStatus({ conn, chat: m.chat, timezone: settings.timezone, cpuSampleMs: 120 }).catch(() => ({})),
    getGroupStats(conn, m.chat, { timeoutMs: 5000 }).catch(() => ({ available: false })),
    statusLayanan(),
  ])

  const server = status.server || {}
  const users = status.users || {}
  const jadibot = ringkasJadibot()
  const fitur = ringkasFitur()
  const pelaku = ringkasPelaku(m)
  const koneksi = status.connection || {}

  const baris = []
  baris.push(`🧭 *MENUINFO* · ${teks(status.botName, settings.botName)}`)
  baris.push(`🕒 ${waktu}`)
  baris.push('')

  baris.push('🤖 *BOT*')
  baris.push(`├ Nama   : ${teks(status.botName, settings.botName)}`)
  baris.push(`├ Jenis  : ${jenisBot === 'jadibot' ? 'jadibot (sewa)' : 'bot utama'}`)
  baris.push(`├ Prefix : ${prefix} — ${describeBotPrefixRule(jenisBot)}`)
  baris.push(`├ Versi  : ${teks(settings.botVersion)}`)
  baris.push(`├ Koneksi: ${teks(koneksi.label, koneksi.connected ? 'Terhubung' : 'Tidak terhubung')}`)
  baris.push(`├ Aktif  : ${server.uptimeSeconds == null ? 'Tidak tersedia' : formatDuration(server.uptimeSeconds)}`)
  baris.push(`└ Pemilik: ${teks(status.ownerName, settings.ownerName)}`)
  baris.push('')

  baris.push('🖥️ *SERVER*')
  baris.push(`├ CPU    : ${server.cpuPercent == null ? 'Tidak tersedia' : formatNumber(server.cpuPercent) + '%'} · ${server.cpuCount == null ? '?' : formatNumber(server.cpuCount)} core`)
  baris.push(`├ RAM app: ${server.rssMb == null ? 'Tidak tersedia' : formatNumber(server.rssMb) + ' MB'} · heap ${server.heapMb == null ? '?' : formatNumber(server.heapMb) + ' MB'}`)
  baris.push(`├ RAM OS : ${server.systemFreeMb == null ? 'Tidak tersedia' : formatNumber(server.systemFreeMb) + ' MB kosong'} · total ${server.systemTotalGb == null ? '?' : formatNumber(server.systemTotalGb) + ' GB'}`)
  baris.push(`├ Load   : ${server.loadAverage == null ? 'Tidak tersedia' : Number(server.loadAverage).toFixed(2)}`)
  baris.push(`├ Node   : ${teks(server.nodeVersion)}`)
  baris.push(`└ OS     : ${teks(server.platform)}`)
  baris.push('')

  baris.push('👥 *PENGGUNA*')
  baris.push(`├ User tersimpan : ${users.available ? formatNumber(users.total) : 'Tidak tersedia'}`)
  baris.push(`├ Sudah daftar   : ${users.available ? formatNumber(users.registered) : 'Tidak tersedia'}`)
  baris.push(`├ Jadibot        : ${jadibot.tersedia ? `${formatNumber(jadibot.total)} sesi` : 'Tidak tersedia'}`)
  baris.push(`├ Session hidup  : ${jadibot.tersedia ? formatNumber(jadibot.hidup) : 'Tidak tersedia'}`)
  baris.push(`├ Session mati   : ${jadibot.tersedia ? formatNumber(jadibot.mati) : 'Tidak tersedia'}`)
  baris.push(`└ Member grup    : ${grup.available ? `${formatNumber(grup.members)} (${formatNumber(grup.admins)} admin)` : (grup.reason === 'bukan-grup' ? 'bukan grup' : 'Tidak tersedia')}`)
  baris.push('')

  baris.push('🧩 *FITUR*')
  baris.push(`├ Perintah tersedia : ${fitur.tersedia == null ? 'Tidak tersedia' : formatNumber(fitur.tersedia)}`)
  baris.push(`├ Fitur pernah dipakai : ${formatNumber(fitur.dipakai)}`)
  baris.push(`└ Total eksekusi     : ${formatNumber(fitur.eksekusi)}`)
  baris.push('')

  baris.push('🏆 *TOP 10 FITUR PALING SERING DIPAKAI*')
  const top = topCommands(10)
  if (!top.length) {
    baris.push('└ Belum ada data pemakaian.')
  } else {
    top.forEach((item, index) => {
      const prefixBaris = index === top.length - 1 ? '└' : '├'
      baris.push(`${prefixBaris} ${index + 1}. ${prefix}${item.command} — ${formatNumber(item.count)}x`)
    })
  }
  baris.push('')

  baris.push('🎮 *LAYANAN*')
  baris.push(`├ Server game : ${layanan.game.online ? 'online' : 'offline'} — ${layanan.game.detail}`)
  baris.push(`└ Saham       : ${layanan.saham.online ? 'aktif' : 'offline'} — ${layanan.saham.detail}`)
  baris.push(`   ${GAME_BASE}`)
  baris.push('')

  baris.push('🙋 *PELAKU PERINTAH*')
  baris.push(`├ Nama     : ${pelaku.nama}`)
  baris.push(`├ Nomor    : ${pelaku.nomor}`)
  baris.push(`├ Peran    : ${pelaku.peran}`)
  baris.push(`├ Terdaftar: ${pelaku.terdaftar}`)
  baris.push(`├ Limit    : ${pelaku.limit}`)
  baris.push(`├ Level    : ${pelaku.level} · XP ${pelaku.exp}`)
  baris.push(`└ Premium  : ${pelaku.premium}`)
  baris.push('')
  baris.push(`Menu teks: ${prefix}menu · menu rich: ${ganda}menu · ping rich: ${ganda}ping`)

  await m.reply(baris.join('\n'))
  return { ok: true, mode: 'text' }
}

handler.command = /^menuinfo$/i
handler.help = ['menuinfo']
handler.tags = ['main']
handler.category = 'main'
handler.description = 'Info lengkap bot: server, user, jadibot, session, member grup, pemakaian fitur, top 10, status game & saham, dan status pelaku perintah'
handler.limit = false

export default handler
