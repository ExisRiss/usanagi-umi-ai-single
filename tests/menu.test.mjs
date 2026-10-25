/*
 * Uji sistem menu Umi Usanagi AI (Task105).
 *
 * Diuji tanpa WhatsApp: registry diisi plugin tiruan di pluginStore yang SAMA
 * dengan yang dipakai handler.js, lalu router dipanggil dengan `conn` tiruan
 * yang mencatat setiap pesan keluar. Semua angka di menu harus berasal dari
 * data yang diisi di sini — kalau ada yang hardcoded, uji ini gagal.
 *
 * Jalankan: node /home/user/task105-tests/menu.test.mjs
 */

import assert from 'assert'
import path from 'path'
import fs from 'fs'

const ROOT = '/home/user/work-task94/single'
process.chdir(ROOT)

/* --- global yang biasanya diisi config.js/main.js --- */
global.namebot = 'Usanagi Umi AI'
global.ownerName = 'AlzRiss'
global.owner = [['628111222333', 'AlzRiss']]
global.prefix = '.'
global.db = { data: { users: { '628111@s.whatsapp.net': { registered: true }, '628222@s.whatsapp.net': { registered: false } } } }

const { pluginStore } = await import(path.join(ROOT, 'core/awang-loader.js'))
const { buildCatalogue, ownerCommands, groupCommands, commandsOfCategory } = await import(path.join(ROOT, 'lib/umi-menu/registry.js'))
const { renderMainMenu, renderCataloguePage, buildDashboardHtml, MENU_OPTIONS, paginateLines } = await import(path.join(ROOT, 'lib/umi-menu/render.js'))
const { collectStatus, getServerStats } = await import(path.join(ROOT, 'lib/umi-menu/status.js'))
const router = await import(path.join(ROOT, 'lib/umi-menu/router.js'))
const { dispatchMenuCommand, parseActionId, handleNumericSelection } = router

let pass = 0
const failures = []
async function test(name, fn) {
  try { router.resetMenuState(); await fn(); pass++; console.log(`✅ ${name}`) }
  catch (error) { failures.push([name, error]); console.log(`❌ ${name}\n   ${error.message}`) }
}

/* ---------------- registry tiruan ---------------- */
function fakePlugin({ command, help, category, description = '', tags = [], owner = false, group = false, admin = false, botAdmin = false, disabled = false }) {
  const handler = async () => {}
  if (command) handler.command = command
  if (help) handler.help = help
  handler.category = category
  handler.description = description
  handler.tags = tags
  handler.owner = owner
  handler.group = group
  handler.admin = admin
  handler.botAdmin = botAdmin
  handler.disabled = disabled
  handler.filePath = `/x/plugins/${category}/${String(help?.[0] || 'cmd')}.js`
  return handler
}

function fillRegistry() {
  pluginStore.clear()
  pluginStore.set('main/umi-menu.js', fakePlugin({ command: /^(umimenu|lmenu)$/i, help: ['umimenu', 'lmenu'], category: 'main', description: 'Menu utama interaktif' }))
  pluginStore.set('game/game-slot.js', fakePlugin({ command: /^slot$/i, help: ['slot'], category: 'game', description: 'Mesin slot' }))
  pluginStore.set('game/game-uno.js', fakePlugin({ command: /^uno$/i, help: ['uno'], category: 'game', description: 'Kartu UNO multiplayer' }))
  pluginStore.set('tools/ttp.js', fakePlugin({ command: /^(ttp|attp)$/i, help: ['ttp', 'attp'], category: 'tools', description: 'Buat gambar teks' }))
  pluginStore.set('tools/toimg.js', fakePlugin({ command: 'toimg', help: ['toimg'], category: 'tools', description: 'Stiker jadi gambar' }))
  pluginStore.set('owner/owner-set.js', fakePlugin({ command: /^setprefix$/i, help: ['setprefix'], category: 'owner', description: 'Ubah prefix', owner: true }))
  pluginStore.set('group/group-kick.js', fakePlugin({ command: /^kick$/i, help: ['kick'], category: 'group', description: 'Keluarkan anggota', group: true, admin: true, botAdmin: true }))
  pluginStore.set('group/group-list.js', fakePlugin({ command: /^glist$/i, help: ['glist'], category: 'group', description: 'Daftar grup' }))
  pluginStore.set('misc/mati.js', fakePlugin({ command: /^mati$/i, help: ['mati'], category: 'misc', description: 'Nonaktif', disabled: true }))
  // duplikat sengaja: perintah sama dari dua berkas
  pluginStore.set('dup/ttp-copy.js', fakePlugin({ command: /^(ttp|ttp2)$/i, help: ['ttp', 'ttp2'], category: 'tools', description: 'Duplikat' }))
}

/* ---------------- conn tiruan ---------------- */
function makeConn(overrides = {}) {
  const sent = []
  const conn = {
    sent,
    user: { id: '628999888777:1@s.whatsapp.net' },
    ws: { readyState: 1 },
    async sendMessage(jid, payload, options) {
      sent.push({ jid, payload, options })
      if (conn.failSend) throw new Error('send ditolak')
      return { key: { id: 'MSG1' } }
    },
    async relayMessage(jid, message, options) { sent.push({ jid, relay: message, options }) },
    async groupMetadata(jid) {
      if (conn.metadataError) throw new Error('metadata gagal')
      return conn.metadata || {
        subject: 'Grup Uji', participants: [
          { id: '628111222333@s.whatsapp.net', admin: 'superadmin' },
          { id: '628999888777@s.whatsapp.net', admin: 'admin' },
          { id: '628222333444@s.whatsapp.net', admin: null },
        ],
      }
    },
    ...overrides,
  }
  return conn
}

function makeMessage({ chat = '628111222333@s.whatsapp.net', sender = '628111222333@s.whatsapp.net', command = 'umimenu', text = '.umimenu', isGroup = false, fromMe = false } = {}) {
  return {
    chat, sender, command, text, isGroup, fromMe,
    pushName: 'Tester',
    reply: async () => ({}),
    raw: { key: { id: 'ABC', remoteJid: chat } },
  }
}

fillRegistry()

/* ---------------- 1. registry ---------------- */
await test('registry menghitung perintah & alias dari plugin yang aktif', () => {
  const catalogue = buildCatalogue()
  // 9 plugin aktif; perintah kanonik unik: umimenu, slot, uno, ttp, toimg, setprefix, kick, glist = 8
  assert.equal(catalogue.stats.commands, 8, 'jumlah perintah unik salah')
  // alias: lmenu, attp, ttp2
  assert.equal(catalogue.stats.aliases, 3, 'jumlah alias salah')
  assert.equal(catalogue.stats.categories, 5)
  // plugin nonaktif tidak ikut
  assert.ok(!catalogue.commands.find(c => c.command === 'mati'), 'plugin disabled ikut terhitung')
})

await test('duplikat perintah digabung, bukan dihitung dua kali', () => {
  const catalogue = buildCatalogue()
  const ttp = catalogue.commands.filter(c => c.command === 'ttp')
  assert.equal(ttp.length, 1, 'perintah ttp terdaftar lebih dari sekali')
  assert.ok(ttp[0].aliases.includes('attp'))
  assert.ok(ttp[0].aliases.includes('ttp2'), 'alias dari plugin duplikat hilang')
  assert.equal(catalogue.duplicates.length, 1)
})

await test('filter kategori owner/grup/game/tools benar', () => {
  const catalogue = buildCatalogue()
  assert.deepEqual(ownerCommands(catalogue).map(c => c.command).sort(), ['setprefix'])
  assert.deepEqual(groupCommands(catalogue).map(c => c.command).sort(), ['glist', 'kick'])
  assert.deepEqual(commandsOfCategory(catalogue, 'game').map(c => c.command).sort(), ['slot', 'uno'])
  assert.deepEqual(commandsOfCategory(catalogue, 'tools').map(c => c.command).sort(), ['toimg', 'ttp'])
})

/* ---------------- 2. status nyata ---------------- */
await test('statistik server berasal dari os/process, bukan angka tetap', async () => {
  const stats = await getServerStats({ sampleMs: 20 })
  assert.ok(stats.rssMb > 0, 'RSS tidak terbaca')
  assert.ok(stats.systemTotalGb > 0, 'RAM sistem tidak terbaca')
  assert.ok(stats.uptimeSeconds >= 0)
  assert.equal(typeof stats.cpuPercent, 'number')
  assert.match(stats.nodeVersion, /^v\d+/)
})

await test('jumlah pengguna diambil dari database bot', async () => {
  const status = await collectStatus({ conn: makeConn(), chat: '628111@s.whatsapp.net', cpuSampleMs: 10 })
  assert.equal(status.users.available, true)
  assert.equal(status.users.total, 2)
  assert.equal(status.users.registered, 1)
})

await test('status grup: metadata terbaca, admin bot terdeteksi', async () => {
  const status = await collectStatus({ conn: makeConn(), chat: '1203630@g.us', cpuSampleMs: 10 })
  assert.equal(status.group.available, true)
  assert.equal(status.group.subject, 'Grup Uji')
  assert.equal(status.group.members, 3)
  assert.equal(status.group.botIsAdmin, true)
})

await test('status grup: metadata gagal tidak melempar error', async () => {
  const conn = makeConn()
  conn.metadataError = true
  const status = await collectStatus({ conn, chat: '1203630@g.us', cpuSampleMs: 10 })
  assert.equal(status.group.available, false)
  assert.match(status.group.reason, /metadata gagal/)
})

/* ---------------- 3. render ---------------- */
await test('menu utama memuat nama, developer, waktu, statistik nyata', async () => {
  const catalogue = buildCatalogue()
  const status = await collectStatus({ conn: makeConn(), chat: '628111@s.whatsapp.net', cpuSampleMs: 10 })
  const { text } = renderMainMenu({ status, stats: catalogue.stats, prefix: '.' })
  assert.match(text, /UMI USANAGI AI/)
  assert.match(text, /AlzRiss/)
  assert.match(text, /WITA/)
  assert.match(text, /8 perintah/)
  assert.match(text, /Alias\s+:\s+3/)
  assert.match(text, /Pengguna\s+:\s+2/)
  assert.match(text, /\.menu_all/)
  assert.match(text, /\.menu_refresh/)
  for (const option of MENU_OPTIONS) assert.ok(text.includes(`.${option.command}`), `opsi ${option.command} tidak ada`)
})

await test('pagination: halaman terpisah, navigasi benar, tidak ada perintah hilang', () => {
  const lines = []
  for (let i = 0; i < 300; i++) lines.push(`▸ perintah${i} — deskripsi contoh yang cukup panjang untuk mengisi halaman`)
  const pages = paginateLines(lines, 3000)
  assert.ok(pages.length > 3, 'pemenggalan halaman tidak bekerja')
  const joined = pages.flat()
  assert.equal(joined.length, 300, 'ada baris yang hilang saat dipenggal')
  for (const page of pages) assert.ok(page.join('\n').length <= 3000)
})

await test('halaman katalog memuat nomor halaman dan perintah navigasi', () => {
  const catalogue = buildCatalogue()
  const first = renderCataloguePage({ catalogue, prefix: '.', page: 1 })
  assert.match(first.text, /SEMUA FITUR · 1\/\d+/)
  assert.ok(first.text.includes('.menu_back'))
  assert.ok(first.text.includes('ttp'))
  const second = renderCataloguePage({ catalogue, prefix: '.', page: 99 })
  assert.equal(second.page, first.pages, 'halaman di luar jangkauan tidak dijepit ke halaman terakhir')
})

/* ---------------- 4. router & pembatasan ---------------- */
await test('menu_all mengirim ke chat asal saja', async () => {
  const conn = makeConn()
  const m = makeMessage({ chat: '1203630@g.us', isGroup: true, command: 'menu_all', text: '.menu_all' })
  const result = await dispatchMenuCommand(m, { conn, prefix: '.', action: 'menu_all' })
  assert.equal(result.ok, true)
  assert.equal(conn.sent.length, 1)
  assert.equal(conn.sent[0].jid, '1203630@g.us')
  assert.ok(conn.sent[0].payload.text.includes('SEMUA FITUR'))
})

await test('menu_owner menolak non-owner tanpa membocorkan daftar', async () => {
  const conn = makeConn()
  const outsider = makeMessage({ sender: '628555000111@s.whatsapp.net' })
  const result = await dispatchMenuCommand(outsider, { conn, prefix: '.', action: 'menu_owner' })
  assert.equal(result.mode, 'denied')
  const text = conn.sent[0].payload.text
  assert.match(text, /ditolak/)
  assert.ok(!text.includes('setprefix'), 'daftar owner bocor ke non-owner')
})

await test('menu_owner terbuka untuk owner terverifikasi', async () => {
  const conn = makeConn()
  const owner = makeMessage({ sender: '628111222333@s.whatsapp.net' })
  const result = await dispatchMenuCommand(owner, { conn, prefix: '.', action: 'menu_owner' })
  assert.equal(result.mode, 'owner')
  assert.ok(conn.sent[0].payload.text.includes('setprefix'))
  assert.match(conn.sent[0].payload.text, /owner terverifikasi/)
})

await test('menu_group di chat pribadi menjelaskan konteks, bukan error', async () => {
  const conn = makeConn()
  const dm = makeMessage({ chat: '628111222333@s.whatsapp.net', command: 'menu_group' })
  const result = await dispatchMenuCommand(dm, { conn, prefix: '.', action: 'menu_group' })
  assert.equal(result.ok, true)
  assert.match(conn.sent[0].payload.text, /bukan grup/i)
  assert.ok(conn.sent[0].payload.text.includes('kick'))
})

await test('menu_group di grup menampilkan nama, anggota, status admin bot', async () => {
  const conn = makeConn()
  const group = makeMessage({ chat: '1203630@g.us', isGroup: true, command: 'menu_group' })
  const result = await dispatchMenuCommand(group, { conn, prefix: '.', action: 'menu_group' })
  assert.equal(result.ok, true)
  const text = conn.sent[0].payload.text
  assert.match(text, /Grup Uji/)
  assert.match(text, /3 anggota/)
  assert.match(text, /Bot admin : Ya/)
})

await test('menu_group menandai bot bukan admin', async () => {
  const conn = makeConn({
    async groupMetadata() {
      return { subject: 'Grup Tanpa Admin', participants: [{ id: '628111222333@s.whatsapp.net', admin: 'admin' }] }
    },
  })
  const group = makeMessage({ chat: '1203631@g.us', isGroup: true, command: 'menu_group' })
  await dispatchMenuCommand(group, { conn, prefix: '.', action: 'menu_group' })
  assert.match(conn.sent[0].payload.text, /Tidak — sebagian perintah ditolak/)
})

await test('menu_game & menu_tools memakai registry, bukan daftar statis', async () => {
  const conn = makeConn()
  const game = await dispatchMenuCommand(makeMessage({ command: 'menu_game', sender: '628444000111@s.whatsapp.net' }), { conn, prefix: '.', action: 'menu_game' })
  const tools = await dispatchMenuCommand(makeMessage({ command: 'menu_tools', sender: '628444000222@s.whatsapp.net' }), { conn, prefix: '.', action: 'menu_tools' })
  assert.equal(game.count, 2)
  assert.equal(tools.count, 2)
  const gameText = conn.sent[0].payload.text
  assert.match(gameText, /GAME MENU/)
  assert.ok(gameText.includes('uno') && gameText.includes('slot'))
  const toolText = conn.sent[1].payload.text
  assert.ok(toolText.includes('ttp') && toolText.includes('toimg'))
})

await test('rate limit mencegah spam aksi menu', async () => {
  const conn = makeConn()
  const m = makeMessage({ command: 'menu_all' })
  const first = await dispatchMenuCommand(m, { conn, prefix: '.', action: 'menu_all' })
  const second = await dispatchMenuCommand(m, { conn, prefix: '.', action: 'menu_all' })
  assert.equal(first.ok, true)
  assert.equal(second.mode, 'rate-limited')
  assert.equal(conn.sent.length, 1, 'pesan kedua tetap terkirim meski di-rate-limit')
})

await test('menu_refresh dibatasi 30 detik', async () => {
  const conn = makeConn()
  const chat = '628777666555@s.whatsapp.net'
  const m = makeMessage({ chat, command: 'menu_refresh' })
  const first = await dispatchMenuCommand(m, { conn, prefix: '.', action: 'menu_refresh' })
  assert.equal(first.mode, 'refresh')
  // lewati rate-limit per pengguna, lalu coba lagi: cooldown per chat harus menahan
  await new Promise(r => setTimeout(r, 1300))
  const second = await dispatchMenuCommand(m, { conn, prefix: '.', action: 'menu_refresh' })
  assert.equal(second.mode, 'throttled', 'refresh kedua tidak dibatasi')
  assert.ok(second.wait > 20, 'sisa waktu tunggu tidak masuk akal')
  assert.match(conn.sent[conn.sent.length - 1].payload.text, /Refresh dibatasi/)
})

await test('parseActionId mengenali ID tombol dan nomor halaman', () => {
  assert.deepEqual(parseActionId('menu_all'), { action: 'menu_all', page: null })
  assert.deepEqual(parseActionId('menu_all_3'), { action: 'menu_all', page: 3 })
  assert.deepEqual(parseActionId('.menu_owner'), { action: 'menu_owner', page: null })
  assert.equal(parseActionId('menu_unknown'), null)
})

await test('balasan angka 1–6 hanya aktif setelah menu dikirim', async () => {
  const conn = makeConn()
  const m = makeMessage({ command: 'umimenu' })
  const before = await handleNumericSelection({ ...m, text: '2' }, { conn, prefix: '.' })
  assert.equal(before, false, 'angka diproses padahal menu belum dikirim')
  await dispatchMenuCommand(m, { conn, prefix: '.', action: 'menu_back' })
  const after = await handleNumericSelection({ ...m, text: '2', sender: m.sender, chat: m.chat }, { conn, prefix: '.' })
  assert.equal(after, true)
})

await test('error pengiriman tidak membuat router melempar', async () => {
  const conn = makeConn()
  conn.failSend = true
  const m = makeMessage({ command: 'menu_all' })
  const result = await dispatchMenuCommand(m, { conn, prefix: '.', action: 'menu_all' })
  assert.equal(result.ok, false)
  assert.equal(result.mode, 'text')
})

/* ---------------- 5. kartu HTML ---------------- */
await test('kartu HTML memakai data hidup dan tetap kecil', async () => {
  const catalogue = buildCatalogue()
  const status = await collectStatus({ conn: makeConn(), chat: '628111@s.whatsapp.net', cpuSampleMs: 10 })
  const html = buildDashboardHtml({ status, stats: catalogue.stats, prefix: '.', botNumber: '628999888777' })
  assert.match(html, /Usanagi Umi AI/)
  assert.match(html, /AlzRiss/)
  assert.match(html, /8 perintah|<b>8<\/b>/)
  assert.ok(html.length < 900 * 1024, 'kartu HTML melebihi batas rich HTML')
  assert.match(html, /wa\.me\/628999888777/)
  assert.ok(!/access_token|refresh_token|session|apikey|api_key/i.test(html), 'kartu HTML memuat kata sensitif')
})

await test('tanpa nomor bot, kartu HTML tidak membuat tautan palsu', async () => {
  const catalogue = buildCatalogue()
  const status = await collectStatus({ conn: makeConn({ user: {} }), chat: '628111@s.whatsapp.net', cpuSampleMs: 10 })
  const html = buildDashboardHtml({ status, stats: catalogue.stats, prefix: '.', botNumber: '' })
  assert.ok(!html.includes('wa.me/'), 'tautan wa.me dibuat tanpa nomor')
  assert.match(html, /aria-disabled="true"/)
})

await test('menu_dashboard memakai sendRichHtml dan fallback teks bila gagal', async () => {
  const successConn = makeConn()
  const richCalls = []
  successConn.sendRichHtml = async (jid, html, options) => {
    richCalls.push({ jid, bytes: html.length, title: options.title })
    return { ok: true, mode: 'relay-html' }
  }
  const good = await dispatchMenuCommand(makeMessage({ command: 'menu_dashboard' }), { conn: successConn, prefix: '.', action: 'menu_dashboard' })
  assert.equal(good.ok, true)
  assert.equal(richCalls.length, 1)
  assert.equal(richCalls[0].jid, '628111222333@s.whatsapp.net')

  router.resetMenuState()
  const failConn = makeConn()
  failConn.sendRichHtml = async () => ({ ok: true, mode: 'text', fallbackUsed: true })
  const fallback = await dispatchMenuCommand(makeMessage({ command: 'menu_dashboard' }), { conn: failConn, prefix: '.', action: 'menu_dashboard' })
  assert.equal(fallback.ok, true)
  assert.match(fallback.mode, /text|dashboard/)
})

/* ---------------- 6. integrasi plugin ---------------- */
await test('plugin umi-menu memuat dan mendaftarkan semua ID interaksi', async () => {
  const mod = await import(path.join(ROOT, 'plugins/main/umi-menu.js'))
  const handler = mod.default
  assert.equal(typeof handler, 'function')
  const ids = ['umimenu', 'lmenu', 'menu_all', 'menu_owner', 'menu_group', 'menu_game', 'menu_tools', 'menu_refresh', 'menu_back', 'menu_dashboard', 'menu_all_4']
  for (const id of ids) assert.ok(handler.command.test(id), `perintah ${id} tidak cocok dengan handler.command`)
  handler.command.lastIndex = 0
  assert.ok(!handler.command.test('menu_unknown'))
  assert.equal(typeof handler.all, 'function')
})

await test('plugin: .umimenu mengirim menu, .menu_owner menolak non-owner', async () => {
  const mod = await import(path.join(ROOT, 'plugins/main/umi-menu.js'))
  const handler = mod.default

  const conn = makeConn()
  const menuMessage = makeMessage({ command: 'umimenu', text: '.umimenu', sender: '628666000111@s.whatsapp.net', chat: '628666000111@s.whatsapp.net' })
  await handler.call(conn, menuMessage, { conn, usedPrefix: '.', command: 'umimenu', args: [], text: '' })
  assert.ok(conn.sent.length >= 1, 'menu tidak terkirim')
  const outgoing = conn.sent[0]
  assert.equal(outgoing.jid, '628666000111@s.whatsapp.net')
  // Jalur native (list) memakai relayMessage; jalur teks memakai payload.text.
  if (outgoing.relay) {
    const text = JSON.stringify(outgoing.relay)
    assert.match(text, /menu_all|BUKA MENU/, 'payload list tidak memuat aksi menu')
  } else {
    const body = outgoing.payload?.text || outgoing.payload?.body || ''
    assert.match(String(body), /UMI USANAGI AI/)
  }

  router.resetMenuState()
  const conn2 = makeConn()
  const outsider = makeMessage({ command: 'menu_owner', text: '.menu_owner', sender: '628666000222@s.whatsapp.net', chat: '628666000222@s.whatsapp.net' })
  await handler.call(conn2, outsider, { conn: conn2, usedPrefix: '.', command: 'menu_owner', args: [], text: '' })
  assert.match(String(conn2.sent[0].payload.text), /ditolak/)
})

await test('plugin: ID tombol berprefix dihitung sebagai aksi yang sah', async () => {
  const mod = await import(path.join(ROOT, 'plugins/main/umi-menu.js'))
  const handler = mod.default
  const conn = makeConn()
  const m = makeMessage({ command: 'menu_all', text: '.menu_all', sender: '628666000333@s.whatsapp.net', chat: '628666000333@s.whatsapp.net' })
  await handler.call(conn, m, { conn, usedPrefix: '.', command: 'menu_all', args: [], text: '' })
  assert.match(String(conn.sent[0].payload.text), /SEMUA FITUR/)
})

await test('aset menu ada dan valid', () => {
  const files = { 'cover.jpg': 'image/jpeg', 'logo.jpg': 'image/jpeg', 'bg.jpg': 'image/jpeg', 'hero.mp4': 'video/mp4' }
  for (const [name, mime] of Object.entries(files)) {
    const file = path.join(ROOT, 'assets/menu', name)
    assert.ok(fs.existsSync(file), `aset ${name} tidak ada`)
    const buffer = fs.readFileSync(file)
    assert.ok(buffer.length > 1000, `aset ${name} terlalu kecil`)
    if (mime === 'image/jpeg') assert.equal(buffer.subarray(0, 2).toString('hex'), 'ffd8', `${name} bukan JPEG`)
    if (mime === 'video/mp4') assert.equal(buffer.subarray(4, 8).toString('ascii'), 'ftyp', `${name} bukan MP4`)
  }
})

await test('pengaturan sistem menu bisa dibaca & ditulis tanpa merusak file lain', () => {
  const original = router.readMenuSettings()
  const write = router.writeMenuSettings({ system: 'umi' })
  assert.equal(write.ok, true)
  assert.equal(router.shouldDelegateToUmiMenu(), true)
  router.writeMenuSettings({ system: original.system || 'legacy' })
  assert.equal(router.shouldDelegateToUmiMenu(), original.system === 'umi')
})

console.log(`\n=== HASIL: ${pass} lulus, ${failures.length} gagal ===`)
if (failures.length) {
  for (const [name, error] of failures) console.log(`\n${name}\n${error.stack}`)
  process.exit(1)
}
