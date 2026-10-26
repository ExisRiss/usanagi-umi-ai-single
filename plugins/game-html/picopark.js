/* Picopark Co-op — game HTML/Rich WhatsApp 2 pemain (versi 2)
 * By AlzRiss — dibikin untuk Usanagi Umi AI
 *
 * Referensi aturan asli PICO PARK (TECOPARK):
 *   - Pemain = "Pico Cat": kepala besar, sepasang telinga, mata hitam besar.
 *   - Tujuan tiap level: ambil KUNCI → buka PINTU → SEMUA pemain masuk pintu.
 *   - Level dirancang supaya mustahil diselesaikan satu orang.
 *
 * Mekanisme versi ini:
 *   - Plat (plate) harus DITEKAN (diinjak pemain atau ditindih kotak) supaya
 *     jembatan muncul. Dua plat di level (kiri & kanan) saling menggantikan:
 *     P1 menahan plat kiri → P2 menyeberang → P2 menahan plat kanan →
 *     P1 menyusul. Kalau P2 lepas plat terlalu cepat, P1 jatuh.
 *   - Kotak (box) bisa didorong dan ditindihkan ke plat.
 *   - Kunci diambil otomatis saat diinjak. Pintu terbuka setelah kunci diambil.
 *   - Menang = kunci sudah diambil DAN semua pemain SUDAH MASUK pintu
 *     (pemain yang menyentuh pintu hilang dari papan dan menunggu partner —
 *     persis seperti Pico Park asli, jadi tidak saling menghalangi).
 *
 * Perintah (prefix mengikuti prefix bot):
 *   .picopark                    bantuan + status
 *   .picopark create             buat room
 *   .picopark join <kode>        masuk sebagai pemain 2
 *   .picopark left|right|jump    gerakkan karaktermu
 *   .picopark p1|p2 <aksi>       gerakkan slot tertentu (1 HP bergiliran)
 *   .picopark status             papan teks
 *   .picopark level              info level sekarang
 *   .picopark leave              keluar
 *
 * Perbaikan Task110 (tombol game tidak bisa dipencet / karakter tidak gerak):
 *   - WebView WhatsApp TIDAK punya jembatan ke bot, jadi tombol di dalam kartu
 *     HTML tidak mengirim apa pun. `picopark.html` sekarang otomatis main
 *     LOKAL bila jembatan tidak ada (2 pemain di satu layar), dan bot selalu
 *     menyertakan tautan versi web yang bisa dibuka di browser.
 *   - Tautan web bisa diubah lewat env PICOPARK_WEB_URL.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/* Halaman web yang benar-benar bisa dimainkan di browser (keyboard + tombol). */
// Task117c — host lama (game.gwenna.my.id) origin tunnel-nya mati (502/530).
// Halaman sekarang disajikan platform: https://picopark.gwenna.my.id/
const WEB_URL = String(process.env.PICOPARK_WEB_URL || 'https://picopark.gwenna.my.id/').trim()
const webLine = prefix => `🌐 Versi web (bisa diklik): ${WEB_URL}\n▶️ Di chat: ${prefix}picopark left | right | jump`

/* ============================================================
 * 1. STATE GLOBAL (dipakai bersama semua sesi/jadibot di proses ini)
 * ============================================================ */

const activeRooms = new Map()
const playerIndex = new Map()
const lastUiMessage = new Map()

const ROOM_TTL_MS = 30 * 60 * 1000
const ACTION_COOLDOWN_MS = 0            // naikkan ke 250-400 kalau grup ramai
const CODE_MIN = 1000
const CODE_MAX = 9999

/* ============================================================
 * 2. LEVEL
 *
 * Koordinat: x = kolom, y = baris. y makin besar makin bawah.
 * `floorRow` = baris lantai solid. Pemain "berdiri" di baris tepat di atas
 * permukaan solid (jadi kalau ledge di y=3, pemain berdiri di y=2).
 *
 * Simbol peta:
 *   #  solid (ledge / lantai)     =  jembatan (muncul saat plat ditekan)
 *   P  plat tekanan               K  kunci
 *   D  pintu (semua pemain masuk) B  kotak
 * ============================================================ */

function makeLevel(definition) {
  return {
    width: definition.width || 12,
    height: definition.height || 7,
    floorRow: definition.floorRow || 6,
    name: definition.name,
    hint: definition.hint || '',
    spawn: definition.spawn,
    plates: definition.plates || [],
    bridges: definition.bridges || [],
    ledges: definition.ledges || [],
    boxes: definition.boxes || [],
    key: definition.key || null,
    door: definition.door || [],
  }
}

const LEVELS = [
  /*
   * Task117c — level lama TIDAK BISA DISELESAIKAN:
   * tebingnya 3 baris di atas lantai, sedangkan lompatan maksimal 2 baris,
   * jadi kunci & pintu mustahil dijangkau (keluhan "gabisa main, gabisa lompat").
   * Semua level di bawah disusun ulang dengan tangga 2 baris supaya bisa
   * dimainkan satu orang pun.
   */
  makeLevel({
    name: 'Hello Pico Park',
    hint: 'Lompat ke tebing kiri, lalu lompat lagi ke tebing atas. Ambil kunci, masuk pintu.',
    spawn: [{ x: 1, y: 5 }, { x: 2, y: 5 }],
    plates: [],
    bridges: [],
    ledges: [
      { x: 2, y: 4 }, { x: 3, y: 4 },
      { x: 4, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 }, { x: 7, y: 2 }, { x: 8, y: 2 },
    ],
    key: { x: 6, y: 1 },
    door: [{ x: 7, y: 1 }, { x: 8, y: 1 }],
  }),
  makeLevel({
    name: 'Jembatan Panjang',
    hint: 'Dorong kotak ke plat kiri supaya jembatan menyala, lalu naik berdua.',
    spawn: [{ x: 4, y: 5 }, { x: 5, y: 5 }],
    plates: [{ x: 1, y: 5 }],
    bridges: [{ x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }],
    ledges: [
      { x: 4, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 }, { x: 7, y: 2 }, { x: 8, y: 2 },
    ],
    boxes: [{ x: 2, y: 5 }],
    key: { x: 6, y: 1 },
    door: [{ x: 7, y: 1 }, { x: 8, y: 1 }],
  }),
  makeLevel({
    name: 'Kotak Penolong',
    hint: 'Kotaknya bisa menahan plat supaya kamu bebas memanjat.',
    spawn: [{ x: 3, y: 5 }, { x: 4, y: 5 }],
    plates: [{ x: 1, y: 5 }],
    bridges: [{ x: 2, y: 4 }, { x: 3, y: 4 }],
    ledges: [
      { x: 4, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 }, { x: 7, y: 2 },
    ],
    boxes: [{ x: 2, y: 5 }],
    key: { x: 6, y: 1 },
    door: [{ x: 7, y: 1 }, { x: 5, y: 1 }],
  }),
]

/* ============================================================
 * 3. UTILITAS
 * ============================================================ */

const nowIso = () => new Date().toISOString()
const jidKey = value => String(value || '').split('@')[0].split(':')[0]
const senderOf = m => m?.sender || m?.key?.participant || m?.participant || m?.key?.remoteJid || m?.chat
const scopeOf = (extra, m) => String(extra?.botConfig?.scope || extra?.botScope || extra?.conn?.botConfig?.scope || m?.chat || 'main')
const playerKey = (extra, m) => `${scopeOf(extra, m)}:${jidKey(senderOf(m))}`

function displayName(m) {
  const name = String(m?.pushName || '').trim()
  if (name) return name.slice(0, 24)
  const number = jidKey(senderOf(m))
  return number ? `+${number.slice(0, 4)}***${number.slice(-3)}` : 'Pemain'
}

/** Argumen dari runtime Usanagi (extra.args) atau teks mentah. */
function resolveArgs(m, extra = {}) {
  const fromExtra = Array.isArray(extra.args) ? extra.args.map(value => String(value)).filter(Boolean) : []
  if (fromExtra.length) return /^picopark$/i.test(fromExtra[0]) ? fromExtra.slice(1) : fromExtra
  const raw = String(extra.text ?? m?.text ?? m?.body ?? '').trim()
  if (!raw) return []
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length && /^picopark$/i.test(parts[0])) parts.shift()
  return parts
}

async function reply(conn, m, text, options = {}) {
  const jid = m?.chat || m?.key?.remoteJid
  const quoted = options.quoted === false ? null : (options.quoted ?? m)
  try { if (typeof conn?.reply === 'function') return await conn.reply(jid, text, quoted) } catch {}
  try { if (typeof conn?.sendMessage === 'function') return await conn.sendMessage(jid, { text }, quoted ? { quoted } : {}) } catch {}
  try { if (typeof m?.reply === 'function') return await m.reply(text) } catch {}
  return null
}

const sameTile = (a, b) => Boolean(a && b && a.x === b.x && a.y === b.y)
const tileKey = (x, y) => `${x},${y}`

function levelOf(room) {
  return LEVELS[Math.min(room.level || 0, LEVELS.length - 1)]
}

/* ============================================================
 * 4. FISIKA
 * ============================================================ */

function platesPressed(room) {
  const level = levelOf(room)
  const onPlate = new Set()
  for (const player of room.players) {
    if (level.plates.some(tile => sameTile(tile, player))) onPlate.add(tileKey(player.x, player.y))
  }
  for (const box of room.boxes || []) {
    if (level.plates.some(tile => sameTile(tile, box))) onPlate.add(tileKey(box.x, box.y))
  }
  return { pressed: onPlate.size > 0, tiles: onPlate }
}

function bridgeActive(room) {
  return platesPressed(room).pressed
}

function boxAt(room, x, y) {
  return (room.boxes || []).find(box => box.x === x && box.y === y) || null
}

function isSolid(room, x, y, options = {}) {
  const level = levelOf(room)
  if (x < 0 || x >= level.width) return true
  if (y < 0) return true
  if (y >= level.floorRow) return true
  if (level.ledges.some(tile => tile.x === x && tile.y === y)) return true
  if (bridgeActive(room) && level.bridges.some(tile => tile.x === x && tile.y === y)) return true
  if (!options.ignoreBoxes && boxAt(room, x, y)) return true
  return false
}

/** Jatuh sampai ada pijakan. */
function applyGravity(room, entity) {
  let guard = 0
  while (entity.y < levelOf(room).floorRow && !isSolid(room, entity.x, entity.y + 1) && guard++ < 30) entity.y += 1
  return entity
}

function playerAt(room, x, y, except) {
  // pemain yang sudah masuk pintu tidak menghalangi partner
  return room.players.find(player => player !== except && !player.inside && player.x === x && player.y === y) || null
}

/** Dorong kotak satu sel. Gagal kalau di balik kotak tidak kosong. */
function tryPushBox(room, box, dx) {
  const tx = box.x + dx
  const ty = box.y
  if (isSolid(room, tx, ty, { ignoreBoxes: false }) && !boxAt(room, tx, ty)) return false
  if (boxAt(room, tx, ty)) return false
  if (playerAt(room, tx, ty)) return false
  // kotak tidak boleh didorong menembus dinding/tepi
  const level = levelOf(room)
  if (tx < 0 || tx >= level.width) return false
  box.x = tx
  box.y = ty
  applyGravity(room, box)
  return true
}

function step(room, player, direction) {
  const dx = direction === 'right' ? 1 : -1
  const tx = player.x + dx
  const targetBox = boxAt(room, tx, player.y)
  if (targetBox) {
    if (!tryPushBox(room, targetBox, dx)) return { moved: false, reason: 'Kotaknya tidak bisa didorong ke situ.' }
    player.x = tx
    applyGravity(room, player)
    return { moved: true, pushed: true }
  }
  if (isSolid(room, tx, player.y)) return { moved: false, reason: 'Terhalang dinding atau tebing.' }
  if (playerAt(room, tx, player.y, player)) return { moved: false, reason: 'Ada partner di sana. Coba lompat saja.' }
  player.x = tx
  applyGravity(room, player)
  return { moved: true }
}

/**
 * Lompat: naik 1–2 baris, boleh geser 1 kolom, pilih pendaratan tertinggi.
 *
 * Task117c — dulu lompatan DITOLAK kalau pendaratannya tidak lebih tinggi
 * (`probe.y >= player.y`), sehingga di tanah datar tombol lompat tidak
 * melakukan apa pun dan terasa "gabisa lompat". Sekarang:
 *   - pendaratan lebih tinggi  → dipakai (naik tebing),
 *   - pendaratan sama tinggi   → dipakai kalau itu satu-satunya jalan
 *     (lompat menyamping melewati satu kotak),
 *   - tidak ada pijakan sama sekali → alasan ditulis jelas ke pemain.
 */
function jump(room, player) {
  const candidates = [
    [0, -2], [1, -2], [-1, -2],
    [0, -1], [1, -1], [-1, -1],
  ]
  let best = null
  let samping = null
  for (const [dx, dy] of candidates) {
    const x = player.x + dx
    const y = player.y + dy
    if (isSolid(room, x, y)) continue
    if (playerAt(room, x, y, player)) continue
    const probe = { x, y }
    applyGravity(room, probe)
    if (probe.y < player.y) {
      const better = !best
        || probe.y < best.y
        || (probe.y === best.y && Math.abs(probe.x - player.x) < Math.abs(best.x - player.x))
      if (better) best = probe
    } else if (probe.y === player.y && dx !== 0 && !samping) {
      /* Lompat menyamping hanya berguna untuk MELOMPATI penghalang:
       * jalan datar di sisi itu terhalang, tetapi bagian atasnya kosong.
       * Tanpa syarat ini, tombol lompat di tanah lapang cuma geser kanan-kiri
       * dan terasa seperti bug. */
      const terhalang = isSolid(room, player.x + dx, player.y) || playerAt(room, player.x + dx, player.y, player)
      if (terhalang && !isSolid(room, probe.x, probe.y) && !playerAt(room, probe.x, probe.y, player)) {
        samping = probe
      }
    }
  }
  if (!best && !samping) return { moved: false, reason: 'Di sini tidak ada tebing untuk dipanjat. Dekati tebing lalu lompat.' }
  if (!best) best = samping
  player.x = best.x
  player.y = best.y
  return { moved: true }
}

/* ============================================================
 * 5. ROOM
 * ============================================================ */

function generateCode() {
  const span = CODE_MAX - CODE_MIN + 1
  for (let attempt = 0; attempt < 9000; attempt += 1) {
    const code = String(CODE_MIN + Math.floor(Math.random() * span))
    if (!activeRooms.has(code)) return code
  }
  for (let code = CODE_MIN; code <= CODE_MAX; code += 1) {
    if (!activeRooms.has(String(code))) return String(code)
  }
  throw new Error('Semua kode room terpakai. Coba lagi nanti.')
}

function resetLevelState(room) {
  const level = levelOf(room)
  room.boxes = (level.boxes || []).map(box => ({ x: box.x, y: box.y }))
  room.keyTaken = false
  room.players.forEach((player, index) => {
    const spawn = level.spawn[index] || level.spawn[0]
    player.x = spawn.x
    player.y = spawn.y
    player.inside = false
  })
}

function createRoom(m, extra) {
  const room = {
    code: generateCode(),
    chat: m?.chat,
    scope: scopeOf(extra, m),
    status: 'waiting',
    level: 0,
    players: [{
      slot: 1,
      jid: jidKey(senderOf(m)),
      name: displayName(m),
      x: LEVELS[0].spawn[0].x,
      y: LEVELS[0].spawn[0].y,
      lastActionAt: 0,
    }],
    boxes: [],
    keyTaken: false,
    winner: null,
    levelClear: null,
    moves: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  room.boxes = LEVELS[0].boxes.map(box => ({ ...box }))
  activeRooms.set(room.code, room)
  playerIndex.set(`${room.scope}:${room.players[0].jid}`, room.code)
  return room
}

const findRoomByPlayer = (extra, m) => {
  const code = playerIndex.get(playerKey(extra, m))
  return code ? activeRooms.get(code) || null : null
}

const roomOfPlayer = (room, m) => {
  const jid = jidKey(senderOf(m))
  return room.players.find(player => player.jid === jid) || null
}

function removeRoom(code) {
  const room = activeRooms.get(code)
  if (!room) return false
  for (const player of room.players) playerIndex.delete(`${room.scope}:${player.jid}`)
  activeRooms.delete(code)
  lastUiMessage.delete(code)
  return true
}

function leaveRoom(room, m) {
  const player = roomOfPlayer(room, m)
  if (!player) return { removed: false }
  room.players = room.players.filter(item => item !== player)
  playerIndex.delete(`${room.scope}:${player.jid}`)
  room.updatedAt = nowIso()
  if (!room.players.length) return { removed: true, roomDeleted: removeRoom(room.code), slot: player.slot }
  room.status = 'waiting'
  room.winner = null
  return { removed: true, roomDeleted: false, slot: player.slot }
}

/** Pemain yang menyentuh pintu terbuka langsung masuk dan menunggu partner. */
function enterDoor(room, player) {
  if (!room.keyTaken || player.inside) return false
  if (!levelOf(room).door.some(tile => sameTile(tile, player))) return false
  player.inside = true
  return true
}

function checkWin(room) {
  const level = levelOf(room)
  if (!room.keyTaken) return null
  if (!room.players.length) return null
  const everyoneInside = room.players.every(player => player.inside)
  if (!everyoneInside) return null
  return { level: room.level + 1, levelName: level.name, players: room.players.map(player => player.name), at: nowIso() }
}

/**
 * Terapkan satu aksi. Kalau level selesai: lanjut level berikutnya otomatis,
 * atau tandai room selesai kalau itu level terakhir.
 */
function applyAction(room, player, action) {
  const now = Date.now()
  if (room.status === 'finished') return { ok: false, reason: 'Semua level sudah selesai. Buat room baru dengan .picopark create.' }
  if (room.status !== 'playing') return { ok: false, reason: 'Tunggu pemain kedua bergabung dulu (.picopark join <kode>).' }
  if (now - Number(player.lastActionAt || 0) < ACTION_COOLDOWN_MS) return { ok: false, silent: true }
  player.lastActionAt = now

  const act = String(action || '').toLowerCase()
  let result
  if (act === 'left' || act === 'right') result = step(room, player, act)
  else if (act === 'jump' || act === 'up' || act === 'action') result = jump(room, player)
  else return { ok: false, reason: 'Aksi tidak dikenal. Pakai left, right, atau jump.' }

  room.moves += 1
  room.updatedAt = nowIso()

  // gravitasi ulang: jembatan bisa hilang saat plat dilepas
  room.players.forEach(item => applyGravity(room, item))

  // ambil kunci otomatis
  const level = levelOf(room)
  let pickedKey = false
  if (level.key && !room.keyTaken && room.players.some(item => sameTile(item, level.key))) {
    room.keyTaken = true
    pickedKey = true
  }

  // pintu terbuka? semua yang berdiri di petak pintu langsung masuk
  let enteredDoor = false
  room.players.forEach(item => { if (enterDoor(room, item)) enteredDoor = true })

  let levelClear = null
  const win = checkWin(room)
  if (win) {
    levelClear = win
    if (room.level < LEVELS.length - 1) {
      room.level += 1
      resetLevelState(room)
      room.levelClear = { ...win, nextLevel: room.level + 1, nextName: LEVELS[room.level].name }
      levelClear = room.levelClear
    } else {
      room.status = 'finished'
      room.winner = { ...win, final: true }
      room.levelClear = win
    }
  }

  return { ok: result.moved, reason: result.reason, pushed: result.pushed, pickedKey, enteredDoor, levelClear, winner: room.winner }
}

/* ============================================================
 * 6. STATE UNTUK WEBVIEW
 * ============================================================ */

function buildState(room) {
  const level = levelOf(room)
  const plates = platesPressed(room)
  return {
    roomCode: room.code,
    status: room.status,
    levelIndex: room.level,
    levelCount: LEVELS.length,
    levelName: level.name,
    hint: level.hint,
    level: {
      width: level.width,
      height: level.height,
      floorRow: level.floorRow,
      plates: level.plates,
      bridges: level.bridges,
      ledges: level.ledges,
      key: level.key,
      door: level.door,
      spawn: level.spawn,
    },
    players: room.players.map(player => ({
      slot: player.slot,
      name: player.name,
      x: player.x,
      y: player.y,
      onPlate: level.plates.some(tile => sameTile(tile, player)) && !player.inside,
      inDoor: Boolean(player.inside),
    })),
    boxes: (room.boxes || []).map(box => ({ x: box.x, y: box.y, onPlate: level.plates.some(tile => sameTile(tile, box)) })),
    bridgeActive: plates.pressed,
    keyTaken: Boolean(room.keyTaken),
    doorUnlocked: Boolean(room.keyTaken),
    winner: room.winner,
    levelClear: room.levelClear,
    moves: room.moves,
    updatedAt: room.updatedAt,
  }
}

/** Papan teks untuk fallback. */
function renderBoard(room) {
  const level = levelOf(room)
  const rows = []
  for (let y = 0; y < level.height; y += 1) {
    const cells = []
    for (let x = 0; x < level.width; x += 1) {
      const here = room.players.filter(player => !player.inside && player.x === x && player.y === y)
      let symbol = '·'
      if (here.length === 2) symbol = 'X'
      else if (here.length === 1) symbol = here[0].slot === 1 ? '1' : '2'
      else if (level.door.some(tile => tile.x === x && tile.y === y)) symbol = 'D'
      else if (level.key && !room.keyTaken && level.key.x === x && level.key.y === y) symbol = 'K'
      else if (boxAt(room, x, y)) symbol = 'B'
      else if (level.plates.some(tile => tile.x === x && tile.y === y)) symbol = 'P'
      else if (level.ledges.some(tile => tile.x === x && tile.y === y)) symbol = '#'
      else if (bridgeActive(room) && level.bridges.some(tile => tile.x === x && tile.y === y)) symbol = '='
      else if (y >= level.floorRow) symbol = '#'
      cells.push(symbol)
    }
    rows.push(cells.join(' '))
  }
  return rows.join('\n')
}

function renderStatus(room) {
  const level = levelOf(room)
  const lines = [
    `🎮 *Picopark Co-op* — room \`${room.code}\` (${room.status})`,
    `📍 Level ${(room.level || 0) + 1}/${LEVELS.length} · ${level.name}`,
    ''
  ]
  lines.push('```', renderBoard(room), '```', '')
  for (const player of room.players) {
    const mark = player.slot === 1 ? '🔴 P1' : '🔵 P2'
    if (player.inside) { lines.push(`${mark} ${player.name} — sudah di dalam pintu ✅`); continue }
    const near = level.plates.some(tile => sameTile(tile, player)) ? ' — di plat' : ''
    lines.push(`${mark} ${player.name} (${player.x},${player.y})${near}`)
  }
  const waiting = room.players.filter(player => player.inside).length
  if (waiting) lines.push(`⏳ ${waiting} pemain menunggu di dalam pintu.`)

  // kunci: kalau semua sudah masuk, jangan tampilkan hint lagi
  lines.push('', `Kunci: ${room.keyTaken ? 'diambil ✅' : 'belum ❌'} · Jembatan: ${bridgeActive(room) ? 'AKTIF ✅' : 'mati ❌'}`)
  if (level.hint) lines.push('', `💡 ${level.hint}`)
  return lines.join('\n')
}

/* ============================================================
 * 7. KIRIM UI
 * ============================================================ */

const HTML_CANDIDATES = [
  process.env.PICOPARK_HTML,
  path.join(HERE, 'picopark.html'),
  path.join(HERE, '..', '..', 'assets', 'picopark.html'),
  path.join(HERE, '..', '..', 'media', 'picopark.html'),
  path.join(process.cwd(), 'assets', 'picopark.html'),
  path.join(process.cwd(), 'media', 'picopark.html'),
  path.join(process.cwd(), 'picopark.html'),
].filter(Boolean)

let htmlCache = { at: 0, text: '' }

function loadHtmlTemplate() {
  if (htmlCache.text && Date.now() - htmlCache.at < 5000) return htmlCache.text
  for (const candidate of HTML_CANDIDATES) {
    try {
      const text = fs.readFileSync(candidate, 'utf8')
      if (text.includes('__PICOPARK_STATE__')) return (htmlCache = { at: Date.now(), text }).text
    } catch {}
  }
  return ''
}

function buildHtml(state) {
  const template = loadHtmlTemplate()
  if (!template) return ''
  const json = JSON.stringify(state).replace(/</g, '\\u003c')
  return template.replace('/*__PICOPARK_STATE__*/null', json)
}

function buildRichPayload(html, room) {
  const messageId = `PICOPARK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  return {
    message: {
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2, botMetadata: {} },
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: [{ messageType: 2, messageText: `🐱 Pico Park Co-op · Room ${room.code} · Lv ${(room.level || 0) + 1}` }],
            unifiedResponse: {
              data: Buffer.from(JSON.stringify({
                response_id: `picopark-${room.code}`,
                sections: [{
                  view_model: {
                    primitive: { __typename: 'GenAIaeacdsnwHtmlPrimitive', payload: html, trusted_sources: [] },
                    __typename: 'GenAISingleLayoutViewModel',
                  },
                }],
              })).toString('base64'),
            },
            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
              forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
              forwardOrigin: 4,
            },
          },
        },
      },
    },
    messageId,
  }
}

const USE_EDIT = false

async function sendGameUI(conn, chat, room, options = {}) {
  const state = buildState(room)
  const html = buildHtml(state)
  const quoted = options.quoted || null
  const prefix = options.prefix || '.'

  if (!html) {
    await reply(conn, { chat }, [
      '⚠️ Berkas `picopark.html` tidak ditemukan.',
      'Taruh di `assets/picopark.html` atau set env `PICOPARK_HTML`.',
      '', renderStatus(room), '',
      `Main lewat teks: ${prefix}picopark left | right | jump`,
    ].join('\n'), { quoted: false })
    return { mode: 'no-template', html: '' }
  }

  if (typeof conn?.sendRichHtml === 'function') {
    try {
      const result = await conn.sendRichHtml(chat, html, options.richOptions || {})
      lastUiMessage.set(room.code, result)
      return { mode: 'sendRichHtml', result, html }
    } catch (error) { console.error('[PICOPARK] sendRichHtml gagal:', error?.message || error) }
  }

  if (typeof conn?.relayMessage === 'function') {
    try {
      const { message, messageId } = buildRichPayload(html, room)
      await conn.relayMessage(chat, message, { messageId })
      lastUiMessage.set(room.code, { key: { id: messageId, remoteJid: chat } })
      // Task110: tidak semua WhatsApp merender kartu "bot rich". Satu baris
      // tautan memastikan game tetap bisa dimainkan dari browser.
      if (options.withLink !== false) {
        await reply(conn, { chat }, webLine(prefix), { quoted: false }).catch(() => {})
      }
      return { mode: 'relayMessage', messageId, html }
    } catch (error) { console.error('[PICOPARK] relayMessage gagal:', error?.message || error) }
  }

  if (USE_EDIT && options.editKey && typeof conn?.sendMessage === 'function') {
    try {
      await conn.sendMessage(chat, { text: html, edit: options.editKey })
      return { mode: 'edit', html }
    } catch (error) { console.error('[PICOPARK] edit gagal:', error?.message || error) }
  }

  await reply(conn, { chat }, [
    renderStatus(room), '',
    '📱 Kartu WebView tidak didukung perangkat ini. Dua cara main:',
    `• Web: ${WEB_URL}`,
    `• Chat: \`${prefix}picopark left\` \`${prefix}picopark right\` \`${prefix}picopark jump\``,
  ].join('\n'), { quoted: false })
  return { mode: 'text', html }
}

/* ============================================================
 * 8. BRIDGE DARI WEBVIEW
 * ============================================================ */

async function handleBridgePayload(conn, payload, context = {}) {
  try {
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload
    if (!data || typeof data !== 'object') return { ok: false, reason: 'Payload bukan objek.' }

    const code = String(data.roomCode || data.room || '').trim()
    const room = activeRooms.get(code)
    if (!room) return { ok: false, reason: 'Room tidak ditemukan atau sudah ditutup.' }

    let player = null
    if (data.playerJid) player = room.players.find(item => item.jid === jidKey(data.playerJid))
    if (!player && data.player) player = room.players.find(item => Number(item.slot) === Number(data.player))
    if (!player && context.sender) player = room.players.find(item => item.jid === jidKey(context.sender))
    if (!player) return { ok: false, reason: 'Pemain tidak terdaftar di room ini.' }

    const action = data.action === 'move' ? data.direction : data.action
    const result = applyAction(room, player, action)
    if (!result.ok && !result.silent) await reply(conn, { chat: room.chat }, `⚠️ ${result.reason}`, { quoted: false })
    if (result.levelClear) await announceLevel(conn, room, result.levelClear)
    await sendGameUI(conn, room.chat, room, {})
    return { ok: result.ok, reason: result.reason, levelClear: result.levelClear, winner: result.winner }
  } catch (error) {
    console.error('[PICOPARK] bridge gagal:', error?.message || error)
    return { ok: false, reason: 'Payload tidak valid.' }
  }
}

async function announceLevel(conn, room, clear) {
  if (clear.final) {
    await reply(conn, { chat: room.chat }, [
      `🎉 *${clear.players.join(' & ')} MENANG!* 🏆`,
      '',
      `Semua ${LEVELS.length} level selesai dalam ${room.moves} gerakan.`,
      'Main lagi: `.picopark create`',
    ].join('\n'), { quoted: false })
    return
  }
  await reply(conn, { chat: room.chat }, [
    `✅ *Level ${clear.level} selesai!*`,
    `Lanjut ke *Level ${clear.nextLevel || clear.level + 1}: ${clear.nextName || (LEVELS[clear.level] || {}).name || 'berikutnya'}*`,
  ].join('\n'), { quoted: false })
}

/* ============================================================
 * 9. HOOK: tangkap JSON dari WebView
 * ============================================================ */

const allHook = async function (m) {
  try {
    const text = String(m?.text || m?.message?.conversation || '').trim()
    if (!text.startsWith('{') || !text.endsWith('}') || text.length > 800) return
    if (!/"roomCode"|"room"/.test(text) || !/"action"/.test(text)) return
    const payload = JSON.parse(text)
    if (!payload || !payload.action) return
    await handleBridgePayload(this, payload, { sender: senderOf(m), chat: m.chat })
  } catch { /* bukan payload bridge */ }
}

/* ============================================================
 * 10. COMMAND
 * ============================================================ */

const HELP = (prefix = '.') => [
  '🐱 *PICO PARK CO-OP* — 2 pemain, 3 level',
  '',
  `${prefix}picopark create             buat room (kode 4 digit)`,
  `${prefix}picopark join <kode>        ikut sebagai pemain 2`,
  `${prefix}picopark left|right|jump    gerakkan karaktermu`,
  `${prefix}picopark p1 <aksi>          gerakkan pemain 1 (main bergiliran 1 HP)`,
  `${prefix}picopark status             lihat papan`,
  `${prefix}picopark level              info level sekarang`,
  `${prefix}picopark leave              keluar room`,
  '',
  `🌐 Web: ${WEB_URL}`,
  '',
  'Cara main: ambil *kunci* (🔑) → *pintu* terbuka → SEMUA pemain harus',
  'masuk pintu. Plat (P) yang diinjak memunculkan jembatan — kalau dilepas,',
  'jembatan hilang dan pemain di atasnya jatuh.',
].join('\n')

const NORMALIZE = {
  kiri: 'left', kanan: 'right', lompat: 'jump', up: 'jump', action: 'jump',
}
const ACTIONS = new Set(['left', 'right', 'jump'])

async function runCommand(m, extra) {
  const conn = extra?.conn || this
  const prefix = extra?.usedPrefix || '.'
  const argv = resolveArgs(m, extra)
  const sub = String(argv[0] || '').toLowerCase()
  const arg = String(argv[1] || '').toLowerCase()

  if (!sub || sub === 'help' || sub === 'menu') {
    const own = findRoomByPlayer(extra, m)
    return reply(conn, m, [HELP(prefix), ...(own ? ['', renderStatus(own)] : [])].join('\n'))
  }

  if (sub === 'create' || sub === 'buat') {
    const existing = findRoomByPlayer(extra, m)
    if (existing) return reply(conn, m, `Kamu masih di room \`${existing.code}\`. Keluar dulu: ${prefix}picopark leave`)
    const room = createRoom(m, extra)
    const level = LEVELS[0]
    return reply(conn, m, [
      '✅ *Room Picopark dibuat!*',
      '',
      `Kode room: *${room.code}*`,
      `Pemain 1: ${room.players[0].name}`,
      `Level 1: ${level.name}`,
      '',
      `Pemain 2 bergabung: ${prefix}picopark join ${room.code}`,
      'Room hangus otomatis setelah 30 menit tanpa aktivitas.',
      '',
      webLine(prefix),
    ].join('\n'))
  }

  if (sub === 'join' || sub === 'gabung') {
    const code = String(arg || '').replace(/[^0-9]/g, '')
    if (code.length !== 4) return reply(conn, m, `Format: ${prefix}picopark join 1234`)
    const room = activeRooms.get(code)
    if (!room) return reply(conn, m, `❌ Room \`${code}\` tidak ada atau sudah ditutup.`)
    if (roomOfPlayer(room, m)) return reply(conn, m, `Kamu sudah ada di room \`${code}\`.`)
    if (room.players.length >= 2) return reply(conn, m, `❌ Room \`${code}\` sudah penuh (2 pemain).`)
    const slot = room.players.some(player => player.slot === 1) ? 2 : 1
    const spawn = levelOf(room).spawn[slot - 1] || levelOf(room).spawn[0]
    room.players.push({
      slot, jid: jidKey(senderOf(m)), name: displayName(m), x: spawn.x, y: spawn.y, lastActionAt: 0,
    })
    playerIndex.set(`${room.scope}:${jidKey(senderOf(m))}`, room.code)
    room.status = 'playing'
    room.updatedAt = nowIso()
    await reply(conn, m, '🐱 *Game Dimulai!*\n\nAmbil kunci 🔑 lalu berdua masuk pintu 🚪.\nPlat P harus ditahan supaya jembatan menyala.')
    await sendGameUI(conn, room.chat, room, { quoted: m, prefix })
    return null
  }

  if (sub === 'status' || sub === 'papan' || sub === 'board') {
    const room = findRoomByPlayer(extra, m) || activeRooms.get(String(arg || '').replace(/[^0-9]/g, ''))
    if (!room) return reply(conn, m, `Kamu belum di room mana pun. Mulai: ${prefix}picopark create`)
    return reply(conn, m, renderStatus(room))
  }

  if (sub === 'level' || sub === 'map') {
    const room = findRoomByPlayer(extra, m)
    if (!room) return reply(conn, m, `Kamu belum di room mana pun. Mulai: ${prefix}picopark create`)
    const level = levelOf(room)
    return reply(conn, m, [
      `📍 *Level ${(room.level || 0) + 1}/${LEVELS.length}: ${level.name}*`,
      level.hint ? `💡 ${level.hint}` : '',
      '', renderStatus(room),
    ].filter(Boolean).join('\n'))
  }

  if (sub === 'leave' || sub === 'keluar' || sub === 'stop') {
    const room = findRoomByPlayer(extra, m)
    if (!room) return reply(conn, m, 'Kamu tidak sedang di room mana pun.')
    const info = leaveRoom(room, m)
    return reply(conn, m, info.roomDeleted
      ? `👋 Kamu keluar. Room \`${room.code}\` ditutup karena kosong.`
      : `👋 ${info.slot === 1 ? 'Pemain 1' : 'Pemain 2'} keluar. Room \`${room.code}\` menunggu pemain baru.`)
  }

  // ---- aksi gerak ----
  let room = findRoomByPlayer(extra, m)
  let targetSlot = null
  let actName = null

  if (/^p[12]$/.test(sub)) {
    targetSlot = Number(sub.slice(1))
    actName = NORMALIZE[arg] || arg
    if (!room) {
      const code = String(argv[2] || '').replace(/[^0-9]/g, '')
      if (code) room = activeRooms.get(code)
    }
  } else if (sub === 'move' || sub === 'gerak') {
    actName = NORMALIZE[arg] || arg
  } else if (ACTIONS.has(sub) || NORMALIZE[sub]) {
    actName = NORMALIZE[sub] || sub
  }

  if (!actName) return reply(conn, m, HELP(prefix))
  if (!ACTIONS.has(actName)) return reply(conn, m, 'Aksi harus left, right, atau jump.')
  if (!room) return reply(conn, m, `Kamu belum di room. Buat dulu: ${prefix}picopark create`)

  const player = targetSlot
    ? room.players.find(item => Number(item.slot) === targetSlot)
    : roomOfPlayer(room, m)
  if (!player) return reply(conn, m, 'Kamu bukan pemain di room ini.')

  const result = applyAction(room, player, actName)
  if (!result.ok && !result.silent) return reply(conn, m, `⚠️ ${result.reason}`)

  if (result.pickedKey) await reply(conn, m, '🔑 Kunci diambil! Pintu sekarang terbuka — semua pemain harus masuk pintu.')
  if (result.levelClear) await announceLevel(conn, room, result.levelClear)

  await sendGameUI(conn, room.chat, room, { quoted: m, prefix })
  return null
}

const handler = async function (m, extra = {}) {
  try {
    return await runCommand.call(this, m, extra)
  } catch (error) {
    console.error('[PICOPARK]', error)
    return reply(extra?.conn || this, m, `❌ Picopark error: ${error?.message || error}`)
  }
}

handler.all = allHook
handler.command = /^(picopark|ppark|picoparkgame)$/i
handler.help = ['picopark create', 'picopark join <kode>', 'picopark left|right|jump', 'picopark leave']
handler.tags = ['game']
handler.description = 'Pico Park co-op 2 pemain (kunci + pintu + plat) lewat WebView Rich HTML'

/* ============================================================
 * 11. PEMBERSIH ROOM
 * ============================================================ */

const sweeper = setInterval(() => {
  const now = Date.now()
  for (const [code, room] of activeRooms) {
    const last = Date.parse(room.updatedAt || room.createdAt) || now
    if (now - last > ROOM_TTL_MS) {
      removeRoom(code)
      console.log(`[PICOPARK] room ${code} dihapus (idle)`)
    }
  }
}, 5 * 60 * 1000)
if (typeof sweeper.unref === 'function') sweeper.unref()

export default handler
export { activeRooms, handleBridgePayload, sendGameUI, buildState, renderStatus, LEVELS, applyAction, createRoom, applyGravity, jump, step, bridgeActive }
