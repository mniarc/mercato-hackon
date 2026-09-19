---
id: F03-1
kind: user-story
category: "1. Sprzedaż"
feature: F03
criteria_count: 5
status: implemented
primary_blocker: trial
---


# F03-1 · Zamówienie i rozpoczęcie płatności

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F03

### Grupa

1. Sprzedaż

### Status ustalenia

Ustalone w procesie v2

### Nazwa funkcjonalności

Zamówienie i rozpoczęcie płatności

### Definicja

Po zebraniu wymaganych danych system tworzy zamówienie na wybrany produkt i sesję płatności. Cena, waluta i wersja katalogu są przypisane do zamówienia. Nieudana płatność może być ponowiona w tym samym zamówieniu.

### Krok procesu

1.4

### ID historii

F03-1

### User story

Jako klient chcę przejść z poprawnie wypełnionych danych do płatności za wybrany produkt, żeby złożyć jedno zamówienie na ustalonych warunkach.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Proces 1.4; Decyzje DEC-PLATNOSC; Dokumenty STD-OFERTA. Utworzenie zamówienia i płatności wymaga skonfigurowanego adaptera; powrót przeglądarki nie jest dowodem płatności.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F03-1

### Kroki procesu

1.4 — Utworzenie zamówienia i płatności

### Dział odpowiedzialny

Sprzedaż i rozliczenia

### Wykonawcy po stronie firmy

System zamówień i adapter płatności (1.4)

### Powiązane wcześniejsze historie / kroki

F02-1 — Dane i warunki zakupu
F02-2 — Dane i warunki zakupu

### Dokumenty i zdarzenia

Dane klienta i marki podane przy zakupie — WEW-DANE-ZAMOWIENIA
Katalog produktów, cen i granic usługi — STD-OFERTA

### Udział klienta

Przechodzi do checkoutu i opłaca wybrany produkt.

### Interwencja pracownika

Brak rutynowego udziału pracownika.

### Decyzje

DEC-PLATNOSC

### Open Mercato

OM-01
