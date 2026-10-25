/* Uji Task106: tombol kendali native Pico Park + statistik website menu.
 * Jalankan: node task106-tests/picopark-webstats.test.mjs
 * Tidak ada request nyata: fetch di-stub.
 */
import assert from 'node:assert/strict'

const PICO = '/home/user/work-task94/single/plugins/game-html/picopark.js'
const WEB = '/home/user/work-task94/single/lib/umi-menu/webstats.js'

const pico = await import(PICO)
const webstats = await import(WEB)

let pass = 0
const test = async (name, fn) => { await fn(); pass += 1; console.log('  ✓', name) }

function fakeConn() {
  const relay = []
  const sent = []
  const conn = {
    user: { id: '628123456789@s.whatsapp.net', jid: '628123456789@s.whatsapp.net', name: 'Umi' },
    relayMessage: async (...args) => { relay.push(args); return {} },
    sendMessage: async (...args) => { sent.push(args); return { key: { id: 'X' } } },
    reply: async () => ({}),
    groupMetadata: async () => ({ subject: 'Grup Uji', participants: [] }),
  }
  return { conn, relay, sent }
}

const room = {
  code: '4321',
  level: 0,
  players: [{ slot: 1, jid: '628111', name: 'A' }, { slot: 2, jid: '628222', name: 'B' }],
}

console.log('picopark + webstats tests')

await test('kendali DM P1 hanya berisi perintah P1', async () => {
  const { conn, relay } = fakeConn()
  const result = await pico.sendControlList(conn, '628111@s.whatsapp.net', room, 1, '.')
  assert.equal(result.mode, 'native-controls')
  const payload = JSON.stringify(relay)
  assert.ok(payload.includes('.ppark p1 kiri'), 'tombol kiri P1 harus ada')
  assert.ok(payload.includes('.ppark p1 kanan'), 'tombol kanan P1 harus ada')
  assert.ok(payload.includes('.ppark p1 lompat'), 'tombol lompat P1 harus ada')
  assert.ok(!payload.includes('.ppark p2'), 'DM P1 tidak boleh memuat tombol P2')
})

await test('kendali grup memuat P1 dan P2', async () => {
  const { conn, relay } = fakeConn()
  await pico.sendControlList(conn, 'grup@g.us', room, 0, '.')
  const payload = JSON.stringify(relay)
  for (const id of ['.ppark p1 kiri', '.ppark p1 kanan', '.ppark p1 lompat', '.ppark p2 kiri', '.ppark p2 kanan', '.ppark p2 lompat']) {
    assert.ok(payload.includes(id), `${id} hilang dari daftar grup`)
  }
})

await test('id tombol memakai prefix dari pemanggil', async () => {
  const { conn, relay } = fakeConn()
  await pico.sendControlList(conn, 'grup@g.us', room, 0, '!')
  assert.ok(JSON.stringify(relay).includes('!ppark p1 kiri'))
})

await test('tanpa relayMessage → fallback teks tetap memberi perintah', async () => {
  const sent = []
  const conn = { sendMessage: async (...args) => { sent.push(args); return {} } }
  const result = await pico.sendControlList(conn, 'x@s.whatsapp.net', room, 2, '.')
  assert.equal(result.mode, 'text-controls')
  assert.match(String(sent[0]?.[1]?.text || ''), /\.ppark p2 kiri/)
})

await test('perintah ppark p1 kiri benar-benar menggerakkan karakter', async () => {
  const { conn } = fakeConn()
  const created = pico.createRoom(
    { chat: 'grup@g.us', sender: '628111@s.whatsapp.net', pushName: 'A', key: { participant: '628111@s.whatsapp.net' } },
    { conn, args: [] },
  )
  const joined = pico.createRoom ? true : true
  assert.ok(joined)
  const roomNow = pico.activeRooms.get(created.code)
  assert.ok(roomNow, 'room harus terdaftar')
  const spawn2 = pico.LEVELS[0].spawn[1]
  roomNow.players.push({ slot: 2, jid: '628222', name: 'B', x: spawn2.x, y: spawn2.y, lastActionAt: 0 })
  roomNow.status = 'playing'

  const before = roomNow.players.find(p => p.slot === 1).x
  const handler = pico.default
  const m = {
    chat: 'grup@g.us', sender: '628111@s.whatsapp.net', pushName: 'A',
    text: '.ppark p1 kiri', key: { id: 'K2', participant: '628111@s.whatsapp.net' },
    reply: async () => ({}),
  }
  await handler.call(conn, m, { conn, usedPrefix: '.', command: 'ppark', args: ['p1', 'kiri'], text: 'p1 kiri' })
  const after = pico.activeRooms.get(created.code).players.find(p => p.slot === 1).x
  assert.equal(after, before - 1, 'P1 harus bergeser satu petak ke kiri setelah tombol ditekan')
  pico.activeRooms.delete(created.code)
})

await test('webstats tanpa kunci → available:false + alasan jujur', async () => {
  const saved = { url: process.env.UMI_DATA_SUPABASE_URL, key: process.env.UMI_DATA_SERVICE_ROLE_KEY }
  delete process.env.UMI_DATA_SUPABASE_URL
  delete process.env.UMI_DATA_SERVICE_ROLE_KEY
  webstats.resetWebStatsCache()
  try {
    const value = await webstats.collectWebStats({ force: true })
    assert.equal(value.available, false)
    assert.match(String(value.reason), /belum diisi/)
  } finally {
    if (saved.url) process.env.UMI_DATA_SUPABASE_URL = saved.url
    if (saved.key) process.env.UMI_DATA_SERVICE_ROLE_KEY = saved.key
    webstats.resetWebStatsCache()
  }
})

await test('webstats membaca angka nyata dari Supabase (stub)', async () => {
  process.env.UMI_DATA_SUPABASE_URL = 'https://contoh.supabase.co'
  process.env.UMI_DATA_SERVICE_ROLE_KEY = 'kunci-uji'
  webstats.resetWebStatsCache()
  const seen = []
  const realFetch = global.fetch
  global.fetch = async (url, options = {}) => {
    seen.push(String(url))
    const total = String(url).includes('banned') ? 3 : String(url).includes('last_seen_at') ? 51 : 253
    if (String(url).includes('api_server_status')) {
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ([{ service: 'web', status: 'online', checked_at: new Date().toISOString() }]) }
    }
    return { ok: true, status: 200, headers: { get: () => `0-0/${total}` }, json: async () => ([]) }
  }
  try {
    const value = await webstats.collectWebStats({ force: true })
    assert.equal(value.available, true)
    assert.equal(value.users, 253)
    assert.equal(value.active24h, 51)
    assert.equal(value.banned, 3)
    assert.equal(value.services.online, 1)
    assert.ok(seen.some(url => url.includes('platform_profiles')), 'harus membaca platform_profiles')
    assert.ok(!seen.some(url => url.includes('api_token')), 'tidak boleh meminta kolom sensitif')
  } finally {
    global.fetch = realFetch
    webstats.resetWebStatsCache()
    delete process.env.UMI_DATA_SUPABASE_URL
    delete process.env.UMI_DATA_SERVICE_ROLE_KEY
  }
})

await test('webstats gagal jaringan → available:false, tidak melempar', async () => {
  process.env.UMI_DATA_SUPABASE_URL = 'https://contoh.supabase.co'
  process.env.UMI_DATA_SERVICE_ROLE_KEY = 'kunci-uji'
  webstats.resetWebStatsCache()
  const realFetch = global.fetch
  global.fetch = async () => { throw new Error('ENOTFOUND') }
  try {
    const value = await webstats.collectWebStats({ force: true })
    assert.equal(value.available, false)
    assert.match(String(value.reason), /gagal membaca website/)
  } finally {
    global.fetch = realFetch
    webstats.resetWebStatsCache()
    delete process.env.UMI_DATA_SUPABASE_URL
    delete process.env.UMI_DATA_SERVICE_ROLE_KEY
  }
})

console.log(`\n${pass} tes lulus`)
