---
id: F55-1
kind: user-story
category: "Open Mercato — warstwa operacyjna"
feature: F55
criteria_count: 4
status: implemented
primary_blocker: trial
---


# F55-1 · Egzekwowanie dostępu do rekordów sprawy

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F55

### Grupa

Open Mercato — warstwa operacyjna

### Status ustalenia

Uzupełnienie wymagania

### Nazwa funkcjonalności

Egzekwowanie dostępu do rekordów sprawy

### Definicja

Uzupełnienie implementacyjne: uprawnienia kontaktu i pracownika są egzekwowane przy odczycie oraz zmianie wskazanego rekordu, także poza nawigacją interfejsu.

### Krok procesu

G.1
G.5
E.2

### ID historii

F55-1

### User story

Jako właściciel operacji chcę, żeby odwołanie do ID dokumentu lub wyjątku nie omijało uprawnień, aby tylko właściwa osoba mogła zobaczyć sprawę i wykonać swoją decyzję.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Wniosek implementacyjny z Procesu G.1/G.5 (uprawniony kontakt), E.2 (uprawniony pracownik) i Open Mercato OM-03/OM-04/OM-05 (kontrola dostępu). Źródło nie określa testu bezpośredniego odwołania ani szczegółowej macierzy uprawnień — to uzupełnienie.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F55-1

### Kroki procesu

G.1 — Przyjęcie i powiązanie zgłoszenia
G.5 — Zapis decyzji i przekazanie do procesu
E.2 — Decyzja pracownika

### Dział odpowiedzialny

Operacje — kontrola dostępu

### Wykonawcy po stronie firmy

System kontroli dostępu przy odczycie i zmianie rekordu; bez rutynowej zgody pracownika.

### Powiązane wcześniejsze historie / kroki

Wejście zewnętrzne lub konfiguracja wskazana w kryteriach.

### Dokumenty i zdarzenia

Dane klienta i marki podane przy zakupie — WEW-DANE-ZAMOWIENIA
Zgłoszenie klienta powiązane z kontaktem lub zamówieniem — WEW-ZGLOSZENIE
Sprawa wymagająca rozstrzygnięcia pracownika — WEW-ESKALACJA
Brief potrzeb i celów klienta — KLI-BRIEF
Strategia komunikacji marki — KLI-STRATEGIA
Zasady języka marki — tone of voice — KLI-TOV
Plan treści na 30 dni — KLI-PLAN
Post tekstowy przygotowany dla klienta — KLI-POST
Pakiet końcowy materiałów zamówienia — KLI-PAKIET

### Udział klienta

Korzysta wyłącznie z danych i decyzji swojej uprawnionej sprawy.

### Interwencja pracownika

Rozstrzyga tylko sprawy objęte jego uprawnieniem.

### Decyzje

DEC-AKCEPTACJA
DEC-ESKALACJA

### Open Mercato

OM-03
OM-04
OM-05
