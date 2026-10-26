/* Task113 — data kartu (top fitur, jadibot, owner) diambil dari kode asli. */
const { topCommands, countJadibot, ownerProfile } = await import('../lib/umi-menu/registry.js')

const hasil = []
const cek = (n, l, i = '') => { hasil.push(l); console.log(`${l ? 'LULUS' : 'GAGAL'} · ${n}${i ? ' — ' + i : ''}`) }

global.plugins = {
  'plugins/main/umi-menu.js': Object.assign(() => {}, { command: /^(menu|umimenu)$/i, help: ['menu'] }),
  'plugins/info/ping.js': Object.assign(() => {}, { command: ['ping'], help: ['ping'] }),
  'plugins/download/usanagi-ytmp3.js': Object.assign(() => {}, { command: /^ytmp3$/i, help: ['ytmp3'] }),
  'plugins/game/mati.js': Object.assign(() => {}, { command: ['mati'], help: ['mati'], disabled: true }),
  'plugins/_system/_exec.js': Object.assign(() => {}, { command: ['exec'], help: ['exec'] }),
  'plugins/fun/zero.js': Object.assign(() => {}, { command: ['zero'], help: ['zero'] }),
}

global.db = { data: { stats: {
  'plugins/info/ping.js': { total: 42, success: 40 },
  'plugins/main/umi-menu.js': { total: 812, success: 800 },
  'plugins/download/usanagi-ytmp3.js': { total: 120, success: 90 },
  'plugins/game/mati.js': { total: 999 },            // plugin dimatikan → tidak dihitung
  'plugins/_system/_exec.js': { total: 5000 },        // exec dikecualikan
  'plugins/fun/zero.js': { total: 0 },                // nol → tidak muncul
  'plugins/hilang/tidak-ada.js': { total: 77 },       // plugin tidak ada → dilewati
} } }

const top = topCommands(10)
cek('top memakai angka dari stats', top[0] && top[0].command === 'menu' && top[0].count === 812, JSON.stringify(top[0]))
cek('urut dari yang terbanyak', top.map(t => t.count).join(',') === '812,120,42')
cek('plugin dimatikan tidak muncul', !top.some(t => t.command === 'mati'))
cek('exec dikecualikan', !top.some(t => t.command === 'exec'))
cek('perintah tanpa pemakaian tidak muncul', !top.some(t => t.command === 'zero'))
cek('plugin tidak dikenal dilewati', !top.some(t => t.count === 77))
cek('jumlah maksimal dihormati', topCommands(2).length === 2)

global.jadibotConns = new Map([
  ['628111', { __jadibotConnected: true }],
  ['628222', { __jadibotConnected: false }],
  ['628333', { __jadibotConnected: true }],
])
cek('jadibot menghitung yang tersambung saja', countJadibot() === 2, String(countJadibot()))
delete global.jadibotConns
cek('tanpa registry jadibot → 0 (tidak melempar)', countJadibot() === 0)

global.owner = [['628999', 'Bukan Dev', false], ['6287813709432', 'AlzRiss', true]]
global.ownerName = 'AlzRiss'
const profil = ownerProfile()
cek('owner memilih entri developer', profil.number === '6287813709432' && profil.name === 'AlzRiss', JSON.stringify(profil))

global.owner = []
cek('tanpa config owner → nama dari ownerName, nomor "-"', ownerProfile().number === '-' )

const gagal = hasil.filter(x => !x).length
console.log(`\n${hasil.length - gagal}/${hasil.length} lulus`)
process.exit(gagal ? 1 : 0)
