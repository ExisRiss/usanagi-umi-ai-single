/*
 * Uji RichMessageAdapter (Task104).
 *
 * Yang dibuktikan di sini:
 *   1. payload yang dibangun adapter benar-benar bisa di-encode protobuf
 *      (bukan cuma "kelihatan benar" di JSON);
 *   2. setiap jenis pesan punya fallback saat kemampuan koneksi tidak ada;
 *   3. kegagalan kirim mengembalikan { ok:false } / fallback, TIDAK melempar
 *      error ke handler;
 *   4. normalisasi respons tombol/list/interactive tidak mempercayai isi pesan.
 *
 * Jalankan: node /home/user/task104-tests/rich-adapter.test.mjs
 */

import assert from 'assert'
import path from 'path'

const ROOT = '/home/user/work-task94/single'
process.chdir(ROOT)
const MOD = path.join(ROOT, 'lib/rich-message-adapter.js')
const {
  RichMessageAdapter, detectCapabilities, loadProto, protoSource, plainFromSections,
  plainGameState, richFor,
} = await import(MOD)

let pass = 0
const failures = []
async function test(name, fn) {
  try { await fn(); pass++; console.log(`✅ ${name}`) }
  catch (error) { failures.push([name, error]); console.log(`❌ ${name}\n   ${error.message}`) }
}

const proto = loadProto()
const HTML = '<html><body><script>var BOT_STATE = {"level":1,"players":[{"name":"A"}]}</script></body></html>'

function mockConn(extra = {}) {
  const sent = []
  const conn = {
    sent,
    async sendMessage(jid, payload, options) {
      // `failMedia` hanya menggagalkan kiriman berisi media (meniru batas ukuran),
      // supaya fallback teks tetap bisa terbukti terkirim.
      if (conn.failMedia && (payload.image || payload.video || payload.audio || payload.document || payload.sticker)) {
        sent.push({ type: 'message', jid, payload, options, failed: true })
        throw new Error('media ditolak server')
      }
      sent.push({ type: 'message', jid, payload, options })
      if (conn.failMessage) throw new Error('send gagal')
    },
    async relayMessage(jid, message, options) { sent.push({ type: 'relay', jid, message, options }); if (conn.failRelay) throw new Error('relay gagal') },
    async sendSticker(jid, buffer, quoted, meta) { sent.push({ type: 'sticker', jid, meta, size: buffer?.length }) },
    ...extra,
  }
  return conn
}

/* ---------------- 1. protobuf ---------------- */
await test('proto library terdeteksi dari paket yang terpasang', () => {
  assert.ok(proto, 'proto tidak ditemukan')
  console.log(`   sumber proto: ${protoSource()}`)
})

await test('pesan rich (teks+tabel) lolos encode protobuf', () => {
  const adapter = new RichMessageAdapter(mockConn())
  const { message, messageId } = adapter.buildRichMessages({
    title: 'Hasil',
    sections: [
      { type: 'text', text: 'Pemenang: A' },
      { type: 'table', title: 'Skor', headers: ['#', 'Pemain'], rows: [['1', 'A'], ['2', 'B']] },
    ],
  })
  const encoded = proto.Message.encode(proto.Message.fromObject(message)).finish()
  assert.ok(encoded.length > 20, 'hasil encode terlalu kecil')
  const decoded = proto.Message.decode(encoded)
  const rich = decoded.botForwardedMessage.message.richResponseMessage
  assert.equal(rich.submessages.length, 3)
  assert.equal(rich.submessages[2].tableMetadata.rows.length, 3)
  assert.match(messageId, /^UMIRICH/)
  console.log(`   ${encoded.length} B wire, ${rich.submessages.length} submessage`)
})

await test('payload HTML lolos encode dan memuat BOT_STATE', () => {
  const adapter = new RichMessageAdapter(mockConn())
  const { message } = adapter.buildHtmlPayload(HTML, { title: 'Pico Park' })
  const decoded = proto.Message.decode(proto.Message.encode(proto.Message.fromObject(message)).finish())
  const rich = decoded.botForwardedMessage.message.richResponseMessage
  const unified = JSON.parse(Buffer.from(rich.unifiedResponse.data, 'base64').toString('utf8'))
  const payload = unified.sections[0].view_model.primitive.payload
  assert.equal(payload, HTML)
  assert.match(payload, /BOT_STATE/)
  assert.equal(rich.submessages[0].messageText, 'Pico Park')
})

await test('HTML melebihi batas ditolak lebih awal', () => {
  const adapter = new RichMessageAdapter(mockConn(), { htmlBudget: 100 })
  assert.throws(() => adapter.buildHtmlPayload('<html>' + 'x'.repeat(500) + '</html>'), /melebihi batas/)
})

/* ---------------- 2. jalur normal ---------------- */
await test('sendRich mengirim lewat relayMessage', async () => {
  const conn = mockConn()
  const adapter = new RichMessageAdapter(conn)
  const result = await adapter.sendRich('628@g.us', { title: 'Halo', sections: [{ type: 'text', text: 'isi' }] })
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'rich')
  assert.equal(conn.sent.length, 1)
  assert.equal(conn.sent[0].type, 'relay')
})

await test('sendHtmlApp memakai sendHtmlApp bila tersedia', async () => {
  const calls = []
  const conn = mockConn({ async sendHtmlApp(jid, html) { calls.push({ jid, bytes: html.length }) } })
  const adapter = new RichMessageAdapter(conn)
  const result = await adapter.sendHtmlApp('628@g.us', HTML, { title: 'Kartu' })
  assert.equal(result.mode, 'sendHtmlApp')
  assert.equal(calls.length, 1)
})

await test('sendHtmlApp jatuh ke relayMessage bila sendHtmlApp tidak ada', async () => {
  const conn = mockConn()
  const adapter = new RichMessageAdapter(conn)
  const result = await adapter.sendHtmlApp('628@g.us', HTML)
  assert.equal(result.mode, 'relay-html')
  assert.equal(conn.sent[0].type, 'relay')
})

await test('sendMedia gambar mengirim image + caption', async () => {
  const conn = mockConn()
  const adapter = new RichMessageAdapter(conn)
  const buffer = Buffer.from('89504e47', 'hex')
  const result = await adapter.sendMedia('628@g.us', { kind: 'image', source: buffer, caption: 'kartu' })
  assert.equal(result.mode, 'image')
  assert.ok(Buffer.isBuffer(conn.sent[0].payload.image))
  assert.equal(conn.sent[0].payload.caption, 'kartu')
})

await test('sendMedia video memakai gifPlayback bila diminta', async () => {
  const conn = mockConn()
  const adapter = new RichMessageAdapter(conn)
  await adapter.sendMedia('628@g.us', { kind: 'video', source: Buffer.from('x'), gifPlayback: true })
  assert.equal(conn.sent[0].payload.gifPlayback, true)
})

await test('sendTable native + fallback teks dihitung benar', async () => {
  const conn = mockConn()
  const adapter = new RichMessageAdapter(conn)
  const result = await adapter.sendTable('628@g.us', { title: 'Skor', headers: ['#', 'Nama'], rows: [['1', 'A']] })
  assert.equal(result.mode, 'rich')
  const plain = plainFromSections({ title: 'Skor', sections: [{ type: 'table', headers: ['#', 'Nama'], rows: [['1', 'A']] }] })
  assert.match(plain, /1 \| A/)
})

/* ---------------- 3. fallback ---------------- */
await test('relayMessage gagal → teks tetap terkirim', async () => {
  const conn = mockConn()
  conn.failRelay = true
  const adapter = new RichMessageAdapter(conn)
  const result = await adapter.sendRich('628@g.us', { title: 'Judul', sections: [{ type: 'text', text: 'badan' }] })
  assert.equal(result.ok, true)
  assert.equal(result.fallbackUsed, true)
  assert.equal(result.mode, 'text')
  const textMsg = conn.sent.find(item => item.type === 'message')
  assert.match(textMsg.payload.text, /Judul\nbadan/)
})

await test('koneksi tanpa relayMessage → semua jalur rich jadi teks', async () => {
  const conn = { sent: [], async sendMessage(jid, payload) { this.sent.push({ payload }) } }
  const adapter = new RichMessageAdapter(conn)
  assert.equal(detectCapabilities(conn).relay, false)
  const rich = await adapter.sendRich('628@g.us', { title: 'T', sections: [{ type: 'text', text: 'x' }] })
  const html = await adapter.sendHtmlApp('628@g.us', HTML, { title: 'Kartu' })
  assert.equal(rich.fallbackUsed, true)
  assert.equal(html.fallbackUsed, true)
  assert.equal(conn.sent.length, 2)
})

await test('kirim media gagal → caption tetap dikirim sebagai teks', async () => {
  const conn = mockConn()
  conn.failMedia = true
  const adapter = new RichMessageAdapter(conn)
  const result = await adapter.sendMedia('628@g.us', { kind: 'image', source: Buffer.from('x'), caption: 'Keterangan' })
  assert.equal(result.ok, true)
  const last = conn.sent[conn.sent.length - 1]
  assert.match(last.payload.text, /Keterangan/)
  assert.match(last.payload.text, /Media gagal dikirim/)
})

await test('sendButtons nonaktif → teks bernomor, bukan error', async () => {
  const conn = mockConn()
  const adapter = new RichMessageAdapter(conn)
  const result = await adapter.sendButtons('628@g.us', { text: 'Pilih', buttons: [{ id: 'a', text: 'Gabung' }, { id: 'b', text: 'Keluar' }] })
  assert.equal(result.fallbackUsed, true)
  assert.equal(result.reason, 'buttons-disabled')
  assert.match(conn.sent[0].payload.text, /1\. Gabung/)
  assert.match(conn.sent[0].payload.text, /2\. Keluar/)
})

await test('sendButtons aktif tapi gagal → fallback teks', async () => {
  global.richFeatures = { buttons: true }
  try {
    const conn = mockConn()
    conn.failMessage = true
    const adapter = new RichMessageAdapter(conn)
    const result = await adapter.sendButtons('628@g.us', { text: 'Pilih', buttons: [{ id: 'a', text: 'Satu' }] })
    assert.equal(result.fallbackUsed, true)
    assert.match(result.originalError, /send gagal/)
  } finally { delete global.richFeatures }
})

await test('carousel tanpa dukungan → maksimal 3 kartu terpisah', async () => {
  const conn = mockConn()
  const adapter = new RichMessageAdapter(conn)
  const result = await adapter.sendCarousel('628@g.us', {
    text: 'Pilihan',
    cards: [1, 2, 3, 4, 5].map(i => ({ title: `Kartu ${i}`, body: `badan ${i}` })),
  })
  assert.equal(result.mode, 'cards')
  assert.equal(conn.sent.length, 3)
  assert.match(conn.sent[0].payload.text, /Kartu 1/)
})

/* ---------------- 4. helper game ---------------- */
await test('kartu game HTML memuat payload HTML valid', async () => {
  const conn = mockConn()
  const result = await richFor(conn).sendGameCard('628@s.whatsapp.net', {
    title: 'Pico Park', html: HTML, header: 'Room 1234',
  })
  assert.equal(result.ok, true)
  const relay = conn.sent.find(item => item.type === 'relay')
  const rich = proto.Message.decode(proto.Message.encode(proto.Message.fromObject(relay.message)).finish())
    .botForwardedMessage.message.richResponseMessage
  const payload = JSON.parse(Buffer.from(rich.unifiedResponse.data, 'base64').toString('utf8'))
  assert.match(payload.sections[0].view_model.primitive.payload, /BOT_STATE/)
})

await test('kartu game tanpa html → teks status terbaca', async () => {
  const conn = mockConn()
  const result = await richFor(conn).sendGameCard('628@g.us', {
    title: 'UNO', players: [{ name: 'A', status: '2 kartu' }],
  })
  assert.equal(result.ok, true)
  assert.match(conn.sent[0].payload.text, /UNO/)
  assert.match(conn.sent[0].payload.text, /A: 2 kartu/)
})

await test('undangan multiplayer berisi kode room + perintah join', async () => {
  const conn = mockConn()
  const adapter = new RichMessageAdapter(conn, { prefix: '.' })
  const result = await adapter.sendGameInvite('628@g.us', {
    gameTitle: 'Monopoly', roomCode: 'AB12', host: 'AlzRiss', players: '1/4', joinCommand: '.join AB12',
  })
  assert.equal(result.ok, true)
  assert.match(conn.sent[0].payload.text, /AB12/)
  assert.match(conn.sent[0].payload.text, /\.join AB12/)
})

await test('ringkasan pertandingan: tabel + kalimat pemenang', async () => {
  const conn = mockConn()
  const adapter = new RichMessageAdapter(conn)
  const result = await adapter.sendMatchSummary('628@g.us', {
    gameTitle: 'UNO', winner: 'A', players: [{ name: 'A', score: 10 }, { name: 'B', score: 4 }],
  })
  assert.equal(result.ok, true)
  const texts = conn.sent.filter(item => item.type === 'message').map(item => item.payload.text)
  assert.ok(texts.some(text => /Pemenang: A/.test(text)), 'kalimat pemenang tidak terkirim')
})

await test('plainGameState selalu menghasilkan teks', () => {
  assert.ok(plainGameState({ title: 'X' }).includes('X'))
  assert.ok(plainGameState({}).length > 0)
})

/* ---------------- 5. respons masuk ---------------- */
await test('normalisasi respons tombol', () => {
  const r = RichMessageAdapter.normalizeResponse({ buttonsResponseMessage: { selectedButtonId: 'join:AB12', selectedDisplayText: 'Gabung' } })
  assert.equal(r.action, 'button')
  assert.equal(r.id, 'join:AB12')
})

await test('normalisasi respons list', () => {
  const r = RichMessageAdapter.normalizeResponse({ listResponseMessage: { title: 'Pilih', singleSelectReply: { selectedRowId: 'row-3' } } })
  assert.equal(r.action, 'list')
  assert.equal(r.id, 'row-3')
})

await test('normalisasi respons interactive (native flow)', () => {
  const r = RichMessageAdapter.normalizeResponse({
    interactiveResponseMessage: { nativeFlowResponseMessage: { name: 'umi_action', paramsJson: '{"id":"kiri"}' } },
  })
  assert.equal(r.action, 'interactive')
  assert.equal(r.value, 'kiri')
})

await test('normalisasi teks biasa dan pesan tak dikenal', () => {
  assert.equal(RichMessageAdapter.normalizeResponse({ conversation: 'kiri' }).action, 'text')
  assert.equal(RichMessageAdapter.normalizeResponse({ imageMessage: {} }), null)
})

console.log(`\n=== HASIL: ${pass} lulus, ${failures.length} gagal ===`)
if (failures.length) {
  for (const [name, error] of failures) console.log(`\n${name}\n${error.stack}`)
  process.exit(1)
}
