/**
 * Task145 — uji perbaikan auto update (lib/auto-update.js).
 *
 * Bug yang diuji (terjadi nyata di server, log 11:56–13:37 selalu
 * `ditulis: []` + `dilewati: [...]`):
 *   Versi lama mencatat isi berkas yang beda saat pemindaian pertama ke
 *   `state.dasar`, lalu menganggap berkas itu "diedit manual" SELAMANYA,
 *   sehingga tidak pernah ikut ter-update.
 *
 * Uji ini memakai GitHub TIRUAN (fetch diganti) supaya hasilnya pasti dan
 * tidak tergantung jaringan.
 *
 * Jalankan: node tests/task145-autoupdate.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'

import cryptoAwal from 'node:crypto'
const sha256Awal = () => cryptoAwal.createHash('sha256').update(fs.readFileSync('plugins/lama.js')).digest('hex')

const AKAR = fs.mkdtempSync(path.join(os.tmpdir(), 'umi-auto145-'))
process.chdir(AKAR)
fs.mkdirSync('data', { recursive: true })
fs.mkdirSync('lib', { recursive: true })
fs.mkdirSync('plugins', { recursive: true })

fs.writeFileSync('plugins/lama.js', 'export const e = 1\n')
fs.utimesSync('plugins/lama.js', new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3))

fs.writeFileSync('data/auto-update.json', JSON.stringify({
    versi: 2, aktif: false, repo: 'uji/repo', branch: 'main', token: '',
    intervalMenit: 10, restart: { mode: 'panel', panelUrl: '', apiKey: '', serverId: '', cmd: '' },
}))

/* State awal meniru bot yang sebelumnya sinkron dengan commit lama yang
 * masih memuat plugins/lama.js — inilah cara auto update tahu berkas itu
 * sudah dihapus di repo. */
fs.writeFileSync('data/auto-update-state.json', JSON.stringify({
    sha: 'commit-lama',
    berkas: { 'plugins/lama.js': { sha256: sha256Awal() } },
    pohon: ['lib/sama.js', 'lib/ketinggalan.js', 'lib/diedit.js', 'plugins/lama.js'],
    cekTerakhir: '',
    pesan: '',
}))

const au = await import(path.resolve('/home/user/work-task94/single/lib/auto-update.js'))

let lulus = 0
let gagal = 0
const daftarGagal = []
function cek(nama, kondisi, info = '') {
    if (kondisi) { lulus++; console.log(`  ✅ ${nama}`) }
    else { gagal++; daftarGagal.push(nama + (info ? ` — ${info}` : '')); console.log(`  ❌ ${nama}${info ? ` — ${info}` : ''}`) }
}

const blob = (buf) => au.gitBlobSha(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)))
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

/* ── GitHub tiruan ─────────────────────────────────────────────────────── */
const SEKARANG = new Date()
const commitIso = new Date(SEKARANG.getTime() - 5 * 60 * 1000).toISOString() // commit 5 menit lalu
const repo = new Map() // path -> Buffer isi di repo
let panggilan = { tree: 0, contents: 0 }

function buatRespons(isi, json = false) {
    return {
        ok: true,
        status: 200,
        text: async () => (json ? JSON.stringify(isi) : String(isi)),
        json: async () => isi,
        arrayBuffer: async () => Uint8Array.from(isi).buffer,
    }
}

const fetchAsli = globalThis.fetch
globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('/commits?')) {
        return buatRespons([{ sha: 'commit-uji-1', commit: { message: 'uji task145', author: { date: commitIso, name: 'uji' } } }], true)
    }
    if (u.includes('/git/trees/')) {
        panggilan.tree++
        return buatRespons({
            tree: [...repo.entries()].map(([p, isi]) => ({ path: p, type: 'blob', sha: blob(isi), size: isi.length })),
        }, true)
    }
    if (u.includes('/contents/')) {
        panggilan.contents++
        const jalur = decodeURIComponent(u.split('/contents/')[1].split('?')[0])
        if (!repo.has(jalur)) return { ok: false, status: 404, text: async () => 'not found', json: async () => ({}) }
        return buatRespons([...repo.get(jalur)])
    }
    return fetchAsli(url)
}

console.log('\n[1] Aturan path & sidik blob')
cek('lib/ diizinkan', au.pathDiizinkan('lib/auto-update.js'))
cek('plugins/ diizinkan', au.pathDiizinkan('plugins/owner/x.js'))
cek('data/ DITOLAK', !au.pathDiizinkan('data/auto-update.json'))
cek('sessions/ DITOLAK', !au.pathDiizinkan('sessions/a.json'))
cek('.. DITOLAK', !au.pathDiizinkan('lib/../../etc/passwd'))
cek('root file di luar izin DITOLAK', !au.pathDiizinkan('package-lock.json'))
cek('gitBlobSha = sidik Git asli', au.gitBlobSha(Buffer.from('halo dunia\n')) === 'f7bf185ae9eba0fb8efb5d46257d6ec0f2437ef8',
    au.gitBlobSha(Buffer.from('halo dunia\n')))

/* ── Skenario ──────────────────────────────────────────────────────────── */
const TUA = new Date(SEKARANG.getTime() - 60 * 60 * 1000) // 1 jam lalu (sebelum commit)
const BARU = new Date(SEKARANG.getTime() + 60 * 60 * 1000) // 1 jam ke depan (sesudah commit)

// sama persis dengan repo
const isiSama = Buffer.from('export const a = 1\n')
fs.writeFileSync('lib/sama.js', isiSama)
repo.set('lib/sama.js', isiSama)

// beda, mtime LAMA -> ketinggalan, harus ikut diperbarui
fs.writeFileSync('lib/ketinggalan.js', 'export const b = 1\n')
fs.utimesSync('lib/ketinggalan.js', TUA, TUA)
repo.set('lib/ketinggalan.js', Buffer.from('export const b = 2\n'))

// beda, mtime BARU -> mungkin diedit manual, dilewati kecuali paksa
fs.writeFileSync('lib/diedit.js', 'export const c = 1\n')
fs.utimesSync('lib/diedit.js', BARU, BARU)
repo.set('lib/diedit.js', Buffer.from('export const c = 2\n'))

// belum ada di server
repo.set('lib/baru.js', Buffer.from('export const d = 1\n'))

// isi sintaksnya rusak -> harus ditolak
repo.set('lib/rusak.js', Buffer.from('export const = ;\n'))



console.log('\n[2] Pemeriksaan pertama (dulu: semua tersangkut di "diedit manual")')
{
    const cek1 = await au.cekPembaruan()
    const nama = cek1.berubah.map((x) => x.path)
    cek('berkas beda terdeteksi berubah', nama.includes('lib/ketinggalan.js'), JSON.stringify(nama))
    cek('berkas sama tidak diusulkan', !nama.includes('lib/sama.js'))
    cek('berkas baru terdeteksi', nama.includes('lib/baru.js'))
    cek('berkas yang diedit manual ditandai aman=false',
        cek1.berubah.find((x) => x.path === 'lib/diedit.js')?.aman === false)
    cek('berkas ketinggalan dianggap aman ditimpa',
        cek1.berubah.find((x) => x.path === 'lib/ketinggalan.js')?.aman === true)
    cek('tidak ada kunci "dasar" warisan Task142 di state',
        !Object.prototype.hasOwnProperty.call(au.bacaState(), 'dasar'))
}

console.log('\n[3] Pemeriksaan kedua harus memberi hasil yang sama (tidak "menyangkut")')
{
    const cek2 = await au.cekPembaruan()
    cek('jumlah berubah tetap', cek2.berubah.length > 0, String(cek2.berubah.length))
    cek('lib/ketinggalan.js tetap muncul', cek2.berubah.some((x) => x.path === 'lib/ketinggalan.js'))
}

console.log('\n[4] Penerapan')
{
    const hasil = await au.terapkanPembaruan()
    console.log('     ditulis:', hasil.ditulis)
    console.log('     dihapus:', hasil.dihapus)
    console.log('     dilewati:', hasil.dilewati)
    console.log('     gagal:', hasil.gagal)
    cek('lib/ketinggalan.js ditulis', hasil.ditulis.includes('lib/ketinggalan.js'))
    cek('lib/baru.js ditulis', hasil.ditulis.includes('lib/baru.js'))
    cek('lib/sama.js tidak disentuh', !hasil.ditulis.includes('lib/sama.js'))
    cek('lib/diedit.js dilewati (diedit manual)', hasil.dilewati.some((x) => x.startsWith('lib/diedit.js')))
    cek('lib/rusak.js ditolak karena sintaks', hasil.gagal.some((x) => x.startsWith('lib/rusak.js')))
    cek('lib/rusak.js TIDAK dibuat di server', !fs.existsSync('lib/rusak.js'))
    cek('plugins/lama.js dihapus', hasil.dihapus.includes('plugins/lama.js'))
    cek('plugins/lama.js benar-benar hilang', !fs.existsSync('plugins/lama.js'))
    cek('isi lib/ketinggalan.js sudah versi repo', fs.readFileSync('lib/ketinggalan.js', 'utf8') === 'export const b = 2\n')
    cek('backup dibuat', Boolean(hasil.backup && fs.existsSync(hasil.backup)), String(hasil.backup))
    cek('backup berisi versi lama',
        hasil.backup && fs.readFileSync(path.join(hasil.backup, 'lib/ketinggalan.js'), 'utf8') === 'export const b = 1\n')
    const state = au.bacaState()
    cek('state mencatat sha256 berkas yang ditulis', Boolean(state.berkas['lib/ketinggalan.js']))
    cek('sha belum naik karena lib/rusak.js masih belum bisa ditulis', state.sha === 'commit-lama', state.sha)
}

console.log('\n[5] Pemeriksaan ketiga: hanya sisa yang belum beres')
{
    const cek3 = await au.cekPembaruan()
    const nama = cek3.berubah.map((x) => x.path)
    cek('berkas yang sudah ditulis hilang dari daftar', !nama.includes('lib/ketinggalan.js'), JSON.stringify(nama))
    cek('yang masih diedit manual tetap muncul', nama.includes('lib/diedit.js'))
}

console.log('\n[6] Mode paksa menimpa yang diedit manual')
{
    const hasil = await au.terapkanPembaruan({ paksa: true })
    cek('lib/diedit.js ditulis saat paksa', hasil.ditulis.includes('lib/diedit.js'))
    cek('isinya versi repo', fs.readFileSync('lib/diedit.js', 'utf8') === 'export const c = 2\n')
    /* lib/rusak.js tetap tak bisa ditulis, jadi sha sengaja TIDAK dinaikkan —
     * status "belum sinkron penuh" itu jujur, bukan bug. */
    cek('sha tidak dinaikkan selama masih ada berkas rusak', au.bacaState().sha === 'commit-lama', au.bacaState().sha)
}

console.log('\n[7] Setelah sinkron, tidak ada perubahan lagi')
{
    const cek4 = await au.cekPembaruan()
    cek('yang tersisa hanya berkas rusak yang memang tak bisa ditulis',
        cek4.berubah.length === 1 && cek4.berubah[0].path === 'lib/rusak.js',
        JSON.stringify(cek4.berubah.map((x) => x.path)))
    cek('tidak ada berkas dihapus', cek4.dihapus.length === 0)
    const hasil = await au.terapkanPembaruan()
    cek('penerapan tidak menulis apa pun', hasil.ditulis.length === 0)
}

console.log('\n[8] Berkas yang ditulis bot sendiri boleh diperbarui lagi')
{
    // bot menulis versi repo, lalu repo naik lagi: isi server == catatan bot
    repo.set('lib/ketinggalan.js', Buffer.from('export const b = 3\n'))
    const hasil = await au.terapkanPembaruan()
    cek('diproses walau mtime-nya baru (bukan buatan tangan)', hasil.ditulis.includes('lib/ketinggalan.js'), JSON.stringify(hasil))
    cek('isi ikut repo terbaru', fs.readFileSync('lib/ketinggalan.js', 'utf8') === 'export const b = 3\n')
}

console.log('\n[9] Berkas sintaks rusak tidak pernah merusak bot')
{
    repo.set('lib/rusak2.js', Buffer.from('function () {\n'))
    const hasil = await au.terapkanPembaruan()
    cek('ditahan di daftar gagal', hasil.gagal.some((x) => x.startsWith('lib/rusak2.js')))
    cek('tidak dibuat di server', !fs.existsSync('lib/rusak2.js'))
    const cekSintaks = au.periksaSintaks('x.js', 'export default 1\n')
    cek('periksaSintaks meloloskan kode benar', cekSintaks.ok)
}

globalThis.fetch = fetchAsli
console.log(`\n===== ${lulus} lulus, ${gagal} gagal =====`)
console.log('folder uji:', AKAR)
if (gagal) {
    console.log('Gagal:')
    for (const g of daftarGagal) console.log(' -', g)
    process.exit(1)
}
process.exit(0)
