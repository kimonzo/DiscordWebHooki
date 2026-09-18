import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickGif } from '../src/gif.js';

const ok = (body) => async () => ({ ok: true, json: async () => body });
const tenorBody = { results: [{ media_formats: { gif: { url: 'https://tenor/a.gif' } } }, { media_formats: { gif: { url: 'https://tenor/b.gif' } } }] };
const giphyBody = { data: [{ images: { original: { url: 'https://giphy/a.gif' } } }] };

test('bez klucza i bez listy: null, bez bledu', async () => {
  assert.equal(await pickGif({ queries: ['x'], fetchImpl: async () => { throw new Error('nie powinno pytac'); } }), null);
});

test('Tenor: losuje z wynikow', async () => {
  const got = new Set();
  for (let i = 0; i < 30; i++) got.add(await pickGif({ queries: ['x'], env: { TENOR_API_KEY: 'k' }, fetchImpl: ok(tenorBody) }));
  assert.deepEqual([...got].sort(), ['https://tenor/a.gif', 'https://tenor/b.gif'], 'siega po oba wyniki');
});

test('hasla sa tasowane — nie zawsze to samo idzie pierwsze', async () => {
  const first = new Set();
  for (let i = 0; i < 40; i++) {
    await pickGif({ queries: ['a', 'b', 'c'], env: { GIPHY_API_KEY: 'k' },
      fetchImpl: async (u) => { first.add(new URL(u).searchParams.get('q')); return { ok: true, json: async () => giphyBody }; } });
  }
  assert.ok(first.size >= 2, `zawsze to samo haslo: ${[...first]}`);
});

test('Tenor przekazuje klucz i zapytanie', async () => {
  let seen;
  await pickGif({ queries: ['dzień dobry'], env: { TENOR_API_KEY: 'sekret' }, fetchImpl: async (u) => { seen = new URL(u); return { ok: true, json: async () => tenorBody }; } });
  assert.equal(seen.hostname, 'tenor.googleapis.com');
  assert.equal(seen.searchParams.get('key'), 'sekret');
  assert.equal(seen.searchParams.get('q'), 'dzień dobry');
});

test('Giphy dziala, gdy tylko jego klucz jest ustawiony', async () => {
  assert.equal(await pickGif({ queries: ['x'], env: { GIPHY_API_KEY: 'k' }, fetchImpl: ok(giphyBody) }), 'https://giphy/a.gif');
});

test('Tenor pada -> Giphy przejmuje', async () => {
  let n = 0;
  const fetchImpl = async () => (++n === 1 ? { ok: false, status: 500 } : { ok: true, json: async () => giphyBody });
  const url = await pickGif({ queries: ['x'], env: { TENOR_API_KEY: 'a', GIPHY_API_KEY: 'b' }, fetchImpl });
  assert.equal(url, 'https://giphy/a.gif');
  assert.equal(n, 2);
});

test('wszystko pada -> lista z configu', async () => {
  const url = await pickGif({ queries: ['x'], fallback: ['https://cfg/1.gif'], env: { TENOR_API_KEY: 'a' }, fetchImpl: async () => { throw new Error('ENOTFOUND'); } });
  assert.equal(url, 'https://cfg/1.gif');
});

test('siec rzuca wyjatkiem -> null, wiadomosc i tak pojdzie', async () => {
  const url = await pickGif({ queries: ['x'], env: { TENOR_API_KEY: 'a' }, fetchImpl: async () => { throw new Error('ENOTFOUND'); } });
  assert.equal(url, null);
});

test('brak wynikow u dostawcy -> nastepny dostawca', async () => {
  let n = 0;
  const fetchImpl = async () => (++n === 1 ? { ok: true, json: async () => ({ results: [] }) } : { ok: true, json: async () => giphyBody });
  assert.equal(await pickGif({ queries: ['x'], env: { TENOR_API_KEY: 'a', GIPHY_API_KEY: 'b' }, fetchImpl }), 'https://giphy/a.gif');
});

// --- 2026-09-18: Giphy nie mial nic na "zaspałem" i bot odpuscil gifa po jednej probie ---

test('AWARIA: puste wyniki dla jednego hasla -> probuje kolejne', async () => {
  const asked = [];
  const fetchImpl = async (u) => {
    const q = new URL(u).searchParams.get('q');
    asked.push(q);
    return { ok: true, json: async () => (q === 'zaspalem' ? { data: [] } : giphyBody) };
  };
  const url = await pickGif({ queries: ['zaspalem', 'wake up'], env: { GIPHY_API_KEY: 'k' }, fetchImpl });
  assert.equal(url, 'https://giphy/a.gif', 'puste haslo nie moze przekreslic gifa');
  assert.ok(asked.includes('wake up'), `pytal tylko o: ${asked.join(', ')}`);
});

test('probuje kazde haslo raz, nie wiecej', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return { ok: true, json: async () => ({ data: [] }) }; };
  assert.equal(await pickGif({ queries: ['a', 'b', 'c'], env: { GIPHY_API_KEY: 'k' }, fetchImpl }), null);
  assert.equal(n, 3);
});

test('komunikat nie oskarza braku klucza, gdy klucz jest', async () => {
  const logs = [];
  await pickGif({ queries: ['a'], env: { GIPHY_API_KEY: 'k' }, fetchImpl: async () => ({ ok: true, json: async () => ({ data: [] }) }), log: (m) => logs.push(m) });
  const last = logs.at(-1);
  assert.doesNotMatch(last, /brak klucza/, `mylacy komunikat: ${last}`);
  assert.match(last, /zadne haslo|bez gifa/);
});

test('bez zadnego klucza mowi wprost o kluczu', async () => {
  const logs = [];
  await pickGif({ queries: ['a'], env: {}, log: (m) => logs.push(m), fetchImpl: async () => { throw new Error('nie pytaj'); } });
  assert.match(logs.at(-1), /brak klucza/);
});
