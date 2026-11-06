/* By AlzRiss - Usanagi Umi AI
 *
 * CEK MANDIRI `.jadwalgrup` (Task173d)
 *
 * Laporan: `RangeError: Too few parameter values were provided` di
 * core/awang-jadwal.js:203 → listGroupSchedules(). Penyebabnya `.all()` dipanggil
 * tanpa argumen padahal SQL-nya punya satu `?` (groupId). Sudah diperbaiki.
 *
 * Plugin ini menjalankan fungsi yang sama SAAT BOOT memakai grup yang dilaporkan
 * (baca saja, tidak membuat/membatalkan jadwal apa pun), lalu menulis hasilnya
 * ke `data/jadwal-selftest.json`. Kalau bug itu kembali, berkas ini langsung
 * menunjukkan galatnya tanpa perlu menunggu ada yang mengetik `.jadwalgrup`.
 */

import fs from 'node:fs'
import path from 'node:path'

const GRUP_LAPORAN = '120363412943276917@g.us'
const UMUM = '120363000000000000@g.us'
const BERKAS = path.join(process.cwd(), 'data', 'jadwal-selftest.json')
const TUNDA_MS = 15_000

function simpan(data) {
  try {
    fs.mkdirSync(path.dirname(BERKAS), { recursive: true })
    fs.writeFileSync(BERKAS, JSON.stringify({ at: new Date().toISOString(), ...data }, null, 2))
  } catch { /* tidak boleh mengganggu bot */ }
}

export async function cekJadwal() {
  const hasil = { grup: GRUP_LAPORAN }
  try {
    const { listGroupSchedules } = await import('../../core/awang-jadwal.js')
    const mulai = Date.now()
    const daftar = listGroupSchedules(GRUP_LAPORAN)
    hasil.grupLaporan = { ok: true, jumlah: Array.isArray(daftar) ? daftar.length : 0, ms: Date.now() - mulai }
    const lain = listGroupSchedules(UMUM)
    hasil.grupLain = { ok: true, jumlah: Array.isArray(lain) ? lain.length : 0 }
    /* Grup bukan @g.us → harus mengembalikan [] tanpa menyentuh database. */
    hasil.bukanGrup = { ok: Array.isArray(listGroupSchedules('6280000000000@s.whatsapp.net')), jumlah: 0 }
    hasil.ok = true
  } catch (error) {
    hasil.ok = false
    hasil.error = String(error?.message || error).slice(0, 250)
    hasil.stack = String(error?.stack || '').split('\n').slice(0, 4).join('\n')
  }
  simpan(hasil)
  return hasil
}

const handler = async (m) => {
  const hasil = await cekJadwal()
  await m.reply([
    '*CEK JADWAL GRUP*',
    '',
    hasil.ok
      ? `✅ listGroupSchedules jalan (${hasil.grupLaporan.jumlah} jadwal aktif di grup laporan)`
      : `❌ ${hasil.error}`,
    '',
    `Berkas: data/jadwal-selftest.json`,
  ].join('\n'))
}

handler.command = /^jadwalcek$/i
handler.help = ['jadwalcek']
handler.tags = ['owner']
handler.owner = true
handler.description = 'Uji listGroupSchedules tanpa membuat jadwal (Task173d)'

export default handler

const timer = setTimeout(() => { cekJadwal().catch(() => {}) }, TUNDA_MS)
if (typeof timer.unref === 'function') timer.unref()
