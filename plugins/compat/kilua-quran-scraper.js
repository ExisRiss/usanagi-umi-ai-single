/* By AlzRiss - Usanagi Umi AI
 *
 * FORMAT "SCRAPPER" — modul pengambil data, dipanggil lewat `.scraper`.
 *
 * Bentuk ini sengaja memakai gaya bot lama (`module.exports = { … }`, bukan
 * `export default`). Loader Umi mencoba mengimpornya sebagai ESM, gagal karena
 * `module` tidak ada di ESM, lalu mengubahnya otomatis dan mendaftarkan
 * fungsinya sebagai perintah scraper. Di log akan muncul:
 *   `↻ Plugin compat/kilua-quran-scraper.js dimuat sebagai format "scraper"`
 *
 * Cara pakai (owner maupun pengguna):
 *   .scraper                      → daftar fungsi yang tersedia
 *   .scraper tafsir 1             → tafsir Surah Al-Fatihah
 *   .scraper surahinfo 2          → ringkasan Surah Al-Baqarah
 *
 * Data dari equran.id (API Al-Quran Indonesia, sudah dicek HTTP 200).
 */

const EQURAN = 'https://equran.id/api/v2'
const TIMEOUT = 20000

async function ambilJson(url) {
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Usanagi-Umi-AI/1.0' },
        signal: AbortSignal.timeout(TIMEOUT)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} dari ${url}`)
    const data = await res.json()
    if (data?.code !== 200 || !data?.data) throw new Error(data?.message || 'balasan API tidak dikenali')
    return data.data
}

function potong(teks, batas = 3500) {
    const isi = String(teks || '')
    return isi.length > batas ? `${isi.slice(0, batas)}\n… (dipotong, buka sumber untuk lengkapnya)` : isi
}

/** Tafsir satu surah (ringkas: nama surah + tafsir tiap ayat, dibatasi). */
async function tafsir(nomor = '1') {
    const n = Number(String(nomor).replace(/[^\d]/g, ''))
    if (!n || n < 1 || n > 114) throw new Error('nomor surah harus 1–114')
    const data = await ambilJson(`${EQURAN}/tafsir/${n}`)
    /* Nama kolomnya `tafsir` (bukan `ayat`) — sudah dicocokkan dengan balasan
     * asli equran.id: data.tafsir = [{ ayat: 1, teks: "…" }, …]. */
    const ayat = Array.isArray(data.tafsir) ? data.tafsir : []
    if (!ayat.length) throw new Error('tafsir kosong dari server')
    const baris = [`📖 *TAFSIR ${data.namaLatin || '-'}* (${data.nomor || n})`, '']
    for (const a of ayat.slice(0, 3)) {
        baris.push(`▸ Ayat ${a.ayat}`)
        baris.push(potong(String(a.teks || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), 1200))
        baris.push('')
    }
    if (ayat.length > 3) baris.push(`… dan ${ayat.length - 3} ayat lainnya (total ${ayat.length} ayat)`)
    return potong(baris.join('\n'))
}

/** Ringkasan satu surah: arti, jumlah ayat, tempat turun. */
async function surahinfo(nomor = '1') {
    const n = Number(String(nomor).replace(/[^\d]/g, ''))
    if (!n || n < 1 || n > 114) throw new Error('nomor surah harus 1–114')
    const d = await ambilJson(`${EQURAN}/surat/${n}`)
    const teks = String(d.deskripsi || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return [
        `📚 *${d.namaLatin || '-'}* (${d.nama || ''})`,
        '',
        `• Nomor      : ${d.nomor}`,
        `• Arti       : ${d.arti || '-'}`,
        `• Ayat       : ${d.jumlahAyat}`,
        `• Turun di   : ${d.tempatTurun || '-'}`,
        `• Audio      : ${d.audioFull?.['05'] ? 'tersedia' : '-'}`,
        '',
        potong(teks, 1200)
    ].join('\n')
}

module.exports = { tafsir, surahinfo }
