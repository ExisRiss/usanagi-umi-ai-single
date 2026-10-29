/* Task157 — restart bot tidak boleh mematikan server.
 *
 * Latar: panel Pterodactyl membalas 429 saat beberapa restart berdekatan
 * (auto update tepat setelah deploy manual). Dulu satu kegagalan panel
 * langsung `process.exit(0)`; karena panel tidak menyalakan ulang sendiri,
 * seluruh server mati → Cloudflare 1033/530 untuk semua domain.
 *
 * Jalankan: node tests/task157-restart-aman.mjs
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

let lulus = 0
let gagal = 0
const cek = (nama, benar, tambahan = '') => {
  if (benar) { lulus++; console.log(`  ✅ ${nama}`) }
  else { gagal++; console.log(`  ❌ ${nama}${tambahan ? ' — ' + tambahan : ''}`) }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'umi157-'))
fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
fs.writeFileSync(path.join(tmp, 'data', 'auto-update.json'), JSON.stringify({
  restartOtomatis: true,
  restart: {
    mode: 'panel',
    panelUrl: 'https://panel.contoh.test',
    apiKey: 'uji',
    serverId: 'abc',
    jedaMs: [0, 5, 5, 5],
  },
  intervalMenit: 10,
}))
process.chdir(tmp)
const MODUL = pathToFileURL('/home/user/umi/lib/auto-update.js').href
const mod = await import(MODUL)

/** Tiruan fetch panel: `urutan` daftar status yang dibalas. */
function pasangFetch(urutan) {
  const dipanggil = []
  globalThis.fetch = async (url, opsi) => {
    dipanggil.push({ url, signal: JSON.parse(opsi.body).signal })
    const status = urutan[Math.min(dipanggil.length - 1, urutan.length - 1)]
    return { ok: status >= 200 && status < 300, status }
  }
  return dipanggil
}

const dimatikan = []
const asliExit = process.exit
process.exit = (kode) => { dimatikan.push(kode); return undefined }

console.log('== panel sehat ==')
{
  const panggil = pasangFetch([204])
  const hasil = await mod.restartBot()
  cek('cara panel', hasil.cara === 'panel' && hasil.ok === true, JSON.stringify(hasil))
  cek('signal restart dikirim', panggil.length === 1 && panggil[0].signal === 'restart', JSON.stringify(panggil[0]))
  cek('tidak mematikan proses', dimatikan.length === 0)
}

console.log('== panel throttle 429 lalu pulih ==')
{
  const panggil = pasangFetch([429, 429, 204])
  const hasil = await mod.restartBot()
  cek('dicoba ulang sampai berhasil', hasil.cara === 'panel' && hasil.ok === true, JSON.stringify(hasil))
  cek('tiga percobaan', panggil.length === 3, String(panggil.length))
  cek('proses tetap hidup', dimatikan.length === 0)
}

console.log('== panel error 500 terus ==')
{
  const panggil = pasangFetch([500])
  const hasil = await mod.restartBot()
  cek('tidak berhenti di percobaan pertama', panggil.length === 4, String(panggil.length))
  cek('hasil tunda', hasil.cara === 'tunda' && hasil.ok === false, JSON.stringify(hasil))
  cek('proses TIDAK dimatikan (inti perbaikan)', dimatikan.length === 0, JSON.stringify(dimatikan))
  const state = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'auto-update-state.json'), 'utf8'))
  cek('ditandai perlu restart', state.perluRestart === true, JSON.stringify(state.perluRestart))
  const log = fs.readFileSync(path.join(tmp, 'data', 'auto-update-log.jsonl'), 'utf8').trim().split('\n').map((x) => JSON.parse(x))
  const terakhir = log[log.length - 1]
  cek('tercatat di log sebagai tunda', terakhir.kejadian === 'restart' && terakhir.cara === 'tunda', JSON.stringify(terakhir))
}

console.log('== panel menolak izin (403) ==')
{
  const panggil = pasangFetch([403])
  const hasil = await mod.restartBot()
  cek('tidak diulang sia-sia', panggil.length === 1, String(panggil.length))
  cek('tetap tidak mematikan proses', dimatikan.length === 0 && hasil.ok === false, JSON.stringify(hasil))
}

console.log('== izin exit hanya kalau diminta eksplisit ==')
{
  const berkas = path.join(tmp, 'data', 'auto-update.json')
  const cfg = JSON.parse(fs.readFileSync(berkas, 'utf8'))
  cfg.restart.izinkanExit = true
  cfg.restart.jedaMs = [0]
  fs.writeFileSync(berkas, JSON.stringify(cfg))
  pasangFetch([500])
  /* Modul baru supaya cache konfigurasi tidak memakai nilai lama. */
  const mod2 = await import(MODUL + '?izinexit=1')
  const hasil = await mod2.restartBot()
  cek('cara exit kalau izinkanExit=true', hasil.cara === 'exit', JSON.stringify(hasil))
  await new Promise((s) => setTimeout(s, 1700))
  cek('process.exit(0) dipanggil', dimatikan.length === 1 && dimatikan[0] === 0, JSON.stringify(dimatikan))
}

process.exit = asliExit
fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n===== ${lulus} lulus, ${gagal} gagal =====`)
asliExit(gagal ? 1 : 0)
