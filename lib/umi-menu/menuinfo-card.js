/* By AlzRiss - Usanagi Umi AI
 *
 * KARTU MENUINFO (Task117).
 *
 * Dipakai hanya saat `menuinfo` dipanggil dengan PREFIX GANDA (`$$menuinfo`,
 * `//menuinfo`). Prefix tunggal tetap memakai laporan teks.
 *
 * Seluruh angka berasal dari objek laporan yang sama dengan versi teks —
 * kartu ini tidak menghitung ulang dan tidak menambah nilai contoh.
 */

import { escapeHtml, CSS } from './html.js'
import { formatNumber, formatDuration } from './status.js'

const AUTO_SIZE = `<script>
(function(){
  function ukur(){
    try{
      var h = Math.ceil((document.querySelector('.wrap')||document.body).getBoundingClientRect().height);
      if (h > 0 && window.__WA_SIZE__ !== h) { window.__WA_SIZE__ = h; if (typeof window.__setSize === 'function') window.__setSize(h) }
    }catch(e){}
  }
  window.addEventListener('load', ukur); setTimeout(ukur, 60); setTimeout(ukur, 260);
})();
</script>`

const nilai = (value, fallback = 'Tidak tersedia') => {
  if (value == null) return fallback
  const text = String(value).trim()
  return text === '' ? fallback : text
}

const angka = value => (Number.isFinite(Number(value)) ? formatNumber(value) : 'Tidak tersedia')

function barisDua(label, value) {
  return `<div class="row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`
}

/**
 * @param {object} laporan struktur dari plugins/main/usanagi-menuinfo.js
 */
export function buildMenuinfoCard(laporan = {}) {
  const {
    waktu = '', jenisBot = 'main', prefix = '$', aturan = '',
    status = {}, grup = {}, jadibot = {}, fitur = {}, top = [], layanan = {}, pelaku = {},
  } = laporan

  const server = status.server || {}
  const users = status.users || {}
  const koneksi = status.connection || {}
  const botName = nilai(status.botName, 'Usanagi Umi AI')

  const kotak = [
    ['User', users.available ? angka(users.total) : 'Tidak tersedia'],
    ['Jadibot', jadibot.tersedia ? angka(jadibot.total) : 'Tidak tersedia'],
    ['Hidup', jadibot.tersedia ? angka(jadibot.hidup) : 'Tidak tersedia'],
    ['Mati', jadibot.tersedia ? angka(jadibot.mati) : 'Tidak tersedia'],
  ].map(([label, value]) => `<div class="stat"><b>${escapeHtml(value)}</b><small>${escapeHtml(label)}</small></div>`).join('')

  const topList = Array.isArray(top) ? top.slice(0, 10) : []
  const maxTop = topList.length ? Math.max(1, Number(topList[0].count) || 1) : 1
  const topIsi = topList.length
    ? topList.map((item, index) => `
      <li><span class="rank">${index + 1}</span><div class="bar">
        <code>${escapeHtml(prefix + item.command)}</code><em>${formatNumber(item.count)}x</em>
        <i style="width:${Math.max(6, Math.round((Number(item.count) || 0) / maxTop * 100))}%"></i>
      </div></li>`).join('')
    : '<li><em>Belum ada data pemakaian.</em></li>'

  const isi = `
  <section class="glass">
    <div style="display:flex;align-items:center;gap:10px">
      <b style="font-size:20px;letter-spacing:.4px">🧭 MENUINFO</b>
      <span style="margin-left:auto;font-size:11px;padding:4px 10px;border-radius:999px;background:rgba(95,212,244,.18);border:1px solid rgba(95,212,244,.45);color:#c8f2ff">${escapeHtml(koneksi.connected ? 'ONLINE' : 'OFFLINE')}</span>
    </div>
    <p class="note" style="margin-top:6px">${escapeHtml(botName)} · ${escapeHtml(waktu)}</p>
    <p class="note">Kartu ini dikirim karena perintah memakai <b>prefix ganda</b>. Prefix tunggal memakai laporan teks.</p>
  </section>

  <section class="glass">
    <h2>Info bot</h2>
    ${barisDua('Nama', botName)}
    ${barisDua('Jenis', jenisBot === 'jadibot' ? 'jadibot (sewa)' : 'bot utama')}
    ${barisDua('Prefix', prefix)}
    ${barisDua('Aturan', aturan)}
    ${barisDua('Versi', nilai(laporan.versi))}
    ${barisDua('Koneksi', nilai(koneksi.label))}
    ${barisDua('Aktif', server.uptimeSeconds == null ? 'Tidak tersedia' : formatDuration(server.uptimeSeconds))}
    ${barisDua('Pemilik', nilai(status.ownerName))}
  </section>

  <section class="glass">
    <h2>Server <small>real-time</small></h2>
    ${barisDua('CPU', server.cpuPercent == null ? 'Tidak tersedia' : `${formatNumber(server.cpuPercent)}% · ${server.cpuCount == null ? '?' : formatNumber(server.cpuCount)} core`)}
    ${barisDua('RAM app', server.rssMb == null ? 'Tidak tersedia' : `${formatNumber(server.rssMb)} MB · heap ${server.heapMb == null ? '?' : formatNumber(server.heapMb)} MB`)}
    ${barisDua('RAM OS', server.systemFreeMb == null ? 'Tidak tersedia' : `${formatNumber(server.systemFreeMb)} MB kosong · total ${server.systemTotalGb == null ? '?' : formatNumber(server.systemTotalGb)} GB`)}
    ${barisDua('Load', server.loadAverage == null ? 'Tidak tersedia' : Number(server.loadAverage).toFixed(2))}
    ${barisDua('Node', nilai(server.nodeVersion))}
    ${barisDua('OS', nilai(server.platform))}
  </section>

  <section class="glass">
    <h2>Pengguna &amp; sesi</h2>
    <div class="stats">${kotak}</div>
    ${barisDua('Sudah daftar', users.available ? angka(users.registered) : 'Tidak tersedia')}
    ${barisDua('Member grup', grup.available ? `${formatNumber(grup.members)} (${formatNumber(grup.admins)} admin)` : (grup.reason === 'bukan-grup' ? 'bukan grup' : 'Tidak tersedia'))}
  </section>

  <section class="glass">
    <h2>Fitur</h2>
    ${barisDua('Perintah tersedia', fitur.tersedia == null ? 'Tidak tersedia' : angka(fitur.tersedia))}
    ${barisDua('Fitur pernah dipakai', angka(fitur.dipakai))}
    ${barisDua('Total eksekusi', angka(fitur.eksekusi))}
  </section>

  <section class="glass">
    <h2>Top 10 fitur <small>paling sering dipakai</small></h2>
    <ul class="top">${topIsi}</ul>
  </section>

  <section class="glass">
    <h2>Layanan</h2>
    ${barisDua('Server game', `${layanan.game && layanan.game.online ? 'online' : 'offline'} — ${nilai(layanan.game && layanan.game.detail)}`)}
    ${barisDua('Saham', `${layanan.saham && layanan.saham.online ? 'aktif' : 'offline'} — ${nilai(layanan.saham && layanan.saham.detail)}`)}
  </section>

  <section class="glass">
    <h2>Pelaku perintah</h2>
    ${barisDua('Nama', nilai(pelaku.nama))}
    ${barisDua('Nomor', nilai(pelaku.nomor))}
    ${barisDua('Peran', nilai(pelaku.peran))}
    ${barisDua('Terdaftar', nilai(pelaku.terdaftar))}
    ${barisDua('Limit', nilai(pelaku.limit))}
    ${barisDua('Level', `${nilai(pelaku.level)} · XP ${nilai(pelaku.exp)}`)}
    ${barisDua('Premium', nilai(pelaku.premium))}
  </section>

  <div class="footer">By AlzRiss - Usanagi Umi AI</div>`

  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Menuinfo — ${escapeHtml(botName)}</title>
<style>${CSS}</style></head>
<body>
<main class="wrap">${isi}</main>
${AUTO_SIZE}
</body></html>`
}

/** Perkiraan tinggi kartu supaya tidak dilaporkan lebih pendek (isi terpotong). */
export function perkiraanTinggiMenuinfo() {
  return 2100
}

export default { buildMenuinfoCard, perkiraanTinggiMenuinfo }
