/* By AlzRiss - Usanagi Umi AI
 *
 * Task190 — plugin SELEKSI MEMBER GRUP (Umi Alz Seleksi).
 *
 * Perintah:
 *   /seleksi                  → dapat kode + link pendaftaran (di grup tujuan)
 *   /buatseleksi <nama>       → pemilik grup membuat seleksi (di grup tujuan)
 *   /grupseleksi [nama]       → tandai chat WA ini sebagai grup seleksi (Task194:
 *                               notifikasi + tombol Terima/Tolak masuk ke sini)
 *   /addseleksi <@tag/reply>  → beri akses seleksi + akun web otomatis (Task194;
 *                               alias: addanggotaseleksi)
 *   /fieldseleksi +<kolom> [label]  → tambah kolom isian
 *   /fieldseleksi hapus <kolom>     → hapus kolom isian
 *   /tutorialseleksi           → panduan lengkap (plugin terpisah)
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

function labelKolom(kunci) {
    return String(kunci || '').replace(/_/g, ' ').replace(/\b\p{L}/gu, c => c.toUpperCase())
}

async function kirimNotifikasi(conn, p) {
    /* Task194 — notifikasi masuk ke GRUP SELEKSI (grup WA khusus review),
     * fallback ke grup tujuan bila belum diatur (/grupseleksi). */
    const tujuan = p.grup.seleksiJid || p.grup.tujuanJid
    const meta = await conn.groupMetadata(tujuan).catch(() => null)
    const admin = (meta?.participants || []).filter(x => x.admin).map(x => x.id).filter(Boolean)
    const foto = await unduhFoto(p.foto)
    const kv = Object.entries(p.data || {})
        .filter(([, v]) => String(v ?? '').trim() !== '')
        .map(([k, v]) => `• *${labelKolom(k)}:* ${v}`).join('\n')
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
        fallbackToText: false,   // Task194 — kalau rich gagal, kita kirim teks rapi sendiri
    }
    if (foto) opsi.image = foto
    try {
        await sendInteractive(conn, tujuan, opsi)
    } catch (e) {
        console.log('[SELEKSI] Rich notif gagal, fallback teks:', e?.message || e)
        const sebut = admin.length ? admin.map(j => '@' + j.split('@')[0]).join(' ') + '\n\n' : ''
        if (foto) await conn.sendMessage(tujuan, { image: foto, caption: sebut + isi, mentions: admin })
        else await conn.sendMessage(tujuan, { text: sebut + isi, mentions: admin })
    }
    await api('/api/sinkron/antar', { method: 'POST', body: { idPendaftar: p.id } }).catch(() => {})
    console.log(`[SELEKSI] Notifikasi pendaftar ${p.id} terkirim ke ${tujuan === p.grup.seleksiJid ? 'grup seleksi' : 'grup tujuan'} ${p.grup.nama}`)
}

let timerPoll = null
function mulaiPoller(conn) {
    if (timerPoll) return
    /* Task192 — dua tugas poller:
     *  1) notifikasi pendaftar baru (claim dulu, kirim; gagal → balik antar=true)
     *  2) pendaftar diterima yang belum masuk grup (acc web / acc tombol gagal) */
    const jalan = async () => {
        try {
            if (typeof global.mainBotEnabled === 'boolean' && !global.mainBotEnabled && conn !== global.conn) return
            const r = await api('/api/sinkron/pending', { query: { server: botKey(conn) } })
            for (const p of (r.pendaftar || [])) {
                /* Task194 — hanya kirim kalau bot INI berada di grup target
                 * (grup seleksi bila sudah diatur, fallback grup tujuan). */
                const tujuanKirim = p.grup.seleksiJid || p.grup.tujuanJid
                const punya = await conn.groupMetadata(tujuanKirim).then(() => true).catch(() => false)
                if (!punya) continue
                try {
                    await api('/api/sinkron/antar', { method: 'POST', body: { idPendaftar: p.id } })  // claim
                    await kirimNotifikasi(conn, p)
                } catch (e) {
                    await api('/api/sinkron/antar-batal', { method: 'POST', body: { idPendaftar: p.id } }).catch(() => {})
                    console.log('[SELEKSI] Gagal kirim notifikasi:', e?.message || e)
                }
            }
            const acc = await api('/api/sinkron/acc-pending')
            for (const x of (acc.pendaftar || [])) {
                if (!x.grup?.tujuanJid) continue
                const punya = await conn.groupMetadata(x.grup.tujuanJid).then(() => true).catch(() => false)
                if (!punya) continue
                try {
                    await conn.groupParticipantsUpdate(x.grup.tujuanJid, [x.jid], 'add')
                    await api('/api/sinkron/acc-selesai', { method: 'POST', body: { idPendaftar: x.id } })
                    await conn.reply(x.grup.tujuanJid, `✅ *${x.nama || x.nomor}* resmi masuk grup (acc dari panel web).`, undefined).catch(() => {})
                    try {
                        await conn.sendMessage(x.jid, {
                            text: `🎉 Selamat! Kamu DITERIMA di *${x.grup.nama}*.` + (x.grup.linkUtama ? `\n\nJoin grup utama:\n${x.grup.linkUtama}` : ''),
                        })
                    } catch { /* DM opsional */ }
                } catch (e) {
                    console.log('[SELEKSI] Acc-pending gagal:', e?.message || e)
                }
            }
        } catch { /* server website sedang tidak siap — coba lagi nanti */ }
    }
    timerPoll = setInterval(jalan, 14000)
    timerPoll.unref?.()
    setTimeout(jalan, 8000).unref?.()
    setTimeout(jalan, 30000).unref?.()
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
            let masuk = false
            try {
                await conn.groupParticipantsUpdate(hasil.grup.tujuanJid, [hasil.pendaftar.jid], 'add')
                masuk = true
                await conn.reply(m.chat, `✅ *Diterima!* ${hasil.pendaftar.data?.nama || hasil.pendaftar.nomor || ''} resmi masuk grup.`, m)
            } catch (e) {
                await conn.reply(m.chat, `✅ Data diterima — penambahan otomatis mencoba lagi lewat pengawas (${e?.message || e}).`, m)
            }
            /* Task192 — tandai selesai hanya bila benar-benar masuk; kalau gagal
             * accPending tetap true sehingga poller bot mencoba lagi. */
            if (masuk) await api('/api/sinkron/acc-selesai', { method: 'POST', body: { idPendaftar } }).catch(() => {})
            try {
                const sambutan = `🎉 Selamat! Pendaftaranmu di *${hasil.grup.nama}* DITERIMA.`
                const tautan = hasil.grup.linkUtama ? `\n\nJoin grup utama sekarang:\n${hasil.grup.linkUtama}` : ''
                await conn.sendMessage(hasil.pendaftar.jid, { text: sambutan + tautan })
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
        const kolom = (r.fields && r.fields.length) ? r.fields.join(', ') : 'data diri'
        await conn.reply(m.chat,
            `📝 *PENDAFTARAN SELEKSI — ${r.namaGrup}*\n\n` +
            `Kode kamu: *${r.kode}*\n` +
            `Link: ${r.url}\n\n` +
            `1. Salin kode & buka link\n` +
            `2. Isi ${kolom} + foto\n` +
            `3. Tunggu admin meninjau ( hasilnya dikirim ke grup seleksi )`, m)
        return
    }

    if (cmd === 'buatseleksi') {
        if (!m.isGroup) return m.reply('Buat seleksi di grup tujuan ya.')
        if (!args[0]) return m.reply(`Pembuatan grup seleksi:\n${usedPrefix}buatseleksi <nama> [linkGrupSeleksi] [linkGrupUtama]\nTask192 — dua link opsional agar pendaftar tahu ke mana masuk setelah lolos.`)
        const nama = args[0]
        const linkGrup = /^https?:\/\//.test(args[1] || '') ? args[1] : ''
        const linkUtama = /^https?:\/\//.test(args[2] || '') ? (linkGrup ? args[2] : args[1] || '') : ''
        const r = await api('/api/sinkron/grup', {
            method: 'POST',
            body: {
                chatJid: m.chat, nama, deskripsi: '',
                pemilikJid: m.sender, pemilikNama: m.name,
                serverKey: botKey(conn),
                linkGrup, linkUtama,
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

    if (cmd === 'grupseleksi') {
        if (!m.isGroup) return m.reply('Jalankan perintah ini di grup WhatsApp yang mau dijadikan grup seleksi.')
        const info = await api('/api/sinkron/grup-info', { query: { chatJid: m.chat, jid: m.sender } }).catch(() => null)
        const body = (info?.peranGrup === 'tujuan' && info?.boleh)
            ? { aksi: 'aturSeleksi', seleksiJid: m.chat, olehJid: m.sender, grupSlug: info.slug }
            : { aksi: 'aturSeleksi', seleksiJid: m.chat, olehJid: m.sender, nama: args.join(' ') }
        const r = await api('/api/sinkron/grup', { method: 'POST', body })
        if (r.perluPilih) {
            return m.reply('Kamu punya beberapa grup seleksi — sebut salah satu:\n' +
                r.kandidat.map(k => `• ${k.nama} (\`${k.slug}\`)`).join('\n') +
                `\n\nPakai: ${usedPrefix}grupseleksi <nama>`)
        }
        if (!r.ok) return m.reply('⚠️ ' + (r.error || 'Gagal mengatur grup seleksi.'))
        await conn.reply(m.chat,
            `✅ Grup ini resmi jadi *grup seleksi* untuk *${r.nama}*.\n` +
            `Notifikasi pendaftar baru (lengkap dengan tombol Terima/Tolak) akan masuk ke sini.\n` +
            `Panel: ${r.url}/seleksi`, m)
        return
    }

    if (cmd === 'addseleksi' || cmd === 'addanggotaseleksi' || cmd === 'addanggota') {
        if (!m.isGroup) return m.reply('Jalankan di grup seleksi atau grup tujuan seleksi.')
        const nomorTag = (m.mentionedJid && m.mentionedJid[0]) || (m.quoted && m.quoted.sender) ||
            (args[0] && /^\d{5,}$/.test(String(args[0]).replace(/\D/g, '')) ? String(args[0]).replace(/\D/g, '') + '@s.whatsapp.net' : null)
        if (!nomorTag) return m.reply(`Pemakaian:\n• ${usedPrefix}addseleksi @tag\n• Reply pesan orang lalu ${usedPrefix}addseleksi\n• ${usedPrefix}addseleksi 628xxxx`)
        /* Task194 — pemilik ATAU anggota dengan akses boleh menambah. */
        const r = await api('/api/sinkron/grup-info', { query: { chatJid: m.chat, jid: m.sender } }).catch(() => null)
        if (r && !r.grup) return m.reply('Grup ini belum terhubung seleksi. Jalankan /buatseleksi di grup tujuan, atau /grupseleksi di sini.')
        if (r && !r.boleh) return m.reply('Hanya pemilik grup seleksi atau anggota dengan akses yang boleh menambah. Minta ke pemilik.')
        const nomor = nomorTag.split('@')[0]
        const hasil = await api('/api/sinkron/helper', {
            method: 'POST',
            body: { grupSlug: r?.slug, nomor, olehJid: m.sender, olehNama: m.name, nama: '' },
        })
        if (hasil.akunBaru) {
            await conn.sendMessage(nomorTag, {
                text: `🔑 *AKUN WEB SELEKSI*\n\nKamu ditambahkan ke seleksi *${r?.nama || ''}*.\n` +
                    `Username: ${hasil.akunBaru.username}\nPassword: ${hasil.akunBaru.password}\n\n` +
                    `Panel: ${r?.url ? r.url + '/seleksi' : 'link dari pemilik'} → *Masuk* dengan akun ini.\n` +
                    `Satu akun bisa dipakai di semua grup seleksi tempat kamu ditambahkan. Simpan baik-baik & ganti password di menu Profil.`,
            }).catch(() => {})
        }
        await conn.reply(m.chat,
            `✅ *${nomor}* sekarang punya akses seleksi${hasil.akunBaru ? ' — akun web dibuat otomatis, kredensial dikirim ke DM' : ' (akun web sudah ada, langsung aktif)'}.`, m)
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

handler.command = /^(seleksi|buatseleksi|grupseleksi|addseleksi|addanggotaseleksi|addanggota|fieldseleksi)$/i
handler.help = ['seleksi', 'buatseleksi <nama>', 'grupseleksi [nama]', 'addseleksi <@tag/reply/nomor>', 'fieldseleksi +<kolom>']
handler.tags = ['group']
handler.group = true
/* Task192 — customPrefix dihapus: fitur seleksi mengikuti prefix bot masing-masing
 * (kebijakan Task117). Tombol SELEKSI:ACC/TOLAK tetap tertangkap handler.before
 * yang dipanggil dispatcher tanpa syarat prefix. */
handler.description = 'Sistem seleksi member grup — website umi-alz-seleksi.gwenna.my.id'

/* Poller notifikasi — mulai saat plugin dimuat (butuh global.conn siap). */
if (global.conn) mulaiPoller(global.conn)
setTimeout(() => { if (global.conn) mulaiPoller(global.conn) }, 15000).unref?.()

export default handler
