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

export const VERSI_MENU = 'task181-alur-dasar-isi-scroll'

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
  /* TEMA "LIQUID GLASS × NEOBRUTALISM" (Task177)
   *
   * Keinginan owner: kaca cair yang blur dan tembus background + neobrutalism
   * (garis tebal, bayangan keras, warna ngejreng).
   *
   * Catatan teknis penting:
   *   • TIDAK ada `height:100vh` / `height:100%` pada html/body di file ini.
   *     Kalau WebView melaporkan tinggi 0, aturan itu membuat kartu KOSONG.
   *     Tinggi kartu ditentukan isi.
   *   • Tidak ada gambar matahari; cahaya hanya efek gradient.
   *
   * Task177-lanjutan (keluhan owner: "scroll berat & engga gerak"):
   *   • Body TIDAK lagi memakai scroll-sendiri bawaan → sisipGulir() dari
   *     rich-live-card.js menyuntik CSS gulir yang SAMA dengan kartu lain.
   *   • `.isi` kembali biasa (tanpa max-height) → SATU wadah gulir.
   *   • Blur diturunkan: `.glass` blur 18px → 8px, `.nav` sticky.
   *
   * Task180 (keluhan owner: "..menu cuma nampilin foto umi doang, teks
   * benner dll gaada"):
   *   • Penyebab: injeksi CSS_GULIR menambahkan `html,body{height:100%}`;
   *     di WebView HP owner aturan itu membuat badan kartu tinggi 0 lalu
   *     semua isi yang mengalir ter-clip — yang tersisa hanya `.bg` (foto
   *     Umi, position:fixed, lolos clipping).
   *   • Blok `.banner` berteks DITAMBAHKAN kembali (CSS-nya ada sejak
   *     Task173c tapi elemennya tidak pernah dirakit — "teks benner
   *     gaada").
   *
   * Task181 (keluhan owner: kartu Task180 "kecil banget, tombol tidak
   * berfungsi, tidak bisa digeser"): pembungkus `.stage` position:fixed
   * TIDAK cocok dengan WebView rich message di HP owner — merusak tata
   * letak, koordinat tap, dan gulir. Fakta empiris dari HP owner:
   *   • height:100% pada html/body → badan tinggi 0 ("foto doang").
   *   • .stage position:fixed      → kecil, tombol mati, tak bisa geser.
   *   • Alur Task177-original      → kartu tampil utuh (uji /ujirich).
   * Jadi Task181 KEMBALI ke alur Task177-original: tanpa tinggi persen,
   * tanpa pembungkus fixed; `.isi` bermax-height jadi wadah gulir sentuh;
   * nav statis di alur dokumen; body tetap `umi-scroll-sendiri` supaya
   * sisipGulir() tidak menyuntik height:100%. Teks banner Task180
   * DIPERTAHANKAN.
   */
  const T = TEMA
  return `
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{height:auto;margin:0}
body{font-family:'Segoe UI',Roboto,Arial,sans-serif;color:${T.ink};background:#0b0b12}
.bg{position:fixed;inset:0;background-position:center;background-size:cover;background-repeat:no-repeat;z-index:0}
.bg::after{content:'';position:absolute;inset:0;background:linear-gradient(165deg,rgba(88,231,255,.55),rgba(255,90,190,.34) 52%,rgba(200,255,46,.5))}
/* Task181 — TANPA .stage dan TANPA overflow:hidden pada html/body: WebView
   rich message HP owner merusak pembungkus fixed besar (tombol mati, tak
   bisa digeser). Alur dokumen biasa + .isi max-height = yang terbukti tampil. */
.card{position:relative;z-index:1;padding:9px;display:block}

/* ── kaca cair ── (blur ringan — 18px + saturate 175% membuat scroll berat
   di HP owner; efek tembus tetap terjaga lewat latar translusen) */
.glass{background:rgba(255,255,255,.36);border:3px solid #0b0b12;border-radius:20px;
  box-shadow:inset 0 2px 0 rgba(255,255,255,.9),inset 0 -14px 22px rgba(255,255,255,.22),7px 7px 0 #0b0b12;
  -webkit-backdrop-filter:blur(8px) saturate(140%);backdrop-filter:blur(8px) saturate(140%)}

.hero{padding:10px;margin-bottom:9px;position:relative;overflow:hidden}
.hero::after{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;
  background:linear-gradient(150deg,rgba(255,255,255,.3),rgba(255,255,255,.1) 55%,rgba(255,255,255,.36))}
.hero::before{content:'';position:absolute;top:-60px;right:-50px;width:190px;height:190px;border-radius:50%;z-index:1;
  background:radial-gradient(circle,rgba(255,246,196,.85),rgba(200,255,46,.35) 45%,transparent 72%);pointer-events:none}
.top{display:flex;align-items:center;gap:8px;position:relative;z-index:2}
.top .logo{width:36px;height:36px;border-radius:12px;border:3px solid #0b0b12;background:#fff center/cover no-repeat;
  display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:3px 3px 0 #0b0b12}
.top b{font-size:15px;letter-spacing:.2px;color:${T.ink};text-shadow:0 1px 0 rgba(255,255,255,.75)}
.top .on{font-size:9px;letter-spacing:1.4px;font-weight:800;color:#0b6b3a;background:#c8ff2e;border:2px solid #0b0b12;
  border-radius:99px;padding:1px 6px;display:inline-block;margin-top:2px}

.ident{display:flex;align-items:center;gap:9px;margin:8px 0 2px;position:relative;z-index:2}
.hexi{width:50px;height:50px;border-radius:15px;flex:0 0 auto;background:rgba(255,255,255,.5) center/cover no-repeat;
  display:flex;align-items:center;justify-content:center;font-size:22px;border:3px solid #0b0b12;box-shadow:4px 4px 0 #0b0b12}
.nama{min-width:0}
.greet{font-size:10.5px;font-weight:700;color:#2b2b3a;letter-spacing:.2px}
.uname{font-size:16px;font-weight:800;color:${T.ink};word-break:break-word;line-height:1.15;text-shadow:0 1px 0 rgba(255,255,255,.7)}
.badges{display:flex;flex-wrap:wrap;gap:5px;margin:7px 0 8px;position:relative;z-index:2}
.badge{font-size:9px;font-weight:800;letter-spacing:.3px;color:${T.ink};background:#fff;border:2.5px solid #0b0b12;
  border-radius:8px;padding:2px 7px;box-shadow:2px 2px 0 #0b0b12}
.badge.p{background:#ff5abe;color:#fff}

.banner{position:relative;height:104px;z-index:2;border-radius:16px;border:3px solid #0b0b12;box-shadow:5px 5px 0 #0b0b12;
  background:linear-gradient(120deg,#0a6f9e,#16a6d8) center/cover no-repeat;overflow:hidden;display:flex;align-items:flex-end;padding:9px 11px}
.banner::after{content:'';position:absolute;inset:0;background:linear-gradient(transparent 35%,rgba(3,26,46,.82))}
.banner span{position:relative;z-index:1;color:#fff;font-size:14px;font-weight:800;text-shadow:0 2px 8px rgba(0,30,50,.85);line-height:1.2}
.banner small{display:block;font-size:8px;letter-spacing:1.6px;opacity:.95;font-weight:700}

.say{position:relative;z-index:2;background:#c8ff2e;border:3px solid #0b0b12;border-radius:12px;box-shadow:4px 4px 0 #0b0b12;
  padding:7px 9px;font-size:10px;line-height:1.35;color:#0b0b12;margin-top:8px;font-weight:600}
.say b{font-size:9px;letter-spacing:1px;display:inline-block;margin-bottom:2px;background:#0b0b12;color:#c8ff2e;border-radius:6px;padding:1px 5px}

/* ── panel isi (ikut mengalir — SELURUH body yang bergulir, Task177-lanjutan) ── */
.panel{padding:0;overflow:hidden;margin-bottom:9px}
.panel .kepala-isi{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 11px;
  border-bottom:3px solid #0b0b12;background:rgba(255,255,255,.55);font-size:10px;font-weight:800;letter-spacing:.4px}
.panel .kepala-isi small{font-weight:700;color:#3a3a4a;letter-spacing:0}
.isi{max-height:340px;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;touch-action:pan-y;padding:9px 10px 5px}

h3{font-size:12px;letter-spacing:.3px;color:${T.ink};margin:2px 0 8px;font-weight:800}
h3 small{color:#3a3a4a;font-weight:700;letter-spacing:0;font-size:9.5px}
.box{background:rgba(255,255,255,.88);border:2.5px solid #0b0b12;border-radius:14px;box-shadow:4px 4px 0 #0b0b12;padding:9px 10px;margin-bottom:9px}
.box h4{font-size:10.5px;color:${T.ink};margin-bottom:6px;letter-spacing:.3px;font-weight:800}
.row{display:flex;justify-content:space-between;gap:8px;font-size:10.5px;padding:3px 0;border-bottom:2px dashed rgba(11,11,18,.18)}
.row:last-child{border-bottom:0}
.row span{color:#3a3a4a;font-weight:600}
.row b{font-weight:800;text-align:right;word-break:break-word}
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:9px}
.stat{background:#fff;border:2.5px solid #0b0b12;border-radius:13px;box-shadow:4px 4px 0 #0b0b12;padding:8px 6px;text-align:center}
.stat b{display:block;font-size:17px;color:${T.ink};font-weight:800}
.stat small{font-size:8.5px;color:#3a3a4a;letter-spacing:.4px;font-weight:700}
.hs{display:flex;gap:8px;overflow-x:auto;padding-bottom:5px;-webkit-overflow-scrolling:touch;margin-bottom:8px}
.hs::-webkit-scrollbar{height:0}
.chip{flex:0 0 auto;background:#fff;border:2.5px solid #0b0b12;border-radius:99px;padding:5px 11px;font-size:10.5px;
  color:${T.ink};font-weight:800;box-shadow:3px 3px 0 #0b0b12}
.cat{background:rgba(255,255,255,.9);border:2.5px solid #0b0b12;border-radius:13px;box-shadow:4px 4px 0 #0b0b12;padding:9px 10px;margin-bottom:9px}
.cat b.h{display:block;font-size:11px;color:${T.ink};margin-bottom:6px;font-weight:800}
.cmd{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;font-size:10.5px;padding:4px 0;border-bottom:2px dashed rgba(11,11,18,.14)}
.cmd:last-child{border-bottom:0}
.cmd code{font-family:'Courier New',monospace;color:#c8ff2e;background:#0b0b12;border-radius:7px;padding:1px 6px;font-weight:800;font-size:9.5px;flex:0 0 auto}
.cmd span{color:#3a3a4a;text-align:right;font-size:9.5px;font-weight:600}
.tag{font-size:7.5px;letter-spacing:.3px;background:#ff5abe;color:#fff;border-radius:5px;padding:1px 4px;margin-left:4px;font-weight:800}
.fav,.hist{flex:0 0 158px;background:#fff;border:2.5px solid #0b0b12;border-radius:13px;box-shadow:4px 4px 0 #0b0b12;padding:8px 9px}
.hist{display:flex;gap:7px;flex:1 1 100%}
.fav b,.hist b{font-size:10.5px;color:${T.ink};display:block;word-break:break-word;font-weight:800}
.fav p{font-size:9.5px;color:#3a3a4a;margin-top:2px;font-weight:600}
.rank{font-size:14px}
.hist .n{width:19px;height:19px;border-radius:6px;background:#c8ff2e;border:2px solid #0b0b12;color:#0b0b12;font-size:9px;
  font-weight:800;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.bar{height:7px;border-radius:99px;background:#e8e8f0;border:2px solid #0b0b12;overflow:hidden;margin-top:6px}
.bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#ff5abe,#c8ff2e)}
.empty{background:rgba(255,255,255,.75);border:2.5px dashed #0b0b12;border-radius:12px;padding:12px;text-align:center;font-size:10.5px;color:#3a3a4a;font-weight:600}
.page{display:none}
.page.on-p{display:block}

/* ── tab neobrutalism (sticky: selalu terlihat walau kartu digulir) ── */
.nav{display:flex;gap:5px;padding:6px;border:3px solid #0b0b12;border-radius:16px;background:rgba(255,255,255,.85);
  box-shadow:6px 6px 0 #0b0b12}
.nav .tap{flex:1;text-align:center;padding:5px 2px 4px;font-size:7.5px;letter-spacing:.2px;color:${T.ink};font-weight:800;
  background:#fff;border:2.5px solid #0b0b12;border-radius:11px;box-shadow:3px 3px 0 #0b0b12;transition:transform .08s}
.nav .tap i{display:block;font-size:14px;font-style:normal;margin-bottom:0;line-height:1.15}
.nav .tap.act{background:#c8ff2e;transform:translate(2px,2px);box-shadow:1px 1px 0 #0b0b12}
.nav .tap:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #0b0b12}
.foot{text-align:center;font-size:8px;color:${T.ink};font-weight:700;opacity:.85;padding:6px 6px 2px}
.toast{position:fixed;left:50%;bottom:14px;transform:translateX(-50%) translateY(24px);background:#0b0b12;color:#c8ff2e;
  border:2.5px solid #c8ff2e;font-size:10.5px;font-weight:800;padding:7px 13px;border-radius:12px;opacity:0;transition:.22s;pointer-events:none;z-index:9}
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
    var sc=document.scrollingElement||document.documentElement;
    sc.scrollTop=0;
    document.body.scrollTop=0;
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
        function cadangan(){
          try{
            var ta=document.createElement('textarea');ta.value=teks;ta.setAttribute('readonly','');
            ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);
            ta.select();ta.setSelectionRange(0,teks.length);
            var ok=document.execCommand('copy');document.body.removeChild(ta);
            bilang(ok?'Tersalin: '+teks:'Ketik di chat: '+teks);
          }catch(e){bilang('Ketik di chat: '+teks);}
        }
        /* writeText mengembalikan Promise: penolakan izin TIDAK tertangkap
         * try/catch biasa dan dulu memunculkan galat di konsol. */
        if(navigator.clipboard&&navigator.clipboard.writeText){
          navigator.clipboard.writeText(teks).then(function(){bilang('Tersalin: '+teks);},cadangan);
        }else{cadangan();}
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
  const bgStyle = ctx.bannerDataUri ? `style="background-image:url('${ctx.bannerDataUri}')"` : ''
  const say = [
    'Kamu tahu nggak? Setiap kamu buka menu, aku makin semangat! 🌊',
    'Ketuk perintah untuk menyalinnya, lalu kirim ke chat ya~ ✨',
    'Geser daftar di dalam kartu — tab di bawah selalu bisa dipakai. 🐚',
    'Kalau kartu ini terasa berat, ketik menu biasa saja, tetap jalan.',
  ][Math.floor(Math.random() * 4)]

  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css()}</style></head><body class="umi-scroll-sendiri">
<div class="bg" ${bgStyle}></div>
<div class="card">
  <!-- Banner hanya dipasang SEKALI di .bg. Dulu ikut dipasang di hero juga
       sehingga base64 gambar masuk dua kali dan kartu membengkak ~170 KB. -->
  <div class="hero glass">
    <div class="top">
      ${ctx.logoDataUri ? `<div class="logo" style="background-image:url('${ctx.logoDataUri}')"></div>` : '<div class="logo">🌸</div>'}
      <div><b>${esc(ctx.botName)}</b><div><span class="on">${ctx.connected ? 'ONLINE' : 'MENYAMBUNG…'}</span></div></div>
    </div>
    <div class="ident">
      <div class="hexi" ${avatarStyle}>${ctx.avatarDataUri ? '' : '👤'}</div>
      <div class="nama">
        <div class="greet">${esc(sapa.teks)} ~ Selamat Datang</div>
        <div class="uname">${esc(ctx.name || 'Kak')}</div>
      </div>
    </div>
    <div class="badges">
      <span class="badge p">👤 ${esc(ctx.roleLabel || 'USER')}</span>
      <span class="badge">${esc(ctx.version)}</span>
      <span class="badge">${esc(ctx.modeLabel)}</span>
      <span class="badge">🕒 ${esc(sapa.waktu)} ${esc(ctx.tzLabel || 'WITA')}</span>
    </div>
    <div class="banner"><span>${esc(ctx.botName)}</span><small>${esc(ctx.tagline || 'Umi Usanagi AI')}${ctx.version ? ` · ${esc(ctx.version)}` : ''}</small></div>
    <div class="say"><b>AI BILANG~</b><br>${say}</div>
  </div>

  <div class="panel glass">
    <div class="kepala-isi"><span>ISI KARTU</span><small>geser kartu ↕</small></div>
    <div class="isi" id="gulir">
      <div class="page on-p" id="p-beranda">${halamanBeranda(ctx)}</div>
      <div class="page" id="p-menu">${halamanMenu(ctx)}</div>
      <div class="page" id="p-favorit">${halamanFavorit(ctx)}</div>
      <div class="page" id="p-info">${halamanInfo(ctx)}</div>
      <div class="page" id="p-riwayat">${halamanRiwayat(ctx)}</div>
    </div>
  </div>

  <div class="nav">
    <div class="tap act" data-page="beranda"><i>🏖️</i>BERANDA</div>
    <div class="tap" data-page="menu"><i>🍹</i>MENU</div>
    <div class="tap" data-page="favorit"><i>⭐</i>FAVORIT</div>
    <div class="tap" data-page="info"><i>📊</i>INFO</div>
    <div class="tap" data-page="riwayat"><i>🕒</i>RIWAYAT</div>
  </div>
  <div class="foot">${esc(ctx.tagline || 'Umi Usanagi AI')} • ketuk perintah buat menyalin~</div>
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
