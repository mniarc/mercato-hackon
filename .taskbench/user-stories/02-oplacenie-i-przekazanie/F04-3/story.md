---
id: F04-3
kind: user-story
category: "2. Opłacenie i przekazanie"
feature: F04
criteria_count: 5
status: partial
primary_blocker: code
---


# F04-3 · Potwierdzenie płatności

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

F04-3

### User story

Jako pracownik rozliczeń chcę otrzymać konkretny wyjątek płatności z dowodem niezgodności, żeby rozwiązać problem bez przypadkowego rozpoczęcia usługi.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Proces 2.1; Decyzje DEC-PLATNOSC i DEC-ESKALACJA. Niezgodność transakcji lub nierozwiązany błąd kierowane są do E.1 z dowodami i właścicielem.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F04-3

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

Nie wykonuje rutynowej dodatkowej akcji; może uzupełnić brak, jeżeli obsługa wyjątku tego wymaga.

### Interwencja pracownika

Rozstrzyga przypisany wyjątek rozliczeniowy w E; nie zatwierdza rutynowo poprawnych płatności.

### Decyzje

DEC-PLATNOSC
DEC-ESKALACJA

### Open Mercato

OM-01
OM-05
