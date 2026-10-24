// Uji nyata: .setprefix lewat handler asli (bukan simulasi plugin langsung).
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(ROOT)
global.__filename = url => fileURLToPath(url)

const SESSION = path.join(ROOT, 'sessions', 'jadibot', '628111222333')
fs.mkdirSync(SESSION, { recursive: true })
fs.writeFileSync(path.join(SESSION, 'creds.json'), JSON.stringify({ registered: true }))
fs.writeFileSync(path.join(SESSION, 'bot-config.json'), JSON.stringify({
  namebot: 'Tes Prefix', defaultPrefix: '.', ownerNumbers: ['628111222333'],
  autoAI: { enabled: false }, registrationRequired: false, public: true,
}, null, 2))

const { loadJadibotConfig } = await import('../lib/bot-config.js')
const { handler } = await import('../handler.js')

const bot = '628111222333@s.whatsapp.net'
const owner = '628999888777@s.whatsapp.net'

global.owner = [['628999888777', 'Owner', true]]
global.opts = {}
global.mainBot = { defaultPrefix: '.' }
global.jadibotPlatform = {}
global.mods = []
global.db = { data: { users: {}, chats: {}, stats: {}, settings: {}, blacklistUser: {} }, write: async () => {} }
global.loadDatabase = async () => {}
global.dfail = (reason, m) => m.reply('Denied: ' + reason)
global.conn = { sendMessage: () => { throw Error('main socket mati') } }

function makeConn(defaultPrefix) {
  const sent = []
  const conn = {
    user: { id: bot, jid: bot },
    getName: () => 'Tes Bot',
    loadMessage: async () => null,
    botConfig: loadJadibotConfig('628111222333', SESSION),
    pushMessage: async () => {},
    groupMetadata: async () => ({ participants: [] }),
    onWhatsApp: async () => [],
    readMessages: async () => {},
    sendMessage: async function (jid, content) { sent.push({ jid, content }); return { key: { id: 'ok' } } },
  }
  if (defaultPrefix) conn.botConfig.defaultPrefix = defaultPrefix
  Object.defineProperty(conn, 'reply', { value: function (jid, text) { return this.sendMessage(jid, { text }) } })
  return { conn, sent }
}

function makeMsg(conn, text, id) {
  const chat = owner
  const proto = Object.defineProperty({}, 'reply', { value: function (t) { return this.conn.reply(this.chat, t) } })
  return Object.assign(Object.create(proto), {
    conn, chat, sender: owner, key: { id, remoteJid: chat }, message: { conversation: text },
    text, mentionedJid: [], isGroup: false, pushName: 'Owner', fromMe: false,
  })
}

const setprefixPlugin = (await import('../plugins/owner/usanagi-setprefix.js')).default
const pingPlugin = Object.assign(async (m, { conn }) => { await conn.sendMessage(m.chat, { text: 'pong' }) }, { command: /^ping$/, help: ['ping'], tags: ['info'] })

async function cleanPrefixRows() {
  const { getDb } = await import('../core/awang-sqlite.js')
  try { getDb().prepare('DELETE FROM prefixes').run() } catch {}
}

test('setprefix global dari chat benar-benar mengubah prefix + tersimpan', async () => {
  await cleanPrefixRows()
  global.plugins = { 'owner/usanagi-setprefix.js': setprefixPlugin, 'info/ping.js': pingPlugin }
  const { conn, sent } = makeConn()
  const m = makeMsg(conn, '.setprefix global !', 'pfx-1')
  await handler.call(conn, { messages: [m] })
  const balasan = sent.map(s => s.content.text).join(' | ')
  const file = JSON.parse(fs.readFileSync(path.join(SESSION, 'bot-config.json'), 'utf8'))
  console.log('BALASAN:', balasan)
  console.log('defaultPrefix di berkas:', file.defaultPrefix)
  assert.equal(file.defaultPrefix, '!', 'prefix global tidak tersimpan ke bot-config.json')
  assert.match(balasan, /Prefix default bot ini diubah/i)
})

test('pesan berikutnya memakai prefix baru (!ping)', async () => {
  await cleanPrefixRows()
  global.plugins = { 'owner/usanagi-setprefix.js': setprefixPlugin, 'info/ping.js': pingPlugin }
  const { conn, sent } = makeConn()
  const m = makeMsg(conn, '!ping', 'pfx-2')
  await handler.call(conn, { messages: [m] })
  console.log('BALASAN !ping:', JSON.stringify(sent.map(s => s.content.text)))
  assert.equal(sent.map(s => s.content.text).join(), 'pong')
})

test('setprefix per chat menyimpan prefix khusus chat', async () => {
  await cleanPrefixRows()
  global.plugins = { 'owner/usanagi-setprefix.js': setprefixPlugin, 'info/ping.js': pingPlugin }
  const { conn, sent } = makeConn('!')
  const m = makeMsg(conn, '!setprefix /', 'pfx-3')
  await handler.call(conn, { messages: [m] })
  console.log('BALASAN per-chat:', sent.map(s => s.content.text).join(' | '))
  const { getActivePrefix } = await import('../core/awang-prefix.js')
  const { prefixStorageKey } = await import('../lib/bot-config.js')
  const key = prefixStorageKey(conn, owner)
  const active = await getActivePrefix(key, conn.botConfig.defaultPrefix)
  console.log('prefix aktif untuk chat:', active, '| key:', key)
  assert.equal(active, '/')
})
