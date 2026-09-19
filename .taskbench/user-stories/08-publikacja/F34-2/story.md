---
id: F34-2
kind: user-story
category: "8. Publikacja"
feature: F34
criteria_count: 5
status: partial
primary_blocker: decision
---


# F34-2 · Uruchomienie publikacji i konfiguracja celu

## User story

Źródło merytoryczne: AI_Company_Open_Mercato_Proces_v2.xlsx. Sposób opisu: riscore V2. Status oznacza ustalenie zakresu, a nie wdrożenie.

### ID funkcji

F34

### Grupa

8. Publikacja

### Status ustalenia

Propozycja procesu 8–9

### Nazwa funkcjonalności

Uruchomienie publikacji i konfiguracja celu

### Definicja

Proponowany etap publikacji aktywuje jeden zestaw zadań dla przekazanego postu i sprawdza konkretne konto lub kanał oraz uprawnienia integracji. Metadane celu i referencja integracji są zapisane bez sekretów; braki wracają do klienta przez wspólną obsługę G.

### Krok procesu

8.2

### ID historii

F34-2

### User story

Jako klient chcę wskazać dokładne konto lub kanał i zapewnić dostęp do publikacji, żeby post trafił w uzgodnione miejsce.

### Kryteria akceptacji

→ See individual AC files in this directory.

### Podstawa ustalenia

Konfiguracja przechowuje metadane bez sekretów i rozróżnia brak informacji od awarii. Zasady produktu: Kanał demo; Demo: D-05; Dokumenty: WZR-KONFIG-PUBLIKACJI. Źródło: arkusz Proces, kroki 8.2.


## Relationships and actors

Role wykonawcze pochodzą z procesu v2. Poprzedniki wskazują powiązane scenariusze; alternatyw nie wykonujemy łącznie. Warunki określają kryteria historii.

### ID historii

F34-2

### Kroki procesu

8.2 — Sprawdzenie konkretnego miejsca publikacji i dostępu

### Dział odpowiedzialny

Publikacja i integracje

### Wykonawcy po stronie firmy

System integracji; agent obsługi zgłoszeń przez wspólny proces G (8.2)

### Powiązane wcześniejsze historie / kroki

F34-1 — Uruchomienie publikacji i konfiguracja celu

### Dokumenty i zdarzenia

Katalog produktów, cen i granic usługi — STD-OFERTA
Sprawa wymagająca rozstrzygnięcia pracownika — WEW-ESKALACJA
Konfiguracja konta lub kanału publikacji — WEW-KONFIG-PUBLIKACJI
Zgłoszenie klienta powiązane z kontaktem lub zamówieniem — WEW-ZGLOSZENIE
Instrukcja obsługi publikacji zaakceptowanego postu — WEW-ZLECENIE-PUBLIKACJI
Wzorzec konfiguracji miejsca publikacji — WZR-KONFIG-PUBLIKACJI

### Udział klienta

Wskazuje lub koryguje konkretne miejsce i zapewnia wymagany dostęp; odpowiada przez G.

### Interwencja pracownika

Usuwa trwały problem integracji wyłącznie w obsłudze E; nie wybiera sam innego kanału publikacji.

### Decyzje

DEC-ESKALACJA
DEC-PUBLIKACJA

### Open Mercato

OM-02
OM-04
OM-05
OM-06
