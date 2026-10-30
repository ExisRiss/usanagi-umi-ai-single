/* By AlzRiss - Usanagi Umi AI
 *
 * KARTU PING VERSI RICH (Task117).
 *
 * Dipakai HANYA saat perintah dikirim dengan PREFIX GANDA (`$$ping`, `//ping`).
 * Prefix tunggal tetap memakai tampilan lama (canvas + tombol) di
 * `plugins/main/usanagi-ping.js`.
 *
 * Angka di kartu datang dari objek statistik yang sama dengan teks ping —
 * tidak ada nilai contoh. Kalau sebuah nilai tidak terbaca, ditulis
 * "Tidak tersedia" (bukan angka karangan).
 */

import { escapeHtml, CSS } from './html.js'
import { wallpaperEnabled, wallpaperCss, wallpaperLayer, WALLPAPER_BANNER } from './wallpaper.js'

const AUTO_SIZE = `<script>
(function(){
  function ukur(){
    try{
      var layar = (window.innerHeight||0)||720;
      var h = Math.min(layar, Math.ceil((document.querySelector('.wrap')||document.body).getBoundingClientRect().height));
      if (h > 0 && window.__WA_SIZE__ !== h) { window.__WA_SIZE__ = h; if (typeof window.__setSize === 'function') window.__setSize(h) }
    }catch(e){}
  }
  window.addEventListener('load', ukur); setTimeout(ukur, 60); setTimeout(ukur, 260);
})();
</script>`

function nilai(v) {
  const text = v == null ? '' : String(v).trim()
  return text === '' ? 'Tidak tersedia' : text
}

/**
 * @param {object} stats objek dari `getStats()` di usanagi-ping.js
 * @param {object} options { botName, waktu }
 */
export function buildPingCard(stats = {}, { botName = 'Usanagi Umi AI', waktu = '' } = {}) {
  const s = stats || {}
  const kotak = [
    ['Speed', `${nilai(s.latency)} ms`],
    ['Uptime', nilai(s.uptime)],
    ['RAM', nilai(s.ram)],
    ['RSS', nilai(s.rss)],
    ['Heap', nilai(s.heap)],
    ['CPU', nilai(s.cpu)],
  ].map(([label, value]) => `
      <div class="stat"><b>${escapeHtml(value)}</b><small>${escapeHtml(label)}</small></div>`).join('')

  const baris = [
    ['Platform', s.platform],
    ['Node.js', s.node],
    ['CPU core', s.cores],
    ['Process', s.pid],
    ['Mode', s.mode],
    ['Version', s.version],
    ['Load', s.load],
  ].map(([label, value]) => `
    <div class="row"><span>${escapeHtml(label)}</span><span>${escapeHtml(nilai(value))}</span></div>`).join('')

  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ping — ${escapeHtml(botName)}</title>
<style>${CSS}${wallpaperCss()}
.ping-head{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.ping-head b{font-size:20px;letter-spacing:.4px}
.ping-head .pill{margin-left:auto;font-size:11px;padding:4px 10px;border-radius:999px;
background:rgba(95,212,244,.18);border:1px solid rgba(95,212,244,.45);color:#c8f2ff}
.ping-sub{color:var(--mute);font-size:12px}
.ping-note{color:var(--mute);font-size:11px;line-height:1.5;margin-top:8px}
</style></head>
<body>
${wallpaperLayer()}
<main class="wrap">
  <section class="glass banner">
    <div class="glow"></div>
    ${wallpaperEnabled() ? `<img class="wall" src="${WALLPAPER_BANNER}" alt="">` : ''}
    <span class="hero-badge">ONLINE</span>
    <div class="cap"><b>🏓 PONG</b><span>${escapeHtml(botName)}${waktu ? ' · ' + escapeHtml(waktu) : ''}</span></div>
  </section>

  <section class="glass">
    <p class="ping-note" style="margin-top:0">Kartu ini dikirim karena perintah memakai <b>prefix ganda</b>. Prefix tunggal tetap memakai tampilan ping seperti sebelumnya.</p>
  </section>

  <section class="glass">
    <h2>Respon &amp; resource <small>real-time</small></h2>
    <div class="stats">${kotak}</div>
  </section>

  <section class="glass">
    <h2>Detail sistem</h2>
    ${baris}
  </section>

  <div class="footer">By AlzRiss - Usanagi Umi AI</div>
</main>
${AUTO_SIZE}
</body></html>`
}

/** Perkiraan tinggi kartu supaya tidak dilaporkan lebih pendek (menu terpotong). */
export function perkiraanTinggiPing() {
  return 760
}

export default { buildPingCard, perkiraanTinggiPing }
