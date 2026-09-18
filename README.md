# Boty na GitHub Actions

Dwa Discordowe boty na darmowym cronie GitHub Actions, jedno repo, zero hostingu.

---

# 1. Budzik

Discordowy bot, który codziennie o **8:30 czasu polskiego** sprawdza, czy wyznaczona
osoba przywitała się na kanale. Kto, gdzie — to siedzi w sekretach, nie w repo.

- Napisała „dzień dobry" (albo „siema", „elo", „dzd"…) między 5:00 a 8:30 → bot odpisuje
  z oznaczeniem i dolicza dzień do serii.
- Nie napisała → **jedno** przypomnienie z oznaczeniem i cisza do jutra.

Chodzi na darmowym cronie GitHub Actions. Zero hostingu, zero zależności npm,
~60 minut Actions miesięcznie z 2000 darmowych.

## Jak to działa

```
06:30 UTC ─┐                ┌─ nie 7:00 w Polsce? → koniec
07:30 UTC ─┴─ GitHub cron ─►┤
                            └─ 8:30 w Polsce ─► czy dziś już sprawdzane? → koniec
                                                └─ nie ─► pobierz wiadomości 5:00–8:30
                                                          └─► powitanie od pilnowanej osoby?
                                                               ├─ tak → seria+1, losowe „dzień dobry"
                                                               └─ nie → seria=0, losowe przypomnienie
                                                                        └─► webhook → commit state.json
```

Dwa crony, bo Polska zmienia czas, a cron GitHuba liczy w UTC. Skrypt sam sprawdza,
która jest godzina w `Europe/Warsaw`: robotę wykonuje przebieg, który wpada w okno
**8:30 → 10:00** (`graceMinutes`). Latem drugi cron (9:30) jest automatyczną dogrywką,
gdyby GitHub zgubił pierwszy; bramka „już dziś sprawdzone" pilnuje, żeby wysłać tylko raz.

Bot **nie ma prawa pisać** — czyta tokenem bota, a wiadomości wysyła osobnym webhookiem.
Gdyby token wyciekł, najgorsze co ktoś zrobi, to przeczyta kanał.

## Konfiguracja

Wszystko jawne siedzi w [`config.json`](config.json):

| Pole | Co znaczy |
|---|---|
| `checkHour` / `checkMinute` | Godzina sprawdzenia (czas polski) |
| `graceMinutes` | Ile minut po `checkHour:checkMinute` cron może się spóźnić i dalej zadziałać. 900 = do 23:30, bo GitHub potrafi spóźnić się o ponad 5 h |
| `windowStartHour` | Od której liczą się powitania |
| `greetings` | Co uznajemy za powitanie — bez ogonków, dopasowanie ignoruje wielkość liter |
| `replies` / `reminders` | Pule tekstów; `{user}` to oznaczenie, `{streak}` to seria |
| `gifQueriesGreeted` / `gifQueriesMissed` | Hasła do wyszukiwania gifa (losowane) |
| `gifFallbackGreeted` / `gifFallbackMissed` | Linki do gifów, gdy nie ma klucza API albo API padło |

Sekrety w **Settings → Secrets and variables → Actions** (repo jest publiczne, więc
tożsamość — ID kanałów, ID i nicki ludzi — też jest sekretem; GitHub maskuje je w logach):

| Nazwa | Co to |
|---|---|
| `DISCORD_BOT_TOKEN` | Token bota z Developer Portal — do **czytania** kanału |
| `DISCORD_WEBHOOK_URL` | URL webhooka kanału — do **pisania** |
| `DISCORD_CHANNEL_ID` | ID obserwowanego kanału |
| `DISCORD_WATCHED_USER_ID` | ID osoby, której pilnujemy |
| `WATCHED_USER_NAME` | Jej nick (tylko do logów) |
| `TENOR_API_KEY` *lub* `GIPHY_API_KEY` | Opcjonalne — losowy GIF pod wiadomością. Bez klucza bot bierze linki z `gifFallback*` w configu, a bez nich pisze bez gifa. |

## Setup na Discordzie (raz)

1. **Tryb dewelopera**: Ustawienia → Zaawansowane → Tryb dewelopera. Prawy klik → „Kopiuj ID" na kanale i użytkowniku → sekrety `DISCORD_CHANNEL_ID`, `DISCORD_WATCHED_USER_ID`.
2. **Aplikacja**: [Developer Portal](https://discord.com/developers/applications) → New Application → zakładka **Bot**:
   - Reset Token → do sekretu `DISCORD_BOT_TOKEN`
   - **Message Content Intent = ON** (bez tego bot widzi puste wiadomości)
   - Public Bot = OFF
3. **Zaproszenie**: OAuth2 → URL Generator → scope `bot`, uprawnienia *View Channel* + *Read Message History* (kod `66560`). Otwórz link, dodaj na serwer.
4. **Webhook**: Edytuj kanał → Integracje → Webhooki → Nowy → tu ustawiasz nick i avatar bota (kod ich nie nadpisuje) → Kopiuj URL → sekret `DISCORD_WEBHOOK_URL`.
5. Jeśli kanał jest ograniczony rolami — dodaj rolę bota w uprawnieniach kanału.

Ikona i baner do wgrania w Developer Portal: [`assets/icon.png`](assets/icon.png) (1024×1024), [`assets/banner.png`](assets/banner.png) (680×240).

## Uruchamianie

```bash
npm test                              # testy, bez sieci
node src/main.js --dry-run --now      # czyta kanał, pokazuje co BY wysłał, nie wysyła
node src/main.js --now                # wysyła naprawdę, omija bramkę godziny
```

Lokalnie sekrety podajesz przez zmienne środowiskowe:
`DISCORD_BOT_TOKEN=... DISCORD_WEBHOOK_URL=... node src/main.js --dry-run --now`

Na GitHubie: **Actions → Dzień dobry → Run workflow** (z opcją dry run).
Ręczne uruchomienie działa jak `--now`: omija bramkę godziny **i** bramkę „już dziś sprawdzone",
więc wyśle wiadomość nawet jeśli poranny cron już zadziałał. Do testów, nie do codziennego użytku.

## Stan

`state.json` trzyma serię i datę ostatniego sprawdzenia. Bot commituje go po każdym
wysłaniu. Chcesz wyzerować serię — zedytuj plik ręcznie i wypchnij.

Daty w `state.json` to doby **czasu polskiego**, nie UTC.

## Wygląd wiadomości

Tekst z oznaczeniem idzie w zwykłym `content` — widzi go każdy, także ktoś z wyłączonymi
embedami. Embed pod spodem to ozdoba: GIF, kolorowy pasek, stopka z serią.

## Znane ograniczenia

- **Dopasowanie jest leksykalne.** „nie powiem dzień dobry" liczy się jako powitanie,
  bo zawiera frazę. Wykrywanie zaprzeczeń po polsku byłoby kruche i dawało fałszywe
  pudła częściej niż to jedno fałszywe trafienie. Świadoma decyzja.
- **Cron GitHuba bywa mocno spóźniony.** Zmierzone 2026-09-15 na tym repo: **5 h 28 min**.
  `schedule` działa best-effort, a prywatne repo na darmowym planie są deprioritetyzowane.
  Stąd `graceMinutes: 900` — run zalicza się aż do 23:30. Górna granica okna obserwacji to
  **moment uruchomienia** (albo 8:30, gdy cron zdąży na czas): liczy się wszystko, co pilnowana
  osoba napisała, zanim bot się odezwał. Inaczej wychodziły absurdy — 2026-09-18 cron ruszył
  o 13:36 i wysłał przypomnienie komuś, kto przywitał się o 9:52.
- **Wyłączanie nieaktywnych workflow.** GitHub wyłącza crony po 60 dniach bez aktywności
  w repo. Bot commituje codziennie, co powinno wystarczyć — ale gdyby przyszedł mail
  „workflow disabled", jedno kliknięcie *Enable workflow* w zakładce Actions naprawia sprawę.
- Bot czyta **maks. 500 wiadomości** wstecz (`maxPages` × 100). Na kanale, gdzie między
  5:00 a 8:30 pada więcej, podnieś `maxPages`.

## Struktura

```
src/main.js       orkiestracja — jedyne miejsce z efektami ubocznymi
src/window.js     czas Europe/Warsaw, zmiana czasu, bramka godziny
src/greeting.js   normalizacja tekstu i rozpoznawanie powitań
src/messages.js   losowanie tekstów, budowa wiadomości (tekst w content, embed = gif + stopka)
src/gif.js        losowy GIF: Tenor → Giphy → lista z configu → brak
src/discord.js    REST Discorda: pobieranie, webhook, retry
src/streak.js     odczyt/zapis state.json
test/             node:test — wszystko bez sieci, fetch zamockowany
```

---

# 2. Licznik Obrazu

Codziennie o **8:30** pisze do wyznaczonej osoby, który to dzień czekania na obraz
od wyznaczonej artystki (od 11.10.2025), ile narosło odsetek maksymalnych od 5 000 zł
i co mógłby dziś za tę sumę kupić w Polsce. Po 31.12.2030 przechodzi na stałą wiadomość.

```
@ktoś — dzień 339 czekania na obraz od Artystki 🎨
Zapłacone 5 000,00 zł · odsetki maksymalne 18,5 % → +859,11 zł · razem 5 859,11 zł
Mógł mieć 225 kebabów. Ma za to najdłuższą historię czekania na tym serwerze.
┃ [GIF]   dzień 339 · liczone od 11.10.2025
```

**Tylko pisze** — nie potrzebuje tokenu bota ani intentów. Sekrety: `OBRAZ_WEBHOOK_URL`
(webhook na kanale licznika; nick i avatar ustawiasz w webhooku, ikona: `assets/icon-obraz.png`),
`OBRAZ_MENTION_USER_ID` (kogo oznaczać), `OBRAZ_MENTION_NAME` (jak go nazywać w tekstach),
`OBRAZ_ARTIST` / `OBRAZ_ARTIST_GEN` (artystka w mianowniku i dopełniaczu: „Ania" / „Ani").
W szablonach: `{name}`, `{artist}`, `{artistGen}`.

**Odsetki:** maksymalne za opóźnienie = 2 × (stopa referencyjna NBP + 5,5 p.p.). Wrzesień 2026:
NBP 3,75 % → **18,5 %** rocznie. Liczone płasko po stopie z `config-obraz.json` (`annualRatePercent`) —
gdy RPP zmieni stopę, zmień tę liczbę.

**Inna wiadomość każdego dnia:** 40 szablonów × 169 produktów, dobierane po numerze dnia.
Test przemiata każdy dzień do końca 2030 i wymaga, żeby żadna wiadomość się nie powtórzyła.
Produkt droższy niż suma („do Tesli brakuje jeszcze…") ma osobne szablony.

**Ceny** w [`data/zakupy.json`](data/zakupy.json) są orientacyjne (Polska 2026) — edytuj śmiało.
Każdy produkt ma trzy formy: `["kebab", "kebaby", "kebabów"]` (1 / 2–4 / 5+), a drogie dodatkowo
dopełniacz `gen` („Tesli Model 3").

```bash
npm run obraz:dry                     # podgląd dzisiejszej wiadomości, bez wysyłki
node src/obraz.js --now               # wysyła naprawdę
```

Pliki: `config-obraz.json` (teksty, kwoty, daty), `data/zakupy.json` (cennik), `src/obraz.js`
(orkiestracja), `src/licznik.js` (czysta logika), `state-obraz.json` (bramka „już dziś"),
`.github/workflows/obraz.yml`.
