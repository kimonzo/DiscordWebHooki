// Pilnuje, zeby crony w workflow zgadzaly sie z godzina w config.json.
// Zmiana jednego bez drugiego = bot milczy przez pol roku. Ten test to wylapie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isCheckTime, zonedParts } from '../src/window.js';

const PAIRS = [
  ['config.json', '.github/workflows/dzien-dobry.yml'],
  ['config-obraz.json', '.github/workflows/obraz.yml'],
];

for (const [cfgFile, ymlFile] of PAIRS) {
const config = JSON.parse(readFileSync(new URL(`../${cfgFile}`, import.meta.url), 'utf8'));
const yml = readFileSync(new URL(`../${ymlFile}`, import.meta.url), 'utf8');
const crons = [...yml.matchAll(/cron:\s*'(\d+) (\d+) \* \* \*'/g)].map(([, m, h]) => ({ m: +m, h: +h }));

test(`${ymlFile}: workflow ma co najmniej dwa crony (lato/zima)`, () => {
  assert.ok(crons.length >= 2, `znaleziono: ${JSON.stringify(crons)}`);
});

test(`${ymlFile}: minuty cronow zgadzaja sie z checkMinute`, () => {
  for (const c of crons) assert.equal(c.m, config.checkMinute);
});

const hhmm = `${config.checkHour}:${String(config.checkMinute).padStart(2, '0')}`;

for (const year of [new Date().getUTCFullYear(), new Date().getUTCFullYear() + 1]) {
  test(`${ymlFile} ${year}: kazdego dnia co najmniej jeden cron wpada w okno ${hhmm} +${config.graceMinutes} min, a pierwszy z nich dokladnie o ${hhmm}`, () => {
    for (let day = 0; day < 366; day++) {
      const base = Date.UTC(year, 0, 1 + day);
      if (new Date(base).getUTCFullYear() !== year) break;
      const label = new Date(base).toISOString().slice(0, 10);

      const inWindow = crons
        .map((c) => new Date(base + c.h * 3600e3 + c.m * 60e3))
        .filter((d) => isCheckTime(d, config))
        .sort((a, b) => a - b);

      assert.ok(inWindow.length >= 1, `${label}: zaden cron nie wpada w okno — bot by milczal`);
      const first = zonedParts(inWindow[0], config.timezone);
      assert.equal(`${first.hour}:${String(first.minute).padStart(2, '0')}`, hhmm, `${label}: pierwszy cron w oknie nie jest o ${hhmm}`);
    }
  });
}
}
