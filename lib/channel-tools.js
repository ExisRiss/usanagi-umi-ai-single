/* By AlzRiss - Usanagi Umi AI
 *
 * Helper saluran WhatsApp (newsletter) untuk bot ini.
 *
 * Diadaptasi dari `lib/channels.js` bot VanXone Multi Device, tapi:
 *   - memakai `conn` (socket elaina-baileys) yang sudah ada di handler kita;
 *   - simpanan tujuan tidak memakai lib store mereka, cukup satu berkas
 *     JSON kecil di data/channel-target.json (mode 0600);
 *   - setiap fungsi Baileys dicek dulu supaya bot tidak crash kalau versi
 *     paket berubah.
 */
import fs from 'node:fs'
import path from 'node:path'

export class ChannelError extends Error {}

const STORE_FILE = () => process.env.UMI_CHANNEL_STORE || path.join(process.cwd(), 'data', 'channel-target.json')

/** https://whatsapp.com/channel/<kode>[/id] | 1203630…@newsletter → ref */
export function parseRef(input) {
  const teks = String(input || '').trim()
  let cocok = teks.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]{8,80})(?:\/(\d+))?/i)
  if (cocok) return { type: 'invite', code: cocok[1], serverId: cocok[2] || null }
  cocok = teks.match(/^(\d{8,25})@newsletter$/i)
  if (cocok) return { type: 'jid', jid: `${cocok[1]}@newsletter` }
  if (/^[A-Za-z0-9_-]{10,80}$/.test(teks)) return { type: 'invite', code: teks, serverId: null }
  return null
}

function butuh(sock, ...fungsi) {
  const kurang = fungsi.filter(nama => typeof sock?.[nama] !== 'function')
  if (kurang.length) {
    throw new ChannelError(`Versi Baileys di bot ini belum punya fitur saluran (${kurang.join(', ')}).`)
  }
}

const teksDari = nilai => (nilai && typeof nilai === 'object' ? String(nilai.text ?? '') : String(nilai ?? ''))

/** Samakan bentuk metadata dari berbagai versi Baileys. */
export function normalizeMetadata(md) {
  if (!md || !md.id) return null
  const thread = md.thread_metadata || {}
  const viewer = md.viewer_metadata || {}
  return {
    id: String(md.id),
    name: teksDari(md.name || thread.name) || '-',
    desc: teksDari(md.description || thread.description) || '',
    invite: String(md.invite || thread.invite || ''),
    subs: Number(md.subscribers ?? thread.subscribers_count ?? 0) || 0,
    verified: /verified|verified_badge/i.test(String(md.verification || thread.verification || '')) || md.verified === true,
    created: Number(md.creation_time ?? thread.creation_time ?? 0) || 0,
    role: String(viewer.role || viewer.view_role || '').toUpperCase(),
    state: String(md.state?.type ?? md.state ?? ''),
  }
}

export async function channelMetadata(sock, ref) {
  butuh(sock, 'newsletterMetadata')
  const md = ref.type === 'jid'
    ? await sock.newsletterMetadata('jid', ref.jid)
    : await sock.newsletterMetadata('invite', ref.code)
  const hasil = normalizeMetadata(md)
  if (!hasil) throw new ChannelError('Saluran tidak ditemukan. Periksa link atau ID-nya.')
  return hasil
}

export const isAdminRole = role => role === 'OWNER' || role === 'ADMIN'
export const channelLink = invite => (invite ? `https://whatsapp.com/channel/${invite}` : '')
export const formatAngka = nilai => Number(nilai || 0).toLocaleString('id-ID')

/** Pesan galat yang ramah, bukan stack trace. */
export function explainChannelError(error) {
  const pesan = String(error?.message || error || '')
  if (error instanceof ChannelError) return pesan
  if (/not-authorized|401|403|forbidden/i.test(pesan)) return 'Bot tidak punya izin di saluran itu. Jadikan admin saluran dulu.'
  if (/not-found|404|item-not-found/i.test(pesan)) return 'Saluran tidak ditemukan. Periksa link atau ID-nya.'
  if (/timed? ?out/i.test(pesan)) return 'Saluran tidak menjawab (timeout). Coba lagi sebentar.'
  return `Gagal membaca saluran: ${pesan.slice(0, 160)}`
}

/* ── saluran tujuan bawaan ──────────────────────────────────────── */

export function getTargetChannel() {
  try {
    const data = JSON.parse(fs.readFileSync(STORE_FILE(), 'utf8'))
    if (!data || !data.id) return null
    return { id: String(data.id), name: String(data.name || '-'), role: String(data.role || ''), invite: String(data.invite || '') }
  } catch {
    return null
  }
}

export function setTargetChannel(value) {
  const file = STORE_FILE()
  try {
    if (!value) {
      fs.rmSync(file, { force: true })
      return null
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
    fs.renameSync(temp, file)
    return value
  } catch (error) {
    throw new ChannelError(`Gagal menyimpan saluran tujuan: ${String(error?.message || error).slice(0, 120)}`)
  }
}

export default {
  ChannelError, parseRef, channelMetadata, normalizeMetadata,
  isAdminRole, channelLink, formatAngka, explainChannelError,
  getTargetChannel, setTargetChannel,
}
