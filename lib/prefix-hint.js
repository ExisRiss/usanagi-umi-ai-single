/* By AlzRiss - Usanagi Umi AI
 *
 * Task147 — BOT TIDAK BOLEH DIAM SAAT DIBERI PERINTAH
 *
 * Keluhan owner (28-10-2026): "bot jadibot ga respon, udah ketik command tapi
 * bot ga respon". Setelah ditelusuri, penyebabnya bukan socket mati: pesan
 * masuk, handler jalan, tetapi pesan DIBUANG DIAM-DIAM oleh tiga gerbang:
 *
 *   1. prefix salah — sesi memakai prefix `/`, `,`, atau `★`, pengguna mengetik
 *      `.menu`; di grup tidak ada pembanding yang cocok, jadi tidak ada balasan;
 *   2. sesi `onlyGroup = true` — semua pesan chat pribadi langsung `return`;
 *   3. sesi `public = false` (mode self) — pesan dari orang di luar daftar
 *      akses langsung `return`.
 *
 * Modul ini membuat ketiga kasus itu MENJAWAB, bukan diam. Aturannya:
 *   • hanya chat pribadi (1:1) — di grup banyak sesi bot bisa menjawab
 *     bersamaan sehingga petunjuk justru jadi spam;
 *   • perintah harus BENAR-BENAR ada di daftar plugin, jadi obrolan biasa,
 *     angka, atau tautan tidak memicu balasan;
 *   • dibatasi sekali per 10 menit per chat per jenis petunjuk, supaya orang
 *     yang memang mengobrol tidak dibalas terus-menerus.
 *
 * Preseden yang dipertahankan: Task112 (prefix benar-benar menyaring) dan
 * Task117/Task139 (prefix per sesi). Modul ini TIDAK menjalankan plugin apa pun
 * dan TIDAK mengubah prefix — hanya menjelaskan prefix yang benar.
 */

/** Jeda minimal (ms) sebelum petunjuk yang sama boleh muncul lagi di chat itu. */
export const JEDA_PETUNJUK_MS = 10 * 60 * 1000

/** Batas ukuran cache; di atas ini entri lama dibuang. */
const MAKS_CACHE = 2000

const terakhirKirim = new Map()

function kunciHint(chat, jenis) {
  return String(jenis || 'umum') + ':' + String(chat || '')
}

/**
 * Boleh mengirim petunjuk jenis ini ke chat ini sekarang?
 * Selalu mengembalikan true untuk jenis 'uji' supaya pengujian tidak saling
 * mengunci, kecuali `catat` diminta.
 */
export function bolehHint(chat, jenis = 'umum', sekarang = Date.now(), opsi = {}) {
  const catat = opsi.catat !== false
  const sebelumnya = terakhirKirim.get(kunciHint(chat, jenis)) || 0
  if (sekarang - sebelumnya < JEDA_PETUNJUK_MS) return false
  if (catat) {
    if (terakhirKirim.size > MAKS_CACHE) {
      for (const [kunci, waktu] of terakhirKirim) {
        if (sekarang - waktu > JEDA_PETUNJUK_MS) terakhirKirim.delete(kunci)
      }
    }
    terakhirKirim.set(kunciHint(chat, jenis), sekarang)
  }
  return true
}

/** Kosongkan cache (dipakai uji dan saat hot reload plugin). */
export function lupakanHint(chat, jenis) {
  if (chat === undefined) {
    terakhirKirim.clear()
    return
  }
  if (jenis === undefined) {
    for (const kunci of Array.from(terakhirKirim.keys())) {
      if (kunci.endsWith(':' + String(chat))) terakhirKirim.delete(kunci)
    }
    return
  }
  terakhirKirim.delete(kunciHint(chat, jenis))
}

/**
 * Ambil nama perintah literal dari sebuah nilai `command`/`alias`.
 * RegExp hanya dibaca kalau bentuknya sederhana: /^(menu|help)$/i
 * @returns {string[]}
 */
export function namaDariNilai(nilai) {
  const hasil = []
  const tambah = (teks) => {
    const nama = String(teks == null ? '' : teks).trim().toLowerCase()
    if (nama && /^[a-z0-9][a-z0-9_-]*$/i.test(nama)) hasil.push(nama)
  }
  const dariRegex = (re) => {
    const sumber = String((re && re.source) || '')
    const cocok = /^\^\(([^()]+)\)\$/.exec(sumber) || /^\^([A-Za-z0-9_|-]+)\$/.exec(sumber)
    if (!cocok) return
    for (const bagian of cocok[1].split('|')) tambah(bagian)
  }
  const baca = (item) => {
    if (item == null) return
    if (item instanceof RegExp) return dariRegex(item)
    if (Array.isArray(item)) {
      for (const isi of item) baca(isi)
      return
    }
    tambah(item)
  }
  baca(nilai)
  return hasil
}

/** Cache per bot/konfigurasi: 2.100 plugin × setiap pesan = terlalu mahal. */
const cacheKunci = new WeakMap()
const UMUR_CACHE_MS = 5000

/** Semua nama perintah yang benar-benar terdaftar di `plugins`. */
export function kumpulanPerintah(plugins, opsi = {}) {
  const kunci = opsi.kunci && typeof opsi.kunci === 'object' ? opsi.kunci : null
  const sekarang = Date.now()
  if (kunci) {
    const simpan = cacheKunci.get(kunci)
    if (simpan && simpan.plugins === plugins && sekarang - simpan.waktu < UMUR_CACHE_MS) return simpan.set
  }
  const isDisabled = typeof opsi.isDisabled === 'function' ? opsi.isDisabled : () => false
  const set = new Set()
  const daftar = plugins && typeof plugins === 'object' ? plugins : {}
  for (const nama of Object.keys(daftar)) {
    const plugin = daftar[nama]
    if (!plugin) continue
    if (plugin.disabled) continue
    let dilewati = false
    try {
      dilewati = Boolean(isDisabled(nama))
    } catch (error) {
      dilewati = false
    }
    if (dilewati) continue
    for (const perintah of namaDariNilai(plugin.command)) set.add(perintah)
    for (const alias of namaDariNilai(plugin.alias)) set.add(alias)
  }
  if (kunci) cacheKunci.set(kunci, { plugins, waktu: sekarang, set })
  return set
}

/** Pola pesan berbentuk perintah: <prefix><nama perintah>[akhir/argumen]. */
const POLA_PERINTAH = /^([^\w\s]{1,3})([A-Za-z][A-Za-z0-9_-]{1,48})(?=$|[\s,.;:!?])/

/**
 * Pesan ini terlihat seperti perintah tetapi memakai prefix yang salah?
 *
 * @returns {{prefix:string, perintah:string, pesan:string}|null}
 */
export function cariPesanPrefix(opsi = {}) {
  const teks = String(opsi.text == null ? '' : opsi.text).trim()
  const aktif = String(opsi.activePrefix == null ? '' : opsi.activePrefix)
  if (!teks || !aktif) return null
  /* Prefix benar → bukan kasus modul ini; dispatcher yang mengurus. */
  if (teks.startsWith(aktif)) return null
  const cocok = POLA_PERINTAH.exec(teks)
  if (!cocok) return null
  const prefixDipakai = cocok[1]
  const perintah = cocok[2].toLowerCase()
  /* `..menu` pada sesi ber-prefix `.` sudah ditangani handler (prefix ganda). */
  if (prefixDipakai === aktif) return null
  const set = opsi.daftarPerintah instanceof Set
    ? opsi.daftarPerintah
    : kumpulanPerintah(opsi.plugins, { isDisabled: opsi.isDisabled, kunci: opsi.kunci })
  if (!set.has(perintah)) return null

  const baris = [
    `Prefix bot ini *${aktif}*, bukan *${prefixDipakai}*.`,
    '',
    `Contoh: ${aktif}${perintah}`,
  ]
  if (prefixDipakai === '$' && String(opsi.botType || '') === 'jadibot') {
    baris.push('', 'Tanda `$` hanya dipakai bot utama, sesi ini memakai `' + aktif + '`.')
  }
  return { prefix: prefixDipakai, perintah, pesan: baris.join('\n') }
}

/** Petunjuk untuk sesi bermode "hanya grup". */
export function petunjukOnlyGroup(namaBot) {
  const nama = String(namaBot || '').trim()
  return [
    nama ? `⚙️ *${nama}* hanya melayani grup.` : '⚙️ Bot ini hanya melayani grup.',
    '',
    'Chat pribadi tidak dijawab karena setelan *Only Group* menyala.',
    'Masukkan bot ke grup, atau minta pemilik bot mematikan Only Group di website.',
  ].join('\n')
}

/** Petunjuk untuk sesi bermode privat (self). */
export function petunjukPrivat() {
  return [
    '🔒 Bot ini sedang *mode privat*.',
    '',
    'Hanya pemilik bot yang dilayani. Minta pemilik menambahkan nomormu ke daftar akses.',
  ].join('\n')
}

export default {
  JEDA_PETUNJUK_MS,
  bolehHint,
  lupakanHint,
  namaDariNilai,
  kumpulanPerintah,
  cariPesanPrefix,
  petunjukOnlyGroup,
  petunjukPrivat,
}
