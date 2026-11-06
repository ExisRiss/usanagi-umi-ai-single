/* By AlzRiss - Usanagi Umi AI */

import { getDb } from './awang-sqlite.js'

const MODE_NORMAL = 'normal'
const MODE_ONLY_GC = 'onlygc'
const MODE_ONLY_PC = 'onlypc'
/* Task205 — `.onlypc off`: chat pribadi dibatasi (warning→tindakan) DAN
 * group tidak dilayani. Semua non-owner dibatasi. */
const MODE_OFF = 'off'

const VALID_MODES = [MODE_NORMAL, MODE_ONLY_GC, MODE_ONLY_PC, MODE_OFF]

function ensureSchema() {
  const db = getDb()

  /* Cek apakah tabel lama punya CHECK yang belum mengenal 'off' (Task205).
   * SQLite tidak bisa ALTER CHECK → bangun ulang tabel aman-rollback. */
  const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='bot_access_mode'").get()
  if (info && info.sql && !info.sql.includes("'off'")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bot_access_mode_new (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        mode TEXT NOT NULL CHECK (mode IN ('normal', 'onlygc', 'onlypc', 'off'))
      );
      INSERT INTO bot_access_mode_new (id, mode)
        SELECT id, CASE WHEN mode IN ('normal','onlygc','onlypc') THEN mode ELSE 'normal' END
        FROM bot_access_mode;
      DROP TABLE bot_access_mode;
      ALTER TABLE bot_access_mode_new RENAME TO bot_access_mode;
    `)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_access_mode (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mode TEXT NOT NULL CHECK (mode IN ('normal', 'onlygc', 'onlypc', 'off'))
    );
  `)
  db.prepare('INSERT OR IGNORE INTO bot_access_mode (id, mode) VALUES (1, ?)').run(MODE_NORMAL)
  return db
}

export function getAccessModeState() {
  const db = ensureSchema()
  const row = db.prepare('SELECT mode FROM bot_access_mode WHERE id = 1').get()
  const mode = VALID_MODES.includes(row?.mode) ? row.mode : MODE_NORMAL

  return {
    mode,
    onlygc: mode === MODE_ONLY_GC,
    onlypc: mode === MODE_ONLY_PC,
    off: mode === MODE_OFF,
  }
}

export function setAccessMode(mode) {
  if (!VALID_MODES.includes(mode)) {
    throw new Error('Mode akses tidak valid')
  }

  const db = ensureSchema()
  const update = db.prepare('UPDATE bot_access_mode SET mode = ? WHERE id = 1')
  const transaction = db.transaction((nextMode) => {
    update.run(nextMode)
  })

  transaction(mode)
  return getAccessModeState()
}

export function isAccessAllowed(isGroup, state = getAccessModeState()) {
  if (state.mode === MODE_ONLY_GC) return Boolean(isGroup)
  if (state.mode === MODE_ONLY_PC) return !isGroup
  if (state.mode === MODE_OFF) return false
  return true
}

export const ACCESS_MODES = Object.freeze({
  NORMAL: MODE_NORMAL,
  ONLY_GC: MODE_ONLY_GC,
  ONLY_PC: MODE_ONLY_PC,
  OFF: MODE_OFF,
})

export default {
  getAccessModeState,
  setAccessMode,
  isAccessAllowed,
  ACCESS_MODES,
}
