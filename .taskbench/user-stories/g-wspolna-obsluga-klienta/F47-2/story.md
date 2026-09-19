---
id: F47-2
kind: user-story
category: "G — wspólna obsługa klienta"
feature: F47
criteria_count: 4
status: partial
primary_blocker: decision
---


# F47-2 · Zgłoszenie po dostawie

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F47

### Grupa

G — wspólna obsługa klienta

### Status ustalenia

Uzupełnienie wymagania

### Nazwa funkcjonalności

Zgłoszenie po dostawie

### Definicja

Obsługa po dostawie rozróżnia błąd agencji od nowej potrzeby klienta i zachowuje ślad wykonanej publikacji oraz dostarczonych wersji.

### Krok procesu

G.5
8.6
E.1
E.2

### ID historii

F47-2

### User story

Jako operator firmy chcę rozpatrzyć naprawę opublikowanej treści zgodnie z dowodami i możliwościami adaptera, żeby uwaga po dostawie nie spowodowała niezamierzonej drugiej publikacji.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Uzupełnienie wymagania wynikające z Procesu G.5 (błąd agencji po dostawie a nowa potrzeba), E.2/E.3 (dowody i brak powtórzenia wykonanej publikacji) oraz zakresu jednego postu/publikacji w Zasadach produktu. Źródło nie określa trybu naprawy opublikowanego tekstu ani obsługi edycji/usuwania przez adapter.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F47-2

### Kroki procesu

G.5 — Zapis decyzji i przekazanie do procesu
8.6 — Potwierdzenie wyniku albo rozstrzygnięcie niepewnej wysyłki
E.1 — Utworzenie sprawy dla pracownika
E.2 — Decyzja pracownika

### Dział odpowiedzialny

Operacje
Publikacja i integracje
Operacje lub integracje

### Wykonawcy po stronie firmy

Orkiestrator i system reguł (G.5)
System integracji; pracownik wyłącznie przez eskalację E.1–E.3 (8.6)
Orkiestrator i system wyjątków (E.1)
Uprawniony pracownik (E.2)

### Powiązane wcześniejsze historie / kroki

F47-1 — Zgłoszenie po dostawie
8.6 — Potwierdzenie wyniku albo rozstrzygnięcie niepewnej wysyłki (F37-1, F37-2, F46-2, F47-2, F58-1, F59-1)

### Dokumenty i zdarzenia

Katalog produktów, cen i granic usługi — STD-OFERTA
Schemat realizacji produktu i dozwolone ścieżki — STD-PROCES
Zgłoszenie klienta powiązane z kontaktem lub zamówieniem — WEW-ZGLOSZENIE
Historia zgłoszeń zmian, decyzji i zależnych wersji — WEW-ZMIANY
Post tekstowy przygotowany dla klienta — KLI-POST
Instrukcja obsługi publikacji zaakceptowanego postu — WEW-ZLECENIE-PUBLIKACJI
Konfiguracja konta lub kanału publikacji — WEW-KONFIG-PUBLIKACJI
Dowód wykonanej publikacji — WEW-POTWIERDZENIE-PUBLIKACJI
Wzorzec zadania dla pracownika — WZR-ESKALACJA
Sprawa wymagająca rozstrzygnięcia pracownika — WEW-ESKALACJA

### Udział klienta

Zgłasza błąd i podejmuje ewentualną wymaganą decyzję dotyczącą naprawy.

### Interwencja pracownika

Rozstrzyga nieustaloną ścieżkę naprawy bez rozszerzania zamówienia i bez nieobsługiwanych operacji.

### Decyzje

DEC-TRIAZ
DEC-ZAKRES
DEC-PUBLIKACJA
DEC-ESKALACJA

### Open Mercato

OM-03
OM-05
OM-06
