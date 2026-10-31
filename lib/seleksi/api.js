/* By AlzRiss - Usanagi Umi AI
 *
 * Task190 — penyaji & API "Umi Alz Seleksi" (umi-alz-seleksi.gwenna.my.id).
 * Dipanggil paling awal dari lib/jadibot-platform-api.js#route.
 *
 * Jalur:
 *   GET  /                              → SPA
 *   GET  /<idAkun>/<slug>               → SPA (form publik seleksi)
 *   GET  /<idAkun>/<slug>/seleksi       → SPA (panel seleksi, wajib akses)
 *   /api/*                             → REST (lihat bawah)
 *
 * Sinkron bot↔web memakai header X-Sinkron-Secret (data/seleksi-sync.json).
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import {
    db, simpan, catatLog, idAkunDariNomor, idAcak, slugAman, cocokPassword,
    buatAkun, cariAkun, roleDariNomor, buatGrup, grupBySlug, idAkunPemilik,
    punyaAksesSeleksi, buatPendaftar, pendaftarByKode, pendaftarById,
    selesaikanPendaftaran, chatTerakhir, chatTambah, bacaFoto, simpanFoto,
    helperNomor, nomorDeveloper,
} from './store.js'

const HOST_BAWAAN = 'umi-alz-seleksi.gwenna.my.id'
const BERKAS_SINKRON = path.join(process.cwd(), 'data', 'seleksi-sync.json')
const SPA_PATH = path.join(process.cwd(), 'situs', 'umi-alz-seleksi', 'index.html')

let cacheSpa = { waktu: 0, isi: '' }
let cacheSinkron = { waktu: 0, secret: '' }

function hostSeleksi() {
    try {
        const isi = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'seleksi', 'db.json'), 'utf8'))
        if (isi?.pengaturan?.host) return String(isi.pengaturan.host).toLowerCase()
    } catch { /* pakai bawaan */ }
    return HOST_BAWAAN
}

function secretSinkron() {
    if (Date.now() - cacheSinkron.waktu < 5000) return cacheSinkron.secret
    let secret = ''
    try { secret = String(JSON.parse(fs.readFileSync(BERKAS_SINKRON, 'utf8')).secret || '') } catch { /* kosong */ }
    cacheSinkron = { waktu: Date.now(), secret }
    return secret
}

export function hostDikenali(host) {
    const bersih = s => String(s || '').split(':')[0].toLowerCase().replace(/\.$/, '')
    return bersih(host) === bersih(hostSeleksi())
}

function send(res, kode, isi, header = {}) {
    const body = Buffer.isBuffer(isi) ? isi : Buffer.from(typeof isi === 'string' ? isi : JSON.stringify(isi))
    const tipe = header['Content-Type']
        || (Buffer.isBuffer(isi) ? 'application/octet-stream' : typeof isi === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8')
    res.writeHead(kode, { 'Content-Type': tipe, 'Content-Length': body.length, ...header })
    res.end(kode === 204 ? undefined : body)
}

function bacaBody(req, maks = 8 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        let total = 0
        const potongan = []
        req.on('data', chunk => {
            total += chunk.length
            if (total > maks) { reject(new Error('BODY_TOO_LARGE')); req.destroy(); return }
            potongan.push(chunk)
        })
        req.on('end', () => resolve(Buffer.concat(potongan)))
        req.on('error', reject)
    })
}

async function jsonBody(req) {
    const raw = await bacaBody(req)
    if (!raw.length) return {}
    try { return JSON.parse(raw.toString('utf8')) } catch { return {} }
}

function ambilToken(req) {
    const cookie = String(req.headers.cookie || '').split(';').map(s => s.trim())
    const dariCookie = cookie.find(s => s.startsWith('umi_sel='))?.slice('umi_sel='.length)
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    return auth || dariCookie || ''
}

function akunDariReq(req) {
    const token = ambilToken(req)
    if (!token || token.length < 12) return null
    for (const akun of Object.values(db().akun)) {
        if (akun.token === token) return akun
    }
    return null
}

function headerCookie(token) {
    return { 'Set-Cookie': `umi_sel=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}` }
}

function namaFileSafe(nama) {
    return String(nama || '').replace(/[^\w.-]/g, '_').slice(0, 60) || 'foto.jpg'
}

/* ── SPA ───────────────────────────────────────────────────────────────── */

function spa() {
    if (Date.now() - cacheSpa.waktu < 3000) return cacheSpa.isi
    try {
        cacheSpa = { waktu: Date.now(), isi: fs.readFileSync(SPA_PATH, 'utf8') }
    } catch {
        cacheSpa = { waktu: 0, isi: '<h1>Umi Alz Seleksi — berkas SPA belum terpasang.</h1>' }
    }
    return cacheSpa.isi
}

/* ── REST ──────────────────────────────────────────────────────────────── */

async function routeApi(req, res, url) {
    const p = url.pathname
    const method = req.method
    const d = db()

    /* Status publik */
    if (p === '/api/status' && method === 'GET') {
        let ramMb = 0
        try { ramMb = Math.round(process.memoryUsage().rss / 1048576) } catch { /* abaikan */ }
        const totalPendaftar = Object.values(d.pendaftar).filter(x => x.status === 'menunggu').length
        return send(res, 200, {
            ok: true,
            server: { online: true, uptime: Math.round(process.uptime()), ramMb },
            jumlahGrup: Object.keys(d.grup).length,
            pendaftarMenunggu: totalPendaftar,
            pesanSambutan: d.pengaturan.pesanSambutan,
            waktu: new Date().toISOString(),
        })
    }

    /* ── akun ── */
    if (p === '/api/akun/daftar' && method === 'POST') {
        const b = await jsonBody(req)
        const username = String(b.username || '').toLowerCase().replace(/[^\w]/g, '').slice(0, 24)
        const nomor = String(b.nomor || '').replace(/\D/g, '')
        if (username.length < 3) return send(res, 400, { error: 'Username minimal 3 huruf (hanya huruf/angka).' })
        if (String(b.password || '').length < 6) return send(res, 400, { error: 'Password minimal 6 karakter.' })
        if (cariAkun(username) || (nomor && Object.values(d.akun).some(a => a.nomor === nomor))) {
            return send(res, 409, { error: 'Username/nomor itu sudah terdaftar.' })
        }
        const akun = buatAkun({ username, password: b.password, nomor, nama: b.nama || username, role: roleDariNomor(nomor) })
        catatLog('akun', `Akun web baru: ${akun.username}`, { akunId: akun.id })
        simpan()
        return send(res, 200, { ok: true, akun: ringkasAkun(akun) }, headerCookie(akun.token))
    }

    if (p === '/api/akun/masuk' && method === 'POST') {
        const b = await jsonBody(req)
        const akun = cariAkun(b.username || '')
        if (!akun || !cocokPassword(b.password, akun.salt, akun.hash)) {
            return send(res, 401, { error: 'Username atau password salah.' })
        }
        /* Rekanisasi role developer dari config bot. */
        if (roleDariNomor(akun.nomor) === 'owner' && akun.role !== 'owner') akun.role = 'owner'
        simpan()
        return send(res, 200, { ok: true, akun: ringkasAkun(akun) }, headerCookie(akun.token))
    }

    if (p === '/api/akun/keluar' && method === 'POST') {
        return send(res, 200, { ok: true }, { 'Set-Cookie': 'umi_sel=; Path=/; HttpOnly; Max-Age=0' })
    }

    if (p === '/api/akun/profil' && method === 'GET') {
        const akun = akunDariReq(req)
        if (!akun) return send(res, 401, { error: 'Belum masuk.' })
        return send(res, 200, { ok: true, akun: { ...ringkasAkun(akun), bio: akun.bio, token: akun.token, foto: akun.foto ? '/api/foto/akun/' + akun.foto : '' } })
    }

    if (p === '/api/akun/profil' && method === 'POST') {
        const akun = akunDariReq(req)
        if (!akun) return send(res, 401, { error: 'Belum masuk.' })
        const b = await jsonBody(req)
        if (typeof b.nama === 'string' && b.nama.trim()) akun.nama = b.nama.trim().slice(0, 40)
        if (typeof b.bio === 'string') akun.bio = b.bio.slice(0, 200)
        if (b.passwordBaru) {
            if (!cocokPassword(b.passwordLama, akun.salt, akun.hash)) return send(res, 400, { error: 'Password lama salah.' })
            if (String(b.passwordBaru).length < 6) return send(res, 400, { error: 'Password baru minimal 6 karakter.' })
            const baru = buatAkun({ username: akun.username + '_x', password: b.passwordBaru })
            akun.salt = baru.salt; akun.hash = baru.hash
            delete d.akun[baru.id]
        }
        if (typeof b.fotoBase64 === 'string' && b.fotoBase64.length > 100) {
            const nama = simpanFoto(b.fotoBase64)
            if (nama) akun.foto = nama
        }
        if (b.rolToken === 'putar') akun.token = (await import('./store.js')).tokenAcak()
        simpan()
        return send(res, 200, { ok: true, akun: ringkasAkun(akun), token: akun.token })
    }

    /* ── foto publik ── */
    if (p.startsWith('/api/foto/') && method === 'GET') {
        const bagian = p.split('/').filter(Boolean)  // api, foto, jenis, nama
        if (bagian.length !== 4) return send(res, 404, { error: 'Tidak ditemukan.' })
        const buffer = bacaFoto(bagian[3])
        if (!buffer) return send(res, 404, { error: 'Foto tidak ditemukan.' })
        const ext = path.extname(bagian[3]).toLowerCase()
        const tipe = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
        return send(res, 200, buffer, { 'Content-Type': tipe, 'Cache-Control': 'public, max-age=3600' })
    }

    /* ── grup publik ── */
    if (p === '/api/grup/publik' && method === 'GET') {
        const idAkun = String(url.searchParams.get('idAkun') || '')
        const semua = Object.values(d.grup).filter(g => !g.banned && g.daftarAktif)
        const punyaId = idAkun ? semua.filter(g => idAkunPemilik(g) === idAkun) : semua
        return send(res, 200, {
            ok: true,
            grup: punyaId.map(g => ({
                slug: g.slug, nama: g.nama, deskripsi: g.deskripsi,
                idAkun: idAkunPemilik(g),
                menunggu: Object.values(d.pendaftar).filter(x => x.grupSlug === g.slug && x.status === 'menunggu').length,
            })),
        })
    }

    if (p === '/api/grup/form' && method === 'GET') {
        const idAkun = String(url.searchParams.get('idAkun') || '')
        const slug = String(url.searchParams.get('slug') || '')
        const g = grupBySlug(slug)
        if (!g || g.banned || idAkunPemilik(g) !== idAkun) return send(res, 404, { error: 'Grup seleksi tidak ditemukan.' })
        return send(res, 200, {
            ok: true,
            grup: { slug: g.slug, nama: g.nama, deskripsi: g.deskripsi },
            fields: g.fields.map(f => ({ kunci: f.kunci, label: f.label, tipe: f.tipe, wajib: Boolean(f.wajib) })),
        })
    }

    /* ── pendaftaran ── */
    if (p === '/api/pendaftaran' && method === 'POST') {
        const b = await jsonBody(req)
        const idAkun = String(b.idAkun || '')
        const slug = String(b.slug || '')
        const g = grupBySlug(slug)
        if (!g || g.banned || idAkunPemilik(g) !== idAkun) return send(res, 404, { error: 'Grup seleksi tidak ditemukan.' })
        if (!g.daftarAktif) return send(res, 400, { error: 'Pendaftaran untuk grup ini sedang ditutup.' })

        let pendaftar = null
        if (b.kode) {
            pendaftar = pendaftarByKode(b.kode)
            if (!pendaftar || pendaftar.grupSlug !== slug) return send(res, 400, { error: 'Kode tidak valid atau sudah dipakai. Jalankan /seleksi dulu di grup.' })
        } else {
            const nomor = String(b.nomor || '').replace(/\D/g, '')
            pendaftar = buatPendaftar({ grupSlug: slug, kode: idAcak(6).toUpperCase(), nomor, serverKey: g.serverKey })
        }

        const data = {}
        for (const f of g.fields) {
            const nilai = String(b.data?.[f.kunci] ?? '').trim().slice(0, 300)
            if (f.wajib && !nilai) return send(res, 400, { error: `Kolom "${f.label}" wajib diisi.` })
            data[f.kunci] = nilai
        }
        pendaftar.data = data
        if (typeof b.fotoBase64 === 'string' && b.fotoBase64.length > 100) {
            const nama = simpanFoto(b.fotoBase64)
            if (nama) pendaftar.foto = nama
        }
        pendaftar.status = 'menunggu'
        pendaftar.antar = true
        catatLog('pendaftar', `Pendaftar baru di ${g.nama}: ${data.nama || pendaftar.nomor || pendaftar.id}`, { grupSlug: slug })
        simpan()
        return send(res, 200, { ok: true, id: pendaftar.id, pesan: 'Pendaftaran terkirim! Admin grup akan meninjau datamu.' })
    }

    /* ── panel seleksi ── */
    if (p === '/api/seleksi/list' && method === 'GET') {
        const akun = akunDariReq(req)
        if (!akun) return send(res, 401, { error: 'Masuk dulu untuk membuka panel.' })
        const idAkun = String(url.searchParams.get('idAkun') || '')
        const slug = String(url.searchParams.get('slug') || '')
        const g = grupBySlug(slug)
        if (!g || idAkunPemilik(g) !== idAkun) return send(res, 404, { error: 'Grup tidak ditemukan.' })
        if (!punyaAksesSeleksi(akun, g)) return send(res, 403, { error: 'Kamu tidak punya akses seleksi di grup ini. Minta ke pemilik grup seleksi.' })
        const status = String(url.searchParams.get('status') || '')
        let daftar = Object.values(d.pendaftar).filter(x => x.grupSlug === slug)
        if (status) daftar = daftar.filter(x => x.status === status)
        daftar.sort((a, b2) => String(b2.waktu).localeCompare(String(a.waktu)))
        return send(res, 200, {
            ok: true,
            grup: { slug: g.slug, nama: g.nama, deskripsi: g.deskripsi, fields: g.fields, statistik: g.statistik, daftarAktif: g.daftarAktif, banned: g.banned },
            akses: akun.role === 'owner' ? 'owner' : (g.pemilikJid === akun.jid ? 'pemilik' : 'helper'),
            pendaftar: daftar.map(p => ({ ...p, foto: p.foto ? '/api/foto/pendaftar/' + p.foto : '' })),
        })
    }

    if (p === '/api/seleksi/aksi' && method === 'POST') {
        const akun = akunDariReq(req)
        if (!akun) return send(res, 401, { error: 'Masuk dulu.' })
        const b = await jsonBody(req)
        const pendaftar = pendaftarById(b.idPendaftar)
        if (!pendaftar) return send(res, 404, { error: 'Pendaftar tidak ditemukan.' })
        const g = grupBySlug(pendaftar.grupSlug)
        if (!g || !punyaAksesSeleksi(akun, g)) return send(res, 403, { error: 'Tidak punya akses seleksi. Minta ke pemilik grup seleksi.' })
        if (!['acc', 'tolak'].includes(b.aksi)) return send(res, 400, { error: 'Aksi tidak dikenal.' })
        if (pendaftar.status === 'diterima' || pendaftar.status === 'ditolak') return send(res, 400, { error: 'Sudah ditangani sebelumnya.' })
        terapkanAksi(pendaftar, g, b.aksi, akun)
        catatLog('aksi', `${akun.nama} ${b.aksi === 'acc' ? 'MENERIMA' : 'MENOLAK'} pendaftar ${pendaftar.data?.nama || pendaftar.id}`, { grupSlug: g.slug })
        simpan()
        return send(res, 200, { ok: true, status: pendaftar.status, perintah: b.aksi === 'acc' ? 'Terkirim ke bot: menambahkan ke grup.' : 'Terkirim ke bot: penolakan dicatat.' })
    }

    /* ── chat ── */
    if (p === '/api/chat' && method === 'GET') {
        const akun = akunDariReq(req)
        if (!akun) return send(res, 401, { error: 'Masuk dulu untuk chat.' })
        return send(res, 200, { ok: true, pesan: chatTerakhir() })
    }

    if (p === '/api/chat' && method === 'POST') {
        const akun = akunDariReq(req)
        if (!akun) return send(res, 401, { error: 'Masuk dulu untuk chat.' })
        const b = await jsonBody(req)
        const teks = String(b.teks || '').trim().slice(0, 1000)
        if (!teks) return send(res, 400, { error: 'Pesan kosong.' })
        const pesan = chatTambah({ dari: akun.id, nama: akun.nama || akun.username, teks })
        simpan()
        return send(res, 200, { ok: true, pesan })
    }

    /* ── pemilik sistem ── */
    if (p === '/api/owner/ringkasan' && method === 'GET') {
        const akun = akunDariReq(req)
        if (!akun || akun.role !== 'owner') return send(res, 403, { error: 'Hanya pemilik sistem.' })
        const semuaPendaftar = Object.values(d.pendaftar)
        return send(res, 200, {
            ok: true,
            jumlahGrup: Object.keys(d.grup).length,
            jumlahAkun: Object.keys(d.akun).length,
            acc: semuaPendaftar.filter(x => x.status === 'diterima').length,
            tolak: semuaPendaftar.filter(x => x.status === 'ditolak').length,
            menunggu: semuaPendaftar.filter(x => x.status === 'menunggu').length,
            grup: Object.values(d.grup).map(g => ({
                slug: g.slug, nama: g.nama, banned: g.banned, daftarAktif: g.daftarAktif,
                pemilikJid: g.pemilikJid, statistik: g.statistik, helper: Object.keys(g.helper).length,
                tujuan: g.grupTujuanJid, serverKey: g.serverKey,
            })),
            akun: Object.values(d.akun).map(a => ({ id: a.id, username: a.username, nama: a.nama, role: a.role, nomor: a.nomor })),
            pesanSambutan: d.pengaturan.pesanSambutan,
            log: d.log.slice(0, 40),
            developer: nomorDeveloper().map(n => n.slice(-4) && ('••••' + n.slice(-4))),
        })
    }

    if (p === '/api/owner/grup' && method === 'POST') {
        const akun = akunDariReq(req)
        if (!akun || akun.role !== 'owner') return send(res, 403, { error: 'Hanya pemilik sistem.' })
        const b = await jsonBody(req)
        const grupTujuanJid = String(b.grupTujuanJid || '').trim()
        if (!b.nama) return send(res, 400, { error: 'Nama grup wajib diisi.' })
        const pemilikJid = String(b.pemilikJid || akun.jid || '')
        const g = buatGrup({ nama: b.nama, slug: b.slug, pemilikJid, deskripsi: b.deskripsi, grupTujuanJid, serverKey: b.serverKey || '' })
        catatLog('grup', `Owner membuat grup seleksi "${g.nama}"`, { slug: g.slug })
        simpan()
        return send(res, 200, { ok: true, grup: { slug: g.slug, url: `https://${hostSeleksi()}/${idAkunPemilik(g)}/${g.slug}` } })
    }

    if (p === '/api/owner/grup' && method === 'PATCH') {
        const akun = akunDariReq(req)
        if (!akun || akun.role !== 'owner') return send(res, 403, { error: 'Hanya pemilik sistem.' })
        const b = await jsonBody(req)
        if (typeof b.pesanSambutan === 'string' && b.pesanSambutan.trim() && !b.slug) {
            d.pengaturan.pesanSambutan = b.pesanSambutan.trim().slice(0, 300)
            simpan()
            return send(res, 200, { ok: true })
        }
        const g = grupBySlug(b.slug)
        if (!g) return send(res, 404, { error: 'Grup tidak ditemukan.' })
        if (typeof b.banned === 'boolean') { g.banned = b.banned; catatLog('grup', `Owner ${b.banned ? 'BAN' : 'unban'} grup "${g.nama}"`, { slug: g.slug }) }
        if (typeof b.daftarAktif === 'boolean') g.daftarAktif = b.daftarAktif
        if (typeof b.deskripsi === 'string') g.deskripsi = b.deskripsi.slice(0, 300)
        if (typeof b.pesanSambutan === 'string' && b.pesanSambutan.trim()) d.pengaturan.pesanSambutan = b.pesanSambutan.trim().slice(0, 300)
        simpan()
        return send(res, 200, { ok: true })
    }

    if (p === '/api/owner/role' && method === 'POST') {
        const akun = akunDariReq(req)
        if (!akun || akun.role !== 'owner') return send(res, 403, { error: 'Hanya pemilik sistem.' })
        const b = await jsonBody(req)
        const target = cariAkun(b.akunId || b.username || '')
        if (!target) return send(res, 404, { error: 'Akun tidak ditemukan.' })
        if (!['user', 'owner'].includes(b.role)) return send(res, 400, { error: 'Role hanya user/owner.' })
        target.role = b.role
        catatLog('role', `Owner mengubah role ${target.username} → ${b.role}`)
        simpan()
        return send(res, 200, { ok: true })
    }

    /* ── sinkron bot (secret) ── */
    if (p.startsWith('/api/sinkron/')) {
        const secret = String(req.headers['x-sinkron-secret'] || '')
        const expected = secretSinkron()
        const aman = expected && secret.length === expected.length
            && crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
        if (!aman) return send(res, 401, { error: 'Sinkron secret salah.' })

        /* Bot minta kode pendaftaran untuk sebuah grup WA */
        if (p === '/api/sinkron/kode' && method === 'POST') {
            const b = await jsonBody(req)
            const g = b.grupSlug
                ? grupBySlug(b.grupSlug)
                : Object.values(d.grup).find(x => x.grupTujuanJid === String(b.chatJid || ''))
            if (!g) return send(res, 404, { error: 'Grup seleksi belum dibuat. Pemilik jalankan /buatseleksi dulu di grup.' })
            const pendaftar = buatPendaftar({ grupSlug: g.slug, jid: b.senderJid, serverKey: g.serverKey || b.serverKey || '' })
            simpan()
            return send(res, 200, {
                ok: true, kode: pendaftar.kode, idAkun: idAkunPemilik(g), slug: g.slug,
                url: `https://${hostSeleksi()}/${idAkunPemilik(g)}/${g.slug}`,
                namaGrup: g.nama,
            })
        }

        /* Bot minta pendaftar yang perlu dikirim ke grup WA */
        if (p === '/api/sinkron/pending' && method === 'GET') {
            const serverKey = String(url.searchParams.get('server') || '')
            const daftar = Object.values(d.pendaftar).filter(x => x.antar && x.status === 'menunggu' && (!serverKey || (g_serverKey(x) === serverKey)))
            return send(res, 200, {
                ok: true,
                pendaftar: daftar.map(p => {
                    const g = grupBySlug(p.grupSlug)
                    return {
                        id: p.id, kode: p.kode, data: p.data, nomor: p.nomor, jid: p.jid, waktu: p.waktu,
                        foto: p.foto ? '/api/foto/pendaftar/' + p.foto : '',
                        grup: g ? { slug: g.slug, nama: g.nama, tujuanJid: g.grupTujuanJid, idAkun: idAkunPemilik(g), url: `https://${hostSeleksi()}/${idAkunPemilik(g)}/${g.slug}` } : null,
                    }
                }),
            })
        }

        /* Bot menandai pendaftar sudah terkirim ke grup */
        if (p === '/api/sinkron/antar' && method === 'POST') {
            const b = await jsonBody(req)
            const pendaftar = pendaftarById(b.idPendaftar)
            if (pendaftar) { pendaftar.antar = false; pendaftar.antarPada = new Date().toISOString(); simpan() }
            return send(res, 200, { ok: true })
        }

        /* Aksi acc/tolak dari tombol bot */
        if (p === '/api/sinkron/aksi' && method === 'POST') {
            const b = await jsonBody(req)
            const pendaftar = pendaftarById(b.idPendaftar)
            if (!pendaftar) return send(res, 404, { error: 'Pendaftar tidak ditemukan.' })
            const g = grupBySlug(pendaftar.grupSlug)
            if (!g) return send(res, 404, { error: 'Grup tidak ditemukan.' })
            const olehJid = String(b['olehJid'] || b['oleh'] || '')
            if (!['acc', 'tolak'].includes(b.aksi)) return send(res, 400, { error: 'Aksi tidak dikenal.' })
            if (pendaftar.status === 'diterima' || pendaftar.status === 'ditolak') return send(res, 409, { error: 'Sudah ditangani.', status: pendaftar.status })
            terapkanAksi(pendaftar, g, b.aksi, { jid: olehJid, nama: b.olehNama || olehJid })
            catatLog('aksi', `Bot: ${b.olehNama || olehJid || 'tombol'} ${b.aksi === 'acc' ? 'MENERIMA' : 'MENOLAK'} ${pendaftar.data?.nama || pendaftar.id}`, { grupSlug: g.slug })
            simpan()
            return send(res, 200, {
                ok: true, status: pendaftar.status,
                pendaftar: { id: pendaftar.id, jid: pendaftar.jid, nomor: pendaftar.nomor, data: pendaftar.data },
                grup: { slug: g.slug, nama: g.nama, tujuanJid: g.grupTujuanJid },
            })
        }

        /* Tambah helper (dari /addanggotaseleksi) */
        if (p === '/api/sinkron/helper' && method === 'POST') {
            const b = await jsonBody(req)
            const g = grupBySlug(b.grupSlug || '')
            if (!g) return send(res, 404, { error: 'Grup seleksi tidak ditemukan.' })
            const nomor = String(b.nomor || '').replace(/\D/g, '')
            if (!nomor) return send(res, 400, { error: 'Nomor tidak valid.' })
            const jid = nomor + '@s.whatsapp.net'
            if (g.pemilikJid === jid) return send(res, 400, { error: 'Itu pemilik grup seleksi sendiri.' })
            g.helper[jid] = { jid, nomor, username: String(b.username || '').toLowerCase(), nama: b.nama || '', oleh: b.olehJid || '', waktu: new Date().toISOString() }
            /* Kalau akun web sudah ada untuk nomor ini, langsung terhubung. */
            const akun = Object.values(d.akun).find(a => a.nomor === nomor)
            catatLog('helper', `Helper ditambahkan ke ${g.nama}: ••••${nomor.slice(-4)}`, { slug: g.slug })
            simpan()
            return send(res, 200, { ok: true, akunWebDitemukan: Boolean(akun), helper: g.helper[jid] })
        }

        /* Buat grup seleksi dari bot (/buatseleksi) */
        if (p === '/api/sinkron/grup' && method === 'POST') {
            const b = await jsonBody(req)
            const chatJid = String(b.chatJid || '')
            const pemilikJid = String(b.pemilikJid || '')
            const sudah = Object.values(d.grup).find(g => g.grupTujuanJid === chatJid)
            if (sudah) return send(res, 200, { ok: true, sudah: true, slug: sudah.slug, idAkun: idAkunPemilik(sudah), url: `https://${hostSeleksi()}/${idAkunPemilik(sudah)}/${sudah.slug}` })
            const g = buatGrup({ nama: b.nama || chatJid.split('@')[0], slug: b.slug, pemilikJid, deskripsi: b.deskripsi || '', grupTujuanJid: chatJid, serverKey: b.serverKey || '' })
            /* Akun web pemilik dibuat otomatis (khusus yang mau — pemilik grup). */
            const nomor = pemilikJid.split('@')[0].replace(/\D/g, '')
            let akun = Object.values(d.akun).find(a => a.nomor === nomor)
            let passwordSementara = ''
            if (!akun) {
                passwordSementara = idAcak(10)
                akun = buatAkun({ username: 'u' + nomor.slice(-10), password: passwordSementara, nomor, jid: pemilikJid, nama: b.pemilikNama || '', role: roleDariNomor(nomor) })
            }
            catatLog('grup', `Grup seleksi "${g.nama}" dibuat via bot`, { slug: g.slug })
            simpan()
            return send(res, 200, {
                ok: true, slug: g.slug, idAkun: idAkunPemilik(g),
                url: `https://${hostSeleksi()}/${idAkunPemilik(g)}/${g.slug}`,
                panelUrl: `https://${hostSeleksi()}/${idAkunPemilik(g)}/${g.slug}/seleksi`,
                akunWeb: { id: akun.id, username: akun.username, passwordSementara, baru: Boolean(passwordSementara) },
            })
        }

        /* Pemilik menambah field kustom (via bot: /fieldseleksi) */
        if (p === '/api/sinkron/field' && method === 'POST') {
            const b = await jsonBody(req)
            const g = grupBySlug(b.grupSlug || '')
            if (!g) return send(res, 404, { error: 'Grup tidak ditemukan.' })
            if (b.aksi === 'hapus') {
                const idx = g.fields.findIndex(f => f.kunci === b.kunci)
                if (idx < 0) return send(res, 404, { error: 'Field tidak ditemukan.' })
                if (g.fields.length <= 1) return send(res, 400, { error: 'Minimal satu kolom.' })
                const [hapus] = g.fields.splice(idx, 1)
                simpan()
                return send(res, 200, { ok: true, dihapus: hapus.kunci })
            }
            const kunci = slugAman(b.kunci || b.label).replace(/-/g, '_').slice(0, 24)
            if (!kunci) return send(res, 400, { error: 'Nama kolom tidak valid.' })
            const ada = g.fields.find(f => f.kunci === kunci)
            if (ada) { ada.label = String(b.label || ada.label).slice(0, 40); ada.wajib = Boolean(b.wajib) }
            else g.fields.push({ kunci, label: String(b.label || kunci).slice(0, 40), tipe: b.tipe === 'angka' ? 'angka' : 'teks', wajib: Boolean(b.wajib) })
            simpan()
            return send(res, 200, { ok: true, fields: g.fields.map(f => f.kunci) })
        }

        /* Info grup seleksi sebuah chat WA + bolehkah menambah helper */
        if (p === '/api/sinkron/grup-info' && method === 'GET') {
            const chatJid = String(url.searchParams.get('chatJid') || '')
            const jid = String(url.searchParams.get('jid') || '')
            const g = Object.values(d.grup).find(x => x.grupTujuanJid === chatJid)
            if (!g) return send(res, 200, { ok: true, grup: null, boleh: false, fields: [] })
            const nomorPengirim = jid.split('@')[0].replace(/\D/g, '')
            const boleh = g.pemilikJid === jid || nomorDeveloper().includes(nomorPengirim)
            return send(res, 200, {
                ok: true, slug: g.slug, grup: g.slug, boleh,
                fields: g.fields.map(f => f.kunci),
            })
        }

        /* Cek akses pemilik seleksi untuk pesan bot */
        if (p === '/api/sinkron/akses' && method === 'GET') {
            const jid = String(url.searchParams.get('jid') || '')
            const grupSlug = String(url.searchParams.get('grup') || '')
            const g = grupBySlug(grupSlug)
            if (!g) return send(res, 200, { ok: false, akses: 'tidak' })
            const nomor = jid.split('@')[0].replace(/\D/g, '')
            if (nomorDeveloper().includes(nomor)) return send(res, 200, { ok: true, akses: 'owner' })
            if (g.pemilikJid === jid) return send(res, 200, { ok: true, akses: 'pemilik' })
            if (g.helper[jid] || Object.values(g.helper).some(h => h.nomor === nomor)) return send(res, 200, { ok: true, akses: 'helper' })
            return send(res, 200, { ok: false, akses: 'tidak' })
        }

        return send(res, 404, { error: 'Endpoint sinkron tidak dikenal.' })
    }

    return false
}

function g_serverKey(pendaftar) {
    const g = grupBySlug(pendaftar.grupSlug)
    return g ? String(g.serverKey || '') : ''
}

function terapkanAksi(pendaftar, grup, aksi, oleh) {
    pendaftar.status = aksi === 'acc' ? 'diterima' : 'ditolak'
    pendaftar.oleh = oleh?.jid || oleh?.username || ''
    pendaftar.ditangani = new Date().toISOString()
    pendaftar.antar = false
    if (aksi === 'acc') grup.statistik.acc += 1
    else grup.statistik.tolak += 1
}

function ringkasAkun(akun) {
    return { id: akun.id, username: akun.username, nama: akun.nama, role: akun.role, nomor: akun.nomor, bio: akun.bio, foto: akun.foto ? '/api/foto/akun/' + akun.foto : '' }
}

/* ── penyaji utama ─────────────────────────────────────────────────────── */

export async function layaniSeleksi(req, res) {
    if (!hostDikenali(req.headers ? req.headers.host : '')) return false
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH') {
        send(res, 405, { error: 'Metode tidak didukung.' })
        return true
    }
    let jalur = '/'
    try { jalur = decodeURIComponent(String(req.url || '/').split('?')[0].split('#')[0]) } catch { jalur = '/' }
    const url = (() => { try { return new URL(req.url || '/', 'http://lokal') } catch { return null } })()
    if (!url) { send(res, 400, { error: 'URL tidak valid.' }); return true }

    if (jalur.startsWith('/api/')) {
        try {
            const hasil = await routeApi(req, res, url)
            if (hasil === false) send(res, 404, { error: 'Endpoint tidak ditemukan.' })
        } catch (error) {
            console.log('[SELEKSI-API]', error?.message || error)
            try { send(res, 500, { error: 'Kesalahan server.' }) } catch { /* sudah terkirim */ }
        }
        return true
    }

    /* SPA untuk semua jalur halaman: /, /<idAkun>/<slug>, /<idAkun>/<slug>/seleksi */
    send(res, 200, spa(), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    return true
}

export default { layaniSeleksi, hostDikenali }
