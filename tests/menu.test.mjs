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
import crypto from 'crypto'

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
await test('menu_all hanya mengirim ke chat asal (HTML + navigasi native)', async () => {
  router.resetMenuState()
  const conn = makeConn()
  const cards = []
  conn.sendRichHtml = async (jid, html) => { cards.push({ jid, html }); return { ok: true, mode: 'relay-html' } }
  const m = makeMessage({ chat: '1203630@g.us', isGroup: true, command: 'menu_all', text: '.menu_all' })
  const result = await dispatchMenuCommand(m, { conn, prefix: '.', action: 'menu_all' })
  assert.equal(result.ok, true)
  assert.equal(cards.length, 1, 'halaman HTML allmenu tidak dikirim')
  assert.equal(cards[0].jid, '1203630@g.us')
  assert.match(cards[0].html, /All Menu/)
  const all = conn.sent.map(item => item.jid)
  assert.ok(all.length >= 1, 'daftar navigasi tidak dikirim')
  assert.ok(all.every(jid => jid === '1203630@g.us'), 'ada pesan yang bocor ke chat lain')
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
  router.resetMenuState()
  const conn = makeConn()
  conn.failSend = true
  conn.sendRichHtml = async () => ({ ok: false, mode: 'rich-error', error: 'relay ditolak' })
  const m = makeMessage({ command: 'menu_all', sender: '628555000123@s.whatsapp.net', chat: '628555000123@s.whatsapp.net' })
  let threw = false
  let result = null
  try {
    result = await dispatchMenuCommand(m, { conn, prefix: '.', action: 'menu_all' })
  } catch {
    threw = true
  }
  assert.equal(threw, false, 'router melempar saat pengiriman gagal')
  assert.ok(result && typeof result.mode === 'string', 'router tidak mengembalikan status')
  // Pengiriman boleh gagal (ok:false) atau berhasil lewat jalur relay; yang
  // penting tidak ada exception yang sampai ke handler.
})

/* ---------------- 5. kartu HTML ---------------- */
await test('kartu HTML memakai data hidup dan tetap di bawah batas rich', async () => {
  const catalogue = buildCatalogue()
  const status = await collectStatus({ conn: makeConn(), chat: '628111@s.whatsapp.net', cpuSampleMs: 10 })
  const html = buildDashboardHtml({ status, stats: catalogue.stats, prefix: '.', botNumber: '628999888777' })
  assert.match(html, /Usanagi Umi AI/)
  assert.match(html, /AlzRiss/)
  assert.match(html, /8 perintah/)
  assert.match(html, /\.menu_all/, 'kartu tidak menyebut perintah allmenu HTML')
  assert.ok(html.length < 900 * 1024, 'kartu HTML melebihi batas rich HTML')
  assert.ok(!/access_token|refresh_token|session|apikey|api_key/i.test(html), 'kartu HTML memuat kata sensitif')
})

await test('kartu HTML tidak memuat tautan keluar (WebView WhatsApp tanpa jaringan)', () => {
  const catalogue = buildCatalogue()
  return collectStatus({ conn: makeConn(), chat: '628111@s.whatsapp.net', cpuSampleMs: 10 }).then(status => {
    const html = buildDashboardHtml({ status, stats: catalogue.stats, prefix: '.' })
    assert.ok(!/<a\s/i.test(html), 'kartu memuat anchor yang tidak bisa diklik')
    assert.ok(!/wa\.me|https?:\/\//i.test(html), 'kartu memuat URL eksternal')
    assert.match(html, /Tombol menu ada di daftar WhatsApp/, 'kartu tidak menjelaskan cara membuka menu')
  })
})

await test('kartu memakai background foto bila aset tersedia', () => {
  const catalogue = buildCatalogue()
  return collectStatus({ conn: makeConn(), chat: '628111@s.whatsapp.net', cpuSampleMs: 10 }).then(status => {
    const html = buildDashboardHtml({
      status, stats: catalogue.stats, prefix: '.',
      assets: { backgroundDataUri: 'data:image/jpeg;base64,AAAA', logoDataUri: 'data:image/jpeg;base64,BBBB' },
    })
    assert.match(html, /class="hero-bg" src="data:image\/jpeg;base64,AAAA"/)
    assert.match(html, /class="logo" src="data:image\/jpeg;base64,BBBB"/)
  })
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
  const ids = ['umimenu', 'lmenu', 'menu', 'menu_all', 'menu_all_4', 'menu_owner', 'menu_group', 'menu_game', 'menu_tools']
  for (const id of ids) assert.ok(handler.command.test(id), `perintah ${id} tidak cocok dengan handler.command`)
  handler.command.lastIndex = 0
  // Menu teks lama tidak boleh diambil alih lagi.
  for (const id of ['allmenu', 'kategori', 'listmenu', 'menu_refresh', 'menu_unknown']) {
    assert.ok(!handler.command.test(id), `umi-menu masih mengklaim ${id}`)
  }
  assert.equal(typeof handler.all, 'function')
})

await test('.menu mengirim kartu HTML (bukan menu teks lama)', async () => {
  router.resetMenuState()
  const calls = []
  const conn = makeConn()
  conn.sendRichHtml = async (jid, html, options) => {
    calls.push({ jid, html, options })
    return { ok: true, mode: 'relay-html' }
  }
  const m = makeMessage({ command: 'menu', text: '.menu', sender: '628555000999@s.whatsapp.net', chat: '628555000999@s.whatsapp.net' })
  const result = await dispatchMenuCommand(m, { conn, prefix: '.', action: 'menu_dashboard' })
  assert.equal(result.ok, true)
  assert.equal(calls.length, 1, 'kartu HTML tidak dikirim')
  assert.match(calls[0].html, /Usanagi Umi AI/)
  assert.match(calls[0].html, /\.menu_all/)
  assert.match(result.mode, /dashboard/, 'mode kartu tidak dilaporkan')
  // Setelah kartu harus ada pesan navigasi (list native atau teks) yang bisa ditekan.
  assert.ok(conn.sent.length >= 1, 'navigasi menu tidak dikirim setelah kartu')
})

await test('.umimenu style text memaksa menu teks', async () => {
  router.resetMenuState()
  const conn = makeConn()
  const owner = makeMessage({ command: 'umimenu', text: '.umimenu style text', sender: '628111222333@s.whatsapp.net', chat: '628111222333@s.whatsapp.net' })
  owner.reply = async text => { conn.sent.push({ jid: 'reply', payload: { text } }) }
  const mod = await import(path.join(ROOT, 'plugins/main/umi-menu.js'))
  await mod.default.call(conn, owner, { conn, usedPrefix: '.', command: 'umimenu', args: ['style', 'text'], text: '' })
  assert.match(String(conn.sent[0].payload.text), /tampilan teks/)
  // mode teks: .menu tidak memakai sendRichHtml
  const richCalls = []
  conn.sendRichHtml = async () => { richCalls.push(1); return { ok: true } }
  router.resetMenuState()
  await dispatchMenuCommand(makeMessage({ command: 'menu', sender: '628555000998@s.whatsapp.net', chat: '628555000998@s.whatsapp.net' }), { conn, prefix: '.', action: 'menu_dashboard' })
  assert.equal(richCalls.length, 0, 'mode teks masih mengirim HTML')
  const last = conn.sent[conn.sent.length - 1].payload.text
  assert.match(String(last), /UMI USANAGI AI/)
  // kembalikan ke html untuk uji berikutnya
  router.writeMenuSettings({ style: 'html' })
})

await test('.kategori <nama> menampilkan perintah kategori itu saja', async () => {
  router.resetMenuState()
  const conn = makeConn()
  const m = makeMessage({ command: 'kategori', sender: '628555000777@s.whatsapp.net', chat: '628555000777@s.whatsapp.net' })
  const listing = await dispatchMenuCommand(m, { conn, prefix: '.', action: 'menu_kategori', args: ['game'] })
  assert.equal(listing.mode, 'kategori')
  assert.equal(listing.count, 2)
  const text = conn.sent[0].payload.text
  assert.match(text, /GAME/)
  assert.ok(text.includes('uno') && text.includes('slot'))
  assert.ok(!text.includes('toimg'), 'kategori lain ikut tampil')

  router.resetMenuState()
  const missing = await dispatchMenuCommand(makeMessage({ command: 'kategori', sender: '628555000776@s.whatsapp.net', chat: '628555000776@s.whatsapp.net' }), { conn, prefix: '.', action: 'menu_kategori', args: ['tidakada'] })
  assert.equal(missing.mode, 'kategori-missing')
})

await test('menu teks lama (.allmenu/.kategori) kembali apa adanya', () => {
  const pairs = [
    ['plugins/main/usanagi-allmenu.js', '/home/user/backups/task105b/menu-lama/plugins_main_usanagi-allmenu.js'],
    ['plugins/main/usanagi-kategori.js', '/home/user/backups/task105b/menu-lama/plugins_main_usanagi-kategori.js'],
    ['plugins/_system/_allmenu.js', '/home/user/backups/task105b/menu-lama/plugins__system__allmenu.js'],
  ]
  for (const [rel, backup] of pairs) {
    const file = path.join(ROOT, rel)
    assert.ok(fs.existsSync(file), `${rel} belum dipulihkan`)
    assert.equal(
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex'),
      `${rel} berubah dari versi asli`
    )
  }
  // .menu lama tetap tidak dipulihkan: .menu sekarang kartu HTML.
  assert.ok(!fs.existsSync(path.join(ROOT, 'plugins/main/usanagi-menu.js')), 'usanagi-menu.js tidak boleh kembali')
})

await test('plugin: .umimenu mengirim menu, .menu_owner memakai menu teks lama', async () => {
  const mod = await import(path.join(ROOT, 'plugins/main/umi-menu.js'))
  const handler = mod.default

  router.resetMenuState()
  const conn = makeConn()
  const cards = []
  conn.sendRichHtml = async (jid, html) => { cards.push(jid); return { ok: true, mode: 'relay-html' } }
  const menuMessage = makeMessage({ command: 'umimenu', text: '.umimenu', sender: '628666000111@s.whatsapp.net', chat: '628666000111@s.whatsapp.net' })
  await handler.call(conn, menuMessage, { conn, usedPrefix: '.', command: 'umimenu', args: [], text: '' })
  assert.equal(cards.length, 1, 'kartu menu tidak dikirim')
  assert.ok(conn.sent.length >= 1, 'daftar tombol tidak dikirim')
  assert.equal(conn.sent[0].jid, '628666000111@s.whatsapp.net')
})

await test('plugin: .menu_owner memakai menu teks lama (bukan halaman HTML)', async () => {
  const mod = await import(path.join(ROOT, 'plugins/main/umi-menu.js'))
  const handler = mod.default
  const conn = makeConn()
  const richCalls = []
  conn.sendRichHtml = async () => { richCalls.push(1); return { ok: true, mode: 'relay-html' } }
  const m = makeMessage({ command: 'menu_owner', text: '.menu_owner', sender: '628666000444@s.whatsapp.net', chat: '628666000444@s.whatsapp.net' })
  await handler.call(conn, m, { conn, usedPrefix: '.', command: 'menu_owner', args: [], text: '' })
  const texts = conn.sent.filter(item => item.payload && typeof item.payload.text === 'string').map(item => item.payload.text)
  const joined = texts.join('\n')
  assert.equal(richCalls.length, 0, '.menu_owner masih mengirim kartu HTML')
  assert.ok(joined.length > 100, '.menu_owner tidak mengirim daftar teks')
  assert.match(joined, /setprefix/, 'perintah owner tidak muncul di menu owner')
  assert.ok(!/\bslot\b/.test(joined), 'perintah game ikut muncul di menu owner')
})

await test('plugin: .menu_group memakai menu teks lama juga', async () => {
  const mod = await import(path.join(ROOT, 'plugins/main/umi-menu.js'))
  const conn = makeConn()
  const richCalls = []
  conn.sendRichHtml = async () => { richCalls.push(1); return { ok: true } }
  const m = makeMessage({ command: 'menu_group', text: '.menu_group', chat: '1203630@g.us', isGroup: true, sender: '628666000555@s.whatsapp.net' })
  await mod.default.call(conn, m, { conn, usedPrefix: '.', command: 'menu_group', args: [], text: '' })
  const joined = conn.sent.filter(i => i.payload && typeof i.payload.text === 'string').map(i => i.payload.text).join('\n')
  assert.equal(richCalls.length, 0)
  assert.match(joined, /kick|glist/i, 'perintah grup tidak muncul')
})

await test('plugin: ID tombol berprefix dihitung sebagai aksi yang sah', async () => {
  const mod = await import(path.join(ROOT, 'plugins/main/umi-menu.js'))
  const handler = mod.default
  const conn = makeConn()
  const m = makeMessage({ command: 'menu_all', text: '.menu_all', sender: '628666000333@s.whatsapp.net', chat: '628666000333@s.whatsapp.net' })
  const before = conn.sent.length
  await handler.call(conn, m, { conn, usedPrefix: '.', command: 'menu_all', args: [], text: '' })
  assert.ok(conn.sent.length > before, 'ID .menu_all tidak menghasilkan pesan apa pun')
  const payload = JSON.stringify(conn.sent.slice(before))
  assert.match(payload, /SEMUA FITUR|All Menu|menu_all/, 'ID .menu_all tidak diproses sebagai perintah')
})

await test('auto-ai memilih umi-menu untuk .menu dan allmenu teks untuk .allmenu', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/auto-ai.js'), 'utf8')
  assert.ok(source.includes("/umi-menu.js"), 'auto-ai.js belum mengarah ke umi-menu.js')
  assert.ok(source.includes("/_allmenu.js"), 'auto-ai.js kehilangan preferensi allmenu teks')
  assert.ok(!/usanagi-menu\.js/.test(source), 'auto-ai.js masih menunjuk menu yang sudah dihapus')
})

await test('setmenu lama tidak menyimpan gaya yang sudah tidak dipakai', () => {
  const source = fs.readFileSync(path.join(ROOT, 'plugins/owner/owner-setmenu.js'), 'utf8')
  assert.ok(source.includes('readMenuSettings'), 'setmenu belum membaca pengaturan menu baru')
  assert.ok(!/setMenuStyle\(/.test(source.split('const handler')[1] || ''),
    'setmenu masih memanggil setMenuStyle pada alur perintah')
})

await test('plugin .setmenu mengatur menu utama + gaya .help, tanpa duplikat', async () => {
  const mod = await import(path.join(ROOT, 'plugins/owner/owner-setmenu.js'))
  const handler = mod.default
  const before = router.readMenuSettings()
  const replies = []
  const msg = (arg) => ({ args: arg === undefined ? [] : [arg], reply: async (t) => replies.push(String(t)) })
  const conn = { user: { jid: '628000@s.whatsapp.net' } }
  const run = (arg) => handler(msg(arg), { conn, usedPrefix: '.', command: 'setmenu', text: arg === undefined ? '' : arg, isOwner: true })
  await run(undefined)
  assert.match(replies.at(-1), /kartu HTML/i)
  assert.match(replies.at(-1), /Gaya \.help/i)
  await run('text')
  assert.equal(router.readMenuSettings().style, 'text')
  assert.match(replies.at(-1), /teks/i)
  await run('modern')
  assert.equal(router.readMenuSettings().style, 'html')
  await run('3')
  assert.match(replies.at(-1), /Classic Text/)
  await run('ngawur')
  assert.match(replies.at(-1), /tidak dikenal/i)
  await run('text')
  const outsider = []
  await handler({ args: [], reply: async (t) => outsider.push(String(t)) }, { conn, usedPrefix: '.', command: 'setmenu', text: '', isOwner: false })
  assert.match(outsider.at(-1), /Hanya Owner/i)
  router.writeMenuSettings({ style: before.style || 'html' })
})

await test('hanya satu plugin yang memiliki perintah setmenu', () => {
  const dir = path.join(ROOT, 'plugins')
  const owners = []
  const walk = (folder) => {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, item.name)
      if (item.isDirectory()) { walk(full); continue }
      if (!item.name.endsWith('.js')) continue
      const src = fs.readFileSync(full, 'utf8')
      if (src.includes('handler.command = /^setmenu$/i')) owners.push(path.relative(ROOT, full))
    }
  }
  walk(dir)
  assert.deepEqual(owners, ['plugins/owner/owner-setmenu.js'])
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
