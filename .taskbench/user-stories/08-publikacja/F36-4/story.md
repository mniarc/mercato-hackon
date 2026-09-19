---
id: F36-4
kind: user-story
category: "8. Publikacja"
feature: F36
criteria_count: 5
status: partial
primary_blocker: decision
---


# F36-4 · Kontrolowana rezerwacja i rozpoczęcie publikacji

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

8.4
8.5

### ID historii

F36-4

### User story

Jako klient cofający zgodę chcę, żeby firma odróżniała publikację oczekującą od rozpoczętej wysyłki, żeby otrzymać zgodną z rzeczywistością informację o skutku wstrzymania.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Proces G.1 i G.5 unieważnia niewysłaną próbę, a 8.5 wymaga ustalenia wyniku po rozpoczęciu. Zasady produktu: Wynik nieznany. Źródło: arkusz Proces, kroki 8.4, 8.5.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F36-4

### Kroki procesu

8.4 — Ostateczna kontrola i rezerwacja jednej próby publikacji
8.5 — Wykonanie publikacji przez integrację

### Dział odpowiedzialny

Publikacja i integracje

### Wykonawcy po stronie firmy

System kontroli wykonania (8.4)
Adapter obsługiwanego kanału publikacji (8.5)

### Powiązane wcześniejsze historie / kroki

G.1 — Przyjęcie i powiązanie zgłoszenia (F40-1, F40-2, F41-1, F44-2, F46-1, F46-2, F47-1, F49-2, F50-2, F54-1, F55-1, F57-1)
G.5 — Zapis decyzji i przekazanie do procesu (F40-2, F41-1, F41-2, F42-1, F42-2, F43-2, F44-1, F44-2, F45-1, F46-1, F46-2, F47-1, F47-2, F49-2, F52-1, F54-1, F55-1, F57-1)
F36-2 — Kontrolowana rezerwacja i rozpoczęcie publikacji

### Dokumenty i zdarzenia

Post tekstowy przygotowany dla klienta — KLI-POST
Techniczne limity wykonania zadań agentów — STD-LIMITY
Schemat realizacji produktu i dozwolone ścieżki — STD-PROCES
Konfiguracja konta lub kanału publikacji — WEW-KONFIG-PUBLIKACJI
Zgłoszenie klienta powiązane z kontaktem lub zamówieniem — WEW-ZGLOSZENIE
Historia zgłoszeń zmian, decyzji i zależnych wersji — WEW-ZMIANY

### Udział klienta

Może przesłać cofnięcie zgody lub uwagę; po starcie otrzymuje informację wynikającą z ustalonego rzeczywistego wyniku.

### Interwencja pracownika

Brak rutynowej akcji pracownika; ewentualne nierozwiązane wyjątki obsługuje wspólny proces E.

### Decyzje

DEC-ESKALACJA
DEC-PUBLIKACJA

### Open Mercato

OM-02
OM-04
OM-05
OM-06
