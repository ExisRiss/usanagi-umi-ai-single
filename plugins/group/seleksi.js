/* By AlzRiss - Usanagi Umi AI
 *
 * Task190 — plugin SELEKSI MEMBER GRUP (Umi Alz Seleksi).
 *
 * Perintah:
 *   /seleksi                  → dapat kode + link pendaftaran (di grup tujuan)
 *   /buatseleksi <nama>       → pemilik grup membuat seleksi (di grup tujuan)
 *   /addanggotaseleksi <nomor/@tag> → tambah helper seleksi
 *   /fieldseleksi +<kolom> [label]  → tambah kolom isian
 *   /fieldseleksi hapus <kolom>     → hapus kolom isian
 *   Tombol [Terima]/[Tolak] di pesan notifikasi (id: SELEKSI:ACC/TOLAK:<id>)
 *
 * Semua data tersimpan di server website (umi-alz-seleksi.gwenna.my.id);
 * plugin hanya perantara WA ↔ API sinkron (data/seleksi-sync.json).
 */

import fs from 'fs'
import path from 'path'
import { sendInteractive } from '../../lib/awang-tombol.js'

const BERKAS_SYNC = path.join(process.cwd(), 'data', 'seleksi-sync.json')

function konfig() {
    try {
        const isi = JSON.parse(fs.readFileSync(BERKAS_SYNC, 'utf8'))
        return {
            host: String(isi.host || 'umi-alz-seleksi.gwenna.my.id').replace(/^https?:\/\//, ''),
            secret: String(isi.secret || ''),
        }
    } catch { return null }
}

async function api(jalur, { method = 'GET', body, query } = {}) {
    const cfg = konfig()
    if (!cfg || !cfg.secret) throw new Error('Konfigurasi seleksi (data/seleksi-sync.json) belum ada di server.')
    const url = new URL('https://' + cfg.host + jalur)
    if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Sinkron-Secret': cfg.secret },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(25000),
    })
    const data = await res.json().catch(() => ({ error: 'Respons tidak valid' }))
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status))
    return data
}

async function unduhFoto(relPath) {
    const cfg = konfig()
    if (!cfg || !relPath) return null
    try {
        const res = await fetch('https://' + cfg.host + relPath, { signal: AbortSignal.timeout(20000) })
        if (!res.ok) return null
        return Buffer.from(await res.arrayBuffer())
    } catch { return null }
}

function botKey(conn) {
    return String(conn?.user?.id || '').split(':')[0].replace(/\D/g, '') || 'bot'
}

/* ── kirim notifikasi pendaftar baru ke grup tujuan ── */

async function kirimNotifikasi(conn, p) {
    const meta = await conn.groupMetadata(p.grup.tujuanJid).catch(() => null)
    const admin = (meta?.participants || []).filter(x => x.admin).map(x => x.id).filter(Boolean)
    const foto = await unduhFoto(p.foto)
    const kv = Object.entries(p.data || {}).map(([k, v]) => `• ${k}: ${v}`).join('\n')
    const isi = `📋 *PENDAFTAR BARU*\n\n${kv}\n\nKode: ${p.kode}\nWaktu: ${new Date(p.waktu).toLocaleString('id-ID')}\nPanel: ${p.grup.url}/seleksi`
    const opsi = {
        title: `🎯 Seleksi — ${p.grup.nama}`,
        subtitle: 'Pendaftar menunggu tinjauan',
        body: isi,
        footer: 'Umi Alz Seleksi',
        mentions: admin,
        buttons: [
            { label: '✅ Terima', command: 'SELEKSI:ACC:' + p.id },
            { label: '❌ Tolak', command: 'SELEKSI:TOLAK:' + p.id },
            { label: '🌐 Buka panel', type: 'url', url: p.grup.url + '/seleksi' },
        ],
        fallbackToText: true,
    }
    if (foto) opsi.image = foto
    else opsi.body = (admin.length ? admin.map(j => '@' + j.split('@')[0]).join(' ') + '\n' : '') + isi
    await sendInteractive(conn, p.grup.tujuanJid, opsi)
    await api('/api/sinkron/antar', { method: 'POST', body: { idPendaftar: p.id } }).catch(() => {})
    console.log(`[SELEKSI] Notifikasi pendaftar ${p.id} terkirim ke ${p.grup.nama}`)
}

let timerPoll = null
function mulaiPoller(conn) {
    if (timerPoll) return
    const jalan = async () => {
        try {
            if (!global.mainBotEnabled && conn !== global.conn) return
            const r = await api('/api/sinkron/pending', { query: { server: botKey(conn) } })
            for (const p of (r.pendaftar || [])) {
                try { await kirimNotifikasi(conn, p) } catch (e) {
                    console.log('[SELEKSI] Gagal kirim notifikasi:', e?.message || e)
                }
            }
        } catch { /* server website sedang tidak siap — coba lagi nanti */ }
    }
    timerPoll = setInterval(jalan, 14000)
    timerPoll.unref?.()
    setTimeout(jalan, 8000).unref?.()
}

/* ── handler ── */

async function tanganiTombol(m, conn) {
    const tombol = String(m.text || '').trim().match(/^SELEKSI:(ACC|TOLAK):([A-Za-z0-9]+)$/i)
    if (!tombol) return false
    const aksi = tombol[1].toLowerCase() === 'acc' ? 'acc' : 'tolak'
    const idPendaftar = tombol[2]
    try {
        const hasil = await api('/api/sinkron/aksi', {
            method: 'POST',
            body: { idPendaftar, aksi, olehJid: m.sender, olehNama: m.name || m.sender.split('@')[0] },
        })
        if (aksi === 'acc' && hasil.pendaftar?.jid && hasil.grup?.tujuanJid) {
            try {
                await conn.groupParticipantsAdd(hasil.grup.tujuanJid, [hasil.pendaftar.jid])
                await conn.reply(m.chat, `✅ *Diterima!* ${hasil.pendaftar.data?.nama || hasil.pendaftar.nomor || ''} resmi masuk grup.`, m)
            } catch (e) {
                await conn.reply(m.chat, `✅ Data diterima, tapi penambahan otomatis gagal (${e?.message || e}). Tambah manual atau kirim link undangan.`, m)
            }
            try {
                await conn.sendMessage(hasil.pendaftar.jid, {
                    text: `🎉 Selamat! Pendaftaranmu di *${hasil.grup.nama}* DITERIMA. Selamat bergabung!`,
                })
            } catch { /* DM gagal — bukan kritis */ }
        } else {
            if (aksi === 'tolak' && hasil.pendaftar?.jid && hasil.grup?.tujuanJid) {
                const meta = await conn.groupMetadata(hasil.grup.tujuanJid).catch(() => null)
                if ((meta?.participants || []).some(x => x.id === hasil.pendaftar.jid)) {
                    await conn.groupParticipantsRemove(hasil.grup.tujuanJid, [hasil.pendaftar.jid]).catch(() => {})
                }
            }
            await conn.reply(m.chat, `❌ Pendaftar *ditolak*.${hasil.pendaftar?.data?.nama ? ' (' + hasil.pendaftar.data.nama + ')' : ''}`, m)
        }
    } catch (e) {
        await conn.reply(m.chat, `⚠️ ${e?.message || e}`, m)
    }
    return true
}

const handler = async (m, { conn, args, usedPrefix, command, text }) => {
    const cmd = String(command || '').toLowerCase()

    if (cmd === 'seleksi') {
        if (!m.isGroup) return m.reply('Jalankan /seleksi di grup tujuan ya.')
        const r = await api('/api/sinkron/kode', {
            method: 'POST',
            body: { chatJid: m.chat, senderJid: m.sender, senderNama: m.name, serverKey: botKey(conn) },
        })
        await conn.reply(m.chat,
            `📝 *PENDAFTARAN SELEKSI — ${r.namaGrup}*\n\n` +
            `Kode kamu: *${r.kode}*\n` +
            `Link: ${r.url}\n\n` +
            `1. Salin kode & buka link\n` +
            `2. Isi nama, umur, kelas, agama, hobi, tujuan join + foto\n` +
            `3. Tunggu admin grup meninjau`, m)
        return
    }

    if (cmd === 'buatseleksi') {
        if (!m.isGroup) return m.reply('Buat seleksi di grup tujuan ya.')
        if (!args[0]) return m.reply(`Pembuatan grup seleksi:\n${usedPrefix}buatseleksi <nama grup seleksi> [deskripsi]`)
        const nama = args[0]
        const deskripsi = args.slice(1).join(' ')
        const r = await api('/api/sinkron/grup', {
            method: 'POST',
            body: {
                chatJid: m.chat, nama, deskripsi,
                pemilikJid: m.sender, pemilikNama: m.name,
                serverKey: botKey(conn),
            },
        })
        let balasan = `🎯 *Grup seleksi dibuat${r.sudah ? ' (sudah ada — memakai yang lama)' : ''}*\n\n` +
            `Nama: ${nama}\n` +
            `Link pendaftaran: ${r.url}\n` +
            `Panel seleksi: ${r.panelUrl}\n\n` +
            `Pesan /seleksi di grup ini untuk membagikan kode ke calon member.`
        if (r.akunWeb?.passwordSementara) {
            balasan += `\n\nAkun web pemilik dibuat otomatis:\n• Username: ${r.akunWeb.username}\n• Password sementara dikirim ke pesan pribadi — segera ganti di menu Profil.`
            await conn.sendMessage(m.sender, {
                text: `🔑 *AKUN WEB SELEKSI*\n\nUsername: ${r.akunWeb.username}\nPassword: ${r.akunWeb.passwordSementara}\n\nBuka ${r.panelUrl} → masuk → ganti password di Profil. Simpan token akun untuk integrasi.`,
            }).catch(() => {})
        }
        await conn.reply(m.chat, balasan, m)
        return
    }

    if (cmd === 'addanggotaseleksi' || cmd === 'addanggota') {
        if (!m.isGroup) return m.reply('Jalankan di grup tujuan seleksi.')
        const target = (m.mentionedJid && m.mentionedJid[0]) || (args[0] ? String(args[0]).replace(/\D/g, '') + '@s.whatsapp.net' : null)
        if (!target) return m.reply(`Pemakaian: ${usedPrefix}addanggotaseleksi <nomor>\nAtau tag langsung: ${usedPrefix}addanggotaseleksi @user`)
        /* Hanya pemilik grup seleksi (atau developer) yang boleh. */
        const r = await api('/api/sinkron/grup-info', { query: { chatJid: m.chat } }).catch(() => null)
        if (r && !r.grup) return m.reply('Grup ini belum punya seleksi. Jalankan /buatseleksi dulu.')
        if (r && !r.boleh) return m.reply('Hanya pemilik grup seleksi yang boleh menambah anggota. Minta akses ke pemilik.')
        const nomor = target.split('@')[0]
        const hasil = await api('/api/sinkron/helper', {
            method: 'POST',
            body: { grupSlug: r?.slug, nomor, olehJid: m.sender, nama: m.name },
        })
        await conn.reply(m.chat,
            `✅ *${nomor}* ditambahkan sebagai anggota seleksi${hasil.akunWebDitemukan ? ' (akun web sudah ada — langsung aktif)' : '. Kalau dia belum punya akun web, suruh daftar di website dengan nomor yang sama.'}`, m)
        return
    }

    if (cmd === 'fieldseleksi') {
        if (!m.isGroup) return m.reply('Jalankan di grup tujuan seleksi.')
        const r = await api('/api/sinkron/grup-info', { query: { chatJid: m.chat } }).catch(() => null)
        if (!r?.grup) return m.reply('Grup ini belum punya seleksi.')
        if (!r.boleh) return m.reply('Hanya pemilik grup seleksi yang boleh mengatur kolom.')
        if (!args[0]) return m.reply(`Kolom saat ini: ${r.fields.join(', ')}\n\nTambah: ${usedPrefix}fieldseleksi +tinggi Badan "Tinggi badan"\nHapus: ${usedPrefix}fieldseleksi hapus kelas`)
        if (args[0].toLowerCase() === 'hapus' || args[0].toLowerCase() === 'hapus') {
            const kunci = String(args[1] || '').toLowerCase()
            if (!kunci) return m.reply('Sebut kolom yang mau dihapus.')
            const hasil = await api('/api/sinkron/field', { method: 'POST', body: { grupSlug: r.slug, aksi: 'hapus', kunci } })
            return m.reply(`🗑️ Kolom dihapus. Sisa: ${hasil.fields.join(', ')}`)
        }
        if (args[0].startsWith('+')) {
            const kunci = args[0].slice(1)
            const label = args.slice(1).join(' ') || kunci
            const hasil = await api('/api/sinkron/field', { method: 'POST', body: { grupSlug: r.slug, kunci, label } })
            return m.reply(`➕ Kolom ditambahkan. Sekarang: ${hasil.fields.join(', ')}`)
        }
        return m.reply(`Pakai: ${usedPrefix}fieldseleksi +<kolom> [label] atau ${usedPrefix}fieldseleksi hapus <kolom>`)
    }

    return
}

handler.before = async function (m, { conn }) {
    if (!m.text || typeof m.text !== 'string') return
    try { await tanganiTombol(m, conn || this) } catch (e) { console.log('[SELEKSI] tombol error:', e?.message || e) }
}

handler.command = /^(seleksi|buatseleksi|addanggotaseleksi|addanggota|fieldseleksi)$/i
handler.help = ['seleksi', 'buatseleksi <nama>', 'addanggotaseleksi <nomor/@tag>', 'fieldseleksi +<kolom>']
handler.tags = ['group']
handler.group = true
handler.customPrefix = [/^\W/]  // Task188 — semua prefix simbol dikenali
handler.description = 'Sistem seleksi member grup — website umi-alz-seleksi.gwenna.my.id'

/* Poller notifikasi — mulai saat plugin dimuat (butuh global.conn siap). */
if (global.conn) mulaiPoller(global.conn)
setTimeout(() => { if (global.conn) mulaiPoller(global.conn) }, 15000).unref?.()

export default handler
