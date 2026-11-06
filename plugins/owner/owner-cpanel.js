/* Task204 — CPANEL (panel Pterodactyl ikyhost) untuk pemilik bot.
 *
 * Token API diambil dari (urutan):
 *   1. process.env.IKY_BASE / IKY_APP_KEY / IKY_ADMIN_KEY
 *   2. data/cpanel.json  (mode 600, TIDAK di-push ke repo)
 *   3. .secrets/panel-ikyhost.env (lokal development)
 * Kunci TIDAK PERNAH dicetak ke chat maupun log.
 *
 * Perintah:
 *   .server                      menu + daftar server
 *   .server status <nama/id>     detail server
 *   .server start|stop|restart <nama/id>
 *   .server cmd <nama/id> <perintah>   kirim perintah console
 *   .server create <nama>        buat server baru (butuh env IKY_USER_ID/IKY_EGG_ID/IKY_NODE_ID)
 *   .server hapus <nama/id>      hapus server (admin, ketik nama persis)
 *
 * Resep env create (contoh):
 *   IKY_USER_ID=2 IKY_EGG_ID=1 IKY_NODE_ID=1 IKY_MEMORY=1024 IKY_DISK=5120
 */

import fs from 'fs'
import path from 'path'

const BASE_DEFAULT = 'https://panel1.ikyhost.cloud'

function bacaKunci() {
  const hasil = {
    base: process.env.IKY_BASE || BASE_DEFAULT,
    app: process.env.IKY_APP_KEY || '',
    admin: process.env.IKY_ADMIN_KEY || '',
  }
  if (hasil.app) return hasil

  try {
    const p = path.join(process.cwd(), 'data', 'cpanel.json')
    const j = JSON.parse(fs.readFileSync(p, 'utf8'))
    hasil.base = j.base || hasil.base
    hasil.app = j.app || ''
    hasil.admin = j.admin || ''
    if (hasil.app) return hasil
  } catch { /* lanjut */ }

  try {
    const p = path.join(process.cwd(), '.secrets', 'panel-ikyhost.env')
    for (const baris of fs.readFileSync(p, 'utf8').split('\n')) {
      const t = baris.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) continue
      const i = t.indexOf('=')
      const k = t.slice(0, i).trim()
      const v = t.slice(i + 1).trim()
      if (k === 'IKY_BASE') hasil.base = v.replace(/\/+$/, '')
      if (k === 'IKY_APP_KEY') hasil.app = v
      if (k === 'IKY_ADMIN_KEY') hasil.admin = v
    }
  } catch { /* biarkan kosong */ }
  return hasil
}

async function panelFetch(url, opt, timeoutMs) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs || 20000)
  try {
    const r = await fetch(url, Object.assign({}, opt, { signal: ac.signal }))
    const teks = await r.text()
    let json = null
    try { json = teks ? JSON.parse(teks) : null } catch { json = null }
    return { status: r.status, json, teks }
  } finally {
    clearTimeout(t)
  }
}

/** Cari server dalam daftar client API berdasarkan nama atau identifier. */
export function cariServer(rows, q) {
  const t = String(q || '').trim().toLowerCase()
  if (!t) return null
  return rows.find((r) => {
    const a = r.attributes || r
    const nama = String(a.name || '').toLowerCase()
    const id = String(a.identifier || '').toLowerCase()
    return nama === t || id === t || id.startsWith(t) || (nama.includes(t) && t.length >= 3)
  }) || null
}

/** Format ringkas atribut server client API. */
export function formatServer(a, status) {
  const st = status || a.status || '?'
  const emoji = st === 'running' ? '🟢' : st === 'starting' ? '🟡' : '🔴'
  return `${emoji} *${a.name}*\n• id: \`${String(a.identifier || '').slice(0, 8)}\`\n• status: ${st}\n• cpu: ${a.limits ? a.limits.cpu : '?'}% • ram: ${a.limits ? a.limits.memory : '?'} MB • disk: ${a.limits ? a.limits.disk : '?'} MB`
}

async function daftarServer(k) {
  const r = await panelFetch(k.base + '/api/client/servers', {
    headers: { Authorization: 'Bearer ' + k.app, Accept: 'application/json' },
  })
  if (r.status !== 200 || !r.json) throw new Error('HTTP ' + r.status + ' saat membaca daftar server')
  const data = r.json.data || []
  return data
}

async function detailServer(k, id) {
  const r = await panelFetch(k.base + '/api/client/servers/' + id + '?include=allocations', {
    headers: { Authorization: 'Bearer ' + k.app, Accept: 'application/json' },
  })
  if (r.status !== 200 || !r.json) throw new Error('HTTP ' + r.status + ' saat membaca detail server')
  return r.json
}

function alamatAlloc(json) {
  const rel = json && json.relationships && json.relationships.allocations
  const list = rel && rel.data ? rel.data : []
  const utama = list.find((x) => x.attributes && x.attributes.default) || list[0]
  if (!utama || !utama.attributes) return '-'
  const a = utama.attributes
  return a.ip + ':' + a.port
}

async function power(k, id, signal) {
  const r = await panelFetch(k.base + '/api/client/servers/' + id + '/power', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + k.app, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ signal }),
  })
  if (r.status !== 200 && r.status !== 204) throw new Error('HTTP ' + r.status + ' ' + (r.teks || '').slice(0, 120))
  return true
}

async function kirimCmd(k, id, perintah) {
  const r = await panelFetch(k.base + '/api/client/servers/' + id + '/command', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + k.app, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: perintah }),
  })
  if (r.status !== 200 && r.status !== 204) throw new Error('HTTP ' + r.status + ' ' + (r.teks || '').slice(0, 120))
  return true
}

async function adminReq(k, method, p, body) {
  if (!k.admin) throw new Error('IKY_ADMIN_KEY belum dikonfigurasi')
  const r = await panelFetch(k.base + p, {
    method,
    headers: { Authorization: 'Bearer ' + k.admin, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (r.status < 200 || r.status >= 300) {
    const detail = r.json && r.json.errors && r.json.errors[0] ? r.json.errors[0].detail : (r.teks || '').slice(0, 160)
    throw new Error('HTTP ' + r.status + ' — ' + detail)
  }
  return r.json || {}
}

async function buatServer(k, nama) {
  const userId = process.env.IKY_USER_ID
  const eggId = process.env.IKY_EGG_ID
  const nodeId = process.env.IKY_NODE_ID
  if (!userId || !eggId || !nodeId) {
    return { gagal: 'Fitur create belum dikonfigurasi. Set env IKY_USER_ID, IKY_EGG_ID, IKY_NODE_ID dulu.' }
  }

  const egg = await adminReq(k, 'GET', '/api/application/eggs/' + eggId + '?include=variables')
  const eggAttr = egg.attributes || {}
  const vars = (egg.relationships && egg.relationships.variables && egg.relationships.variables.data) || []
  const environment = {}
  for (const v of vars) {
    const a = v.attributes
    if (a && a.env_variable) environment[a.env_variable] = String(a.default_value || '')
  }

  // Alokasi baru di node
  const allocIp = process.env.IKY_ALLOC_IP || '46.101.10.235'
  const allocPort = process.env.IKY_ALLOC_PORT || String(20000 + Math.floor(Math.random() * 9000))
  const al = await adminReq(k, 'POST', '/api/application/nodes/' + nodeId + '/allocations', {
    ip: allocIp,
    ports: [allocPort],
  })
  const allocId = al && al.attributes ? al.attributes.id : null
  if (!allocId) return { gagal: 'Alokasi port gagal dibuat.' }

  const limits = {
    memory: Number(process.env.IKY_MEMORY || 1024),
    swap: Number(process.env.IKY_SWAP || 0),
    disk: Number(process.env.IKY_DISK || 5120),
    io: 500,
    cpu: Number(process.env.IKY_CPU || 100),
  }

  const srv = await adminReq(k, 'POST', '/api/application/servers', {
    name: nama,
    user: Number(userId),
    egg: Number(eggId),
    docker_image: eggAttr.docker_image || 'ghcr.io/parkervcp/yolks:java_21',
    startup: eggAttr.startup || '',
    environment,
    limits,
    start_on_completion: true,
    deploy: {
      allocations: [{ default: true, allocation_id: allocId }],
      dedicated_ip: false,
      port_range: [],
    },
  })

  const a = srv.attributes || srv
  return {
    ok: {
      nama: a.name || nama,
      id: a.identifier || '-',
      alamat: (a.relationships && a.relationships.allocations) ? '-' : (allocIp + ':' + allocPort),
    },
  }
}

async function hapusServer(k, q) {
  const rows = await daftarServer(k)
  const target = cariServer(rows, q)
  if (!target) return { gagal: 'Server "' + q + '" tidak ditemukan.' }
  const a = target.attributes || target
  if (String(a.name).toLowerCase() !== String(q).toLowerCase() && String(a.identifier) !== String(q)) {
    return { gagal: 'Namanya harus PERSIS "' + a.name + '" untuk hapus (pengaman).' }
  }
  await adminReq(k, 'DELETE', '/api/application/servers/' + a.id)
  return { ok: '🗑️ Server *' + a.name + '* dihapus permanen.' }
}

const MENU = `🖥️ *CPANEL — PANEL SERVER IKYHOST*

*Perintah*
.server — menu + daftar server
.server status <nama/id> — detail
.server start <nama/id> — nyalakan
.server stop <nama/id> — matikan
.server restart <nama/id> — restart
.server cmd <nama/id> <perintah> — console
.server create <nama> — buat server baru
.server hapus <nama/id> — hapus permanen

*Contoh*
.server status alzmc
.server restart alzmc

⚠️ Hanya owner. Kunci API tidak pernah ditampilkan.`

let handler = async (m, { args }) => {
  const k = bacaKunci()
  if (!k.app) {
    return m.reply('⚠️ Token panel belum terkonfigurasi.\nSet env `IKY_APP_KEY` (atau `data/cpanel.json` mode 600).')
  }

  const sub = (args[0] || '').toLowerCase()
  const sisa = args.slice(1).join(' ').trim()

  try {
    if (!sub || sub === 'menu' || sub === 'help') {
      const rows = await daftarServer(k)
      let teks = MENU + '\n\n*Daftar server* (' + rows.length + '):\n'
      if (!rows.length) teks += '— (belum ada server) —'
      for (const r of rows.slice(0, 20)) {
        teks += '\n' + formatServer(r.attributes || r)
      }
      return m.reply(teks)
    }

    if (sub === 'list') {
      const rows = await daftarServer(k)
      let teks = '📋 *Server panel* (' + rows.length + '):\n'
      for (const r of rows.slice(0, 20)) teks += '\n' + formatServer(r.attributes || r)
      return m.reply(teks)
    }

    if (['start', 'stop', 'restart'].includes(sub)) {
      if (!sisa) return m.reply('⚠️ Contoh: .server restart alzmc')
      const rows = await daftarServer(k)
      const target = cariServer(rows, sisa)
      if (!target) return m.reply('❌ Server "' + sisa + '" tidak ditemukan.')
      const a = target.attributes || target
      const signal = sub === 'start' ? 'start' : sub === 'stop' ? 'stop' : 'restart'
      await power(k, a.identifier, signal)
      const kata = sub === 'start' ? '🟢 dinyalakan' : sub === 'stop' ? '🔴 dimatikan' : '🔄 direstart'
      return m.reply(kata + ': *' + a.name + '*')
    }

    if (sub === 'cmd' || sub === 'console') {
      if (!sisa) return m.reply('⚠️ Contoh: .server cmd alzmc list')
      const spasi = sisa.indexOf(' ')
      if (spasi < 1) return m.reply('⚠️ Contoh: .server cmd alzmc list')
      const q = sisa.slice(0, spasi)
      const perintah = sisa.slice(spasi + 1).trim()
      const rows = await daftarServer(k)
      const target = cariServer(rows, q)
      if (!target) return m.reply('❌ Server "' + q + '" tidak ditemukan.')
      const a = target.attributes || target
      await kirimCmd(k, a.identifier, perintah)
      return m.reply('📤 Perintah terkirim ke *' + a.name + '*:\n`' + perintah + '`')
    }

    if (sub === 'status') {
      if (!sisa) return m.reply('⚠️ Contoh: .server status alzmc')
      const rows = await daftarServer(k)
      const target = cariServer(rows, sisa)
      if (!target) return m.reply('❌ Server "' + sisa + '" tidak ditemukan.')
      const a0 = target.attributes || target
      const det = await detailServer(k, a0.identifier)
      const a = det.attributes || a0
      const st = a.status || '?'
      return m.reply(
        formatServer(a, st) +
        '\n• alamat: `' + alamatAlloc(det) + '`' +
        '\n• terakhir dipakai: ' + (a.relationships && a.relationships.allocations ? '-' : (a.updated_at || '-'))
      )
    }

    if (sub === 'create') {
      if (!sisa) return m.reply('⚠️ Contoh: .server create my-new-server')
      const hasil = await buatServer(k, sisa)
      if (hasil.gagal) return m.reply('❌ ' + hasil.gagal)
      return m.reply('✅ Server dibuat: *' + hasil.ok.nama + '*\nid: `' + hasil.ok.id + '`\nalamat: `' + hasil.ok.alamat + '`')
    }

    if (sub === 'hapus' || sub === 'delete') {
      if (!sisa) return m.reply('⚠️ Contoh: .server hapus my-new-server (nama persis)')
      const hasil = await hapusServer(k, sisa)
      if (hasil.gagal) return m.reply('❌ ' + hasil.gagal)
      return m.reply(hasil.ok)
    }

    return m.reply(MENU)
  } catch (e) {
    return m.reply('⚠️ Panel error: ' + String(e.message || e).slice(0, 300))
  }
}

handler.help = ['server', 'server status', 'server restart']
handler.tags = ['owner']
handler.command = /^server(cpanel)?$/i
handler.owner = true

export default handler
