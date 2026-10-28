/* Task143b — uji penghapus otomatis .autodelmsg dengan conn tiruan yang
 * menyerupai WhatsApp sungguhan: bot punya nomor, metadata grup berisi admin,
 * dan pengirim bisa datang sebagai nomor biasa ATAU sebagai @lid.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

process.chdir(path.join(process.cwd()))
global.owner = [['6287813709432', 'AlzRiss', true]]
global.jadibotPlatform = { lockedOwnerNumber: '6287813709432' }

const { handler, bacaDataAutodel } = await import('../plugins/owner/autodelmsg.js')

const GRUP = '120363430111128574@g.us'
const BOT = '6281234567890@s.whatsapp.net'
const DEV = '6287813709432'
const TARGET = '62882007884077'
const BERKAS = path.join(process.cwd(), 'data', 'autodelmsg.json')
const cadangan = fs.existsSync(BERKAS) ? fs.readFileSync(BERKAS) : null

test.after(() => {
  if (cadangan) fs.writeFileSync(BERKAS, cadangan)
  else { try { fs.unlinkSync(BERKAS) } catch (error) { /* kosong */ } }
})

function connTiruan({ botAdmin = true } = {}) {
  const terhapus = []
  const metadata = {
    participants: [
      { id: DEV + '@s.whatsapp.net', admin: 'superadmin' },
      { id: BOT, admin: botAdmin ? 'admin' : null },
      { id: TARGET + '@s.whatsapp.net', admin: null },
    ],
  }
  const conn = {
    user: { id: BOT },
    terhapus,
    groupMetadata: async () => metadata,
    sendMessage: async (chat, obj) => { if (obj && obj.delete) terhapus.push(obj.delete.id) },
    signalRepository: { lidMapping: { getPNForLID: async () => TARGET + '@s.whatsapp.net' } },
  }
  return conn
}

const pesan = (extra = {}) => ({
  isGroup: true,
  chat: GRUP,
  sender: TARGET + '@s.whatsapp.net',
  text: 'Hai',
  mtype: 'conversation',
  key: { id: 'M' + Math.random().toString(36).slice(2, 8), fromMe: false },
  ...extra,
})

async function daftarkan() {
  const balasan = []
  const m = {
    isGroup: true, chat: GRUP, sender: DEV + '@s.whatsapp.net',
    mentionedJid: [TARGET + '@s.whatsapp.net'],
    args: ['@' + TARGET], text: '.autodelmsg @' + TARGET,
    key: { id: 'CMD' + Math.random().toString(36).slice(2, 6) },
    reply: async (t) => balasan.push(t),
  }
  await handler(m, { conn: connTiruan(), command: 'autodelmsg', isROwner: true, isBotAdmin: true })
  return balasan.join('\n')
}

test('pendaftaran menulis nomor ke data/autodelmsg.json', async () => {
  const teks = await daftarkan()
  assert.match(teks, /AUTO DELETE PESAN DIAKTIFKAN/)
  const data = bacaDataAutodel()
  assert.equal(data.grup[GRUP].aktif, true)
  assert.ok(data.grup[GRUP].nomor[TARGET], 'nomor target harus tercatat')
})

test('pesan user terdaftar DIHAPUS lewat hook all (tanpa isBotAdmin di konteks)', async () => {
  await daftarkan()
  const conn = connTiruan()
  const m = pesan()
  /* Konteks sengaja kosong — persis seperti handler.js memanggil plugin.all. */
  await handler.all.call(conn, m, {})
  assert.deepEqual(conn.terhapus, [m.key.id], 'pesan harus terhapus')
})

test('pengirim @lid tetap dikenali lewat senderPn', async () => {
  await daftarkan()
  const conn = connTiruan()
  const m = pesan({
    sender: '998877665544@lid',
    key: { id: 'LID1', fromMe: false, senderPn: TARGET + '@s.whatsapp.net' },
  })
  await handler.all.call(conn, m, {})
  assert.deepEqual(conn.terhapus, ['LID1'])
})

test('pengirim @lid dikenali lewat metadata grup', async () => {
  await daftarkan()
  const conn = connTiruan()
  conn.signalRepository = null
  const m = pesan({ sender: '998877665544@lid', key: { id: 'LID2', fromMe: false } })
  /* Metadata grup yang dipakai resolveTargetPhoneNumber memuat PN target. */
  conn.groupMetadata = async () => ({
    participants: [
      { id: BOT, admin: 'admin' },
      { id: '998877665544@lid', phoneNumber: TARGET + '@s.whatsapp.net', admin: null },
    ],
  })
  await handler.all.call(conn, m, {})
  assert.deepEqual(conn.terhapus, ['LID2'])
})

test('pesan developer/owner TIDAK PERNAH dihapus', async () => {
  await daftarkan()
  const conn = connTiruan()
  const m = pesan({ sender: DEV + '@s.whatsapp.net', text: 'halo dari developer' })
  /* Daftarkan juga nomor developer, lalu pastikan tetap dilindungi. */
  const data = bacaDataAutodel()
  data.grup[GRUP].nomor[DEV] = { nama: 'dev', waktu: new Date().toISOString() }
  fs.writeFileSync(BERKAS, JSON.stringify(data, null, 2))
  await handler.all.call(conn, m, {})
  assert.deepEqual(conn.terhapus, [], 'pesan developer harus aman')
})

test('bot bukan admin → tidak menghapus', async () => {
  await daftarkan()
  const conn = connTiruan({ botAdmin: false })
  await handler.all.call(conn, pesan(), {})
  assert.deepEqual(conn.terhapus, [])
})

test('user lain yang tidak terdaftar tidak terhapus', async () => {
  await daftarkan()
  const conn = connTiruan()
  await handler.all.call(conn, pesan({ sender: '628999999999@s.whatsapp.net' }), {})
  assert.deepEqual(conn.terhapus, [])
})

test('perintah .autodelmsg sendiri tidak ikut dihapus', async () => {
  await daftarkan()
  const conn = connTiruan()
  await handler.all.call(conn, pesan({ text: '$autodelmsg list' }), {})
  assert.deepEqual(conn.terhapus, [])
})

test('satu pesan hanya dihapus sekali walau dua hook jalan', async () => {
  await daftarkan()
  const conn = connTiruan()
  const m = pesan({ key: { id: 'SEKALI', fromMe: false } })
  await handler.all.call(conn, m, {})
  await handler.before.call(conn, m, { isBotAdmin: true })
  assert.deepEqual(conn.terhapus, ['SEKALI'])
})

test('saklar off menghentikan penghapusan', async () => {
  const teks = await daftarkan()
  assert.ok(teks)
  await handler({
    isGroup: true, chat: GRUP, sender: DEV + '@s.whatsapp.net',
    args: ['off'], text: '.autodelmsg off',
    key: { id: 'OFF1' }, reply: async () => {},
  }, { conn: connTiruan(), command: 'autodelmsg', isROwner: true, isBotAdmin: true })
  const conn = connTiruan()
  await handler.all.call(conn, pesan(), {})
  assert.deepEqual(conn.terhapus, [])
})
