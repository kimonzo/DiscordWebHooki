import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load, save, advance, alreadyRanToday, canRescue, rescue } from '../src/streak.js';

const tmp = async () => join(await mkdtemp(join(tmpdir(), 'budzik-')), 'state.json');

test('brak pliku to czysty start, nie blad', async () => {
  assert.deepEqual(await load(await tmp()), { streak: 0, lastRunDate: null, lastResult: null, bestStreak: 0 });
});

test('uszkodzony state.json mowi wprost co jest nie tak', async () => {
  const p = await tmp();
  await writeFile(p, '{to nie jest json');
  await assert.rejects(load(p), /state\.json jest uszkodzony/);
});

test('zapis i odczyt w obie strony', async () => {
  const p = await tmp();
  const s = advance({ streak: 4, bestStreak: 9 }, '2027-07-15', true);
  await save(p, s);
  assert.deepEqual(await load(p), s);
});

test('trafienie podbija serie, pudlo zeruje', () => {
  assert.equal(advance({ streak: 11, bestStreak: 11 }, '2027-07-15', true).streak, 12);
  assert.equal(advance({ streak: 11, bestStreak: 11 }, '2027-07-15', false).streak, 0);
});

test('rekord serii przezywa wyzerowanie', () => {
  const zeroed = advance({ streak: 30, bestStreak: 30 }, '2027-07-15', false);
  assert.equal(zeroed.streak, 0);
  assert.equal(zeroed.bestStreak, 30);
});

test('pierwszy dzien dziala z pustego stanu', () => {
  const s = advance({ streak: 0, bestStreak: 0 }, '2027-07-15', true);
  assert.deepEqual(s, { streak: 1, bestStreak: 1, lastRunDate: '2027-07-15', lastResult: 'greeted' });
});

test('bramka idempotencji lapie ten sam dzien', () => {
  assert.equal(alreadyRanToday({ lastRunDate: '2027-07-15' }, '2027-07-15'), true);
  assert.equal(alreadyRanToday({ lastRunDate: '2027-07-14' }, '2027-07-15'), false);
  assert.equal(alreadyRanToday({ lastRunDate: null }, '2027-07-15'), false);
});

test('pudlo zapamietuje serie sprzed wyzerowania', () => {
  assert.equal(advance({ streak: 7, bestStreak: 9 }, '2027-07-15', false).preMissStreak, 7);
});

test('rescue mozliwy tylko dla dzisiejszego pudla', () => {
  assert.equal(canRescue({ lastRunDate: '2027-07-15', lastResult: 'missed' }, '2027-07-15'), true);
  assert.equal(canRescue({ lastRunDate: '2027-07-15', lastResult: 'greeted' }, '2027-07-15'), false);
  assert.equal(canRescue({ lastRunDate: '2027-07-15', lastResult: 'rescued' }, '2027-07-15'), false);
  assert.equal(canRescue({ lastRunDate: '2027-07-14', lastResult: 'missed' }, '2027-07-15'), false);
});

test('rescue przywraca serie, jakby powitanie przyszlo o czasie', () => {
  const missed = advance({ streak: 7, bestStreak: 9 }, '2027-07-15', false);
  const saved = rescue(missed, '2027-07-15');
  assert.equal(saved.streak, 8);
  assert.equal(saved.bestStreak, 9);
  assert.equal(saved.lastResult, 'rescued');
  assert.equal(saved.lastRunDate, '2027-07-15');
});

test('rescue podbija rekord, gdy odratowana seria jest najdluzsza', () => {
  const saved = rescue({ preMissStreak: 12, bestStreak: 12, lastRunDate: '2027-07-15', lastResult: 'missed' }, '2027-07-15');
  assert.equal(saved.streak, 13);
  assert.equal(saved.bestStreak, 13);
});

test('rescue bez zapamietanej serii startuje od 1', () => {
  assert.equal(rescue({ lastRunDate: '2027-07-15', lastResult: 'missed' }, '2027-07-15').streak, 1);
});

test('drugi rescue tego samego dnia jest zablokowany', () => {
  const saved = rescue(advance({ streak: 3, bestStreak: 3 }, '2027-07-15', false), '2027-07-15');
  assert.equal(canRescue(saved, '2027-07-15'), false);
});
