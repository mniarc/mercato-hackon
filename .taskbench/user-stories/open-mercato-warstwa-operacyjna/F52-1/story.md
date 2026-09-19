---
id: F52-1
kind: user-story
category: "Open Mercato — warstwa operacyjna"
feature: F52
criteria_count: 6
status: partial
primary_blocker: code
---


# F52-1 · Jedna sprawa realizacji w Open Mercato

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F52

### Grupa

Open Mercato — warstwa operacyjna

### Status ustalenia

Ustalone w procesie v2

### Nazwa funkcjonalności

Jedna sprawa realizacji w Open Mercato

### Definicja

Moduł do zbudowania w OM łączy zamówienie z działami, agentami, zadaniami, wejściami, wynikami i powodami oczekiwania.

### Krok procesu

2.3
3.1
G.5
E.3
9.3

### ID historii

F52-1

### User story

Jako operator firmy chcę widzieć realizację zamówienia w jednej sprawie Open Mercato, żeby ustalić, kto pracuje, jaki powstał wynik i co blokuje następny krok.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Open Mercato, OM-02: instancja STD-PROCES, wykonawcy, zależności, stany, powroty i osadzony widok realizacji; dowód: dział/agent/wejście/wynik/powód oczekiwania. Zasady produktu: Open Mercato. Jawne ustalenie użytkownika: autonomiczna firma działająca 24/7.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F52-1

### Kroki procesu

2.3 — Przekazanie opłaconego zamówienia do realizacji
3.1 — Uruchomienie zdefiniowanych zadań audytu
G.5 — Zapis decyzji i przekazanie do procesu
E.3 — Wznowienie procesu
9.3 — Zamknięcie wykonanej usługi

### Dział odpowiedzialny

Operacje
Audyt i research
Operacje i rozliczenia

### Wykonawcy po stronie firmy

Orkiestrator i system reguł (2.3, G.5, E.3)
Orkiestrator (3.1)
System obsługi zamówień + orkiestrator (9.3)

### Powiązane wcześniejsze historie / kroki

2.3 — Przekazanie opłaconego zamówienia do realizacji (F04-2, F05-2, F51-1, F52-1, F54-1, F56-1, F60-1)

### Dokumenty i zdarzenia

Katalog produktów, cen i granic usługi — STD-OFERTA
Schemat realizacji produktu i dozwolone ścieżki — STD-PROCES
Techniczne limity wykonania zadań agentów — STD-LIMITY
Dane klienta i marki podane przy zakupie — WEW-DANE-ZAMOWIENIA
Historia zgłoszeń zmian, decyzji i zależnych wersji — WEW-ZMIANY
Zgłoszenie klienta powiązane z kontaktem lub zamówieniem — WEW-ZGLOSZENIE
Sprawa wymagająca rozstrzygnięcia pracownika — WEW-ESKALACJA

### Udział klienta

Podejmuje wyłącznie decyzje należące do klienta.

### Interwencja pracownika

Korzysta ze sprawy do kontroli operacji i obsługi wyjątków.

### Decyzje

DEC-TRIAZ
DEC-ESKALACJA

### Open Mercato

OM-01
OM-02
OM-03
OM-05
