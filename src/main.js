// Orkiestracja. Jedyne miejsce w projekcie z efektami ubocznymi.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { isCheckTime, localDateKey, windowStart, checkTimeToday } from './window.js';
import { findGreeting } from './greeting.js';
import { buildPayload } from './messages.js';
import { pickGif } from './gif.js';
import { fetchMessagesSince, sendWebhook } from './discord.js';
import { load, save, advance, alreadyRanToday, canRescue, rescue } from './streak.js';
import { requireEnv } from './env.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = join(ROOT, 'state.json');

export async function run({ argv = [], env = process.env, now = new Date() } = {}) {
  const dryRun = argv.includes('--dry-run');
  const force = argv.includes('--now');

  const config = JSON.parse(await readFile(join(ROOT, 'config.json'), 'utf8'));
  const id = requireEnv(env, ['DISCORD_CHANNEL_ID', 'DISCORD_WATCHED_USER_ID', 'WATCHED_USER_NAME']);
  config.channelId = id.DISCORD_CHANNEL_ID;
  config.watchedUserId = id.DISCORD_WATCHED_USER_ID;
  config.watchedUserName = id.WATCHED_USER_NAME;
  const today = localDateKey(now, config.timezone);

  // Bramka 1: czy to ten przebieg crona. Drugi (ten po zlej stronie zmiany czasu) konczy tutaj.
  if (!force && !isCheckTime(now, config)) {
    const hhmm = `${config.checkHour}:${String(config.checkMinute).padStart(2, '0')}`;
    console.log(`[pomijam] Poza oknem ${hhmm} +${config.graceMinutes} min w ${config.timezone} — to drugi cron od zmiany czasu.`);
    return { skipped: 'wrong-hour' };
  }

  const state = await load(STATE_PATH);

  const rescueMode = !force && canRescue(state, today);

  // Bramka 2: idempotencja. Zdublowany cron nie wysle drugiej wiadomosci.
  if (!force && alreadyRanToday(state, today) && !rescueMode) {
    console.log(`[pomijam] ${today} juz sprawdzony (wynik: ${state.lastResult}).`);
    return { skipped: 'already-ran' };
  }

  const { DISCORD_BOT_TOKEN: token } = requireEnv(env, ['DISCORD_BOT_TOKEN']);
  const webhookUrl = dryRun ? null : requireEnv(env, ['DISCORD_WEBHOOK_URL']).DISCORD_WEBHOOK_URL;

  // Gorna granica to nominalne 8:30, nawet gdy GitHub odpalil run o 14:00 —
  // inaczej spozniony cron zaliczalby jako "poranne" powitanie napisane w poludnie.
  const until = checkTimeToday(now, config);

  if (rescueMode) {
    const fromWatchedLate = (await fetchMessagesSince({
      token,
      channelId: config.channelId,
      since: until,
      maxPages: config.maxPages,
    })).filter(
      (m) => m.author?.id === config.watchedUserId
        && new Date(m.timestamp) > until
        && localDateKey(new Date(m.timestamp), config.timezone) === today,
    );

    const hit = findGreeting(fromWatchedLate, config.greetings);
    const nominal = `${config.checkHour}:${String(config.checkMinute).padStart(2, '0')}`;
    console.log(`[rescue] ${fromWatchedLate.length} wiadomosci od ${config.watchedUserName} po ${nominal}${hit ? `, spoznione powitanie o ${hit.timestamp}` : ', wciaz brak powitania'}`);
    if (!hit) return { rescued: false };

    const nextState = rescue(state, today);
    const gifUrl = await pickGif({
      queries: config.gifQueriesRescued,
      fallback: config.gifFallbackRescued,
      env, log: console.log,
    });
    const payload = buildPayload({ rescued: true, streak: nextState.streak, config, gifUrl });

    if (dryRun) {
      console.log('[dry-run] nic nie wysylam. Payload:');
      console.log(JSON.stringify(payload, null, 2));
      return { rescued: true, streak: nextState.streak, dryRun: true };
    }

    await sendWebhook({ url: webhookUrl, payload });
    console.log(`[wyslano] dzien uratowany, seria: ${nextState.streak}`);
    await save(STATE_PATH, nextState);
    return { rescued: true, streak: nextState.streak };
  }

  const since = windowStart(now, config);
  const late = Math.round((now - until) / 60000);
  console.log(`[okno] od ${since.toISOString()} do ${until.toISOString()}${late > 5 ? ` (run spozniony o ${late} min)` : ''}`);

  const messages = await fetchMessagesSince({
    token,
    channelId: config.channelId,
    since,
    maxPages: config.maxPages,
  });

  const fromWatched = messages.filter(
    (m) => m.author?.id === config.watchedUserId && new Date(m.timestamp) <= until,
  );
  const blank = messages.filter((m) => !m.content).length;
  console.log(`[kanal] ${messages.length} wiadomosci w oknie, ${fromWatched.length} od ${config.watchedUserName}, ${blank} z pusta trescia`);
  if (messages.length > 0 && blank === messages.length) {
    console.warn('[UWAGA] Wszystkie wiadomosci maja pusta tresc. Wyglada na wylaczony Message Content Intent — Developer Portal -> Bot -> Privileged Gateway Intents.');
  }
  // Celowo NIE wypisujemy tresci wiadomosci: logi Actions publicznego repo sa jawne.

  const hit = findGreeting(fromWatched, config.greetings);
  const greeted = Boolean(hit);
  if (hit) console.log(`[trafienie] powitanie o ${hit.timestamp}`);

  const nextState = advance(state, today, greeted);
  const gifUrl = await pickGif({
    queries: greeted ? config.gifQueriesGreeted : config.gifQueriesMissed,
    fallback: greeted ? config.gifFallbackGreeted : config.gifFallbackMissed,
    env, log: console.log,
  });
  const payload = buildPayload({ greeted, streak: nextState.streak, config, gifUrl });

  if (dryRun) {
    console.log('[dry-run] nic nie wysylam. Payload:');
    console.log(JSON.stringify(payload, null, 2));
    return { greeted, streak: nextState.streak, dryRun: true };
  }

  // Kolejnosc ma znaczenie: najpierw wysylka, potem zapis stanu.
  // Gdyby zapis padl, zgubimy licznik — ale nie wyslemy wiadomosci dwa razy.
  await sendWebhook({ url: webhookUrl, payload });
  console.log(`[wyslano] ${greeted ? 'powitanie' : 'przypomnienie'}, seria: ${nextState.streak}`);

  await save(STATE_PATH, nextState);
  return { greeted, streak: nextState.streak };
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  run({ argv: process.argv.slice(2) }).catch((err) => {
    console.error(`\n[blad] ${err.message}\n`);
    process.exit(1);
  });
}
