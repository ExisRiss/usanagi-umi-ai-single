/* Task119 — uji penulis database bertahap (lib/db-writer.js).
 *
 * Yang dijaga tes ini:
 *   1. isi berkas yang ditulis IDENTIK dengan JSON.stringify(data) (deep)
 *   2. data besar benar-benar dipotong (banyak potongan, bukan satu tulis raksasa)
 *   3. penulisan atomik: berkas sementara lalu rename, tidak merusak berkas lama
 *   4. penulisan bersamaan diserialkan (tidak saling menimpa, berkas tetap valid)
 *   5. kalau penulis baru gagal, jatuh ke penulis lama dan data tidak hilang
 *   6. tidak menyendatkan event loop (drift timer tetap kecil)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import path0 from 'node:path'
import { fileURLToPath } from 'node:url'
import { tulisJsonBertahap, pasangPenulisDatabase } from '../lib/db-writer.js'

const ROOT = path0.resolve(path0.dirname(fileURLToPath(import.meta.url)), '..')
const baca = rel => fs.readFileSync(path0.join(ROOT, rel), 'utf8')

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'umi-dbw-'))

const buatData = (jumlahUser = 800) => {
  const users = {}
  for (let i = 0; i < jumlahUser; i += 1) {
    users[`62${String(i).padStart(10, '0')}@s.whatsapp.net`] = {
      nama: `user-${i}`, exp: i * 7, limit: 5, afk: -1,
      s: { p: i, q: [1, 2, 3], r: 'ёж \u4e16\u754c' },
    }
  }
  return {
    users,
    chats: { '6281@g.us': { last: 'halo', updated: 1700000000000 }, '6282@s.whatsapp.net': { n: 1 } },
    stats: { total: 1234, sukses: true, kosong: null },
    settings: { public: true, autotyping: { minDelayMs: 0, maxDelayMs: 80 } },
    msgs: [],
    lastReset: '2026-10-26',
  }
}

test('TASK119-DB: isi berkas identik dengan JSON.stringify(data)', async () => {
  const dir = tmpdir()
  const data = buatData()
  const berkas = path.join(dir, 'database.json')
  const hasil = await tulisJsonBertahap(data, berkas)
  const isi = fs.readFileSync(berkas, 'utf8')

  assert.equal(isi, JSON.stringify(data), 'byte-per-byte sama dengan JSON.stringify')
  assert.deepEqual(JSON.parse(isi), data)
  assert.equal(hasil.bytes, Buffer.byteLength(isi))
  assert.equal(hasil.potongan, 1, 'data kecil cukup satu potongan')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('TASK119-DB: data besar dipotong jadi banyak bagian', async () => {
  const dir = tmpdir()
  const data = buatData(20000) // ± 4–5 MB
  const berkas = path.join(dir, 'database.json')
  const hasil = await tulisJsonBertahap(data, berkas)
  const isi = fs.readFileSync(berkas, 'utf8')

  assert.ok(hasil.bytes > 1_000_000, `berkas cukup besar (${hasil.bytes} B)`)
  assert.ok(hasil.potongan > 3, `dipotong beberapa kali (${hasil.potongan} potongan)`)
  assert.deepEqual(JSON.parse(isi), data)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('TASK119-DB: penulisan atomik — berkas lama utuh kalau gagal', async () => {
  const dir = tmpdir()
  const berkas = path.join(dir, 'database.json')
  fs.writeFileSync(berkas, JSON.stringify({ users: { lama: true } }))

  const nakal = { users: { a: 1n } } // BigInt → JSON.stringify melempar
  await assert.rejects(() => tulisJsonBertahap(nakal, berkas))

  assert.equal(fs.readFileSync(berkas, 'utf8'), JSON.stringify({ users: { lama: true } }))
  const sisa = fs.readdirSync(dir).filter(n => n.endsWith('.tmp'))
  assert.deepEqual(sisa, [], 'berkas sementara dibersihkan')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('TASK119-DB: penulisan bersamaan diserialkan, hasil tetap valid', async () => {
  const dir = tmpdir()
  const berkas = path.join(dir, 'database.json')
  const db = { data: buatData(3000), write: async () => { throw new Error('penulis lama tidak boleh dipakai') } }
  pasangPenulisDatabase(db, berkas)

  const janji = [db.write(), db.write(), db.write(), db.write()]
  await Promise.all(janji)

  const isi = fs.readFileSync(berkas, 'utf8')
  assert.deepEqual(JSON.parse(isi), db.data)
  assert.equal(janji.length, 4)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('TASK119-DB: db.write() memakai penulis bertahap; gagal → penulis lama', async () => {
  const dir = tmpdir()
  const berkas = path.join(dir, 'database.json')
  let lama = 0
  const db = { data: buatData(10), write: async () => { lama += 1 } }
  pasangPenulisDatabase(db, berkas)
  assert.equal(db.write.__umiBertahap, true)

  await db.write()
  assert.equal(lama, 0, 'penulis lama tidak dipanggil saat berhasil')
  assert.deepEqual(JSON.parse(fs.readFileSync(berkas, 'utf8')), db.data)

  db.data = { users: { a: 1n } } // bikin gagal
  await db.write()
  assert.equal(lama, 1, 'penulis lama dipanggil sebagai cadangan')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('TASK119-DB: tidak menyendatkan event loop (drift timer < 100 ms)', async () => {
  const dir = tmpdir()
  const berkas = path.join(dir, 'database.json')
  const data = buatData(15000)

  let terakhir = Date.now()
  let driftMaks = 0
  const timer = setInterval(() => {
    const sekarang = Date.now()
    driftMaks = Math.max(driftMaks, sekarang - terakhir - 10)
    terakhir = sekarang
  }, 10)

  await tulisJsonBertahap(data, berkas)
  await new Promise(r => setTimeout(r, 40))
  clearInterval(timer)

  assert.ok(driftMaks < 100, `event loop tetap jalan (drift ${driftMaks} ms)`)
  assert.deepEqual(JSON.parse(fs.readFileSync(berkas, 'utf8')), data)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('TASK119-DB: simpan periodik hanya menulis kalau data berubah', () => {
  const main = baca('main.js')
  assert.match(main, /pasangPenulisDatabase\(global\.db, 'database\.json'\)/, 'penulis bertahap terpasang')
  assert.match(main, /if \(global\.__umiDbKotor !== true\) return/, 'lewati tulis saat tidak ada perubahan')
  assert.match(main, /JEDA_SIMPAN_DB/, 'jeda simpan bisa diatur & minimal 30 dtk')
  assert.match(main, /global\.__umiDbKotor = false/, 'penanda dibersihkan setelah menulis')
  for (const berkas of ['handler.js', 'handler-srv.js']) {
    assert.match(baca(berkas), /global\.__umiDbKotor = true/, `${berkas} menandai perubahan`)
  }
})
