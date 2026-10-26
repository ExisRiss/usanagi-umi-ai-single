/* Task119 — uji anti-delay.
 *
 * Yang dijaga tes ini (semua perilaku, bukan sekadar bentuk kode):
 *   1. status "bukan admin" di-cache → pengecekan kedua tidak memanggil WhatsApp
 *   2. pencarian peserta ber-LID dibatasi 6 percobaan per pesan
 *   3. handler.js memuat lib/database.js SEKALI (tidak ada impor ber-cache-buster
 *      per pesan yang membocorkan memori ±8 KB tiap pesan)
 *   4. thumbnail tidak dibaca ulang dari disk tiap pesan (_allfake)
 *   5. resize/unggah thumbnail menu memakai cache (main-menu)
 *   6. probe latensi ada dan menulis baris terukur
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baca = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/* ── 1 & 2. cache status admin + batas pencarian LID ───────────── */
test('TASK119: status bukan admin di-cache, pengecekan kedua tidak menembak WhatsApp', async () => {
  const { isBotAdmin, isGroupAdmin } = await import('../lib/awang-aksesgrub.js')
  let panggilan = 0
  const participants = Array.from({ length: 12 }, (_, i) => ({ id: `11111${i}@lid`, admin: null }))
  const conn = {
    user: { id: '628111@s.whatsapp.net' },
    async groupMetadata() { panggilan += 1; return { id: 'g@g.us', participants } },
    signalRepository: { lidMapping: { async getPNForLID() { panggilan += 1; return undefined } } },
  }
  await isBotAdmin(conn, 'g@g.us')
  await isGroupAdmin(conn, 'g@g.us', '628222@s.whatsapp.net')
  const setelahPertama = panggilan
  for (let i = 0; i < 6; i += 1) {
    await isBotAdmin(conn, 'g@g.us')
    await isGroupAdmin(conn, 'g@g.us', '628222@s.whatsapp.net')
  }
  assert.equal(panggilan, setelahPertama, `pengecekan ulang masih memanggil WhatsApp (+${panggilan - setelahPertama})`)
  assert.ok(setelahPertama <= 10, `pengecekan pertama terlalu berat: ${setelahPertama} permintaan`)
})

test('TASK119: pencarian peserta ber-LID dibatasi (tidak 1 permintaan per peserta)', async () => {
  const { getGroupParticipant } = await import('../lib/awang-aksesgrub.js')
  let lookup = 0
  const participants = Array.from({ length: 40 }, (_, i) => ({ id: `999${i}@lid`, admin: null }))
  const conn = {
    user: { id: '628111@s.whatsapp.net' },
    async groupMetadata() { return { participants } },
    signalRepository: { lidMapping: { async getPNForLID() { lookup += 1; return undefined } } },
  }
  await getGroupParticipant(conn, 'g2@g.us', '628999@s.whatsapp.net', { participants })
  assert.ok(lookup <= 7, `pencarian LID tidak dibatasi: ${lookup} permintaan untuk 40 peserta`)
})

/* ── 3. impor database sekali ─────────────────────────────────── */
test('TASK119: handler memuat lib/database.js sekali, tanpa cache-buster per pesan', () => {
  for (const berkas of ['handler.js', 'handler-srv.js']) {
    const isi = baca(berkas)
    assert.match(isi, /import syncUserDatabase from '\.\/lib\/database\.js'/, `${berkas} belum impor statis`)
    assert.ok(!isi.includes('lib/database.js?v='), `${berkas} masih memakai impor ?v= per pesan`)
    assert.match(isi, /syncUserDatabase\(m, this\)/, `${berkas} tidak memanggil database`)
  }
})

/* ── 4. thumbnail tidak dibaca ulang tiap pesan ───────────────── */
test('TASK119: _allfake membaca thumbnail lewat cache, bukan readFileSync per pesan', () => {
  const isi = baca('plugins/_system/_allfake.js')
  assert.match(isi, /function bacaThumb\(/, 'fungsi cache thumbnail hilang')
  const badanHook = isi.slice(isi.indexOf('handler.all = async function'), isi.indexOf('handler.all = async function') + 900)
  assert.ok(!badanHook.includes('readFileSync'), 'hook all masih membaca berkas langsung tiap pesan')
  assert.match(badanHook, /bacaThumb\(\)/, 'hook all tidak memakai bacaThumb()')
})

/* ── 5. menu memakai cache resize & unggah ────────────────────── */
test('TASK119: menu memakai cache resize dan unggah thumbnail', () => {
  const isi = baca('plugins/info/main-menu.js')
  assert.match(isi, /gambarTercache/, 'cache resize tidak ada')
  assert.match(isi, /unggahMediaTercache/, 'cache unggahan tidak ada')
  assert.ok(!/const \{ imageMessage \} = await prepareWAMessageMedia\(/.test(isi), 'masih ada unggahan tanpa cache')
})

/* ── 6. probe latensi menulis data terukur ────────────────────── */
test('TASK119: probe latensi mencatat pesan + lama kirim', async () => {
  const mod = await import('../plugins/_system/_latency119.js')
  const conn = { sendMessage: async () => ({ key: { id: 'x' } }) }
  await mod.default.all.call(conn, { chat: 'uji119@g.us', text: '.ping', isGroup: true, messageTimestamp: Math.floor(Date.now() / 1000) })
  await conn.sendMessage('uji119@g.us', { text: 'halo' })
  const berkas = '/data/latency-119.jsonl'
  const cadangan = path.join(ROOT, 'data/latency-119.jsonl')
  const isi = fs.existsSync(berkas) ? fs.readFileSync(berkas, 'utf8') : fs.readFileSync(cadangan, 'utf8')
  const baris = isi.trim().split('\n').map(JSON.parse)
  assert.ok(baris.some(b => b.jenis === 'pesan' && b.text === '.ping'), 'baris pesan tidak tercatat')
  assert.ok(baris.some(b => b.jenis === 'kirim' && typeof b.sendMs === 'number'), 'baris kirim tidak tercatat')
})
