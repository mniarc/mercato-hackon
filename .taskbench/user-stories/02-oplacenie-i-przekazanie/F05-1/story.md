---
id: F05-1
kind: user-story
category: "2. Opłacenie i przekazanie"
feature: F05
criteria_count: 5
status: partial
primary_blocker: code
---


# F05-1 · Potwierdzenie zakupu i przekazanie do audytu

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

2.2

### ID historii

F05-1

### User story

Jako klient chcę po udanej płatności dostać potwierdzenie zakupu z numerem zamówienia i pakietem, żeby wiedzieć, że przygotowanie usługi się rozpoczęło.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Proces 2.2. Krok opisuje mailowe potwierdzenie zakupu; jego doręczenie i odczyt nie warunkują przekazania usługi do realizacji.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F05-1

### Kroki procesu

2.2 — Potwierdzenie mailowe zakupu

### Dział odpowiedzialny

Obsługa klienta

### Wykonawcy po stronie firmy

System powiadomień (2.2)

### Powiązane wcześniejsze historie / kroki

F04-1 — Potwierdzenie płatności

### Dokumenty i zdarzenia

Dane klienta i marki podane przy zakupie — WEW-DANE-ZAMOWIENIA
Katalog produktów, cen i granic usługi — STD-OFERTA

### Udział klienta

Otrzymuje potwierdzenie; ewentualnie odpowiada przez wspólną obsługę G.

### Interwencja pracownika

Brak rutynowego udziału pracownika.

### Open Mercato

OM-01
OM-05
