/* Task121 — `.menu` teks baru, `..menu` kartu rich, `..ping` = `.ping3`.
 *
 * Yang dijaga:
 *   1. teks menu baru memuat sapaan, blok info, daftar 1–6, perintah prefix,
 *      dan watermark — tanpa memotong isi
 *   2. kartu rich memakai bentuk payload yang sama dengan `.ping3`
 *      (botForwardedMessage → richResponseMessage → unifiedResponse base64),
 *      tidak dibungkus view-once
 *   3. isi base64 benar-benar bisa dibaca balik (bagian view_model + HTML)
 *   4. `..menu` → kartu rich, `.menu` → teks (aturan prefix)
 *   5. `..ping` meneruskan ke handler `.ping3`
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { bangunTeksMenu, PILIHAN_BAWAAN, BATAS_TEKS } from '../lib/umi-menu/menu-text.js'
import { bangunPesanKartuLive, bagianHtml } from '../lib/rich-live-card.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baca = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const CONTOH_INFO = [
  '┇👋 Hai welcome saya *Umi Usanagi AI*',
  '╭ INFO BOT ─',
  '│ Name  : Umi Usanagi AI',
  '│ Owner : AlzRiss',
].join('\n')

test('TASK121: teks menu baru memuat sapaan, info, daftar menu, watermark', () => {
  const teks = bangunTeksMenu({
    sapaan: 'Selamat Pagi @Alz aja',
    info: CONTOH_INFO,
    pilihan: PILIHAN_BAWAAN,
    prefix: '.',
    watermark: 'By AlzRiss - Usanagi Umi AI',
  })

  assert.ok(teks.startsWith('Selamat Pagi @Alz aja'), 'sapaan di baris pertama')
  assert.ok(teks.includes('INFO BOT'), 'blok info ikut')
  assert.ok(teks.includes('📋 *MENU UTAMA*'))
  PILIHAN_BAWAAN.forEach((opsi, index) => {
    assert.ok(teks.includes(`${index + 1}. ${opsi.label}`), `nomor ${index + 1} ada`)
    assert.ok(teks.includes(`   .${opsi.command}`), `perintah .${opsi.command} ada`)
  })
  assert.ok(teks.includes('Ketik nomor (1-6)'))
  assert.ok(teks.trimEnd().endsWith('By AlzRiss - Usanagi Umi AI'), 'watermark di akhir')
  assert.equal(PILIHAN_BAWAAN.length, 6, 'enam pilihan seperti sebelumnya')
})

test('TASK121: teks menu aman kalau info kosong / kepanjangan', () => {
  const tanpaInfo = bangunTeksMenu({ pilihan: PILIHAN_BAWAAN, prefix: '$' })
  assert.ok(tanpaInfo.startsWith('📋 *MENU UTAMA*'), 'tanpa sapaan/info tetap rapi')
  assert.ok(tanpaInfo.includes('$menu_all'), 'prefix mengikuti argumen')

  const panjang = bangunTeksMenu({ info: 'x'.repeat(BATAS_TEKS + 500), pilihan: PILIHAN_BAWAAN })
  assert.ok(panjang.length <= BATAS_TEKS + 2, `dipotong di ${BATAS_TEKS} karakter`)
  assert.ok(panjang.endsWith('…'), 'ada penanda terpotong')
})

test('TASK121: kartu rich berbentuk sama dengan .ping3 (tanpa view-once)', () => {
  const { message, messageId } = bangunPesanKartuLive({
    bagian: bagianHtml('<h1>halo</h1>'),
    title: 'Menu Umi Usanagi AI',
  })

  assert.ok(message.botForwardedMessage?.message?.richResponseMessage, 'richResponseMessage ada')
  assert.equal(message.viewOnceMessage, undefined, 'tanpa bungkus view-once')
  assert.equal(message.viewOnceMessageV2, undefined)
  assert.equal(message.botForwardedMessage.message.richResponseMessage.messageType, 1)
  assert.equal(message.messageContextInfo.botMetadata.botResponseId, messageId)
  assert.equal(message.botForwardedMessage.message.richResponseMessage.contextInfo.forwardOrigin, 4)

  const isi = JSON.parse(
    Buffer.from(message.botForwardedMessage.message.richResponseMessage.unifiedResponse.data, 'base64').toString()
  )
  assert.equal(isi.__typename, 'GenAIUnifiedResponse')
  assert.equal(isi.response_id, messageId)
  assert.equal(isi.sections[0].__typename, 'GenAIUnifiedResponseSection')
  assert.equal(isi.sections[0].view_model.primitive.__typename, 'GenAIaeacdsnwHtmlPrimitive')
  assert.equal(isi.sections[0].view_model.primitive.payload, '<h1>halo</h1>')
  assert.deepEqual(isi.sections[0].view_model.primitive.trusted_sources, [])
})

test('TASK121: ping3 & pengirim bersama menghasilkan payload identik', () => {
  const ping3 = baca('plugins/main/usanagi-ping3.js')
  assert.match(ping3, /import \{ kirimKartuLive \} from '\.\.\/\.\.\/lib\/rich-live-card\.js'/, 'ping3 memakai modul bersama')
  assert.ok(!/randomUUID/.test(ping3), 'tidak lagi membuat payload sendiri')
  assert.match(ping3, /kirimKartuLive\(conn, chatId, \{ bagian: htmlPayload, title \}\)/)
})

test('TASK121: aturan prefix — ".menu" teks, "..menu" kartu rich, "..ping" = ping3', () => {
  const plugin = baca('plugins/main/umi-menu.js')
  assert.match(plugin, /if \(command === 'menu'\) \{\s*\n\s*return rich\s*\n\s*\? kirimMenuLive\(conn, m, \{ prefix, teksCadangan/, '..menu → kartu rich')
  assert.match(plugin, /: sendMenuTeksBaru\(conn, m, \{ prefix \}\)/, '.menu → teks baru')
  assert.match(plugin, /'tombol'\) return sendModernMenu/, 'varian bertombol masih bisa dipanggil')

  const ping = baca('plugins/main/usanagi-ping.js')
  assert.match(ping, /if \(m\.__richMenu === true\) \{[\s\S]{0,220}import\('\.\/usanagi-ping3\.js'\)/, '..ping → ping3')
  assert.match(ping, /await ping3\(m, \{ conn, usedPrefix \}\)/, 'handler ping3 dipanggil')
})

test('TASK121: kartu menu memakai wallpaper (bukan latar abu-abu)', () => {
  const live = baca('lib/umi-menu/live-menu.js')
  assert.match(live, /buildHomeCard/, 'memakai kartu beranda yang sudah didesain')
  assert.match(live, /kirimKartuLive/, 'dikirim lewat pengirim kartu live')
  assert.match(live, /teksCadangan/, 'ada cadangan teks kalau kartu gagal')

  const html = baca('lib/umi-menu/html.js')
  assert.match(html, /wallpaperCss|wallpaperLayer/, 'kartu memakai lapisan wallpaper')
  const css = baca('lib/umi-menu/wallpaper.js')
  assert.match(css, /background-color:#031a2e/, 'warna dasar pekat (tidak mungkin abu-abu)')
})
