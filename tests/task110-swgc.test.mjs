/* Task110 — .swgroup hanya memakai grup yang benar-benar diikuti bot dan
   tidak lagi melempar "Error: forbidden" mentah. */
const plugin = (await import('../plugins/owner/owner-swgc.js')).default

const hasil = []
const cek = (nama, lulus, info = '') => { hasil.push(lulus); console.log(`${lulus ? 'LULUS' : 'GAGAL'} · ${nama}${info ? ' — ' + info : ''}`) }

function buatConn({ gagalGrup = new Set(), ids = ['111@g.us', '222@g.us'] } = {}) {
  const terkirim = []
  const conn = {
    user: { id: '628000@s.whatsapp.net' },
    chats: { '111@g.us': {}, '222@g.us': {}, '999@g.us': { subject: 'grup lama' } },
    groupFetchAllParticipating: async () => Object.fromEntries(ids.map((id, i) => [id, { subject: `Grup ${i + 1}`, participants: [{ id: '1@s.whatsapp.net' }] }])),
    groupMetadata: async (jid) => {
      if (gagalGrup.has(jid)) throw Object.assign(new Error('forbidden'), { data: 403 })
      return { subject: 'Grup', participants: [{ id: '1@s.whatsapp.net' }] }
    },
    relayMessage: async (jid, message, opts) => { terkirim.push({ jid, message, opts }); return 'ok' },
    sendMessage: async () => ({}),
  }
  return { conn, terkirim }
}

function pesan(text) {
  const balasan = []
  return { m: { chat: '111@g.us', sender: '6281@s.whatsapp.net', text, reply: async (t) => { balasan.push(String(t)); return t } }, balasan }
}

// 1. Daftar grup hanya dari grup yang diikuti bot (bukan conn.chats lama)
{
  const { conn } = buatConn()
  const { m, balasan } = pesan('list')
  await plugin(m, { conn, text: 'list' })
  const teks = balasan.join('\n')
  cek('list memuat grup aktif', /Grup 1/.test(teks) && /Grup 2/.test(teks))
  cek('grup lama (conn.chats) tidak ikut tampil', !/999/.test(teks))
}

// 2. Tanpa argumen → tampilkan daftar, bukan error
{
  const { conn } = buatConn()
  const { m, balasan } = pesan('')
  await plugin(m, { conn, text: '' })
  cek('tanpa argumen → daftar grup', /LIST GRUP/.test(balasan.join('\n')))
}

// 3. Kirim status ke grup yang sehat → sukses
{
  const { conn, terkirim } = buatConn()
  const { m, balasan } = pesan('1|Halo semua')
  await plugin(m, { conn, text: '1|Halo semua' })
  cek('kirim status berhasil', terkirim.length === 1 && /berhasil/i.test(balasan.join('\n')), `terkirim=${terkirim.length}`)
  cek('status memakai groupStatusMessageV2', Boolean(terkirim[0]?.message?.groupStatusMessageV2))
}

// 4. Grup yang tidak bisa diakses (403) → pesan jelas, TIDAK melempar
{
  const { conn, terkirim } = buatConn({ gagalGrup: new Set(['111@g.us']) })
  const { m, balasan } = pesan('1|Halo')
  let melempar = null
  try { await plugin(m, { conn, text: '1|Halo' }) } catch (e) { melempar = e }
  cek('403 → tidak melempar error', melempar === null, String(melempar?.message || ''))
  cek('403 → pesan untuk pengguna', /tidak bisa diakses/i.test(balasan.join('\n')), balasan.join(' ').slice(0, 70))
  cek('403 → tidak ada pengiriman', terkirim.length === 0)
}

// 5. Nomor grup di luar daftar → pesan jelas
{
  const { conn } = buatConn()
  const { m, balasan } = pesan('9|Halo')
  await plugin(m, { conn, text: '9|Halo' })
  cek('nomor salah → dijelaskan', /tidak valid/i.test(balasan.join('\n')))
}

const gagal = hasil.filter(x => !x).length
console.log(`\n${hasil.length - gagal}/${hasil.length} lulus`)
process.exit(gagal ? 1 : 0)
