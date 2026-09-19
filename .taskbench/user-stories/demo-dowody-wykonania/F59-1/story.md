---
id: F59-1
kind: user-story
category: "Demo — dowody wykonania"
feature: F59
criteria_count: 6
status: partial
primary_blocker: code
---


# F59-1 · Prawdziwy stan awarii i wdrożone alternatywy

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F59

### Grupa

Demo — dowody wykonania

### Status ustalenia

Ustalone w procesie v2

### Nazwa funkcjonalności

Prawdziwy stan awarii i wdrożone alternatywy

### Definicja

Wariant awaryjny ujawnia aktualny stan wykonania i oznaczone wcześniejsze dowody. Alternatywy w Q&A obejmują wyłącznie działające gałęzie.

### Krok procesu

G.3
E.1
E.2
E.3
8.6

### ID historii

F59-1

### User story

Jako prezenter chcę przełączyć pokaz na jawnie oznaczoną historię podczas awarii lub przekroczenia czasu, żeby pokazać dowody bez fałszowania stanu bieżącego wykonania.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Demo, D-QA: tylko wdrożone ścieżki; D-PLAN-B: jawne nagranie/historia, żywa karta rzeczywistego stanu, brak fałszywego sukcesu. Zasady produktu: Poza demo.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F59-1

### Kroki procesu

G.3 — Weryfikacja zakresu
E.1 — Utworzenie sprawy dla pracownika
E.2 — Decyzja pracownika
E.3 — Wznowienie procesu
8.6 — Potwierdzenie wyniku albo rozstrzygnięcie niepewnej wysyłki

### Dział odpowiedzialny

Operacje
Operacje lub integracje
Publikacja i integracje

### Wykonawcy po stronie firmy

Prezenter prowadzi pokaz. Wykonanie usługi: Agent weryfikacji zakresu i system reguł (G.3)
Orkiestrator i system wyjątków (E.1)
Uprawniony pracownik (E.2)
Orkiestrator i system reguł (E.3)
System integracji; pracownik wyłącznie przez eskalację E.1–E.3 (8.6)

### Powiązane wcześniejsze historie / kroki

F56-1 — Jawnie oznaczone wcześniejsze wykonanie

### Dokumenty i zdarzenia

Katalog produktów, cen i granic usługi — STD-OFERTA
Schemat realizacji produktu i dozwolone ścieżki — STD-PROCES
Techniczne limity wykonania zadań agentów — STD-LIMITY
Zgłoszenie klienta powiązane z kontaktem lub zamówieniem — WEW-ZGLOSZENIE
Historia zgłoszeń zmian, decyzji i zależnych wersji — WEW-ZMIANY
Sprawa wymagająca rozstrzygnięcia pracownika — WEW-ESKALACJA
Dowód wykonanej publikacji — WEW-POTWIERDZENIE-PUBLIKACJI

### Udział klienta

Może obserwować zapis wcześniejszego wykonania i aktualny stan.

### Interwencja pracownika

Pokazuje tylko rzeczywiste rozstrzygnięcie wyjątku; nie zmienia statusów na potrzeby prezentacji.

### Decyzje

DEC-ZAKRES
DEC-ESKALACJA
DEC-PUBLIKACJA

### Open Mercato

OM-03
OM-05
OM-06
