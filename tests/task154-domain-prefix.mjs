/* Task154 — uji logika: alias prefix `/`, masukan domain subdomain, dan
 * pemetaan domain kustom. Tanpa jaringan.
 * Jalankan: node tests/task154-domain-prefix.mjs
 */
import { resolveIncomingPrefix } from '../lib/prefix-policy.js'
import { bacaArgumenSitus, hostCnameKustom, namaSubAman } from '../lib/subdomain-kaira.js'
import { namaDariHost } from '../lib/situs-lokal.js'

let lulus = 0
let gagal = 0
const cek = (nama, benar, tambahan = '') => {
  if (benar) { lulus++; console.log(`  ✅ ${nama}`) }
  else { gagal++; console.log(`  ❌ ${nama}${tambahan ? ' — ' + tambahan : ''}`) }
}

const PLUGINS = {
  'owner/owner-addcase.js': { command: /^(addcase|tambahcase)$/i },
  'owner/subdomain-deploy.js': { command: /^(addsubdomainmy|addsubdomain|subdomainmenu)$/i },
  'main/umi-menu.js': { command: /^(menu)$/i },
  'info/ping.js': { command: ['ping'] },
}

console.log('== alias prefix `/` (jadibot) ==')
{
  const alias = ['/']
  const a = resolveIncomingPrefix({ text: '/bug2', plugins: { 'x/bug2.js': { command: /^(bug2)$/i } }, activePrefix: '.', aliasPrefixes: alias })
  cek('/bug2 diterima walau prefix sesi "."', a.matched === true && a.prefix === '/')

  const b = resolveIncomingPrefix({ text: '/menu', plugins: PLUGINS, activePrefix: '.', aliasPrefixes: alias })
  cek('/menu diterima', b.matched === true)

  const c = resolveIncomingPrefix({ text: '/bukanperintah', plugins: PLUGINS, activePrefix: '.', aliasPrefixes: alias })
  cek('/bukanperintah ditolak', c.matched === false)

  const d = resolveIncomingPrefix({ text: '!menu', plugins: PLUGINS, activePrefix: '.', aliasPrefixes: alias })
  cek('!menu tetap ditolak (strict)', d.matched === false)

  const e = resolveIncomingPrefix({ text: '#menu', plugins: PLUGINS, activePrefix: '.', aliasPrefixes: alias })
  cek('#menu tetap ditolak (strict)', e.matched === false)

  const f = resolveIncomingPrefix({ text: 'menu', plugins: PLUGINS, activePrefix: '.', aliasPrefixes: alias })
  cek('tanpa prefix tetap ditolak', f.matched === false)

  const g = resolveIncomingPrefix({ text: '/menu', plugins: PLUGINS, activePrefix: '/', aliasPrefixes: alias })
  cek('prefix sesi sudah "/" → normal', g.matched === true && g.alternate === false)

  const h = resolveIncomingPrefix({ text: '/menu', plugins: PLUGINS, activePrefix: '.', mode: 'strict' })
  cek('tanpa alias → tetap strict', h.matched === false)

  /* Aturan Task112 tidak boleh rusak. */
  const i = resolveIncomingPrefix({ text: '.menu', plugins: PLUGINS, activePrefix: '/', aliasPrefixes: alias })
  cek('prefix "/" → ".menu" masih ditolak (Task112)', i.matched === false)
}

console.log('== masukan /addsubdomain ==')
{
  const a = bacaArgumenSitus('toko')
  cek('nama polos', a.jenis === 'nama' && a.nama === 'toko')

  const b = bacaArgumenSitus('toko-budi')
  cek('nama bertanda hubung', b.jenis === 'nama' && b.nama === 'toko-budi')

  const c = bacaArgumenSitus('kaeira.my.id')
  cek('domain sendiri', c.jenis === 'kustom' && c.domain === 'kaeira.my.id', JSON.stringify(c))

  const d = bacaArgumenSitus('toko.alzriss.gwenna.my.id')
  cek('domain bot bentuk titik', d.jenis === 'nama' && d.nama === 'toko', JSON.stringify(d))

  const e = bacaArgumenSitus('toko-alzriss.gwenna.my.id')
  cek('domain bot bentuk strip', e.jenis === 'nama' && e.nama === 'toko', JSON.stringify(e))

  const f = bacaArgumenSitus('https://kaeira.my.id/')
  cek('URL dibersihkan', f.jenis === 'kustom' && f.domain === 'kaeira.my.id')

  const g = bacaArgumenSitus('a')
  cek('nama terlalu pendek → salah', g.jenis === 'salah')

  const h = bacaArgumenSitus('')
  cek('kosong → salah', h.jenis === 'salah')

  const i = bacaArgumenSitus('dua kata')
  cek('spasi → salah', i.jenis === 'salah')

  const j = bacaArgumenSitus('alzriss.gwenna.my.id')
  cek('domain bot saja → salah', j.jenis === 'salah')

  const k = bacaArgumenSitus('www.kaeira.my.id')
  cek('www dibuang', k.domain === 'kaeira.my.id' || k.jenis === 'salah', JSON.stringify(k))

  cek('target CNAME kustom ada', hostCnameKustom().includes('.'), hostCnameKustom())
  cek('namaSubAman tidak berubah', namaSubAman('toko') === 'toko')
}

console.log('== penyaji host ==')
{
  const a = namaDariHost('toko-alzriss.gwenna.my.id')
  cek('subdomain bot dikenali', a === 'toko', a)
  const b = namaDariHost('kaeira.my.id')
  cek('domain kustom tanpa registry → kosong', b === '', b)
  const c = namaDariHost('situs.gwenna.my.id')
  cek('host target CNAME bukan situs', c === '', c)
}

console.log(`\n===== ${lulus} lulus, ${gagal} gagal =====`)
process.exit(gagal ? 1 : 0)
