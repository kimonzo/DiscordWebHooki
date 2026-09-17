// Stan miedzy uruchomieniami. Trzymany w repo jako state.json.
import { readFile, writeFile } from 'node:fs/promises';

const EMPTY = { streak: 0, lastRunDate: null, lastResult: null, bestStreak: 0 };

export async function load(path) {
  try {
    return { ...EMPTY, ...JSON.parse(await readFile(path, 'utf8')) };
  } catch (err) {
    if (err.code === 'ENOENT') return { ...EMPTY };   // pierwszy przebieg
    throw new Error(`state.json jest uszkodzony: ${err.message}`);
  }
}

export async function save(path, state) {
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/** Nowy stan po dzisiejszym sprawdzeniu. Czysta funkcja. */
export function advance(state, todayKey, greeted) {
  if (greeted) {
    const streak = state.streak + 1;
    return {
      streak,
      bestStreak: Math.max(state.bestStreak ?? 0, streak),
      lastRunDate: todayKey,
      lastResult: 'greeted',
    };
  }
  return {
    streak: 0,
    bestStreak: Math.max(state.bestStreak ?? 0, 0),
    lastRunDate: todayKey,
    lastResult: 'missed',
    preMissStreak: state.streak ?? 0,
  };
}

/** Czy dzisiaj juz sprawdzalismy. Chroni przed zdublowanym cronem. */
export function alreadyRanToday(state, todayKey) {
  return state.lastRunDate === todayKey;
}

export function canRescue(state, todayKey) {
  return state.lastRunDate === todayKey && state.lastResult === 'missed';
}

export function rescue(state, todayKey) {
  const streak = (state.preMissStreak ?? 0) + 1;
  return {
    streak,
    bestStreak: Math.max(state.bestStreak ?? 0, streak),
    lastRunDate: todayKey,
    lastResult: 'rescued',
  };
}
