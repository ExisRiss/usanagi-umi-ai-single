/* By AlzRiss - Usanagi Umi AI
 *
 * SELF-TEST MENU INTERAKTIF — Task120
 *
 * Membangun payload menu rich PERSIS seperti yang dikirim `..menu`, lalu:
 *   1. menyiapkan foto header lewat jalur asli (sharp + prepareWAMessageMedia,
 *      unggahan diganti tiruan supaya tidak menyentuh server WhatsApp),
 *   2. meng-encode payload dengan protobuf elaina-baileys dan meng-decode-nya
 *      kembali — membuktikan setiap field dikenal library (bukan nama karangan),
 *   3. memeriksa bentuknya dengan periksaPayload() (tanpa bungkus view-once),
 *   4. menulis hasilnya ke /data/menu-selftest.json (bertahap, supaya kalau
 *      salah satu langkah macet kelihatan sampai mana).
 *
 * Perintah `.menucheck` (owner) menjalankan ulang pemeriksaan yang sama.
 * Plugin ini tidak mengubah perilaku bot.
 */

import fs from 'node:fs'
import path from 'node:path'

/* Di panel, folder data bot adalah `data/` di dalam direktori kerja (yang
 * tampil sebagai `/data` di panel), BUKAN `/data` absolut milik container.
 * Coba keduanya supaya tidak diam-diam gagal seperti versi pertama. */
const BERKAS = (() => {
  const kandidat = [
    path.join(process.cwd(), 'data', 'menu-selftest.json'),
    '/data/menu-selftest.json',
  ]
  for (const jalur of kandidat) {
    try {
      fs.mkdirSync(path.dirname(jalur), { recursive: true })
      fs.appendFileSync(jalur, '')
      return jalur
    } catch {}
  }
  return null
})()

const TUNDA_MS = 8_000

const hasil = { at: new Date().toISOString(), versi: 'task120' }

function simpan(patch = {}) {
  Object.assign(hasil, patch, { diperbarui: new Date().toISOString() })
  hasil.berkas = BERKAS
  try {
    if (BERKAS) fs.writeFileSync(BERKAS, JSON.stringify(hasil, null, 2))
  } catch (error) {
    try { fs.writeFileSync(path.join(process.cwd(), 'menu-selftest-gagal.txt'), String(error?.message || error)) } catch {}
  }
}

export async function jalankanPemeriksaan() {
  hasil.at = new Date().toISOString()
  simpan({ tahap: 'mulai' })

  const { bangunInteractive, rapikanBagian, periksaPayload } = await import('../../lib/tombol-payload.js')
  // Bukti plugin menu benar-benar termuat (kalau impornya gagal, .menu mati).
  const daftar = global.plugins || {}
  const menuPlugin = daftar['main/umi-menu.js']
  simpan({
    tahap: 'payload-modul-ok',
    plugin: {
      jumlah: Object.keys(daftar).length,
      adaUmiMenu: typeof menuPlugin === 'function',
      perintahMenu: menuPlugin?.command ? String(menuPlugin.command) : null,
      adaMenu120: typeof daftar['_system/_menu120.js'] === 'function',
    },
  })

  //── foto header lewat jalur asli (unggahan tiruan) ─────────────
  let media = null
  try {
    const { siapkanVisualMenu } = await import('../../lib/awang-menu.js')
    simpan({ tahap: 'menu-modul-ok' })
    const connPalsu = {
      user: { id: '6280000000000@s.whatsapp.net' },
      waUploadToServer: async () => ({
        mediaUrl: 'https://mmg.whatsapp.net/fake',
        directPath: '/v/t62.7118-24/fake',
        url: 'https://mmg.whatsapp.net/fake',
      }),
    }
    const mulai = Date.now()
    media = await siapkanVisualMenu(connPalsu)
    simpan({
      visual: {
        ada: Boolean(media),
        headerType: media?.headerType || null,
        mimetype: media?.imageMessage?.mimetype || media?.videoMessage?.mimetype || null,
        lebar: media?.imageMessage?.width || null,
        tinggi: media?.imageMessage?.height || null,
        byte: media?.imageMessage?.fileLength || media?.videoMessage?.fileLength || null,
        ms: Date.now() - mulai,
      },
      tahap: 'visual-ok',
    })
  } catch (error) {
    simpan({ visual: { ada: false, error: String(error?.message || error).slice(0, 200) }, tahap: 'visual-gagal' })
  }

  //── payload menu persis seperti `..menu` ───────────────────────
  const bagian = rapikanBagian([
    {
      title: 'Menu Utama',
      rows: [
        { header: '📖', title: 'Semua Fitur', description: 'Seluruh perintah bot', command: '.allmenu' },
        { header: '🫅', title: 'Owner Menu', description: 'Khusus owner', command: '.menu_owner' },
      ],
    },
    {
      title: 'Kategori Tersedia',
      rows: [
        { header: '🎮', title: 'Menu Game', description: 'Game & RPG', command: '.kategori game' },
        { header: '🛠', title: 'Menu Tools', description: 'Tools & downloader', command: '.kategori tools' },
      ],
    },
  ])

  const isi = bangunInteractive({
    title: 'UMI USANAGI AI',
    subtitle: 'Selamat pagi Kak',
    body: 'Blok info bot di sini.',
    footer: 'By AlzRiss - Usanagi Umi AI',
    media,
    contextInfo: { mentionedJid: ['6281234567890@s.whatsapp.net'] },
    buttons: [
      { buttonText: { displayText: '♕ OWNER BOT' }, buttonId: '.owner', type: 1 },
      {
        buttonText: { displayText: '☰ LIST MENU' },
        buttonId: 'menu',
        type: 1,
        nativeFlowInfo: { name: 'single_select', paramsJson: JSON.stringify({ title: 'Menu', sections: bagian }) },
      },
    ],
  })

  const pemeriksaan = periksaPayload(isi)
  simpan({ pemeriksaan, tahap: 'payload-diukur' })

  //── encode + decode dengan protobuf asli ──────────────────────
  try {
    const { proto } = await import('@rexxhayanasi/elaina-baileys')
    const encoded = proto.Message.encode(proto.Message.fromObject(isi)).finish()
    const balik = proto.Message.decode(encoded)
    const tombol = balik?.interactiveMessage?.nativeFlowMessage?.buttons || []
    simpan({
      protobuf: {
        ok: true,
        byte: encoded.length,
        adaInteractive: Boolean(balik?.interactiveMessage),
        adaViewOnce: Boolean(balik?.viewOnceMessage),
        jumlahTombol: tombol.length,
        namaTombol: tombol.map(t => t.name),
        judul: balik?.interactiveMessage?.header?.title || '',
        adaFoto: Boolean(balik?.interactiveMessage?.header?.hasMediaAttachment),
        idBarisPertama: (() => {
          try {
            return JSON.parse(tombol.find(t => t.name === 'single_select')?.buttonParamsJson || '{}')
              ?.sections?.[0]?.rows?.[0]?.id || null
          } catch { return null }
        })(),
      },
      tahap: 'selesai',
    })
  } catch (error) {
    simpan({ protobuf: { ok: false, error: String(error?.message || error).slice(0, 200) }, tahap: 'protobuf-gagal' })
  }

  return hasil
}

/* ── perintah pemeriksaan manual (owner) ───────────────────────── */
const handler = async function (m) {
  await m.reply('⏳ Menjalankan pemeriksaan menu…')
  const r = await jalankanPemeriksaan().catch(error => ({ gagal: String(error?.message || error) }))
  await m.reply(`*PEMERIKSAAN MENU (Task120)*\n\n\`\`\`${JSON.stringify(r, null, 2).slice(0, 3000)}\`\`\``)
}

handler.command = /^menucheck$/i
handler.help = ['menucheck']
handler.tags = ['owner']
handler.owner = true
handler.description = 'Periksa bentuk payload menu rich (tanpa mengirim ke WhatsApp)'

export default handler

/* Jalan sendiri sekali setelah bot siap. */
const timer = setTimeout(() => { jalankanPemeriksaan().catch(() => {}) }, TUNDA_MS)
if (typeof timer.unref === 'function') timer.unref()
