---
id: F33-2
kind: user-story
category: "7. Produkcja postu"
feature: F33
criteria_count: 4
status: partial
primary_blocker: code
---


# F33-2 · Obsługa dyspozycji i przekazanie do publikacji

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F33

### Grupa

7. Produkcja postu

### Status ustalenia

Ustalone w procesie v2

### Nazwa funkcjonalności

Obsługa dyspozycji i przekazanie do publikacji

### Definicja

Koordynator treści wykonuje dyspozycję z G, w tym powrót do wcześniejszych założeń lub aktualizację tekstu. Po akceptacji system składa instrukcję obsługi publikacji z niezmienną wersją postu i jawnym stanem celu oraz zgody.

### Krok procesu

7.7

### ID historii

F33-2

### User story

Jako operator publikacji chcę dostać instrukcję z zaakceptowaną treścią i jawnym stanem braków, żeby przygotować publikację bez uznawania przekazania za zgodę na wysyłkę.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Proces 7 może przekazać post do procesu 8 mimo brakującego celu lub zgody. Dokumenty: WZR-ZLECENIE-PUBLIKACJI i WEW-ZLECENIE-PUBLIKACJI. Źródło: arkusz Proces, kroki 7.7.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F33-2

### Kroki procesu

7.7 — Przekazanie postu do obsługi publikacji

### Dział odpowiedzialny

Operacje

### Wykonawcy po stronie firmy

System składania instrukcji i orkiestrator (7.7)

### Powiązane wcześniejsze historie / kroki

F32-2 — Decyzja o treści i oddzielna zgoda na publikację

### Dokumenty i zdarzenia

Post tekstowy przygotowany dla klienta — KLI-POST
Konfiguracja konta lub kanału publikacji — WEW-KONFIG-PUBLIKACJI
Instrukcja wykonania wybranego postu — WEW-ZLECENIE-POSTU
Instrukcja obsługi publikacji zaakceptowanego postu — WEW-ZLECENIE-PUBLIKACJI
Wzorzec instrukcji obsługi publikacji — WZR-ZLECENIE-PUBLIKACJI

### Udział klienta

Brak rutynowej akcji klienta.

### Interwencja pracownika

Brak rutynowej akcji pracownika; ewentualne nierozwiązane wyjątki obsługuje wspólny proces E.

### Open Mercato

OM-02
OM-04
OM-06
