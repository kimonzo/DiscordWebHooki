import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pick, render, streakFooter, buildPayload } from '../src/messages.js';

const cfg = {
  watchedUserId: '111111111111111111',
  colorGreeted: 16756802,
  colorMissed: 7419299,
  colorRescued: 3066993,
  replies: ['Dzień dobry {user}!'],
  reminders: ['{user}, gdzie powitanie?'],
  rescues: ['Dzień uratowany {user}! Seria wraca do {streak}.'],
};

test('pusta pula mowi ktory config poprawic', () => {
  assert.throws(() => pick([]), /sprawdz config\.json/);
});

test('pick siega po skrajne elementy', () => {
  const l = ['a', 'b', 'c'];
  assert.equal(pick(l, () => 0), 'a');
  assert.equal(pick(l, () => 0.999), 'c');
});

test('render podstawia zmienne, nieznane zostawia', () => {
  assert.equal(render('{user} ma {streak} dni', { user: '@t', streak: 3 }), '@t ma 3 dni');
  assert.equal(render('{brak}', {}), '{brak}');
});

test('stopka odmienia sie poprawnie', () => {
  assert.match(streakFooter(1, true), /1 dzień/);
  assert.match(streakFooter(12, true), /12 dni/);
  assert.match(streakFooter(0, false), /wyzerowana/);
});

test('payload powitania: tekst w content, bursztyn, oznaczenie', () => {
  const p = buildPayload({ greeted: true, streak: 5, config: cfg, rng: () => 0 });
  assert.equal(p.username, undefined, 'nazwe bota ustawia webhook, nie kod');
  assert.equal(p.content, 'Dzień dobry <@111111111111111111>!', 'tekst musi byc w content — widoczny nawet z wylaczonymi embedami');
  assert.equal(p.embeds[0].color, cfg.colorGreeted);
  assert.equal(p.embeds[0].description, undefined, 'embed nie dubluje tekstu');
});

test('payload przypomnienia: inny kolor, inna pula', () => {
  const p = buildPayload({ greeted: false, streak: 0, config: cfg, rng: () => 0 });
  assert.equal(p.embeds[0].color, cfg.colorMissed);
  assert.match(p.content, /gdzie powitanie/);
});

test('payload rescue: pula rescues, wlasny kolor, seria w stopce', () => {
  const p = buildPayload({ rescued: true, streak: 8, config: cfg, rng: () => 0 });
  assert.equal(p.content, 'Dzień uratowany <@111111111111111111>! Seria wraca do 8.');
  assert.equal(p.embeds[0].color, cfg.colorRescued);
  assert.match(p.embeds[0].footer.text, /8 dni/);
});

test('gif laduje w embedzie jako obrazek; bez gifa embed nie ma image', () => {
  const withGif = buildPayload({ greeted: true, streak: 1, config: cfg, gifUrl: 'https://x/y.gif', rng: () => 0 });
  assert.deepEqual(withGif.embeds[0].image, { url: 'https://x/y.gif' });
  const noGif = buildPayload({ greeted: true, streak: 1, config: cfg, rng: () => 0 });
  assert.equal('image' in noGif.embeds[0], false);
});

test('oznaczana jest wylacznie pilnowana osoba — zadnego @everyone', () => {
  const p = buildPayload({ greeted: true, streak: 1, config: cfg, rng: () => 0 });
  assert.deepEqual(p.allowed_mentions, { users: ['111111111111111111'] });
});
