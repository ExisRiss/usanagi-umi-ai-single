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
import { buildCatalogue, topCommands, countJadibot, ownerProfile } from './registry.js'
import { buildHomeCard, perkiraanTinggiBeranda } from './html.js'
import { MENU_OPTIONS } from './render.js'
import { kirimKartuLive, bagianHtml } from '../rich-live-card.js'
import { catatKartuDikirim, konfirmasiKartuTampil, richTeksDiminta } from '../rich-capability.js'

const DEVELOPER = Object.freeze({ name: 'AlzRiss', number: '6287813709432' })

function aset(nama) {
  try {
    const buf = fs.readFileSync(path.resolve(process.cwd(), 'assets', 'menu', nama))
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
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
export async function htmlMenuLive(conn, chat, prefix = '.') {
  const status = await collectStatus({ conn, chat, timezone: settings.timezone })
  const catalogue = buildCatalogue()
  const assets = {}
  const logo = aset('logo.jpg')
  const background = aset('bg-card.jpg') || aset('bg.jpg')
  if (logo) assets.logoDataUri = logo
  if (background) assets.backgroundDataUri = background

  const menuOptions = MENU_OPTIONS.filter(option => option.command !== 'menu_refresh')
  const top = topCommands(10)

  const html = buildHomeCard({
    status,
    stats: catalogue.stats,
    prefix,
    assets,
    menuOptions,
    categories: catalogue.categories,
    top,
    jadibot: countJadibot(),
    owner: ownerProfile(),
    developer: DEVELOPER,
  })

  return {
    html,
    tinggi: perkiraanTinggiBeranda({
      kategori: Math.min(8, catalogue.categories.length),
      menuCepat: menuOptions.length,
      top: top.length,
      grup: Boolean(status.group && status.group.available),
    }),
    status,
    stats: catalogue.stats,
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
    const hasil = await htmlMenuLive(conn, m.chat, prefix)
    html = hasil.html
    tinggi = hasil.tinggi
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
    if (teksCadangan && richTeksDiminta()) {
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
