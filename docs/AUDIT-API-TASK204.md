# Audit API Bot — Task204 (04-11-2026)

## Metode

1. Ekstrak semua URL mengandung `api.` dari `plugins/`, `lib/`, `integrations/`,
   `core/` (file `.js`/`.mjs`) → **183 endpoint unik**.
2. Probe `GET` (timeout10s, UA browser) → **51 hidup**, **132 bermasalah**.
3. Klasifikasi ulang (penting: probe tanpa param/key menghasilkan false-positive):

| Kategori | Arti | Perkiraan |
|---|---|---|
| Hidup (200/3xx) | Langsung jalan | 51 |
| Butuh param/key (400/401/405/406/412/429) | Bukan mati — endpoint butuh body/query/apikey/POST | ~70 |
| **Mati beneran** (DNS/SSL/404 path nyata/5xx konsisten) | Ganti sumber | ~50 |

## Yang SUDAH diperbaiki pada tugas ini

| Fitur | API lama (status) | Pengganti (bukti) |
|---|---|---|
| `/lyrics`, `internet-lyrict`, wrapper umi | nexray "lyrics" shape rusak; genius **403** IP datacenter; lyrics.ovh nihil | `lib/lyrics-source.js` — LrcLib `kueriBertahap`+retry503 → genius (best-effort). **Uji3/3 OK** |
| `lib/yt-sumber.js` (piped) | `pipedapi.reallyaweso.me` **502**, `pipedapi.darkness.services` **DNS mati** | `api.piped.private.coffee` **200** + `pipedapi.adminforge.de` **200** |
| `usanagi-random-anime-image.js` | `api.waifu.im` **DNS mati**; `api.waifu.pics` **DNS mati → domain parkir judi**; nekos.best kena Cloudflare | Sumber baru: `my.izuka-api.xyz/api/anime/top-anime` **200** (uji gambar200,63KB) + `api.dotgg.gg/bluearchive/characters` **200** (base `https://api.gg/…` teruji200) |
| `game-tebakheroml.js` | `api.deline.web.id` **DNS mati** | Dataset lokal `json/tebakheroml.json` — **150 hero** dari Fandom Mobile Legends (gambar `static.wikia.nocookie.net` uji200, deskripsi role/specialty) |
|7 kategori tebak baru | — | Data Kaguya `tebakkaguya.json` dipecah ke `json/tebak{film,kota,hewan,negara,profesi,makanan,anime}.json` +7 plugin native umi |

## Daftar MATI terkonfirmasi (kandidat pengganti = bot Kaguya/Rem + penyedia hidup)

**DNS tidak resolve:**
`api.deline.web.id` (tebakff/heroml/bola, ppcouple, ai-kurumi, maker) ·
`api.waifu.im`, `api.waifu.pics` (parkir) · `api.neko-reimu.xyz` ·
`api.nekolabs.web.id` · `api.ryuu-dev.offc.my.id` · `api.zenzxz.my.id`
(spotifyplay, fakegroup, fakeigstory) · `pipedapi.darkness.services` ·
`api.waifu.pics` · `api.example.com` (placeholder di get.js/rimuru-utils —
harus dihapus) · `pipedapi.kavin.rocks` (526) · `api.deline` juga dipakai
`tebakff/tebakheroml/tebakkola/couple` — semua perlu pengganti.

**SSL/TLS rusak:** `api.cmnty.eu.cc` (balap) · `api.ourin.my.id` (kasedaiki) ·
`api.xteam.xyz` (sticker) · `api.proactor.ai` (videotranscribe) ·
`api.nexadev.my.id` (ss desktop/tablet — sebagian endpoint lain200).

**404/503 path nyata:** `ani-station-schedule-api.vercel.app` (anischedule) ·
`api-blue-archive.vercel.app` (random-blue) · `api.dashx.dpdns.org/api/stalk/minecraft` ·
`api.fstik.app` · `api.obscuraworks.org/api/v2/tools/nik` ·
`api.sansekai.my.id/api/anime/latest` · `api.theresav.biz.id` (bypass/canvas) ·
`api.kaicloud.my.id` (komikindo,530) · `zelapi.eu.cc` (boardingpass,530) ·
`api.covenant.sbs` (nanobanana,530) · `my.izuka-api.xyz/api/anime/anime-checker` +
`api/tools/unblur` (404) — sumber izuka yang lain masih200.

**Butuh APIKEY (bukan mati — pakai key kalau ada):** `free-restapi.biz.id`
(semua403), `api-faa.my.id` (403), `api.spotify.com`/`api-partner` (401),
`api.lolhuman.xyz` (apikey kosong→400), `api.imgbb.com` (butuh key),
`api.groq.com` (perlu POST+key), `api.cuki.biz.id` (401), `umi-api.gwenna.my.id` (401).

**Ambiguen (jangan disimpulkan mati):** `api.jikan.moe` — timeout TLS dari
IP datacenter (populer & biasanya hidup; retry dari IP lain); `api.ocr.space`
(400 butuh param); `api.remotion.dev`? belum ada.

## Sumber pengganti yang TERBUKTI hidup (pool)

- Anime/gambar: `my.izuka-api.xyz` (top-anime, gambar mywaifulist) ·
  `api.dotgg.gg/bluearchive/characters` · `api.animechan.io/v1/quotes/random` (200) ·
  `api.thecatapi.com` (200) · `api.nexray.web.id/random/cecan/*` (200) ·
  `api.nexadev.my.id/api/random/pap` (200) · `api.siputzx.my.id` (games: family100, tebakkata —200).
- Lirik: **lrclib.net** (primer, dengan kueri bertahap+retry) · genius (403 dari IP ini).
- YouTube: piped `private.coffee`+`adminforge` (200) · `api.savefromins.com` (200) ·
  `api.neoxr.eu/api/song` (200).
- Lain: `api.exchangerate-api.com` (200) · `api.myquran.com` (200) ·
  `islamic-api-zhirrr.vercel.app` (200) · `doa-doa-api-ahmadramadhan.fly.dev` (200) ·
  `api.audd.io` (200) · `api.ipify.org` (200) · `api.github.com` (200) ·
  `api.telegram.org` (200) · `api.synoxcloud.xyz` (canvas —200; pengganti zenzxz) ·
  `api.sticker.ly/v4` (200) · `api.shngm.io` (200) · `api.rifkyshre.biz.id` (200).

## Dari zip Kaguya/Rem (inventori pengganti)

Kaguya & Rem memakai ekosistem host yang SAMA (banyak ikut mati: deline,
waifu, nekolabs, faa). Yang berguna dari zip:
- `rem/lib/scrape/*` — scraper utility (scrape ke situs, bukan API mati).
- `kaguya/lib/panel/*` — dipakai untuk fitur `.server` (cpanel) via API ikyhost.
- Data tebak Kaguya (`tebakkaguya.json`) → sudah dipakai7 kategori baru.

## Tindak lanjut yang belum (urutkan next)

1. `spotifyplay` (zenzxz mati) — cari sumber Spotify hidup atau nonaktifkan fitur jujur.
2. `fakegroup`/`fakeigstory` (zenzxz) — ganti ke `api.synoxcloud.xyz` (sudah200).
3. `anischedule`, `random-blue`, `komikindo`, `nikparser`, `subs4unlock` —
   cari pengganti per fitur dari pool di atas / cari scraper di GitHub.
4. `api.example.com` di `get.js`/`umi-get.js`/`rimuru-utils.js` — placeholder,
   ganti dengan endpoint nyata atau hapus.
5. Jangan probe ulang `waifu.pics` — domain sudah dijual (parkir judi).
