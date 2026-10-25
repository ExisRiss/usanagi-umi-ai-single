/* Uji .amprem (Task106) — jalankan: node task106-tests/amprem.test.mjs
 * Semua jaringan di-stub; tidak ada request nyata.
 */
import assert from 'node:assert/strict'

const plugin = await import('../work-task94/single/plugins/premium/amprem.js')
const handler = plugin.default || plugin.handler

let calls = []
global.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null })
  const send = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })
  const text = String(url)
  if (text.endsWith('/status')) return send({ status: 'online', timestamp: new Date().toISOString() })
  if (text.endsWith('/send-link')) return send({ success: true, email: JSON.parse(options.body).email, message: 'link dikirim, cek inbox.' })
  if (text.endsWith('/verify-link')) {
    const body = JSON.parse(options.body)
    if (String(body.magicLink).includes('invalid')) return send({ success: false, message: 'code gak ada' }, 400)
    return send({
      success: true,
      message: 'verifikasi berhasil, premium aktif.',
      data: { email: body.email, uid: 'uid-test', status: 'active', planName: 'Annual', orderId: 'neo-test', validUntil: '2027-01-01', idToken: 'RAHASIA-JANGAN-CETAK' },
    })
  }
  return send({ success: false, message: 'endpoint test tidak dikenal' }, 404)
}

global.db = { data: { chats: {}, users: {} } }

function fakeM({ text = '', sender = '628111@s.whatsapp.net', premium = true, amMode = false } = {}) {
  global.db.data.users[sender] = { premium }
  global.db.data.chats['g@g.us'] = { am_mode: amMode }
  const out = []
  return {
    out,
    m: {
      chat: 'g@g.us',
      sender,
      text,
      key: { id: 'K1', participant: sender },
      reply: async value => { out.push(String(value)); return {} },
    },
  }
}

async function run(text, opts = {}) {
  calls = []
  plugin.sessions.clear()
  const ctx = fakeM({ text, ...opts })
  await handler(ctx.m, { conn: {}, usedPrefix: '.', text, isOwner: opts.isOwner || false })
  return { out: ctx.out.join('\n'), calls }
}

let pass = 0
const test = async (name, fn) => { await fn(); pass += 1; console.log('  ✓', name) }

console.log('amprem tests')

await test('tanpa argumen → tutorial + status server nyata', async () => {
  const { out, calls } = await run('')
  assert.match(out, /TUTORIAL/)
  assert.match(out, /\.amprem emailkamu@gmail\.com/)
  assert.match(out, /Server AM: online/)
  assert.ok(calls.some(c => c.url.endsWith('/status')), 'harus memanggil /status')
})

await test('email valid → /send-link + langkah berikutnya', async () => {
  const { out, calls } = await run('budi@gmail.com')
  const sent = calls.find(c => c.url.endsWith('/send-link'))
  assert.ok(sent, 'harus memanggil /send-link')
  assert.equal(sent.body.email, 'budi@gmail.com')
  assert.match(out, /MAGIC LINK DIKIRIM/)
  assert.match(out, /\.amprem budi@gmail\.com \| <link>/)
})

await test('format ngawur → tutorial lengkap (bukan cuma "format salah")', async () => {
  const { out } = await run('halo min tolong ya')
  assert.match(out, /Perintah tidak dikenali/)
  assert.match(out, /TUTORIAL/)
  assert.match(out, /LANGKAH 1/)
})

await test('email rusak → tutorial', async () => {
  const { out } = await run('budi@@gmail')
  assert.match(out, /Perintah tidak dikenali/)
  assert.match(out, /LANGKAH 2/)
})

await test('email | link valid → sukses, token TIDAK dicetak', async () => {
  const { out, calls } = await run('budi@gmail.com | https://alightcreative.com/__/auth/action?oobCode=ABC123')
  const verify = calls.find(c => c.url.endsWith('/verify-link'))
  assert.ok(verify, 'harus memanggil /verify-link')
  assert.equal(verify.body.email, 'budi@gmail.com')
  assert.match(out, /BERHASIL DIVERIFIKASI/)
  assert.match(out, /INFO AKUN/)
  assert.match(out, /Order ID/)
  assert.ok(!out.includes('RAHASIA-JANGAN-CETAK'), 'idToken tidak boleh tampil')
})

await test('email | link rusak → gagal + tutorial', async () => {
  const { out } = await run('budi@gmail.com | https://example.com/invalid')
  assert.match(out, /Verifikasi gagal/)
  assert.match(out, /code gak ada/)
  assert.match(out, /TUTORIAL/)
})

await test('link saja tanpa sesi → diarahkan format benar', async () => {
  const { out } = await run('https://alightcreative.com/x?oobCode=ZZZ999', { sender: '628999@s.whatsapp.net' })
  assert.match(out, /Belum ada email di sesi ini/)
  assert.match(out, /\.amprem emailkamu@gmail\.com \| <link>/)
})

await test('link saja setelah email → verifikasi pakai email sesi', async () => {
  const ctx = fakeM({ text: 'siti@gmail.com', sender: '628222@s.whatsapp.net' })
  await handler(ctx.m, { conn: {}, usedPrefix: '.', text: 'siti@gmail.com' })
  calls = []
  const m2 = { ...ctx.m, text: 'https://alightcreative.com/x?oobCode=OK1234567890' }
  const out = []
  m2.reply = async value => { out.push(String(value)); return {} }
  await handler(m2, { conn: {}, usedPrefix: '.', text: m2.text })
  const verify = calls.find(c => c.url.endsWith('/verify-link'))
  assert.ok(verify, 'harus memanggil /verify-link')
  assert.equal(verify.body.email, 'siti@gmail.com')
  assert.match(out.join('\n'), /BERHASIL DIVERIFIKASI/)
})

await test('bukan premium & AM mode mati → ditolak dengan jalan keluar', async () => {
  const { out } = await run('budi@gmail.com', { premium: false })
  assert.match(out, /Akses ditolak/)
  assert.match(out, /ammode on/)
})

await test('AM mode aktif → user biasa boleh', async () => {
  const { out } = await run('budi@gmail.com', { premium: false, amMode: true })
  assert.match(out, /MAGIC LINK DIKIRIM/)
})

await test('owner selalu boleh', async () => {
  const { out } = await run('budi@gmail.com', { premium: false, isOwner: true })
  assert.match(out, /MAGIC LINK DIKIRIM/)
})

await test('server mati (fetch throw) → pesan jujur, bukan crash', async () => {
  const real = global.fetch
  global.fetch = async () => { throw new Error('ECONNREFUSED') }
  try {
    const { out } = await run('budi@gmail.com')
    assert.match(out, /Gagal mengirim magic link/)
    assert.match(out, /ECONNREFUSED/)
    assert.match(out, /TUTORIAL/)
  } finally { global.fetch = real }
})

await test('tidak ada duplikat perintah lama di plugin', async () => {
  const src = await import('node:fs').then(fs => fs.promises.readFile(new URL('../work-task94/single/plugins/premium/amprem.js', import.meta.url), 'utf8'))
  assert.ok(!/amprem2|amprem-send|amprem-verif/.test(src.split('*/')[1] || ''), 'komentar lama boleh, kode tidak')
  assert.match(src, /handler\.command = \/\^amprem\$\/i/)
})

console.log(`\n${pass} tes lulus`)
