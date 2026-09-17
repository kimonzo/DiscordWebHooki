// Budowanie tresci wiadomosci. Losowanie wstrzykiwane, zeby dalo sie testowac.

/** Losuje element listy. rng() ma zwracac [0,1). */
export function pick(list, rng = Math.random) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('pick: lista jest pusta — sprawdz config.json');
  }
  return list[Math.floor(rng() * list.length)];
}

/** Podstawia {user} i {streak} w szablonie. */
export function render(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** Stopka embeda — opisuje serie slowami, nie samym licznikiem. */
export function streakFooter(streak, greeted) {
  if (!greeted) return 'Seria wyzerowana — jutro nowe otwarcie';
  if (streak === 1) return 'Seria: 1 dzień — początek czegoś pięknego';
  return `Seria: ${streak} dni z rzędu 🔥`;
}

/** Gotowy payload webhooka. Tekst w content (widzi kazdy), embed to ozdoba: gif, kolor, stopka. */
export function buildPayload({ greeted, rescued = false, streak, config, gifUrl = null, rng = Math.random }) {
  const mention = `<@${config.watchedUserId}>`;
  const pool = rescued ? config.rescues : greeted ? config.replies : config.reminders;
  const text = render(pick(pool, rng), { user: mention, streak });

  const embed = {
    color: rescued ? config.colorRescued : greeted ? config.colorGreeted : config.colorMissed,
    footer: { text: streakFooter(streak, greeted || rescued) },
  };
  if (gifUrl) embed.image = { url: gifUrl };

  return {
    content: text,
    allowed_mentions: { users: [config.watchedUserId] },
    embeds: [embed],
  };
}
