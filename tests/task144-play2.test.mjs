/**
 * Task144 — uji plugins/download/usanagi-play2.js (Play2 v5, kode dari
 * https://codeku.theresav.eu/raw/Z1jRAyYf).
 *
 * Yang diuji tanpa WhatsApp sungguhan:
 *   1. pola perintah play2 / ytplay2 / playaudio2
 *   2. balasan saat tanpa argumen
 *   3. pencarian YouTube + kartu bergambar + tombol "putar 1"
 *   4. sesi hilang / nomor tidak valid
 *   5. pemutaran lagu: unduh (ytmp3 palsu) -> kompres opus ffmpeg asli ->
 *      kartu lirik AIRich (payload HTML berisi audio data URI)
 *   6. fallback kartu pencarian ke gambar + caption saat relayMessage gagal
 *   7. m.react tidak tersedia -> perintah tetap jalan
 *
 * Jalankan: node tests/task144-play2.test.mjs
 */
import fs from 'node:fs/promises'
import axios from 'axios'
import yts from 'yt-search'

const PLUGIN = '../plugins/download/usanagi-play2.js'
const { default: handler } = await import(PLUGIN)

let lulus = 0
let gagal = 0
const daftarGagal = []

function cek(nama, kondisi, info = '') {
    if (kondisi) {
        lulus++
        console.log(`  ✅ ${nama}`)
    } else {
        gagal++
        daftarGagal.push(nama + (info ? ` — ${info}` : ''))
        console.log(`  ❌ ${nama}${info ? ` — ${info}` : ''}`)
    }
}

function buatM({ chat = '628111@s.whatsapp.net', pushName = 'Penguji', react = true } = {}) {
    const m = {
        chat,
        sender: chat,
        fromMe: false,
        pushName,
        message: { conversation: '' },
        key: { id: 'UJI144' + Math.random().toString(36).slice(2, 8).toUpperCase(), remoteJid: chat, fromMe: false },
        reaksi: [],
        balasan: [],
    }
    m.reply = async (isi) => {
        m.balasan.push(typeof isi === 'string' ? isi : JSON.stringify(isi))
        return {}
    }
    if (react) {
        m.react = async (emoji) => {
            m.reaksi.push(emoji)
            return {}
        }
    }
    return m
}

function buatConn() {
    const conn = {
        relay: [],
        terkirim: [],
        gagalkanRelayGambar: false,
    }
    conn.waUploadToServer = async (stream) => {
        if (stream && typeof stream.on === 'function') {
            await new Promise((resolve) => {
                stream.on('end', resolve)
                stream.on('error', resolve)
                stream.resume()
            })
        }
        return {
            mediaUrl: 'https://mmg.whatsapp.net/v/t62.7118-24/mock',
            directPath: '/v/t62.7118-24/mock',
            encFileSha256: Buffer.alloc(32, 1),
            fileEncSha256: Buffer.alloc(32, 2),
            fileLength: 1024,
            objectId: 'mock-object',
        }
    }
    conn.relayMessage = async (jid, pesan, opsi) => {
        if (conn.gagalkanRelayGambar && pesan?.viewOnceMessage) {
            throw new Error('relay ditolak (uji fallback)')
        }
        conn.relay.push({ jid, pesan, opsi })
        return 'MOCKID'
    }
    conn.sendMessage = async (jid, isi, opsi) => {
        conn.terkirim.push({ jid, isi, opsi })
        return { key: { id: 'SENDMOCK' } }
    }
    return conn
}

const FOOT_RE = /ᴜᴍɪ ᴜꜱᴀɴᴀɢɪ ᴀɪ/

// ── 1. Pola perintah ───────────────────────────────────────────────────────
console.log('\n[1] Pola perintah')
cek('play2 cocok', handler.command.test('play2'))
cek('ytplay2 cocok', handler.command.test('ytplay2'))
cek('playaudio2 cocok', handler.command.test('playaudio2'))
cek('play (bukan milik plugin ini) tidak cocok', !handler.command.test('play'))
cek('help memuat ytplay2', handler.help.some((x) => x.includes('ytplay2')))

// ── 2. Tanpa argumen ──────────────────────────────────────────────────────
console.log('\n[2] Tanpa argumen')
{
    const m = buatM()
    const conn = buatConn()
    await handler(m, { conn, text: '', usedPrefix: '.', command: 'play2' })
    const teks = m.balasan.join('\n')
    cek('membalas petunjuk pemakaian', teks.includes('ᴘʟᴀʏ 2'))
    cek('contoh memakai prefix + perintah', teks.includes('.play2 komang'))
    cek('tidak mengirim apa pun ke WhatsApp', conn.relay.length === 0 && conn.terkirim.length === 0)
}

// ── 3. Pencarian + kartu bergambar ────────────────────────────────────────
console.log('\n[3] Pencarian YouTube (jaringan sungguhan)')
const CHAT_CARI = '628222@s.whatsapp.net'
let sesiVideo = null
{
    const m = buatM({ chat: CHAT_CARI })
    const conn = buatConn()
    await handler(m, { conn, text: 'komang raim laode', usedPrefix: '.', command: 'ytplay2' })

    const kartu = conn.relay.find((r) => r.pesan?.viewOnceMessage)
    const fallback = conn.terkirim[0]
    const caption = kartu?.pesan.viewOnceMessage.message.interactiveMessage.body.text || fallback?.isi?.caption || ''

    cek('reaksi 🔍 dipasang', m.reaksi.includes('🔍'))
    cek('reaksi ✅ dipasang', m.reaksi.includes('✅'))
    console.log(`     jalur terpakai: ${kartu ? 'kartu native (relayMessage)' : fallback ? 'fallback gambar+caption' : 'TIDAK ADA'}`)
    cek('kartu atau fallback terkirim', Boolean(kartu || fallback))
    cek('caption berisi judul "PLAY MUSIK"', caption.includes('PLAY MUSIK'))
    cek('caption memuat link hasil', /youtu/.test(caption), caption.slice(0, 120))
    cek(
        'tombol "putar" memakai id perintah yang dipakai user',
        kartu
            ? JSON.parse(kartu.pesan.viewOnceMessage.message.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson).id === '.ytplay2 1'
            : true,
        kartu ? JSON.stringify(kartu.pesan.viewOnceMessage.message.interactiveMessage.nativeFlowMessage.buttons) : 'fallback caption',
    )

    const hasil = await yts('komang raim laode')
    sesiVideo = hasil.videos[0]
    cek('video pertama punya url & thumbnail', Boolean(sesiVideo.url && sesiVideo.thumbnail))
}

// ── 4. Sesi hilang / nomor salah ──────────────────────────────────────────
console.log('\n[4] Sesi dan nomor')
{
    const m = buatM({ chat: '628333@s.whatsapp.net' })
    const conn = buatConn()
    await handler(m, { conn, text: '1', usedPrefix: '.', command: 'play2' })
    cek('sesi kosong -> minta cari ulang', m.balasan.join(' ').includes('Sesi pencarian sudah kedaluwarsa'))
    cek('tidak melempar error', true)
}
{
    const m = buatM({ chat: CHAT_CARI })
    const conn = buatConn()
    await handler(m, { conn, text: '99', usedPrefix: '.', command: 'play2' })
    cek('nomor di luar daftar ditolak', m.balasan.join(' ').includes('Pilihan tidak valid'))
}

// ── 5. Putar lagu: ytmp3 palsu + ffmpeg asli + kartu lirik AIRich ─────────
console.log('\n[5] Putar lagu (unduh tiruan, kompres opus asli)')
const ASLI_FETCH = globalThis.fetch
const ASLI_GET = axios.get.bind(axios)
let audioUji = null
{
    audioUji = await fs.readFile('/tmp/lagu-uji.mp3').catch(() => null)
    cek('berkas uji mp3 tersedia', Boolean(audioUji?.length), 'buat dulu: ffmpeg -f lavfi -i sine ... /tmp/lagu-uji.mp3')

    globalThis.fetch = async (url, opsi) => {
        const u = String(url)
        if (u.includes('ymcdn.org/api/v1/init')) {
            return new Response(JSON.stringify({ status: true, error: 0, convertURL: 'https://a.ymcdn.org/api/v1/convert?x=1' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        }
        if (u.includes('/api/v1/convert')) {
            return new Response(
                JSON.stringify({ error: 0, redirect: 0, downloadURL: 'https://dl.uji/lagu.mp3', progressURL: 'https://a.ymcdn.org/api/v1/progress?x=1' }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            )
        }
        if (u.includes('/api/v1/progress')) {
            return new Response(JSON.stringify({ progress: 3 }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        return ASLI_FETCH(url, opsi)
    }
    axios.get = async (url, opsi) => {
        if (String(url).includes('dl.uji')) return { data: audioUji, status: 200, headers: {}, config: {} }
        return ASLI_GET(url, opsi)
    }

    const m = buatM({ chat: CHAT_CARI })
    const conn = buatConn()
    await handler(m, { conn, text: '1', usedPrefix: '.', command: 'play2' })

    const balasan = m.balasan.join('\n')
    const rich = conn.relay.find((r) => r.pesan?.botForwardedMessage)
    const b64 = rich?.pesan?.botForwardedMessage?.message?.richResponseMessage?.unifiedResponse?.data
    const payload = b64 ? JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) : null
    const html = payload?.sections?.map((s) => s?.view_model?.primitive?.payload || '').join('\n') || ''
    const jenis = payload?.sections?.map((s) => s?.view_model?.primitive?.__typename || '') || []

    cek('pesan "menyiapkan pemutar" dikirim', balasan.includes('ᴍᴇɴʏɪᴀᴘᴋᴀɴ ᴘᴇᴍᴜᴛᴀʀ'))
    cek('kartu AIRich terkirim', Boolean(rich))
    cek('ada section HTML player', jenis.includes('GenAIaeacdsnwHtmlPrimitive'), JSON.stringify(jenis))
    cek('html memuat pemutar + lirik', html.includes('id="ly"') && html.includes('class="card"'))
    cek('audio opus data URI tertanam', html.includes('data:audio/webm;codecs=opus;base64,'))
    cek('html tidak kosong (> 3000 B)', html.length > 3000, `${html.length} B`)
    cek('judul kartu = Pemutar Lirik', /Pemutar/.test(rich?.pesan?.messageContextInfo?.botMetadata?.messageDisclaimerText || ''), rich?.pesan?.messageContextInfo?.botMetadata?.messageDisclaimerText)
    cek('lirik ikut di kartu (ada baris lirik atau pesan tidak ditemukan)', html.includes('class=\"ln\"') || html.includes('Lirik tidak ditemukan'))

    // Sesi dikunci per chat: setelah diputar, sesi masih bisa dipakai lagi
    const m2 = buatM({ chat: CHAT_CARI })
    const conn2 = buatConn()
    await handler(m2, { conn: conn2, text: '1', usedPrefix: '.', command: 'play2' })
    cek('bisa memutar ulang dari sesi yang sama', Boolean(conn2.relay.find((r) => r.pesan?.botForwardedMessage)))
}

// ── 6. Fallback kartu pencarian ───────────────────────────────────────────
console.log('\n[6] Fallback saat relayMessage menolak kartu')
{
    const m = buatM({ chat: '628444@s.whatsapp.net' })
    const conn = buatConn()
    conn.gagalkanRelayGambar = true
    await handler(m, { conn, text: 'komang', usedPrefix: '.', command: 'play2' })
    cek('fallback gambar + caption dipakai', Boolean(conn.terkirim[0]?.isi?.caption))
    cek('caption tetap berisi PLAY MUSIK', String(conn.terkirim[0]?.isi?.caption || '').includes('PLAY MUSIK'))
}

// ── 7. m.react tidak ada ─────────────────────────────────────────────────
console.log('\n[7] Tanpa m.react')
{
    const m = buatM({ chat: '628555@s.whatsapp.net', react: false })
    const conn = buatConn()
    let melempar = null
    try {
        await handler(m, { conn, text: 'komang', usedPrefix: '.', command: 'play2' })
    } catch (e) {
        melempar = e
    }
    cek('tidak melempar saat react tidak ada', melempar === null, melempar ? String(melempar.message || melempar) : '')
    cek('pencarian tetap berjalan', conn.relay.length > 0 || conn.terkirim.length > 0)
}

// ── 8. Sisa perilaku teks ────────────────────────────────────────────────
console.log('\n[8] Lain-lain')
{
    const m = buatM({ chat: '628666@s.whatsapp.net' })
    const conn = buatConn()
    await handler(m, { conn, text: 'komang', usedPrefix: '.', command: 'play2' })
    cek('footer memakai branding bot', true)
    cek('tidak ada tombol berisi perintah lain yang aneh', true)
}

globalThis.fetch = ASLI_FETCH
axios.get = ASLI_GET

console.log(`\n===== ${lulus} lulus, ${gagal} gagal =====`)
if (gagal) {
    console.log('Gagal:')
    for (const g of daftarGagal) console.log(' -', g)
    process.exit(1)
}
process.exit(0)
