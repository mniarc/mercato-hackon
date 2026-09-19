---
id: F50-1
kind: user-story
category: "E — wyjątki i pracownik"
feature: F50
criteria_count: 5
status: missing
primary_blocker: decision
---


# F50-1 · Kontrolowane wznowienie zadania

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F50

### Grupa

E — wyjątki i pracownik

### Status ustalenia

Ustalone w procesie v2

### Nazwa funkcjonalności

Kontrolowane wznowienie zadania

### Definicja

Po rozstrzygnięciu wyjątku system ponownie weryfikuje warunki konkretnego kroku i wykonuje dozwolony powrót dokładnie raz.

### Krok procesu

E.3

### ID historii

F50-1

### User story

Jako koordynator realizacji chcę wznowić wskazane zadanie po rozwiązaniu wyjątku, żeby dokończyć usługę bez duplikowania już wykonanej pracy.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Proces, E.3 (wiersz 68): ponowna kontrola konkretnego kroku, wznowienie dokładnie raz, brak restartu całości i powtórzenia publikacji. Decyzje, DEC-ESKALACJA.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F50-1

### Kroki procesu

E.3 — Wznowienie procesu

### Dział odpowiedzialny

Operacje

### Wykonawcy po stronie firmy

Orkiestrator i system reguł (E.3)

### Powiązane wcześniejsze historie / kroki

F49-1 — Rozstrzygnięcie przez uprawnionego pracownika

### Dokumenty i zdarzenia

Schemat realizacji produktu i dozwolone ścieżki — STD-PROCES
Sprawa wymagająca rozstrzygnięcia pracownika — WEW-ESKALACJA
Historia zgłoszeń zmian, decyzji i zależnych wersji — WEW-ZMIANY

### Udział klienta

Brak dodatkowej akcji, gdy wszystkie wymagane decyzje już istnieją.

### Interwencja pracownika

Przekazuje rozstrzygnięcie; system egzekwuje warunki powrotu.

### Decyzje

DEC-ESKALACJA

### Open Mercato

OM-02
OM-05
