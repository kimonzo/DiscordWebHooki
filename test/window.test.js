import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCheckTime, localDateKey, windowStart, zonedTimeToUtc, tzOffsetMs } from '../src/window.js';

const cfg = { timezone: 'Europe/Warsaw', checkHour: 7, checkMinute: 5, graceMinutes: 30, windowStartHour: 5 };

test('zima: robote wykonuje cron 06:05 UTC', () => {
  assert.equal(isCheckTime(new Date('2027-01-15T06:05:00Z'), cfg), true);
  assert.equal(isCheckTime(new Date('2027-01-15T05:05:00Z'), cfg), false);
});

test('lato: robote wykonuje cron 05:05 UTC', () => {
  assert.equal(isCheckTime(new Date('2027-07-15T05:05:00Z'), cfg), true);
  assert.equal(isCheckTime(new Date('2027-07-15T06:05:00Z'), cfg), false);
});

test('dokladnie jeden cron dziennie trafia — przez caly rok 2027', () => {
  for (let day = 0; day < 365; day++) {
    const base = Date.UTC(2027, 0, 1 + day);
    const hits = ['05:05', '06:05'].filter((hhmm) => {
      const [h, m] = hhmm.split(':').map(Number);
      return isCheckTime(new Date(base + h * 3600e3 + m * 60e3), cfg);
    });
    assert.equal(hits.length, 1, `dzien ${new Date(base).toISOString().slice(0, 10)} trafil ${hits.length} razy`);
  }
});

test('przejscie na czas letni 2027-03-28', () => {
  assert.equal(isCheckTime(new Date('2027-03-27T06:05:00Z'), cfg), true, 'dzien przed: CET');
  assert.equal(isCheckTime(new Date('2027-03-28T05:05:00Z'), cfg), true, 'dzien zmiany: juz CEST');
  assert.equal(isCheckTime(new Date('2027-03-29T05:05:00Z'), cfg), true, 'dzien po: CEST');
});

test('przejscie na czas zimowy 2027-10-31', () => {
  assert.equal(isCheckTime(new Date('2027-10-30T05:05:00Z'), cfg), true, 'dzien przed: CEST');
  assert.equal(isCheckTime(new Date('2027-10-31T06:05:00Z'), cfg), true, 'dzien zmiany: juz CET');
  assert.equal(isCheckTime(new Date('2027-11-01T06:05:00Z'), cfg), true, 'dzien po: CET');
});

test('przesuniecie strefy: +1h zima, +2h lato', () => {
  assert.equal(tzOffsetMs(new Date('2027-01-15T12:00:00Z'), 'Europe/Warsaw'), 3600e3);
  assert.equal(tzOffsetMs(new Date('2027-07-15T12:00:00Z'), 'Europe/Warsaw'), 7200e3);
});

test('klucz doby liczy sie wedlug czasu polskiego, nie UTC', () => {
  // 22:30 UTC w lipcu to juz 00:30 nastepnego dnia w Polsce
  assert.equal(localDateKey(new Date('2027-07-15T22:30:00Z'), 'Europe/Warsaw'), '2027-07-16');
  assert.equal(localDateKey(new Date('2027-07-15T10:00:00Z'), 'Europe/Warsaw'), '2027-07-15');
});

test('okno startuje o 5:00 czasu polskiego', () => {
  assert.equal(windowStart(new Date('2027-07-15T05:05:00Z'), cfg).toISOString(), '2027-07-15T03:00:00.000Z');
  assert.equal(windowStart(new Date('2027-01-15T06:05:00Z'), cfg).toISOString(), '2027-01-15T04:00:00.000Z');
});

test('czas scienny nieistniejacy (skok wiosenny 2:00->3:00) nie wywala sie', () => {
  const d = zonedTimeToUtc({ year: 2027, month: 3, day: 28, hour: 2, minute: 30 }, 'Europe/Warsaw');
  assert.ok(!Number.isNaN(d.getTime()));
});

// --- odtworzenie awarii z 2026-09-15: GitHub odpalil cron 35 min po czasie ---
const cfg830 = { timezone: 'Europe/Warsaw', checkHour: 8, checkMinute: 30, graceMinutes: 90 };

test('AWARIA 2026-09-15: cron spozniony o 35 min ma dzialac', () => {
  assert.equal(isCheckTime(new Date('2026-09-15T07:05:00Z'), cfg830), true);   // 9:05 w Polsce
});

test('okno tolerancji: od 8:30 do 10:00, nie wczesniej, nie pozniej', () => {
  assert.equal(isCheckTime(new Date('2026-09-15T06:29:00Z'), cfg830), false, '8:29 — za wczesnie');
  assert.equal(isCheckTime(new Date('2026-09-15T06:30:00Z'), cfg830), true,  '8:30 — punkt');
  assert.equal(isCheckTime(new Date('2026-09-15T07:59:00Z'), cfg830), true,  '9:59 — jeszcze w oknie');
  assert.equal(isCheckTime(new Date('2026-09-15T08:00:00Z'), cfg830), false, '10:00 — za pozno');
});

test('lato: drugi cron (9:30) jest dogrywka, zima: pierwszy (7:30) odpada', () => {
  assert.equal(isCheckTime(new Date('2026-09-15T07:30:00Z'), cfg830), true,  'lato, 9:30 — dogrywka');
  assert.equal(isCheckTime(new Date('2027-01-15T06:30:00Z'), cfg830), false, 'zima, 7:30 — przed czasem');
  assert.equal(isCheckTime(new Date('2027-01-15T07:30:00Z'), cfg830), true,  'zima, 8:30 — punkt');
});

// --- opoznienie crona nie moze zmieniac werdyktu (GitHub potrafi spoznic sie 5 h) ---
import { checkTimeToday, windowEnd } from '../src/window.js';

test('checkTimeToday: nominalna godzina sprawdzenia dla dzisiejszej doby', () => {
  const c = { timezone: 'Europe/Warsaw', checkHour: 8, checkMinute: 30 };
  assert.equal(checkTimeToday(new Date('2026-09-16T06:30:00Z'), c).toISOString(), '2026-09-16T06:30:00.000Z');
  assert.equal(checkTimeToday(new Date('2026-09-16T13:58:00Z'), c).toISOString(), '2026-09-16T06:30:00.000Z');
});

// --- 2026-09-18: Tomcio napisal o 9:52, cron ruszyl o 13:36, bot wyslal przypomnienie ---
test('AWARIA 2026-09-18: gorna granica okna to moment uruchomienia, nie 8:30', () => {
  const c = { timezone: 'Europe/Warsaw', checkHour: 8, checkMinute: 30 };
  const run = new Date('2026-09-18T11:36:00Z');            // 13:36 w Polsce
  const greeting = new Date('2026-09-18T07:52:00Z');       // 9:52 — po deadline, przed runem
  assert.ok(greeting <= windowEnd(run, c), 'powitanie napisane przed uruchomieniem ma sie liczyc');
});

test('windowEnd: run punktualny konczy okno na 8:30, spozniony — na sobie', () => {
  const c = { timezone: 'Europe/Warsaw', checkHour: 8, checkMinute: 30 };
  const punktualny = new Date('2026-09-18T06:30:00Z');
  assert.equal(windowEnd(punktualny, c).toISOString(), '2026-09-18T06:30:00.000Z', 'nie siega w przyszlosc');
  const spozniony = new Date('2026-09-18T11:36:00Z');
  assert.equal(windowEnd(spozniony, c).toISOString(), spozniony.toISOString(), 'siega do teraz');
});

test('AWARIA 2026-09-15: cron spozniony o 5,5 h nadal wpada w okno', () => {
  const c = { timezone: 'Europe/Warsaw', checkHour: 8, checkMinute: 30, graceMinutes: 900 };
  assert.equal(isCheckTime(new Date('2026-09-15T11:58:00Z'), c), true, '13:58 w Polsce');
  assert.equal(isCheckTime(new Date('2026-09-15T12:45:00Z'), c), true, '14:45 w Polsce');
  assert.equal(isCheckTime(new Date('2026-09-15T05:30:00Z'), c), false, '7:30 — przed czasem');
  assert.equal(isCheckTime(new Date('2026-09-15T21:45:00Z'), c), false, '23:45 — po oknie, to juz inny dzien');
});
