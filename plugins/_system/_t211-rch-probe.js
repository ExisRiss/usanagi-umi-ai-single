/**
 * PROBE v1 — Task G4: bukti reaction SAMPAI ke saluran (ALAT UJI, bukan fitur).
 *
 * Hipotesis: VIP (`reactChannel` di .rch) melapor sukses/antrean tetapi
 * reaction tidak muncul di channel. Probe membuktikan jalur mana yang benar
 * benar terbaca oleh WhatsApp:
 *   A. VIP  → reactChannel(link post uji, '🧪') → baca via
 *              newsletterFetchMessageUpdates + newsletterFetchMessages.
 *   B. BOTS → newsletterReactMessage (jalur koneksi akun bot, terbukti di
 *              t207) → baca ulang jalur yang sama.
 *   KESIMPULAN: emoji 🧪 terbaca dari jalur mana saja.
 * Target: pesan uji yang dikirim bot sendiri di channel langganan
 * (reaksi berlebih tidak mengganggu post orang lain; pesan uji dicoba dihapus).
 *
 * Log → /data/rch-probe.log + console [T211-PROBE].
 * Pemanggilan: otomatis saat boot (tunggu koneksi) + perintah owner .t211probe
 */

import fs from 'node:fs'
import { getMainConnection } from '../../lib/bot-connection-context.js'
import { reactChannel } from '../tools/rch.js'

const OUT = '/data/rch-probe.log'
/* Task212 — panel hosting sempat mati (HTTP 500 DaemonConnectionException)
 * sehingga /data/rch-probe.log tidak bisa dibaca. Salinan ke console tetap
 * dibuat (owner bisa lihat di panel > Console), dan hasil akhirnya juga
 * dikirim sebagai pesan WA ke owner supaya bukti tidak bergantung panel. */
const OUT_LOKAL = 'rch-probe.log'
const EMOJI_UJI = '🧪'
let jalanSekali = false
const hasil = { vip: [], conn: [], catatan: [] }

function log (baris) {
  const waktu = new Date().toISOString()
  for (const jalur of [OUT, OUT_LOKAL]) {
    try {
      if (jalur.startsWith('/')) fs.mkdirSync('/data', { recursive: true })
      fs.appendFileSync(jalur, `[${waktu}] ${baris}\n`)
      break
    } catch { /* coba jalur berikutnya */ }
  }
  console.log(`[T211-PROBE] ${baris}`)
}

/* data sistem tak pernah memuat kunci — tetap disaring jaga-jaga */
function aman (objek) {
  try {
    return JSON.stringify(objek, (k, v) => (/key|token|secret|pass/i.test(k) ? '[REDACT]' : v))
  } catch {
    return String(objek)
  }
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

/* baca dua jalur sekaligus → apakah emoji uji sudah tampak */
async function buktiBaca (conn, channelId, serverId) {
  const hasil = { updatesEmoji: false, updatesReact: false, msgEmoji: false, msgRaw: '' }
  try {
    const upd = await denganBatas(
      conn.newsletterFetchMessageUpdates(channelId, { count: 30, since: Date.now() - 300000 }),
      25000, 'fetchUpdates'
    )
    const teks = aman(upd)
    hasil.updatesEmoji = teks.includes(EMOJI_UJI)
    hasil.updatesReact = /react/i.test(teks)
    log(`fetchUpdates OK bytes=${teks.length} adaEmoji=${hasil.updatesEmoji} adaReact=${hasil.updatesReact}`)
    log(`updates-dump: ${teks.slice(0, 1500)}`)
  } catch (e) {
    log(`fetchUpdates GAGAL: ${e?.message || e}`)
  }
  try {
    const pesan = await denganBatas(conn.newsletterFetchMessages('jid', channelId, 10), 25000, 'fetchMessages')
    const target = (pesan || []).find(p => String(p?.key?.server_id || p?.key?.id || '') === String(serverId))
    const teks = aman(target || null)
    hasil.msgEmoji = teks.includes(EMOJI_UJI)
    log(`fetchMessages target=${target ? 'ADA' : 'TIDAK'} bytes=${teks.length} adaEmoji=${hasil.msgEmoji}`)
    if (target) log(`pesan-dump: ${teks.slice(0, 1500)}`)
    hasil.msgRaw = teks
  } catch (e) {
    log(`fetchMessages GAGAL: ${e?.message || e}`)
  }
  return hasil
}

async function jalankanProbe () {
  if (jalanSekali) return
  jalanSekali = true
  log('=== MULAI PROBE G4 (reaction sampai?) ===')
  try {
    /* tunggu koneksi utama siap (auto-run boot) */
    let conn = getMainConnection()
    for (let i = 0; i < 30 && (!conn || !conn.user?.id); i += 1) {
      await tidur(5000)
      conn = getMainConnection()
    }
    if (!conn || !conn.user?.id) {
      log('FATAL: koneksi utama tidak siap setelah 150 detik')
      jalanSekali = false
      return
    }
    log(`koneksi ok user=${String(conn.user.id).replace(/:\d+/, '')}`)
    log(`tipe: fetchUpdates=${typeof conn.newsletterFetchMessageUpdates} fetchMessages=${typeof conn.newsletterFetchMessages} react=${typeof conn.newsletterReactMessage}`)

    /* channel langganan — tiga sumber, diurut dari yang paling murah:
     *   1. global.links.channelId (config.js)
     *   2. saluran yang pernah muncul di chats tersimpan (tanpa jaringan)
     *   3. newsletterSubscribed (butuh koneksi; diulang bila putus) */
    let channelId = String(global.links?.channelId || '').trim()
    if (!channelId.endsWith('@newsletter')) {
      try {
        const chats = (global.conn && global.conn.chats) || {}
        const kandidat = Object.keys(chats).filter((k) => String(k).endsWith('@newsletter'))
        if (kandidat.length) {
          channelId = kandidat[0]
          log(`saluran dari chats lokal → ${channelId} (${kandidat.length} kandidat)`)
        }
      } catch { /* lanjut ke subscribed */ }
    }
    if (!channelId.endsWith('@newsletter')) {
      for (let coba = 1; coba <= 4 && !channelId.endsWith('@newsletter'); coba += 1) {
        try {
          const subs = await denganBatas(conn.newsletterSubscribed({}), 25000, 'subscribed')
          channelId = channelDariSubscribed(subs)
          log(`subscribed ok (coba ${coba}) → ${channelId || '(kosong)'}`)
        } catch (e) {
          log(`subscribed GAGAL (coba ${coba}/4): ${e && e.message ? e.message : e}`)
          await tidur(6000)
        }
      }
    }
    if (!channelId.endsWith('@newsletter')) {
      log('FATAL: tidak ada channel langganan untuk uji')
      jalanSekali = false
      return
    }

    /* metadata (invite untuk link VIP) */
    let invite = ''
    try {
      const md = await denganBatas(conn.newsletterMetadata('jid', channelId), 20000, 'metadata')
      invite = String(md?.invite || '').trim()
      log(`metadata ok invite=${invite || '(kosong)'}`)
    } catch (e) {
      log(`metadata GAGAL: ${e?.message || e}`)
    }

    /* pesan uji milik bot sendiri */
    const kirim = await denganBatas(
      conn.sendMessage(channelId, { text: `🧪 Pesan uji G4 ${new Date().toISOString()} — bukti reaction, dihapus setelah tes.` }),
      20000, 'sendMessageUji'
    )
    const serverId = String(kirim?.key?.server_id || kirim?.key?.id || '')
    log(`pesan uji terkirim server_id=${serverId || '?'}`)
    await tidur(2500)

    /* ── A. jalur VIP (.rch asli) ── */
    let vipOk = false
    if (invite && serverId) {
      const link = `https://whatsapp.com/channel/${invite}/${serverId}`
      try {
        const hasil = await denganBatas(reactChannel(link, EMOJI_UJI), 45000, 'reactChannelVIP')
        vipOk = Boolean(hasil?.ok)
        log(`VIP result: ${aman({ ok: hasil?.ok, emoji: hasil?.emoji, kunci: hasil?.kunci, usage: hasil?.usage, limit: hasil?.limit, waktu: hasil?.waktu, alasan: hasil?.alasan, sukses: hasil?.sukses })}`)
      } catch (e) {
        log(`VIP GAGAL: ${e?.message || e}`)
      }
      await tidur(5000)
      const bacaVip = await buktiBaca(conn, channelId, serverId)
      log(`KESIMPULAN VIP: ok=${vipOk} | terbaca(updates)=${bacaVip.updatesEmoji} | terbaca(msg)=${bacaVip.msgEmoji}`)
      hasil.vip.push(`• VIP ok=${vipOk} · terbaca=${bacaVip.updatesEmoji || bacaVip.msgEmoji}`)
    } else {
      log('VIP dilewati (invite/serverId kosong)')
    }

    /* ── B. jalur koneksi bot ── */
    try {
      await denganBatas(conn.newsletterReactMessage(channelId, serverId, EMOJI_UJI), 20000, 'reactConnection')
      log('CONNECTION react: SUKSES dikirim')
    } catch (e) {
      log(`CONNECTION react GAGAL: ${e?.message || e}`)
    }
    await tidur(3000)
    const bacaConn = await buktiBaca(conn, channelId, serverId)
    log(`KESIMPULAN CONNECTION: terbaca(updates)=${bacaConn.updatesEmoji} | terbaca(msg)=${bacaConn.msgEmoji}`)
    hasil.conn.push(`• Connection terbaca=${bacaConn.updatesEmoji || bacaConn.msgEmoji}`)

    /* ── bersih-bersih ── */
    try {
      await denganBatas(conn.newsletterReactMessage(channelId, serverId, ''), 20000, 'unreact')
      log('unreact connection: SUKSES')
    } catch (e) {
      log(`unreact connection GAGAL: ${e?.message || e}`)
    }
    if (typeof conn.newsletterMessageDelete === 'function') {
      try {
        await denganBatas(conn.newsletterMessageDelete(channelId, serverId), 20000, 'hapusPesanUji')
        log('pesan uji dihapus: OK')
      } catch (e) {
        log(`pesan uji GAGAL dihapus: ${e?.message || e} (biarkan, kecil)`)
      }
    } else {
      log('newsletterMessageDelete tidak tersedia — pesan uji dibiarkan')
    }

    log('=== PROBE_SELESAI ===')
    await laporOwner(conn, channelId)
  } catch (e) {
    log(`FATAL: ${e?.message || e}`)
  } finally {
    jalanSekali = false
  }
}

/* Task212 — bukti tidak lagi bergantung pada panel (yang sempat HTTP 500).
 * Ringkasan hasil dikirim sebagai pesan WA ke owner (nomor di config.js). */
async function laporOwner (conn, channelId) {
  try {
    const daftar = (Array.isArray(global.owner) ? global.owner : [])
      .map((baris) => String((Array.isArray(baris) ? baris[0] : baris) || '').replace(/[^0-9]/g, ''))
      .filter(Boolean)
    if (!daftar.length || !conn) return
    const isi = [
      '🧪 *PROBE G4 SELESAI*',
      '',
      `Saluran: ${channelId || '-'}`,
      ...(hasil.catatan.length ? ['', ...hasil.catatan] : []),
      '',
      '*A. Jalur VIP (.rch)*',
      ...(hasil.vip.length ? hasil.vip : ['-']),
      '',
      '*B. Jalur koneksi bot*',
      ...(hasil.conn.length ? hasil.conn : ['-']),
      '',
      'Baca: "terbaca=true" = emoji benar-benar sampai di saluran (bukti).',
      'Detail: /data/rch-probe.log + console [T211-PROBE].',
    ].join('\n')
    for (const nomor of daftar.slice(0, 3)) {
      try { await conn.sendMessage(`${nomor}@s.whatsapp.net`, { text: isi }) } catch (e) { log(`lapor owner +${nomor} gagal: ${e?.message || e}`) }
    }
    log('ringkasan dikirim ke owner')
  } catch (e) {
    log(`laporOwner FATAL: ${e?.message || e}`)
  }
}

/* Auto-run saat boot: tunggu sebentar supaya loader & koneksi siap dulu. */
/* 20 menit setelah boot: koneksi WhatsApp sudah matang (penutupan socket
 * "Connection Closed" di 45 detik pertama membuat newsletterSubscribed gagal),
 * dan tidak mengganggu pengguna. */
setTimeout(() => {
  jalankanProbe().catch(e => log(`FATAL async: ${e?.message || e}`))
}, 20 * 60 * 1000)

async function handler (m) {
  jalanSekali = false
  await m.reply('🧪 Probe G4 dijalankan ulang — lihat /data/rch-probe.log (butuh ±1 menit)')
  jalankanProbe().catch(e => log(`FATAL async: ${e?.message || e}`))
}

handler.help = ['t211probe']
handler.tags = ['owner']
handler.command = /^t211probe$/i
handler.rowner = true
handler.description = 'Jalankan ulang probe bukti reaction sampai ke saluran (alat uji Task G4)'

export default handler
