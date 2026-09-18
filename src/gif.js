// Losowy GIF z Tenora albo Giphy — ktorykolwiek klucz jest ustawiony.
// Kazdy blad konczy sie brakiem gifa, nigdy wywaleniem wiadomosci.

const TENOR = 'https://tenor.googleapis.com/v2/search';
const GIPHY = 'https://api.giphy.com/v1/gifs/search';

async function fromTenor(key, query, rng, fetchImpl) {
  const url = new URL(TENOR);
  url.search = new URLSearchParams({ key, q: query, limit: '30', media_filter: 'gif', random: 'true', locale: 'pl_PL', contentfilter: 'medium' });
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Tenor ${res.status}`);
  const { results = [] } = await res.json();
  const urls = results.map((r) => r.media_formats?.gif?.url).filter(Boolean);
  return urls.length ? urls[Math.floor(rng() * urls.length)] : null;
}

async function fromGiphy(key, query, rng, fetchImpl) {
  const url = new URL(GIPHY);
  url.search = new URLSearchParams({ api_key: key, q: query, limit: '30', rating: 'pg-13', lang: 'pl' });
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Giphy ${res.status}`);
  const { data = [] } = await res.json();
  const urls = data.map((g) => g.images?.original?.url).filter(Boolean);
  return urls.length ? urls[Math.floor(rng() * urls.length)] : null;
}

/** Tasuje kopie listy (Fisher-Yates), zeby kolejnosc prob byla losowa, ale pelna. */
function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Zwraca URL gifa albo null. Dla kazdego hasla (w losowej kolejnosci) probuje
 * Tenora, potem Giphy; dopiero gdy zadne haslo nic nie da — lista z configu, potem null.
 * Jedno haslo bez wynikow nie moze przekreslic calej wysylki: 2026-09-18 Giphy nie mial
 * nic na "zaspalem" i wiadomosc poszla bez gifa, choc inne hasla dzialaly.
 */
export async function pickGif({ queries = [], fallback = [], env = {}, rng = Math.random, fetchImpl = fetch, log = () => {} }) {
  const providers = [
    env.TENOR_API_KEY && ['Tenor', (q) => fromTenor(env.TENOR_API_KEY, q, rng, fetchImpl)],
    env.GIPHY_API_KEY && ['Giphy', (q) => fromGiphy(env.GIPHY_API_KEY, q, rng, fetchImpl)],
  ].filter(Boolean);

  for (const query of shuffled(queries, rng)) {
    for (const [name, get] of providers) {
      try {
        const url = await get(query);
        if (url) { log(`[gif] ${name}: "${query}" -> ${url}`); return url; }
        log(`[gif] ${name}: brak wynikow dla "${query}", probuje dalej`);
      } catch (err) {
        log(`[gif] ${name} nie odpowiada na "${query}" (${err.message}), probuje dalej`);
      }
    }
  }

  if (fallback.length) {
    const url = fallback[Math.floor(rng() * fallback.length)];
    log(`[gif] z listy w config.json -> ${url}`);
    return url;
  }
  log(providers.length === 0
    ? '[gif] brak klucza API (TENOR_API_KEY / GIPHY_API_KEY) i pusta lista — wiadomosc bez gifa'
    : `[gif] zadne haslo (${queries.length}) nic nie zwrocilo — wiadomosc bez gifa`);
  return null;
}
