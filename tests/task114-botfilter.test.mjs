/* Task114 — filter Auto-AI terhadap pesan sesama bot.
 * Uji nyata memakai modul asli (bukan mock): lib/bot-filter.js + lib/auto-ai.js.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const STORE = path.join(os.tmpdir(), `task114-botfilter-${process.pid}.json`)
process.env.UMI_BOT_FILTER_FILE = STORE
try { fs.rmSync(STORE, { force: true }) } catch {}

const filter = await import('../lib/bot-filter.js')
const { shouldAutoAITrigger } = await import('../lib/auto-ai.js')

const hasil = []
const cek = (nama, lulus, info = '') => { hasil.push(lulus); console.log(`${lulus ? 'LULUS' : 'GAGAL'} · ${nama}${info ? ' — ' + info : ''}`) }

/* ── dunia tiruan: 2 sesi jadibot + bot utama + 1 orang biasa ───── */
const MAIN = { user: { id: '6287813709432@s.whatsapp.net', lid: '111222333@lid' } }
const JADIBOT_A = { user: { id: '628111222333@s.whatsapp.net' }, __jadibotConnected: true }
const JADIBOT_B = { user: { id: '628555666777@s.whatsapp.net' }, __jadibotConnected: true }
global.jadibotConns = new Map([['628111222333', JADIBOT_A], ['628555666777', JADIBOT_B]])
global.mainBot = { number: '6287813709432' }
global.owner = [['6287813709432', 'AlzRiss', true]]

const androidId = n => String(n).repeat(21).slice(0, 21)
function pesan(opsi = {}) {
  const {
    sender = '628999888777@s.whatsapp.net', id = 'ABCDEFGHIJKLMNOPQRSTU', text = 'halo bot',
    mtype = 'extendedTextMessage', chat = '628999888777@s.whatsapp.net', isGroup = false,
    quoted = null, pushName = 'Budi', deviceList = false, footer = false, isBaileys = false,
  } = opsi
  return {
    sender, chat, isGroup, mtype, pushName, quoted, isBaileys,
    key: { id, remoteJid: chat, participant: isGroup ? sender : undefined },
    text,
    msg: footer ? { footerText: 'By AlzRiss' } : {},
    messageContextInfo: deviceList ? { deviceListMetadata: { recipientKeyHash: 'x' }, deviceListMetadataVersion: 2 } : {},
  }
}

/* 1. Bot milik kita sendiri (inti masalah: 20 sesi jadibot di satu proses) */
{
  const v = filter.detectBotMessage(pesan({ sender: '628111222333@s.whatsapp.net', id: androidId('7'), text: 'menu' }), MAIN)
  cek('pesan sesi jadibot kita dikenali sebagai bot', v.bot === true && v.reason === 'nomor bot sendiri', v.reason)
  const v2 = filter.detectBotMessage(pesan({ sender: '111222333@lid', id: androidId('8') }), MAIN)
  cek('sesi jadibot dikenali lewat LID juga', v2.bot === true, v2.reason)
  const v3 = filter.detectBotMessage(pesan({ sender: '6287813709432@s.whatsapp.net', id: androidId('9') }), MAIN)
  cek('nomor bot utama ikut difilter', v3.bot === true, v3.reason)
}
delete global.jadibotConns

/* 2. Daftar pantau owner */
{
  const nomor = '628123450000'
  const tambah = filter.addBotNumber('0812-3450-000')
  cek('add menormalkan nomor 08… → 628…', tambah.ok && tambah.number === nomor, tambah.number)
  cek('nomor pantau dikenali sebagai bot', filter.detectBotMessage(pesan({ sender: nomor + '@s.whatsapp.net', id: androidId('5') }), MAIN).bot === true)
  cek('setelan tersimpan di berkas', fs.existsSync(STORE) && JSON.parse(fs.readFileSync(STORE, 'utf8')).numbers.includes(nomor))
  const hapus = filter.removeBotNumber(nomor)
  cek('del menghapus dari daftar', hapus.ok && filter.detectBotMessage(pesan({ sender: nomor + '@s.whatsapp.net', id: androidId('5') }), MAIN).bot === false)
}

/* 3. Pesan buatan library / API */
{
  cek('device tidak dikenal → bot', filter.detectBotMessage(pesan({ id: 'Z'.repeat(15) }), MAIN).reason === 'perangkat pesan tidak dikenal')
  const tanpaId = pesan({ id: '' })
  cek('pesan tanpa id pesan tidak divonis bot', filter.detectBotMessage(tanpaId, MAIN).bot === false)
  cek('id BAE5 → bot', filter.detectBotMessage(pesan({ id: 'BAE5ABC123DEF456' }), MAIN).reason === 'id pesan Baileys')
  cek('tombol/list/template buatan API → bot', filter.detectBotMessage(pesan({ mtype: 'buttonsMessage' }), MAIN).bot === true)
  cek('jawaban tombol dari manusia BUKAN bot', filter.detectBotMessage(pesan({ mtype: 'buttonsResponseMessage', sender: '628999888777@s.whatsapp.net', id: androidId('4') }), MAIN).bot === false)
}

/* 4. Manusia tidak ikut terfilter */
{
  const manusia = pesan({ id: androidId('3') })
  cek('pesan manusia (Android) bukan bot', filter.detectBotMessage(manusia, MAIN).bot === false)
  const webManusia = pesan({ id: '3EB0' + 'A1B2C3D4E5F6G7H8I9', deviceList: true })
  cek('orang chat dari WhatsApp Web tetap bukan bot (bawaan)', filter.detectBotMessage(webManusia, MAIN).bot === false, 'skor ' + filter.detectBotMessage(webManusia, MAIN).score)
  const namaBot = pesan({ id: '3EB0' + 'A1B2C3D4E5F6G7H8I9', pushName: 'Bot Penjaga Grup' })
  cek('akun bername bot + device web dikenali bot', filter.detectBotMessage(namaBot, MAIN).bot === true, filter.detectBotMessage(namaBot, MAIN).reason)
  filter.updateBotFilter({ filterWebDevice: true })
  cek('mode web: device web dianggap bot', filter.detectBotMessage(webManusia, MAIN).bot === true)
  filter.updateBotFilter({ filterWebDevice: false })
  cek('mode web bisa dimatikan lagi', filter.detectBotMessage(webManusia, MAIN).bot === false)
}

/* 5. Saklar utama */
{
  global.jadibotConns = new Map([['628111222333', JADIBOT_A], ['628555666777', JADIBOT_B]])
  filter.updateBotFilter({ enabled: false })
  const v = filter.botMessageVerdict(pesan({ sender: '628111222333@s.whatsapp.net', id: androidId('2') }), MAIN, { scope: 'main' })
  cek('filter dimatikan → pesan bot lolos', v.skip === false, v.reason)
  filter.updateBotFilter({ enabled: true })
  const v2 = filter.botMessageVerdict(pesan({ sender: '628111222333@s.whatsapp.net', id: androidId('2') }), MAIN, { scope: 'main' })
  cek('filter diaktifkan → pesan bot dilewati', v2.skip === true, v2.reason)
}

/* 6. Gema & pemutus loop */
{
  const botConfig = { scope: 'sesi-uji' }
  // Bot asing (device web) yang mengulang kalimat kita persis.
  const mBot = pesan({ sender: '628999888777@s.whatsapp.net', id: '3EB0' + 'A1B2C3D4E5F6G7H8I9', chat: '120363000000000000@g.us', isGroup: true })
  filter.resetBotFilterMemory()
  filter.rememberAutoAIReply(mBot, 'Halo! Aku Umi, ada yang bisa kubantu?', botConfig)
  const gema = filter.botMessageVerdict({ ...pesan({ id: '3EB0' + 'B1C2D3E4F5G6H7I8J9', sender: '628999888777@s.whatsapp.net', chat: '120363000000000000@g.us', isGroup: true }), text: 'Halo! Aku Umi, ada yang bisa kubantu?' }, MAIN, botConfig)
  cek('gema kalimat bot terdeteksi', gema.skip === true && /gema/.test(gema.reason), gema.reason)

  filter.resetBotFilterMemory()
  const manusiaWeb = pesan({ sender: '628999888777@s.whatsapp.net', id: '3EB0' + 'A1B2C3D4E5F6G7H8I9', chat: '120363000000000000@g.us', isGroup: true })
  for (let i = 0; i < 4; i += 1) filter.rememberAutoAIReply(manusiaWeb, 'balasan ke-' + i, botConfig)
  const putus = filter.botMessageVerdict({ ...pesan({ sender: '628999888777@s.whatsapp.net', id: '3EB0' + 'A1B2C3D4E5F6G7H8I9', chat: '120363000000000000@g.us', isGroup: true }), text: 'oi' }, MAIN, botConfig)
  cek('pemutus loop aktif setelah 4 balasan/60 detik', putus.skip === true && /pemutus/.test(putus.reason), putus.reason)
  filter.resetBotFilterMemory()
}

/* 7. Terpasang di jalur Auto-AI sungguhan */
{
  // Kembalikan sesi jadibot: satu proses = bot utama + 2 jadibot.
  global.jadibotConns = new Map([['628111222333', JADIBOT_A], ['628555666777', JADIBOT_B]])
  const conn = MAIN
  const botConfig = { type: 'jadibot', scope: 'main', values: { autoAI: { enabled: true } } }
  const sebutBot = pesan({ sender: '628111222333@s.whatsapp.net', id: 'BAE5ABC123DEF456', chat: '120363000000000000@g.us', isGroup: true, text: '@6287813709432 halo' })
  sebutBot.mentionedJid = ['6287813709432@s.whatsapp.net']
  cek('auto-ai menolak mention dari sesama bot', shouldAutoAITrigger(sebutBot, conn, botConfig, {}) === false)

  const sebutManusia = pesan({ sender: '628999888777@s.whatsapp.net', id: androidId('6'), chat: '120363000000000000@g.us', isGroup: true, text: '@6287813709432 halo' })
  sebutManusia.mentionedJid = ['6287813709432@s.whatsapp.net']
  cek('auto-ai tetap melayani mention manusia', shouldAutoAITrigger(sebutManusia, conn, botConfig, {}) === true)

  const balasBot = pesan({ sender: '628555666777@s.whatsapp.net', id: androidId('6'), chat: '120363000000000000@g.us', isGroup: true, text: 'baik' })
  balasBot.quoted = { fromMe: true, sender: '6287813709432@s.whatsapp.net', key: { id: androidId('9') } }
  cek('auto-ai menolak balasan bot ke pesan kita', shouldAutoAITrigger(balasBot, conn, botConfig, {}) === false)

  const balasManusia = pesan({ sender: '628999888777@s.whatsapp.net', id: androidId('6'), chat: '120363000000000000@g.us', isGroup: true, text: 'baik' })
  balasManusia.quoted = { fromMe: true, sender: '6287813709432@s.whatsapp.net', key: { id: androidId('9') } }
  cek('auto-ai tetap melayani balasan manusia', shouldAutoAITrigger(balasManusia, conn, botConfig, {}) === true)

  const permintaanSendiri = pesan({ sender: '6287813709432@s.whatsapp.net', id: androidId('6'), chat: '6287813709432@s.whatsapp.net', text: '!! buka grup' })
  permintaanSendiri.fromMe = true
  cek('perintah "!!" dari owner sendiri tetap jalan', shouldAutoAITrigger(permintaanSendiri, conn, botConfig, {}) === true)

  filter.updateBotFilter({ enabled: false })
  cek('saat filter dimatikan, mention bot dilayani lagi', shouldAutoAITrigger(sebutBot, conn, botConfig, {}) === true)
  filter.updateBotFilter({ enabled: true })
}

/* 8. Model TIDAK dipanggil untuk pesan bot (bukti biaya/kuota aman) */
{
  process.env.GROQ_API_KEY = 'kunci-uji-tidak-dipakai'
  const { planAutoAI } = await import('../lib/auto-ai.js')
  const botConfig = { type: 'jadibot', scope: 'bukti-model', values: { autoAI: { enabled: true } } }
  const panggilan = { bot: 0, manusia: 0 }
  const pelapor = { role: 'assistant', content: JSON.stringify({ reply: 'Halo, ada yang bisa kubantu?', commands: [] }) }
  const sebutBot = pesan({ sender: '628111222333@s.whatsapp.net', id: 'BAE5ABC123DEF456', chat: '120363000000000000@g.us', isGroup: true, text: '@6287813709432 halo' })
  sebutBot.mentionedJid = ['6287813709432@s.whatsapp.net']
  await planAutoAI({ m: sebutBot, conn: MAIN, botConfig, activePrefix: '.', plugins: {} }, {
    ignoreCooldown: true,
    bot: {},
    callModel: async () => { panggilan.bot += 1; return pelapor },
  })
  cek('pesan bot: model tidak dipanggil sama sekali', panggilan.bot === 0, `dipanggil ${panggilan.bot}x`)

  const sebutManusia = pesan({ sender: '628999888777@s.whatsapp.net', id: androidId('6'), chat: '120363000000000000@g.us', isGroup: true, text: '@6287813709432 halo', pushName: 'Budi' })
  sebutManusia.mentionedJid = ['6287813709432@s.whatsapp.net']
  sebutManusia.fromMe = false
  const rencana = await planAutoAI({
    m: sebutManusia, conn: MAIN, botConfig: { ...botConfig, scope: 'bukti-model-2' }, activePrefix: '.', plugins: {},
    isOwner: false, isAdmin: false, isPrems: false, userData: { registered: true }, chatData: {},
  }, {
    ignoreCooldown: true,
    bot: {},
    callModel: async () => { panggilan.manusia += 1; return pelapor },
  })
  cek('pesan manusia: model tetap dipanggil', panggilan.manusia === 1 && rencana.kind === 'answer', `dipanggil ${panggilan.manusia}x, kind=${rencana.kind}`)
  delete process.env.GROQ_API_KEY
}

/* 9. Setelan awal aman */
{
  try { fs.rmSync(STORE, { force: true }) } catch {}
  const s = filter.getBotFilterSettings()
  cek('bawaan: filter aktif, mode web mati, pemutus aktif', s.enabled === true && s.filterWebDevice === false && s.stopper === true)
}

try { fs.rmSync(STORE, { force: true }) } catch {}
const gagal = hasil.filter(x => !x).length
console.log(`\n${hasil.length - gagal}/${hasil.length} lulus`)
process.exit(gagal ? 1 : 0)
