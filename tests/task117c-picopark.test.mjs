/* Task117c — Pico Park: lompat harus benar-benar bekerja + level bisa diselesaikan.
 *
 * Cara uji (tidak menebak):
 *   1. Mesin bot (plugins/game-html/picopark.js) dipakai untuk MENCARI solusi
 *      level 1 dengan BFS — kalau tidak ada solusi, tes gagal.
 *   2. Solusi itu diputar ulang di halaman asli (assets/picopark.html) lewat
 *      klik tombol sungguhan di jsdom — kalau tombol tidak bekerja, tes gagal.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from '/home/user/.tools-node/node_modules/jsdom/lib/api.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hasil = []
const cek = (nama, lulus, info = '') => {
  hasil.push(Boolean(lulus))
  console.log(`${lulus ? 'LULUS' : 'GAGAL'} · ${nama}${info ? ' — ' + info : ''}`)
}

const game = await import('../plugins/game-html/picopark.js')
const L1 = game.LEVELS[0]

/* ============================================================
 * 1. Mesin bot: cari solusi level 1 (BFS)
 * ============================================================ */
function roomAwal() {
  const room = game.createRoom({ chat: 'uji@g.us', sender: '628111@s.whatsapp.net', pushName: 'Uji' }, {})
  room.players.push({ slot: 2, jid: '628222', name: 'P2', x: L1.spawn[1].x, y: L1.spawn[1].y, lastActionAt: 0 })
  room.status = 'playing'
  return room
}

const kunciKeadaan = room => room.players.map(p => `${p.x},${p.y},${p.inside ? 1 : 0}`).join('|') + '#' + (room.keyTaken ? 1 : 0)

function cariSolusi(maksLangkah = 24) {
  const awal = roomAwal()
  const antre = [{ room: awal, jalan: [] }]
  const sudah = new Set([kunciKeadaan(awal)])
  while (antre.length) {
    const { room, jalan } = antre.shift()
    if (room.levelClear) return { jalan, room }
    if (jalan.length >= maksLangkah) continue
    for (let i = 0; i < room.players.length; i += 1) {
      for (const aksi of ['left', 'right', 'jump']) {
        const coba = structuredClone(room)
        const hasilAksi = game.applyAction(coba, coba.players[i], aksi)
        if (coba.levelClear) return { jalan: [...jalan, { slot: coba.players[i].slot, aksi }], room: coba }
        if (!hasilAksi || hasilAksi.ok !== true) continue
        const kk = kunciKeadaan(coba)
        if (sudah.has(kk)) continue
        sudah.add(kk)
        antre.push({ room: coba, jalan: [...jalan, { slot: coba.players[i].slot, aksi }] })
      }
    }
  }
  return null
}

const solusi = cariSolusi()
cek('BOT: level 1 punya solusi (kunci + semua pemain masuk pintu)',
  Boolean(solusi && solusi.jalan.length), solusi ? `${solusi.jalan.length} langkah` : 'TIDAK ADA SOLUSI')

/* lompat di tanah lapang: tidak boleh diam tanpa alasan */
{
  const room = roomAwal()
  room.status = 'playing'
  const p = room.players[0]
  const hasilLompat = game.jump(room, p)
  cek('BOT: tombol lompat dari lantai benar-benar menggerakkan pemain',
    hasilLompat.moved === true && p.y < 5, `x=${p.x} y=${p.y} · ${hasilLompat.reason || 'ok'}`)
}

/* di tempat tanpa tebing, harus ada alasan yang bisa dibaca */
{
  const room = roomAwal()
  const sendirian = { x: 6, y: 5 }
  const kosong = game.jump({ ...room, players: [sendirian] }, sendirian)
  cek('BOT: lompat tanpa tebing memberi alasan jelas (tidak diam)',
    kosong.moved === false && /tebing/i.test(String(kosong.reason || '')), String(kosong.reason || ''))
}

/* ============================================================
 * 2. Halaman asli: putar ulang solusi lewat klik tombol
 * ============================================================ */
const html = fs.readFileSync(path.join(ROOT, 'assets/picopark.html'), 'utf8')
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://contoh.test/picopark',
})
const doc = dom.window.document
const LW = L1.width
const LH = L1.height

function petak(slot) {
  const node = doc.querySelector('.cat.p' + slot)
  if (!node) return null // sudah masuk pintu
  const left = parseFloat(node.style.left) || 0
  const top = parseFloat(node.style.top) || 0
  const cw = 100 / LW
  const ch = 100 / LH
  return { x: Math.round((left - cw * 0.06) / cw), y: Math.round((top - ch * 0.13) / ch) }
}
function tekan(slot, act) {
  const btn = doc.querySelector(`.pad[data-slot="${slot}"] .key[data-act="${act}"]`)
  btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
}

const awal1 = petak(1)
const awal2 = petak(2)
cek('WEB: dua pemain tampil di papan', Boolean(awal1 && awal2))
cek('WEB: spawn sesuai level (1,5) & (2,5)',
  awal1 && awal1.x === 1 && awal1.y === 5 && awal2 && awal2.x === 2 && awal2.y === 5, JSON.stringify({ awal1, awal2 }))

/* satu lompatan harus menaikkan pemain */
tekan(1, 'jump')
const setelahLompat = petak(1)
cek('WEB: menekan LOMPAT menaikkan pemain (bukan diam)',
  setelahLompat && setelahLompat.y < 5, `y 5 → ${setelahLompat ? setelahLompat.y : 'masuk pintu'}`)

/* mulai ulang halaman supaya bersih, lalu putar solusi dari BFS */
const dom2 = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://contoh.test/picopark' })
const doc2 = dom2.window.document
function petak2(slot) {
  const node = doc2.querySelector('.cat.p' + slot)
  if (!node) return null
  const left = parseFloat(node.style.left) || 0
  const top = parseFloat(node.style.top) || 0
  return { x: Math.round((left - (100 / LW) * 0.06) / (100 / LW)), y: Math.round((top - (100 / LH) * 0.13) / (100 / LH)) }
}
if (solusi) {
  for (const langkah of solusi.jalan) {
    const btn = doc2.querySelector(`.pad[data-slot="${langkah.slot}"] .key[data-act="${langkah.aksi}"]`)
    btn.dispatchEvent(new dom2.window.MouseEvent('click', { bubbles: true }))
  }
  const overlay = doc2.getElementById('overlay')
  const teks = overlay ? (overlay.textContent || '').replace(/\s+/g, ' ').trim() : ''
  const tampil = overlay && !overlay.classList.contains('hide') && overlay.style.display !== 'none'
  cek('WEB: solusi BFS benar-benar memenangkan level lewat tombol',
    /MENANG|level/i.test(teks) && (tampil || teks.length > 0), teks.slice(0, 60) || 'overlay kosong')
  /* Setelah level selesai, mesin bot & halaman sama-sama memindahkan pemain ke
   * spawn level berikutnya. Jadi yang dibandingkan: level clear tercatat. */
  cek('WEB: hasil akhir sama dengan mesin bot (level clear tercatat)',
    Boolean(solusi.room.levelClear) && /SELESAI|MENANG/i.test(teks),
    `bot: ${solusi.room.levelClear ? 'level ' + solusi.room.levelClear.level + ' clear' : 'tidak clear'}`)

  /* keyboard: P1 = W harus melompat */
  const dom3 = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://contoh.test/picopark' })
  const doc3 = dom3.window.document
  const posisi3 = () => {
    const node = doc3.querySelector('.cat.p1')
    if (!node) return null
    const left = parseFloat(node.style.left) || 0
    const top = parseFloat(node.style.top) || 0
    return { x: Math.round((left - (100 / LW) * 0.06) / (100 / LW)), y: Math.round((top - (100 / LH) * 0.13) / (100 / LH)) }
  }
  const sebelum = posisi3()
  doc3.dispatchEvent(new dom3.window.KeyboardEvent('keydown', { key: 'w', bubbles: true }))
  const sesudah = posisi3()
  cek('WEB: keyboard W membuat P1 lompat', sesudah && sebelum && sesudah.y < sebelum.y,
    `${JSON.stringify(sebelum)} → ${JSON.stringify(sesudah)}`)
}


/* ============================================================
 * 3. Semua level harus bisa diselesaikan
 * ============================================================ */
for (let idx = 0; idx < game.LEVELS.length; idx += 1) {
  const level = game.LEVELS[idx]
  const room = game.createRoom({ chat: `level${idx}@g.us`, sender: '628111@s.whatsapp.net', pushName: 'Uji' }, {})
  room.players.push({ slot: 2, jid: '628222', name: 'P2', x: 0, y: 0, lastActionAt: 0 })
  room.status = 'playing'
  room.level = idx
  room.players.forEach((p, i) => { p.x = level.spawn[i].x; p.y = level.spawn[i].y; p.inside = false })
  room.boxes = (level.boxes || []).map(b => ({ ...b }))
  room.keyTaken = false
  room.levelClear = null

  const antre = [{ room, jalan: [] }]
  const sudah = new Set([kunciKeadaan(room)])
  let hasilLevel = null
  while (antre.length && !hasilLevel) {
    const { room: r, jalan } = antre.shift()
    if (r.levelClear) { hasilLevel = { jalan, room: r }; break }
    if (jalan.length >= 26) continue
    for (let i = 0; i < r.players.length; i += 1) {
      for (const aksi of ['left', 'right', 'jump']) {
        const coba = structuredClone(r)
        const res = game.applyAction(coba, coba.players[i], aksi)
        if (coba.levelClear) { hasilLevel = { jalan: [...jalan, { slot: coba.players[i].slot, aksi }], room: coba }; break }
        if (!res || res.ok !== true) continue
        const kk = kunciKeadaan(coba)
        if (sudah.has(kk)) continue
        sudah.add(kk)
        antre.push({ room: coba, jalan: [...jalan, { slot: coba.players[i].slot, aksi }] })
      }
      if (hasilLevel) break
    }
  }
  cek(`LEVEL ${idx + 1} (${level.name}) bisa diselesaikan`, Boolean(hasilLevel),
    hasilLevel ? `${hasilLevel.jalan.length} langkah` : 'TIDAK ADA SOLUSI — level mustahil')
}

const lulus = hasil.filter(Boolean).length
console.log(`\n${lulus}/${hasil.length} tes lulus`)
if (lulus !== hasil.length) process.exitCode = 1
