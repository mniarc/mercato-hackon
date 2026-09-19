---
id: F32-1
kind: user-story
category: "7. Produkcja postu"
feature: F32
criteria_count: 4
status: partial
primary_blocker: code
---


# F32-1 · Decyzja o treści i oddzielna zgoda na publikację

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F32

### Grupa

7. Produkcja postu

### Status ustalenia

Ustalone w procesie v2

### Nazwa funkcjonalności

Decyzja o treści i oddzielna zgoda na publikację

### Definicja

Klient ogląda konkretną wersję postu, a system osobno utrwala akceptację treści i ewentualną zgodę na jej publikację w dokładnie wskazanym miejscu. Obie decyzje mogą paść w jednej interakcji, lecz żadna nie obejmuje przyszłej wersji.

### Krok procesu

7.4

### ID historii

F32-1

### User story

Jako klient chcę zobaczyć dokładny tekst po kontroli i zdecydować o nim, żeby zaakceptować rezultat lub wskazać konkretne poprawki.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Jedna interakcja może zebrać dwie odrębne decyzje, gdy znany jest dokładny cel. Decyzje: DEC-AKCEPTACJA i DEC-PUBLIKACJA. Źródło: arkusz Proces, kroki 7.4.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F32-1

### Kroki procesu

7.4 — Przekazanie postu do decyzji klienta

### Dział odpowiedzialny

Obsługa klienta

### Wykonawcy po stronie firmy

Agent obsługi klienta (7.4)

### Powiązane wcześniejsze historie / kroki

F31-1 — Kontrola jakości i gotowości postu

### Dokumenty i zdarzenia

Brief potrzeb i celów klienta — KLI-BRIEF
Post tekstowy przygotowany dla klienta — KLI-POST
Konfiguracja konta lub kanału publikacji — WEW-KONFIG-PUBLIKACJI
Zgłoszenie klienta powiązane z kontaktem lub zamówieniem — WEW-ZGLOSZENIE

### Udział klienta

Czyta konkretną wersję i przekazuje decyzję; opcjonalnie zleca jej publikację we wskazanym miejscu.

### Interwencja pracownika

Brak rutynowej akcji pracownika; ewentualne nierozwiązane wyjątki obsługuje wspólny proces E.

### Decyzje

DEC-AKCEPTACJA
DEC-PUBLIKACJA

### Open Mercato

OM-03
OM-04
