/* By AlzRiss - Usanagi Umi AI
 *
 * FORMAT "CASE" — bukti nyata bahwa loader Task130 jalan (bukan cuma tes).
 *
 * Berkas ini SENGAJA ditulis dalam format case gaya bot lama: kumpulan
 * `case 'perintah':` tanpa `export`, tanpa `handler`. Kalau dibaca sebagai
 * modul biasa, Node akan menolaknya (syntax error). Loader Umi sekarang
 * menangkap kegagalan itu, membungkus berkas ini menjadi handler sah, lalu
 * mencatat di log: `↻ Plugin compat/kilua-islamic-case.js dimuat sebagai
 * format "case"`.
 *
 * Isinya fitur islamic dari Kilua MD by Naren V2 yang belum ada di Umi:
 *   .akursi             → Ayat Kursi (Arab + terjemahan)
 *   .quranayat 2:255    → ayat pilihan, Arab + terjemahan
 *
 * Aslinya Kilua memanggil `global.API('kyzz', '/api/islamic/...')` yang tidak
 * ada di proyek ini. Di sini datanya diambil dari api.alquran.cloud (sudah
 * dicek HTTP 200), jadi teks Arab & terjemahannya bukan karangan.
 */

const QURAN_API = 'https://api.alquran.cloud/v1/ayah'

async function ambilAyah(ref) {
    const bersih = String(ref || '').trim().replace(/\s+/g, '')
    const [arabRes, indoRes] = await Promise.all([
        fetch(`${QURAN_API}/${bersih}/quran-uthmani`, { signal: AbortSignal.timeout(15000) }),
        fetch(`${QURAN_API}/${bersih}/id.indonesian`, { signal: AbortSignal.timeout(15000) })
    ])
    if (!arabRes.ok || !indoRes.ok) throw new Error(`server Al-Quran membalas ${arabRes.status}/${indoRes.status}`)
    const arab = await arabRes.json()
    const indo = await indoRes.json()
    if (arab.code !== 200 || indo.code !== 200 || !arab.data) throw new Error('ayat tidak ditemukan')
    return {
        arab: String(arab.data.text || ''),
        indo: String(indo.data.text || ''),
        surah: arab.data.surah?.englishName || '-',
        nomorSurah: arab.data.surah?.number,
        ayat: arab.data.numberInSurah
    }
}

async function kirimAyat(judul, ref) {
    const a = await ambilAyah(ref)
    await reply(
        `${judul}\n` +
        `📜 ${a.surah} (${a.nomorSurah}) : ayat ${a.ayat}\n\n` +
        `📖 *Arab:*\n${a.arab}\n\n` +
        `🇮🇩 *Terjemahan:*\n${a.indo}\n\n` +
        `> sumber: api.alquran.cloud`
    )
}

case 'akursi': {
    try {
        await kirimAyat('🕋 *AYAT KURSI*', '2:255')
    } catch (e) {
        await reply(`❌ Gagal mengambil Ayat Kursi: ${String(e.message || e).slice(0, 150)}`)
    }
    break
}

case 'quranayat': {
    const arg = String(text || '').trim()
    if (!arg) {
        await reply(
            '📖 *AYAT AL-QURAN*\n\n' +
            `• ${usedPrefix}akursi — Ayat Kursi\n` +
            `• ${usedPrefix}quranayat 2:255 — ayat tertentu\n` +
            `• ${usedPrefix}quranayat 18:10 — contoh lain\n\n` +
            'Format: nomorSurat : ayat'
        )
        break
    }
    if (!/^\d{1,3}:\d{1,3}$/.test(arg)) {
        await reply(`❌ Format salah: *${arg}*\nContoh yang benar: ${usedPrefix}quranayat 2:255`)
        break
    }
    try {
        await kirimAyat(`📖 *QS ${arg}*`, arg)
    } catch (e) {
        await reply(`❌ Gagal mengambil ${arg}: ${String(e.message || e).slice(0, 150)}`)
    }
    break
}
