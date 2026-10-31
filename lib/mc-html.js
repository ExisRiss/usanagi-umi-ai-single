/* By AlzRiss - Usanagi Umi AI
 *
 * Task138c — kartu HTML untuk server Minecraft.
 *
 * Dipakai oleh `..statusmc` / `..pingmc` (prefix GANDA) supaya yang terkirim
 * benar-benar **rich HTML** (WhatsApp rich response), bukan cuma teks atau
 * tombol/list biasa. HTML-nya mandiri: semua CSS di dalam berkas, tanpa gambar
 * atau font dari internet, jadi tetap tampil walau HP offline sebagian.
 *
 * Fungsi di sini murni (tanpa I/O) supaya bisa diuji tanpa WhatsApp.
 */

export const escapeHtml = (value) => String(value === null || value === undefined ? '' : value)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const e = escapeHtml

const angka = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null))
const fmt = (v, digit = 1) => {
  const n = angka(v)
  return n === null ? '—' : n.toLocaleString('id-ID', { maximumFractionDigits: digit })
}
const cap = (v) => {
  const teks = String(v === null || v === undefined ? '—' : v)
  return teks.charAt(0).toUpperCase() + teks.slice(1)
}
const jam = () => new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'medium', timeStyle: 'short' }) + ' WITA'

const CSS = [
  '*{box-sizing:border-box}',
  'body{margin:0;background:#0b1220;color:#e9f1f9;font:13px/1.55 system-ui,-apple-system,Arial,sans-serif;padding:16px 12px}',
  'main{max-width:520px;margin:auto}',
  'header{display:flex;align-items:center;justify-content:space-between;margin:0 0 20px}',
  '.brand{font-weight:800;letter-spacing:2px;font-size:12px;display:flex;align-items:center}',
  '.mark{display:inline-grid;place-items:center;background:#96efd0;color:#123329;width:26px;height:26px;border-radius:8px;margin-right:8px;font-weight:900}',
  '.tag{font-size:9px;color:#9bb0c8;border:1px solid #2c3b4e;padding:4px 8px;border-radius:20px;letter-spacing:1px}',
  '.eyebrow{font-size:9px;letter-spacing:2px;color:#76ceb1;margin:0 0 6px;text-transform:uppercase}',
  'h1{font-size:26px;line-height:1.15;letter-spacing:-.6px;margin:0 0 6px}',
  'h2{font-size:13px;margin:20px 0 8px;letter-spacing:.4px}',
  'p.sub{margin:0 0 16px;color:#8fa3bb;font-size:11px}',
  '.hero{border:1px solid #2c514d;background:linear-gradient(115deg,#14382f,#16262c);padding:16px;border-radius:14px;margin:16px 0 12px}',
  '.hero small{display:block;color:#a6c7bd;font-size:10px;letter-spacing:1px}',
  '.hero strong{display:block;font-size:28px;letter-spacing:-1px;margin:4px 0;font-variant-numeric:tabular-nums}',
  '.hero p{margin:0;font-size:10px;color:#a1bdb5}',
  '.on{color:#83e0ba}.off{color:#f6a6a6}.wait{color:#f2d08a}',
  '.metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 4px}',
  '.metric{padding:12px;background:#131e2e;border:1px solid #243247;border-radius:10px;min-width:0}',
  '.metric small{display:block;font-size:9px;color:#93a7be;margin-bottom:5px;letter-spacing:.6px}',
  '.metric strong{font-size:15px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}',
  '.panel{padding:4px 14px;border:1px solid #2a394c;background:#121d2e;border-radius:12px;margin:12px 0}',
  '.pair{display:flex;justify-content:space-between;gap:12px;font-size:11px;border-bottom:1px solid #243247;padding:9px 0}',
  '.pair:last-child{border:0}',
  '.pair span{color:#8fa3bb}',
  '.pair b{text-align:right;overflow-wrap:anywhere;font-weight:600}',
  '.listrow{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #23303f}',
  '.listrow:last-child{border:0}',
  '.rank{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:#1f3b37;color:#8ee4c3;flex-shrink:0;font-size:11px}',
  '.person{flex:1;min-width:0;font-size:12px;overflow-wrap:anywhere}',
  '.person small{display:block;color:#8ea3ba;font-size:9px}',
  '.empty{border:1px dashed #33445a;border-radius:12px;padding:18px 14px;text-align:center;color:#a6b9cd;font-size:11px}',
  '.warn{border:1px solid #5b4030;background:#2a1e16;border-radius:12px;padding:12px 14px;color:#f0c9a8;font-size:11px;margin:12px 0}',
  '.tips{border-top:1px solid #28374a;margin-top:18px;padding-top:14px}',
  '.tips h3{font-size:9px;letter-spacing:1.6px;color:#94a7c0;margin:0 0 8px}',
  'code{display:inline-block;font:11px/1.7 ui-monospace,monospace;color:#ace4d0;background:#14212f;border:1px solid #23313f;border-radius:7px;padding:2px 7px;margin:3px 4px 0 0}',
  '.foot{font-size:9px;border-top:1px solid #22304a;padding-top:12px;margin-top:18px;color:#728ba4;line-height:1.7}',
  '@media(max-width:340px){body{padding:12px 9px}h1{font-size:23px}.hero strong{font-size:24px}.metric strong{font-size:13px}}',
].join('')

const shell = (judul, kicker, subjudul, isi, { tag = 'LIVE' } = {}) => [
  '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>' + e(judul) + ' · Umi</title><style>' + CSS + '</style></head><body><main>',
  '<header><div class="brand"><span class="mark">U</span>UMI · MINECRAFT</div><span class="tag">' + e(tag) + '</span></header>',
  '<p class="eyebrow">' + e(kicker) + '</p>',
  '<h1>' + e(judul) + '</h1>',
  subjudul ? '<p class="sub">' + e(subjudul) + '</p>' : '',
  isi,
  '<footer class="foot">Data saat pesan dibuat · ' + e(jam()) + '<br>Ketik <b>..statusmc</b> lagi untuk memperbarui kartu ini.</footer>',
  '</main></body></html>',
].join('')

const statusKelas = (state) => {
  const s = String(state || '').toLowerCase()
  if (['running', 'online', 'started'].indexOf(s) >= 0) return 'on'
  if (['starting', 'stopping', 'installing', 'restoring'].indexOf(s) >= 0) return 'wait'
  return 'off'
}

const pillAlamat = (status) => `${status.host || '—'}:${status.port || '—'}`

/**
 * Kartu status server.
 * @param {object} status hasil statusLengkap() dari lib/mc-kaira.js
 */
export function statusHtml(status = {}, opsi = {}) {
  const s = status || {}
  const pemain = Array.isArray(s.pemain) ? s.pemain.slice(0, 8) : []
  const online = Array.isArray(s.online) && s.online.length ? s.online.join(', ') : 'tidak ada'
  const galat = Array.isArray(s.galat) ? s.galat : []
  const kelas = statusKelas(s.state)

  const baris = pemain.length
    ? pemain.map((p, i) => {
      const kapan = p && p.terakhir
        ? new Date(p.terakhir).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'medium' })
        : 'belum tercatat'
      return '<div class="listrow"><span class="rank">' + (i + 1) + '</span><div class="person">'
        + e(p && p.nama ? p.nama : 'tanpa nama') + '<small>' + e(kapan) + '</small></div></div>'
    }).join('')
    : '<div class="empty">Belum ada pemain yang pernah join.</div>'

  const isi = [
    '<section class="hero"><small>STATUS SERVER</small>',
    '<strong class="' + kelas + '">' + e(String(cap(s.state))) + '</strong>',
    '<p>' + e(s.nama || 'Server Minecraft') + ' · versi ' + e(s.versi || '—') + '</p></section>',

    '<div class="metrics">',
    '<div class="metric"><small>PEMAIN ONLINE</small><strong>' + e(`${fmt(s.jumlahOnline, 0)}/${fmt(s.maksimal, 0)}`) + '</strong></div>',
    '<div class="metric"><small>PERNAH JOIN</small><strong>' + e(`${fmt(s.totalPernah, 0)} pemain`) + '</strong></div>',
    '<div class="metric"><small>VERSI</small><strong>' + e(s.versi || '—') + '</strong></div>',
    '<div class="metric"><small>UPTIME</small><strong>' + e(s.uptime || '—') + '</strong></div>',
    '</div>',

    '<div class="panel">',
    '<div class="pair"><span>Alamat server</span><b>' + e(pillAlamat(s)) + '</b></div>',
    '<div class="pair"><span>Dunia</span><b>' + e(s.level || 'belum terdeteksi') + '</b></div>',
    '<div class="pair"><span>Online sekarang</span><b>' + e(online) + '</b></div>',
    '<div class="pair"><span>CPU</span><b>' + e(fmt(s.cpu, 1)) + '%</b></div>',
    '<div class="pair"><span>RAM</span><b>' + e(s.memori || '—') + '</b></div>',
    '<div class="pair"><span>Disk</span><b>' + e(s.disk || '—') + '</b></div>',
    '</div>',

    '<h2>Username yang pernah join · ' + e(fmt(s.totalPernah, 0)) + '</h2>',
    baris,

    galat.length ? '<div class="warn"><b>Galat sesi ini</b><br>' + galat.map((x) => e(x)).join('<br>') + '</div>' : '',

    '<section class="tips"><h3>LANJUT DARI CHAT</h3>',
    '<code>' + e((opsi.prefix || '.') + 'statusmc') + '</code>',
    '<code>' + e((opsi.prefix || '.') + 'pingmc') + '</code>',
    '<code>' + e((opsi.prefix || '.') + 'mcmabar') + '</code>',
    '<code>' + e((opsi.prefix || '.') + 'mcjoin') + '</code>',
    '</section>',
  ].join('')

  return shell(s.nama || 'Status Server', 'Kontrol server dari WhatsApp', pillAlamat(s), isi, { tag: 'STATUS' })
}

/** Kartu hasil ping / signaling. */
export function pingHtml(ping = {}, status = {}, opsi = {}) {
  const p = ping || {}
  const tcp = p.tcp || {}
  const http = p.httpJoin || {}
  const siap = Boolean(tcp.ok) && Number(http.status) === 200
  const kelas = siap ? 'on' : 'off'

  const baris = [
    ['Host', `${p.host || '—'}:${p.port || '—'}`],
    ['TCP signaling', tcp.ok ? `OK · ${fmt(tcp.ms, 0)} ms` : `gagal · ${tcp.pesan || 'tidak terjawab'}`],
    ['HTTP /v1/join', Number(http.status) === 200 ? `200 · ${fmt(http.ms, 0)} ms` : String(http.status || http.pesan || 'gagal')],
    ['Panel', cap(status.state)],
    ['Pemain online', `${fmt(status.jumlahOnline, 0)}/${fmt(status.maksimal, 0)}`],
  ].map(([k, v]) => '<div class="pair"><span>' + e(k) + '</span><b>' + e(v) + '</b></div>').join('')

  const isi = [
    '<section class="hero"><small>HASIL PING</small>',
    '<strong class="' + kelas + '">' + (siap ? 'TERHUBUNG' : 'BELUM TERHUBUNG') + '</strong>',
    '<p>' + e(siap ? 'Server bisa dihubungi dari internet.' : 'Server belum bisa dihubungi — cek alokasi port / status server.') + '</p></section>',
    '<div class="panel">' + baris + '</div>',
    '<section class="tips"><h3>LANJUT DARI CHAT</h3>',
    '<code>' + e((opsi.prefix || '.') + 'pingmc') + '</code>',
    '<code>' + e((opsi.prefix || '.') + 'statusmc') + '</code>',
    '</section>',
  ].join('')

  return shell('Ping Server', 'Uji koneksi dari internet', `${p.host || '—'}:${p.port || '—'}`, isi, { tag: 'PING' })
}

export default { statusHtml, pingHtml, escapeHtml }
