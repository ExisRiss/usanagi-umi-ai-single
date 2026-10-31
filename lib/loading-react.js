/* By AlzRiss - Usanagi Umi AI
 *
 * Task186 — animasi REACTION 1️⃣ → 🔟 untuk pesan yang sedang diproses.
 * Dipakai pada tugas yang membutuhkan waktu (allmenu, menu, getsc, spamtag,
 * addcase/addplugin/addscraper). Pesan perintah user diganti reaksinya
 * berurutan 1️⃣ 2️⃣ … 🔟 lalu diulang sampai tugas selesai; saat selesai
 * reaksi terakhir menjadi ✅ (sukses) atau ⚠️ (gagal).
 *
 * Anti-tabrakan: satu chat hanya punya satu animasi aktif. Panggilan `mulai`
 * baru mengambil alih (animasi lama berhenti TANPA menulis reaksi final),
 * sehingga wrap bertingkat (handler → tampilkanAllMenu) tidak saling
 * menimpa.
 */

const ANGKA = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']
const JEDA_BAWAN = 300 // ms per langkah — 3 detik penuh 1..10

/* chat → { token, timer } pemilik animasi aktif */
const pemilik = new Map()

/**
 * Mulai animasi reaction pada pesan perintah.
 * @param {object} conn koneksi WhatsApp
 * @param {object} m objek pesan (pakai m.raw.key bila ada)
 * @param {{ jeda?: number }} [opsi]
 * @returns {{ stop: (akhir?: string) => Promise<void> }}
 */
export function mulaiReactLoading(conn, m, opsi = {}) {
  const chat = String(m?.chat || m?.sender || '')
  const key = m?.raw?.key || m?.key || null
  const jeda = Math.max(80, Number(opsi.jeda) || JEDA_BAWAN)

  if (!conn || !chat || !key) {
    return { async stop() { /* tanpa konteks: tidak ada animasi */ } }
  }

  // Ambil alih animasi sebelumnya untuk chat ini (tanpa reaksi final).
  hentikanTanpaFinal(chat)

  const token = {}
  let i = 0

  const reaksi = async (emoji) => {
    try {
      await conn.sendMessage(chat, { react: { text: emoji, key } })
    } catch { /* reaksi gagal tidak boleh merusak tugas */ }
  }

  reaksi(ANGKA[0]) // fire-and-forget: reaksi pertama tidak menunda tugas
  i = 1
  const timer = setInterval(() => {
    const aktif = pemilik.get(chat)
    if (!aktif || aktif.token !== token) return
    reaksi(ANGKA[i % ANGKA.length])
    i += 1
  }, jeda)
  /* Pengawas: kalau stop() tidak pernah terpanggil (bug pemanggil / error
   * tak tertangani), animasi mati sendiri setelah 180 detik. */
  const pengawas = setTimeout(() => {
    const aktif = pemilik.get(chat)
    if (aktif && aktif.token === token) {
      clearInterval(aktif.timer)
      pemilik.delete(chat)
    }
  }, 180000)
  pemilik.set(chat, { token, timer, pengawas })

  return {
    async stop(akhir = '✅') {
      const aktif = pemilik.get(chat)
      if (!aktif || aktif.token !== token) return // sudah digantikan — jangan sentuh
      pemilik.delete(chat)
      clearTimeout(aktif.pengawas)
      clearInterval(timer)
      await reaksi(akhir)
    },
  }
}

function hentikanTanpaFinal(chat) {
  const aktif = pemilik.get(chat)
  if (!aktif) return
  clearTimeout(aktif.pengawas)
  clearInterval(aktif.timer)
  pemilik.delete(chat)
}

/** Bersihkan semua animasi (uji otomatis / reload plugin). */
export function resetReactLoading() {
  for (const chat of [...pemilik.keys()]) pemilik.delete(chat)
}

export default { mulaiReactLoading, resetReactLoading }
