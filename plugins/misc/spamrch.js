/**
 * SPAMRCH — spam reaction ke SEMUA pesan baru di sebuah WhatsApp Channel.
 * Basis: fitur /rch2 (plugins/misc/rch2.js) tapi mode spam terus-menerus.
 *
 * Pakai:
 *   .spamrch <link-channel> emoji1,emoji2,...
 *   .stopspamrch
 *
 * Contoh:
 *   .spamrch https://whatsapp.com/channel/0029Vb... 🤣,🗿,😀,🙃,🙂
 *   (link boleh menyertakan nomor post, mis. /436 — nomor post diabaikan;
 *    yang dipantau adalah SELURUH pesan baru di channel itu.)
 *
 * Cara kerja:
 *   - Saat start: resolve channel via newsletterMetadata → channelId,
 *     ambil pesan yang sudah ada sebagai "sudah dilihat" (tidak di-spam).
 *   - Tiap2 detik: newsletterFetchMessages → pesan BARU di-spam reaction
 *     dari Bot Utama + semua Jadibot aktif (sama seperti rch2), emoji
 *     dirotasi tiap reaction.
 *   - .stopspamrch (owner utama) → loop berhenti; juga auto-stop bila20
 *     tick berturut-turut semua koneksi gagal (koneksi mati / tak ikut).
 *   - Hanya1 job spam aktif; start baru otomatis menggantikan yang lama.
 *
 * Akses: rowner (perintah ini memerintahkan banyak akun WhatsApp).
 */

import fs from 'node:fs'
import { getMainConnection } from '../../lib/bot-connection-context.js'
import { getSubBots } from '../../lib/jadibot.js'

/** Log persisten — console bisa terlewat; /data/spamrch.log bisa dibaca kapan saja. */
function logSpamrch (baris) {
  try {
    fs.appendFileSync('/data/spamrch.log', `[${new Date().toISOString()}] ${baris}\n`)
  } catch { /* tetap ke console */ }
  console.log(`[SPAMRCH] ${baris}`)
}

export const SPAM_MS = 2000
export const MAX_EMOJIS = 5
export const GAGAL_BERTURUT_MAKS = 20
/* eslint-disable no-control-regex, no-misleading-character-class --
 * Kedua regex ini identik dengan yang dipakai rch2.js: karakter kontrol/
 * invisible memang sengaja dibersihkan, dan kombinasi ZWJ+VS16 adalah
 * standar pemetaan emoji (bukan kesalahan kelas karakter). */
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200D\uFE0F\u20E3#*0-9]+$/u
/* eslint-enable no-control-regex, no-misleading-character-class */
/* Lookahead menerima KOMA setelah link (`link, 🤣,🗿`) — laporan user
 *6/11: `…/0029Vb…, 🤣…` ditolak karena koma tak ada di kelas akhir. */
const LINK_CHANNEL = /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)(?:\/\d{1,24})?(?=$|[/?#\s,])/i

/** Parse input: link channel (opsional /<postId>) + daftar emoji.
 * Emoji dipisah koma DAN/ATAU spasi (`🤣,🫣,🤔 🗿` tetap diterima). */
export function parseSpamrch (value) {
  const input = String(value || '').replace(INVISIBLE, '').trim()
  const match = input.match(LINK_CHANNEL)
  if (!match) return null
  const after = input.slice((match.index || 0) + match[0].length).trim()
  const emojis = [...new Set(after.split(/[\s,]+/).map(item => item.trim()).filter(Boolean))]
  return { invite: match[1], emojis }
}

export function validEmoji (value) {
  return value.length > 0 && value.length <= 32 && EMOJI_ONLY.test(value)
}

/**
 * State job spam — sengaja murni (tanpa jaringan/timer) supaya bisa diuji.
 * `seen` = id pesan yang sudah dilihat/di-spam (termasuk yang ada saat start).
 */
export function buatStateSpam ({ invite, channelId, emojis, owner }) {
  return {
    invite,
    channelId,
    owner: owner || '',
    emojis: emojis.slice(0, MAX_EMOJIS),
    rotasi: 0,
    seen: new Set(),
    terkirim: 0,
    gagalBerturut: 0,
    lastError: '',
    berjalan: true
  }
}

/**
 * Proses satu hasil fetch pesan → daftar aksi reaction.
 * - pesan sudah di `seen` → dilewati (dedup antar tick);
 * - postingan bot sendiri (fromMe) → dilewati;
 * - tiap koneksi aktif mengirim1 reaction, emoji dirotasi global.
 * @returns {Array<{serverId: string, emoji: string}>}
 */
export function prosesPolling (state, pesanList, jumlahKoneksi, opts) {
  const lewatiFromMe = !opts || opts.lewatiFromMe !== false
  const aksi = []
  if (!state.berjalan || jumlahKoneksi < 1) return aksi
  const urut = Array.isArray(pesanList) ? [...pesanList] : []
  urut.sort((a, b) => {
    const ta = a?.messageTimestamp || 0
    const tb = b?.messageTimestamp || 0
    return ta - tb
  })
  for (const pesan of urut) {
    const id = pesan?.key?.id
    if (!id || state.seen.has(id)) continue
    state.seen.add(id)
    if (lewatiFromMe && pesan?.key?.fromMe) continue
    const serverId = String(pesan?.key?.server_id || id)
    for (let i = 0; i < jumlahKoneksi; i += 1) {
      const emoji = state.emojis[state.rotasi % state.emojis.length]
      state.rotasi += 1
      aksi.push({ serverId, emoji })
    }
  }
  return aksi
}

/**
 * Catat hasil satu tick (per koneksi: true=sukses).
 * Semua koneksi gagal berturut-turut → auto-stop.
 * @returns {'lanjut'|'stop'}
 */
export function catatHasilTick (state, hasilSemua) {
  const adaSukses = hasilSemua.some(Boolean)
  if (adaSukses) {
    state.gagalBerturut = 0
    return 'lanjut'
  }
  state.gagalBerturut += 1
  if (state.gagalBerturut >= GAGAL_BERTURUT_MAKS) {
    state.berjalan = false
    return 'stop'
  }
  return 'lanjut'
}

/* ---------- glue jaringan (tidak diuji langsung) ---------- */

function usage (prefix, command) {
  return [
    '❌ Kirim *link channel* WhatsApp dan emoji (dipisah koma atau spasi).',
    '',
    'Contoh:',
    `${prefix}${command} https://whatsapp.com/channel/0029Vb... 🤣,🗿,😀,🙃,🙂`,
    '',
    'Bot akan spam reaction ke SETIAP pesan baru di channel itu.',
    'Berhenti dengan: ' + prefix + 'stopspamrch',
  ].join('\n')
}

async function withTimeout (task, timeoutMs) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve(task),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

// library @rexxhayanasi/elaina-baileys: newsletterFetchMessages memanggil
// `logger` yang tak pernah dideklarasi di scope newsletter.js →
// ReferenceError 'logger is not defined' (terbukti di server Task207).
// Bacaan variabel di module strict tetap resolve ke global → sediakan
// global.logger SEBELUM fetch pertama (hanya kalau belum ada).
if (typeof global.logger === 'undefined') global.logger = console

function allReactionConnections () {
  const connections = []
  const seen = new Set()
  const add = (conn, type) => {
    if (!conn?.user?.id || typeof conn.newsletterMetadata !== 'function' || typeof conn.newsletterReactMessage !== 'function') return
    if (seen.has(conn)) return
    seen.add(conn)
    connections.push({ conn, type })
  }
  add(getMainConnection(), 'main')
  for (const [, conn] of getSubBots()) {
    if (conn?.__jadibotConnected === true) add(conn, 'jadibot')
  }
  return connections
}

/** Satu job spam global (start baru menggantikan yang lama). */
let job = null
/** Penjaga tick: jangan ada dua tick berjalan bersamaan (fetch bisa lambat). */
let tickBerjalan = false

function hapusJob () {
  if (job?.timer) clearInterval(job.timer)
  job = null
}

function catatError (state, label, error) {
  const pesan = String(error?.message || error || 'unknown')
  state.lastError = `${label}: ${pesan}`
  logSpamrch(state.lastError)
}

/**
 * SATU TICK inti (dipakai timer DAN probe uji): fetch → prosesPolling →
 * react. Mengembalikan status supaya pemanggil bisa melapor/berhenti.
 * @param {object} state
 * @param {Array<{conn:object,type:string}>} connections koneksi reaksi
 * @param {object} [opts] { lewatiFromMe: false } HANYA untuk uji (default true)
 */
export async function jalankanTickSekali (state, connections, opts) {
  if (!state.berjalan) return { status: 'mati' }
  if (!connections || !connections.length) {
    state.lastError = 'koneksi: tidak ada koneksi reaksi aktif (main/jadibot)'
    return { status: 'gagal', hitung: catatHasilTick(state, [false]) }
  }
  let pesanList = []
  try {
    // newsletterFetchMessages (tag 'messages') — server merespons; bug
    // `logger` diatasi lewat global.logger (lihat seed di atas).
    pesanList = await withTimeout(
      connections[0].conn.newsletterFetchMessages('jid', state.channelId, 10),
      15000
    )
  } catch (e) {
    catatError(state, 'fetch', e)
    return { status: 'gagal', hitung: catatHasilTick(state, [false]) }
  }
  const aksi = prosesPolling(state, pesanList, connections.length, opts)
  if (!aksi.length) {
    // Tidak ada pesan baru — bukan kegagalan.
    state.gagalBerturut = 0
    return { status: 'diam', aksi: 0 }
  }
  // Aksi dipetakan berurutan: aksi[k] untuk koneksi k % connections.length
  const hasil = []
  let terkirimBaru = 0
  for (let k = 0; k < aksi.length; k += 1) {
    const { conn } = connections[k % connections.length]
    const { serverId, emoji } = aksi[k]
    try {
      await withTimeout(conn.newsletterReactMessage(state.channelId, serverId, emoji), 15000)
      state.terkirim += 1
      terkirimBaru += 1
      hasil.push(true)
    } catch (e) {
      catatError(state, `react(${emoji})`, e)
      hasil.push(false)
    }
  }
  const akhir = catatHasilTick(state, hasil)
  return { status: akhir === 'stop' ? 'stop' : 'jalan', aksi: aksi.length, terkirimBaru }
}

async function tick () {
  if (tickBerjalan) return // tick sebelumnya masih berjalan — lewati
  if (!job?.state?.berjalan) return hapusJob()
  tickBerjalan = true
  try {
    const { state } = job
    // Ambil daftar koneksi TERBARU tiap tick (jadibot bisa connect/disconnect).
    const connections = allReactionConnections()
    const hasil = await jalankanTickSekali(state, connections)
    if (hasil.status === 'stop') await laporAutoStop(state)
  } finally {
    tickBerjalan = false
  }
}

async function laporAutoStop (state) {
  logSpamrch(`auto-stop setelah ${GAGAL_BERTURUT_MAKS} tick gagal; terkirim=${state.terkirim}; lastError=${state.lastError || '-'}`)
  const info = [
    '⚠️ *SPAM REAKSI AUTO-STOP*',
    '',
    `• Alasan: semua koneksi gagal ${GAGAL_BERTURUT_MAKS} tick berturut-turut.`,
    `• Total reaction terkirim: ${state.terkirim}`,
    state.lastError ? `• Error terakhir: ${state.lastError.slice(0, 300)}` : '',
  ].filter(Boolean).join('\n')
  hapusJob()
  try {
    const conn = getMainConnection()
    if (conn && state.owner) await conn.sendMessage(state.owner, { text: info })
  } catch { /* diamkan — job sudah dihapus */ }
}

const handler = async (m, { text, usedPrefix, command }) => {
  // Satu file = satu plugin default: /stopspamrch juga masuk lewat sini.
  if (/^(stopspamrch|stopspamreact)$/i.test(command)) {
    if (!job) return m.reply(`Tidak ada spam reaksi yang berjalan. Mulai dengan ${usedPrefix}spamrch <link> <emoji>.`)
    const { state } = job
    state.berjalan = false
    const info = [
      '⏹️ *SPAM REAKSI DIHENTIKAN*',
      '',
      `• Channel: ${state.channelId}`,
      `• Total reaction terkirim: ${state.terkirim}`,
      `• Pesan dipantau: ${state.seen.size}`,
    ].join('\n')
    hapusJob()
    return m.reply(info)
  }

  const parsed = parseSpamrch(text)
  if (!parsed || !parsed.emojis.length) return m.reply(usage(usedPrefix, command))
  if (parsed.emojis.length > MAX_EMOJIS) return m.reply(`❌ Maksimal ${MAX_EMOJIS} emoji dipisahkan dengan koma atau spasi.`)
  if (!parsed.emojis.every(validEmoji)) return m.reply('❌ Format emoji tidak valid. Pisahkan emoji dengan koma atau spasi, contoh: 🤣,🗿,😀')

  const connections = allReactionConnections()
  if (!connections.length) return m.reply('❌ Bot utama dan Jadibot yang terhubung tidak tersedia.')

  const metadata = await withTimeout(connections[0].conn.newsletterMetadata('invite', parsed.invite), 15000).catch(() => null)
  const channelId = String(metadata?.id || '').trim()
  if (!channelId.endsWith('@newsletter')) return m.reply('❌ Channel tidak ditemukan atau bot tidak bisa mengaksesnya.')

  // Ganti job lama bila ada.
  hapusJob()

  const state = buatStateSpam({ invite: parsed.invite, channelId, emojis: parsed.emojis, owner: m.sender })
  // Ikuti channel dulu supaya semua akun diizinkan mengirim reaction
  // (laporan6/11: reaction tak terkirim — bot kemungkinan belum follow).
  try {
    await withTimeout(connections[0].conn.newsletterFollow(channelId), 15000)
    logSpamrch(`follow ok channel=${channelId}`)
  } catch (e) {
    logSpamrch(`follow gagal (lanjut): ${e?.message || e}`)
  }
  // Sengaja TANPA pre-seed: pesan yang sudah ada saat start IKUT di-spam
  // (permintaan owner: "padahal aku udah kirim" — pesannya harus kena).

  job = { state, dimulai: Date.now() }
  job.timer = setInterval(() => { tick().catch(e => { logSpamrch(`tick fatal: ${e?.message || e}`) }) }, SPAM_MS)
  logSpamrch(`start channel=${channelId} emoji=${state.emojis.join(',')} koneksi=${connections.length}`)

  return m.reply([
    '🔴 *SPAM REAKSI DIMULAI*',
    '',
    `• Channel: ${channelId}`,
    `• Emoji: ${state.emojis.join(', ')}`,
    `• Dari: Bot Utama + ${Math.max(0, connections.length - 1)} Jadibot aktif`,
    `• Interval: ${SPAM_MS / 1000} detik (tiap pesan baru di-spam)`,
    '',
    `Berhenti kapan saja dengan ${usedPrefix}stopspamrch`,
  ].join('\n'))
}

handler.help = ['spamrch <link-channel> <emoji1,emoji2,...>', 'stopspamrch']
handler.tags = ['owner']
handler.command = /^(spamrch|spamreact|spamrch2|stopspamrch|stopspamreact)$/i
// Memerintahkan Bot Utama + seluruh Jadibot aktif → khusus owner utama.
handler.rowner = true
handler.description = 'Spam reaction ke semua pesan baru di channel (basis rch2) — berhenti dengan .stopspamrch'

export default handler
