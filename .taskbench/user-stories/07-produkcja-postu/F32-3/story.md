---
id: F32-3
kind: user-story
category: "7. Produkcja postu"
feature: F32
criteria_count: 4
status: partial
primary_blocker: code
---


# F32-3 · Decyzja o treści i oddzielna zgoda na publikację

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

7.6

### ID historii

F32-3

### User story

Jako klient chcę móc razem z akceptacją postu wyraźnie zlecić publikację tej wersji w konkretnym miejscu, żeby nie odpowiadać ponownie na to samo pytanie.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Zgoda publikacyjna może być zebrana przy poście i nie musi być powtarzana, jeśli obejmuje tę samą wersję i cel. Zasady produktu: Zgoda publikacyjna. Źródło: arkusz Proces, kroki 7.6.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F32-3

### Kroki procesu

7.6 — Zapis akceptacji postu i ewentualnej zgody publikacyjnej

### Dział odpowiedzialny

Obsługa klienta

### Wykonawcy po stronie firmy

System rejestrujący decyzje (7.6)

### Powiązane wcześniejsze historie / kroki

F33-1 — Obsługa dyspozycji i przekazanie do publikacji

### Dokumenty i zdarzenia

Post tekstowy przygotowany dla klienta — KLI-POST
Konfiguracja konta lub kanału publikacji — WEW-KONFIG-PUBLIKACJI
Zgłoszenie klienta powiązane z kontaktem lub zamówieniem — WEW-ZGLOSZENIE

### Udział klienta

Opcjonalnie wydaje osobną, jednoznaczną zgodę na publikację pokazanej wersji we wskazanym miejscu.

### Interwencja pracownika

Brak rutynowej akcji pracownika; ewentualne nierozwiązane wyjątki obsługuje wspólny proces E.

### Decyzje

DEC-AKCEPTACJA
DEC-PUBLIKACJA

### Open Mercato

OM-04
