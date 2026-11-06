/**
 * PROBE v4 — Task207 spamrch (ALAT UJI, bukan fitur).
 *
 * Bukti jalur production terbaru: fetch = newsletterFetchMessages dengan
 * seed `global.logger` (bug library "logger is not defined" diatasi lewat
 * global — terbukti di server):
 *   A. subscribed → channel langganan: uji fetchMessages + reaction
 *      langsung 🧪 lalu hapus (transien, aman)
 *   B. glue penuh: newsletterCreate channel uji SENDIRI → kirim pesan
 *      uji → jalankanTickSekali() (jalur asli spamrch) → terkirimBaru≥1
 *      → newsletterDelete (semua jejak ikut terhapus)
 *
 * Log → /data/t207-probe.log + console [T207-PROBE].
 * Pemanggilan: otomatis saat boot + perintah owner .t207probe
 */

import fs from 'node:fs'
import { getMainConnection } from '../../lib/bot-connection-context.js'
import { buatStateSpam, jalankanTickSekali } from '../misc/spamrch.js'

const OUT = '/data/t207-probe.log'
let jalanSekali = false

function log (baris) {
  try {
    fs.appendFileSync(OUT, `[${new Date().toISOString()}] ${baris}\n`)
  } catch { /* tetap coba console */ }
  console.log(`[T207-PROBE] ${baris}`)
}

async function denganBatas (promise, ms, label) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: timeout ${ms}ms`)), ms) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function tidur (ms) { return new Promise(r => setTimeout(r, ms)) }

function channelDariSubscribed (mentah) {
  const teks = JSON.stringify(mentah || '')
  const semua = teks.match(/\d{8,25}@newsletter/g) || []
  return semua[0] || ''
}

async function jalankanProbe () {
  if (jalanSekali) return
  jalanSekali = true
  log('=== MULAI PROBE v4 ===')
  let channelIdUji = null
  try {
    const conn = getMainConnection()
    if (!conn || !conn.user?.id) {
      log('FATAL: koneksi utama belum siap')
      jalanSekali = false
      return
    }
    log(`koneksi ok user=${String(conn.user.id).replace(/:\d+/, '')}`)
    log(`tipe: fetchMessages=${typeof conn.newsletterFetchMessages} react=${typeof conn.newsletterReactMessage} subscribed=${typeof conn.newsletterSubscribed} create=${typeof conn.newsletterCreate} delete=${typeof conn.newsletterDelete} global.logger=${typeof global.logger}`)

    // A. channel langganan: fetchMessages + reaction langsung
    let channelIdLangganan = String(global.links?.channelId || '').trim()
    if (!channelIdLangganan.endsWith('@newsletter')) {
      try {
        const subs = await denganBatas(conn.newsletterSubscribed({}), 20000, 'subscribed')
        channelIdLangganan = channelDariSubscribed(subs)
        log(`subscribed ok → ${channelIdLangganan || '(kosong)'}`)
      } catch (e) {
        log(`subscribed GAGAL: ${e?.message || e}`)
      }
    }
    if (channelIdLangganan.endsWith('@newsletter')) {
      try {
        const up = await denganBatas(conn.newsletterFetchMessages('jid', channelIdLangganan, 10), 25000, 'fetchMessages')
        log(`fetchMessages (global.logger) OK jumlah=${Array.isArray(up) ? up.length : typeof up}`)
        if (Array.isArray(up) && up.length) {
          const target = up[up.length - 1]
          const serverId = String(target?.key?.server_id || target?.key?.id || '')
          log(`target langganan id=${target?.key?.id || '?'} server_id=${serverId || '?'} fromMe=${Boolean(target?.key?.fromMe)}`)
          if (serverId) {
            await denganBatas(conn.newsletterReactMessage(channelIdLangganan, serverId, '🧪'), 20000, 'react')
            log('react 🧪 ke channel langganan: SUKSES')
            await tidur(1500)
            await denganBatas(conn.newsletterReactMessage(channelIdLangganan, serverId, ''), 20000, 'unreact')
            log('unreact: SUKSES')
          }
        }
      } catch (e) {
        log(`fetchMessages/react langganan GAGAL: ${e?.message || e}`)
      }
    }

    // B. glue penuh di channel BUATAN SENDIRI
    try {
      const dibuat = await denganBatas(
        conn.newsletterCreate('Umi Probe207', 'Alat uji glue spamrch — Task207, dihapus otomatis'),
        25000, 'newsletterCreate'
      )
      channelIdUji = String(dibuat?.id || '').trim()
      log(`newsletterCreate → ${channelIdUji || JSON.stringify(dibuat).slice(0, 150)}`)
    } catch (e) {
      log(`newsletterCreate GAGAL: ${e?.message || e}`)
    }
    if (channelIdUji && channelIdUji.endsWith('@newsletter')) {
      const kirim = await denganBatas(
        conn.sendMessage(channelIdUji, { text: `🧪 Uji glue spamrch ${new Date().toISOString()} — channel uji, dihapus setelah tes.` }),
        20000, 'sendMessageUji'
      )
      log(`pesan uji terkirim id=${kirim?.key?.id || '?'}`)
      await tidur(2500)
      const state = buatStateSpam({ invite: 'probe', channelId: channelIdUji, emojis: ['🧪', '✅'], owner: 'probe' })
      // tandai semua pesan lama seen — hanya pesan uji yang boleh kena
      try {
        const ulang = await denganBatas(conn.newsletterFetchMessages('jid', channelIdUji, 15), 25000, 'fetchSeen')
        const idUji = kirim?.key?.id
        for (const p of ulang || []) {
          if (p?.key?.id && p.key.id !== idUji) state.seen.add(p.key.id)
        }
        log(`seen disiapkan=${state.seen.size} (idUji=${idUji || '?'})`)
      } catch (e) {
        log(`fetch seen GAGAL: ${e?.message || e}`)
      }
      const hasilTick = await jalankanTickSekali(state, [{ conn, type: 'main' }], { lewatiFromMe: false })
      log(`jalankanTickSekali → status=${hasilTick.status} aksi=${hasilTick.aksi ?? '-'} terkirimBaru=${hasilTick.terkirimBaru ?? '-'} lastError=${state.lastError || '(kosong)'}`)
      if (hasilTick.terkirimBaru >= 1) {
        log('GLUE_TICK: SUKSES — reaction terkirim lewat jalur asli /spamrch (updates)')
      } else {
        log('GLUE_TICK: GAGAL — lihat lastError di atas')
      }
    }

    log('=== PROBE_SELESAI ===')
  } catch (e) {
    log(`FATAL: ${e?.message || e}`)
  } finally {
    if (channelIdUji) {
      try {
        const conn = getMainConnection()
        await denganBatas(conn.newsletterDelete(channelIdUji), 25000, 'newsletterDelete')
        log(`channel uji dihapus: ${channelIdUji}`)
      } catch (e) {
        log(`newsletterDelete GAGAL: ${e?.message || e} — hapus manual channel "Umi Probe207"`)
      }
    }
    jalanSekali = false
  }
}

/* Auto-run boot DIMATIKAN setelah bukti hijau (log /data/t207-probe.log
 * MULAI PROBE v4 → GLUE_TICK: SUKSES → PROBE_SELESAI). Jalankan manual
 * kapan saja dengan perintah rowner: .t207probe */

async function handler (m) {
  jalanSekali = false
  await m.reply('🧪 Probe spamrch dijalankan ulang — lihat /data/t207-probe.log')
  jalankanProbe().catch(e => log(`FATAL async: ${e?.message || e}`))
}

handler.help = ['t207probe']
handler.tags = ['owner']
handler.command = /^t207probe$/i
handler.rowner = true
handler.description = 'Jalankan ulang probe diagnostic spamrch (alat uji Task207)'

export default handler
