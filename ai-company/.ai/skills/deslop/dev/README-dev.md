# deslop — paczka dla developerów

Wersja skilla: 0.3 (2026-09-18). Autor paczki: Claude, na zlecenie makeitflow.pl. Licencja skilla: do ustalenia przez Was (skill jest napisany od zera; źródła inspiracji w sekcji 8 są na MIT lub bez licencji).

## 1. Co to jest

`deslop` to skill agenta (format SKILL.md, zgodny z Claude Code, Codex, Cursor i innymi agentami obsługującymi `skills.sh`), który pisze, redaguje albo audytuje prozę tak, żeby nie brzmiała jak wygenerowana przez model, i robi to w głosie konkretnego klienta.

Trzy tryby:
- `write` — od zera, z briefu;
- `edit` — minimalna edycja cudzego draftu z zachowaniem głosu autora;
- `detect` — audyt bez przepisywania: lista wzorców z cytowaną linią i poprawką.

Cztery reguły, z których wynika reszta: konkret zamiast ogólnika; pokazuj, nie ogłaszaj; nazwij, kto działa; **nigdy nie wymyślaj faktów, liczb, cytatów ani anegdot, żeby tekst brzmiał ludzko**.

W procesie agencji skill jest przeznaczony dla dwóch ról:
- **Agent copywriter (proces 7.2, WZR-POST)** — `--mode write --output record --voice <KLI-TOV>`.
- **Niezależny redaktor (proces 7.3)** — `--mode detect --voice <KLI-TOV>`.

## 2. Zawartość paczki

```
deslop/                      skill do zainstalowania
  SKILL.md                   104 linie; ładowany zawsze, gdy skill się uruchomi
  references/
    voice-profile.md         jak skill czyta KLI-TOV / voice_extract; reguły pierwszeństwa
    patterns.md              katalog wzorców slopu z poprawkami
    words.md                 listy słów EN + PL (detektory, nie zakazy)
    channels.md              reguły formatowania per kanał
    examples.md              przykłady przed/po
    checklist.md             samoocena przed oddaniem (25 pkt generycznych + 5 dla profilu)
fixtures/
  TOV.json                   KLI-TOV FLOW v1.1 (kopia z Drive, status simulated_draft)
  ZLECENIE-POSTU.json        WEW-ZLECENIE-POSTU FLOW v1.1, temat TOP-01
  flow-top01-post.txt        tekst wygenerowany przez skill w przebiegu testowym
  flow-top01-KLI-POST.json   pełny rekord KLI-POST z tego przebiegu (wzorzec wyjścia)
tests/
  evals.json                 5 przypadków testowych z asercjami
README-dev.md                ten plik
```

## 3. Instalacja

Skill nie ma zależności wykonywalnych; to same pliki markdown.

```
# Claude Code / Codex (globalnie)
cp -r deslop ~/.claude/skills/deslop
cp -r deslop ~/.codex/skills/deslop

# w repo projektu, obok skilli OM
cp -r deslop .ai/skills/deslop

# przez skills.sh po wrzuceniu do repo
npx skills add <org>/<repo> --skill deslop
```

Wywołanie: `/deslop` z argumentami, albo skill uruchamia się sam, gdy zadanie dotyczy pisania prozy (opis w frontmatter jest celowo „pushy”; jeśli ma się uruchamiać tylko na wywołanie, zawęźcie pole `description`).

## 4. Argumenty

| Argument | Wartości | Domyślnie |
|---|---|---|
| `--mode` | `write` / `edit` / `detect` | wnioskowany z prośby; przy draft na wejściu → `edit` |
| `--voice <path>` | pełny KLI-TOV JSON, obiekt `voice_extract`, albo tekstowy przewodnik ToV | brak → domyślne reguły deslop |
| `--output` | `text` / `record` | `text` |

Skill nie ma parsera CLI; agent interpretuje argumenty z prośby. Jeśli orkiestrator ma je przekazywać programowo, umieśćcie je w pierwszej linii promptu w formie `--mode write --output record --voice /path/KLI-TOV.json`.

## 5. Kontrakt wejścia (tryb copywritera)

Skill czyta wyłącznie:
- `WEW-ZLECENIE-POSTU` — z niego: `selected_item.task`, `evidence_payload` (**biała lista faktów**), `reader_value`, `voice_extract`, `delivery_constraints` (w tym `excluded`, `cta`, `words_target`), `completion`.
- `KLI-TOV` we wskazanej wersji — z niego: `voice_principles`, `style_axes`, `wording`, `evidence_language`, `before_after`, `context_rules`, `copy_checks`, plus koperta: `status`, `version`, `approval_records`.

Nie czyta sieci ani innych dokumentów. Mapowanie każdego pola ToV na zachowanie skilla jest w `deslop/references/voice-profile.md` §3.

## 6. Kontrakt wyjścia (`--output record`)

Skill zwraca pola WZR-POST; wzorzec w `fixtures/flow-top01-KLI-POST.json`:

- `text` — sam tekst;
- `target` — kanał, format, status limitu adaptera (nigdy nie zgaduje limitu);
- `claims_map[]` — `fragment`, `claim_id`, `fact_id` / `seed_id`, `kind` (`fact`, `own_declaration`, `hypothesis`, `creative_example`, `creative_proposal`, `author_opinion`), `within_evidence` (`true` / `false` / `"borderline"`), `note`;
- `links_and_mentions[]`;
- `client_note` — do 80 słów;
- `qa.author_self_check` — wynik checklisty generycznej, `copy_checks` jeden po drugim, id/wersja/status profilu, konflikty generyczne vs profil i jak rozstrzygnięte, lista pozycji do redaktora;
- `qa.independent_review: "pending"` — skill nigdy nie oznacza postu jako gotowego;
- `approval_records: []`.

Dodatkowo pole `generated_by` (skill, wersja, tryb, profil, podstawa zgody na draft). Jeśli `contracts.json` ma inną strukturę `qa` lub `claims_map`, dopasowanie jest w sekcji „Agent output” w SKILL.md; to jedyne miejsce, które trzeba zmienić.

## 7. Reguły, których developer musi być świadomy

1. **Pierwszeństwo.** Profil klienta wygrywa we wszystkim, co jest wyborem stylistycznym. Deslop wygrywa tylko tam, gdzie profil milczy, i w regule „nie wymyślaj”, której żaden profil nie może znieść.
2. **Biała lista faktów.** `evidence_payload` ze zlecenia to jedyne źródło faktów. Przykłady `before_after` w ToV pokazują brzmienie i nie dodają faktów (zlecenie FLOW mówi to wprost w `excluded`).
3. **Bramka statusu.** Profil ze statusem innym niż zaakceptowany blokuje `write`, chyba że zlecenie autoryzuje draft (u FLOW: `completion[5]` „Post to draft w symulacji”). Zgoda jest szukana w zleceniu, nie w ToV.
4. **Brak dowodu → zawężenie albo usunięcie**, nigdy dopisanie liczby lub anegdoty. Luki są oznaczane nawiasem kwadratowym w `text` (tryb `text`) albo `within_evidence: false/"borderline"` w `claims_map` (tryb `record`).
5. **Samoocena to propozycja.** Redaktor uruchamia ten sam skill w `detect` z tym samym profilem.

## 8. Testy

`tests/evals.json` zawiera 5 przypadków: write z pełnym zleceniem, detect na zdaniu spoza głosu, bramka bez zgody, praca na samym `voice_extract`, edit bez profilu z zachowaniem głosu. Przypadek 1 był wykonany (wynik w `fixtures/`), przypadki 2 i 3 częściowo (ręcznie w rozmowie), 4 i 5 nie były uruchamiane.

Uruchomienie z narzędziem `skill-creator` Anthropic: `python -m scripts.run_eval --eval-set tests/evals.json --skill-path deslop`. Bez niego: podać agentowi prompt z `evals.json` i sprawdzić asercje ręcznie.

## 9. Otwarte pytania do rozstrzygnięcia przed wdrożeniem

1. `author_self_check` w `completion` zlecenia vs pole `qa` w WZR-POST — skill zwraca `qa.author_self_check`; potwierdzić z `contracts.json`.
2. Czy niespełniony `copy_check` w trybie `write` ma blokować (zwrot samego raportu), czy skill ma poprawiać i raportować? Obecnie: poprawia i raportuje.
3. Domyślna lokalizacja profilu (`${SPECS_DIR}/tov/<klient>.json`?) — obecnie ścieżka tylko z argumentu.
4. Lista polska w `words.md` jest kompilacją autorską, nie wynikiem badań; warto ją zweryfikować na kilkunastu realnych tekstach klientów i przyciąć false positives.
5. Opis skilla jest szeroki (uruchamia się na każdej prozie). Jeśli w tym samym środowisku działają skille OM, które same piszą teksty (np. `om-spec-writing`), rozważyć zawężenie, żeby deslop nie wchodził w ich wyjście.

## 10. Pochodzenie

Skill powstał jako synteza trzech publicznych skilli po przeczytaniu ich pełnych źródeł: `hardikpandya/stop-slop` (MIT), `petergyang/no-ai-slop` (MIT), `jalaalrd/anti-ai-slop-writing` (brak licencji w repo). Wszystkie listy, wzorce i przykłady napisano od nowa. Świadomie odrzucono: zakaz wszystkich przysłówków i myślników, „pierwsze słowa typowe dla modeli”, produkowanie sztucznego bałaganu. Dodano: tryb profilu klienta, listę polską, sekcję „co nie jest slopem”, kontrakt `record`.

## 11. Changelog

- 0.1 — trzy tryby, katalog wzorców, listy EN/PL, kanały, przykłady, checklist.
- 0.2 — `--voice`, `--output record`, `references/voice-profile.md`, sekcja Agent output, 5 punktów profilu w checklist.
- 0.3 — zgoda na draft szukana w zleceniu; `evidence_payload` jako biała lista faktów nadrzędna wobec przykładów ToV.

## 12. Wdrożenie w `agency_research` (2026-09-19)

Skill nie jest ładowany z plików w czasie działania (agenci są bez narzędzi); jego treść jest
powtórzona w `apps/mercato/src/modules/agency_research/lib/agents/deslop.ts` jako stałe promptu:

- `post_author` (7.2) dostaje `DESLOP_WRITE_UNDER_PROFILE` + reguły, katalog wzorców, listy słów
  i format kanału; raport z §5 `voice-profile.md` trafia do `self_check.style_hygiene`, a dalej do
  `qa.style_hygiene` w KLI-POST (odpowiedź na pytanie 1 z §9).
- `post_editor` (7.3) dostaje `DESLOP_DETECT_FOR_EDITOR`: każde znalezisko stylistyczne to
  `finding` z `code: slop_pattern`, cytowanym `fragment`, nazwą wzorca i `fix_hint` < 10 słów.
- Deterministyczna połowa (`lib/research/deslop.ts`) — frazy z `words.md`, otwieracze kanału,
  budżety myślników/wykrzykników/hashtagów, markdown i emoji-punktory — działa w walidatorze Q-T
  przed redaktorem; `slop_pattern` jest `minor` (pojedynczy) lub `major` (≥3), nigdy sam nie blokuje.
- Autorzy briefu, strategii, ToV i planu dostają same cztery reguły (`DESLOP_PROSE_RULES`).
- Pytanie 2 z §9: w trybie `write` skill poprawia i raportuje (nie blokuje); blokują tylko
  znaleziska dowodowe (`unsourced_claim`, `invented_effectiveness`), które mają własne kody.
