---
id: F47-1
kind: user-story
category: "G — wspólna obsługa klienta"
feature: F47
criteria_count: 5
status: partial
primary_blocker: code
---


# F47-1 · Zgłoszenie po dostawie

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F47

### Grupa

G — wspólna obsługa klienta

### Status ustalenia

Ustalone w procesie v2

### Nazwa funkcjonalności

Zgłoszenie po dostawie

### Definicja

Obsługa po dostawie rozróżnia błąd agencji od nowej potrzeby klienta i zachowuje ślad wykonanej publikacji oraz dostarczonych wersji.

### Krok procesu

G.1
G.2
G.3
G.4
G.5
9.3

### ID historii

F47-1

### User story

Jako klient chcę zgłosić błąd także po dostawie, żeby firma rozpatrzyła odpowiedzialność za wykonanie zamiast automatycznie potraktować sprawę jako nowy zakup.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Proces, G.5: po dostawie rozróżnienie błędu agencji i nowej potrzeby. Zasady produktu, Poprawki: poprawki w zakresie do dostawy, błędy agencji po dostawie obsługiwane dalej; Dokumenty: zachowanie historii.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F47-1

### Kroki procesu

G.1 — Przyjęcie i powiązanie zgłoszenia
G.2 — Rozpoznanie intencji klienta
G.3 — Weryfikacja zakresu
G.4 — Ocena wpływu zmiany
G.5 — Zapis decyzji i przekazanie do procesu
9.3 — Zamknięcie wykonanej usługi

### Dział odpowiedzialny

Obsługa klienta
Operacje
Operacje i rozliczenia

### Wykonawcy po stronie firmy

System wejścia i agent obsługi (G.1)
Agent triażu (G.2)
Agent weryfikacji zakresu i system reguł (G.3)
Agent analizy wpływu i system zależności (G.4)
Orkiestrator i system reguł (G.5)
System obsługi zamówień + orkiestrator (9.3)

### Powiązane wcześniejsze historie / kroki

9.3 — Zamknięcie wykonanej usługi (F39-1, F47-1, F52-1, F58-1)
F40-1 — Jedno przyjęcie zgłoszenia

### Dokumenty i zdarzenia

Katalog produktów, cen i granic usługi — STD-OFERTA
Schemat realizacji produktu i dozwolone ścieżki — STD-PROCES
Zgłoszenie klienta powiązane z kontaktem lub zamówieniem — WEW-ZGLOSZENIE
Historia zgłoszeń zmian, decyzji i zależnych wersji — WEW-ZMIANY
Pakiet końcowy materiałów zamówienia — KLI-PAKIET
Post tekstowy przygotowany dla klienta — KLI-POST
Dowód wykonanej publikacji — WEW-POTWIERDZENIE-PUBLIKACJI

### Udział klienta

Zgłasza błąd albo nową potrzebę po dostawie.

### Interwencja pracownika

Rozstrzyga jedynie wyjątek wymagający pracownika; szczegółowa ścieżka korekty już opublikowanej treści wymaga doprecyzowania.

### Decyzje

DEC-TRIAZ
DEC-ZAKRES
DEC-WPLYW

### Open Mercato

OM-03
OM-04
OM-06
