/* By AlzRiss - Usanagi Umi AI */

import { normalizeNumber, resolvePhoneNumber } from './awang-cekakses.js'

/* ============================================================
 * Task119 — CACHE STATUS ADMIN
 *
 * Keluhan owner: bot jadi delay. Sumbernya ketemu di sini: setiap pesan grup
 * yang bot-nya bukan admin, handler menjalankan pengecekan ulang berbasis LID.
 * Untuk setiap peserta ber-LID fungsi di bawah memanggil
 * `resolvePhoneNumber()` → permintaan ke WhatsApp. Di grup 50 orang itu bisa
 * puluhan permintaan per pesan (dibatasi 2,2 detik oleh handler), jadi setiap
 * perintah terasa lambat.
 *
 * Perbaikan:
 *   1. hasil "bukan admin" disimpan 60 detik (hasil positif tetap dihitung
 *      ulang supaya hak admin yang dicabut langsung berlaku),
 *   2. pemetaan LID → nomor di-cache 5 menit,
 *   3. pencarian peserta ber-LID dibatasi 6 percobaan per pesan.
 * ============================================================ */

const NEGATIF_TTL_MS = 60_000
const NOMOR_TTL_MS = 5 * 60_000
const MAKS_LID = 6
const MAKS_ENTRI = 2000

const negatif = new Map()
const nomorCache = new Map()

function batasi(map, maks = MAKS_ENTRI) {
  while (map.size > maks) map.delete(map.keys().next().value)
}

function kunciAdmin(conn, groupId, jid) {
  return `${conn?.user?.id || conn?.user?.jid || 'bot'}|${groupId}|${normalizeJid(jid)}`
}

/** true kalau status "bukan admin" baru saja dihitung (hemat jalur lambat). */
function barusanNegatif(key) {
  const sampai = negatif.get(key)
  if (!sampai) return false
  if (sampai > Date.now()) return true
  negatif.delete(key)
  return false
}

function simpanNegatif(key) {
  negatif.set(key, Date.now() + NEGATIF_TTL_MS)
  batasi(negatif)
}

async function nomorDariLid(jid, conn) {
  const kunci = String(jid || '')
  const tersimpan = nomorCache.get(kunci)
  if (tersimpan && tersimpan.expires > Date.now()) return tersimpan.value
  let nilai = ''
  try {
    nilai = await resolvePhoneNumber(jid, conn)
  } catch {
    nilai = ''
  }
  nomorCache.set(kunci, { value: nilai, expires: Date.now() + NOMOR_TTL_MS })
  batasi(nomorCache)
  return nilai
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function candidateJids(participant) {
  if (!participant || typeof participant !== 'object') return []
  return [participant.id, participant.jid, participant.lid, participant.pn, participant.phoneNumber]
    .map(text)
    .filter(Boolean)
}

function normalizeJid(value) {
  const candidate = text(value).toLowerCase()
  if (!candidate) return ''
  const [local, domain = ''] = candidate.split('@', 2)
  if (!local) return ''
  const cleanLocal = local.split(':', 1)[0]
  return domain ? `${cleanLocal}@${domain}` : cleanLocal
}

function phoneNumberFromJid(value) {
  const jid = normalizeJid(value)
  if (!jid || jid.endsWith('@lid') || jid.endsWith('@g.us') || jid.endsWith('@newsletter')) return ''
  const number = normalizeNumber(jid)
  return number.length >= 7 && number.length <= 15 ? number : ''
}

export function sameParticipant(a, b) {
  const left = normalizeJid(a)
  const right = normalizeJid(b)
  if (!left || !right) return false
  if (left === right) return true

  const leftNumber = phoneNumberFromJid(left)
  const rightNumber = phoneNumberFromJid(right)
  return Boolean(leftNumber && rightNumber && leftNumber === rightNumber)
}

export function findParticipant(metadata, jid) {
  const participants = Array.isArray(metadata?.participants) ? metadata.participants : []
  if (!jid) return null
  return participants.find((participant) =>
    candidateJids(participant).some((candidate) => sameParticipant(candidate, jid))
  ) || null
}

export function participantIsAdmin(participant) {
  return Boolean(
    participant?.admin === 'admin' ||
    participant?.admin === 'superadmin' ||
    participant?.isAdmin ||
    participant?.isSuperAdmin
  )
}

export async function getGroupParticipant(conn, groupId, jid, metadata = null) {
  if (!groupId?.endsWith('@g.us') || !jid) return null
  if (typeof conn?.groupMetadata !== 'function' && !metadata) return null

  const data = metadata || await conn.groupMetadata(groupId)
  const direct = findParticipant(data, jid)
  if (direct) return direct

  let resolved = ''
  try {
    resolved = await nomorDariLid(jid, conn)
  } catch {
  }

  if (!resolved) return null

  const resolvedJid = `${resolved}@s.whatsapp.net`
  const resolvedDirect = findParticipant(data, resolvedJid)
  if (resolvedDirect) return resolvedDirect

  const participants = Array.isArray(data?.participants) ? data.participants : []
  let dipakai = 0
  for (const participant of participants) {
    for (const candidate of candidateJids(participant)) {
      if (!normalizeJid(candidate).endsWith('@lid')) continue
      if (dipakai >= MAKS_LID) return null
      dipakai += 1
      try {
        const candidateNumber = await nomorDariLid(candidate, conn)
        if (candidateNumber && candidateNumber === resolved) return participant
      } catch {
      }
    }
  }

  return null
}

export async function isGroupAdmin(conn, groupId, jid, metadata = null) {
  const kunci = kunciAdmin(conn, groupId, jid)
  if (barusanNegatif(kunci)) return false
  try {
    const participant = await getGroupParticipant(conn, groupId, jid, metadata)
    const admin = participantIsAdmin(participant)
    if (!admin) simpanNegatif(kunci)
    return admin
  } catch {
    return false
  }
}

export async function getBotParticipant(conn, groupId, metadata = null) {
  const botJid = text(conn?.user?.id)
  if (!botJid) return null
  return getGroupParticipant(conn, groupId, botJid, metadata)
}

export async function isBotAdmin(conn, groupId, metadata = null) {
  const kunci = kunciAdmin(conn, groupId, conn?.user?.id || conn?.user?.jid || '')
  if (barusanNegatif(kunci)) return false
  try {
    const participant = await getBotParticipant(conn, groupId, metadata)
    const admin = participantIsAdmin(participant)
    if (!admin) simpanNegatif(kunci)
    return admin
  } catch {
    return false
  }
}

export function getParticipantJid(participant, fallback = '') {
  const candidates = candidateJids(participant)
  return candidates.find((value) => value.includes('@s.whatsapp.net')) || candidates[0] || text(fallback)
}

export default { sameParticipant, findParticipant, participantIsAdmin, getGroupParticipant, isGroupAdmin, getBotParticipant, isBotAdmin, getParticipantJid }
