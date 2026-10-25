/* Uji 3 berkas AM (Task107): amprem.js, amprem-verify.js, amprem-tutorial.js
 * Jalankan: node task107-tests/amprem.test.mjs
 * Jaringan di-stub; tidak ada request nyata.
 */
import assert from 'node:assert/strict'

const ROOT = '/home/user/work-task94/single/plugins/premium'
const amprem = await import(`${ROOT}/amprem.js`)
const verifyMod = await import(`${ROOT}/amprem-verify.js`)
const tutorialMod = await import(`${ROOT}/amprem-tutorial.js`)

const hAm = amprem.default
const hVe = verifyMod.default
const hTu = tutorialMod.default

let calls = []
global.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null })
  const send = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
  const u = String(url)
  if (u.endsWith('/status')) return send({ status: 'online' })
  if (u.endsWith('/send-link')) return send({ success: true, email: JSON.parse(options.body).email, message: 'link dikirim.' })
  if (u.endsWith('/verify-link')) {
    const body = JSON.parse(options.body)
    if (String(body.magicLink).includes('invalid')) return send({ success: false, message: 'code gak ada' }, 400)
    return send({ success: true, message: 'premium aktif.', data: { email: body.email, uid: 'uid-test', planName: 'Annual', orderId: 'neo-test', validUntil: '2027-01-01', idToken: 'RAHASIA' } })
  }
  return send({ success: false, message: 'tidak dikenal' }, 404)
}
global.db = { data: { chats: {}, users: {} } }

function ctx({ text = '', sender = '628111@s.whatsapp.net', premium = true, amMode = false, isOwner = false } = {}) {
  global.db.data.users[sender] = { premium }
  global.db.data.chats['g@g.us'] = { am_mode: amMode }
  const out = []
  const m = {
    chat: 'g@g.us', sender, text, key: { id: 'K', participant: sender },
    reply: async v => { out.push(String(v)); return {} },
  }
  return { m, out, extra: { conn: {}, usedPrefix: '.', text, isOwner } }
}

async function runBoth(handler, opts) {
  calls = []
  amprem.sessions.clear()
  const c = ctx(opts)
  await handler.call(c.extra.conn, { ...c.m }, { ...c.extra })
  return { out: c.out.join('\n'), calls }
}
async function run(handler, opts) {
  calls = []
  const c = ctx(opts)
  await handler.call(c.extra.conn, { ...c.m }, { ...c.extra })
  return { out: c.out.join('\n'), calls }
}

let pass = 0
const test = async (name, fn) => { await fn(); pass += 1; console.log('  ✓', name) }
console.log('amprem (3 berkas) tests')

/* ---- berkas 1: .amprem ---- */
await test('hanya 3 berkas AM yang ada', async () => {
  const fs = await import('node:fs')
  const files = fs.readdirSync(ROOT).filter(f => /am/i.test(f) && f.endsWith('.js')).sort()
  assert.deepEqual(files, ['amprem-tutorial.js', 'amprem-verify.js', 'amprem.js'])
})

await test('.amprem tanpa argumen → panduan + status server', async () => {
  const { out, calls } = await run(hAm, { text: '' })
  assert.match(out, /ALIGHT MOTION PREMIUM/)
  assert.match(out, /\.amprem emailkamu@gmail\.com/)
  assert.match(out, /Server AM: online/)
  assert.ok(calls.some(c => c.url.endsWith('/status')))
})

await test('.amprem <email> → /send-link + langkah verifikasi', async () => {
  const { out, calls } = await run(hAm, { text: 'budi@gmail.com' })
  assert.ok(calls.some(c => c.url.endsWith('/send-link') && c.body.email === 'budi@gmail.com'))
  assert.match(out, /MAGIC LINK DIKIRIM/)
  assert.match(out, /ampremverify budi@gmail\.com \| <link>/)
})

await test('.amprem bukan email → tutorial lengkap', async () => {
  const { out } = await run(hAm, { text: 'halo min' })
  assert.match(out, /Itu bukan email/)
  assert.match(out, /TUTORIAL/)
})

await test('.amprem dengan link → diarahkan ke ampremverify', async () => {
  const { out } = await run(hAm, { text: 'https://alightcreative.com/x?oobCode=ABC123' })
  assert.match(out, /ampremverify/)
})

await test('.amprem <email> tapi server mati → jujur + tutorial', async () => {
  const real = global.fetch
  global.fetch = async () => { throw new Error('ECONNREFUSED') }
  try {
    const { out } = await run(hAm, { text: 'budi@gmail.com' })
    assert.match(out, /Gagal mengirim magic link/)
    assert.match(out, /ECONNREFUSED/)
    assert.match(out, /TUTORIAL/)
  } finally { global.fetch = real }
})

/* ---- berkas 2: .ampremverify ---- */
await test('.ampremverify tanpa argumen → status sesi + contoh', async () => {
  const { out } = await run(hVe, { text: '' })
  assert.match(out, /VERIFIKASI ALIGHT MOTION/)
  assert.match(out, /ampremverify emailkamu@gmail\.com \| <link/)
})

await test('.ampremverify email | link → sukses, token tidak dicetak', async () => {
  const { out, calls } = await run(hVe, { text: 'budi@gmail.com | https://alightcreative.com/x?oobCode=OK123' })
  assert.ok(calls.some(c => c.url.endsWith('/verify-link')))
  assert.match(out, /BERHASIL DIVERIFIKASI/)
  assert.match(out, /Order ID/)
  assert.ok(!out.includes('RAHASIA'))
})

await test('.ampremverify link saja tanpa sesi → arahkan format', async () => {
  const { out } = await run(hVe, { text: 'https://alightcreative.com/x?oobCode=ZZZ999', sender: '629000@s.whatsapp.net' })
  assert.match(out, /Belum ada email di sesi ini/)
})

await test('.ampremverify link saja SETELAH .amprem → pakai email sesi', async () => {
  amprem.sessions.clear()
  await run(hAm, { text: 'siti@gmail.com', sender: '628222@s.whatsapp.net' })
  calls = []
  const c = ctx({ text: 'https://alightcreative.com/x?oobCode=OK99999999', sender: '628222@s.whatsapp.net' })
  await hVe.call(c.extra.conn, c.m, { ...c.extra })
  const out = c.out.join('\n')
  assert.ok(calls.some(x => x.url.endsWith('/verify-link') && x.body.email === 'siti@gmail.com'))
  assert.match(out, /BERHASIL DIVERIFIKASI/)
})

await test('.ampremverify link rusak → gagal + saran minta link baru', async () => {
  const { out } = await run(hVe, { text: 'budi@gmail.com | https://example.com/invalid' })
  assert.match(out, /Verifikasi gagal/)
  assert.match(out, /code gak ada/)
  assert.match(out, /Minta link baru/)
})

await test('.ampremverify email saja → arahkan minta link dulu', async () => {
  const { out } = await run(hVe, { text: 'budi@gmail.com' })
  assert.match(out, /Email saja belum cukup/)
  assert.match(out, /\.amprem budi@gmail\.com/)
})

await test('.ampremverify sampah → tutorial format', async () => {
  const { out } = await run(hVe, { text: '@@@' })
  assert.match(out, /Format verifikasi belum benar/)
  assert.match(out, /TUTORIAL/)
})

/* ---- berkas 3: .ampremtutorial ---- */
await test('.ampremtutorial → tutorial + FAQ + status', async () => {
  const { out } = await run(hTu, { text: '' })
  assert.match(out, /ALIGHT MOTION PREMIUM — TUTORIAL/)
  assert.match(out, /FAQ/)
  assert.match(out, /Server AM/)
  assert.match(out, /\.ampremtutorial/)
})

/* ---- hak akses ---- */
await test('bukan premium & tanpa AM mode → ditolak, arah tutorial', async () => {
  for (const h of [hAm, hVe, hTu]) {
    const { out } = await run(h, { text: 'budi@gmail.com', premium: false })
    assert.match(out, /Akses ditolak/)
    assert.match(out, /ampremtutorial/)
  }
})

await test('premium / owner / AM mode grup tetap boleh', async () => {
  assert.match((await run(hAm, { text: 'budi@gmail.com', premium: true })).out, /MAGIC LINK DIKIRIM/)
  assert.match((await run(hAm, { text: 'budi@gmail.com', premium: false, isOwner: true })).out, /MAGIC LINK DIKIRIM/)
  assert.match((await run(hAm, { text: 'budi@gmail.com', premium: false, amMode: true })).out, /MAGIC LINK DIKIRIM/)
})

console.log(`\n${pass} tes lulus`)
