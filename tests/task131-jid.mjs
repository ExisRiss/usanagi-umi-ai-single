/* Tes Task131 — "TypeError: jid?.endsWith is not a function"
 *
 * Laporan owner: `.tebakwarna` di grup gagal dengan error di baileys.
 * Penyebabnya `m.reply(teks, m)` — di Umi argumen kedua adalah ID CHAT, jadi
 * objek pesan terkirim sebagai tujuan dan baileys meledak.
 *
 * Yang dijaga di sini:
 *   1. penjaga id chat (lib/jid-guard.js) mengenali string & objek pesan
 *   2. opsi kirim tidak tertukar dengan objek pesan
 *   3. tidak ada lagi plugin yang memakai pola `m.reply(teks, m)`
 *   4. lib/simple.js benar-benar memakai penjaga itu di reply/sendFile
 *   5. simulasi: pola lama melempar, pola baru tidak
 *
 * Jalankan: node --test tests/task131-jid.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { jidTujuan, opsiKirim } = await import('../lib/jid-guard.js')

const GRUP = '120363432846469289@g.us'
const PM = '62895627057955@s.whatsapp.net'

/* Objek pesan seperti yang dipegang plugin (hasil smsg) */
function pesanTiruan() {
  return {
    chat: GRUP,
    sender: PM,
    key: { remoteJid: GRUP, fromMe: false, id: 'ABCD1234' },
    text: '.tebakwarna',
    isGroup: true,
  }
}

test('jidTujuan: string id dipakai apa adanya', () => {
  assert.equal(jidTujuan(GRUP), GRUP)
  assert.equal(jidTujuan(PM), PM)
  assert.equal(jidTujuan(`  ${GRUP}  `), GRUP, 'spasi dipangkas')
})

test('jidTujuan: objek pesan diambil id chat-nya', () => {
  assert.equal(jidTujuan(pesanTiruan()), GRUP)
  assert.equal(jidTujuan({ chat: PM }), PM)
  assert.equal(jidTujuan({ key: { remoteJid: GRUP } }), GRUP)
})

test('jidTujuan: tidak ada id → pakai cadangan, kalau kosong semua → string kosong', () => {
  assert.equal(jidTujuan(undefined, PM), PM)
  assert.equal(jidTujuan(null, PM), PM)
  assert.equal(jidTujuan({}, PM), PM)
  assert.equal(jidTujuan(12345), '')
  assert.equal(jidTujuan(undefined), '')
  assert.equal(jidTujuan({}, ''), '')
})

test('opsiKirim: objek pesan tidak dianggap opsi', () => {
  assert.equal(opsiKirim(pesanTiruan()), undefined, 'objek pesan harus dibuang')
  assert.equal(opsiKirim({ mentions: [PM] })?.mentions?.[0], PM, 'opsi sah diteruskan')
  assert.equal(opsiKirim(undefined), undefined)
  assert.equal(opsiKirim('teks'), undefined)
})

test('tidak ada plugin yang masih memakai m.reply(teks, m)', () => {
  const pelanggar = []
  const jelajah = dir => {
    for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entri.name)
      if (entri.isDirectory()) {
        if (entri.name === 'node_modules' || entri.name.startsWith('.')) continue
        jelajah(p)
      } else if (entri.name.endsWith('.js')) {
        const isi = fs.readFileSync(p, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
        if (/\bm\.reply\([^\n;]*,\s*m\s*\)/.test(isi)) pelanggar.push(path.relative(AKAR, p))
      }
    }
  }
  jelajah(path.join(AKAR, 'plugins'))
  assert.deepEqual(pelanggar, [], `plugin ini masih kirim objek pesan sebagai id chat: ${pelanggar.join(', ')}`)
})

test('lib/simple.js memakai penjaga di reply, m.reply, dan sendFile', () => {
  const isi = fs.readFileSync(path.join(AKAR, 'lib/simple.js'), 'utf8')
  assert.match(isi, /import \{ jidTujuan, opsiKirim \} from '\.\/jid-guard\.js'/)
  // conn.reply
  assert.ok(/const tujuan = jidTujuan\(jid,/.test(isi), 'conn.reply memakai jidTujuan')
  // m.reply
  assert.ok(/const tujuan = jidTujuan\(chatId, this\.chat\)/.test(isi), 'm.reply memakai jidTujuan')
  assert.ok(/opsiKirim\(options\)/.test(isi), 'm.reply membuang opsi yang ternyata objek pesan')
  // sendFile
  assert.ok(/jid = jidTujuan\(jid,/.test(isi), 'sendFile memakai jidTujuan')
})

/* ── Simulasi: perilaku baileys saat menerima jid yang salah ───────────── */
function isJidNewsletter(jid) {
  // potongan asli baileys yang melempar error di laporan
  return jid?.endsWith('@newsletter')
}
function sendMessageTiruan(jid, isi) {
  if (!isJidNewsletter(jid) && jid?.endsWith) return { jid, isi }
  if (typeof jid !== 'string') throw new TypeError('jid?.endsWith is not a function')
  return { jid, isi }
}

test('pola lama memang melempar error yang dilaporkan', () => {
  assert.throws(() => sendMessageTiruan(pesanTiruan(), { text: 'halo' }), /jid\?\.endsWith is not a function/)
})

test('pola baru (lewat penjaga) mengirim ke id chat yang benar', () => {
  const m = pesanTiruan()
  const hasil = sendMessageTiruan(jidTujuan(m, m.chat), { text: 'halo' })
  assert.equal(hasil.jid, GRUP)
})

test('conn.reply dengan objek pesan sekarang mendarat di chat yang sama', () => {
  const m = pesanTiruan()
  const terkirim = []
  const conn = {
    sendMessage: (jid, isi) => {
      terkirim.push(sendMessageTiruan(jid, isi))
      return { key: { id: 'X1' } }
    },
  }
  // meniru conn.reply(jid, text) setelah penjagaan di simple.js
  const replySepertiSimple = (jid, text) => conn.sendMessage(jidTujuan(jid, m.chat), { text })
  replySepertiSimple(m, '✅ terkirim')
  assert.equal(terkirim.length, 1)
  assert.equal(terkirim[0].jid, GRUP)
  assert.equal(terkirim[0].isi.text, '✅ terkirim')
})

test('plugin game-tebakwarna sudah tidak meneruskan objek pesan', () => {
  const isi = fs.readFileSync(path.join(AKAR, 'plugins/game/game-tebakwarna.js'), 'utf8')
  assert.match(isi, /m\.reply\('❌ Masih ada soal yang belum terjawab!'\)/)
  assert.match(isi, /m\.reply\('❌ Gagal mengambil data warna!'\)/)
  assert.match(isi, /m\.reply\('❌ Tidak ada game aktif\.'\)/)
  assert.match(isi, /m\.reply\(`🧩 \*KLU:\* \$\{hint\}`\)/)
})

test('rpg-cook tidak lagi menaruh objek pesan di argumen opsi', () => {
  const isi = fs.readFileSync(path.join(AKAR, 'plugins/rpg/rpg-cook.js'), 'utf8')
  assert.match(isi, /m\.reply\(`✅ Berhasil memasak/)
  assert.doesNotMatch(isi, /m\.reply\(m\.chat, `✅ Berhasil memasak/)
})
