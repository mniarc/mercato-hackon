---
id: F31-2
kind: user-story
category: "7. Produkcja postu"
feature: F31
criteria_count: 5
status: partial
primary_blocker: code
---


# F31-2 · Kontrola jakości i gotowości postu

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F31

### Grupa

7. Produkcja postu

### Status ustalenia

Uzupełnienie wymagania

### Nazwa funkcjonalności

Kontrola jakości i gotowości postu

### Definicja

Agent redaktor i walidator sprawdzają wskazaną wersję tekstu względem instrukcji, faktów, języka i wymagań kanału. Usterki treści wracają do copywritera, brak dowodów do odpowiedniego zadania audytu, a nierozwiązywalny wyjątek do pracownika przez E.

### Krok procesu

7.3

### ID historii

F31-2

### User story

Jako redaktor sprawdzający post chcę zlecić uzupełnienie konkretnego dowodu i otrzymać wynik z powrotem do kontroli tego postu, żeby brak źródła nie uruchamiał od początku całego procesu.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Uzupełnienie wymagania: 7.3 odsyła brakujący dowód do zadania P3, ale nie opisuje kontraktu powrotu. Powrót do tego samego QA lub korekty 7.2 wynika z zależności wersji. Wewnętrzny research nie jest WE-KLIENT: przy sprzeczności z bazowymi założeniami dopiero odpowiedź klienta na pytanie uruchamia G. Źródło: arkusz Proces, kroki 7.3.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F31-2

### Kroki procesu

7.3 — Kontrola jakości i gotowości postu

### Dział odpowiedzialny

Jakość

### Wykonawcy po stronie firmy

Agent redaktor i walidator publikacji (7.3)

### Powiązane wcześniejsze historie / kroki

F30-2 — Uruchomienie i wykonanie jednego postu

### Dokumenty i zdarzenia

Post tekstowy przygotowany dla klienta — KLI-POST
Strategia komunikacji marki — KLI-STRATEGIA
Zasady języka marki — tone of voice — KLI-TOV
Techniczne limity wykonania zadań agentów — STD-LIMITY
Schemat realizacji produktu i dozwolone ścieżki — STD-PROCES
Sprawa wymagająca rozstrzygnięcia pracownika — WEW-ESKALACJA
Instrukcja wykonania wybranego postu — WEW-ZLECENIE-POSTU
Historia zgłoszeń zmian, decyzji i zależnych wersji — WEW-ZMIANY
Źródła i materiały konkretnego zamówienia — WEW-ZRODLA

### Udział klienta

Brak rutynowej akcji klienta.

### Interwencja pracownika

Brak rutynowej akcji pracownika; ewentualne nierozwiązane wyjątki obsługuje wspólny proces E.

### Decyzje

DEC-ESKALACJA
DEC-WPLYW

### Open Mercato

OM-02
OM-04
OM-05
