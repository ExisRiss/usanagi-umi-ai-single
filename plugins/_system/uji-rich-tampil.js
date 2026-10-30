/* By AlzRiss — Usanagi Umi AI
 *
 * UJI TAMPIL KARTU RICH (Task177)
 *
 * Kenapa ada
 * ----------
 * Owner melaporkan `..menu` (rich message) TIDAK menampilkan apa pun di
 * WhatsApp, sementara `.ping3` (bentuk payload yang sama) dulu tampil. Tidak
 * ada cara menebak dari server: yang menentukan adalah HP + versi WhatsApp
 * penerima. Perintah ini mengirim TIGA varian dengan ukuran berbeda supaya
 * kelihatan pasti batas mana yang gagal:
 *
 *   1. MINI   ~0,5 KB   kartu paling sederhana (payload dasar diterima?)
 *   2. SEDANG ~15 KB    HTML tanpa gambar (batas ukuran?)
 *   3. PENUH  ~50 KB    kartu menu asli dengan banner WebP tersemat
 *
 * Balasannya cukup: varian nomor berapa saja yang muncul. Dari situ ketahuan
 * apakah masalahnya format rich, ukuran payload, atau gambar base64.
 */

const handler = async function (m, { conn }) {
  const { kirimKartuLive, bagianHtml, bangunPesanKartuLive } = await import('../../lib/rich-live-card.js')

  const mini = [
    '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>body{margin:0;padding:14px;font-family:Arial,sans-serif;background:#0b0b12;color:#c8ff2e}',
    'h3{margin:0 0 6px;font-size:15px}p{margin:0;font-size:12px;color:#fff;line-height:1.4}</style></head><body>',
    '<h3>UJI 1 — MINI</h3><p>Kalau kartu ini muncul, format rich message bot ini <b>didukung</b> di HP kamu.</p>',
    '</body></html>',
  ].join('')

  const sedang = [
    '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>body{margin:0;padding:12px;font-family:Arial,sans-serif;background:#fff;color:#0b0b12}',
    '.b{border:3px solid #0b0b12;border-radius:12px;box-shadow:4px 4px 0 #0b0b12;padding:10px;margin-bottom:8px}',
    'h3{font-size:14px;margin:0 0 6px}p{font-size:12px;margin:0;line-height:1.4}</style></head><body>',
    '<h3>UJI 2 — SEDANG (tanpa gambar)</h3>',
    '<div class="b"><p>HTML dengan gaya penuh tapi TANPA gambar base64.</p></div>',
    '<div class="b"><p>Kalau varian 1 tampil tapi varian ini tidak, berarti batas ukuran payload.</p></div>',
    '<div class="b"><p>Kalau dua-duanya tampil sampai sini, gambar tersemat yang bikin gagal.</p></div>',
    '</body></html>',
  ].join('')

  const hasil = []
  await m.reply('🧪 Mengirim 3 kartu uji. Balas nomor yang MUNCUL, ya.')

  async function kirim(label, html) {
    const mulai = Date.now()
    try {
      const r = await kirimKartuLive(conn, m.chat, { bagian: bagianHtml(html), title: `UJI ${label}` })
      hasil.push({ label, ok: true, bytes: html.length, ms: Date.now() - mulai, id: r?.messageId })
    } catch (e) {
      hasil.push({ label, ok: false, bytes: html.length, error: String(e?.message || e).slice(0, 160) })
    }
    await new Promise((r) => setTimeout(r, 1200))
  }

  await kirim('1 MINI', mini)
  await kirim('2 SEDANG', sedang)

  try {
    const { htmlMenuLive } = await import('../../lib/umi-menu/live-menu.js')
    const menu = await htmlMenuLive(conn, m.chat, '.', m)
    await kirim('3 PENUH', menu.html)
    hasil.push({ versiMenu: menu.versiMenu })
  } catch (e) {
    hasil.push({ label: '3 PENUH', ok: false, error: String(e?.message || e).slice(0, 160) })
  }

  const baris = hasil.map((h) => {
    if (h.versiMenu) return `• Menu: ${h.versiMenu}`
    const kb = (h.bytes / 1024).toFixed(1)
    return `${h.ok ? '✅' : '❌'} ${h.label} — ${kb} KB${h.ok ? ` (${h.ms} ms)` : ` — ${h.error}`}`
  })
  await m.reply(['*HASIL KIRIM UJI RICH*', ...baris, '', 'Balas: *1*, *2*, *3*, *12*, *123*, atau *tidak ada*.'].join('\n'))

  try {
    const { default: fs } = await import('node:fs')
    fs.writeFileSync('data/uji-rich-tampil.json', JSON.stringify({ at: new Date().toISOString(), hasil }, null, 2))
  } catch { /* opsional */ }
}

handler.command = /^(ujirich|ujirichmenu)$/i
handler.help = ['ujirich']
handler.tags = ['owner']
handler.owner = true
handler.description = 'Kirim 3 kartu rich (mini/sedang/penuh) untuk uji tampil di WhatsApp (Task177)'

export default handler
