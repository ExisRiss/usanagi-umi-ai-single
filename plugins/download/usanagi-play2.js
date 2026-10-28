/**
 * play2 / ytplay2 — Usanagi Umi AI (Task144)
 *
 * Sumber asli: https://codeku.theresav.eu/raw/Z1jRAyYf ("play fix html", Play2 v5)
 * Base script: https://github.com/Nakano-pdf/itsuki-base
 *
 * Perintah:
 *   .play2 <judul lagu>   -> cari 10 hasil, kirim kartu bergambar + tombol putar
 *   .play2 <nomor>        -> pilih hasil terakhir: thumbnail, audio penuh, kartu lirik
 *   .ytplay2              -> alias yang sama (diminta Task144)
 *
 * Yang diadaptasi untuk bot ini (selain itu logika tetap punya kode sumber):
 *   1. AIRich di lib/ui/MessageBuilder.js tidak menerima objek view_model mentah,
 *      jadi dipakai AIRich.newLayout('Single', {...}) yang menghasilkan bentuk sama.
 *   2. ffmpeg dicari dulu lewat @ffmpeg-installer, baru 'ffmpeg' dari PATH.
 *   3. relayMessage kartu pencarian diberi fallback (gambar + caption biasa),
 *      supaya kalau button native ditolak WhatsApp fitur tidak mati.
 *   4. Pesan "sesi habis"/"pilihan tidak valid" dibalas langsung, tidak dilempar
 *      sebagai error, supaya tidak berubah jadi teks "Error" mentah.
 */

'use strict'

import axios from 'axios'
import yts from 'yt-search'
import { spawn } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'
import { prepareWAMessageMedia } from '@rexxhayanasi/elaina-baileys'
import { AIRich } from '../../lib/ui/MessageBuilder.js'

// ffmpeg: di server bot binernya ada di node_modules/@ffmpeg-installer.
// Kalau tidak ketemu, pakai 'ffmpeg' dari PATH seperti plugin lain.
const _require = createRequire(import.meta.url)
const FFMPEG_BIN = (() => {
    if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
    try {
        const inst = _require('@ffmpeg-installer/ffmpeg')
        if (inst?.path) return inst.path
    } catch {}
    return 'ffmpeg'
})()

// m.react bisa tidak ada di beberapa jalur (mis. pesan sistem). Jangan
// sampai satu reaksi yang gagal membatalkan seluruh perintah.
const react = (m, emoji) => Promise.resolve(m?.react?.(emoji)).catch(() => {})

const FOOT = '\n\n> ~ **ᴜᴍɪ ᴜꜱᴀɴᴀɢɪ ᴀɪ** 🌸'
const SESSION_MS = 5 * 60 * 1000
const LYRIC_MAX_LINES = 150
const LRCLIB = 'https://lrclib.net/api'
const LRCLIB_USER_AGENT = 'AnyaMD-Play2/1.0 (https://github.com/)'
const OPUS_MIME = 'audio/webm;codecs=opus'
const OPUS_CHAIN = ['16k'] // Dikunci di 16k
const MAX_B64_BYTES = 800_000
const sessions = new Map()

// ── Rich Card & Util Bawaan ────────────────────────────────────────────────

const TRUSTED_SOURCES = [
    'https://i.pinimg.com',
    'https://vamxapi.my.id',
]

const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

async function sendRichCard(conn, m, { title, footer, html, imageUrl }) {
    const rich = new AIRich(conn).setTitle(title).setFooter(footer || '')
    if (imageUrl) rich.addImage(imageUrl)
    // newLayout('Single', primitive) menghasilkan
    // { view_model: { __typename: 'GenAISingleLayoutViewModel', primitive } }
    // yaitu bentuk yang sama dengan kode sumber.
    rich.addSection(AIRich.newLayout('Single', {
        __typename: 'GenAIaeacdsnwHtmlPrimitive',
        trusted_sources: TRUSTED_SOURCES,
        payload: html,
    }))
    return rich.send(m.chat, { quoted: m })
}

const fmtTime = (sec) => {
    const s = Math.max(0, Math.floor(sec))
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function fmtNumber(v) {
    if (v === null || v === undefined || v === '') return ''
    const n = Number(String(v).replace(/[^\d.-]/g, ''))
    return isNaN(n) ? '' : n.toLocaleString('id-ID')
}

function toDataUri(buf) {
    if (!buf || buf.length < 4) return ''
    if (buf[0] === 0x89 && buf[1] === 0x50) return `data:image/png;base64,${buf.toString('base64')}`
    if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
        return `data:image/webp;base64,${buf.toString('base64')}`
    }
    return `data:image/jpeg;base64,${buf.toString('base64')}`
}

// ── YouTube Search & Scraper ───────────────────────────────────────────────

async function searchYouTube(q) {
    const search = await yts(q)
    if (!search || !search.videos.length) return []
    
    return search.videos.slice(0, 10).map(v => ({
        url: v.url,
        title: v.title,
        duration: v.timestamp,
        duration_seconds: v.duration.seconds,
        thumbnail: v.thumbnail,
        views: v.views,
        published: v.ago,
        author: { name: v.author.name }
    }))
}

function extractVideoId(url) {
    if (!url) return null;
    let match = null;

    if (url.includes('youtube.com/shorts/') || url.includes('youtu.be/')) {
        match = /\/([a-zA-Z0-9_-]{11})/.exec(url);
    } else if (url.includes('youtube.com')) {
        match = /v=([a-zA-Z0-9_-]{11})/.exec(url);
    } else {
        match = /([a-zA-Z0-9_-]{11})/.exec(url);
    }

    return match ? match[1] : null;
}

function pesanErrorYtmp3(json) {
    const err = json?.error
    if (!err) return ''
    if (typeof err === 'string') return err
    if (typeof err === 'object') return err.message || err.code || JSON.stringify(err).slice(0, 200)
    return String(err)
}

async function scrapeYtmp3(youtubeUrl, format = 'mp3') {
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) throw new Error('URL YouTube tidak valid.');
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Origin': 'https://id.ytmp3.mobi',
        'Referer': 'https://id.ytmp3.mobi/'
    };

    try {
        const initRes = await fetch(`https://a.ymcdn.org/api/v1/init?p=y&23=1llum1n471&_=${Math.random()}`, { headers });
        const initJson = await initRes.json();

        // Di kode asli cuma `initJson.error > 0`. Padahal ytmp3 bisa membalas
        // error sebagai OBJEK {id, code, message}; `> 0` bernilai false, lalu
        // kode lanjut dengan convertURL undefined dan meledak jadi
        // "Failed to parse URL from undefined...". Sekarang diperiksa benar.
        const initError = pesanErrorYtmp3(initJson)
        if (initError) throw new Error(`init: ${initError}`)
        if (!initJson?.convertURL) throw new Error('init: convertURL tidak ada di respons')

        let convertRequestUrl = `${initJson.convertURL}&v=${videoId}&f=${format}&_=${Math.random()}`;
        let convertJson;
        let putaran = 0;

        while (true) {
            if (++putaran > 10) throw new Error('redirect ytmp3 terlalu banyak');
            const convertRes = await fetch(convertRequestUrl, { headers });
            convertJson = await convertRes.json();

            if (convertJson.redirect > 0 && convertJson.redirectURL) {
                convertRequestUrl = `${convertJson.redirectURL}&v=${videoId}&f=${format}&_=${Math.random()}`;
                continue;
            }
            break;
        }

        const convertError = pesanErrorYtmp3(convertJson)
        if (convertError) throw new Error(`convert: ${convertError}`)
        if (!convertJson.downloadURL) throw new Error('Download URL tidak ditemukan.');

        let progress = 0;
        let pollCount = 0;

        while (progress < 3 && pollCount < 60) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            pollCount++;
            const progressRes = await fetch(convertJson.progressURL, { headers });
            const progressJson = await progressRes.json();
            progress = progressJson.progress;
        }

        if (progress < 3) throw new Error('Waktu tunggu habis (Timeout).');
        return convertJson.downloadURL;
    } catch (error) {
        throw new Error(`Scraper Error: ${error.message}`);
    }
}

// Jalur kedua: yt-dlp milik bot (lib/awang-ytdlp.js). Dipakai kalau ytmp3
// menolak IP server. Hasilnya berkas sementara, jadi langsung dibaca lalu dihapus.
async function downloadYouTubeAudioYtDlp(track) {
    const { ytDlpExtractAudio } = await import('../../lib/awang-ytdlp.js')
    const file = await ytDlpExtractAudio(track.url, 25 * 1024 * 1024, { prefix: 'play2' })
    try {
        const buf = await fs.readFile(file)
        if (!buf?.length) throw new Error('berkas hasil yt-dlp kosong')
        return buf
    } finally {
        await fs.unlink(file).catch(() => {})
    }
}

async function downloadYouTubeAudio(track) {
    let galatYtmp3 = null
    try {
        const downloadUrl = await scrapeYtmp3(track.url, 'mp3');
        const res = await axios.get(downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 60000,
            headers: { 'Referer': 'https://id.ytmp3.mobi/' }
        });
        const buf = Buffer.from(res.data);
        if (buf.length > 1024) return buf;
        galatYtmp3 = new Error(`berkas dari ytmp3 terlalu kecil (${buf.length} B)`);
    } catch (e) {
        galatYtmp3 = e;
    }

    try {
        return await downloadYouTubeAudioYtDlp(track)
    } catch (e) {
        throw new Error(`Gagal mengunduh audio: ytmp3 (${galatYtmp3?.message || galatYtmp3}) | yt-dlp (${e.message})`)
    }
}

async function fetchThumb(url) {
    if (!url) return null
    try {
        const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000, maxContentLength: 5 * 1024 * 1024 })
        return Buffer.from(data)
    } catch { return null }
}

// ── Kompres Opus + Cek Limit ─────────────────────────

function compressOpus(inputBuffer, { bitrate, trimSec = 0, label = 'audio' }) {
    return new Promise(async (resolve, reject) => {
        const tmpDir = os.tmpdir()
        const safe = String(label).replace(/[^a-zA-Z0-9]/g, '') || 'audio'
        const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const inPath = path.join(tmpDir, `op_in_${safe}_${stamp}.tmp`)
        const outPath = path.join(tmpDir, `op_out_${safe}_${stamp}.webm`)

        const cleanup = async () => {
            try { await fs.unlink(inPath) } catch {}
            try { await fs.unlink(outPath) } catch {}
        }

        try { await fs.writeFile(inPath, inputBuffer) }
        catch (e) { await cleanup(); return reject(new Error(`tulis input: ${e.message}`)) }

        const args = [
            '-y', '-i', inPath,
            ...(trimSec > 0 ? ['-t', String(trimSec)] : []),
            '-vn', '-ac', '1', '-ar', '48000', // Mono
            '-c:a', 'libopus', '-b:a', bitrate, '-vbr', 'on',
            '-application', 'audio', '-frame_duration', '60', '-compression_level', '10',
            outPath,
        ]

        const ff = spawn(FFMPEG_BIN, args)
        let stderr = ''

        ff.stderr.on('data', (d) => { stderr += d.toString() })
        ff.on('error', async (e) => { await cleanup(); reject(new Error(`ffmpeg error: ${e.message}`)) })
        ff.on('close', async (code) => {
            if (code !== 0) { await cleanup(); return reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`)) }
            try {
                const out = await fs.readFile(outPath)
                await cleanup()
                if (!out?.byteLength) throw new Error('output kosong')
                resolve(out)
            } catch (e) { await cleanup(); reject(e) }
        })
    })
}

async function compressWithFallback(inputBuffer, durationSec, label) {
    let best = null
    for (const bitrate of OPUS_CHAIN) {
        const buf = await compressOpus(inputBuffer, { bitrate, label })
        const b64 = Math.ceil(buf.length * 4 / 3)
        best = { buf, bitrate, b64len: b64, trimSec: 0 }
        if (b64 <= MAX_B64_BYTES) return best
    }

    const targetRaw = Math.floor(MAX_B64_BYTES * 3 / 4)
    const ratio = Math.min(1, targetRaw / best.buf.length) * 0.9
    const trimSec = Math.max(90, Math.floor(durationSec * ratio))
    const buf = await compressOpus(inputBuffer, { bitrate: OPUS_CHAIN[0], trimSec, label })
    const b64 = Math.ceil(buf.length * 4 / 3)
    if (b64 <= MAX_B64_BYTES) return { buf, bitrate: OPUS_CHAIN[0], b64len: b64, trimSec }
    return best
}

// ── Lirik (LRCLIB) & Pembersih Judul ───────────────────────────────────────

function cleanTrackInfo(title, artist) {
    let cleanTitle = String(title || '')
    let cleanArtist = String(artist || '')

    if (cleanTitle.includes(' - ')) {
        const parts = cleanTitle.split(' - ')
        cleanArtist = parts[0].trim()
        cleanTitle = parts.slice(1).join(' - ').trim()
    }

    cleanTitle = cleanTitle.replace(/\(Official.*?\)|\[Official.*?\]|\(Lyric.*?\)|\[Lyric.*?\]|\(Audio.*?\)|\[Audio.*?\]/gi, '').trim()
    if (cleanArtist.toLowerCase() === 'youtube') cleanArtist = ''

    return { cleanTitle, cleanArtist }
}

async function getLyrics(title, artist, durationSec, album = '') {
    const { cleanTitle, cleanArtist } = cleanTrackInfo(title, artist)
    if (!cleanTitle) return null

    const headers = { 'User-Agent': LRCLIB_USER_AGENT, Accept: 'application/json' }
    const queries = [
        `${cleanTitle} ${cleanArtist}`.trim(),
        cleanTitle,
        `${cleanArtist} ${cleanTitle}`.trim()
    ].filter(Boolean)

    try {
        const params = new URLSearchParams({ track_name: cleanTitle, artist_name: cleanArtist })
        if (album) params.set('album_name', String(album).trim())
        if (durationSec > 0) params.set('duration', String(Math.round(durationSec)))

        const exact = await axios.get(`${LRCLIB}/get`, { params, timeout: 12000, headers }).catch(() => null)
        const exactData = exact?.data
        if (exactData?.syncedLyrics || exactData?.plainLyrics) {
            return { synced: exactData.syncedLyrics || '', plain: exactData.plainLyrics || '' }
        }

        const candidates = []
        for (const q of queries) {
            const response = await axios.get(`${LRCLIB}/search`, {
                params: { q }, timeout: 12000, headers
            }).catch(() => null)
            if (Array.isArray(response?.data)) candidates.push(...response.data)
            const synced = candidates.find(item => item?.syncedLyrics)
            if (synced) return { synced: synced.syncedLyrics, plain: synced.plainLyrics || '' }
        }

        const normalized = (value) => String(value || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
        const wantTitle = normalized(cleanTitle)
        const wantArtist = normalized(cleanArtist)

        candidates.sort((a, b) => {
            const score = item => {
                const t = normalized(item.trackName)
                const ar = normalized(item.artistName)
                return (t === wantTitle ? 4 : t.includes(wantTitle) || wantTitle.includes(t) ? 2 : 0)
                    + (!wantArtist || ar === wantArtist ? 3 : ar.includes(wantArtist) || wantArtist.includes(ar) ? 1 : 0)
                    + (item.syncedLyrics ? 5 : item.plainLyrics ? 1 : 0)
            }
            return score(b) - score(a)
        })

        const hit = candidates.find(item => item?.syncedLyrics) || candidates.find(item => item?.plainLyrics)
        if (hit) return { synced: hit.syncedLyrics || '', plain: hit.plainLyrics || '' }
    } catch (error) {
        console.error('[PLAY2] LRCLIB error:', error?.message || error)
    }
    return null
}

function parseLrc(lrc) {
    if (!lrc || typeof lrc !== 'string') return []
    const lines = []
    for (const rawLine of lrc.split(/\r?\n/)) {
        const text = rawLine.replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g, (tag, mm, ss, fraction) => '')
        const stamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
        if (!stamps.length) continue
        const lyric = text.trim() || '♪'
        for (const stamp of stamps) {
            const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0
            lines.push({ time: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction, text: lyric })
        }
    }
    return lines.sort((a, b) => a.time - b.time)
}

// ── Kartu Pemutar (Web Audio API) ──────────────────────────────────────────

function buildPlayerHtml(track, lyr, { thumb = '', audioDataUri = '', totalSec = 0, bitrate = '', isTrimmed = false } = {}) {
    let lines = []
    let mode = 'none'

    if (lyr?.synced) {
        lines = parseLrc(lyr.synced)
        if (lines.length) mode = 'synced'
    }

    if (!lines.length && lyr?.plain) {
        lines = String(lyr.plain).split('\n').map((x) => x.trim()).filter(Boolean).map((text) => ({ time: null, text }))
        mode = 'plain'
    }

    const total = totalSec || Math.floor((track.durationMs || 0) / 1000) || 180
    if (isTrimmed) lines = lines.filter((l) => l.time === null || l.time <= total)

    if (mode === 'plain' && total > 0 && lines.length) {
        lines = lines.map((l, i) => ({ time: Math.round((i * total / lines.length) * 10) / 10, text: l.text }))
        mode = 'estimated'
    }

    lines = lines.slice(0, LYRIC_MAX_LINES)

    const body = lines.length
        ? lines.map((l, i) => `<div class="ln" data-i="${i}">${esc(l.text)}</div>`).join('')
        : '<div class="none">Lirik tidak ditemukan untuk lagu ini 😢</div>'

    const label = isTrimmed ? `🎬 Trim ${fmtTime(total)}` : (bitrate ? `🎧 Opus ${bitrate}` : '')
    const hint = audioDataUri
        ? `Tekan ▶ untuk memutar audio. Lirik mengikuti posisi lagu.`
        : 'Audio tidak tersedia. Pemutar hanya sebagai penanda waktu lirik.'

    const data = JSON.stringify(lines.map((l) => ({ t: l.time, x: l.text })))
        .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

    const thumbHtml = thumb ? `<img class="th" src="${thumb}" alt="">` : ''
    const audioHtml = audioDataUri ? `<audio id="audio-src" preload="auto" src="${audioDataUri}"></audio>` : ''

    const detailParts = [track.album || 'YouTube']
    if (track.views) detailParts.push(`👁️ ${fmtNumber(track.views)}`)
    if (track.published) detailParts.push(`📅 ${track.published}`)

    return `
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent!important}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#fff;padding:2px}
.card{max-width:380px;margin:0 auto;border-radius:20px;overflow:hidden;background:linear-gradient(170deg,#1d1030,#0a0812 70%);border:2px solid rgba(255,255,255,.08)}
.hd{display:flex;gap:12px;align-items:center;padding:14px 16px 6px}
.th{width:72px;height:72px;border-radius:12px;object-fit:cover;flex:none;box-shadow:0 4px 14px rgba(0,0,0,.5)}
.hi{min-width:0}
.tt{font-size:16px;font-weight:800;line-height:1.25;word-break:break-word}
.ar{font-size:12px;opacity:.8;margin-top:3px}
.ab{font-size:10.5px;opacity:.55;margin-top:2px;line-height:1.3}
.badge{display:inline-block;font-size:10px;padding:2px 7px;border-radius:6px;background:rgba(255,77,122,.15);color:#ff8ba6;margin-top:5px}
.now{padding:10px 16px 0;text-align:center;min-height:74px}
.cur{font-size:18px;font-weight:800;line-height:1.35;min-height:48px;display:flex;align-items:center;justify-content:center}
.nxt{font-size:12px;opacity:.45;min-height:16px;margin-top:2px}
.tm{display:flex;justify-content:space-between;font-size:11px;opacity:.7;padding:6px 16px 0;font-variant-numeric:tabular-nums}
.bar{display:block;width:calc(100% - 32px);margin:4px 16px 0;accent-color:#ff4d7a}
.ctl{display:flex;gap:6px;padding:8px 12px 10px}
.btn{flex:1;border:0;border-radius:12px;padding:9px 6px;font-size:12px;font-weight:700;color:#fff;background:rgba(255,255,255,.1);cursor:pointer}
.btn.p{background:#ff4d7a;flex:1.4}
.btn:active{transform:scale(.97)}
.btn:disabled{opacity:.6;cursor:not-allowed}
.ly{position:relative;height:200px;overflow-y:auto;padding:4px 16px 50px;scroll-behavior:smooth;mask-image:linear-gradient(transparent,#000 10%,#000 90%,transparent)}
.ln{font-size:14px;line-height:1.5;padding:5px 0;color:rgba(255,255,255,.35);cursor:pointer;transition:color .2s,font-size .2s}
.ln.on{color:#fff;font-size:16px;font-weight:800}
.ln.past{color:rgba(255,255,255,.55)}
.none{font-size:13px;opacity:.7;padding:20px 0;text-align:center}
.st{font-size:10.5px;opacity:.55;text-align:center;padding:0 12px 12px}
</style>
<div class="card">
  ${audioHtml}
  <div class="hd">
    ${thumbHtml}
    <div class="hi">
      <div class="tt">${esc(track.title)}</div>
      <div class="ar">${esc(track.artist)}</div>
      <div class="ab">${detailParts.join(' · ')}</div>
      ${label ? `<div class="badge">${esc(label)}</div>` : ''}
    </div>
  </div>
  <div class="now">
    <div class="cur" id="cur">Tekan ▶ untuk mulai</div>
    <div class="nxt" id="nxt"></div>
  </div>
  <div class="tm"><span id="ct">00:00</span><span>${fmtTime(total)}</span></div>
  <input class="bar" id="bar" type="range" min="0" max="${total}" step="0.1" value="0">
  <div class="ctl">
    <button class="btn" id="rw" disabled>−5 dtk</button>
    <button class="btn p" id="pp" disabled>▶ Play</button>
    <button class="btn" id="ff" disabled>+5 dtk</button>
  </div>
  <div class="ly" id="ly">${body}</div>
  <div class="st" id="status">${hint}</div>
</div>
<script>
(function(){
  var L=${data}, MODE='${mode}', TOTAL=${total};
  var ly=document.getElementById('ly');
  var rows=ly.querySelectorAll('.ln');
  var cur=document.getElementById('cur'), nxt=document.getElementById('nxt');
  var bar=document.getElementById('bar'), ct=document.getElementById('ct');
  var pp=document.getElementById('pp');
  var btnRw=document.getElementById('rw'), btnFf=document.getElementById('ff');
  var statusDiv=document.getElementById('status');
  var elSrc=document.getElementById('audio-src');
 
  var pos=0, playing=false, last=Date.now(), seeking=false, lastIdx=-2;
  var audioCtx = null;
  var audioBuffer = null;
  var sourceNode = null;
  var isDecoded = false;
  var startCtxTime = 0;
  var pauseOffset = 0;
  var isLoading = false;

  function ensureContext() {
    if (audioCtx) return audioCtx;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) { statusDiv.textContent = 'Web Audio tidak didukung'; return null; }
    audioCtx = new Ctor();
    return audioCtx;
  }

  function dataUriToArrayBuffer(dataUri) {
    var commaIndex = dataUri.indexOf(',');
    var base64 = commaIndex >= 0 ? dataUri.slice(commaIndex + 1) : dataUri;
    var binary = atob(base64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function decodeAudio() {
    return new Promise(function(resolve, reject) {
      try {
        var arrayBuffer = dataUriToArrayBuffer(elSrc.src);
        var promise = audioCtx.decodeAudioData(arrayBuffer,
          function(buffer) {
            audioBuffer = buffer;
            isDecoded = true;
            bar.max = buffer.duration;
            resolve(buffer);
          },
          function(err) { reject(err || new Error('decode error')); }
        );
        if (promise && typeof promise.then === 'function') {
          promise.then(function(buffer) {
             if (!isDecoded) { audioBuffer = buffer; isDecoded = true; bar.max = buffer.duration; resolve(buffer); }
          }, function(){});
        }
      } catch (err) { reject(err); }
    });
  }

  function stopSource() {
    if (sourceNode) {
      try { sourceNode.onended = null; sourceNode.stop(); } catch(e){}
      try { sourceNode.disconnect(); } catch(e){}
      sourceNode = null;
    }
  }

  function startPlayback(offset) {
    stopSource();
    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(audioCtx.destination);
    var safeOffset = Math.max(0, Math.min(offset, audioBuffer.duration - 0.1));
    sourceNode.start(0, safeOffset);
    startCtxTime = audioCtx.currentTime - safeOffset;
    pauseOffset = safeOffset;
    playing = true;
    isLoading = false;
    setBtn();
  }

  async function loadAndDecode() {
    if (!elSrc || !elSrc.src) return;
    isLoading = true;
    statusDiv.textContent = 'Memuat audio...';
    try {
      var ctx = ensureContext();
      if (ctx.state === 'suspended') await ctx.resume();
      await decodeAudio();
      pp.disabled = false;
      btnRw.disabled = false;
      btnFf.disabled = false;
      statusDiv.textContent = 'Audio siap! Tekan Play.';
      isLoading = false;
    } catch (e) {
      statusDiv.textContent = '❌ Gagal decode: ' + e.message;
      isLoading = false;
    }
  }

  if(elSrc) loadAndDecode();

  function fmt(s){s=Math.max(0,Math.floor(s));var m=Math.floor(s/60),r=s%60;return (m<10?'0':'')+m+':'+(r<10?'0':'')+r}
  function idxAt(t){var i=-1;for(var k=0;k<L.length;k++){if(L[k].t===null)continue;if(L[k].t<=t)i=k;else break}return i}
  function setBtn(){pp.textContent=playing?'⏸ Pause':'▶ Play'}

  function render(){
    if(!seeking){bar.value=pos;ct.textContent=fmt(pos)}
    if(MODE==='synced'||MODE==='estimated'){
      var i=idxAt(pos);
      cur.textContent=i>=0?L[i].x:'· · ·';
      nxt.textContent=i+1<L.length?L[i+1].x:'';
      if(i!==lastIdx){
        lastIdx=i;
        for(var j=0;j<rows.length;j++){
          rows[j].classList.toggle('on',j===i);
          rows[j].classList.toggle('past',j<i)
        }
        if(i>=0&&rows[i]){
          var el=rows[i];
          ly.scrollTo({top:el.offsetTop-ly.clientHeight/2+el.clientHeight/2,behavior:'smooth'})
        }
      }
    } else if(MODE==='plain'){cur.textContent='Lirik tanpa penanda waktu';nxt.textContent=''}
    else {cur.textContent='🎶 '+fmt(pos);nxt.textContent=''}
  }

  function step(){
    var n=Date.now();
    if (isDecoded && playing && audioCtx) {
      pos = audioCtx.currentTime - startCtxTime;
      if (pos >= audioBuffer.duration) {
        pos = audioBuffer.duration;
        playing = false;
        stopSource();
        setBtn();
      }
    } else if (playing) {
      pos += (n - last) / 1000;
      if (pos >= TOTAL) { pos = TOTAL; playing = false; }
    }
    last = n; setBtn(); render();
  }

  function seekTo(t){
    t = Math.max(0, Math.min(TOTAL, t));
    if (isDecoded && playing) {
      startPlayback(t);
    } else {
      pauseOffset = t; pos = t;
    }
    last = Date.now(); render();
  }

  pp.onclick = async function(){
    if (isLoading) return;
    if (!isDecoded) return;
    var ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') await ctx.resume();
    if (playing) {
      pauseOffset = audioCtx.currentTime - startCtxTime;
      stopSource();
      playing = false;
      setBtn();
    } else {
      if (pauseOffset >= audioBuffer.duration) pauseOffset = 0;
      startPlayback(pauseOffset);
    }
  }
 
  btnRw.onclick=function(){seekTo(pos-5)};
  btnFf.onclick=function(){seekTo(pos+5)};
  bar.oninput=function(){seeking=true;ct.textContent=fmt(parseFloat(this.value))};
  bar.onchange=function(){seeking=false;seekTo(parseFloat(this.value))};
  ly.onclick=function(e){
    var el=e.target.closest?e.target.closest('.ln'):null;
    if(!el)return;
    var i=parseInt(el.getAttribute('data-i'),10);
    if(L[i]&&L[i].t!==null)seekTo(L[i].t)
  };

  render();setInterval(step,250)
})()
</script>`
}

async function sendPlayerCard(m, conn, track, lyr, opts) {
    const html = buildPlayerHtml(track, lyr, opts)
    try {
        return await sendRichCard(conn, m, {
            title: '🎶 Pemutar Lirik',
            footer: `${track.artist} · ${track.title}`,
            html,
        })
    } catch (e) {
        console.log('[PLAY2] kartu gagal, fallback teks:', e?.message || e)
    }
   
    if (!lyr) return m.reply(`📜 *ʟɪʀɪᴋ*\n\n_Lirik tidak ditemukan..._ 😢${FOOT}`)
    const plain = lyr.synced ? parseLrc(lyr.synced).map(l => `[${fmtTime(l.time)}] ${l.text}`).join('\n') : lyr.plain
    const chunks = plain.match(/[\s\S]{1,3000}/g) || []
    for (const c of chunks) await m.reply(c + FOOT)
}

// ── Proses Putar ───────────────────────────────────────────────────────────

async function processPlay(m, conn, url) {
    try {
        const sess = sessions.get(m.chat)
        if (!sess || Date.now() - sess.createdAt > SESSION_MS) {
            sessions.delete(m.chat)
            await react(m, '❌')
            return m.reply(`⌛ *ꜱᴇꜱɪ ʙᴇʀᴀᴋʜɪʀ* 🌸\n\nSesi pencarian sudah kedaluwarsa atau hilang. Cari ulang ya~${FOOT}`)
        }

        const videoData = sess.results.find(v => v.url === url)
        if (!videoData) {
            await react(m, '❌')
            return m.reply(`⚠️ Video tidak ditemukan di sesi. Cari ulang ya~${FOOT}`)
        }

        sess.createdAt = Date.now()
        await react(m, '🎧')
        await m.reply(`🎧 *ᴍᴇɴʏɪᴀᴘᴋᴀɴ ᴘᴇᴍᴜᴛᴀʀ...* 🪸\n\n_${videoData.title}_\n_⏳ Unduh & kompres audio, tunggu 15–40 detik..._${FOOT}`)
        
        const durationSec = videoData.duration_seconds || 0
        let artist = videoData.author.name || 'YouTube'
        let title = videoData.title

        if (title.includes(' - ')) {
            const parts = title.split(' - ')
            artist = parts[0].trim()
            title = parts.slice(1).join(' - ').trim()
        }

        title = title.replace(/\(Official.*?\)|\[Official.*?\]|\(Lyric.*?\)/gi, '').trim()

        const [lyrR, thumbR, audioR] = await Promise.allSettled([
            getLyrics(title, artist, durationSec),
            fetchThumb(videoData.thumbnail),
            downloadYouTubeAudio(videoData),
        ])

        const lyrics = lyrR.status === 'fulfilled' ? lyrR.value : null
        const thumb = thumbR.status === 'fulfilled' ? thumbR.value : null
        const rawAudio = audioR.status === 'fulfilled' ? audioR.value : null
        let audioDataUri = ''
        let audioMeta = null

        if (rawAudio && rawAudio.length > 0) {
            try {
                const c = await compressWithFallback(rawAudio, durationSec || 0, videoData.title)
                audioDataUri = `data:${OPUS_MIME};base64,${c.buf.toString('base64')}`
                audioMeta = c
            } catch (e) {
                console.error('[PLAY2] kompres gagal:', e)
            }
        }

        await sendPlayerCard(m, conn, {
            title,
            artist,
            album: 'YouTube',
            views: videoData.views,
            published: videoData.published,
            durationMs: durationSec * 1000
        }, lyrics, {
            thumb: toDataUri(thumb),
            audioDataUri,
            totalSec: audioMeta?.trimSec || durationSec,
            isTrimmed: !!(audioMeta?.trimSec),
            bitrate: audioMeta?.bitrate || '',
        })
        
        await react(m, '✅')
    } catch (err) {
        console.error('[PLAY2] Error fatal di processPlay:', err)
        await react(m, '❌')
        m.reply(`❌ Gagal memproses lagu: ${err.message}`)
    }
}

// ── Main Handler ────────────────────────────────────────────────────────────

let handler = async (m, { conn, text, usedPrefix, command }) => {
    let query = text?.trim()

    if (!query) {
        return m.reply(`🎵 *ᴘʟᴀʏ 2*\n\nContoh:\n• ${usedPrefix + command} komang\n• ${usedPrefix + command} 1  (pilih dari hasil pencarian terakhir)\n\n_Pencarian berlaku 5 menit._${FOOT}`)
    }

    // Ini buat nangkep kalau url langsung (misal dari sisa script lama)
    if (query.startsWith('putar-play2 ')) {
        const url = query.replace(/^putar-play2\s+/, '').trim()
        return processPlay(m, conn, url)
    }

    // Ini yang akan dipanggil oleh tombol, karena tombol mengirim angka "1"
    if (/^\d+$/.test(query)) {
        const sess = sessions.get(m.chat)
        if (!sess || Date.now() - sess.createdAt > SESSION_MS) {
            return m.reply(`⌛ *ꜱᴇꜱɪ ʙᴇʀᴀᴋʜɪʀ* 🌸\n\nSesi pencarian sudah kedaluwarsa. Silakan cari lagu kembali.${FOOT}`)
        }
        const idx = parseInt(query) - 1
        if (idx < 0 || idx >= sess.results.length) {
            return m.reply(`⚠️ Pilihan tidak valid. Pilih angka 1 - ${sess.results.length}.${FOOT}`)
        }
        return processPlay(m, conn, sess.results[idx].url)
    }

    await react(m, '🔍')

    try {
        const videos = await searchYouTube(query)
        if (!videos.length) throw new Error("Video tidak ditemukan")
       
        const video = videos[0]
        sessions.set(m.chat, { results: videos, createdAt: Date.now() })

        const botName = 'Umi'
        let listTeks = videos.slice(1, 5).map((v, i) => `*${i + 2}.* ${v.title} (${v.duration})`).join('\n')

        const caption = `🍀 **PLAY MUSIK**

Hai **${m.pushName}** 👋

╭┈┈⬡「 🎵 **ᴅᴇᴛᴀɪʟ ᴠɪᴅᴇᴏ** 」
┃ 🎤 **Channel:** ${video.author.name}
┃ ⏱️ **Durasi:** ${video.duration}
┃ 👁️ **Views:** ${fmtNumber(video.views)}
┃ 📅 **Rilis:** ${video.published}
┃ 🔗 **Link:** ${video.url}
╰┈┈┈┈┈┈┈┈⬡

💡 **Pencarian Lainnya:**
${listTeks}

_*Silakan klik tombol di bawah untuk memutar, atau ketik ${usedPrefix}${command} <nomor> untuk memutar lagu lainnya.*_`

        // Header bergambar + tombol putar (kode sumber). Kalau WhatsApp
        // menolak bentuk native flow-nya, jatuh ke gambar + caption biasa.
        let terkirim = false
        try {
            const media = await prepareWAMessageMedia(
                { image: { url: video.thumbnail } },
                { upload: conn.waUploadToServer },
            )

            await conn.relayMessage(
                m.chat,
                {
                    viewOnceMessage: {
                        message: {
                            interactiveMessage: {
                                header: {
                                    imageMessage: media.imageMessage,
                                    hasMediaAttachment: true,
                                },
                                body: { text: caption },
                                footer: { text: `> ~ **${botName}** 🌸` },
                                nativeFlowMessage: {
                                    buttons: [
                                        {
                                            name: 'quick_reply',
                                            buttonParamsJson: JSON.stringify({
                                                display_text: '▶ ᴘᴜᴛᴀʀ ᴀᴜᴅɪᴏ',
                                                id: `${usedPrefix}${command} 1`,
                                            }),
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },
                { quoted: m },
            )
            terkirim = true
        } catch (e) {
            console.error('[PLAY2] kartu pencarian gagal:', e?.message || e)
        }

        if (!terkirim) {
            await conn
                .sendMessage(m.chat, { image: { url: video.thumbnail }, caption }, { quoted: m })
                .catch(() => m.reply(caption))
        }

        await react(m, '✅')
    } catch (err) {
        console.error('[Play2]', err)
        await react(m, '❌')
        m.reply(`❌ *Error*: ${err.message || err}`)
    }
}

handler.help = ['play2 <judul>', 'ytplay2 <judul>', 'play2 <nomor>']
handler.tags = ['downloader']
handler.command = /^(play2|ytplay2|playaudio2)$/i
handler.limit = true
handler.description = 'Cari lagu YouTube, kirim audio + kartu pemutar lirik (Play2 v5)'
export default handler