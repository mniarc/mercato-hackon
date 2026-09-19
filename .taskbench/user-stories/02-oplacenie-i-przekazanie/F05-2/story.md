---
id: F05-2
kind: user-story
category: "2. Opłacenie i przekazanie"
feature: F05
criteria_count: 5
status: partial
primary_blocker: code
---


# F05-2 · Potwierdzenie zakupu i przekazanie do audytu

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F05

### Grupa

2. Opłacenie i przekazanie

### Status ustalenia

Ustalone w procesie v2

### Nazwa funkcjonalności

Potwierdzenie zakupu i przekazanie do audytu

### Definicja

Po potwierdzeniu płatności system równolegle przekazuje klientowi potwierdzenie zakupu oraz tworzy instancję ustalonego procesu z wersjami produktu, schematu, limitów i pustą historią zmian. Etap 2.3 przekazuje gotowość do audytu bez zbierania źródeł i analizowania firmy.

### Krok procesu

2.3

### ID historii

F05-2

### User story

Jako koordynator operacji chcę przekazać opłacone zamówienie do ustalonego procesu, żeby audyt otrzymał jednoznaczny zakres i gotowe wejście.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Proces 2.3; Dokumenty STD-PROCES, STD-LIMITY, WZR-ZMIANY i WEW-ZMIANY; Zasady produktu: Autonomia, Limity techniczne, Poprawki. Etap przekazuje, a analiza zaczyna się w 3.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F05-2

### Kroki procesu

2.3 — Przekazanie opłaconego zamówienia do realizacji

### Dział odpowiedzialny

Operacje

### Wykonawcy po stronie firmy

Orkiestrator i system reguł (2.3)

### Powiązane wcześniejsze historie / kroki

F04-1 — Potwierdzenie płatności

### Dokumenty i zdarzenia

Dane klienta i marki podane przy zakupie — WEW-DANE-ZAMOWIENIA
Katalog produktów, cen i granic usługi — STD-OFERTA
Schemat realizacji produktu i dozwolone ścieżki — STD-PROCES
Techniczne limity wykonania zadań agentów — STD-LIMITY
Wzorzec historii decyzji i wpływu zmian — WZR-ZMIANY
Historia zgłoszeń zmian, decyzji i zależnych wersji — WEW-ZMIANY

### Udział klienta

Brak wymaganej akcji.

### Interwencja pracownika

Brak rutynowego udziału pracownika.

### Open Mercato

OM-02
OM-04
