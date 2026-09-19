---
id: F45-1
kind: user-story
category: "G — wspólna obsługa klienta"
feature: F45
criteria_count: 5
status: partial
primary_blocker: code
---


# F45-1 · Wiążąca dyspozycja i routing

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F45

### Grupa

G — wspólna obsługa klienta

### Status ustalenia

Ustalone w procesie v2

### Nazwa funkcjonalności

Wiążąca dyspozycja i routing

### Definicja

Wynik wspólnej obsługi jest zapisany jako jedna dyspozycja z uzasadnieniem i dozwolonym następnym krokiem; lokalny koordynator ją wykonuje.

### Krok procesu

G.5
1.2
4.4
5.6
6.5
7.5
8.2
8.3
E.1

### ID historii

F45-1

### User story

Jako koordynator realizacji chcę otrzymywać gotową dyspozycję obsługi zgłoszenia, żeby przekazać pracę do właściwego etapu bez ponownego rozstrzygania tej samej sprawy.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Proces, G.5 (wiersz 65): jedna decyzja, dozwolony krok, zapis w zgłoszeniu i warunkowo rejestrze zmian; adresaci 1.2, 4.4, 5.6, 6.5, 7.5, 8.2/8.3, źródła 3.2/4.5 i E.1.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F45-1

### Kroki procesu

G.5 — Zapis decyzji i przekazanie do procesu
1.2 — Odpowiedź na pytanie przed zakupem
4.4 — Wykonanie decyzji dotyczącej briefu
5.6 — Wykonanie decyzji dotyczącej strategii
6.5 — Wykonanie decyzji dotyczącej planu
7.5 — Wykonanie decyzji dotyczącej postu
8.2 — Sprawdzenie konkretnego miejsca publikacji i dostępu
8.3 — Sprawdzenie zgody na publikację konkretnej wersji w konkretnym miejscu
E.1 — Utworzenie sprawy dla pracownika

### Dział odpowiedzialny

Operacje
Sprzedaż
Analiza i onboarding
Strategia
Planowanie treści
Produkcja treści
Publikacja i integracje
Obsługa klienta

### Wykonawcy po stronie firmy

Orkiestrator i system reguł (G.5)
Agent sprzedaży (1.2)
Koordynator analizy (4.4)
Koordynator strategii (5.6)
Koordynator planowania (6.5)
Koordynator treści (7.5)
System integracji; agent obsługi zgłoszeń przez wspólny proces G (8.2)
System rejestrujący decyzje; komunikacja przez wspólny proces G (8.3)
Orkiestrator i system wyjątków (E.1)

### Powiązane wcześniejsze historie / kroki

F42-1 — Jednorazowy triaż intencji
G.3 — Weryfikacja zakresu (F42-2, F43-1, F43-2, F44-2, F47-1, F57-1, F59-1, F60-1)
G.4 — Ocena wpływu zmiany (F42-2, F43-1, F44-1, F44-2, F47-1, F53-1, F57-1, F60-1)

### Dokumenty i zdarzenia

Schemat realizacji produktu i dozwolone ścieżki — STD-PROCES
Zgłoszenie klienta powiązane z kontaktem lub zamówieniem — WEW-ZGLOSZENIE
Wzorzec historii decyzji i wpływu zmian — WZR-ZMIANY
Historia zgłoszeń zmian, decyzji i zależnych wersji — WEW-ZMIANY

### Udział klienta

Otrzymuje rezultat obsługi albo odpowiada na pytanie.

### Interwencja pracownika

Przejmuje tylko jawnie skierowany wyjątek.

### Decyzje

DEC-TRIAZ
DEC-ZAKRES
DEC-WPLYW
DEC-ESKALACJA

### Open Mercato

OM-02
OM-03
OM-05
