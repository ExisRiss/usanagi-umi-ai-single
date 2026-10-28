/* By AlzRiss - Usanagi Umi AI
 *
 * Task140 — tambah/hapus nama subdomain untuk deploy situs (DEVELOPER).
 *
 *   .addsubdomain                 → tutorial + daftar subdomain yang ada
 *   .addsubdomain <nama>          → siapkan subdomain untuk deploy:
 *                                   folder situs + halaman pembuka + DNS
 *   .addnamesubdomain <nama>      → tambahkan NAMA di bawah alzriss
 *                                   hasil: <nama>.alzriss.gwenna.my.id
 *   .delnamesubdomain <nama>      → hapus nama itu lagi (DNS + data)
 *
 * Catatan jujur yang WAJIB dibaca user (sudah diuji 28-10-2026):
 *   <nama>.alzriss.gwenna.my.id  → record DNS-nya dibuat, TETAPI HTTPS gagal
 *       dengan SSL handshake failure karena sertifikat Universal Cloudflare
 *       hanya mencakup *.gwenna.my.id (satu tingkat). Butuh Total TLS / ACM.
 *   <nama>-alzriss.gwenna.my.id  → pola strip, HTTPS langsung jalan (gratis).
 * Jadi bot selalu membuat DUA record: pola strip (hidup sekarang) dan pola
 * titik (siap dipakai begitu sertifikatnya tersedia).
 */

import { sendInteractive } from '../../lib/awang-tombol.js'
import {
  bacaKonfig,
  subSiap,
  daftarSubdomain,
  infoSubdomain,
  bacaRegistry,
  simpanRegistry,
  deploySubdomain,
  hapusSubdomain,
  hostUtama,
  hostTitik,
  namaSubAman,
  siapkanBerkas,
} from '../../lib/subdomain-kaira.js'

const halamanPembuka = (nama) => `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nama} · Usanagi Umi</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;
background:#0b1220;color:#e9f1f9;font:15px/1.6 system-ui,-apple-system,Arial,sans-serif;padding:24px}
.box{max-width:520px;width:100%;border:1px solid #2c514d;background:linear-gradient(115deg,#14382f,#16262c);
border-radius:18px;padding:26px}
.tag{font-size:10px;letter-spacing:2px;color:#76ceb1;text-transform:uppercase}
h1{margin:8px 0 10px;font-size:26px;letter-spacing:-.6px}
p{margin:0 0 14px;color:#a1bdb5;font-size:13px}
code{display:block;background:#0f1a17;border:1px solid #24383a;border-radius:9px;padding:10px 12px;
font:12px/1.7 ui-monospace,monospace;color:#ace4d0;margin:8px 0;overflow-wrap:anywhere}
small{color:#728ba4;font-size:11px}
</style></head><body><main class="box">
<p class="tag">subdomain siap</p>
<h1>${nama}</h1>
<p>Halaman ini dibuat otomatis oleh bot. Kirim berkas situsmu untuk menggantinya.</p>
<code>.deploysubdomain ${nama}</code>
<p><small>Balas pesan itu dengan berkas <b>.html</b>, <b>.zip</b>, atau <b>.tar.gz</b> berisi index.html.</small></p>
</main></body></html>`

const belumSiap = () => [
  '⚙️ *Deploy subdomain belum aktif.*',
  '',
  'Berkas `data/subdomain-kaira.json` belum lengkap (panelUrl / apiKey / serverId /',
  'cfToken / cfZone / tunnelId). Fitur ini tidak bisa jalan tanpa itu.',
].join('\n')

const daftarTeks = (items) => {
  if (!items.length) return '_belum ada subdomain_'
  return items.slice(0, 20).map((item, i) => {
    const status = String(item.status || 'aktif')
    return `${i + 1}. *${item.nama}* — ${status} · ${item.berkas || 0} berkas · https://${hostUtama(item.nama)}/`
  }).join('\n')
}

const TUTORIAL = async () => {
  const cfg = bacaKonfig() || {}
  const items = await daftarSubdomain().catch(() => [])
  const dasar = cfg.domain || 'alzriss.gwenna.my.id'
  return [
    '🌐 *SUB DOMAIN UNTUK DEPLOY*',
    '',
    `Dasar: *${dasar}*`,
    '',
    '*1. Buat subdomain*',
    '.addsubdomain <nama>',
    'Contoh: .addsubdomain portofolio',
    `→ https://portofolio-${dasar}/ langsung hidup dengan halaman pembuka.`,
    '',
    '*2. Kirim situsmu*',
    'Balas pesan bot dengan berkas:',
    '.deploysubdomain portofolio',
    'lalu kirim .html, .zip, atau .tar.gz (wajib ada index.html di akar).',
    '',
    '*3. Atur*',
    '.ceksubdomain — daftar situs',
    '.kontrol-subdomain — tombol aktif/nonaktif/hapus',
    '.bataldeploy — batalkan deploy yang menunggu berkas',
    '',
    '*Nama tambahan di bawah subdomain*',
    '.addnamesubdomain <nama>',
    `→ https://<nama>.${dasar}/`,
    `Catatan: HTTPS-nya baru jalan setelah Total TLS aktif.`,
    `Padanan yang langsung jalan: https://<nama>-${dasar}/`,
    '.delnamesubdomain <nama> — hapus lagi',
    '',
    '*Subdomain aktif sekarang*',
    daftarTeks(items),
  ].join('\n')
}

async function kirimKartu(m, conn, { judul, subjudul, isi, daftar }) {
  try {
    return await sendInteractive(conn, m.chat, {
      title: judul,
      subtitle: subjudul,
      body: isi,
      footer: 'Khusus developer.',
      list: daftar ? { listTitle: 'Aksi', sections: [{ title: 'AKSI', rows: daftar }] } : undefined,
    }, { quoted: m.raw || m })
  } catch (error) {
    return m.reply(isi)
  }
}

/* ── addsubdomain ──────────────────────────────────────────────────────── */

async function tanganiAddSubdomain(m, conn, teks) {
  if (!subSiap()) return m.reply(belumSiap())
  const nama = namaSubAman(teks)
  if (!nama) {
    if (!String(teks || '').trim()) return m.reply(await TUTORIAL())
    return m.reply([
      '⚠️ Nama tidak sah: *' + String(teks).trim() + '*',
      '',
      'Aturan: 3–30 karakter, huruf kecil/angka/strip, tidak boleh angka saja,',
      'dan bukan nama yang dipakai sistem (www, api, admin, jadibot, …).',
      '',
      'Contoh: .addsubdomain portofolio',
    ].join('\n'))
  }

  const sudah = await infoSubdomain(nama).catch(() => null)
  await m.reply('⏳ Menyiapkan subdomain *' + nama + '* …')

  let hasil
  try {
    const berkas = siapkanBerkas(null, '', halamanPembuka(nama))
    hasil = await deploySubdomain({
      nama,
      berkas,
      pemilik: m.sender || '',
      judul: nama,
      mode: sudah ? 'perbarui' : 'baru',
    })
  } catch (error) {
    return m.reply('❌ Gagal menyiapkan subdomain: ' + error.message)
  }

  const dns = (hasil.dns || []).map((d) => {
    if (d.galat) return `⚠️ ${d.host} — ${d.galat}`
    if (d.sudahAda) return `✅ ${d.host} — sudah ada`
    if (d.dibuat || d.diperbarui) return `✅ ${d.host} — dibuat`
    return `➖ ${d.host} — dilewati`
  }).join('\n')

  const isi = [
    sudah ? '♻️ *SUBDOMAIN DIPERBARUI*' : '✅ *SUBDOMAIN SIAP*',
    '',
    `Nama : ${hasil.nama}`,
    `URL  : ${hasil.url}`,
    sudah ? '' : `Baru : ${hasil.berkas} berkas halaman pembuka`,
    '',
    '*DNS*',
    dns || '-',
    '',
    '*Langkah berikutnya*',
    '1. Siapkan situsmu (index.html di akar folder)',
    '2. Kirim ke bot: ketik .deploysubdomain ' + hasil.nama,
    '3. Balas pesan bot dengan berkas .html / .zip / .tar.gz',
    '4. Cek hasilnya di ' + hasil.url,
  ].join('\n')

  return kirimKartu(m, conn, {
    judul: hasil.nama,
    subjudul: hasil.url,
    isi,
    daftar: [
      { title: '📤 Deploy berkas', description: 'Balas dengan zip/html', command: '.deploysubdomain ' + hasil.nama },
      { title: '📋 Daftar subdomain', description: 'Semua situs yang ada', command: '.ceksubdomain' },
      { title: '🎛️ Kontrol subdomain', description: 'Aktif / nonaktif / hapus', command: '.kontrol-subdomain' },
    ],
  })
}

/* ── addnamesubdomain ──────────────────────────────────────────────────── */

async function tanganiAddNama(m, conn, teks) {
  if (!subSiap()) return m.reply(belumSiap())
  const cfg = bacaKonfig() || {}
  const dasar = cfg.domain || 'alzriss.gwenna.my.id'
  const nama = namaSubAman(teks)
  if (!nama) {
    return m.reply([
      '🌐 *TAMBAH NAMA SUBDOMAIN*',
      '',
      'Format: .addnamesubdomain <nama>',
      'Contoh: .addnamesubdomain toko',
      '',
      `Hasil: https://toko.${dasar}/`,
      '',
      '*Yang perlu kamu tahu*',
      '• Bot membuat DUA record DNS sekaligus.',
      `• https://${nama || '<nama>'}-${dasar}/ → langsung bisa dibuka (HTTPS normal).`,
      `• https://${nama || '<nama>'}.${dasar}/ → record dibuat, tetapi HTTPS-nya`,
      '  akan gagal sampai certifikat Total TLS / ACM aktif di Cloudflare.',
      '  Tanpa itu browser menampilkan error SSL.',
      '',
      'Hapus lagi dengan: .delnamesubdomain <nama>',
    ].join('\n'))
  }

  await m.reply('⏳ Menambahkan nama *' + nama + '* …')
  let hasil
  try {
    /* Situs kosong dengan halaman pembuka supaya nama itu tidak menunjuk
     * ke 404. `deploySubdomain` sekaligus membuat kedua record DNS. */
    const berkas = siapkanBerkas(null, '', halamanPembuka(nama))
    hasil = await deploySubdomain({
      nama,
      berkas,
      pemilik: m.sender || '',
      judul: nama,
      mode: (await infoSubdomain(nama).catch(() => null)) ? 'perbarui' : 'baru',
    })
  } catch (error) {
    return m.reply('❌ Gagal menambah nama: ' + error.message)
  }

  const isi = [
    '✅ *NAMA SUBDOMAIN DITAMBAHKAN*',
    '',
    `Nama    : ${hasil.nama}`,
    `Pakai ini sekarang : ${hasil.url}`,
    `Nama titik (nanti) : ${hasil.urlTitik}`,
    '',
    '*Status nyata*',
    `• ${hasil.url} → hidup, sertifikat normal (sudah diuji)`,
    `• ${hasil.urlTitik} → DNS dibuat, HTTPS gagal tanpa Total TLS/ACM`,
    '',
    '*Kalau mau yang titik juga hidup*',
    'Aktifkan Total TLS / Advanced Certificate Manager di Cloudflare',
    '(berbayar), lalu tunggu status sertifikat "Active". Tidak ada biaya',
    'kalau tetap memakai pola strip.',
    '',
    '*Isi halaman*',
    'Ganti dengan situsmu: .deploysubdomain ' + hasil.nama,
    'Hapus nama ini: .delnamesubdomain ' + hasil.nama,
  ].join('\n')

  return kirimKartu(m, conn, {
    judul: hasil.nama,
    subjudul: hasil.url,
    isi,
    daftar: [
      { title: '📤 Deploy isi situs', description: 'Kirim zip/html', command: '.deploysubdomain ' + hasil.nama },
      { title: '🗑️ Hapus nama ini', description: 'DNS + data ikut dihapus', command: '.delnamesubdomain ' + hasil.nama },
    ],
  })
}

/* ── delnamesubdomain ──────────────────────────────────────────────────── */

async function tanganiDelNama(m, teks) {
  if (!subSiap()) return m.reply(belumSiap())
  const nama = namaSubAman(teks)
  if (!nama) return m.reply('Format: .delnamesubdomain <nama>\nContoh: .delnamesubdomain toko')

  const info = await infoSubdomain(nama).catch(() => null)
  const hasil = await hapusSubdomain(nama).catch((error) => ({ galat: error.message }))
  if (hasil.galat) return m.reply('❌ ' + hasil.galat)

  const dns = (hasil.dns || []).map((d) => {
    if (d.galat) return `⚠️ ${d.host} — ${d.galat}`
    if (d.tidakAda) return `➖ ${d.host} — memang tidak ada`
    if (d.dihapus) return `✅ ${d.host} — dihapus`
    return `➖ ${d.host} — dilewati`
  }).join('\n')

  return m.reply([
    '🗑️ *NAMA SUBDOMAIN DIHAPUS*',
    '',
    `Nama : ${nama}`,
    `DNS  :`,
    dns || '-',
    info && info.pemilik ? `\nPemilik sebelumnya: ${info.pemilik.split('@')[0]}` : '',
    '',
    'Halaman pembuka di folder situs ikut terhapus.',
  ].filter((x) => x !== '').join('\n'))
}

/* ── handler ───────────────────────────────────────────────────────────── */

let handler = async (m, { conn, command, text = '', isROwner }) => {
  if (!isROwner) return m.reply('🔒 Perintah subdomain hanya untuk developer.')
  const cmd = String(command || '').toLowerCase()
  try {
    if (cmd === 'addsubdomain') return await tanganiAddSubdomain(m, conn, text)
    if (cmd === 'addnamesubdomain') return await tanganiAddNama(m, conn, text)
    if (cmd === 'delnamesubdomain') return await tanganiDelNama(m, text)
    return m.reply('Perintah tidak dikenal.')
  } catch (error) {
    return m.reply('❌ ' + (error && error.message ? error.message : error))
  }
}

handler.help = [
  'addsubdomain',
  'addsubdomain nama',
  'addnamesubdomain nama',
  'delnamesubdomain nama',
]
handler.tags = ['owner']
handler.command = /^(addsubdomain|addnamesubdomain|delnamesubdomain|hapusnamesubdomain)$/i
handler.description = 'Tambah/hapus subdomain & nama subdomain untuk deploy situs (developer)'
handler.owner = false
handler.group = false
handler.private = false
handler.limit = false
handler.fail = null

export { handler }
export default handler
