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

  //── Task121: kartu rich gaya ping3 + menu teks baru ───────────
  try {
    const { bangunPesanKartuLive, bagianHtml } = await import('../../lib/rich-live-card.js')
    const kartu = bangunPesanKartuLive({ bagian: bagianHtml('<h1>uji</h1>'), title: 'Uji Menu' })
    const { proto: P } = await import('@rexxhayanasi/elaina-baileys')
    const enc = P.Message.encode(P.Message.fromObject(kartu.message)).finish()
    const balik = P.Message.decode(enc)
    const isiKartu = JSON.parse(
      Buffer.from(balik?.botForwardedMessage?.message?.richResponseMessage?.unifiedResponse?.data || '', 'base64').toString()
    )
    simpan({
      kartu121: {
        ok: true,
        byte: enc.length,
        adaRich: Boolean(balik?.botForwardedMessage?.message?.richResponseMessage),
        adaViewOnce: Boolean(balik?.viewOnceMessage),
        typename: isiKartu.__typename || null,
        primitive: isiKartu.sections?.[0]?.view_model?.primitive?.__typename || null,
        payload: isiKartu.sections?.[0]?.view_model?.primitive?.payload || null,
      },
    })
  } catch (error) {
    simpan({ kartu121: { ok: false, error: String(error?.message || error).slice(0, 200) } })
  }

  try {
    const { buildMenuFooter } = await import('../../lib/awang-menu.js')
    const { bangunTeksMenu, PILIHAN_BAWAAN } = await import('../../lib/umi-menu/menu-text.js')
    const teks = bangunTeksMenu({
      sapaan: 'Selamat Pagi @Alz aja',
      info: buildMenuFooter({ prefix: '.', pushName: 'Alz aja' }),
      pilihan: PILIHAN_BAWAAN,
      prefix: '.',
      watermark: 'By AlzRiss - Usanagi Umi AI',
    })
    simpan({
      teks121: {
        ok: true,
        panjang: teks.length,
        adaInfo: teks.includes('INFO BOT'),
        adaDaftar: teks.includes('📋 *MENU UTAMA*') && teks.includes('.menu_all'),
        contoh: teks.slice(0, 160),
      },
    })
  } catch (error) {
    simpan({ teks121: { ok: false, error: String(error?.message || error).slice(0, 200) } })
  }

  //── Task121: kartu menu benar-benar bisa dibangun di server ────
  try {
    const { htmlMenuLive } = await import('../../lib/umi-menu/live-menu.js')
    const mulai = Date.now()
    const kartu = await htmlMenuLive({ user: { id: '6280000000000@s.whatsapp.net' } }, 'uji@g.us', '.')
    simpan({
      kartuMenu: {
        ok: true,
        panjangHtml: kartu.html.length,
        ms: Date.now() - mulai,
        adaWallpaper: kartu.html.includes('data:image/jpeg;base64,'),
        adaJudul: kartu.html.includes('MENU'),
      },
    })
  } catch (error) {
    simpan({ kartuMenu: { ok: false, error: String(error?.message || error).slice(0, 300) } })
  }

  //── Task122: tombol menu (daftar 1-6 dihapus dari isi pesan) ────
  try {
    const { tombolMenu, bagianMenuUtama, bagianSemuaMenu, jumlahBaris } = await import('../../lib/umi-menu/menu-buttons.js')
    const { bangunInteractive, periksaPayload: periksa } = await import('../../lib/tombol-payload.js')
    // Kategori diambil lewat helper yang sama dengan `.menu` (Task123): kalau
    // pluginStore masih kosong saat bot baru hidup, `global.plugins` dipakai.
    const { daftarKategoriMenu } = await import('../../lib/awang-menu.js')
    let kategori = daftarKategoriMenu()
    for (let coba = 0; coba < 8 && !kategori.length; coba += 1) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      kategori = daftarKategoriMenu()
    }

    const bagian = bagianMenuUtama({ prefix: '.' }).concat(bagianSemuaMenu({ prefix: '.', kategori }))
    const isiTombol = bangunInteractive({
      title: 'UMI USANAGI AI',
      subtitle: 'Selamat Pagi Kak',
      body: [
        '┇👋 Hai welcome saya *Umi Usanagi AI*',
        '│ Name  : Umi Usanagi AI',
        '│ Owner : AlzRiss',
        '│ Status : Owner',
      ].join('\n'),
      footer: 'By AlzRiss - Usanagi Umi AI',
      media,
      buttons: tombolMenu({ prefix: '.', kategori, judulMenu: 'Umi Usanagi AI Menu' }),
    })

    const cek = periksa(isiTombol)
    const teksPesan = `${isiTombol.interactiveMessage.body.text}\n${isiTombol.interactiveMessage.footer.text}`
    const { proto: P2 } = await import('@rexxhayanasi/elaina-baileys')
    const enc = P2.Message.encode(P2.Message.fromObject(isiTombol)).finish()
    const balik = P2.Message.decode(enc)
    const tombolBalik = balik?.interactiveMessage?.nativeFlowMessage?.buttons || []
    const pilih = JSON.parse(tombolBalik.find(t => t.name === 'single_select')?.buttonParamsJson || '{}')

    simpan({
      tombol122: {
        ok: cek.ok,
        masalah: cek.masalah,
        jumlahTombol: tombolBalik.length,
        namaTombol: tombolBalik.map(t => t.name),
        barisTombol: jumlahBaris(bagian),
        jumlahKategori: kategori.length,
        // single_select tidak menyimpan display_text: label tombolnya = params.title
        labelTombol: (isiTombol.interactiveMessage.nativeFlowMessage.buttons || []).map(t => {
          const p = JSON.parse(t.buttonParamsJson || '{}')
          return p.display_text || p.title || t.name
        }),
        idBaris: (pilih.sections?.[0]?.rows || []).map(r => r.id),
        judulBagian: (pilih.sections || []).map(b => b.title),
        adaMenuUtamaDiTeks: /MENU UTAMA/.test(teksPesan),
        adaBarisBernomor: /^\s*\d+[.)]\s/m.test(teksPesan),
        adaFoto: Boolean(balik?.interactiveMessage?.header?.hasMediaAttachment),
        byte: enc.length,
      },
    })
  } catch (error) {
    simpan({ tombol122: { ok: false, error: String(error?.message || error).slice(0, 250) } })
  }

  //── Task124: uji jalur `.ytplay` (cari → unduh sungguhan) ──────
  try {
    const { searchYoutube } = await import('../../lib/scrape/YouTube.js')
    const { downloadYoutube } = await import('../../lib/youtube-media.js')
    const yt = { cari: null, unduh: null }

    const tCari = Date.now()
    let url = ''
    try {
      url = await searchYoutube('alan walker faded')
      yt.cari = { ok: true, url, ms: Date.now() - tCari }
    } catch (error) {
      yt.cari = { ok: false, ms: Date.now() - tCari, error: String(error?.message || error).slice(0, 200) }
    }

    if (url) {
      const tUnduh = Date.now()
      try {
        // Batas 12 MB: cukup membuktikan pipeline menghasilkan berkas video
        // yang benar-benar bisa diputar, tanpa menghabiskan disk/kuota.
        const media = await downloadYoutube(url, { type: 'video', maxBytes: 12 * 1024 * 1024, prefix: 'ujitask124' })
        const fsMod = await import('node:fs')
        const ukuran = fsMod.statSync(media.file).size
        const kepala = fsMod.readFileSync(media.file, { encoding: null, flag: 'r' }).subarray(4, 8).toString('ascii')
        yt.unduh = {
          ok: ukuran > 10240,
          ms: Date.now() - tUnduh,
          provider: media.provider,
          mb: Math.round(ukuran / 104857.6) / 10,
          wadah: kepala,
          percobaanGagal: (media.attempts || []).map(a => `${a.provider}: ${String(a.error).slice(0, 80)}`),
        }
        fsMod.unlinkSync(media.file)
      } catch (error) {
        yt.unduh = { ok: false, ms: Date.now() - tUnduh, error: String(error?.message || error).slice(0, 300) }
      }
    }

    simpan({ ytplay124: yt })
  } catch (error) {
    simpan({ ytplay124: { ok: false, error: String(error?.message || error).slice(0, 250) } })
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
