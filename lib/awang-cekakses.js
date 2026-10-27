/* By AlzRiss - Usanagi Umi AI */

import { settings } from '../config/settings.js'
import { getDynamicOwners } from '../core/awang-ownerdb.js'
import { freshJadibotOwnerNumbers, freshMainOwnerNumbers, mergeOwnerNumbers } from './owner-source.js'

// LID resolution may require a WhatsApp query. Keep it bounded and briefly
// coalesce repeated lookups so one slow group metadata request cannot stall a
// Jadibot command queue.
const LID_RESOLVE_TIMEOUT_MS = 2200
const LID_CACHE_TTL_MS = 15000
const lidResolutionCache = new WeakMap()

/* Task124 — ingatan LID → nomor telepon.
 *
 * WhatsApp makin sering mengirim pengirim sebagai `@lid` (identitas anonim).
 * Tanpa pemetaan, pemeriksaan owner gagal dan pemilik bot kehilangan akses
 * walau nomornya sudah diisi di setelan. Setiap kali pemetaan ditemukan (dari
 * kunci pesan, signalRepository, atau metadata grup) hasilnya diingat sebentar
 * supaya pesan berikutnya tidak perlu menebak lagi. */
const LID_MEMORY_TTL_MS = 6 * 60 * 60 * 1000
const LID_MEMORY_MAX = 1000
const lidMemory = new Map()

export function ingatPemetaanLid(lidJid, nomor) {
  const key = String(lidJid || '').trim()
  const number = normalizeNumber(nomor)
  if (!key.endsWith('@lid') || number.length < 7 || number.length > 15) return ''
  lidMemory.set(key, { number, at: Date.now() })
  while (lidMemory.size > LID_MEMORY_MAX) {
    const tertua = lidMemory.keys().next().value
    lidMemory.delete(tertua)
  }
  return number
}

export function nomorDariIngatanLid(lidJid) {
  const key = String(lidJid || '').trim()
  if (!key.endsWith('@lid')) return ''
  const found = lidMemory.get(key)
  if (!found) return ''
  if (Date.now() - found.at > LID_MEMORY_TTL_MS) {
    lidMemory.delete(key)
    return ''
  }
  return found.number
}

function timed(value, timeoutMs) {
  let timer
  return Promise.race([
    Promise.resolve(value),
    new Promise(resolve => { timer = setTimeout(() => resolve(''), timeoutMs) }),
  ]).finally(() => clearTimeout(timer))
}

function lidCache(conn) {
  if (!conn || (typeof conn !== 'object' && typeof conn !== 'function')) return null
  let cache = lidResolutionCache.get(conn)
  if (!cache) {
    cache = new Map()
    lidResolutionCache.set(conn, cache)
  }
  return cache
}

export function normalizeNumber(jidOrNumber = '') {
  const withoutDomain = String(jidOrNumber).split('@')[0]
  const withoutDevice = withoutDomain.split(':')[0]
  return withoutDevice.replace(/\D/g, '')
}

export async function resolvePhoneNumber(senderJid, conn) {
  const value = String(senderJid || '').trim()
  if (!value) return ''
  if (!value.endsWith('@lid') || !conn?.signalRepository?.lidMapping) {
    return value.endsWith('@lid') ? '' : normalizeNumber(value)
  }

  try {
    const resolvedPn = await conn.signalRepository.lidMapping.getPNForLID(value)
    if (resolvedPn && !String(resolvedPn).endsWith('@lid')) {
      const number = normalizeNumber(resolvedPn)
      if (number.length >= 7 && number.length <= 15) return number
    }
  } catch {

  }

  return ''
}

function participantCandidates(participant) {
  if (!participant || typeof participant !== 'object') return []
  return [
    participant.id,
    participant.jid,
    participant.pn,
    participant.phoneNumber,
    participant.phone,
    participant.lid,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

function participantPhoneNumber(participant) {
  const candidates = participantCandidates(participant)
  const preferred = candidates.filter((value) => !value.endsWith('@lid'))
  for (const candidate of preferred) {
    const number = normalizeNumber(candidate)
    if (number.length >= 7 && number.length <= 15) return number
  }
  return ''
}

export async function resolveTargetPhoneNumber(jid, conn, groupId = '', hints = []) {
  const value = String(jid || '').trim()
  if (!value) return ''

  if (!value.endsWith('@lid')) {
    const number = normalizeNumber(value)
    return number.length >= 7 && number.length <= 15 ? number : ''
  }

  /* Task124: kunci pesan sering membawa nomor telepon asli di samping LID
   * (`senderPn` / `participantPn` / `participantAlt`). Pakai itu lebih dulu —
   * tanpa jaringan, tanpa menebak. */
  for (const hint of Array.isArray(hints) ? hints : [hints]) {
    const raw = String(hint || '').trim()
    if (!raw || raw.endsWith('@lid')) continue
    const number = normalizeNumber(raw)
    if (number.length >= 7 && number.length <= 15) return ingatPemetaanLid(value, number)
  }

  const diingat = nomorDariIngatanLid(value)
  if (diingat) return diingat

  const cache = lidCache(conn)
  const key = `${value}|${String(groupId || '')}`
  const cached = cache?.get(key)
  if (cached?.pending) return cached.pending
  if (cached && cached.expires > Date.now()) return cached.value

  const resolve = async () => {
    const mapped = await resolvePhoneNumber(value, conn)
    if (mapped) return ingatPemetaanLid(value, mapped)
    if (!groupId?.endsWith('@g.us') || typeof conn?.groupMetadata !== 'function') return ''

    try {
      const metadata = await conn.groupMetadata(groupId)
      const participants = Array.isArray(metadata?.participants) ? metadata.participants : []
      for (const participant of participants) {
        const candidates = participantCandidates(participant)
        if (!candidates.some((candidate) => candidate === value)) continue
        const number = participantPhoneNumber(participant)
        if (number) return ingatPemetaanLid(value, number)
      }
    } catch {

    }
    return ''
  }

  // Never let a slow LID/metadata request leave a command waiting forever.
  const pending = timed(resolve(), LID_RESOLVE_TIMEOUT_MS).catch(() => '')
  if (cache) cache.set(key, { pending, value: '', expires: 0 })
  const result = await pending
  if (cache) cache.set(key, { value: result, expires: Date.now() + LID_CACHE_TTL_MS })
  return result
}

export function getAllOwnerEntries(conn = null) {
  const botConfig = conn?.botConfig
  const entries = new Map()

  // Jadibot memakai owner per-session. Urutannya dipertahankan: owner yang
  // dipilih user lebih dulu, lalu owner/developer permanen dari config.js.
  if (botConfig?.type === 'jadibot') {
    const locked = normalizeNumber(global.jadibotPlatform?.lockedOwnerNumber || '')
    /* Task124: `botConfig` adalah salinan saat sesi dinyalakan. Nomor owner yang
     * baru diisi pemilik bot lewat website harus langsung berlaku, jadi berkas
     * sesi dibaca ulang di sini (murah: satu berkas JSON kecil). */
    const configured = mergeOwnerNumbers(
      Array.isArray(botConfig.ownerNumbers) ? botConfig.ownerNumbers : [],
      freshJadibotOwnerNumbers(botConfig.file),
    )
    for (const owner of [...configured, locked]) {
      const number = normalizeNumber(owner)
      if (!number || entries.has(number)) continue
      entries.set(number, {
        number,
        name: number === locked ? String(settings.ownerName || 'Developer').trim() || 'Developer' : 'Owner Bot',
        primary: true,
        locked: number === locked,
      })
    }
    return [...entries.values()]
  }

  // Bot utama: nomor owner dari setting web (kalau diisi) menang atas config.js.
  // Task124: dibaca ulang dari berkas setelan supaya nomor yang baru diisi
  // langsung diakui sebagai owner tanpa menunggu bot restart.
  const configuredMain = mergeOwnerNumbers(
    Array.isArray(botConfig?.ownerNumbers) ? botConfig.ownerNumbers.filter(Boolean) : [],
    freshMainOwnerNumbers(),
  )
  const primary = configuredMain.length
    ? configuredMain
    : (Array.isArray(settings.ownerNumbers) ? settings.ownerNumbers : [])
  const dynamic = getDynamicOwners()
  for (const owner of primary) {
    const number = normalizeNumber(owner)
    if (number) entries.set(number, { number, name: String(settings.ownerName || 'Owner').trim() || 'Owner', primary: true, locked: true })
  }

  for (const owner of dynamic) {
    const number = normalizeNumber(owner.number)
    if (!number) continue
    entries.set(number, {
      number,
      name: String(owner.name || 'Owner').trim() || 'Owner',
      primary: false,
      locked: false,
    })
  }

  return [...entries.values()]
}

export function getAllOwnerNumbers(conn = null) {
  return getAllOwnerEntries(conn).map((owner) => owner.number)
}

export async function isOwner(senderJid, conn) {
  const senderNumber = await resolvePhoneNumber(senderJid, conn)
  const owners = getAllOwnerNumbers(conn)

  const selfNumber = normalizeNumber(conn?.user?.id || '')
  if (selfNumber && senderNumber && selfNumber === senderNumber) return true

  return owners.includes(senderNumber)
}

export default {
  isOwner,
  resolvePhoneNumber,
  resolveTargetPhoneNumber,
  normalizeNumber,
  getAllOwnerNumbers,
  getAllOwnerEntries,
  ingatPemetaanLid,
  nomorDariIngatanLid,
}
