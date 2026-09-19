---
id: F51-1
kind: user-story
category: "Przekrojowe — wykonanie agentów"
feature: F51
criteria_count: 5
status: partial
primary_blocker: decision
---


# F51-1 · Limity zadania i przewidziana obsługa błędu

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F51

### Grupa

Przekrojowe — wykonanie agentów

### Status ustalenia

Ustalone w procesie v2

### Nazwa funkcjonalności

Limity zadania i przewidziana obsługa błędu

### Definicja

Limity techniczne dotyczą pojedynczego zadania. Ich wyczerpanie prowadzi do jawnej obsługi błędu lub sprawy pracownika, bez ograniczania prawa klienta do poprawek w zakresie.

### Krok procesu

2.3
3.1
E.1
E.2
E.3

### ID historii

F51-1

### User story

Jako właściciel operacji chcę kontrolować koszt, czas i ponowienia zadania, żeby nieskuteczne wykonanie zakończyło się rozwiązywalną sprawą zamiast nieograniczonej pętli.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Dokumenty, STD-LIMITY: koszt, źródła, czas i ponowienia pojedynczego zadania, wartości do ustalenia, obsługa błędu/eskalacja. Zasady produktu: Limity techniczne i Wynik nieznany; Proces 2.3 przypina wersje limitów.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F51-1

### Kroki procesu

2.3 — Przekazanie opłaconego zamówienia do realizacji
3.1 — Uruchomienie zdefiniowanych zadań audytu
E.1 — Utworzenie sprawy dla pracownika
E.2 — Decyzja pracownika
E.3 — Wznowienie procesu

### Dział odpowiedzialny

Operacje
Audyt i research
Operacje lub integracje

### Wykonawcy po stronie firmy

Orkiestrator i system reguł (2.3, E.3)
Orkiestrator (3.1)
Orkiestrator i system wyjątków (E.1)
Uprawniony pracownik (E.2)

### Powiązane wcześniejsze historie / kroki

2.3 — Przekazanie opłaconego zamówienia do realizacji (F04-2, F05-2, F51-1, F52-1, F54-1, F56-1, F60-1)

### Dokumenty i zdarzenia

Schemat realizacji produktu i dozwolone ścieżki — STD-PROCES
Techniczne limity wykonania zadań agentów — STD-LIMITY
Historia zgłoszeń zmian, decyzji i zależnych wersji — WEW-ZMIANY
Wzorzec zadania dla pracownika — WZR-ESKALACJA
Sprawa wymagająca rozstrzygnięcia pracownika — WEW-ESKALACJA

### Udział klienta

Może nadal zgłaszać poprawki w kupionym zakresie.

### Interwencja pracownika

Ustala techniczną konfigurację i rozwiązuje wyjątki po wyczerpaniu możliwości.

### Decyzje

DEC-ESKALACJA
DEC-PUBLIKACJA

### Open Mercato

OM-02
OM-05
