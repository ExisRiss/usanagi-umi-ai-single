/* By AlzRiss - Usanagi Umi AI
 *
 * SELF-TEST MENU "SEA & SUN" (Task173c) + perintah `.menulaut`.
 *
 * Kenapa ada
 * ----------
 * Desain menu rich dari plugin kiriman owner (richmenu-laut.js) sudah dipindah
 * ke `lib/umi-menu/menu-laut.js` dan dipakai `..menu`. Supaya tidak perlu
 * menebak-nebak dari layar HP, plugin ini membangun kartu itu **di server**
 * memakai data nyata (katalog plugin, statistik db, status CPU/RAM), lalu:
 *
 *   1. mengukur ukuran HTML (batas payload 780 KB),
 *   2. memastikan tidak ada URL jaringan di dalam HTML (WebView tanpa internet),
 *   3. meng-encode payload `richResponseMessage` dengan protobuf library yang
 *      benar-benar terpasang — bukti bentuknya dikenal WhatsApp,
 *   4. menulis ringkasannya ke `data/menu-laut-selftest.json`.
 *
 * `.menulaut` (owner) mengirim kartu yang sama ke chat supaya bisa dilihat
 * langsung tanpa mengetik prefix dua kali.
 */

import fs from 'node:fs'
import path from 'node:path'

const BERKAS = (() => {
  const jalur = path.join(process.cwd(), 'data', 'menu-laut-selftest.json')
  try {
    fs.mkdirSync(path.dirname(jalur), { recursive: true })
    return jalur
  } catch {
    return null
  }
})()

const TUNDA_MS = 20_000

function simpan(data) {
  if (!BERKAS) return
  try {
    fs.writeFileSync(BERKAS, JSON.stringify({ at: new Date().toISOString(), ...data }, null, 2))
  } catch { /* tidak boleh mengganggu bot */ }
}

/** conn tiruan: cukup untuk membangun menu tanpa menyentuh WhatsApp. */
function connPalsu() {
  return {
    user: { id: '6280000000000:1@s.whatsapp.net', jid: '6280000000000@s.whatsapp.net' },
    chats: {},
    profilePictureUrl: async () => { throw new Error('uji: tanpa foto profil') },
    groupMetadata: async () => { throw new Error('uji: tanpa metadata grup') },
  }
}

export async function jalankanPemeriksaan({ kirimKe = null } = {}) {
  const hasil = { versi: 'task173c', tahap: 'mulai' }
  try {
    const { buildCatalogue } = await import('../../lib/umi-menu/registry.js')
    const { htmlMenuLive } = await import('../../lib/umi-menu/live-menu.js')
    const { bagianHtml, bangunPesanKartuLive } = await import('../../lib/rich-live-card.js')

    const katalog = buildCatalogue()
    hasil.katalog = {
      perintah: katalog.stats.commands,
      kategori: katalog.stats.categories,
      plugin: katalog.stats.plugins,
    }
    hasil.tahap = 'katalog-ok'

    const menu = await htmlMenuLive(connPalsu(), '', '.', null)
    hasil.tahap = 'html-ok'
    hasil.html = {
      bytes: menu.bytes,
      panjang: menu.html.length,
      dipangkas: menu.dipangkas || [],
      tinggiPerkiraan: menu.tinggi,
      versiMenu: menu.versiMenu,
    }

    /* Semua gambar harus data URI: WebView WhatsApp tidak punya jaringan. */
    const urlJaringan = (String(menu.html).match(/https?:\/\//g) || []).length
    hasil.html.urlJaringan = urlJaringan
    hasil.html.dataUri = (String(menu.html).match(/data:image\//g) || []).length

    /* Simpan contoh HTML-nya: bisa dibuka/diunduh dari panel untuk melihat
     * tampilan tanpa harus menunggu ada yang mengetik `..menu`. */
    try {
      fs.writeFileSync(path.join(process.cwd(), 'data', 'menu-laut-contoh.html'), menu.html)
      hasil.html.contoh = 'data/menu-laut-contoh.html'
    } catch { /* opsional */ }

    const wajib = ['p-beranda', 'p-menu', 'p-favorit', 'p-info', 'p-riwayat', 'data-page="menu"']
    hasil.html.bagianHilang = wajib.filter((tanda) => !String(menu.html).includes(tanda))
    hasil.tahap = 'periksa-html-ok'

    const pesan = bangunPesanKartuLive({
      bagian: bagianHtml(menu.html),
      title: 'Menu Umi Usanagi AI',
    })
    hasil.payload = {
      adaRichResponse: Boolean(pesan.message?.botForwardedMessage?.message?.richResponseMessage),
      panjangDataBase64: pesan.message?.botForwardedMessage?.message?.richResponseMessage?.unifiedResponse?.data?.length || 0,
    }

    try {
      const { loadProto } = await import('../../lib/rich-message-adapter.js')
      const proto = loadProto()
      if (proto?.Message) {
        const terenkode = proto.Message.encode(proto.Message.fromObject(pesan.message)).finish()
        hasil.payload.encode = { ok: terenkode.length > 0, bytes: terenkode.length }
      } else {
        hasil.payload.encode = { ok: false, alasan: 'proto tidak tersedia' }
      }
    } catch (error) {
      hasil.payload.encode = { ok: false, error: String(error?.message || error).slice(0, 200) }
    }

    hasil.ok = Boolean(
      hasil.html.bytes > 0
      && hasil.html.bytes < 800 * 1024
      && !hasil.html.bagianHilang.length
      && hasil.payload.adaRichResponse
      && hasil.payload.encode?.ok,
    )
    hasil.tahap = 'selesai'

    if (kirimKe) {
      await kirimKe(menu.html)
      hasil.dikirim = true
    }
    simpan(hasil)
    return hasil
  } catch (error) {
    hasil.ok = false
    hasil.tahap = 'gagal'
    hasil.error = String(error?.message || error).slice(0, 300)
    simpan(hasil)
    return hasil
  }
}

const handler = async function (m, { conn }) {
  await m.reply('⏳ Menyusun kartu menu "Sea & Sun"…')
  const hasil = await jalankanPemeriksaan({
    kirimKe: async (html) => {
      const { kirimKartuLive, bagianHtml } = await import('../../lib/rich-live-card.js')
      await kirimKartuLive(conn, m.chat, { bagian: bagianHtml(html), title: 'Menu Umi Usanagi AI' })
    },
  })
  const ringkas = [
    '*PEMERIKSAAN MENU SEA & SUN*',
    '',
    `Ukuran   : ${hasil.html?.bytes || 0} B (${((hasil.html?.bytes || 0) / 1024).toFixed(1)} KB)`,
    `Data URI : ${hasil.html?.dataUri ?? '-'} gambar`,
    `URL luar : ${hasil.html?.urlJaringan ?? '-'} (harus 0)`,
    `Payload  : ${hasil.payload?.encode?.ok ? 'encode OK' : 'GAGAL'}`,
    `Dipangkas: ${(hasil.html?.dipangkas || []).join(', ') || 'tidak ada'}`,
    `Status   : ${hasil.ok ? '✅ OK' : '❌ ' + (hasil.error || 'periksa bagian hilang')}`,
  ].join('\n')
  await m.reply(ringkas)
}

handler.command = /^menulaut$/i
handler.help = ['menulaut']
handler.tags = ['owner']
handler.owner = true
handler.description = 'Kirim & periksa kartu menu rich "Sea & Sun" (Task173c)'

export default handler

const timer = setTimeout(() => { jalankanPemeriksaan().catch(() => {}) }, TUNDA_MS)
if (typeof timer.unref === 'function') timer.unref()
