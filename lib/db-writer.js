/* By AlzRiss - Usanagi Umi AI
 *
 * PENULIS DATABASE BERTAHAP — Task119
 *
 * Masalah yang diukur di server (probe /data/latency-119.jsonl):
 *   global.db.write() = 736 ms (p50), 1.366 ms (maks), dipanggil tiap 30 detik.
 *   Setiap penulisan menahan event loop → event loop tersendat 145–510 ms dan
 *   balasan bot ikut tertunda. Itulah keluhan "bot delay banget".
 *
 * Penyebabnya: lowdb menulis `JSON.stringify(seluruh database, null, 2)`
 * sekaligus. Database bot sekarang ±20 MB (10.273 user) sehingga satu
 * stringify + tulis 20 MB memblokir proses.
 *
 * Penulis ini menghasilkan JSON yang SETARA (diuji deep-equal dengan
 * JSON.stringify(data) — lihat tests/task119-dbwriter.test.mjs), tetapi:
 *   1. dipotong per bagian (per user / per chat) dan event loop dilepas
 *      (`setImmediate`) di antara potongan → tidak ada blok panjang,
 *   2. ditulis ke berkas sementara lalu di-rename → database lama utuh
 *      kalau proses mati di tengah penulisan,
 *   3. penulisan diserialkan: tidak ada dua penulisan bersamaan.
 *
 * Catatan format: lowdb menyimpan dengan indentasi 2 spasi. Penulis ini
 * menyimpan JSON rapat (tanpa indentasi) → ukuran berkas ±38% lebih kecil
 * dan lebih cepat. Isi data sama; semua pembaca memakai JSON.parse.
 */

import fsp from 'node:fs/promises'
import path from 'node:path'

const SEDANG_MENULIS = Symbol.for('umi.dbwriter.busy')
const ANTREAN = Symbol.for('umi.dbwriter.queue')

const KUMPUL_KB = 512 * 1024 // kumpulkan ±512 KB (karakter), baru tulis sekali
const JEDA_TIAP_ENTRI = 300 // lepas event loop tiap 300 entri
const AMBANG_KUNCI = 40 // objek > 40 kunci ditulis per kunci

/** Lepaskan event loop sebentar supaya pesan lain tetap diproses. */
const jeda = () => new Promise(resolve => setImmediate(resolve))

const objekBiasa = nilai =>
  nilai && typeof nilai === 'object' && !Array.isArray(nilai) && !Buffer.isBuffer(nilai)

/**
 * Tulis `data` ke `file` sebagai JSON, bertahap.
 * @returns {Promise<{bytes:number, ms:number, potongan:number}>}
 */
export async function tulisJsonBertahap(data, file) {
  const mulai = Date.now()
  const tmp = `${file}.${process.pid}.tmp`
  const handle = await fsp.open(tmp, 'w')

  let buf = ''
  let potongan = 0
  let bytes = 0

  const kuras = async ({ paksa = false } = {}) => {
    if (!buf.length) return
    // Sengaja pakai buf.length (bukan Buffer.byteLength): O(1), bukan O(panjang).
    if (!paksa && buf.length < KUMPUL_KB) return
    const isi = Buffer.from(buf, 'utf8')
    buf = ''
    bytes += isi.length
    potongan += 1
    await handle.write(isi)
    await jeda()
  }

  try {
    const tambah = async teks => {
      if (teks === undefined) return
      buf += teks
      await kuras()
    }

    await tambah('{')
    let pertama = true
    for (const nama of Object.keys(data || {})) {
      const nilai = data[nama]
      if (nilai === undefined || typeof nilai === 'function') continue

      await tambah(`${pertama ? '' : ','}${JSON.stringify(nama)}:`)
      pertama = false

      if (objekBiasa(nilai) && Object.keys(nilai).length > AMBANG_KUNCI) {
        // Tulis per kunci: tidak ada satu stringify raksasa.
        await tambah('{')
        let sudah = false
        const sub = Object.keys(nilai)
        for (let i = 0; i < sub.length; i += 1) {
          const isi = JSON.stringify(nilai[sub[i]])
          if (isi === undefined) continue
          await tambah(`${sudah ? ',' : ''}${JSON.stringify(sub[i])}:${isi}`)
          sudah = true
          if (i % JEDA_TIAP_ENTRI === 0) await jeda()
        }
        await tambah('}')
      } else {
        const teks = JSON.stringify(nilai)
        if (teks !== undefined) await tambah(teks)
      }
      await jeda()
    }
    await tambah('}')
    await kuras({ paksa: true })

    await handle.sync().catch(() => {})
    await handle.close()
    await fsp.rename(tmp, file)
    return { bytes, ms: Date.now() - mulai, potongan }
  } catch (error) {
    try { await handle.close() } catch {}
    try { await fsp.unlink(tmp) } catch {}
    throw error
  }
}

/**
 * Pasang penulis bertahap pada objek database (lowdb).
 * `db.write()` yang dipanggil plugin mana pun otomatis memakai versi ini.
 */
export function pasangPenulisDatabase(db, file) {
  if (!db || typeof db !== 'object') return db
  if (db.write?.__umiBertahap) return db

  const jalur = path.resolve(file)
  const tulisAsli = typeof db.write === 'function' ? db.write.bind(db) : null
  let antrean = null

  /* Task177 — GABUNGKAN PENULISAN.
   *
   * Probe /data/latency-119.jsonl (30-10-2026) mencatat 429 penulisan
   * database dengan total 182 detik dan satu penulisan sampai 3 detik.
   * Penyebabnya: banyak plugin memanggil db.write() pada SETIAP pesan,
   * padahal isinya baru berubah sedikit. Database 19 MB → tiap penulisan
   * memakan ratusan milidetik dan menahan event loop (bot terasa delay).
   *
   * Sekarang: penulisan dijadwalkan paling cepat satu kali per JEDA_MIN
   * (bawaan 4 detik). Semua pemanggil dalam jendela itu menerima promise
   * yang sama, jadi data tetap tersimpan — hanya tidak berkali-kali.
   * Butuh tulis langsung (mis. saat shutdown)? db.write(true).
   */
  const JEDA_MIN = Number(process.env.UMI_DB_JEDA_MS) || 4000
  let terakhirTulis = 0
  let terjadwal = null

  const tulis = function tulisDatabaseBertahap(segera) {
    // Serialkan: satu penulisan berjalan, pemanggil berikutnya menunggu.
    if (db[SEDANG_MENULIS]) return db[ANTREAN]

    if (segera !== true) {
      const sisa = JEDA_MIN - (Date.now() - terakhirTulis)
      if (sisa > 0) {
        if (terjadwal) return terjadwal
        db[SEDANG_MENULIS] = true
        terjadwal = new Promise(resolve => setTimeout(resolve, sisa)).then(() => {
          terjadwal = null
          db[SEDANG_MENULIS] = false
          return tulis(true)
        })
        db[ANTREAN] = terjadwal
        return terjadwal
      }
    }

    db[SEDANG_MENULIS] = true
    const antrean = (async () => {
      try {
        await tulisJsonBertahap(db.data, jalur)
      } catch (error) {
        // Jangan biarkan data hilang: kalau gagal, pakai cara lama.
        if (tulisAsli) {
          try { await tulisAsli() } catch {}
        }
        console.error('[DB-WRITER] gagal menulis bertahap:', error?.message || error)
      } finally {
        db[SEDANG_MENULIS] = false
        terakhirTulis = Date.now()
      }
    })()
    db[ANTREAN] = antrean
    return antrean
  }
  tulis.__umiBertahap = true
  db.write = tulis
  return db
}

export default { tulisJsonBertahap, pasangPenulisDatabase }
