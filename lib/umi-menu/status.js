/* By AlzRiss - Usanagi Umi AI
 *
 * Sumber angka menu: semuanya dibaca dari kondisi nyata saat itu.
 * Tidak ada angka hardcoded. Kalau data tidak ada → "Tidak tersedia",
 * bukan angka karangan.
 */

import os from 'os'

const BYTES_IN_GB = 1024 ** 3

function mb(bytes) {
  return Math.round(Number(bytes || 0) / 1048576)
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const parts = []
  if (days) parts.push(`${days}h`)
  if (hours) parts.push(`${hours}j`)
  if (minutes) parts.push(`${minutes}m`)
  if (!days && !hours) parts.push(`${secs}s`)
  return parts.join(' ')
}

export function formatNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 'Tidak tersedia'
  return number.toLocaleString('id-ID')
}

export function formatClock(timezone = 'Asia/Makassar') {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: timezone,
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date()).replace(/\./g, ':') + ' WITA'
  } catch {
    return new Date().toISOString()
  }
}

/** Status koneksi WhatsApp dari objek socket yang hidup. */
export function getConnectionStatus(conn) {
  const state = conn?.ws?.readyState
  const hasUser = Boolean(conn?.user?.id)
  if (state === 1) return { connected: true, label: 'Terhubung' }
  if (state === 0) return { connected: false, label: 'Menghubungkan…' }
  if (state === 2) return { connected: false, label: 'Menutup koneksi…' }
  if (hasUser) return { connected: true, label: 'Terhubung (soket tidak terbaca)' }
  return { connected: false, label: 'Tidak terhubung' }
}

/** Statistik proses & server — nilai asli dari os/process. */
export async function getServerStats(options = {}) {
  const sampleMs = Number(options.sampleMs) || 200
  const before = process.cpuUsage()
  const startedAt = process.hrtime.bigint()
  if (sampleMs > 0) await new Promise(resolve => setTimeout(resolve, sampleMs))
  const after = process.cpuUsage(before)
  const elapsedUs = Number(process.hrtime.bigint() - startedAt) / 1000
  const cpuPercent = elapsedUs > 0
    ? Math.min(100, Math.round(((after.user + after.system) / elapsedUs) * 100))
    : null

  const memory = process.memoryUsage()
  const totalMem = os.totalmem()

  return {
    cpuPercent,
    cpuCount: os.cpus()?.length || null,
    rssMb: mb(memory.rss),
    heapMb: mb(memory.heapUsed),
    systemFreeMb: mb(os.freemem()),
    systemTotalGb: Math.round((totalMem / BYTES_IN_GB) * 10) / 10,
    uptimeSeconds: Math.round(process.uptime()),
    systemUptimeSeconds: Math.round(os.uptime()),
    nodeVersion: process.version,
    platform: `${os.type()} ${os.release()}`,
    loadAverage: os.loadavg?.()?.[0],
  }
}

/** Statistik pengguna dari database bot (global.db.data.users). */
export function getUserStats() {
  const users = global?.db?.data?.users
  if (!users || typeof users !== 'object') {
    return { available: false, total: null, registered: null }
  }
  const entries = Object.entries(users)
  const registered = entries.filter(([, value]) => value && value.registered === true).length
  return { available: true, total: entries.length, registered }
}

/**
 * Statistik grup dari metadata WhatsApp.
 * Mengembalikan `available:false` (bukan melempar) bila metadata gagal.
 */
export async function getGroupStats(conn, chat, options = {}) {
  if (!chat || !String(chat).endsWith('@g.us')) {
    return { available: false, reason: 'bukan-grup' }
  }

  let timer
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('metadata grup terlalu lama')), Number(options.timeoutMs) || 12000)
    })
    const metadata = await Promise.race([conn.groupMetadata(chat), timeout])
    const participants = Array.isArray(metadata?.participants) ? metadata.participants : []
    const botJid = conn?.user?.id ? String(conn.user.id).split(':')[0].split('@')[0] : ''
    const findParticipant = value => participants.find(p => {
      const id = String(p?.id || p?.jid || '')
      return botJid && id.split(':')[0].split('@')[0] === botJid
    })

    const botParticipant = findParticipant()
    const self = String(conn?.user?.id || '')
    const selfParticipant = participants.find(p => String(p?.id || '') === self)
    const participant = botParticipant || selfParticipant

    return {
      available: true,
      subject: metadata?.subject || '(tanpa nama)',
      members: participants.length,
      admins: participants.filter(p => p?.admin === 'admin' || p?.admin === 'superadmin').length,
      botIsMember: Boolean(participant || metadata),
      botIsAdmin: participant?.admin === 'admin' || participant?.admin === 'superadmin',
      announce: metadata?.announce === true,
      restricted: metadata?.restricted === true,
      createdAt: metadata?.creation || null,
      owner: metadata?.owner || null,
    }
  } catch (error) {
    return { available: false, reason: String(error?.message || error).slice(0, 120) }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Ringkasan lengkap untuk satu pemanggilan menu. */
export async function collectStatus(context = {}) {
  const { conn, chat, timezone } = context
  const [server, group] = await Promise.all([
    getServerStats({ sampleMs: context.cpuSampleMs }),
    getGroupStats(conn, chat),
  ])
  return {
    time: formatClock(timezone),
    connection: getConnectionStatus(conn),
    server,
    users: getUserStats(),
    group,
    botName: String(global.namebot || 'Usanagi Umi AI'),
    ownerName: String(global.ownerName || global.author || 'AlzRiss'),
  }
}

export default { collectStatus, getServerStats, getUserStats, getGroupStats, getConnectionStatus, formatClock, formatDuration, formatNumber }
