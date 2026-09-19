---
id: F41-1
kind: user-story
category: "G — wspólna obsługa klienta"
feature: F41
criteria_count: 4
status: partial
primary_blocker: code
---


# F41-1 · Pewne przypisanie i uprawniony kontakt

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F41

### Grupa

G — wspólna obsługa klienta

### Status ustalenia

Ustalone w procesie v2

### Nazwa funkcjonalności

Pewne przypisanie i uprawniony kontakt

### Definicja

System rozpoznaje kontekst zgłoszenia i uprawnienie kontaktu; niejasność wyjaśnia przed wykonaniem skutków decyzji.

### Krok procesu

G.1
G.5
E.1

### ID historii

F41-1

### User story

Jako klient chcę, aby moja wiadomość trafiła do właściwego zamówienia i wersji materiału, żeby firma nie zmieniła innej sprawy przez błędne przypisanie.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Proces, G.1: rozpoznanie uprawnionego kontaktu i doprecyzowanie przypisania; G.5: kontrola uprawnienia przed zatwierdzeniem. Decyzje, DEC-AKCEPTACJA: spór o uprawnienie → E.1; E.1 odróżnia oczekiwanie na klienta od eskalacji.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F41-1

### Kroki procesu

G.1 — Przyjęcie i powiązanie zgłoszenia
G.5 — Zapis decyzji i przekazanie do procesu
E.1 — Utworzenie sprawy dla pracownika

### Dział odpowiedzialny

Obsługa klienta
Operacje

### Wykonawcy po stronie firmy

System wejścia i agent obsługi (G.1)
Orkiestrator i system reguł (G.5)
Orkiestrator i system wyjątków (E.1)

### Powiązane wcześniejsze historie / kroki

F40-1 — Jedno przyjęcie zgłoszenia

### Dokumenty i zdarzenia

Schemat realizacji produktu i dozwolone ścieżki — STD-PROCES
Dane klienta i marki podane przy zakupie — WEW-DANE-ZAMOWIENIA
Wzorzec zapisu zgłoszenia klienta — WZR-ZGLOSZENIE
Zgłoszenie klienta powiązane z kontaktem lub zamówieniem — WEW-ZGLOSZENIE
Wzorzec zadania dla pracownika — WZR-ESKALACJA
Sprawa wymagająca rozstrzygnięcia pracownika — WEW-ESKALACJA

### Udział klienta

Wyjaśnia, którego zamówienia lub materiału dotyczy zgłoszenie.

### Interwencja pracownika

Rozstrzyga jedynie nierozwiązany spór o uprawnienie.

### Decyzje

DEC-TRIAZ
DEC-AKCEPTACJA
DEC-ESKALACJA

### Open Mercato

OM-03
OM-04
OM-05
