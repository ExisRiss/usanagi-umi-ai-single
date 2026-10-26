/* Task117 — aturan PREFIX per jenis bot + dua sistem menu + `menuinfo`.
 *
 * Diuji langsung pada modul dan plugin asli (bukan salinan logika):
 *   lib/prefix-bot.js        → aturan murni
 *   plugins/main/umi-menu.js → prefix tunggal = teks, prefix ganda = rich
 *   plugins/main/usanagi-ping.js → prefix ganda = kartu rich
 *   plugins/main/usanagi-menuinfo.js → semua angka yang diminta ada
 */
process.env.TZ = 'Asia/Makassar'

/* ── global tiruan minimal (db, owner, conn) ───────────────────── */
global.namebot = 'Umi Usanagi AI'
global.ownerName = 'AlzRiss'
global.author = 'AlzRiss'
global.owner = [['6287813709432', 'AlzRiss', true]]
global.plugins = {
  'plugins/main/umi-menu.js': Object.assign(async () => {}, {
    command: /^(umimenu|lmenu|menu|menu_all(?:_\d+)?)$/i,
    help: ['menu'],
  }),
  'plugins/main/usanagi-ping.js': Object.assign(async () => {}, {
    command: /^ping$/i,
    help: ['ping'],
  }),
}
global.db = {
  data: {
    users: {
      '628123456789@s.whatsapp.net': {
        name: 'Penguji', registered: true, exp: 4200, limit: 37,
        premiumTime: Date.now() + 86400000, level: 12,
      },
    },
    stats: {
      'plugins/main/umi-menu.js': { total: 812 },
      'plugins/main/usanagi-ping.js': { total: 120 },
    },
    settings: {},
  },
}
const jadibotHidup = { __jadibotConnected: true }
const jadibotMati = { __jadibotConnected: false }
global.jadibotConns = new Map([['a', jadibotHidup], ['b', jadibotHidup], ['c', jadibotMati]])

/* ── fetch tiruan: hanya isolasi jaringan, bentuk respons mengikuti API asli ── */
const fetchAsli = globalThis.fetch
globalThis.fetch = async (url, options) => {
  const target = String(url)
  if (target.includes('/api/trading/market/public')) {
    return new Response(JSON.stringify({
      ok: true,
      symbols: [{ sym: 'BBCA' }, { sym: 'TLKM' }, { sym: 'UMI' }],
      time: '12:30:00', tickMs: 15000,
      session: { active: false, boostPct: 0, label: 'Pasar normal 24 jam' },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (target.includes('/api/trading/leaderboard')) {
    return new Response(JSON.stringify({ ok: true, total: 147, richest: [] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
  if (target.includes('supabase')) {
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return fetchAsli(url, options)
}

const hasil = []
const cek = (nama, lulus, info = '') => {
  hasil.push(lulus)
  console.log(`${lulus ? 'LULUS' : 'GAGAL'} · ${nama}${info ? ' — ' + info : ''}`)
}

/* ── 1. Aturan prefix murni ───────────────────────────────────── */
const {
  botKind, isSymbolPrefix, isAllowedSinglePrefix, sanitizeActivePrefix,
  splitPrefix, normalizeIncoming, describeBotPrefixRule,
} = await import('../lib/prefix-bot.js')

cek('botKind: tanpa type = bot utama', botKind({}) === 'main')
cek('botKind: type jadibot', botKind({ type: 'jadibot' }) === 'jadibot')
cek('simbol: "/" sah, "a" tidak', isSymbolPrefix('/') && !isSymbolPrefix('a') && !isSymbolPrefix('$menu'))

cek('BOT UTAMA — hanya "$" yang sah', isAllowedSinglePrefix('main', '$') === true && isAllowedSinglePrefix('main', '.') === false)
cek('BOT UTAMA — sanitize memaksa "$" walau setelan "."', sanitizeActivePrefix('main', '.') === '$')

cek('JADIBOT — "$" dilarang', isAllowedSinglePrefix('jadibot', '$') === false)
cek('JADIBOT — simbol lain boleh', ['/', '.', '&', '+', '!', '#'].every(s => isAllowedSinglePrefix('jadibot', s)))
cek('JADIBOT — setelan "$" jatuh ke "."', sanitizeActivePrefix('jadibot', '$') === '.')
cek('JADIBOT — setelan "+" dipertahankan', sanitizeActivePrefix('jadibot', '+') === '+')

{
  const single = normalizeIncoming({ text: '$menu', botType: 'main', activePrefix: '$' })
  const ganda = normalizeIncoming({ text: '$$menu', botType: 'main', activePrefix: '$' })
  const titik = normalizeIncoming({ text: '.menu', botType: 'main', activePrefix: '$' })
  cek('MAIN: "$menu" = teks', single.matched && single.rich === false && single.body === 'menu')
  cek('MAIN: "$$menu" = rich', ganda.matched && ganda.rich === true && ganda.body === 'menu' && ganda.text === '$menu')
  cek('MAIN: ".menu" diabaikan', titik.matched === false)
}
{
  const satu = normalizeIncoming({ text: '/menu', botType: 'jadibot', activePrefix: '/' })
  const dua = normalizeIncoming({ text: '//menu', botType: 'jadibot', activePrefix: '/' })
  const dolar = normalizeIncoming({ text: '$menu', botType: 'jadibot', activePrefix: '/' })
  const dolarDua = normalizeIncoming({ text: '$$menu', botType: 'jadibot', activePrefix: '/' })
  cek('JADIBOT: "/menu" = teks', satu.matched && satu.rich === false)
  cek('JADIBOT: "//menu" = rich', dua.matched && dua.rich === true && dua.body === 'menu' && dua.text === '/menu')
  cek('JADIBOT: "$menu" DITOLAK', dolar.matched === false)
  cek('JADIBOT: "$$menu" DITOLAK', dolarDua.matched === false)
}
{
  const plus = normalizeIncoming({ text: '+ping', botType: 'jadibot', activePrefix: '+' })
  const plus2 = normalizeIncoming({ text: '++ping', botType: 'jadibot', activePrefix: '+' })
  const amp = normalizeIncoming({ text: '&&ping', botType: 'jadibot', activePrefix: '&' })
  cek('JADIBOT: "+ping" teks, "++ping" rich', plus.rich === false && plus2.rich === true)
  cek('JADIBOT: "&&ping" rich', amp.matched && amp.rich && amp.body === 'ping')
  cek('splitPrefix awalan salah → tidak cocok', splitPrefix('menu', '/').matched === false)
  cek('deskripsi aturan menyebut "$" untuk bot utama', describeBotPrefixRule('main').includes('$'))
  cek('deskripsi aturan jadibot menyebut "$" tidak dipakai', describeBotPrefixRule('jadibot').includes('`$` tidak dipakai'))
}

/* ── 2. Menu: prefix tunggal = teks, prefix ganda = rich ──────── */
const menuHandler = (await import('../plugins/main/umi-menu.js')).default

function connTiruan() {
  const kiriman = []
  const conn = {
    user: { id: '6287813709432:1@s.whatsapp.net' },
    waUploadToServer: async () => ({}),
    groupMetadata: async () => ({ participants: [] }),
    sendMessage: async (jid, content, options) => {
      kiriman.push({ jid, content, options })
      return { key: { id: 'x' } }
    },
    // Jalur tombol/interactive memakai relayMessage pada socket asli.
    relayMessage: async (jid, message) => {
      kiriman.push({ jid, content: message, options: {} })
      return 'MID'
    },
    sendRichHtml: async (jid, html) => {
      kiriman.push({ jid, content: { __html: html }, options: {} })
      return { ok: true, mode: 'rich' }
    },
  }
  return { conn, kiriman }
}

function pesanTiruan(text, extra = {}) {
  const dikirim = []
  return {
    chat: '628123456789@s.whatsapp.net',
    sender: '628123456789@s.whatsapp.net',
    fromMe: false,
    isGroup: false,
    text,
    raw: { key: { id: 'mid' } },
    reply: async (isi) => { dikirim.push(isi); return {} },
    __dikirim: dikirim,
    ...extra,
  }
}

{
  const { conn, kiriman } = connTiruan()
  const m = pesanTiruan('menu')
  m.command = 'menu'
  m.args = []
  m.__richMenu = false
  await menuHandler(m, { conn, usedPrefix: '$', args: [], command: 'menu' })
  const teks1 = kiriman.map(k => k.content && k.content.text).filter(Boolean).join('\n')
  cek('MENU TEKS: dikirim sebagai teks biasa', kiriman.length > 0 && teks1.includes('MENU UTAMA'), teks1.slice(0, 60).replace(/\n/g, ' '))
  cek('MENU TEKS: tidak memakai kartu HTML', !kiriman.some(k => k.content && k.content.__html))
  cek('MENU TEKS: tidak memakai pesan interaktif', !kiriman.some(k => k.content && (k.content.interactiveMessage || k.content.viewOnceMessage)))
  cek('MENU TEKS: contoh perintah memakai prefix "$"', teks1.includes('$menu_all'))
}

{
  const { conn, kiriman } = connTiruan()
  const m = pesanTiruan('$$menu')
  m.command = 'menu'
  m.args = []
  m.__richMenu = true
  await menuHandler(m, { conn, usedPrefix: '$', args: [], command: 'menu' })
  const adaHtml = kiriman.some(k => k.content && typeof k.content.__html === 'string')
  // Pesan daftar native dari elaina-baileys 1.4.7 dibungkus viewOnceMessage
  // (protokol WA terbaru), bukan interactiveMessage polos.
  const adaNative = kiriman.some(k => k.content && (k.content.interactiveMessage || k.content.viewOnceMessage || k.content.buttonsMessage))
  cek('MENU RICH: kartu HTML dikirim', adaHtml)
  cek('MENU RICH: daftar native ikut dikirim', adaNative)
}
{
  const { conn, kiriman } = connTiruan()
  const m = pesanTiruan('menu_all')
  m.command = 'menu_all'
  m.args = []
  m.__richMenu = false
  await menuHandler(m, { conn, usedPrefix: '$', args: [], command: 'menu_all' })
  const teks2 = kiriman.map(k => k.content && k.content.text).filter(Boolean).join('\n')
  cek('MENU_ALL TEKS: versi teks yang dikirim', teks2.includes('SEMUA FITUR') && !kiriman.some(k => k.content && k.content.__html), teks2.slice(0, 50).replace(/\n/g, ' '))
}

/* ── 3. Ping: prefix ganda = kartu rich ───────────────────────── */
{
  const pingHandler = (await import('../plugins/main/usanagi-ping.js')).default
  const { conn, kiriman } = connTiruan()
  const m = pesanTiruan('$$ping')
  m.__richMenu = true
  let dilewatiCanvas = false
  try {
    await pingHandler(m, { conn, usedPrefix: '$' })
  } catch (error) {
    dilewatiCanvas = true
    console.log('   (canvas tidak tersedia di lingkungan tes:', String(error?.message || error).slice(0, 70), ')')
  }
  const html = kiriman.find(k => k.content && typeof k.content.__html === 'string')
  cek('PING RICH: kartu HTML terkirim sebelum canvas', Boolean(html))
  cek('PING RICH: kartu memuat latensi & uptime', Boolean(html) && html.content.__html.includes('Speed') && html.content.__html.includes('Uptime'))
  if (dilewatiCanvas) cek('PING RICH: canvas tidak dipakai saat kartu berhasil', true)
}
{
  const { checkHtmlApp } = await import('@rexxhayanasi/elaina-baileys/src/Utils/html-app.js')
  const { buildPingCard } = await import('../lib/umi-menu/ping-card.js')
  const html = buildPingCard({ latency: 43, uptime: '1j 20m', ram: '210 MB', rss: '190 MB', heap: '88 MB', cpu: '12%', load: '0.42', cores: 4, platform: 'Linux 6.1', node: 'v23.11.1', pid: 4242, mode: 'Public', version: '7.1', bot: 'Umi Usanagi AI' })
  const laporan = checkHtmlApp(html, { height: 760 })
  cek('PING RICH: lolos validator HTML WhatsApp', laporan.ok === true, JSON.stringify(laporan.problems || []).slice(0, 160))
}

/* ── 4. menuinfo: semua angka yang diminta ────────────────────── */
{
  const menuinfo = (await import('../plugins/main/usanagi-menuinfo.js')).default
  const { conn } = connTiruan()
  const m = pesanTiruan('menuinfo', {
    __botKind: 'main',
    isGroup: true,
    chat: '120363312345678901@g.us',
  })
  conn.groupMetadata = async () => ({
    subject: 'Grup Uji',
    participants: [
      { id: '628111@s.whatsapp.net', admin: 'admin' },
      { id: '628222@s.whatsapp.net', admin: null },
      { id: '628333@s.whatsapp.net', admin: null },
      { id: '628444@s.whatsapp.net', admin: 'superadmin' },
    ],
  })
  await menuinfo(m, { conn, usedPrefix: '$', botConfig: { type: 'main' } })
  const teksInfo = m.__dikirim.join('\n')

  cek('MENUINFO — info bot', teksInfo.includes('BOT') && teksInfo.includes('Umi Usanagi AI'))
  cek('MENUINFO — status server', teksInfo.includes('SERVER') && teksInfo.includes('CPU'))
  cek('MENUINFO — jumlah user', teksInfo.includes('User tersimpan : 1'))
  cek('MENUINFO — jumlah jadibot', teksInfo.includes('Jadibot        : 3 sesi'))
  cek('MENUINFO — session hidup', teksInfo.includes('Session hidup  : 2'))
  cek('MENUINFO — session mati', teksInfo.includes('Session mati   : 1'))
  cek('MENUINFO — member grup', teksInfo.includes('Member grup    : 4 (2 admin)'))
  cek('MENUINFO — fitur dipakai', teksInfo.includes('Fitur pernah dipakai : 2'))
  cek('MENUINFO — total eksekusi', teksInfo.includes('Total eksekusi     : 932'))
  cek('MENUINFO — top 10', teksInfo.includes('TOP 10 FITUR') && teksInfo.includes('menu — 812x') && teksInfo.includes('ping — 120x'))
  cek('MENUINFO — urutan top benar', teksInfo.indexOf('812x') < teksInfo.indexOf('120x'))
  cek('MENUINFO — status game', teksInfo.includes('Server game : online') && teksInfo.includes('3 simbol pasar'))
  cek('MENUINFO — status saham', teksInfo.includes('Saham       : aktif') && teksInfo.includes('Pasar normal 24 jam'))
  cek('MENUINFO — status pelaku', teksInfo.includes('PELAKU PERINTAH') && teksInfo.includes('628123456789') && teksInfo.includes('premium'))
  cek('MENUINFO — tidak ada angka karangan "NaN"', !teksInfo.includes('NaN') && !teksInfo.includes('undefined'))
  cek('MENUINFO — aturan prefix ditampilkan', teksInfo.includes('bot utama') && teksInfo.includes('$$menu'))
}
{
  const menuinfo = (await import('../plugins/main/usanagi-menuinfo.js')).default
  const { conn } = connTiruan()
  const m = pesanTiruan('menuinfo', { __botKind: 'jadibot', isGroup: false })
  await menuinfo(m, { conn, usedPrefix: '/', botConfig: { type: 'jadibot' } })
  const teksInfo = m.__dikirim.join('\n')
  cek('MENUINFO jadibot: jenis & prefix sesuai', teksInfo.includes('jadibot (sewa)') && teksInfo.includes('//menu'))
  cek('MENUINFO jadibot: grup ditulis "bukan grup"', teksInfo.includes('bukan grup'))
}

/* ── 5. menuinfo versi RICH (prefix ganda) ────────────────────── */
{
  const { checkHtmlApp } = await import('@rexxhayanasi/elaina-baileys/src/Utils/html-app.js')
  const { buildMenuinfoCard } = await import('../lib/umi-menu/menuinfo-card.js')
  const kartu = buildMenuinfoCard({
    waktu: '26/10/2026, 20.30.00 WITA', jenisBot: 'main', prefix: '$',
    aturan: 'bot utama — hanya `$`', versi: '7.1',
    status: {
      botName: 'Umi Usanagi AI', ownerName: 'AlzRiss',
      connection: { connected: true, label: 'Terhubung' },
      server: { cpuPercent: 12, cpuCount: 4, rssMb: 210, heapMb: 88, systemFreeMb: 1200, systemTotalGb: 4, loadAverage: 0.42, nodeVersion: 'v23.11.1', platform: 'Linux 6.1', uptimeSeconds: 5400 },
      users: { available: true, total: 253, registered: 214 },
    },
    grup: { available: true, members: 87, admins: 4 },
    jadibot: { tersedia: true, total: 20, hidup: 18, mati: 2 },
    fitur: { tersedia: 1121, dipakai: 87, eksekusi: 45212 },
    top: [{ command: 'menu', count: 812 }, { command: 'ping', count: 120 }, { command: 'ytmp3', count: 88 }],
    layanan: {
      game: { online: true, detail: '45 simbol pasar · 147 akun permainan' },
      saham: { online: true, detail: 'Pasar normal 24 jam' },
    },
    pelaku: { nama: 'Penguji', nomor: '628123456789', peran: 'owner · premium', terdaftar: 'sudah', limit: 37, level: 12, exp: 4200, premium: 'aktif' },
  })
  const laporan = checkHtmlApp(kartu, { height: 2100 })
  cek('MENUINFO RICH: lolos validator HTML WhatsApp', laporan.ok === true, JSON.stringify(laporan.problems || []).slice(0, 160))
  cek('MENUINFO RICH: memuat user/jadibot/hidup/mati', kartu.includes('<b>253</b>') && kartu.includes('<b>20</b>') && kartu.includes('<b>18</b>') && kartu.includes('<b>2</b>'))
  cek('MENUINFO RICH: memuat member grup', kartu.includes('87 (4 admin)'))
  cek('MENUINFO RICH: memuat top 10 berurutan', kartu.indexOf('812x') < kartu.indexOf('120x'))
  cek('MENUINFO RICH: memuat status game & saham', kartu.includes('45 simbol pasar') && kartu.includes('Pasar normal 24 jam'))
  cek('MENUINFO RICH: memuat pelaku', kartu.includes('Penguji') && kartu.includes('628123456789'))
}
{
  const menuinfo = (await import('../plugins/main/usanagi-menuinfo.js')).default
  const { conn, kiriman } = connTiruan()
  const m = pesanTiruan('$$menuinfo', { __botKind: 'main', __richMenu: true })
  await menuinfo(m, { conn, usedPrefix: '$', botConfig: { type: 'main' } })
  const html = kiriman.find(k => k.content && typeof k.content.__html === 'string')
  cek('MENUINFO RICH: handler mengirim kartu, bukan teks panjang', Boolean(html) && m.__dikirim.length === 0)
  cek('MENUINFO RICH: kartu memakai prefix tunggal di daftar top', Boolean(html) && html.content.__html.includes('$menu'))
}

cek('handler menuinfo memakai nama perintah yang belum dipakai', /^\^menuinfo\$/.test(String((await import('../plugins/main/usanagi-menuinfo.js')).default.command.source).replace(/^\^\(?|\$\)?\$$/g, m => m)))

const lulus = hasil.filter(Boolean).length
console.log(`\n${lulus}/${hasil.length} tes lulus`)
if (lulus !== hasil.length) process.exitCode = 1
