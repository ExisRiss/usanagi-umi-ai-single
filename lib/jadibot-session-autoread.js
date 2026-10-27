/* By AlzRiss - Usanagi Umi AI
 *
 * AUTOREAD PER SESI JADIBOT (Task132)
 *
 * Sebelumnya autoread hanya bisa diubah untuk SEMUA sesi sekaligus lewat
 * `/api/owner-console/autoread`. Padahal nilainya memang disimpan per JID bot:
 *
 *   global.db.data.settings['628xxx@s.whatsapp.net'].autoread
 *
 * dan dibaca langsung setiap ada pesan masuk (`handler.js`). Artinya setelan ini
 * bisa diatur per sesi tanpa restart, cukup ditulis ke database.
 *
 * Modul ini sengaja dipisah dari `jadibot-platform-api.js` supaya bisa diuji
 * tanpa memuat seluruh server platform (baileys, sqlite, dsb).
 */

/** Rapikan nomor jadi digit saja (62…). */
export function normalNomor(nilai) {
  return String(nilai === undefined || nilai === null ? '' : nilai).replace(/[^0-9]/g, '').slice(0, 20)
}

/** JID sesi untuk nomor bot tertentu. */
export function jidSesi(nomor) {
  const bersih = normalNomor(nomor)
  return bersih ? `${bersih}@s.whatsapp.net` : ''
}

function pengaturan() {
  return (global.db && global.db.data && global.db.data.settings) || null
}

/** Status autoread sesi ini. Default mati (sama dengan database.js). */
export function bacaAutoread(nomor) {
  const settings = pengaturan()
  const jid = jidSesi(nomor)
  if (!settings || !jid) return false
  return Boolean(settings[jid] && settings[jid].autoread === true)
}

/** Ubah autoread sesi ini. Nilai langsung dipakai pada pesan berikutnya. */
export function tulisAutoread(nomor, aktif) {
  const settings = pengaturan()
  if (!settings) {
    throw Object.assign(new Error('Database bot belum siap. Coba lagi sebentar.'), { status: 503 })
  }
  const jid = jidSesi(nomor)
  if (!jid) throw Object.assign(new Error('Nomor sesi tidak valid.'), { status: 400 })

  const setting = settings[jid] || (settings[jid] = {})
  setting.autoread = Boolean(aktif)

  /* Tulis ke disk di latar belakang: request web tidak perlu menunggu, dan
   * kegagalan tulis tidak boleh membuat setelan di memori ikut batal. */
  try {
    if (global.db && typeof global.db.write === 'function') {
      Promise.resolve(global.db.write()).catch(() => {})
    }
  } catch (error) {
    console.error('[AUTOREAD] gagal menyimpan setelan:', error && error.message)
  }
  return Boolean(aktif)
}

export default { normalNomor, jidSesi, bacaAutoread, tulisAutoread }
