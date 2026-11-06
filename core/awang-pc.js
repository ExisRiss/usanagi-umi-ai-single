/* By AlzRiss - Usanagi Umi AI */

import { getAccessModeState, setAccessMode, ACCESS_MODES } from './awang-mode.js'

export function isOnlyPcActive() {
  return getAccessModeState().mode === ACCESS_MODES.ONLY_PC
}

export function setOnlyPcActive(enabled) {
  const state = getAccessModeState()
  /* Task205: `.onlypc off` bukan kembali normal — semua permukaan dibatasi
   * (mode 'off'): PC warning→tindakan, group tidak dilayani. */
  const mode = enabled ? ACCESS_MODES.ONLY_PC : ACCESS_MODES.OFF
  if (state.mode === mode) return state
  return setAccessMode(mode)
}

export default {
  isOnlyPcActive,
  setOnlyPcActive,
}
