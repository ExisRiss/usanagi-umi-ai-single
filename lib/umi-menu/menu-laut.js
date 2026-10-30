/* By AlzRiss - Usanagi Umi AI
 *
 * MENU RICH "SEA & SUN" — hasil pengembangan dari plugin richmenu-laut.js
 * yang dikirim owner (WhatsApp rich message, primitive HTML).
 *
 * Yang diambil apa adanya dari kode kiriman owner:
 *   - tema laut: biru → putih, sinar matahari, ombak, kartu kaca;
 *   - susunan halaman: Beranda / Menu / Favorit / Info / Riwayat, tab di bawah;
 *   - chip kategori yang bisa digeser, ketuk perintah = tersalin;
 *   - bar progres untuk favorit & riwayat.
 *
 * Yang dikembangkan supaya benar-benar jalan di bot ini:
 *   1. Datanya NYATA dari bot, bukan CONFIG statis:
 *        kategori + perintah + deskripsi  → lib/umi-menu/registry.js (pluginStore)
 *        favorit / riwayat               → global.db.data.stats
 *        info bot & server               → lib/umi-menu/status.js
 *        jadibot, owner, developer       → registry.js
 *   2. Semua gambar disematkan sebagai data URI (WebView WhatsApp tidak punya
 *      jaringan) dan ukuran HTML dijaga di bawah batas payload (default 780 KB):
 *      kalau kepanjangan, banner dilepas dulu, lalu avatar, lalu jumlah
 *      perintah per kategori dikurangi.
 *   3. Tidak ada permintaan jaringan sama sekali saat menyusun HTML.
 *   4. Ada penanda "ketik perintahnya" karena WebView tidak bisa mengirim chat.
 *
 * Dipakai oleh lib/umi-menu/live-menu.js untuk `..menu` (menu rich).
 *
 * Task176:
 *   - matahari (bulatan) DIHAPUS, tinggal efek pencahayaan (sinar + glow);
 *   - kartu dikunci setinggi layar WebView, isinya bisa digeser (scroll);
 *     tinggi kartu tidak berubah-ubah lagi walau daftar perintah panjang.
 */

import os from 'node:os'

export const VERSI_MENU = 'task176'

const TEMA = {
  sea1: '#0089c7',
  sea2: '#27b9ee',
  sea3: '#9be4fa',
  foam: '#ffffff',
  ink: '#06304a',
  sun: '#ffd84d',
  acc: '#ff8a3d',
}

const IKON_KATEGORI = {
  main: '🏠', owner: '👑', group: '👥', grup: '👥', game: '🎮', games: '🎮',
  tools: '🧰', tool: '🧰', downloader: '📥', download: '📥', sticker: '🎨',
  maker: '🖌️', ai: '🤖', info: 'ℹ️', store: '🛒', fun: '🎉', islamic: '🕌',
  music: '🎵', random: '🎲', rpg: '⚔️', premium: '💎', ephoto: '🖼️',
  canvas: '🖌️', anime: '🌸', panel: '🖥️', user: '👤', system: '⚙️',
}

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const num = (n) => Number(n || 0).toLocaleString('id-ID')

function durasi(detik) {
  const s = Math.max(0, Math.floor(Number(detik) || 0))
  const hari = Math.floor(s / 86400)
  const jam = Math.floor((s % 86400) / 3600)
  const menit = Math.floor((s % 3600) / 60)
  return `${hari ? `${hari}h ` : ''}${jam}j ${menit}m`
}

function relatif(waktu) {
  const ts = Number(waktu) || 0
  if (!ts) return '-'
  const selisih = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (selisih < 60) return `${selisih} dtk lalu`
  if (selisih < 3600) return `${Math.floor(selisih / 60)} mnt lalu`
  if (selisih < 86400) return `${Math.floor(selisih / 3600)} jam lalu`
  return `${Math.floor(selisih / 86400)} hari lalu`
}

/** Sapaan + jam mengikuti zona waktu bot (WITA untuk server ini). */
export function sapaan(zona = 'Asia/Makassar') {
  let jam = new Date().getHours()
  let waktu = ''
  try {
    jam = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: zona }).format(new Date())) % 24
    waktu = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zona }).format(new Date()).replace('.', ':')
  } catch {
    waktu = new Date().toTimeString().slice(0, 5)
  }
  const teks = jam < 4 ? 'Selamat Malam 🌙' : jam < 11 ? 'Selamat Pagi ☀️' : jam < 15 ? 'Selamat Siang 🌤️' : jam < 18 ? 'Selamat Sore 🌇' : 'Selamat Malam 🌙'
  return { jam, waktu, teks }
}

function css() {
  const T = TEMA
  return `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0}
html,body{height:100%;width:100%;overflow:hidden;overscroll-behavior:none}
body{font-family:'Segoe UI',Roboto,Arial,sans-serif;color:${T.ink};background:transparent}
/* Kartu setinggi layar WebView. Bagian atas (header+isi tab) digulir,
   tab di bawah menetap supaya selalu bisa dipakai. */
.card{position:relative;height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden;border-radius:22px;background:#fff;box-shadow:0 10px 28px rgba(3,54,80,.28)}
.kepala{position:relative;overflow:hidden;background:linear-gradient(180deg,${T.sea2} 0%,${T.sea1} 100%)}
.rays{position:absolute;top:-70px;right:-60px;width:230px;height:230px;border-radius:50%;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.42) 0deg 7deg,rgba(255,255,255,0) 7deg 20deg);opacity:.55;animation:putar 26s linear infinite;pointer-events:none}
/* matahari bulat sudah dihapus; tinggal pendaran cahaya */
.cahaya{position:absolute;top:-46px;right:-34px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(255,246,196,.9) 0%,rgba(255,216,77,.38) 42%,rgba(255,216,77,0) 72%);pointer-events:none}
.gulir{position:relative;flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;touch-action:pan-y}
.gulir::-webkit-scrollbar{width:0;height:0}
.bawah{position:relative;flex:0 0 auto;background:#fff;box-shadow:0 -6px 16px rgba(3,54,80,.08)}
@keyframes putar{to{transform:rotate(360deg)}}
.in{position:relative;padding:14px 14px 6px}
.top{display:flex;align-items:center;gap:9px;color:#fff}
.top .logo{width:34px;height:34px;border-radius:11px;background:rgba(255,255,255,.24);display:flex;align-items:center;justify-content:center;font-size:18px}
.top b{font-size:14.5px;letter-spacing:.3px}
.top .on{font-size:9.5px;letter-spacing:1.6px;opacity:.92}
.hexo{display:flex;justify-content:center;margin:10px 0 2px}
.hexi{width:74px;height:74px;border-radius:24px;background:rgba(255,255,255,.35) center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:30px;border:2.5px solid rgba(255,255,255,.85);box-shadow:0 6px 16px rgba(2,48,72,.25)}
.greet{text-align:center;color:#eafaff;font-size:11px;margin-top:8px;letter-spacing:.4px}
.uname{text-align:center;color:#fff;font-size:16.5px;font-weight:700;margin-top:1px;text-shadow:0 2px 8px rgba(0,60,90,.35);word-break:break-word}
.badges{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin:8px 0 10px}
.badge{font-size:9.5px;letter-spacing:.5px;color:#fff;background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:3px 8px}
.badge.p{background:${T.acc};border-color:${T.acc}}
.banner{position:relative;height:86px;border-radius:16px;background:linear-gradient(120deg,#0a6f9e,#16a6d8) center/cover no-repeat;overflow:hidden;display:flex;align-items:flex-end;padding:9px 11px;margin-bottom:9px}
.banner span{position:relative;color:#fff;font-size:14px;font-weight:700;text-shadow:0 2px 10px rgba(0,30,50,.7);line-height:1.25}
.banner small{display:block;font-size:8.5px;letter-spacing:1.7px;opacity:.9;font-weight:400}
.wave{height:16px;background:radial-gradient(circle at 10px -6px,transparent 12px,${T.foam} 13px) repeat-x;background-size:20px 16px;margin-top:4px}
/* .say ada di dalam kepala berwarna biru → latar putih tipis supaya teks tetap terbaca */
.say{background:rgba(255,255,255,.93);border-left:3px solid ${T.sun};border-radius:10px;padding:7px 9px;font-size:10.5px;color:#0a4a67;margin:8px 0;box-shadow:0 4px 12px rgba(2,48,72,.18)}
.say b{color:${T.sea1};font-size:9.5px;letter-spacing:1px}
h3{font-size:12px;letter-spacing:.6px;color:${T.sea1};margin:6px 0 7px}
h3 small{color:#5b8ba3;font-weight:400;letter-spacing:0}
.box{background:#f2fbff;border:1px solid #d7eefa;border-radius:13px;padding:9px 10px;margin-bottom:8px}
.box h4{font-size:10.5px;color:${T.sea1};margin-bottom:5px;letter-spacing:.4px}
.row{display:flex;justify-content:space-between;gap:8px;font-size:10.5px;padding:2.5px 0;border-bottom:1px dashed #d9eef8}
.row:last-child{border-bottom:0}
.row span{color:#5b8ba3}
.row b{font-weight:600;text-align:right;word-break:break-word}
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-bottom:9px}
.stat{background:#fff;border:1px solid #d7eefa;border-radius:13px;padding:8px;text-align:center;box-shadow:0 3px 10px rgba(10,90,130,.06)}
.stat b{display:block;font-size:16px;color:${T.sea1}}
.stat small{font-size:9px;color:#5b8ba3;letter-spacing:.3px}
.hs{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}
.hs::-webkit-scrollbar{height:0}
.chip{flex:0 0 auto;background:#fff;border:1px solid #cfeaf8;border-radius:999px;padding:6px 11px;font-size:11px;color:${T.sea1};font-weight:600;box-shadow:0 2px 8px rgba(10,90,130,.07)}
.cat{background:#fff;border:1px solid #dcf0fa;border-radius:13px;padding:8px 10px;margin-bottom:7px}
.cat b.h{display:block;font-size:11px;color:${T.sea1};margin-bottom:5px;letter-spacing:.3px}
.cmd{display:flex;justify-content:space-between;gap:8px;font-size:10.5px;padding:3px 0;border-bottom:1px dashed #e6f5fc}
.cmd:last-child{border-bottom:0}
.cmd code{font-family:'Courier New',monospace;color:#0b4a68;font-weight:700;font-size:10px}
.cmd span{color:#6b93a7;text-align:right;font-size:9.5px}
.tag{font-size:8px;letter-spacing:.4px;background:${T.sea3};color:#0b4a68;border-radius:6px;padding:1px 4px;margin-left:4px}
.fav,.hist{flex:0 0 158px;background:#fff;border:1px solid #dcf0fa;border-radius:13px;padding:8px 9px;box-shadow:0 3px 10px rgba(10,90,130,.06)}
.hist{display:flex;gap:7px;flex:1 1 100%}
.fav b,.hist b{font-size:10.5px;color:${T.sea1};display:block;word-break:break-word}
.fav p{font-size:9.5px;color:#6b93a7;margin-top:1px}
.rank{font-size:13px}
.hist .n{width:18px;height:18px;border-radius:6px;background:${T.sea3};color:#0b4a68;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.bar{height:5px;border-radius:99px;background:#e6f5fc;overflow:hidden;margin-top:5px}
.bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,${T.sea2},${T.sea1})}
.empty{background:#f2fbff;border:1px dashed #b9e2f4;border-radius:12px;padding:12px;text-align:center;font-size:10.5px;color:#6b93a7}
.page{display:none}
.page.on-p{display:block}
.nav{display:flex;background:#fff;border-top:1px solid #e1f2fa}
.nav .tap{flex:1;text-align:center;padding:8px 2px 7px;font-size:8.5px;letter-spacing:.5px;color:#7ba3b7;font-weight:600}
.nav .tap i{display:block;font-size:16px;font-style:normal;margin-bottom:2px}
.nav .tap.act{color:${T.sea1};background:linear-gradient(180deg,rgba(39,185,238,.14),rgba(39,185,238,0))}
.foot{text-align:center;font-size:8.5px;color:#8bb2c5;padding:7px 8px 10px;background:#fff}
.toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%) translateY(24px);background:${T.ink};color:#fff;font-size:10.5px;padding:7px 13px;border-radius:99px;opacity:0;transition:.25s;pointer-events:none}
.toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
`
}

function js() {
  return `
(function(){
  var tabs=document.querySelectorAll('.nav .tap');
  var pages=document.querySelectorAll('.page');
  function show(nama){
    for(var i=0;i<pages.length;i++){pages[i].className='page'+(pages[i].id==='p-'+nama?' on-p':'');}
    for(var j=0;j<tabs.length;j++){tabs[j].className='tap'+(tabs[j].getAttribute('data-page')===nama?' act':'');}
    var g=document.getElementById('gulir');
    if(g){g.scrollTop=0;}
    window.scrollTo(0,0);
  }
  for(var k=0;k<tabs.length;k++){
    (function(el){el.addEventListener('click',function(){show(el.getAttribute('data-page'));});})(tabs[k]);
  }
  var toast=document.getElementById('toast');
  function bilang(t){if(!toast)return;toast.textContent=t;toast.className='toast on';setTimeout(function(){toast.className='toast';},1500);}
  var taps=document.querySelectorAll('[data-copy]');
  for(var t=0;t<taps.length;t++){
    (function(el){
      el.addEventListener('click',function(){
        var teks=el.getAttribute('data-copy')||'';
        try{
          if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(teks);}
          else{var ta=document.createElement('textarea');ta.value=teks;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);}
          bilang('Tersalin: '+teks);
        }catch(e){bilang('Ketik di chat: '+teks);}
      });
    })(taps[t]);
  }
})();
`
}

/* ───────────────────────── halaman ───────────────────────── */

function halamanBeranda(ctx) {
  const c = ctx.counts || {}
  const sapa = ctx.sapaan || sapaan(ctx.timezone)
  return `<h3>🏠 Beranda</h3>
    <div class="stats">
      <div class="stat"><b>${num(c.commands)}</b><small>PERINTAH</small></div>
      <div class="stat"><b>${num(c.categories)}</b><small>KATEGORI</small></div>
      <div class="stat"><b>${num(c.users)}</b><small>USER</small></div>
      <div class="stat"><b>${num(c.jadibot)}</b><small>JADIBOT HIDUP</small></div>
    </div>
    <div class="say"><b>AI BILANG~</b><br>Halo <b style="font-size:12px">${esc(ctx.name || 'Kak')}</b>! Geser kartu kategori di tab <b>MENU</b>, atau ketik langsung perintahnya di chat — kartu ini hanya menampilkan, tidak bisa mengirim pesan.</div>
    <div class="box"><h4>⚡ Pintasan</h4>
      <div class="row"><span>Semua menu</span><b>${esc(ctx.prefix)}menu_all</b></div>
      <div class="row"><span>Daftar kategori</span><b>${esc(ctx.prefix)}kategori</b></div>
      <div class="row"><span>Cek kecepatan</span><b>${esc(ctx.prefix)}ping</b></div>
      <div class="row"><span>Kontak owner</span><b>${esc(ctx.prefix)}owner</b></div>
    </div>
    <div class="box"><h4>🕒 Sekarang</h4>
      <div class="row"><span>Waktu</span><b>${esc(sapa.waktu)} ${esc(ctx.tzLabel || 'WITA')}</b></div>
      <div class="row"><span>Sapaan</span><b>${esc(sapa.teks)}</b></div>
      <div class="row"><span>Uptime bot</span><b>${esc(ctx.uptimeText || '-')}</b></div>
    </div>`
}

function halamanMenu(ctx) {
  const kategori = ctx.categories || []
  if (!kategori.length) return `<h3>🍹 Daftar Menu</h3><div class="empty">Daftar perintah belum termuat.</div>`
  const chip = kategori.map((k) => `<div class="chip">${esc(k.icon || '📁')} ${esc(k.label)} · ${num(k.items.length)}</div>`).join('')
  const isi = kategori.map((k) => {
    const daftar = (k.items || []).map((i) => `<div class="cmd tap" data-copy="${esc(ctx.prefix + i.cmd)}">
        <code>${esc(ctx.prefix + i.cmd)}${i.owner ? '<span class="tag">OWNER</span>' : ''}${i.group ? '<span class="tag">GRUP</span>' : ''}</code>
        <span>${esc(i.desc || '')}</span>
      </div>`).join('')
    return `<div class="cat"><b class="h">${esc(k.icon || '📁')} ${esc(k.label)} <small style="color:#7ba3b7;font-weight:400">· ${num(k.total)} perintah</small></b>${daftar}</div>`
  }).join('')
  return `<h3>🍹 Daftar Menu <small>· geser kategori ➜</small></h3><div class="hs">${chip}</div>${isi}`
}

function halamanFavorit(ctx) {
  const top = ctx.top || []
  if (!top.length) return `<h3>⭐ Favorit</h3><div class="empty">Belum ada data pemakaian perintah.</div>`
  const max = Math.max(1, Number(top[0].count) || 1)
  const medal = ['🥇', '🥈', '🥉']
  const kartu = top.map((s, i) => `<div class="fav tap" data-copy="${esc(ctx.prefix + s.command)}">
      <div class="rank">${medal[i] || `#${i + 1}`}</div>
      <b>${esc(ctx.prefix + s.command)}</b>
      <p>📊 ${num(s.count)}× dipakai</p>
      <p>🕒 ${relatif(s.last)}</p>
      <div class="bar"><i style="width:${Math.round((Number(s.count) || 0) / max * 100)}%"></i></div>
    </div>`).join('')
  return `<h3>⭐ Top ${top.length} Favorit <small>· geser ➜</small></h3><div class="hs">${kartu}</div>`
}

function halamanInfo(ctx) {
  const c = ctx.counts || {}
  const rows = (daftar) => (daftar || []).map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')
  const info = ctx.info || {}
  return `<h3>ℹ️ Informasi</h3>
    <div class="stats">
      <div class="stat"><b>${num(c.plugins)}</b><small>PLUGIN</small></div>
      <div class="stat"><b>${num(c.groups)}</b><small>GRUP</small></div>
      <div class="stat"><b>${num(c.aliases)}</b><small>ALIAS</small></div>
      <div class="stat"><b>${num(c.ownerCommands)}</b><small>PERINTAH OWNER</small></div>
    </div>
    <div class="box"><h4>🤖 Info Bot</h4>${rows(info.bot)}</div>
    <div class="box"><h4>🖥️ Info Server</h4>${rows(info.server)}
      <div class="bar"><i style="width:${Math.min(100, Number(ctx.ramPct) || 0)}%"></i></div>
      <small style="font-size:9.5px;color:#6b93a7">RAM terpakai ${num(ctx.ramPct)}%</small>
    </div>
    <div class="box"><h4>👤 Pemilik</h4>
      <div class="row"><span>Owner</span><b>${esc(ctx.owner?.name || '-')}</b></div>
      <div class="row"><span>Nomor owner</span><b>${esc(ctx.owner?.number || '-')}</b></div>
      <div class="row"><span>Developer</span><b>${esc(ctx.developer?.name || 'AlzRiss')}</b></div>
    </div>`
}

function halamanRiwayat(ctx) {
  const list = ctx.recent || []
  if (!list.length) return `<h3>🕒 Riwayat</h3><div class="empty">Belum ada riwayat perintah.</div>`
  const max = Math.max(1, Number(list[0].count) || 1)
  return `<h3>🕒 Terakhir Dipakai</h3>` + list.map((s, i) => `<div class="hist tap" data-copy="${esc(ctx.prefix + s.command)}">
      <div class="n">${i + 1}</div>
      <div style="flex:1;min-width:0"><b>${esc(ctx.prefix + s.command)}</b>
      <small style="font-size:9.5px;color:#6b93a7">${num(s.count)}× · ${relatif(s.last)}</small>
      <div class="bar"><i style="width:${Math.round((Number(s.count) || 0) / max * 100)}%"></i></div></div>
    </div>`).join('')
}

/* ───────────────────── perakitan HTML ───────────────────── */

function rakit(ctx) {
  const sapa = ctx.sapaan || sapaan(ctx.timezone)
  const avatarStyle = ctx.avatarDataUri ? `style="background-image:url('${ctx.avatarDataUri}')"` : ''
  const bannerStyle = ctx.bannerDataUri ? `style="background-image:url('${ctx.bannerDataUri}')"` : ''
  const say = [
    'Kamu tahu nggak? Setiap kamu buka menu, aku makin semangat! 🌊',
    'Ketuk perintah untuk menyalinnya, lalu kirim ke chat ya~ ✨',
    'Pantai cerah, bot siap melayani! ☀️',
    'Kalau kartu ini terasa berat, ketik menu biasa saja, tetap jalan. 🐚',
  ][Math.floor(Math.random() * 4)]

  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css()}</style></head><body class="umi-scroll-sendiri">
<div class="card">
  <div class="gulir" id="gulir">
  <div class="kepala">
  <div class="rays"></div><div class="cahaya"></div>
  <div class="in">
    <div class="top">
      ${ctx.logoDataUri ? `<div class="logo" style="background-image:url('${ctx.logoDataUri}');background-size:cover"></div>` : '<div class="logo">🌸</div>'}
      <div><b>${esc(ctx.botName)}</b><div class="on">${ctx.connected ? 'ONLINE' : 'MENYAMBUNG…'}</div></div>
    </div>
    <div class="hexo"><div class="hexi" ${avatarStyle}>${ctx.avatarDataUri ? '' : '👤'}</div></div>
    <div class="greet">${esc(sapa.teks)} ~ Selamat Datang</div>
    <div class="uname">${esc(ctx.name || 'Kak')}</div>
    <div class="badges">
      <span class="badge p">👤 ${esc(ctx.roleLabel || 'USER')}</span>
      <span class="badge">${esc(ctx.version)}</span>
      <span class="badge">${esc(ctx.modeLabel)}</span>
      <span class="badge">🕒 ${esc(sapa.waktu)} ${esc(ctx.tzLabel || 'WITA')}</span>
    </div>
    <div class="banner" ${bannerStyle}><span><small>✦ ${esc((ctx.tagline || '').toUpperCase())} ✦</small>${esc(ctx.botName)}</span></div>
    <div class="say"><b>AI BILANG~</b><br>${say}</div>
  </div>
  <div class="wave"></div>
  </div>
  <div class="in" style="padding-top:10px;min-height:240px">
    <div class="page on-p" id="p-beranda">${halamanBeranda(ctx)}</div>
    <div class="page" id="p-menu">${halamanMenu(ctx)}</div>
    <div class="page" id="p-favorit">${halamanFavorit(ctx)}</div>
    <div class="page" id="p-info">${halamanInfo(ctx)}</div>
    <div class="page" id="p-riwayat">${halamanRiwayat(ctx)}</div>
  </div>
  </div>
  <div class="bawah">
  <div class="nav">
    <div class="tap act" data-page="beranda"><i>🏖️</i>BERANDA</div>
    <div class="tap" data-page="menu"><i>🍹</i>MENU</div>
    <div class="tap" data-page="favorit"><i>⭐</i>FAVORIT</div>
    <div class="tap" data-page="info"><i>📊</i>INFO</div>
    <div class="tap" data-page="riwayat"><i>🕒</i>RIWAYAT</div>
  </div>
  <div class="foot">${esc(ctx.tagline || 'Umi Usanagi AI')} • ketuk perintah buat menyalin~</div>
  </div>
  <div class="toast" id="toast"></div>
</div>
<script>${js()}</script></body></html>`
}

/**
 * Bangun HTML menu rich. Ukuran dijaga: kalau melebihi `maxBytes`, gambar
 * dilepas dulu, lalu daftar perintah per kategori dipangkas.
 *
 * @param {object} ctx data siap pakai (lihat rakit())
 * @param {{maxBytes?:number}} [opsi]
 * @returns {{html:string, bytes:number, dipangkas:string[]}}
 */
export function buildMenuLaut(ctx = {}, opsi = {}) {
  const batas = Number(opsi.maxBytes) || Number(ctx.maxBytes) || 780000
  const dipangkas = []
  let kerja = { ...ctx, categories: (ctx.categories || []).map((k) => ({ ...k, items: [...(k.items || [])] })) }

  let html = rakit(kerja)
  let bytes = Buffer.byteLength(html, 'utf8')
  if (bytes > batas && kerja.bannerDataUri) {
    kerja.bannerDataUri = ''
    dipangkas.push('banner')
    html = rakit(kerja); bytes = Buffer.byteLength(html, 'utf8')
  }
  if (bytes > batas && kerja.avatarDataUri) {
    kerja.avatarDataUri = ''
    dipangkas.push('avatar')
    html = rakit(kerja); bytes = Buffer.byteLength(html, 'utf8')
  }
  let potong = 10
  while (bytes > batas && potong >= 2) {
    kerja.categories = kerja.categories.map((k) => ({ ...k, items: k.items.slice(0, potong) }))
    kerja.recent = (kerja.recent || []).slice(0, potong)
    dipangkas.push(`item<=${potong}`)
    html = rakit(kerja); bytes = Buffer.byteLength(html, 'utf8')
    potong -= 2
  }
  if (bytes > batas) {
    kerja.categories = kerja.categories.slice(0, 6)
    dipangkas.push('kategori<=6')
    html = rakit(kerja); bytes = Buffer.byteLength(html, 'utf8')
  }
  return { html, bytes, dipangkas }
}

/** Ringkasan teks (dipakai kalau kartu HTML ditolak klien). */
export function menuLautTeks(ctx = {}) {
  const p = ctx.prefix || '.'
  const kategori = (ctx.categories || []).map((k) => `*${k.icon || '📁'} ${k.label}*\n${(k.items || []).map((i) => `• ${p}${i.cmd}`).join('\n')}`)
  return [`✨ *${ctx.botName || 'Usanagi Umi AI'}* — ${ctx.tagline || ''}`, `Halo ${ctx.name || 'Kak'}!`, '', ...kategori, '', `Total ${num(ctx.counts?.commands)} perintah · ${num(ctx.counts?.categories)} kategori`].join('\n')
}

/** Data info bot + server dari status collectStatus(). */
export function infoDariStatus(ctx = {}) {
  const server = ctx.server || {}
  const sapa = sapaan(ctx.timezone)
  return {
    bot: [
      ['Nama', ctx.botName || 'Usanagi Umi AI'],
      ['Versi', ctx.version || '-'],
      ['Mode', ctx.modeLabel || '-'],
      ['Nomor bot', ctx.botNumber || '-'],
      ['Awalan', ctx.prefix || '.'],
      ['Uptime bot', durasi(server.uptimeSeconds || process.uptime())],
      ['Waktu', `${sapa.waktu} ${ctx.tzLabel || 'WITA'}`],
    ],
    server: [
      ['Platform', server.platform || `${os.type()} ${os.arch()}`],
      ['Node.js', server.nodeVersion || process.version],
      ['CPU', `${server.cpuCount || os.cpus().length} core${server.cpuPercent != null ? ` · ${server.cpuPercent}%` : ''}`],
      ['RAM proses', `${num(server.rssMb)} MB`],
      ['Heap', `${num(server.heapMb)} MB`],
      ['RAM sistem', `${num(server.systemFreeMb)} MB bebas / ${num(server.systemTotalGb)} GB`],
      ['Uptime server', durasi(server.systemUptimeSeconds || os.uptime())],
    ],
  }
}

export default { buildMenuLaut, menuLautTeks, infoDariStatus, sapaan, VERSI_MENU }
