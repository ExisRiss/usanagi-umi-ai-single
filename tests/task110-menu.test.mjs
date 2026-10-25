/* Task110 — .menu harus mengirim interactiveMessage + nativeFlowMessage
   (tombol yang benar-benar bisa dipencet), BUKAN buttonsMessage legacy. */
const { sendMainMenu } = await import('../lib/umi-menu/router.js')

const hasil = []
const cek = (n, l, i = '') => { hasil.push(l); console.log(`${l ? 'LULUS' : 'GAGAL'} · ${n}${i ? ' — ' + i : ''}`) }

const status = {
  botName: 'Usanagi Umi AI', ownerName: 'AlzRiss', mode: 'public', uptime: 1000,
  platform: 'linux', nodeVersion: 'v22', waVersion: '2.3000', ram: '1 GB', cpu: '1 core',
  commands: 100, aliases: 200, users: 3, groups: 2, premium: 1, plugins: 50,
  connected: true, paired: true, battery: null, latency: 20,
}

function siapkan() {
  const rekam = { relay: [], send: [] }
  const conn = {
    user: { id: '628000000000@s.whatsapp.net' },
    waUploadToServer: async () => ({}),
    relayMessage: async (jid, message, opts) => { rekam.relay.push({ jid, message, opts }); return 'OK' },
    sendMessage: async (jid, content) => { rekam.send.push({ jid, content }); return {} },
  }
  const m = { chat: '628111@s.whatsapp.net', reply: async (t) => { rekam.send.push({ jid: 'reply', content: t }); return t } }
  return { conn, m, rekam }
}

function cariInteractive(message) {
  if (!message) return null
  if (message.interactiveMessage) return message.interactiveMessage
  if (message.viewOnceMessage?.message?.interactiveMessage) return message.viewOnceMessage.message.interactiveMessage
  if (message.viewOnceMessageV2?.message?.interactiveMessage) return message.viewOnceMessageV2.message.interactiveMessage
  if (message.documentMessage || message.imageMessage) return null
  return null
}

// 1. Jalur utama: interactive + native flow
{
  const { conn, m, rekam } = siapkan()
  const out = await sendMainMenu(conn, m, { prefix: '.', status, stats: { commands: 120, aliases: 300 } })
  const pesan = rekam.relay[0]?.message
  const inter = cariInteractive(pesan)
  cek('mode pengiriman = interactive', out?.mode === 'interactive', String(out?.mode))
  cek('tidak memakai buttonsMessage legacy', !pesan?.buttonsMessage)
  cek('ada interactiveMessage', Boolean(inter))
  const tombol = inter?.nativeFlowMessage?.buttons || []
  cek('ada tombol native flow', tombol.length >= 1, `jumlah=${tombol.length}`)
  cek('tombol memakai single_select (daftar asli WhatsApp)', tombol[0]?.name === 'single_select', String(tombol[0]?.name))
  const params = JSON.parse(tombol[0]?.buttonParamsJson || '{}')
  const rows = params?.sections?.[0]?.rows || []
  cek('baris menu membawa perintah ber-prefix', rows.length >= 4 && rows.every(r => String(r.id).startsWith('.')), `baris=${rows.length}`)
  cek('ID baris = perintah yang diproses router', rows.some(r => r.id === '.menu_all') && rows.some(r => r.id === '.menu_owner'))
  cek('body berisi teks menu', String(inter?.body?.text || '').includes('MENU UTAMA'))
}

// 2. Kalau relay interactive ditolak → harus ada cadangan, bukan crash
{
  const rekam = { relay: [], send: [] }
  let gagalSekali = true
  const conn = {
    user: { id: '628000000000@s.whatsapp.net' },
    waUploadToServer: async () => ({}),
    relayMessage: async (jid, message) => {
      rekam.relay.push({ jid, message })
      if (gagalSekali && cariInteractive(message)) { gagalSekali = false; throw new Error('406 not-acceptable') }
      return 'OK'
    },
    sendMessage: async (jid, content) => { rekam.send.push({ jid, content }); return {} },
  }
  const m = { chat: '628222@s.whatsapp.net', reply: async (t) => { rekam.send.push({ jid: 'reply', content: t }); return t } }
  let melempar = null
  let out
  try { out = await sendMainMenu(conn, m, { prefix: '.', status, stats: { commands: 1, aliases: 2 } }) } catch (e) { melempar = e }
  cek('interactive ditolak → tidak melempar error', melempar === null, String(melempar?.message || ''))
  cek('interactive ditolak → ada pesan terkirim', rekam.relay.length + rekam.send.length >= 2, `relay=${rekam.relay.length} send=${rekam.send.length}`)
  cek('interactive ditolak → mode cadangan jelas', ['list', 'text'].includes(out?.mode), String(out?.mode))
}

const gagal = hasil.filter(x => !x).length
console.log(`\n${hasil.length - gagal}/${hasil.length} lulus`)
process.exit(gagal ? 1 : 0)
