---
id: F04-2
kind: user-story
category: "2. Opłacenie i przekazanie"
feature: F04
criteria_count: 4
status: partial
primary_blocker: code
---


# F04-2 · Potwierdzenie płatności

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F04

### Grupa

2. Opłacenie i przekazanie

### Status ustalenia

Ustalone w procesie v2

### Nazwa funkcjonalności

Potwierdzenie płatności

### Definicja

System sprawdza autentyczność zdarzenia dostawcy oraz zgodność zamówienia, kwoty i waluty. Tylko potwierdzona płatność uruchamia realizację, a powtórzone zdarzenie nie tworzy kolejnego zlecenia. Niezgodności są obsługiwane jako wyjątki E.

### Krok procesu

2.1
2.3

### ID historii

F04-2

### User story

Jako koordynator operacji chcę rozpoznawać powtórzone zdarzenia płatności, żeby opłacony zakup uruchomił tylko jedną realizację.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Proces 2.1 i 2.3; Decyzje DEC-PLATNOSC. Deduplikacja zdarzeń nie może tworzyć kolejnego zlecenia.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F04-2

### Kroki procesu

2.1 — Potwierdzenie opłacenia zamówienia
2.3 — Przekazanie opłaconego zamówienia do realizacji

### Dział odpowiedzialny

Rozliczenia
Operacje

### Wykonawcy po stronie firmy

System obsługi zdarzeń płatności (2.1)
Orkiestrator i system reguł (2.3)

### Powiązane wcześniejsze historie / kroki

F04-1 — Potwierdzenie płatności

### Dokumenty i zdarzenia

Schemat realizacji produktu i dozwolone ścieżki — STD-PROCES
Techniczne limity wykonania zadań agentów — STD-LIMITY
Dane klienta i marki podane przy zakupie — WEW-DANE-ZAMOWIENIA
Wzorzec historii decyzji i wpływu zmian — WZR-ZMIANY
Historia zgłoszeń zmian, decyzji i zależnych wersji — WEW-ZMIANY
Potwierdzenie stanu transakcji od operatora — WE-PLATNOSC

### Udział klienta

Nie musi rozpoznawać ani potwierdzać ponownie duplikatu zdarzenia.

### Interwencja pracownika

Brak rutynowego udziału pracownika.

### Decyzje

DEC-PLATNOSC

### Open Mercato

OM-01
OM-02
OM-04
