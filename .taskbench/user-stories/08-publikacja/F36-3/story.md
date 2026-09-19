---
id: F36-3
kind: user-story
category: "8. Publikacja"
feature: F36
criteria_count: 5
status: partial
primary_blocker: decision
---


# F36-3 · Kontrolowana rezerwacja i rozpoczęcie publikacji

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F36

### Grupa

8. Publikacja

### Status ustalenia

Propozycja procesu 8–9

### Nazwa funkcjonalności

Kontrolowana rezerwacja i rozpoczęcie publikacji

### Definicja

Proponowany mechanizm sprawdza wersję, zgodę, dostęp, blokady i wcześniejsze próby, atomowo rezerwuje jedno wykonanie i ponownie atomowo sprawdza warunki przy przejściu do wysyłania. Adapter wysyła dokładnie zatwierdzony tekst; cofnięcie po rozpoczęciu wymaga ustalenia rzeczywistego wyniku.

### Krok procesu

8.5

### ID historii

F36-3

### User story

Jako klient chcę, żeby adapter wysłał dokładnie zatwierdzony tekst tylko z nadal ważnej rezerwacji, żeby zmiana stanu tuż przed wysyłką była respektowana.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Atomowe sprawdzenie i stan wysyłania są odrębne od wcześniejszej rezerwacji. Demo: D-05 wymaga realnej wiadomości i rzeczywistego wyniku integracji. Źródło: arkusz Proces, kroki 8.5.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F36-3

### Kroki procesu

8.5 — Wykonanie publikacji przez integrację

### Dział odpowiedzialny

Publikacja i integracje

### Wykonawcy po stronie firmy

Adapter obsługiwanego kanału publikacji (8.5)

### Powiązane wcześniejsze historie / kroki

F36-2 — Kontrolowana rezerwacja i rozpoczęcie publikacji

### Dokumenty i zdarzenia

Post tekstowy przygotowany dla klienta — KLI-POST
Konfiguracja konta lub kanału publikacji — WEW-KONFIG-PUBLIKACJI
Historia zgłoszeń zmian, decyzji i zależnych wersji — WEW-ZMIANY

### Udział klienta

Brak rutynowej akcji klienta.

### Interwencja pracownika

Brak rutynowej akcji pracownika; ewentualne nierozwiązane wyjątki obsługuje wspólny proces E.

### Open Mercato

OM-02
OM-04
OM-05
OM-06
