/* Task206 — saring isi ZIP tanpa kompresi ulang (salin mentah per entri).
 *
 * Dipakai `.getsc`: zipball GitHub repo SINGLE pernah83 MB (di dalamnya
 * bin/ ±39 MB) sehingga gagal "Zip melebihi batas60 MB". Kompresi ulang
 * tidak perlu — cukup salin byte lokal-header+data entri yang dipilih,
 * lalu tulis ulang direktori pusat dengan offset baru. CRC tetap sah
 * karena isi datanya tidak diubah.
 *
 * Format yang didukung: ZIP biasa (<4 GB, tanpa ZIP64) — sesuai codeload
 * GitHub. Tidak ada dependensi eksternal.
 */

const SIG_EOCD = 0x06054b50
const SIG_CD = 0x02014b50
const SIG_LH = 0x04034b50
const SIG_DD = 0x08074b50

/** Cari End Of Central Directory (dari akhir, tahan komentar ±64 KB). */
export function cariEOCD(buf) {
  const min = Math.max(0, buf.length - 0xffff - 22)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i
  }
  return -1
}

/** Daftar entri dari direktori pusat. */
export function daftarEntri(buf) {
  const eocd = cariEOCD(buf)
  if (eocd < 0) throw new Error('EOCD tidak ditemukan (zip rusak atau ZIP64).')
  const jumlah = buf.readUInt16LE(eocd + 10)
  const offsetCd = buf.readUInt32LE(eocd + 16)
  const entri = []
  let p = offsetCd
  for (let i = 0; i < jumlah; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CD) {
      throw new Error('Direktori pusat ZIP rusak.')
    }
    const flag = buf.readUInt16LE(p + 8)
    const crc = buf.readUInt32LE(p + 16)
    const kompresi = buf.readUInt32LE(p + 20)
    const asli = buf.readUInt32LE(p + 24)
    const namaLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const komenLen = buf.readUInt16LE(p + 32)
    const lokalOffset = buf.readUInt32LE(p + 42)
    const nama = buf.toString('utf8', p + 46, p + 46 + namaLen)
    const panjangPusat = 46 + namaLen + extraLen + komenLen
    entri.push({
      nama, flag, crc, kompresi, asli, lokalOffset,
      pusat: buf.subarray(p, p + panjangPusat),
    })
    p += panjangPusat
  }
  return { entri, eocd }
}

/**
 * Buat ZIP baru berisi entri yang lolos predikat `buang(nama) === false`.
 * Byte data disalin apa adanya (metode kompresi & CRC entri tidak berubah).
 * @param {Buffer} buf zip asli
 * @param {(nama: string) => boolean} buang true → entri dibuang
 * @returns {Buffer} zip baru
 */
export function saringZip(buf, buang) {
  const { entri } = daftarEntri(buf)
  const simpan = entri.filter((e) => !buang(e.nama))
  if (!simpan.length) throw new Error('Semua entri ZIP terbuang — dibatalkan.')

  const bagian = []
  const pusatBaru = []
  let offset = 0
  for (const e of simpan) {
    const lh = e.lokalOffset
    if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== SIG_LH) {
      throw new Error(`Header lokal ZIP rusak: ${e.nama}`)
    }
    const namaLenL = buf.readUInt16LE(lh + 26)
    const extraLenL = buf.readUInt16LE(lh + 28)
    const awalData = lh + 30 + namaLenL + extraLenL
    const akhirData = awalData + e.kompresi
    if (akhirData > buf.length) throw new Error(`Data entri terpotong: ${e.nama}`)
    let potongan = buf.subarray(lh, akhirData)
    /* Data descriptor (bit3) ikut disalin agar pembaca streaming tetap sah —
     * isinya crc/ukuran asli yang tidak berubah. */
    if (e.flag & 0x8) {
      const adaSig = akhirData + 4 <= buf.length && buf.readUInt32LE(akhirData) === SIG_DD
      potongan = buf.subarray(lh, akhirData + (adaSig ? 16 : 12))
    }
    bagian.push(potongan)

    const pusat = Buffer.from(e.pusat)
    pusat.writeUInt32LE(offset, 42) // local header offset baru
    pusatBaru.push(pusat)
    offset += potongan.length
  }

  const cd = Buffer.concat(pusatBaru)
  const cdOffset = offset
  const eocdBuf = Buffer.alloc(22)
  eocdBuf.writeUInt32LE(SIG_EOCD, 0)
  eocdBuf.writeUInt16LE(0, 4)              // nomor disk
  eocdBuf.writeUInt16LE(0, 6)              // disk CD
  eocdBuf.writeUInt16LE(simpan.length, 8)  // entri di disk ini
  eocdBuf.writeUInt16LE(simpan.length, 10) // total entri
  eocdBuf.writeUInt32LE(cd.length, 12)     // ukuran CD
  eocdBuf.writeUInt32LE(cdOffset, 16)      // offset CD
  eocdBuf.writeUInt16LE(0, 20)             // panjang komentar
  return Buffer.concat([...bagian, cd, eocdBuf])
}

export default { cariEOCD, daftarEntri, saringZip }
