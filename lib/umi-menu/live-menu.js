/* By AlzRiss - Usanagi Umi AI
 *
 * MENU RICH (`..menu`) — kartu HTML gaya `.ping3` (Task121).
 *
 * Owner minta prefix ganda menampilkan *rich message* seperti `.ping3`, bukan
 * pesan bertombol. Jadi kartu beranda yang sudah ada (Task113, latar
 * wallpaper, bukan abu-abu) dikirim lewat pengirim kartu live yang sama
 * dengan ping3 — satu bentuk payload, satu perilaku.
 *
 * Kalau kartu gagal dikirim, menu teks tetap dikirim (menu tidak boleh mati).
 */

import fs from 'node:fs'
import path from 'node:path'
import { settings } from '../../config/settings.js'
import { collectStatus } from './status.js'
import { buildCatalogue, topCommands, recentCommands, countJadibot, ownerProfile } from './registry.js'
/* Task173c — menu rich memakai desain "Sea & Sun" dari plugin kiriman owner
 * (richmenu-laut.js), disambungkan ke data asli bot. buildHomeCard lama tidak
 * dipakai lagi untuk `..menu`. */
import { buildMenuLaut, infoDariStatus, sapaan, VERSI_MENU } from './menu-laut.js'
import { kirimKartuLive, bagianHtml } from '../rich-live-card.js'
import { catatKartuDikirim, konfirmasiKartuTampil, richMampu, richTeksDiminta } from '../rich-capability.js'

const DEVELOPER = Object.freeze({ name: 'AlzRiss', number: '6287813709432' })

function aset(nama) {
  /* Task177 — mime mengikuti ekstensi. Dulu selalu `image/jpeg` sehingga
   * banner WebP/PNG bisa salah tafsir di WebView WhatsApp. */
  try {
    const berkas = path.resolve(process.cwd(), 'assets', 'menu', nama)
    const buf = fs.readFileSync(berkas)
    const ext = path.extname(nama).toLowerCase()
    const mime = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/** Cari aset pertama yang ada (urutan prioritas). */
function asetPertama(...nama) {
  for (const n of nama) {
    const hasil = aset(n)
    if (hasil) return hasil
  }
  return null
}

function namaBot(conn) {
  return String(
    conn?.botConfig?.values?.botName ||
    conn?.botConfig?.botName ||
    settings.botName ||
    'Usanagi Umi AI'
  )
}

/** Susun HTML kartu menu (tanpa mengirim) — dipakai juga oleh uji/manual. */
/* Task173c — data untuk menu "Sea & Sun" (desain plugin kiriman owner). */

const CACHE_AVATAR = new Map()
const IKON = {
  main: '🏠', owner: '👑', group: '👥', grup: '👥', game: '🎮', tools: '🧰',
  downloader: '📥', download: '📥', sticker: '🎨', maker: '🖌️', ai: '🤖',
  info: 'ℹ️', store: '🛒', fun: '🎉', islamic: '🕌', music: '🎵', random: '🎲',
  rpg: '⚔️', premium: '💎', canvas: '🖌️', anime: '🌸', panel: '🖥️', system: '⚙️',
}

/** Foto profil → data URI. WebView WhatsApp tidak bisa memuat URL jaringan. */
async function avatarDataUri(conn, jid) {
  const kunci = String(jid || '')
  const simpan = CACHE_AVATAR.get(kunci)
  if (simpan && Date.now() - simpan.at < 10 * 60 * 1000) return simpan.uri
  let uri = ''
  try {
    const url = await conn.profilePictureUrl(kunci, 'image')
    if (url) {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
      if (res.ok) {
        const isi = Buffer.from(await res.arrayBuffer())
        if (isi.length && isi.length < 400 * 1024) {
          uri = `data:${res.headers.get('content-type') || 'image/jpeg'};base64,${isi.toString('base64')}`
        }
      }
    }
  } catch { /* tanpa foto: kartu memakai ikon bawaan */ }
  CACHE_AVATAR.set(kunci, { at: Date.now(), uri })
  return uri
}

function versiBot() {
  try {
    return String(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')).version || '10.1.0')
  } catch {
    return '10.1.0'
  }
}

function totalGrup(conn) {
  try {
    const chats = global?.db?.data?.chats || conn?.chats || {}
    return Object.keys(chats).filter(jid => String(jid).endsWith('@g.us')).length
  } catch {
    return 0
  }
}

function modeBot(conn) {
  try {
    const jid = conn?.user?.jid || conn?.user?.id || ''
    const setelan = global?.db?.data?.settings?.[jid]
    if (setelan && setelan.public === false) return 'SELF'
    if (conn?.botConfig?.public === false) return 'SELF'
  } catch { /* anggap publik */ }
  return 'PUBLIC'
}

function labelPengguna(m, owner) {
  if (!m) return 'USER'
  if (m.fromMe) return 'OWNER'
  const bersih = String(m.sender || '').split('@')[0].replace(/\D/g, '')
  if (bersih && String(owner?.number || '').replace(/\D/g, '') === bersih) return 'OWNER'
  return 'USER'
}

/** Ambil kategori nyata dari registry untuk halaman MENU. */
function kategoriMenu(catalogue, batasKategori = 10, perKategori = 6) {
  const daftar = (catalogue.categories || []).slice(0, batasKategori)
  return daftar.map((kategori) => ({
    key: kategori.key,
    label: kategori.label,
    icon: IKON[String(kategori.key || '').toLowerCase()] || '📁',
    total: (kategori.commands || []).length,
    items: (kategori.commands || []).slice(0, perKategori).map((perintah) => ({
      cmd: perintah.command,
      desc: perintah.description || (perintah.flags?.length ? perintah.flags.join(' · ') : ''),
      owner: Boolean(perintah.ownerOnly),
      group: Boolean(perintah.flags?.includes('grup')),
    })),
  }))
}

/**
 * Susun HTML kartu menu "Sea & Sun" (tanpa mengirim).
 * @returns {Promise<{html:string, bytes:number, dipangkas:string[], tinggi:number, status:object, stats:object}>}
 */
export async function htmlMenuLive(conn, chat, prefix = '.', m = null) {
  const status = await collectStatus({ conn, chat, timezone: settings.timezone })
  const catalogue = buildCatalogue()
  const owner = ownerProfile()
  const sapa = sapaan(settings.timezone)

  const logo = aset('logo.jpg')
  /* Task176 — banner baru dari owner (1080×645) yang disimpan di assets/menu. */
  /* Task177 — versi WebP 720px (24 KB) dipakai lebih dulu: kartu utuh
   * 190 KB jadi ~110 KB supaya WhatsApp mau merendernya di semua HP.
   * Banner asli tetap disimpan sebagai cadangan. */
  const banner = asetPertama('banner-menu.webp', 'banner-menu-720.jpg', 'banner-menu.jpg', 'bg-card.jpg', 'bg.jpg')
  const avatar = m?.sender ? await avatarDataUri(conn, m.sender) : ''

  const info = infoDariStatus({
    ...status,
    prefix,
    botNumber: (conn?.user?.id || '').split(':')[0].split('@')[0] || '-',
    version: versiBot(),
    modeLabel: modeBot(conn),
    timezone: settings.timezone,
    tzLabel: 'WITA',
    tagline: 'Umi Usanagi AI',
  })

  const ctx = {
    botName: namaBot(conn),
    version: `v${versiBot()}`,
    modeLabel: modeBot(conn),
    roleLabel: labelPengguna(m, owner),
    prefix,
    tagline: 'Umi Usanagi AI',
    timezone: settings.timezone,
    tzLabel: 'WITA',
    name: m?.pushName || m?.sender?.split('@')[0] || 'Kak',
    connected: Boolean(status.connection?.connected),
    uptimeText: info.bot.find(([k]) => k === 'Uptime bot')?.[1] || '-',
    ramPct: Math.max(0, Math.min(100, Number(status.server?.cpuPercent) || 0)),
    logoDataUri: logo || '',
    bannerDataUri: banner || '',
    avatarDataUri: avatar || '',
    categories: kategoriMenu(catalogue),
    top: topCommands(8),
    recent: recentCommands(12),
    counts: {
      commands: catalogue.stats.commands,
      aliases: catalogue.stats.aliases,
      categories: catalogue.stats.categories,
      plugins: catalogue.stats.plugins,
      ownerCommands: catalogue.stats.ownerCommands,
      users: status.users?.total || 0,
      groups: totalGrup(conn),
      jadibot: countJadibot(),
    },
    info,
    owner,
    developer: DEVELOPER,
    sapaan: sapa,
  }

  const hasil = buildMenuLaut(ctx, { maxBytes: 780000 })
  return {
    html: hasil.html,
    bytes: hasil.bytes,
    dipangkas: hasil.dipangkas,
    tinggi: 3200,
    status,
    stats: catalogue.stats,
    versiMenu: VERSI_MENU,
  }
}

/**
 * Kirim `..menu` sebagai kartu rich live.
 * @returns {Promise<{ok:boolean, mode:string, panjangHtml?:number, error?:string}>}
 */
export async function kirimMenuLive(conn, m, { prefix = '.', teksCadangan = '' } = {}) {
  let html = ''
  let tinggi = 0
  try {
    const hasil = await htmlMenuLive(conn, m.chat, prefix, m)
    html = hasil.html
    tinggi = hasil.tinggi
    if (hasil.dipangkas?.length) console.log('[UMI-MENU] kartu dipangkas:', hasil.dipangkas.join(', '), '→', hasil.bytes, 'B')
  } catch (error) {
    console.warn('[UMI-MENU] gagal membangun kartu:', error?.message || error)
    if (teksCadangan) await conn.sendMessage(m.chat, { text: teksCadangan }, m?.raw ? { quoted: m.raw } : {})
    return { ok: false, mode: 'teks-cadangan', error: String(error?.message || error) }
  }

  if (tinggi > 4200) console.warn('[UMI-MENU] kartu menu tinggi:', tinggi, 'px')

  try {
    const hasil = await kirimKartuLive(conn, m.chat, {
      bagian: bagianHtml(html),
      title: `Menu ${namaBot(conn)}`.slice(0, 120),
    })
    catatKartuDikirim(m.chat)

    /* Task130 — owner komplain: `..menu` memunculkan kartu rich TAPI teks menu
     * juga ikut terkirim (dobel). Penyebabnya perilaku Task127 yang selalu
     * menambahkan versi teks untuk chat yang belum ditandai "mampu rich".
     *
     * Sekarang: kartu terkirim = selesai, TIDAK ada teks susulan. Teks hanya
     * dikirim kalau kartu benar-benar gagal (blok catch di bawah), dan bisa
     * diminta khusus lewat env UMI_RICH_TEKS=1 atau setelan
     * `.umimenu style teks` untuk chat yang HP-nya tidak bisa menampilkan kartu.
     */
    /* Task177 — akar keluhan "..menu tidak menampilkan apa pun".
     *
     * Kartu rich hanya bisa dirender WhatsApp yang mendukung
     * `botForwardedMessage.richResponseMessage`; HP WhatsApp biasa menampilkan
     * pesan kosong dan TIDAK memberi error ke pengirim. Sejak Task130 teks
     * cadangan hanya dikirim kalau `UMI_RICH_TEKS=1`, jadi di HP biasa menu
     * benar-benar tidak muncul sama sekali.
     *
     * Sekarang: kirim teks menemani kartu untuk chat yang BELUM terbukti mampu
     * (`richMampu`), dan berhenti menggandakan begitu orang itu menekan tombol
     * kartu (terbukti tampil). Bisa dipaksa lewat `UMI_RICH_TEKS`/`UMI_RICH_ALL`.
     */
    const perluTeks = Boolean(teksCadangan) && (!richMampu(m.chat) || richTeksDiminta())
    if (perluTeks) {
      await conn.sendMessage(m.chat, { text: teksCadangan }, m?.raw ? { quoted: m.raw } : {})
      return { ok: true, mode: 'rich-live+teks', panjangHtml: html.length, messageId: hasil.messageId, duplikatTeks: true }
    }
    return { ok: true, mode: 'rich-live', panjangHtml: html.length, messageId: hasil.messageId }
  } catch (error) {
    // Kartu rich ditolak → jangan biarkan `.menu`/`..menu` kosong.
    console.warn('[UMI-MENU] kartu rich gagal:', error?.message || error)
    if (teksCadangan) {
      await conn.sendMessage(m.chat, { text: teksCadangan }, m?.raw ? { quoted: m.raw } : {})
    }
    return { ok: false, mode: 'teks-cadangan', error: String(error?.message || error) }
  }
}

export { konfirmasiKartuTampil }
export default { kirimMenuLive, htmlMenuLive }
