/* By AlzRiss - Usanagi Umi AI
 *
 * Task190 — penyimpanan sistem seleksi member grup (Umi Alz Seleksi).
 * Berkas data: data/seleksi/db.json (+ foto di data/seleksi/foto/).
 * Tulis atomik (tmp + rename) supaya tidak korup saat server restart.
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const AKAR = path.join(process.cwd(), 'data', 'seleksi')
const BERKAS = path.join(AKAR, 'db.json')
const FOTO_DIR = path.join(AKAR, 'foto')

const BAWAAN_FIELDS = [
    { kunci: 'nama', label: 'Nama lengkap', tipe: 'teks', wajib: true },
    { kunci: 'umur', label: 'Umur', tipe: 'angka', wajib: true },
    { kunci: 'kelas', label: 'Kelas', tipe: 'teks', wajib: true },
    { kunci: 'agama', label: 'Agama', tipe: 'teks', wajib: true },
    { kunci: 'hobi', label: 'Hobi', tipe: 'teks', wajib: true },
    { kunci: 'tujuan', label: 'Tujuan join', tipe: 'teks', wajib: true },
]

function dbKosong() {
    return {
        versi: 1,
        pengaturan: {
            pesanSambutan: 'Selamat datang di Umi Alz Seleksi — seleksi member grup WhatsApp yang rapi & transparan.',
            host: 'umi-alz-seleksi.gwenna.my.id',
        },
        grup: {},
        pendaftar: {},
        akun: {},
        chat: [],
        log: [],
    }
}

let cache = null
let muatTerakhir = 0

export function db() {
    if (cache && Date.now() - muatTerakhir < 1500) return cache
    try {
        cache = JSON.parse(fs.readFileSync(BERKAS, 'utf8'))
        if (!cache || typeof cache !== 'object' || !cache.grup) cache = dbKosong()
    } catch { cache = dbKosong() }
    muatTerakhir = Date.now()
    return cache
}

export function simpan() {
    try {
        fs.mkdirSync(AKAR, { recursive: true })
        const tmp = BERKAS + '.tmp'
        fs.writeFileSync(tmp, JSON.stringify(db(), null, 2), { mode: 0o600 })
        fs.renameSync(tmp, BERKAS)
        return true
    } catch (error) {
        console.log('[SELEKSI] gagal simpan db:', error.message)
        return false
    }
}

export function catatLog(jenis, pesan, extra = {}) {
    const d = db()
    d.log.unshift({ waktu: new Date().toISOString(), jenis, pesan, ...extra })
    if (d.log.length > 400) d.log.length = 400
}

/* ── id & keamanan ─────────────────────────────────────────────────────── */

/** ID akun stabil dari nomor WA (pola upload-publik — nomor tidak tampil di URL). */
export function idAkunDariNomor(nomor) {
    const n = String(nomor || '').replace(/\D/g, '')
    if (!n) return ''
    return crypto.createHash('sha256').update(`umi-seleksi:${n}`).digest('hex').slice(0, 8)
}

export function idAcak(panjang = 8) {
    return crypto.randomBytes(16).toString('hex').slice(0, panjang)
}

export function slugAman(teks) {
    return String(teks || '').toLowerCase()
        .normalize('NFKD').replace(/[^\w\s-]/g, '')
        .trim().replace(/\s+/g, '-').replace(/-{2,}/g, '-').slice(0, 48) || 'grup'
}

export function hashPassword(password, salt = idAcak(16)) {
    const hash = crypto.scryptSync(String(password || ''), salt, 32).toString('hex')
    return { salt, hash }
}

export function cocokPassword(password, salt, hash) {
    try {
        const cek = crypto.scryptSync(String(password || ''), String(salt || ''), 32).toString('hex')
        const a = Buffer.from(cek, 'hex'), b = Buffer.from(String(hash || ''), 'hex')
        return a.length === b.length && crypto.timingSafeEqual(a, b)
    } catch { return false }
}

/** Task192 — kode pendaftaran: 8 digit angka (sekali pakai per grup). */
export function kodeAcak() {
    return String(Math.floor(10000000 + Math.random() * 90000000))
}

export function tokenAcak() {
    return crypto.randomBytes(24).toString('base64url')
}

/* ── foto ──────────────────────────────────────────────────────────────── */

/** Simpan foto base64 (data URL atau murni) → nama berkas; return nama. */
export function simpanFoto(base64, cadanganExt = '.jpg') {
    try {
        let mentah = String(base64 || '')
        let ext = cadanganExt
        const dataUrl = mentah.match(/^data:image\/(\w+);base64,(.+)$/)
        if (dataUrl) {
            ext = '.' + (dataUrl[1] === 'jpeg' ? 'jpg' : dataUrl[1])
            mentah = dataUrl[2]
        }
        if (!/^[\w+/=]+$/.test(mentah.slice(0, 64))) return null
        const buffer = Buffer.from(mentah, 'base64')
        if (!buffer.length || buffer.length > 6 * 1024 * 1024) return null
        fs.mkdirSync(FOTO_DIR, { recursive: true })
        const nama = idAcak(16) + ext
        fs.writeFileSync(path.join(FOTO_DIR, nama), buffer, { mode: 0o600 })
        return nama
    } catch { return null }
}

export function bacaFoto(nama) {
    const bersih = path.basename(String(nama || ''))
    if (!bersih || bersih === '.' || bersih === '..') return null
    try { return fs.readFileSync(path.join(FOTO_DIR, bersih)) } catch { return null }
}

/* ── akun ──────────────────────────────────────────────────────────────── */

export function cariAkun(identifier) {
    const d = db()
    const i = String(identifier || '').toLowerCase()
    if (!i) return null
    for (const akun of Object.values(d.akun)) {
        if (akun.id === identifier || String(akun.username || '').toLowerCase() === i
            || akun.nomor === String(identifier || '').replace(/\D/g, '')) return akun
    }
    return null
}

export function buatAkun({ username, password, nomor = '', jid = '', nama = '', role = 'user' }) {
    const d = db()
    const { salt, hash } = hashPassword(password)
    const akun = {
        id: idAkunDariNomor(nomor) || idAcak(10),
        username: String(username || '').toLowerCase().slice(0, 24),
        salt, hash,
        nomor: String(nomor || '').replace(/\D/g, ''),
        jid: String(jid || (nomor ? String(nomor).replace(/\D/g, '') + '@s.whatsapp.net' : '')),
        nama: String(nama || username || ''),
        bio: '',
        foto: '',
        role: role === 'owner' ? 'owner' : 'user',
        token: tokenAcak(),
        dibuat: new Date().toISOString(),
    }
    d.akun[akun.id] = akun
    return akun
}

/** Apakah nomor termasuk developer bot (dibaca dari config.js global.owner)? */
export function nomorDeveloper() {
    try {
        const daftar = Array.isArray(global.owner) ? global.owner : []
        return daftar.map(([id]) => String(id || '').replace(/\D/g, '')).filter(Boolean)
    } catch { return [] }
}

export function roleDariNomor(nomor) {
    const n = String(nomor || '').replace(/\D/g, '')
    return nomorDeveloper().includes(n) ? 'owner' : 'user'
}

/* ── grup seleksi ──────────────────────────────────────────────────────── */

export function grupBySlug(slug) {
    return db().grup[String(slug || '')] || null
}

export function buatGrup({ nama, slug, pemilikJid, deskripsi = '', grupTujuanJid = '', serverKey = '', fields = null, linkGrup = '', linkUtama = '' }) {
    const d = db()
    let kunci = slugAman(slug || nama)
    let n = 1
    while (d.grup[kunci]) kunci = slugAman((slug || nama)) + '-' + (n++)
    const grup = {
        slug: kunci,
        nama: String(nama || kunci).slice(0, 60),
        deskripsi: String(deskripsi || '').slice(0, 300),
        pemilikJid: String(pemilikJid || ''),
        grupTujuanJid: String(grupTujuanJid || ''),
        grupSeleksiJid: '',                                // Task194 — grup WA khusus seleksi (notifikasi & review)
        serverKey: String(serverKey || ''),
        linkGrup: String(linkGrup || '').slice(0, 300),      // link grup seleksi (WA)
        linkUtama: String(linkUtama || '').slice(0, 300),     // link grup utama — tempat masuk setelah lolos
        accPending: false,                                   // Task192 — menunggu bot menambahkan ke grup
        daftarAktif: true,
        banned: false,
        helper: {},
        fields: Array.isArray(fields) && fields.length ? fields : BAWAAN_FIELDS.map(f => ({ ...f })),
        statistik: { acc: 0, tolak: 0, total: 0 },
        dibuat: new Date().toISOString(),
    }
    d.grup[kunci] = grup
    return grup
}

export function grupUntukJid(chatJid) {
    const jid = String(chatJid || '')
    return Object.values(db().grup).find(g => g.grupTujuanJid === jid) || null
}

export function idAkunPemilik(grup) {
    const nomor = String(grup?.pemilikJid || '').split('@')[0].replace(/\D/g, '')
    return idAkunDariNomor(nomor) || 'umum'
}

/** Bolehkah akun mengakses panel seleksi grup ini? */
export function punyaAksesSeleksi(akun, grup) {
    if (!akun || !grup) return false
    if (akun.role === 'owner') return true
    if (grup.pemilikJid && akun.jid === grup.pemilikJid) return true
    if (grup.banned) return false
    const bantuan = grup.helper[akun.jid] || grup.helper[akun.nomor || ''] || grup.helper[String(akun.username || '').toLowerCase()]
    return Boolean(bantuan)
}

export function helperNomor(grup, identifier) {
    const i = String(identifier || '').replace(/\D/g, '')
    return Object.values(grup.helper).find(h => h.nomor === i) || null
}

/* ── pendaftar ─────────────────────────────────────────────────────────── */

export function buatPendaftar({ grupSlug, kode, jid = '', nomor = '', serverKey = '' }) {
    const d = db()
    const id = idAcak(10)
    const pendaftar = {
        id,
        grupSlug: String(grupSlug || ''),
        kode: String(kode || kodeAcak()).slice(0, 12),   // Task192: 8 digit angka
        jid: String(jid || ''),
        nomor: String(nomor || jid ? String(jid || nomor).split('@')[0].split(':')[0].replace(/\D/g, '') : ''),
        data: {},
        foto: '',
        status: 'kode',          // kode → menunggu → diterima | ditolak
        serverKey: String(serverKey || ''),
        antar: false,            // perlu dikirim ke grup WA (poller)
        antarPada: null,
        oleh: '',                // jid akun web yang menangani (acc/tolak web)
        waktu: new Date().toISOString(),
        ditangani: null,
    }
    d.pendaftar[id] = pendaftar
    const grup = d.grup[pendaftar.grupSlug]
    if (grup) grup.statistik.total += 1
    return pendaftar
}

export function pendaftarByKode(kode) {
    const k = String(kode || '').replace(/\D/g, '')   // Task192 — kode murni 8 digit
    if (k.length < 6) return null
    return Object.values(db().pendaftar).find(p => p.kode === k && p.status === 'kode') || null
}

export function pendaftarById(id) {
    return db().pendaftar[String(id || '')] || null
}

export function selesaikanPendaftaran(pendaftar, { data, foto }) {
    pendaftar.data = { ...pendaftar.data, ...(data || {}) }
    if (foto) pendaftar.foto = String(foto)
    pendaftar.status = 'menunggu'
    pendaftar.antar = true
    return pendaftar
}

/* ── chat ──────────────────────────────────────────────────────────────── */

export function chatTerakhir(batas = 80) {
    return db().chat.slice(-batas)
}

export function chatTambah({ dari, nama, teks }) {
    const d = db()
    const pesan = { id: idAcak(8), dari: String(dari || ''), nama: String(nama || ''), teks: String(teks || '').slice(0, 1000), waktu: new Date().toISOString() }
    d.chat.push(pesan)
    if (d.chat.length > 500) d.chat.splice(0, d.chat.length - 500)
    return pesan
}

export { AKAR, FOTO_DIR }
