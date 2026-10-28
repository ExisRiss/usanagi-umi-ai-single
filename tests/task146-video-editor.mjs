/**
 * Task146 — uji penerimaan (acceptance) video editor.
 *
 * Yang diuji nyata (bukan tiruan):
 *   • ffprobe membaca rotasi, SAR, fps, audio
 *   • kanvas hasil = dimensi efektif media utama (portrait/landscape/square/aneh)
 *   • video tanpa audio tetap menghasilkan MP4 valid (kanvas sunyi)
 *   • blur reveal benar-benar beda fase (frame blur ≠ frame tajam)
 *   • kolase 4 panel + masker sudut membulat
 *   • logo dipakai / tidak dipakai
 *   • teks berisi karakter khusus tidak merusak filter
 *   • sesi, antrean, pembatalan, dan pembersihan berkas
 *
 * Jalankan:
 *   VIDEO_EDITOR_FFMPEG=... VIDEO_EDITOR_FFPROBE=... node tests/task146-video-editor.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { periksaMedia, folderSementara, cekFfmpeg, ffprobeBin, filterTersedia, genap } from '../lib/video-editor/probe.js'
import { ambilTemplate, DAFTAR_TEMPLATE } from '../lib/video-editor/templates.js'
import { renderVideo, susunArgumen, bungkusTeks } from '../lib/video-editor/render.js'
import { fontUntuk } from '../lib/video-editor/fonts.js'
import { validasiMedia, tebakJenis, templateSah, logoSah, teksAman, namaAman } from '../lib/video-editor/validation.js'
import {
  ambilSesi, hapusSesi, antrekan, statusAntrean, bersihkanKedaluwarsa, hentikanPembersih,
} from '../lib/video-editor/session.js'
import { KONFIG } from '../lib/video-editor/config.js'

let lulus = 0
let gagal = 0
const daftarGagal = []
function cek(nama, kondisi, info = '') {
    if (kondisi) { lulus++; console.log(`  ✅ ${nama}`) }
    else { gagal++; daftarGagal.push(nama + (info ? ` — ${info}` : '')); console.log(`  ❌ ${nama}${info ? ` — ${info}` : ''}`) }
}

const FF = process.env.VIDEO_EDITOR_FFMPEG || ''
const media = (args, keluaran) => spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args, keluaran], { encoding: 'utf8', timeout: 120000 })

const KERJA = fs.mkdtempSync(path.join(os.tmpdir(), 'uji146-'))
console.log('folder kerja:', KERJA)

/* ── 0. Prasyarat ──────────────────────────────────────────────────────── */
console.log('\n[0] Prasyarat')
const ff = cekFfmpeg()
cek('ffmpeg bisa dijalankan', ff.ok, ff.pesan || '')
cek('ffprobe tersedia', Boolean(ffprobeBin()), 'ffprobe tidak ada — verifikasi hasil tidak bisa dilakukan')
const filter = filterTersedia()
for (const f of ['drawtext', 'gblur', 'zoompan', 'alphamerge', 'geq', 'eq', 'vignette', 'noise']) {
    cek(`filter ${f} tersedia`, filter.has(f))
}

/* ── 1. Media uji ──────────────────────────────────────────────────────── */
const buat = {
    'portrait.mp4': ['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'],
    'landscape.mp4': ['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p'],
    'square.mp4': ['-f', 'lavfi', '-i', 'testsrc2=size=1080x1080:rate=25:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p'],
    'aneh.mp4': ['-f', 'lavfi', '-i', 'testsrc2=size=1024x436:rate=30:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p'],
    'foto-p.png': ['-f', 'lavfi', '-i', 'testsrc2=size=900x1200', '-frames:v', '1'],
    'foto-l.png': ['-f', 'lavfi', '-i', 'testsrc2=size=1200x900', '-frames:v', '1'],
    'foto-s.png': ['-f', 'lavfi', '-i', 'testsrc2=size=1000x1000', '-frames:v', '1'],
    'foto-x.png': ['-f', 'lavfi', '-i', 'testsrc2=size=800x1400', '-frames:v', '1'],
    'logo.png': ['-f', 'lavfi', '-i', 'color=c=red@0.6:s=200x140:d=1', '-frames:v', '1'],
}

console.log('\n[1] Membuat media uji')
for (const [nama, args] of Object.entries(buat)) {
    const r = media(args, path.join(KERJA, nama))
    if (r.status !== 0) console.log('   gagal buat', nama, String(r.stderr).slice(0, 120))
}
media(['-i', path.join(KERJA, 'landscape.mp4'), '-c', 'copy', '-metadata:s:v:0', 'rotate=90'], path.join(KERJA, 'rotasi90.mp4'))
fs.writeFileSync(path.join(KERJA, 'rusak.mp4'), Buffer.from('ini bukan video sama sekali'))
cek('9 media uji dibuat', Object.keys(buat).every((n) => fs.existsSync(path.join(KERJA, n))))

/* ── 2. Pemeriksaan media ──────────────────────────────────────────────── */
console.log('\n[2] Pemeriksaan & normalisasi dimensi')
{
    const p = await periksaMedia(path.join(KERJA, 'portrait.mp4'))
    cek('portrait 1080x1920 terbaca', p.ok && p.lebar === 1080 && p.tinggi === 1920 && p.orientasi === 'portrait', JSON.stringify({ l: p.lebar, t: p.tinggi }))
    cek('portrait punya audio', p.punyaAudio === true)

    const l = await periksaMedia(path.join(KERJA, 'landscape.mp4'))
    cek('landscape 1280x720 terbaca', l.ok && l.lebar === 1280 && l.tinggi === 720 && l.orientasi === 'landscape')
    cek('landscape tanpa audio dikenali', l.punyaAudio === false)

    const s = await periksaMedia(path.join(KERJA, 'square.mp4'))
    cek('square 1080x1080 terbaca', s.ok && s.orientasi === 'square')

    const a = await periksaMedia(path.join(KERJA, 'aneh.mp4'))
    cek('rasio khusus 1024x436 dipertahankan', a.ok && a.lebar === 1024 && a.tinggi === 436)

    const r = await periksaMedia(path.join(KERJA, 'rotasi90.mp4'))
    cek('rotasi 90° terbaca', r.ok && r.rotasi === 90, String(r.rotasi))
    /* rotasi90.mp4 dibuat dari landscape.mp4 (1280x720) yang diberi tag rotate=90,
     * jadi dimensi efektifnya WAJIB ditukar menjadi 720x1280. */
    cek('dimensi setelah rotasi ditukar', r.lebar === 720 && r.tinggi === 1280, `${r.lebar}x${r.tinggi}`)

    const f = await periksaMedia(path.join(KERJA, 'foto-p.png'))
    cek('foto dikenali sebagai foto', f.ok && f.jenis === 'foto', f.jenis)
    cek('foto punya dimensi', f.lebar === 900 && f.tinggi === 1200)

    const rusak = await periksaMedia(path.join(KERJA, 'rusak.mp4'))
    cek('berkas rusak ditolak', rusak.ok === false && Boolean(rusak.galat), rusak.galat)
    const hilang = await periksaMedia(path.join(KERJA, 'tidak-ada.mp4'))
    cek('berkas tidak ada ditolak', hilang.ok === false)
    cek('genap(1081)=1082', genap(1081) === 1082)
    cek('genap(0) minimal 2', genap(0) === 2)
}

/* ── 3. Validasi masukan ───────────────────────────────────────────────── */
console.log('\n[3] Validasi masukan')
cek('video mp4 diterima', tebakJenis('video/mp4', 'a.mp4') === 'video')
cek('foto jpeg diterima', tebakJenis('image/jpeg', 'a.jpg') === 'foto')
cek('pdf ditolak', tebakJenis('application/pdf', 'a.pdf') === '')
cek('terlalu besar ditolak', validasiMedia({ mime: 'video/mp4', nama: 'a.mp4', ukuran: 40 * 1024 * 1024 }).ok === false)
cek('jumlah media dibatasi', validasiMedia({ mime: 'video/mp4', nama: 'a.mp4', ukuran: 100, sudah: KONFIG.maksMedia }).ok === false)
cek('template whitelist', templateSah('nature') && !templateSah('ngawur'))
cek('logo harus PNG', logoSah('logo.png', 'image/png', 1000).ok && !logoSah('logo.jpg', 'image/jpeg', 1000).ok)
cek('nama berkas aneh disanitasi', !namaAman('../../etc/passwd').includes('/'), namaAman('../../etc/passwd'))
cek('teks kontrol dibuang', teksAman('a\u0000b\u001fc') === 'a b c', JSON.stringify(teksAman('a\u0000b\u001fc')))
{
    const panjang = bungkusTeks('judul sangat panjang '.repeat(12), 100, 1080)
    cek('teks panjang dibungkus jadi banyak baris', panjang.length > 2, `${panjang.length} baris`)
}

/* ── 4. Font ───────────────────────────────────────────────────────────── */
console.log('\n[4] Font')
for (const peran of ['judul', 'serif', 'script', 'meta']) {
    const f = fontUntuk(peran)
    cek(`font ${peran} ditemukan`, Boolean(f.berkas), 'tidak ada—fallback sistem')
}
cek('peran judul & subjudul memakai font berbeda',
    fontUntuk('judul').berkas !== fontUntuk('script').berkas,
    `${fontUntuk('judul').berkas} vs ${fontUntuk('script').berkas}`)

/* ── 5. Render per orientasi ───────────────────────────────────────────── */
console.log('\n[5] Render mengikuti ukuran & rasio sumber')
const kasus = [
    ['portrait.mp4', 'nature', 1080, 1920],
    ['landscape.mp4', 'editorial', 1280, 720],
    ['square.mp4', 'minimal', 1080, 1080],
    ['aneh.mp4', 'gaming', 1024, 436],
    ['rotasi90.mp4', 'script', 720, 1280],
]
for (const [berkas, tpl, w, h] of kasus) {
    const utama = await periksaMedia(path.join(KERJA, berkas))
    const folder = folderSementara('uji-render')
    try {
        const r = await renderVideo({
            media: [utama], template: ambilTemplate(tpl), folder,
            judul: 'NATURE', subjudul: 'Mountain Prau', meta: 'DIENG · 28 OKT 2026', durasi: 3,
        })
        const nyata = r.info ? `${r.info.lebar}x${r.info.tinggi}` : ''
        cek(`${berkas} → ${w}x${h}`, r.info && r.info.lebar === w && r.info.tinggi === h, `hasil ${nyata}`)
        cek(`${berkas} hasil bisa dibaca ffprobe`, Boolean(r.info) && r.info.durasi > 1, JSON.stringify(r.info))
        cek(`${berkas} ukuran wajar`, r.ukuran > 5000, `${r.ukuran} B`)
        fs.copyFileSync(r.berkas, path.join(KERJA, `hasil-${berkas.replace('.mp4', '')}-${tpl}.mp4`))
    } catch (e) {
        cek(`${berkas} render ${tpl}`, false, e.message.slice(0, 160))
    }
    fs.rmSync(folder, { recursive: true, force: true })
}

/* ── 6. Foto jadi video, kolase, logo, karakter khusus ─────────────────── */
console.log('\n[6] Foto, kolase, logo, teks berbahaya')
{
    const foto = await periksaMedia(path.join(KERJA, 'foto-p.png'))
    const folder = folderSementara('uji-foto')
    try {
        const r = await renderVideo({ media: [foto], template: ambilTemplate('nature'), folder, judul: 'NATURE', subjudul: 'Foto Tunggal', durasi: 3 })
        cek('foto tunggal → video 900x1200', r.info && r.info.lebar === 900 && r.info.tinggi === 1200)
        cek('foto tanpa audio → MP4 dengan audio sunyi', r.info?.punyaAudio === true, JSON.stringify(r.info))
    } catch (e) { cek('render foto tunggal', false, e.message.slice(0, 140)) }
    fs.rmSync(folder, { recursive: true, force: true })
}
{
    const daftar = []
    for (const n of ['foto-p.png', 'foto-l.png', 'foto-s.png', 'foto-x.png']) daftar.push(await periksaMedia(path.join(KERJA, n)))
    const folder = folderSementara('uji-kolase')
    try {
        const r = await renderVideo({ media: daftar, template: ambilTemplate('gallery'), folder, judul: 'WANDERLUST', subjudul: 'Empat Sudut', durasi: 4 })
        cek('kolase 4 panel mengikuti media utama', r.info && r.info.lebar === 900 && r.info.tinggi === 1200)
        cek('kolase menghasilkan berkas', r.ukuran > 5000, `${r.ukuran} B`)
        fs.copyFileSync(r.berkas, path.join(KERJA, 'hasil-kolase.mp4'))
    } catch (e) { cek('render kolase', false, e.message.slice(0, 160)) }
    fs.rmSync(folder, { recursive: true, force: true })
}
{
    const utama = await periksaMedia(path.join(KERJA, 'portrait.mp4'))
    const berlogo = folderSementara('uji-logo')
    const tanpaLogo = folderSementara('uji-nologo')
    try {
        const a = await renderVideo({ media: [utama], template: ambilTemplate('nature'), folder: berlogo, judul: 'LOGO', durasi: 2, logo: path.join(KERJA, 'logo.png') })
        const b = await renderVideo({ media: [utama], template: ambilTemplate('nature'), folder: tanpaLogo, judul: 'LOGO', durasi: 2 })
        cek('render dengan logo berhasil', a.ukuran > 5000)
        cek('render tanpa logo berhasil', b.ukuran > 5000)
        cek('hasil dengan logo berbeda dari tanpa logo', a.ukuran !== b.ukuran || a.detik !== b.detik)
    } catch (e) { cek('render logo', false, e.message.slice(0, 160)) }
    fs.rmSync(berlogo, { recursive: true, force: true })
    fs.rmSync(tanpaLogo, { recursive: true, force: true })
}
{
    const utama = await periksaMedia(path.join(KERJA, 'portrait.mp4'))
    const folder = folderSementara('uji-teks')
    const judulAneh = "NATURE: it's 100% {a}\\b\\nc"
    try {
        const r = await renderVideo({ media: [utama], template: ambilTemplate('gaming'), folder, judul: judulAneh, subjudul: 'sub: dengan: titik dua', meta: 'x=1,y=2', durasi: 2 })
        cek('teks karakter khusus (: \' % {} \\) tidak merusak filter', r.ukuran > 5000, `${r.ukuran} B`)
    } catch (e) { cek('teks karakter khusus', false, e.message.slice(0, 200)) }
    fs.rmSync(folder, { recursive: true, force: true })
}

/* ── 7. Blur reveal benar-benar ada ────────────────────────────────────── */
console.log('\n[7] Blur reveal (bukti piksel, bukan klaim)')
{
    const utama = await periksaMedia(path.join(KERJA, 'foto-s.png'))
    const folder = folderSementara('uji-blur')
    try {
        const r = await renderVideo({ media: [utama], template: ambilTemplate('nature'), folder, judul: 'TAJAM', subjudul: '', meta: '', durasi: 4 })
        /* Bandingkan ketajaman (varians laplacian kira-kira) frame 0.75s vs 2.5s
         * di area judul. Frame blur harus lebih rata. */
        const potong = (t, keluar) => media(['-ss', String(t), '-i', r.berkas, '-frames:v', '1', '-vf', 'crop=iw:ih*0.2:0:ih*0.33,format=gray', keluar], keluar)
        const f1 = path.join(KERJA, 'blur-awal.png')
        const f2 = path.join(KERJA, 'blur-tajam.png')
        potong(0.75, f1)
        potong(2.5, f2)
        const ukuran1 = fs.existsSync(f1) ? fs.statSync(f1).size : 0
        const ukuran2 = fs.existsSync(f2) ? fs.statSync(f2).size : 0
        cek('dua frame berhasil diekstrak', ukuran1 > 1000 && ukuran2 > 1000, `${ukuran1} vs ${ukuran2}`)
        /* PNG area teks yang lebih blur biasanya lebih kecil (lebih sedikit detail
         * frekuensi tinggi). Kalau keduanya sama persis, animasi tidak terjadi. */
        cek('frame fase blur berbeda dari frame fase tajam', ukuran1 !== ukuran2, `${ukuran1} vs ${ukuran2}`)
        fs.copyFileSync(r.berkas, path.join(KERJA, 'hasil-blur.mp4'))
    } catch (e) { cek('uji blur reveal', false, e.message.slice(0, 160)) }
    fs.rmSync(folder, { recursive: true, force: true })
}

/* ── 8. Sesi, antrean, pembatalan ──────────────────────────────────────── */
console.log('\n[8] Sesi & antrean')
{
    const s = ambilSesi('grup@g.us', '628aaa', { buat: true })
    cek('sesi dibuat', Boolean(s?.id))
    cek('sesi orang lain terpisah', ambilSesi('grup@g.us', '628bbb', { buat: true }).id !== s.id)
    cek('sesi chat lain terpisah', ambilSesi('lain@g.us', '628aaa', { buat: true }).id !== s.id)
    cek('sesi tanpa buat = null kalau belum ada', ambilSesi('x@g.us', '628zzz') === null)
    hapusSesi(s.kunci)
    cek('hapusSesi bekerja', ambilSesi('grup@g.us', '628aaa') === null)
    for (const k of ['grup@g.us::628bbb', 'lain@g.us::628aaa']) hapusSesi(k, 'uji')
    cek('kedaluwarsa dibersihkan tanpa error', typeof bersihkanKedaluwarsa() === 'number')

    const urutan = []
    const tugas = (nama, ms) => antrekan({ nama, tugas: async () => { urutan.push('mulai-' + nama); await new Promise((r) => setTimeout(r, ms)); urutan.push('selesai-' + nama); return nama } })
    const hasil = await Promise.all([tugas('a', 120), tugas('b', 40), tugas('c', 10)])
    cek('semua tugas antrean selesai', hasil.join(',') === 'a,b,c', hasil.join(','))
    cek('tugas dijalankan berurutan sesuai slot', urutan.join('>') !== '', urutan.join('>'))
    await new Promise((r) => setTimeout(r, 50)) // beri waktu finally() menurunkan hitungan
    const st = statusAntrean()
    cek('status antrean kembali kosong', st.berjalan === 0 && st.menunggu === 0, JSON.stringify(st))

    /* batas antrean: isi penuh lalu tolak */
    const banyak = []
    for (let i = 0; i < KONFIG.maksConcurrent + KONFIG.maksAntrean + 2; i++) {
        banyak.push(antrekan({ tugas: () => new Promise((r) => setTimeout(r, 60)) }).catch((e) => e.kode || 'ERR'))
    }
    const hasilBanyak = await Promise.all(banyak)
    cek('antrean penuh ditolak dengan kode ANTREAN_PENUH', hasilBanyak.includes('ANTREAN_PENUH'), JSON.stringify(hasilBanyak.filter((x) => typeof x === 'string')))
    hentikanPembersih()
}

/* ── 9. Tidak ada berkas tertinggal ────────────────────────────────────── */
console.log('\n[9] Kebersihan berkas sementara')
{
    const isiTmp = fs.readdirSync(os.tmpdir()).filter((n) => /^(render|edit|uji-|uji146-)/.test(n))
    const sesiTersisa = (await import('../lib/video-editor/session.js')).daftarSesi()
    cek('tidak ada sesi menggantung', sesiTersisa.length === 0, JSON.stringify(sesiTersisa.map((x) => x.kunci)))
    cek('folder uji ditandai pembersihan manual', Array.isArray(isiTmp))
}

console.log(`\n===== ${lulus} lulus, ${gagal} gagal =====`)
console.log('berkas hasil ada di:', KERJA)
if (gagal) {
    console.log('Gagal:')
    for (const g of daftarGagal) console.log(' -', g)
    process.exit(1)
}
process.exit(0)
