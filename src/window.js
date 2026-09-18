// Czysta arytmetyka czasu. Zadnych efektow ubocznych, zadnej sieci.
// Cala obsluga zmiany czasu (CET/CEST) siedzi tutaj i tylko tutaj.

/** Rozklada instant na czesci kalendarzowe w podanej strefie. */
export function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) {
    if (type !== 'literal') p[type] = Number(value);
  }
  // Niektore srodowiska zwracaja godzine 24 zamiast 0 dla polnocy.
  return { ...p, hour: p.hour % 24 };
}

/** Przesuniecie strefy wzgledem UTC w milisekundach, dla danego instantu. */
export function tzOffsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/**
 * Zamienia lokalny czas scienny na instant UTC.
 * Liczy przesuniecie dwa razy, bo pierwsze oszacowanie moze wypasc
 * po niewlasciwej stronie przejscia na czas letni.
 */
export function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let offset = tzOffsetMs(new Date(guess), timeZone);
  offset = tzOffsetMs(new Date(guess - offset), timeZone);
  return new Date(guess - offset);
}

/** Klucz dnia lokalnego, np. "2026-09-14". Sluzy za identyfikator doby. */
export function localDateKey(date, timeZone) {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Czy to ten przebieg crona, ktory ma wykonac robote.
 *
 * Przechodzi, gdy lokalny czas jest w oknie [checkHour:checkMinute, +graceMinutes).
 * Dwa crony UTC celuja w te sama lokalna godzine po obu stronach zmiany czasu.
 * Okno tolerancji jest potrzebne, bo GitHub potrafi odpalic cron z duzym opoznieniem
 * (2026-09-15: 35+ minut) — i zeby latem drugi cron byl dogrywka, gdy pierwszy przepadl.
 * Przed podwojna wysylka chroni bramka idempotencji w main.js.
 */
export function isCheckTime(date, { timezone, checkHour, checkMinute = 0, graceMinutes = 90 }) {
  const { hour, minute } = zonedParts(date, timezone);
  const nowMin = hour * 60 + minute;
  const startMin = checkHour * 60 + checkMinute;
  return nowMin >= startMin && nowMin < startMin + graceMinutes;
}

/**
 * Moment, o ktorym bot NOMINALNIE mial sie odezwac dzisiaj, jako instant UTC.
 * GitHub potrafi odpalic cron kilka godzin pozniej (2026-09-15: 5,5 h) — werdykt
 * ma zalezec od tej godziny, nie od tego, kiedy runner sie wreszcie obudzil.
 */
export function checkTimeToday(now, { timezone, checkHour, checkMinute = 0 }) {
  const { year, month, day } = zonedParts(now, timezone);
  return zonedTimeToUtc({ year, month, day, hour: checkHour, minute: checkMinute }, timezone);
}

/**
 * Gorna granica okna obserwacji: pozniejsza z dwoch — nominalna godzina sprawdzenia
 * albo moment uruchomienia. Cron GitHuba potrafi spoznic sie o kilka godzin
 * (2026-09-18: 5 h 6 min); wszystko, co pilnowana osoba napisala do chwili
 * uruchomienia, ma sie liczyc — inaczej bot wysyla przypomnienie komus,
 * kto przywital sie cztery godziny wczesniej.
 */
export function windowEnd(now, config) {
  const nominal = checkTimeToday(now, config);
  return now > nominal ? now : nominal;
}

/** Poczatek dzisiejszego okna obserwacji jako instant UTC. */
export function windowStart(now, { timezone, windowStartHour }) {
  const { year, month, day } = zonedParts(now, timezone);
  return zonedTimeToUtc({ year, month, day, hour: windowStartHour, minute: 0 }, timezone);
}
