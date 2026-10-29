/* By AlzRiss - Usanagi Umi AI
 *
 * Task136 — deploy situs ke subdomain dari WhatsApp.
 *
 *   .deploysubdomain <nama>     → bot minta berkas (HTML / zip / tar.gz / kode HTML)
 *   .ceksubdomain [nama]        → status + daftar subdomain & pemiliknya
 *   .kontrol-subdomain <nama>   → tombol kontrol (deploy ulang, nonaktif, hapus)
 *   .subdomainmenu              → menu fitur subdomain
 *
 * Task151 — subdomain milik user:
 *   .addsubdomainmy <nama>      → klaim subdomain sendiri (langsung bisa dipakai)
 *   .kontrolsubdomain [nama]    → kontrol subdomain milik sendiri (developer: semua)
 *   .dellsubdomainmy <nama>     → hapus subdomain — KHUSUS developer/owner bot,
 *                                 user biasa hanya bisa menambah, tidak menghapus
 *
 * Alamat hasil deploy:
 *   https://<nama>-alzriss.gwenna.my.id   (SSL siap — dipakai di semua pesan)
 *   https://<nama>.alzriss.gwenna.my.id   (didaftarkan juga; hidup setelah
 *                                          Total TLS/ACM aktif di Cloudflare)
 *
 * Kalau nama sudah dipakai orang lain → ditolak. Kalau dipakai user yang sama
 * → bot mengirim tombol: "biarkan file lama" atau "deploy ulang".
 */

import {
  bacaKonfig,
  subSiap,
  daftarSubdomain,
  infoSubdomain,
  deploySubdomain,
  hapusSubdomain,
  aturStatusSubdomain,
  namaSubAman,
  siapkanBerkas,
  hostUtama,
  hostTitik,
  bacaRegistry,
  klaimSubdomain,
  subdomainMilik,
  batasPerUser,
  bacaArgumenSitus,
  klaimDomainKustom,
  cekCnameKustom,
  hostCnameKustom,
  situsDariHostKustom,
} from '../../lib/subdomain-kaira.js'
import { sendInteractive } from '../../lib/awang-tombol.js'
import { daftarkanAksi } from '../../lib/pending-aksi.js'
import {
  cekDns,
  panduanDomain,
  kelolaZona,
  pasangCname,
  domainAkar,
  namaFolderDomain,
  domainBot as domainBotSendiri,
} from '../../lib/domain-sendiri.js'
import {
  adaLampiran,
  namaBerkasLampiran,
  captionLampiran,
  tampakHtml,
  unduhLampiran,
} from '../../lib/lampiran.js'
import { simpanRegistry } from '../../lib/subdomain-kaira.js'
import fs from 'fs'
import path from 'path'

/* Menunggu berkas dari user: kunci `${chat}:${pengirim}`.
 * Disimpan juga ke data/subdomain-pending.json supaya status tunggu tidak
 * hilang saat plugin dimuat ulang (hot reload) atau bot restart. */
const TUNGGU = new Map()
const BATAS_TUNGGU = 10 * 60 * 1000
const BERKAS_TUNGGU = path.join(process.cwd(), 'data', 'subdomain-pending.json')

function kunci(m) {
  return `${m.chat}:${m.sender}`
}

function simpanDisk() {
  try {
    const isi = {}
    for (const [k, v] of TUNGGU) isi[k] = v
    fs.mkdirSync(path.dirname(BERKAS_TUNGGU), { recursive: true })
    fs.writeFileSync(BERKAS_TUNGGU, JSON.stringify(isi, null, 2), { mode: 0o600 })
  } catch (error) { }
}

function muatDisk() {
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS_TUNGGU, 'utf8'))
    const sekarang = Date.now()
    for (const [k, v] of Object.entries(isi || {})) {
      if (!v || sekarang - Number(v.waktu || 0) > BATAS_TUNGGU) continue
      if (!TUNGGU.has(k)) TUNGGU.set(k, v)
    }
  } catch (error) { }
}

/* Muat dari disk sekali saja; sesudah itu memori jadi acuan. */
let sudahMuat = false
function muatSekali() {
  if (sudahMuat) return
  sudahMuat = true
  muatDisk()
}

function pasang(m, nama, mode = 'baru') {
  TUNGGU.set(kunci(m), { nama, mode, waktu: Date.now() })
  simpanDisk()
}

function hapus(m) {
  TUNGGU.delete(kunci(m))
  simpanDisk()
}

function ambil(m) {
  muatSekali()
  const data = TUNGGU.get(kunci(m))
  if (!data) return null
  if (Date.now() - Number(data.waktu || 0) > BATAS_TUNGGU) {
    hapus(m)
    return null
  }
  return data
}

/** Domain dasar bot (mis. alzriss.gwenna.my.id) untuk teks bantuan. */
function domainBot() {
  return String(hostUtama('contoh')).replace(/^contoh-/, '')
}

function belumSiap() {
  return [
    '⚙️ *Fitur subdomain belum aktif di bot ini.*',
    '',
    'Berkas `data/subdomain-kaira.json` belum diisi (panelUrl, apiKey, serverId).',
  ].join('\n')
}

function rupiahBita(n) {
  const angka = Number(n || 0)
  if (angka >= 1024 * 1024) return `${(angka / 1024 / 1024).toFixed(2)} MB`
  if (angka >= 1024) return `${(angka / 1024).toFixed(1)} KB`
  return `${angka} B`
}

function waktuID(ms) {
  if (!ms) return '-'
  return new Date(ms).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'medium', timeStyle: 'short' }) + ' WITA'
}

const namaPemilik = (info, m) => {
  const nomor = String(info?.pemilik || '').split('@')[0]
  const saya = String(m.sender || '').split('@')[0]
  if (!nomor) return 'tidak tercatat'
  return nomor === saya ? `${nomor} (kamu)` : `+${nomor}`
}

function kartuSub(item) {
  const aktif = !item.status || item.status === 'aktif'
  return [
    `🌐 *${item.nama}*`,
    `Status : ${aktif ? '🟢 aktif' : '🔴 ' + item.status}`,
    `Pemilik: ${item.pemilik ? '+' + String(item.pemilik).split('@')[0] : '-'}`,
    `Berkas : ${item.berkas || 0} · ${rupiahBita(item.ukuran)}`,
    `Deploy : ke-${item.deployKe || 1} · ${waktuID(item.diperbarui)}`,
    `URL    : https://${hostUtama(item.nama)}/`,
  ].join('\n')
}

/* ── Task156: domain sendiri ───────────────────────────────────────────── */

const NOMOR_OWNER = '6287813709432'

function angkaNomor(nilai) {
  return String(nilai || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function sayaOwner(m) {
  const saya = angkaNomor(m && m.sender)
  const daftar = Array.isArray(global.owner) ? global.owner : []
  if (daftar.some((x) => angkaNomor(Array.isArray(x) ? x[0] : x) === saya)) return true
  return saya === NOMOR_OWNER
}

/** Cari entri registry untuk sebuah domain kustom. */
async function entriDomain(domain) {
  const target = String(domain || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  const registry = await bacaRegistry().catch(() => ({}))
  for (const [nama, info] of Object.entries(registry || {})) {
    if (String((info && info.domainKustom) || '').toLowerCase() === target) return { nama, info, registry }
  }
  return { nama: '', info: null, registry }
}

/** Simpan perubahan satu entri domain kustom. */
async function perbaruiEntri(nama, ubahan) {
  const registry = await bacaRegistry().catch(() => ({}))
  if (!registry[nama]) return null
  registry[nama] = { ...registry[nama], ...ubahan }
  await simpanRegistry(registry)
  return registry[nama]
}

/** Ringkas hasil cekDns jadi beberapa baris untuk WhatsApp. */
function ringkasDns(cek) {
  if (!cek) return ['DNS  : belum bisa diperiksa']
  const ns = cek.ns && cek.ns.length
    ? (cek.pakaiCloudflare ? `Cloudflare (${cek.ns.slice(0, 2).join(', ')})` : cek.ns.slice(0, 2).join(', '))
    : 'belum ada'
  const baris = [
    `NS   : ${ns}`,
    `CNAME: ${cek.cname && cek.cname.length ? cek.cname.join(', ') : '-'}`,
    `A    : ${cek.a && cek.a.length ? cek.a.slice(0, 2).join(', ') : '-'}`,
    `HTTP : ${cek.statusHttp ? cek.statusHttp : 'tidak merespons'}${cek.botMelayani ? ' · dilayani bot ✅' : ''}`,
  ]
  return baris
}

/** Label status domain untuk pesan. */
function labelStatus(cek) {
  if (!cek) return '❔ belum diperiksa'
  if (cek.hidup) return '🟢 HIDUP — sudah dilayani bot'
  if (cek.status === 'hidup-lain') return '🟡 merespons, tapi bukan dari bot'
  if (cek.pakaiCloudflare) return '🟡 NS Cloudflare, belum tersambung ke bot'
  return '🔴 belum tersambung'
}

/** Pesan singkat ke owner bot (tidak fatal kalau gagal). */
async function kabariOwner(conn, teks) {
  try {
    const tujuan = NOMOR_OWNER + '@s.whatsapp.net'
    if (conn && typeof conn.sendMessage === 'function') {
      await conn.sendMessage(tujuan, { text: teks })
      return true
    }
    return false
  } catch (error) {
    return false
  }
}

/**
 * Sambungkan domain user sejauh yang bisa dilakukan bot sekarang:
 * cek DNS → (kalau zona tersedia) tulis CNAME → simpan status.
 */
async function sambungkanDomain(domain, opsi = {}) {
  const host = String(domain || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  const { nama, info } = await entriDomain(host)
  let zona = null
  let ditulis = null
  let galatTulis = ''

  /* Zona dicari/dibuat kalau bot punya izin; kalau tidak, dilewati. */
  try {
    zona = await kelolaZona(host)
  } catch (error) {
    zona = { bisa: false, alasan: error.message }
  }
  if (zona && zona.bisa && zona.zonaId) {
    try {
      ditulis = await pasangCname(host, zona.zonaId)
    } catch (error) {
      galatTulis = error.message
    }
  }

  const cek = await cekDns(host).catch(() => null)

  if (nama) {
    await perbaruiEntri(nama, {
      hidup: Boolean(cek && cek.hidup),
      dnsSiap: Boolean(cek && cek.hidup),
      cekTerakhir: Date.now(),
      ns: (zona && zona.ns) || (info && info.ns) || [],
      zonaId: (zona && zona.zonaId) || (info && info.zonaId) || '',
      statusHttp: cek ? cek.statusHttp : 0,
      dnsRingkas: cek ? {
        ns: cek.ns,
        cname: cek.cname,
        a: cek.a,
        statusHttp: cek.statusHttp,
        botMelayani: cek.botMelayani,
        status: cek.status,
      } : null,
    })
  }

  return { host, nama, info, zona, ditulis, galatTulis, cek }
}

async function kirimTombolKontrol(m, conn, item, bolehHapus = false) {
  const aktif = !item.status || item.status === 'aktif'
  const isi = kartuSub(item)
  const rows = [
    { title: '🔄 Deploy ulang', description: 'Kirim berkas baru untuk subdomain ini', command: `.deploysubdomain ${item.nama} ganti` },
    { title: aktif ? '⏸️ Nonaktifkan' : '▶️ Aktifkan', description: aktif ? 'Situs ditutup sementara' : 'Situs dibuka kembali', command: aktif ? `.nonaktifsubdomain ${item.nama}` : `.aktifsubdomain ${item.nama}` },
    { title: '📊 Info lengkap', description: 'Detail situs + waktu', command: `.ceksubdomain ${item.nama}` },
  ]
  if (bolehHapus) {
    rows.push({ title: '🗑️ Hapus subdomain', description: 'Folder + DNS dihapus permanen', command: `.dellsubdomainmy ${item.nama} hapus` })
  }
  try {
    return await sendInteractive(conn, m.chat, {
      title: `🌐 KONTROL ${item.nama.toUpperCase()}`,
      subtitle: `https://${hostUtama(item.nama)}/`,
      body: isi,
      footer: 'Pilih aksi di bawah.',
      list: { listTitle: 'Aksi subdomain', sections: [{ title: 'KONTROL', rows }] },
    }, { quoted: m.raw || m })
  } catch (error) {
    return m.reply([isi, '', 'Aksi:', ...rows.map((r) => `• ${r.title} → ${r.command}`)].join('\n'))
  }
}

let handler = async (m, extra = {}) => {
  const { conn, args = [], command = '', text = '' } = extra
  if (!subSiap()) return m.reply(belumSiap())

  if (command === 'subdomainmenu' || command === 'menu_subdomain') {
    const jumlah = (await daftarSubdomain().catch(() => [])).length
    return m.reply([
      '🌐 *SUB DOMAIN DEPLOY*',
      '',
      `Subdomain aktif: *${jumlah}*`,
      '',
      '*Perintah*',
      '.addsubdomain <nama> — subdomain di domain bot (langsung hidup)',
      '.addsubdomain <domain> — domain sendiri, mis. alzriss.my.id',
      '.cekdns <domain> — cek NS/CNAME + apakah situsnya sudah hidup',
      '.bantudomain <domain> — arahan lengkap per registrar',
      '.nszone <domain> <ns1> <ns2> — owner: simpan NS hasil tambah zona',
      '.deploysubdomain <nama> — isi situs (HTML / zip / tar.gz)',
      '.kontrolsubdomain [nama] — kontrol subdomain milikmu',
      '.ceksubdomain [nama] — daftar & detail subdomain',
      '.aktifsubdomain <nama> · .nonaktifsubdomain <nama>',
      '.dellsubdomainmy <nama> — hapus subdomain (khusus developer)',
      '.bataldeploy — batalkan deploy yang menunggu berkas',
      '.subdomainmenu — menu ini',
      '',
      '*Dua cara daftar*',
      '1. Nama di domain bot → `.addsubdomain toko-budi`',
      `   hasil: https://toko-budi-${domainBot()}`,
      '2. Domain sendiri → `.addsubdomain kaeira.my.id`',
      '   situs hidup dulu di alamat bot, lalu disambungkan',
      '   ke domainmu lewat nameserver Cloudflare (bot beri langkahnya)',
      '',
      '*Aturan*',
      '• Semua user boleh menambah subdomain sendiri.',
      '• Menghapus subdomain hanya developer/owner bot.',
      `• Batas ${batasPerUser()} situs per nomor.`,
      '',
      '*Cara deploy*',
      '1. Ketik `.deploysubdomain nama`',
      '2. Balas dengan salah satu:',
      '   • berkas .html',
      '   • berkas .zip / .tar.gz (wajib ada index.html)',
      '   • kode HTML langsung di chat',
      '',
      `Contoh hasil: https://${hostUtama('contoh')}/`,
    ].join('\n'))
  }

  if (command === 'deploysubdomain' || command === 'deploysite') {
    const argDeploy = bacaArgumenSitus(args[0] || '')
    const nama = argDeploy.jenis === 'kustom'
      ? (situsDariHostKustom(argDeploy.domain) || '')
      : (argDeploy.jenis === 'nama' ? argDeploy.nama : '')
    const mode = /ganti|redeploy|ulang/i.test(String(args[1] || '')) ? 'ganti' : 'baru'
    if (!nama) {
      return m.reply([
        'Pakai: *.deploysubdomain <nama>*',
        'Domain sendiri juga bisa: `.deploysubdomain kaeira.my.id ganti`',
        argDeploy.jenis === 'kustom'
          ? `⚠️ Domain ${argDeploy.domain} belum terdaftar. Daftarkan dulu: .addsubdomain ${argDeploy.domain}`
          : '',
        '',
        'Aturan nama: 3–30 huruf kecil/angka/tanda hubung, tidak boleh angka saja.',
        `Hasil: https://<nama>-alzriss.gwenna.my.id`,
      ].join('\n'))
    }

    const info = await infoSubdomain(nama)
    if (info) {
      const pemilikSaya = String(info.pemilik || '').split('@')[0] === String(m.sender || '').split('@')[0]
      if (!pemilikSaya) {
        return m.reply(`❌ Subdomain *${nama}* sudah dipakai ${namaPemilik(info, m)}.\nCoba nama lain.`)
      }
      if (mode !== 'ganti') {
        /* Tanya dulu: file lama dibiarkan atau di-redeploy. */
        const isi = [kartuSub(info), '', 'Subdomain ini punyamu. Mau bagaimana?'].join('\n')
        try {
          return await sendInteractive(conn, m.chat, {
            title: '🌐 SUBDOMAIN SUDAH ADA',
            subtitle: `https://${hostUtama(nama)}/`,
            body: isi,
            footer: 'Pilih salah satu.',
            buttons: [
              { type: 'noop', label: '📦 Deploy ulang', command: `.deploysubdomain ${nama} ganti` },
              { type: 'noop', label: '✅ Biarkan file lama', command: `.kontrol-subdomain ${nama}` },
            ],
          }, { quoted: m.raw || m })
        } catch (error) {
          return m.reply([isi, '', `• Deploy ulang → .deploysubdomain ${nama} ganti`, `• Biarkan file lama → .ceksubdomain ${nama}`].join('\n'))
        }
      }
    }

    /* Kalau berkasnya ikut di pesan yang sama (dokumen + caption perintah),
     * langsung diproses tanpa perlu kirim ulang. */
    if (adaLampiran(m)) return prosesTunggu(conn, m, { nama, mode, waktu: Date.now() })

    pasang(m, nama, mode)
    return m.reply([
      `🌐 Siap deploy ke *${hostUtama(nama)}*`,
      '',
      'Sekarang *balas pesan ini* dengan salah satu:',
      '• berkas *.html*',
      '• berkas *.zip* / *.tar.gz* (ada index.html di akar)',
      '• atau tempel kode HTML langsung',
      '',
      `⏳ Menunggu maksimal 10 menit. Batal: .bataldeploy`,
    ].join('\n'))
  }

  if (command === 'bataldeploy') {
    TUNGGU.delete(kunci(m))
    return m.reply('✅ Deploy dibatalkan.')
  }

  if (command === 'ceksubdomain' || command === 'listubdomain' || command === 'statussubdomain') {
    const target = args[0] ? namaSubAman(args[0]) : ''
    if (target) {
      const info = await infoSubdomain(target)
      if (!info) return m.reply(`Subdomain *${target}* belum terdaftar.`)
      return m.reply([
        kartuSub({ nama: target, ...info }),
        '',
        `URL cadangan: https://${hostTitik(target)}/`,
        `DNS: CNAME → tunnel`,
      ].join('\n'))
    }
    const daftar = await daftarSubdomain()
    if (!daftar.length) {
      return m.reply(['🌐 *Belum ada subdomain yang dipakai.*', '', 'Deploy pertama: *.deploysubdomain <nama>*'].join('\n'))
    }
    const baris = daftar.map((x, i) => {
      const aktif = !x.status || x.status === 'aktif'
      return `${i + 1}. *${x.nama}* ${aktif ? '🟢' : '🔴'} — +${String(x.pemilik || '-').split('@')[0]} · ${x.berkas || 0} berkas`
    })
    return m.reply([
      `🌐 *Subdomain terpakai* (${daftar.length})`,
      '',
      ...baris,
      '',
      'Detail: .ceksubdomain <nama>',
    ].join('\n'))
  }

  if (command === 'addsubdomainmy' || command === 'tambahsubdomain' || command === 'addsubdomain') {
    const arg = bacaArgumenSitus(args[0] || '')

    /* Tanpa argumen atau argumen salah → tutorial lengkap. */
    if (arg.jenis === 'salah') {
      const registry = await bacaRegistry().catch(() => ({}))
      const milik = subdomainMilik(registry, m.sender)
      const baris = [
        '🌐 *TAMBAH SUBDOMAIN / DOMAIN SENDIRI*',
        arg.alasan ? `❌ ${arg.alasan}` : '',
        '',
        '*DUA CARA — pilih sesuai yang kamu punya*',
        '',
        '1️⃣ *Nama di domain bot* (langsung hidup, gratis)',
        '   `.addsubdomain toko-budi`',
        `   → https://toko-budi-${domainBot()}/`,
        '   `.addsubdomain cloud.id` tidak perlu — cukup namanya saja,',
        '   mis. `.addsubdomain cloud` → cloud-' + domainBot(),
        '   • 3–30 huruf kecil/angka/tanda hubung',
        '   • tidak boleh angka saja',
        '   • bukan nama populer: www, api, admin, mail, ftp, jadibot',
        '',
        '2️⃣ *Domain milikmu sendiri* (mis. alzriss.my.id, cloud.id, volty.com)',
        '   `.addsubdomain alzriss.my.id`',
        '   `.addsubdomain blog.kaeira.my.id`',
        '   → situsnya LANGSUNG hidup di alamat bot,',
        '     lalu disambungkan ke domainmu (bot beri langkahnya)',
        '   • butuh ganti nameserver domain ke Cloudflare (1 kali)',
        '   • setelah itu bot urus DNS + SSL otomatis',
        '',
        `📊 Kuota: ${milik.length}/${batasPerUser()} per nomor`,
        milik.length ? `Milikmu: ${milik.join(', ')}` : 'Kamu belum punya subdomain.',
        '',
        'Setelah terdaftar, isi situsnya:',
        '1. `.deploysubdomain <nama> ganti`',
        '2. balas berkas .html / .zip (wajib ada index.html)',
        '',
        'Bantuan: `.subdomainmenu` · domain sendiri: `.bantudomain kaeira.my.id`',
      ].filter((x) => x !== false && x !== null && x !== undefined)
      return m.reply(baris.join('\n'))
    }

    /* ── domain kustom milik user (Task156) ───────────────────────────── */
    if (arg.jenis === 'kustom') {
      let hasil
      try {
        hasil = await klaimDomainKustom({
          domain: arg.domain,
          pemilik: String(m.sender || ''),
          judul: String(m.pushName || '').slice(0, 40),
        })
      } catch (error) {
        return m.reply([
          `❌ ${error.message}`,
          '',
          '*Cara pakai domain sendiri*',
          '`.addsubdomain kaeira.my.id`',
          '`.addsubdomain blog.kaeira.my.id`',
          '',
          'Kalau tidak punya domain, pakai nama di domain bot (langsung hidup):',
          '`.addsubdomain toko-budi`',
          `→ https://toko-budi-${domainBot()}/`,
          '',
          `Arahan lengkap: .bantudomain ${arg.domain}`,
        ].join('\n'))
      }

      /* Cek DNS + sambungkan sejauh yang bisa dilakukan bot (zona/CNAME). */
      const sambung = await sambungkanDomain(hasil.domainKustom, { pemilik: m.sender })
      const cek = sambung.cek
      const ns = (sambung.zona && sambung.zona.ns) || []
      const akar = domainAkar(hasil.domainKustom)
      const alamatBot = hasil.alamatBot || `https://${hostUtama(hasil.nama)}/`

      const baris = [
        '✅ *DOMAIN TERDAFTAR*',
        '',
        '*Situsmu sudah hidup sekarang di alamat bot:*',
        `🌐 ${alamatBot}`,
        '   (isi situsnya sama persis dengan domainmu nanti)',
        '',
        `🔗 Domain sendiri: https://${hasil.domainKustom}/`,
        `📊 Status: ${labelStatus(cek)}`,
        ...ringkasDns(cek).map((x) => `   ${x}`),
        '',
      ]

      if (cek && cek.hidup) {
        baris.push('🎉 *Domainmu sudah tersambung!* Situsnya sudah dilayani bot ini.')
      } else if (ns.length) {
        baris.push('*SATU LANGKAH LAGI — ganti nameserver di registrar*')
        baris.push('1. Buka panel tempat kamu beli domain (registrar).')
        baris.push('2. Cari menu *Nameserver* / *DNS* / *Custom DNS*.')
        baris.push('3. Ganti nameserver domain menjadi:')
        for (const n of ns) baris.push(`     • ${n}`)
        baris.push('4. Simpan. Propagasi 1–24 jam (biasanya < 2 jam).')
        baris.push(`5. Cek berkala: .cekdns ${hasil.domainKustom}`)
        baris.push('   Bot otomatis membuat DNS + sertifikat SSL begitu NS aktif.')
      } else {
        baris.push('⚠️ *Penyambungan otomatis belum aktif di bot ini.*')
        baris.push(`Domain akar *${akar}* harus dititipkan ke akun Cloudflare bot`)
        baris.push('(cukup ganti nameserver di registrar). Permintaanmu sudah')
        baris.push('diteruskan ke owner bot dan akan dibalas begitu zona siap.')
        baris.push('')
        baris.push('Sementara itu pakai alamat bot di atas — sudah bisa dibuka,')
        baris.push('diisi, dan dibagikan sekarang juga.')
        if (sambung.zona && sambung.zona.alasan && sayaOwner(m)) {
          baris.push('')
          baris.push(`Catatan teknis (owner): ${String(sambung.zona.alasan).slice(0, 140)}`)
          baris.push(`   → selesaikan dengan .nszone ${hasil.domainKustom} NS1 NS2`)
        }
      }

      baris.push('')
      baris.push('*Isi situsnya*')
      baris.push(`   .deploysubdomain ${hasil.nama} ganti`)
      baris.push('   lalu balas berkas .html atau .zip (wajib ada index.html).')
      baris.push('')
      baris.push(`⚙️ Kontrol: .kontrolsubdomain ${hasil.nama}`)
      baris.push(`📖 Arahan lengkap: .bantudomain ${hasil.domainKustom}`)

      /* Owner dikabari supaya bisa menyelesaikan sisi Cloudflare. */
      if (!(cek && cek.hidup) && !ns.length) {
        const terkirim = await kabariOwner(conn, [
          '🌐 *PERMINTAAN DOMAIN BARU*',
          '',
          `Domain : ${hasil.domainKustom}`,
          `Akar   : ${akar}`,
          `Pemilik: +${angkaNomor(m.sender)}`,
          `Folder : situs/${hasil.nama}`,
          '',
          'Sambung otomatis GAGAL (token Cloudflare bot belum boleh membuat zona).',
          'Penyelesaian 1 menit:',
          '1. Cloudflare dashboard → Add a site → masukkan domain akar di atas.',
          '2. Copy dua nameserver yang diberikan Cloudflare.',
          `3. Kirim ke bot: .nszone ${hasil.domainKustom} NS1 NS2`,
          '',
          'Atau beri token Cloudflare dengan izin Zone:Create agar bot',
          'mengerjakannya sendiri (tanpa langkah manual ini).',
        ].join('\n'))

        if (!terkirim) baris.push('', '(Owner belum bisa dikabari lewat WhatsApp — kabari manual ya.)')
      }

      return m.reply(baris.join('\n'))
    }

    /* ── nama di domain bot ───────────────────────────────────────────── */
    let hasil
    try {
      hasil = await klaimSubdomain({
        nama: arg.nama,
        pemilik: String(m.sender || ''),
        judul: String(m.pushName || '').slice(0, 40),
      })
    } catch (error) {
      return m.reply(`❌ ${error.message}\n\nLihat cara pakai: .addsubdomain`)
    }

    /* Berkas ikut di pesan yang sama → langsung di-deploy. */
    if (adaLampiran(m) || tampakHtml(captionLampiran(m) || '')) {
      return prosesTunggu(conn, m, { nama: hasil.nama, mode: 'ganti', waktu: Date.now() })
    }

    const registry = await bacaRegistry().catch(() => ({}))
    const milik = subdomainMilik(registry, m.sender)
    const baris = [
      '✅ *SUBDOMAIN BERHASIL DIBUAT*',
      '',
      `🌐 ${hasil.url}`,
      `🔗 ${hasil.urlTitik}  (aktif setelah SSL Total TLS)`,
      `👤 Pemilik: +${String(m.sender || '').split('@')[0]}`,
      `📊 Kuota: ${milik.length}/${batasPerUser()}`,
      '',
      '*Langkah berikutnya*',
      '1. Ketik *.deploysubdomain ' + hasil.nama + ' ganti*',
      '2. Balas berkas *.html* / *.zip* (wajib ada index.html)',
      '   atau tempel kode HTML langsung',
      '',
      `⚙️ Kontrol: *.kontrolsubdomain ${hasil.nama}*`,
      '🗑️ Hapus: hanya developer (`.dellsubdomainmy`)',
      '',
      'DNS alamat baru butuh ±10 detik–2 menit sebelum terbuka.',
      '',
      '*Punya domain sendiri?* (alzriss.my.id / cloud.id / volty.com)',
      '   `.addsubdomain kaeira.my.id` → bot sambungkan otomatis',
    ]
    if (hasil.panelGalat) {
      baris.push('', `⚠️ Panel situs sedang gangguan (${hasil.panelGalat}).`, 'Subdomain sudah tercatat, halaman awal menyusul saat panel normal.')
    }
    return m.reply(baris.join('\n'))
  }

  /* ── Task156: cek DNS domain sendiri ─────────────────────────────── */
  if (command === 'cekdns' || command === 'cekcname' || command === 'cekdomain') {
    const masukan = String(args[0] || '').trim()
    const argCek = bacaArgumenSitus(masukan)
    if (argCek.jenis === 'salah' || !masukan.includes('.')) {
      return m.reply([
        '🔍 *CEK DOMAIN*',
        '',
        'Pakai: *.cekdns domainmu.com*',
        'Contoh: `.cekdns kaeira.my.id`',
        '',
        'Bot memeriksa: NS, CNAME, A, dan apakah halamannya',
        'benar-benar dilayani bot ini.',
      ].join('\n'))
    }
    const domain = argCek.jenis === 'kustom' ? argCek.domain : masukan.toLowerCase()
    await m.reply(`🔎 Memeriksa *${domain}* …`).catch(() => { })
    const sambung = await sambungkanDomain(domain)
    const cek = sambung.cek
    const baris = [
      `🔍 *HASIL CEK ${domain}*`,
      '',
      `Status: ${labelStatus(cek)}`,
      ...ringkasDns(cek),
      '',
    ]
    if (cek && cek.hidup) {
      baris.push('✅ Situs sudah dilayani bot ini.')
      if (sambung.nama) {
        baris.push('')
        baris.push(`📁 Folder: situs/${sambung.nama}`)
        baris.push(`📖 Ganti isi: .deploysubdomain ${sambung.nama} ganti`)
      }
    } else if (cek && cek.saran && cek.saran.length) {
      baris.push('💡 ' + cek.saran.join('\n💡 '))
    }
    if (!sambung.nama) {
      baris.push('')
      baris.push('⚠️ Domain ini belum terdaftar di bot.')
      baris.push(`Daftarkan: .addsubdomain ${domain}`)
    }
    return m.reply(baris.join('\n'))
  }

  /* ── Task156: arahan lengkap penyambungan domain ─────────────────── */
  if (command === 'bantudomain' || command === 'panduandomain' || command === 'caradomain') {
    const masukan = String(args[0] || '').trim()
    const argBantu = bacaArgumenSitus(masukan)
    if (argBantu.jenis !== 'kustom') {
      return m.reply([
        '📖 *ARAHAN DOMAIN SENDIRI*',
        '',
        'Pakai: *.bantudomain domainmu.com*',
        'Contoh: `.bantudomain kaeira.my.id`',
        '',
        '*Bedanya dengan subdomain bot*',
        '• `.addsubdomain toko` → langsung hidup di',
        `  https://toko-${domainBot()}/`,
        '• `.addsubdomain kaeira.my.id` → domain milikmu sendiri,',
        '  butuh ganti nameserver ke Cloudflare bot (dijelaskan bot).',
      ].join('\n'))
    }
    const { info } = await entriDomain(argBantu.domain)
    const zona = info && info.zonaId ? { bisa: true, zonaId: info.zonaId, ns: info.ns || [] } : null
    const teks = panduanDomain(argBantu.domain, {
      ns: (zona && zona.ns) || (info && info.ns) || [],
      target: hostCnameKustom(),
    })
    return m.reply(teks)
  }

  /* ── Task156: owner menyimpan nameserver hasil penambahan zona ───── */
  if (command === 'nszone' || command === 'setns') {
    if (!sayaOwner(m)) return m.reply('❌ Fitur ini khusus owner bot.')
    const masukan = String(args[0] || '').trim()
    const argNs = bacaArgumenSitus(masukan)
    const domain = argNs.jenis === 'kustom' ? argNs.domain : ''
    const ns = args.slice(1).map((x) => String(x || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/\.$/, '')).filter((x) => x.includes('.'))
    if (!domain || !ns.length) {
      return m.reply([
        '🛠️ *SIMPAN NAMESERVER DOMAIN*',
        '',
        'Pakai: *.nszone <domain> <ns1> <ns2>*',
        'Contoh: `.nszone kaeira.my.id ada.ns.cloudflare.com bob.ns.cloudflare.com`',
        '',
        'Dipakai setelah domain user ditambahkan ke akun Cloudflare bot.',
        'Bot lalu memeriksa NS, membuat CNAME ke tunnel, dan mengabari user.',
      ].join('\n'))
    }
    const { nama, info } = await entriDomain(domain)
    if (!nama) return m.reply(`⚠️ Domain *${domain}* belum didaftarkan user. Minta user menjalankan .addsubdomain ${domain} dulu.`)
    await perbaruiEntri(nama, { ns, zonaId: (info && info.zonaId) || '', nsDiisi: Date.now() })
    const sambung = await sambungkanDomain(domain)
    const cek = sambung.cek
    return m.reply([
      `✅ NS untuk *${domain}* disimpan.`,
      `Status sekarang: ${labelStatus(cek)}`,
      ...ringkasDns(cek),
      '',
      'Kalau NS belum aktif, ulangi cek nanti:',
      `   .cekdns ${domain}`,
    ].join('\n'))
  }

  /* ── Task156: owner melihat domain yang menunggu penyambungan ────── */
  if (command === 'domainpending' || command === 'domaintunggu') {
    if (!sayaOwner(m)) return m.reply('❌ Fitur ini khusus owner bot.')
    const daftar = (await daftarSubdomain().catch(() => [])).filter((x) => x.domainKustom)
    if (!daftar.length) return m.reply('🌐 Belum ada domain sendiri yang didaftarkan user.')
    const menunggu = daftar.filter((x) => !x.hidup)
    const siap = daftar.filter((x) => x.hidup)
    const baris = [`🌐 *DOMAIN SENDIRI* (${daftar.length})`, '']
    if (menunggu.length) {
      baris.push(`*Menunggu penyambungan (${menunggu.length})*`)
      for (const x of menunggu) {
        baris.push(`• ${x.domainKustom} — +${String(x.pemilik || '-').split('@')[0]}`)
        baris.push(`   akar: ${domainAkar(x.domainKustom)}`)
        baris.push(`   NS penyedia: ${(x.ns && x.ns.length) ? x.ns.join(', ') : 'belum diisi (.nszone)'}`)
        baris.push(`   folder: situs/${x.nama}`)
      }
      baris.push('')
      baris.push('Selesaikan:')
      baris.push('1. Cloudflare → Add a site → masukkan domain akar')
      baris.push('2. `.nszone <domain> <ns1> <ns2>` (nameserver dari Cloudflare)')
      baris.push('3. Minta user ganti NS di registrar, lalu `.cekdns <domain>`')
    }
    if (siap.length) {
      baris.push('', `*Sudah hidup (${siap.length})*`)
      for (const x of siap) baris.push(`• ${x.domainKustom} ✅`)
    }
    return m.reply(baris.join('\n'))
  }

  if (command === 'dellsubdomainmy' || command === 'delsubdomainmy' || command === 'hapussubdomainmy') {
    const nama = namaSubAman(args[0] || '')
    const admin = Boolean(extra.isOwner || extra.isROwner)

    if (!nama) return m.reply('Pakai: *.dellsubdomainmy <nama>*')

    const info = await infoSubdomain(nama).catch(() => null)
    if (!info) return m.reply(`Subdomain *${nama}* belum terdaftar.`)

    if (!admin) {
      return m.reply([
        '🔒 *Subdomain tidak bisa dihapus sendiri.*',
        '',
        `Subdomain *${nama}* terdaftar atas ${namaPemilik(info, m)}.`,
        'Sesuai aturan: user boleh *menambah* subdomain, tetapi *tidak bisa menghapusnya*.',
        'Penghapusan hanya bisa dilakukan developer / owner bot.',
        '',
        `Minta hapus ke owner: wa.me/6287813709432?text=${encodeURIComponent(`Hapus subdomain ${nama}`)}`,
      ].join('\n'))
    }

    if (!/hapus|yes|ya/i.test(String(args[1] || ''))) {
      return m.reply([
        `⚠️ Hapus *${nama}* permanen?`,
        `Folder situs + DNS akan dihapus.`,
        '',
        `Ketik: *.dellsubdomainmy ${nama} hapus*`,
      ].join('\n'))
    }

    const hasil = await hapusSubdomain(nama)
    return m.reply(`🗑️ Subdomain *${hasil.nama}* dihapus beserta berkas & DNS-nya.`)
  }

  if (command === 'kontrol-subdomain' || command === 'kontrolsubdomain') {
    const admin = Boolean(extra.isOwner || extra.isROwner)
    const argKontrol = bacaArgumenSitus(args[0] || '')
    const nama = argKontrol.jenis === 'kustom'
      ? (situsDariHostKustom(argKontrol.domain) || argKontrol.nama)
      : (argKontrol.jenis === 'nama' ? argKontrol.nama : '')

    if (!nama) {
      const registry = await bacaRegistry().catch(() => ({}))
      const milik = subdomainMilik(registry, m.sender)
      const semua = Object.keys(registry).sort()
      if (!semua.length) {
        return m.reply(['🌐 Belum ada subdomain.', '', 'Daftarkan milikmu: *.addsubdomainmy <nama>*'].join('\n'))
      }
      const baris = ['🌐 *KONTROL SUBDOMAIN*', '']
      if (milik.length) {
        baris.push(`*Milikmu* (${milik.length}/${batasPerUser()})`)
        for (const item of milik) {
          const info = registry[item] || {}
          const aktif = !info.status || info.status === 'aktif'
          baris.push(`• ${item} ${aktif ? '🟢' : '🔴'} — https://${hostUtama(item)}/`)
        }
        baris.push('', 'Buka panel: *.kontrolsubdomain <nama>*')
      } else {
        baris.push('Kamu belum punya subdomain.')
        baris.push('Daftarkan: *.addsubdomainmy <nama>*')
      }
      if (admin) {
        baris.push('', `*Semua subdomain* (${semua.length})`)
        for (const item of semua.slice(0, 25)) {
          const info = registry[item] || {}
          const aktif = !info.status || info.status === 'aktif'
          baris.push(`• ${item} ${aktif ? '🟢' : '🔴'} — +${String(info.pemilik || '-').split('@')[0]}`)
        }
        if (semua.length > 25) baris.push(`… dan ${semua.length - 25} lainnya`)
        baris.push('', 'Developer bisa menghapus: *.dellsubdomainmy <nama> hapus*')
      }
      return m.reply(baris.join('\n'))
    }

    const info = await infoSubdomain(nama)
    if (!info) return m.reply(`Subdomain *${nama}* belum terdaftar.\nDaftarkan milikmu: *.addsubdomainmy ${nama}*`)
    const pemilikSaya = String(info.pemilik || '').split('@')[0] === String(m.sender || '').split('@')[0]
    if (!pemilikSaya && !admin) {
      return m.reply(`❌ Subdomain ini milik ${namaPemilik(info, m)}.\nKamu hanya bisa mengontrol subdomain milik sendiri.`)
    }
    return kirimTombolKontrol(m, conn, { nama, ...info }, admin)
  }

  if (command === 'aktifsubdomain' || command === 'nonaktifsubdomain') {
    const nama = namaSubAman(args[0] || '')
    if (!nama) return m.reply(`Pakai: .${command} <nama>`)
    const info = await infoSubdomain(nama)
    if (!info) return m.reply(`Subdomain *${nama}* belum terdaftar.`)
    const pemilikSaya = String(info.pemilik || '').split('@')[0] === String(m.sender || '').split('@')[0]
    if (!pemilikSaya && !extra.isOwner && !extra.isROwner) return m.reply('❌ Bukan subdomainmu.')
    const hasil = await aturStatusSubdomain(nama, command === 'aktifsubdomain' ? 'aktif' : 'nonaktif')
    return m.reply(hasil.status === 'aktif'
      ? `▶️ *${nama}* diaktifkan lagi: https://${hostUtama(nama)}/`
      : `⏸️ *${nama}* dinonaktifkan. Situs menampilkan pesan "sedang nonaktif".`)
  }

  if (command === 'hapussubdomain' || command === 'delsubdomain') {
    const nama = namaSubAman(args[0] || '')
    if (!nama) return m.reply('Pakai: .dellsubdomainmy <nama> hapus')
    if (!(extra.isOwner || extra.isROwner)) {
      return m.reply([
        '🔒 *Hapus subdomain hanya untuk developer / owner bot.*',
        '',
        'User boleh menambah subdomain, tetapi tidak bisa menghapusnya.',
        'Minta hapus ke owner: wa.me/6287813709432',
      ].join('\n'))
    }
    const info = await infoSubdomain(nama)
    if (!info) return m.reply(`Subdomain *${nama}* belum terdaftar.`)
    if (!/hapus|yes|ya/i.test(String(args[1] || ''))) {
      return m.reply(`⚠️ Hapus *${nama}* permanen?\nKetik: *.hapussubdomain ${nama} hapus*`)
    }
    const hasil = await hapusSubdomain(nama)
    return m.reply(`🗑️ Subdomain *${hasil.nama}* dihapus beserta berkas & DNS-nya.`)
  }
}

/**
 * Proses kiriman user selagi menunggu deploy.
 * Dipanggil dari dua jalur:
 *   1. handler.js lewat registry aksi tertunda (jalur utama — termasuk chat
 *      pribadi tanpa prefix, yang dulu membuat bot diam total)
 *   2. hook `handler.all` (cadangan untuk grup)
 */
/** Ringkasan status DNS untuk pesan hasil deploy (tanpa detail teknis). */
function dnsBermasalah(daftar) {
  if (!Array.isArray(daftar) || !daftar.length) return ''
  const gagal = daftar.filter((x) => x && x.galat)
  if (!gagal.length) return '🛰️ DNS: siap'
  return `⚠️ DNS bermasalah: ${gagal.map((x) => `${x.host} (${x.galat})`).join('; ')} — coba deploy ulang atau hubungi owner.`
}

async function prosesTunggu(conn, m, tunggu) {
  const teks = captionLampiran(m) || String(m.text || '')
  const berkasAda = adaLampiran(m)
  if (!berkasAda && !tampakHtml(teks)) return false

  hapus(m)
  await m.reply(`⏳ Menerima berkas... mengunggah ke *${hostUtama(tunggu.nama)}*`).catch(() => { })

  try {
    let buffer = null
    let nama = ''
    if (berkasAda) {
      buffer = await unduhLampiran(conn, m)
      nama = namaBerkasLampiran(m)
      if (!buffer) throw new Error('Berkas tidak bisa diunduh. Coba kirim ulang (jangan sebagai dokumen besar).')
    }
    const daftarBerkas = siapkanBerkas(buffer, nama, berkasAda ? '' : teks)
    const hasil = await deploySubdomain({
      nama: tunggu.nama,
      berkas: daftarBerkas,
      pemilik: String(m.sender || ''),
      judul: String(m.pushName || '').slice(0, 40),
      mode: tunggu.mode,
    })
    await m.reply([
      '✅ *DEPLOY BERHASIL*',
      '',
      `🌐 ${hasil.url}`,
      `🔗 ${hasil.urlTitik}`,
      `📦 ${hasil.berkas} berkas · ${rupiahBita(hasil.ukuran)}`,
      `🔁 Deploy ke-${hasil.info.deployKe}`,
      dnsBermasalah(hasil.dns),
      '',
      'DNS butuh ±10 detik–2 menit untuk alamat baru. Kalau belum terbuka, tunggu lalu muat ulang.',
      `⚙️ Kontrol: .kontrolsubdomain ${hasil.nama}`,
      `🔁 Ganti isi: .deploysubdomain ${hasil.nama} ganti`,
    ].filter(Boolean).join('\n'))
    return true
  } catch (error) {
    TUNGGU.set(kunci(m), tunggu)
    simpanDisk()
    await m.reply(`❌ Deploy gagal: ${error?.message || error}\n\nCoba kirim ulang berkasnya (maks 10 menit).`).catch(() => { })
    return true
  }
}

/* Jalur utama: dipanggil handler.js SEBELUM gerbang prefix chat pribadi. */
daftarkanAksi('subdomain-deploy', (m) => {
  const tunggu = ambil(m)
  if (!tunggu) return null
  const teks = captionLampiran(m) || String(m.text || '')
  if (!adaLampiran(m) && !tampakHtml(teks)) return null
  return {
    jalankan: function (msg) {
      return prosesTunggu(this, msg || m, tunggu)
    },
  }
})

/* Cadangan: hook all (mis. di grup, atau bila registry tidak terpasang). */
handler.all = async function (m) {
  const tunggu = ambil(m)
  if (!tunggu) return
  if (!adaLampiran(m) && !tampakHtml(captionLampiran(m) || String(m.text || ''))) return
  return prosesTunggu(this, m, tunggu)
}

handler.help = [
  'subdomainmenu',
  'addsubdomain nama/domain',
  'cekdns domain',
  'bantudomain domain',
  'nszone domain ns1 ns2 (owner)',
  'domainpending (owner)',
  'deploysubdomain nama',
  'kontrolsubdomain [nama]',
  'ceksubdomain [nama]',
  'dellsubdomainmy nama (developer)',
]
handler.tags = ['owner', 'subdomain']
handler.category = 'owner'
handler.command = /^(deploysubdomain|deploysite|ceksubdomain|listubdomain|statussubdomain|kontrol-?subdomain|kontrolsubdomain|aktifsubdomain|nonaktifsubdomain|hapussubdomain|delsubdomain|dellsubdomainmy|delsubdomainmy|hapussubdomainmy|addsubdomainmy|addsubdomain|tambahsubdomain|bataldeploy|subdomainmenu|menu_subdomain|cekdns|cekcname|cekdomain|bantudomain|panduandomain|caradomain|nszone|setns|domainpending|domaintunggu)$/i
handler.description = 'Kelola subdomain: tambah sendiri, kontrol, deploy situs, hapus (developer)'
handler.owner = false
handler.group = false
handler.private = false

export { handler, TUNGGU }
export default handler
