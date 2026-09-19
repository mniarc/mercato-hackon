---
id: F37-1
kind: user-story
category: "8. Publikacja"
feature: F37
criteria_count: 5
status: partial
primary_blocker: decision
---


# F37-1 · Rozstrzygnięcie próby i dowód publikacji

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F37

### Grupa

8. Publikacja

### Status ustalenia

Propozycja procesu 8–9

### Nazwa funkcjonalności

Rozstrzygnięcie próby i dowód publikacji

### Definicja

Proponowany mechanizm odróżnia potwierdzoną publikację, pewne odrzucenie i wynik nieznany. Ponowienie następuje wyłącznie po bezpiecznym rozstrzygnięciu oraz ponownej kontroli, a dowód dostawy powstaje z rzeczywistego potwierdzenia platformy i linku do wiadomości.

### Krok procesu

8.6

### ID historii

F37-1

### User story

Jako operator integracji chcę rozróżnić potwierdzony sukces od pewnego niepowodzenia i dopuszczać kontrolowane ponowienie, żeby zakończyć publikację bez duplikatu.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Pewne niepowodzenie ma ograniczone retry przez 8.4, a sukces wymaga dowodu dostawcy. Zasady produktu: Limity techniczne; Decyzje: DEC-ESKALACJA. Źródło: arkusz Proces, kroki 8.6.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F37-1

### Kroki procesu

8.6 — Potwierdzenie wyniku albo rozstrzygnięcie niepewnej wysyłki

### Dział odpowiedzialny

Publikacja i integracje

### Wykonawcy po stronie firmy

System integracji; pracownik wyłącznie przez eskalację E.1–E.3 (8.6)

### Powiązane wcześniejsze historie / kroki

F36-3 — Kontrolowana rezerwacja i rozpoczęcie publikacji

### Dokumenty i zdarzenia

Post tekstowy przygotowany dla klienta — KLI-POST
Techniczne limity wykonania zadań agentów — STD-LIMITY
Schemat realizacji produktu i dozwolone ścieżki — STD-PROCES
Sprawa wymagająca rozstrzygnięcia pracownika — WEW-ESKALACJA
Konfiguracja konta lub kanału publikacji — WEW-KONFIG-PUBLIKACJI
Historia zgłoszeń zmian, decyzji i zależnych wersji — WEW-ZMIANY

### Udział klienta

Brak rutynowej akcji klienta.

### Interwencja pracownika

Rozstrzyga trwały błąd lub wyczerpane retry przez E.1–E.3; wznowienie nadal spełnia aktualne warunki.

### Decyzje

DEC-ESKALACJA
DEC-PUBLIKACJA

### Open Mercato

OM-02
OM-04
OM-05
OM-06
