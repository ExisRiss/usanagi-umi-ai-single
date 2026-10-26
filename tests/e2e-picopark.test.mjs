// Uji end-to-end lewat handler.js asli bot: 2 pemain, 3 level, menang.
// Jalankan: node tests/e2e-picopark.test.mjs   (bukan `node --test`)
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'

const ROOT = process.env.UMI_BOT_ROOT || '/home/user/work-task94/single'
process.chdir(ROOT)

// bootstrap global yang biasanya disiapkan main.js
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
global.__filename = function filename(pathURL = import.meta.url, rmPrefix = true) {
  return rmPrefix ? (/file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL) : pathToFileURL(pathURL).toString()
}
global.__dirname = function dirname(pathURL) { return path.dirname(global.__filename(pathURL, true)) }
global.__require = function require(dir = import.meta.url) { return createRequire(dir) }
global.opts = global.opts || {}
global.prefix = global.prefix || /^[./#!]/

const logs = []
const log = (...args) => { logs.push(args.join(' ')); console.log(...args) }

// ---- conn tiruan: merekam teks + rich html yang dikirim ----
const sent = []
const conn = {
  user: { id: '6281111111111:1@s.whatsapp.net' },
  async reply(jid, text, quoted) { sent.push({ type: 'text', jid, text }); return { key: { id: 'r' + sent.length, remoteJid: jid } } },
  async sendMessage(jid, payload) { sent.push({ type: 'msg', jid, payload }); return { key: { id: 'm' + sent.length, remoteJid: jid } } },
  async relayMessage(jid, message, opts) {
    const data = message.botForwardedMessage.message.richResponseMessage.unifiedResponse.data
    const json = JSON.parse(Buffer.from(data, 'base64').toString('utf8'))
    const html = json.sections[0].view_model.primitive.payload
    sent.push({ type: 'rich', jid, html, size: html.length, id: opts?.messageId })
    return true
  },
}

// Kontrak plugin sama seperti yang dipanggil handler.js:
//   plugin.call(conn, m, extra)  dengan extra = { conn, command, args, text, usedPrefix, botConfig, ... }
const handler = (await import(path.join(ROOT, 'plugins/game-html/picopark.js'))).default
assert.ok(handler, 'plugin picopark tidak mengekspor default')
assert.equal(typeof handler.all, 'function', 'hook all tidak terpasang')
assert.ok(handler.command.test('picopark'), 'regex command salah')

function makeMsg(sender, body, pushName) {
  return {
    chat: '120363000000000001@g.us',
    sender,
    participant: sender,
    pushName,
    text: body,
    body,
    message: { conversation: body },
    key: { remoteJid: '120363000000000001@g.us', participant: sender, fromMe: false },
    reply(text) { sent.push({ type: 'text', jid: this.chat, text }) },
  }
}

async function cmd(sender, body, name) {
  const m = makeMsg(sender, '.' + body, name)
  const parts = body.trim().split(/\s+/)
  const extra = {
    conn,
    command: parts[0],
    args: parts.slice(1),
    text: parts.slice(1).join(' '),
    usedPrefix: '.',
    pushName: name,
    botConfig: { type: 'main', scope: 'main', defaultPrefix: '.', public: true, disabledPlugins: [] },
  }
  sent.length = 0
  await handler.call(conn, m, extra)
  return sent.slice()
}

function htmlState(entry) {
  const match = /var BOT_STATE = (\{.*?\});?\s*\n/s.exec(entry.html || '')
  assert.ok(match, 'BOT_STATE tidak ditemukan di html')
  return JSON.parse(match[1])
}

const P1 = '6281111111111@s.whatsapp.net'
const P2 = '6282222222222@s.whatsapp.net'

// 1. create
let out = await cmd(P1, 'picopark create', 'Riss')
const createText = out.filter(s => s.type === 'text').map(s => s.text).join('\n')
const code = (/Kode room: \*(\d{4})\*/.exec(createText) || [])[1]
assert.ok(code && code.length === 4, 'kode room 4 digit tidak muncul: ' + createText)
log('✅ kode room', code)

// 2. join → harus kirim rich html
out = await cmd(P2, `picopark join ${code}`, 'Budi')
const rich = out.filter(s => s.type === 'rich')
assert.ok(rich.length >= 1, 'rich html tidak terkirim saat join')
console.log('   kartu terkirim ke:', rich.map(r => r.jid.split('@')[0]).join(', '))
let st = htmlState(rich[0])
assert.equal(st.status, 'playing')
assert.equal(st.players.length, 2)
assert.deepEqual(st.players.map(p => p.name), ['Riss', 'Budi'])
assert.equal(st.bridgeActive, false)
log('✅ join: rich html', rich[0].size, 'B', '| pemain:', st.players.map(p => p.name).join(' & '))

// 3. state awal: belum ada kunci, belum menang
assert.equal(st.keyTaken, false, 'kunci sudah diambil di awal')
assert.equal(st.winner, null, 'sudah menang di awal')
assert.equal(st.doorUnlocked, false, 'pintu terbuka padahal kunci belum diambil')
log('✅ state awal benar: kunci belum, pintu terkunci')

// ---- solusi dihitung dari fisika asli plugin (BFS state penuh) ----
// Level 1 versi baru (Task117c) tidak lagi memakai plat/jembatan: pemain
// memanjat tangga 2 baris, mengambil kunci, lalu masuk pintu berdua.
const pico = await import(path.join(ROOT, 'plugins/game-html/picopark.js'))
const { LEVELS, activeRooms: roomsLive } = pico

function cariSolusi(roomAwal, maksLangkah = 26) {
  const kunci = r => r.players.map(p => `${p.x},${p.y},${p.inside ? 1 : 0}`).join('|') + '#' + (r.keyTaken ? 1 : 0)
  const antre = [{ room: structuredClone(roomAwal), jalan: [] }]
  const sudah = new Set([kunci(roomAwal)])
  while (antre.length) {
    const { room, jalan } = antre.shift()
    if (jalan.length >= maksLangkah) continue
    for (let i = 0; i < room.players.length; i += 1) {
      for (const aksi of ['left', 'right', 'jump']) {
        const coba = structuredClone(room)
        const hasil = pico.applyAction(coba, coba.players[i], aksi)
        if (coba.levelClear) return { jalan: [...jalan, { slot: coba.players[i].slot, aksi }], room: coba }
        if (!hasil || hasil.ok !== true) continue
        const k = kunci(coba)
        if (sudah.has(k)) continue
        sudah.add(k)
        antre.push({ room: coba, jalan: [...jalan, { slot: coba.players[i].slot, aksi }] })
      }
    }
  }
  return null
}

const roomLive = [...roomsLive.values()].find(r => r.code === code)
assert.ok(roomLive, 'room tidak ada di activeRooms')
const solusi = cariSolusi(roomLive)
assert.ok(solusi, 'level 1 tidak punya solusi dari posisi spawn — level mustahil dimainkan')
log('  solusi level 1:', solusi.jalan.map(l => `P${l.slot}:${l.aksi}`).join(' '))

async function walk(sender, name, acts) {
  const said = []
  for (const act of acts) {
    const result = await cmd(sender, `picopark ${act}`, name)
    const text = result.filter(x => x.type === 'text').map(x => x.text).join('\n')
    if (/⚠️/.test(text)) throw new Error(`${name} gagal ${act}: ${(/⚠️[^\n]*/.exec(text) || [])[0]}`)
    if (text) said.push(text)
  }
  return said.join('\n')
}

// 4. jalankan solusi lewat perintah chat asli, pemain demi pemain
let winText = ''
for (const langkah of solusi.jalan) {
  const sender = langkah.slot === 1 ? P1 : P2
  const name = langkah.slot === 1 ? 'Riss' : 'Budi'
  winText = await walk(sender, name, [langkah.aksi])
  if (/Level 1 selesai|MENANG/.test(winText)) break
}
log(winText.trim().split('\n').slice(0, 4).join('\n'))

// 5. status akhir
out = await cmd(P1, 'picopark status', 'Riss')
let boardText = out.map(x => x.text || '').join('\n')
assert.match(winText, /Level 1 selesai|MENANG/, 'tidak ada pesan level selesai:\n' + winText)
// setelah level selesai, room otomatis pindah ke level 2 (state di-reset)
assert.match(boardText, /Level 2|Jembatan Panjang/, 'room tidak lanjut ke level 2:\n' + boardText)
log('✅ level 1 selesai: kunci diambil + semua pemain masuk pintu')

// 8. room penuh
out = await cmd('6283333333333@s.whatsapp.net', `picopark join ${code}`, 'Tamu')
const fullText = out.filter(s => s.type === 'text').map(s => s.text).join('\n')
assert.match(fullText, /penuh/, 'room penuh tidak ditolak')
log('✅ room penuh ditolak')

// 9. bridge payload (room masih aktif, 2 pemain)
const { handleBridgePayload, activeRooms } = await import(path.join(ROOT, 'plugins/game-html/picopark.js'))
assert.ok(activeRooms.size >= 1)
const room = [...activeRooms.values()].find(r => r.code === code)
assert.ok(room, 'room hilang')
const before = room.moves
const res = await handleBridgePayload(conn, { action: 'move', direction: 'left', player: 1, roomCode: code }, { sender: P1 })
assert.equal(res.ok, true, 'bridge gagal: ' + res.reason)
assert.ok(room.moves > before, 'moves tidak bertambah')
log('✅ bridge webview: aksi diterapkan, moves', before, '->', room.moves)

// 11. payload rusak tidak meledak
const bad = await handleBridgePayload(conn, { action: 'move', roomCode: '0000', player: 9 }, { sender: P1 })
assert.equal(bad.ok, false)
log('✅ payload asing ditolak rapi:', bad.reason)

// 12. hook all: JSON dari webview tidak bikin error
const hookMsg = makeMsg(P1, JSON.stringify({ action: 'jump', player: 1, roomCode: code }), 'Riss')
await handler.all.call(conn, hookMsg, { conn, botConfig: { type: 'main', scope: 'main', defaultPrefix: '.', public: true, disabledPlugins: [] } })
log('✅ hook all menerima payload JSON tanpa error')

// 13. leave → room menunggu pemain lagi
out = await cmd(P2, 'picopark leave', 'Budi')
assert.match(out.map(s => s.text || '').join('\n'), /keluar/i)
log('✅ leave')

// 14. ukuran html
const savedRich = rich[0]
fs.writeFileSync('/tmp/picopark-last.html', savedRich.html)
log('✅ html rich pertama:', savedRich.size, 'B')
log('\n🎉 SEMUA UJI E2E LULUS')
process.exit(0)
