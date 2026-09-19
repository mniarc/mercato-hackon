---
id: F04-1
kind: user-story
category: "2. Opłacenie i przekazanie"
feature: F04
criteria_count: 5
status: partial
primary_blocker: code
---


# F04-1 · Potwierdzenie płatności

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

### ID historii

F04-1

### User story

Jako koordynator rozliczeń chcę uruchamiać usługę wyłącznie na podstawie zweryfikowanego potwierdzenia płatności, żeby realizacja była przypisana do rzeczywiście opłaconego zamówienia.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Proces 2.1; Decyzje DEC-PLATNOSC. Kontrola obejmuje autentyczność, zamówienie, kwotę i walutę; 2.2 i 2.3 ruszają równolegle po potwierdzeniu.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F04-1

### Kroki procesu

2.1 — Potwierdzenie opłacenia zamówienia

### Dział odpowiedzialny

Rozliczenia

### Wykonawcy po stronie firmy

System obsługi zdarzeń płatności (2.1)

### Powiązane wcześniejsze historie / kroki

F03-1 — Zamówienie i rozpoczęcie płatności

### Dokumenty i zdarzenia

Potwierdzenie stanu transakcji od operatora — WE-PLATNOSC

### Udział klienta

Po udanej płatności nie wykonuje dodatkowej akcji.

### Interwencja pracownika

Brak rutynowego udziału pracownika.

### Decyzje

DEC-PLATNOSC
DEC-ESKALACJA

### Open Mercato

OM-01
OM-05
