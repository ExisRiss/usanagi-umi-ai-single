# Tutorial Task197 — Game /spidergame (RichMassange Explorer V2)

## Cara main
1. **Di chat**: ketik `/spidergame` (prefix mengikuti prefix bot) → game dikirim
   sebagai pesan AI Rich (HTML interaktif) — pakai joystick virtual di layar.
   Butuh WhatsApp terbaru yang mendukung Rich Message; kalau tidak didukung,
   bot otomatis menawarkan link web.
2. **Via web**: https://spidergame-alzriss.gwenna.my.id/ (disajikan dari
   `situs/spidergame/index.html` — sama persis game-nya).

## Berkas
- `lib/rich-games/spidergame.html` — isi game (dibaca plugin tiap kirim, di-cache).
- `plugins/game-html/spidergame.js` — command `spidergame`/`htmlspider`;
  payload `richResponseMessage` mengikuti pola game HTML lain (flappy dkk).
- `situs/spidergame/index.html` — salinan untuk versi web (dua server).
- URL web bisa di-override env `SPIDERGAME_WEB_URL`.

## Uji lokal
`/tmp/uji197.mjs` — 7/7 (regex, struktur rich, payload HTML utuh34KB,
messageId = responseId).

## Pemasangan
Push (plugin + html + docs) → deploy plugin+html + tulis `situs/spidergame/`
di dua server → restart → cek `https://spidergame-alzriss.gwenna.my.id/` 200.
