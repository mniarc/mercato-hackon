import type { DocumentReview } from './document-review'

// Client-facing projections of the supplied 04_przyklad_FLOW v1.1 examples.
// All fixtures are synthetic; publication approval and its destination are demo-only.
// Canonical source IDs, QA, evidence and internal approval records are intentionally omitted.
export const reviewDemoDocuments: DocumentReview[] = [
  {
    "caseId": "demo-flow",
    "version": "1.1",
    "status": "ready_for_review",
    "isCurrent": true,
    "mode": "content",
    "documentId": "demo-brief",
    "versionId": "demo-brief-v1.1",
    "templateId": "WZR-BRIEF",
    "title": "Brief",
    "html": "<style>body{font:16px/1.7 system-ui,sans-serif;color:#17212e;background:#fff;margin:0;padding:32px}main{max-width:860px;margin:auto}h1{font-size:30px;line-height:1.2}h2{font-size:20px;margin-top:28px}p{margin:12px 0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;border:1px solid #dde1e7;padding:10px}th{background:#f5f6f8}.tag{font-size:13px;color:#526071}.post{white-space:pre-wrap}@media(max-width:500px){body{padding:16px}table{font-size:12px}th,td{padding:5px}}</style><main><p class=\"tag\">FLOW · START KOMUNIKACJI · Przykład testowy</p><h1>Brief komunikacji</h1><section><h2>Priorytetowa oferta</h2><p>W tym teście promujemy pomoc firmom w rozpoznaniu problemu biznesowego i przełożeniu go na rozwiązanie cyfrowe. Interesuje nas współpraca od diagnozy po wykonanie albo wybrany etap; nie promujemy teraz szkolenia o AI ani obsługi promocji konsumenckich.</p></section><section><h2>Odbiorcy</h2><p>Główna grupa testowa: właściciele procesów, COO i osoby prowadzące rozwój produktu w istniejących polskich firmach B2B. Sytuacja: wiedzą, że proces wymaga poprawy, ale nie chcą kupować technologii przed rozpoznaniem przyczyny. To przyjęty scenariusz, nie wynik segmentacji rynku.</p></section><section><h2>Cel biznesowy</h2><p>Chcemy, aby odbiorca kojarzył FLOW z dojściem od konkretnego problemu do uzasadnionego rozwiązania. Nie chcemy komunikować wyłącznie liczby usług ani AI jako celu. Horyzont testowego planu: 30 dni; nie deklarujemy celu liczbowego leadów.</p></section><section><h2>Granice obietnic</h2><p>Nie dostarczam do tego testu case study z miernikiem wyniku. Możecie oprzeć się na publicznym opisie sposobu pracy, ale bez procentowych oszczędności, gwarancji czasu, twierdzeń o jedyności, liczby obsłużonych firm oraz przypisywania nam wyników partnerów i MSPF.</p></section><section><h2>Preferencje głosu</h2><p>Ton: konkretny, ciekawy problemu, bez nadęcia, zrozumiały dla biznesu. Wyjaśniamy terminy techniczne. Dopuszczamy lekką metaforę; unikamy agresji, przesadnych emoji i obietnic rewolucji. Nie chcemy brzmieć jak katalog usług ani trener sukcesu.</p></section><section><h2>Kanał i kontakt</h2><p>Docelowa treść testowa: LinkedIn firmy. CTA: rozpoczęcie rozmowy o konkretnej trudności przez istniejący kontakt na makeitflow.pl; bez obietnicy darmowego audytu, konkretnego terminu lub nieistniejącego PDF-a. W tym zadaniu tylko przygotowujemy dokumenty; nie mamy autoryzacji ani skonfigurowanej publikacji.</p></section><section><h2>Miary i ograniczenia</h2><p>Nie mamy w pakiecie danych o obecnej konwersji. Zaproponujcie, jak później sprawdzić, czy odbiorcy rozumieją rolę FLOW i czy pojawiają się rozmowy o właściwych problemach. Nie obiecujcie mierzenia tych wyników w jednorazowym pakiecie.</p></section><section><h2>Otwarte decyzje i materiały</h2><p>Potwierdzenia wymagają priorytet odbiorców, przykłady głosu oraz dokładne brzmienie zaproszenia do kontaktu. Brak materiałów z wynikami, zgód na cytaty klientów i potwierdzonej obsługi kontaktu pozostaje jawnym ograniczeniem. To syntetyczny scenariusz ze specyfikacji; nie stanowi rzeczywistej akceptacji FLOW.</p></section></main>"
  },
  {
    "caseId": "demo-flow",
    "version": "1.1",
    "status": "ready_for_review",
    "isCurrent": true,
    "mode": "content",
    "documentId": "demo-strategy",
    "versionId": "demo-strategy-v1.1",
    "templateId": "WZR-STRATEGIA",
    "title": "Strategia",
    "html": "<style>body{font:16px/1.7 system-ui,sans-serif;color:#17212e;background:#fff;margin:0;padding:32px}main{max-width:860px;margin:auto}h1{font-size:30px;line-height:1.2}h2{font-size:20px;margin-top:28px}p{margin:12px 0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;border:1px solid #dde1e7;padding:10px}th{background:#f5f6f8}.tag{font-size:13px;color:#526071}.post{white-space:pre-wrap}@media(max-width:500px){body{padding:16px}table{font-size:12px}th,td{padding:5px}}</style><main><p class=\"tag\">FLOW · START KOMUNIKACJI · Przykład testowy</p><h1>Strategia komunikacji</h1><section><h2>Rekomendowany kierunek</h2><p>FLOW — partner rozpoznania problemu i realizacji uzasadnionego rozwiązania cyfrowego.</p><p>W 30-dniowym planie pokazujemy, jak przygotować i uzasadnić decyzję o zmianie cyfrowej. Ofertę opisujemy przez pytania, na które pomaga odpowiedzieć, a nie przez katalog kompetencji.</p><p>Właściciele procesów, COO i liderzy rozwoju produktu w istniejących polskich firmach B2B.</p></section><section><h2>Napięcie odbiorcy — hipoteza</h2><p>Uzgodnić, co trzeba zmienić w procesie lub produkcie i jaki zakres pomocy jest potrzebny.</p><p>Niejasna przyczyna trudności oraz obawa przed zamówieniem rozwiązania, zanim zespół ustali problem.</p><p>Hipoteza: zespół może rozbudowywać wymagania, nie wiedząc, czy odpowiadają właściwej potrzebie. Nie znamy kosztu ani częstości tego problemu.</p></section><section><h2>Propozycja wartości</h2><p>Masz problem w procesie, ale nie masz jeszcze specyfikacji rozwiązania? FLOW pomaga go rozpoznać i przejść do projektu lub wdrożenia — także wspólnie z Twoim zespołem przy wybranym etapie.</p><ul><li>Wartością proponowaną w komunikacji jest dojście od niejasnego problemu do uzasadnionej decyzji o rozwiązaniu.</li><li>Uzasadnienie stanowi deklarowane rozpoznanie potrzeb użytkowników, celu biznesowego, organizacji pracy i możliwości technicznych oraz połączenie badań, projektu i wykonania.</li><li>Rozmowę można zacząć bez specyfikacji, a wsparcie uzgodnić dla całego cyklu albo wybranego etapu wspólnie z zespołem klienta.</li><li>Jeżeli obecny dostawca ma kompetencje i zasoby do rozpoznania problemu, nowy partner nie jest automatycznie potrzebny: rozmowa z FLOW ma sens jako uzgodnienie brakującego etapu.</li><li>To proponowana logika dopasowania, nie zweryfikowany powód wygranych ofert; pakiet potwierdza deklarowane podejście, bez pomiaru skuteczności lub dowodu wyłączności.</li></ul></section><section><h2>Hierarchia przekazu</h2><p>Pomoc w przejściu od konkretnego problemu do uzasadnionego rozwiązania cyfrowego.</p><ul><li>Najpierw rozpoznaj potrzeby, cel biznesowy, organizację pracy i możliwości techniczne.</li><li>Zacznij od problemu; gotowa specyfikacja nie jest warunkiem rozmowy. Wybierz pomoc w potrzebnym etapie.</li><li>Dobieraj technologię do uzasadnionego celu; AI jest jedną z możliwości.</li></ul></section><section><h2>Filary tematyczne</h2><h3>Rozpoznaj, co wymaga zmiany</h3><p>Zbudować skojarzenie FLOW z rozumieniem problemu przed wyborem rozwiązania.</p><p>Co właściwie chcemy zmienić?</p><h3>Sprawdź podstawy decyzji</h3><p>Pokazać różnicę między pomysłem, uzasadnieniem i potwierdzonym wynikiem.</p><p>Na jakiej podstawie wybieramy to rozwiązanie?</p><h3>Uzgodnij właściwy zakres pomocy</h3><p>Wyjaśnić miejsce FLOW przy istniejącym zespole i etapach projektu.</p><p>Kogo potrzebujemy do tego etapu i co trzeba ustalić?</p><h3>Zacznij od konkretnej trudności</h3><p>Ułatwić rozpoczęcie rozmowy bez tworzenia niepotwierdzonej oferty.</p><p>Co przygotować i jak się odezwać?</p></section><section><h2>Rola kanału</h2><p>LinkedIn firmy FLOW</p><p>Pomóc odbiorcy rozpoznać własną sytuację i nazwać problem, z którym warto rozpocząć rozmowę.</p><p>12 tematów tekstowych i jeden gotowy post po odrębnej pracy copywriterskiej.</p></section><section><h2>Hipoteza pomiarowa</h2><p>Po kontakcie z treścią odbiorca opisuje rolę FLOW przez problem i uzasadnienie rozwiązania, a nie samą nazwę technologii.</p><p>Właściciel komunikacji może po rzeczywistym wdrożeniu zebrać te sygnały i porównać kolejne okresy przy opisanych warunkach. To propozycja przyszłego testu; w pakiecie nie prowadzimy analityki.</p></section><section><h2>Granice komunikacji</h2><ul><li>Jedyność połączenia research + UX + development.</li><li>Gwarancja oszczędności, sprzedaży, leadów lub czasu.</li><li>2500 PLN jako cena FLOW.</li><li>Rezultaty partnerów/MSPF jako wyniki FLOW.</li><li>Autorska checklista jako zatwierdzona metoda lub płatny produkt FLOW.</li><li>Hipotetyczny scenariusz jako historia klienta.</li></ul></section></main>"
  },
  {
    "caseId": "demo-flow",
    "version": "1.1",
    "status": "ready_for_review",
    "isCurrent": true,
    "mode": "content",
    "documentId": "demo-tov",
    "versionId": "demo-tov-v1.1",
    "templateId": "WZR-TOV",
    "title": "Tone of Voice",
    "html": "<style>body{font:16px/1.7 system-ui,sans-serif;color:#17212e;background:#fff;margin:0;padding:32px}main{max-width:860px;margin:auto}h1{font-size:30px;line-height:1.2}h2{font-size:20px;margin-top:28px}p{margin:12px 0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;border:1px solid #dde1e7;padding:10px}th{background:#f5f6f8}.tag{font-size:13px;color:#526071}.post{white-space:pre-wrap}@media(max-width:500px){body{padding:16px}table{font-size:12px}th,td{padding:5px}}</style><main><p class=\"tag\">FLOW · START KOMUNIKACJI · Przykład testowy</p><h1>Tone of Voice</h1><section><h2>Cztery zasady głosu</h2><h3>Zaczynamy od trudności.</h3><p>Pomagamy liderowi nazwać decyzję.</p><p>Otwieraj konkretną sytuacją, napięciem lub pytaniem o decyzję; dobieraj formę do treści. Nie wszystkie wpisy mają mieć schemat pytanie + checklista + kontakt.</p><h3>Prowadzimy spokojną rozmowę.</h3><p>Ułatwiamy rozmowę także bez specyfikacji.</p><p>Używaj „sprawdźmy”, nazywaj niewiadome, proponuj jeden następny krok.</p><h3>Tłumaczymy zależności.</h3><p>Łączymy perspektywę użytkownika, biznesu, organizacji i technologii.</p><p>Przy terminie wyjaśnij, jaką czynność oznacza i do jakiego pytania prowadzi.</p><h3>Twierdzimy tyle, ile wiemy.</h3><p>Dajemy podstawę do uzasadnionej decyzji.</p><p>Oddzielaj opis pracy od wyniku; przy AI nazywaj potrzebę uzasadnienia biznesowego.</p></section><section><h2>Parametry stylu</h2><ul><li>Formalność: Partnersko, pełnymi zdaniami, bez urzędowego tonu. „Zacznijmy od celu projektu”.</li><li>Bezpośredniość: Jedno pytanie lub działanie naraz; bez presji. „Którą decyzję chcesz podjąć?”.</li><li>Techniczność: Termin dopiero po wyjaśnieniu znaczenia. „Rozpoznanie problemu, czyli discovery”.</li><li>Humor: Lekka metafora, jeśli objaśnia. „Specyfikacja nie jest biletem wstępu do projektu”.</li><li>Siła twierdzeń: Stanowczo o deklarowanej zasadzie, ostrożnie o efekcie. „AI wdrażamy przy uzasadnieniu biznesowym”.</li></ul></section><section><h2>Zamiast / używaj</h2><table><thead><tr><th>Zamiast</th><th>Używaj</th></tr></thead><tbody><tr><td>dokonać identyfikacji potrzeb</td><td>rozpoznać potrzeby</td></tr><tr><td>przeprowadzić implementację</td><td>wdrożyć</td></tr><tr><td>w ramach procesu discovery</td><td>podczas rozpoznawania problemu</td></tr><tr><td>zwalidować hipotezę</td><td>sprawdzić założenie</td></tr><tr><td>wygenerować insight</td><td>sformułować wniosek</td></tr><tr><td>w zakresie całego lifecycle produktu</td><td>w całym cyklu produktu</td></tr></tbody></table></section><section><h2>Trzy przykłady</h2><p>Punktem wyjścia projektu jest uwzględnienie potrzeb użytkowników, celu biznesowego, organizacji pracy oraz możliwości technicznych.</p><blockquote>Zaczynamy od potrzeb użytkowników, celu biznesowego, organizacji pracy i możliwości technicznych.</blockquote><p>Posiadanie specyfikacji nie stanowi warunku rozpoczęcia współpracy. Istniejąca specyfikacja podlega weryfikacji względem potrzeb i ograniczeń.</p><blockquote>Możesz zacząć współpracę bez specyfikacji. Jeśli już ją masz, sprawdzimy ją względem potrzeb i ograniczeń.</blockquote><p>Implementacja AI następuje wyłącznie w przypadku występowania uzasadnienia biznesowego. Oferta obejmuje również rozwiązania niewykorzystujące AI.</p><blockquote>AI wdrażamy tylko wtedy, gdy ma uzasadnienie biznesowe. Tworzymy też rozwiązania bez AI.</blockquote></section><section><h2>Kontrola tekstu</h2><ul><li>Czy otwarcie nazywa problem lub decyzję odbiorcy?</li><li>Czy każdemu twierdzeniu przypisano źródło albo jawny status propozycji?</li><li>Czy przykład wymyślony jest oznaczony przed jego opisem?</li><li>Czy terminy potrzebne w tekście zostały wyjaśnione?</li><li>Czy opis metody zachowuje granice dowodu, bez gwarancji wyniku?</li><li>Czy wzmianka o AI wiąże jego zastosowanie z uzasadnieniem biznesowym lub AI nie występuje?</li><li>Czy zaproszenie prowadzi do istniejącego kontaktu bez dodatkowych obietnic lub CTA nie występuje?</li><li>Czy usunięto presję, klisze, zbędne wykrzykniki i emoji?</li></ul></section></main>"
  },
  {
    "caseId": "demo-flow",
    "version": "1.1",
    "status": "ready_for_review",
    "isCurrent": true,
    "mode": "topic_choice",
    "documentId": "demo-plan",
    "versionId": "demo-plan-v1.1",
    "templateId": "WZR-PLAN",
    "title": "Plan treści",
    "html": "<style>body{font:16px/1.7 system-ui,sans-serif;color:#17212e;background:#fff;margin:0;padding:32px}main{max-width:860px;margin:auto}h1{font-size:30px;line-height:1.2}h2{font-size:20px;margin-top:28px}p{margin:12px 0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;border:1px solid #dde1e7;padding:10px}th{background:#f5f6f8}.tag{font-size:13px;color:#526071}.post{white-space:pre-wrap}@media(max-width:500px){body{padding:16px}table{font-size:12px}th,td{padding:5px}}</style><main><p class=\"tag\">FLOW · START KOMUNIKACJI · Przykład testowy</p><h1>Plan treści na 30 dni</h1><p>12 tematów w jednym kanale: LinkedIn firmy FLOW. Pakiet obejmuje przygotowanie jednego gotowego posta. Wybierz poniżej jeden temat do realizacji.</p><table><thead><tr><th>Dzień</th><th>Filar</th><th>Temat</th><th>Ujęcie i wartość</th><th>Cel / CTA</th></tr></thead><tbody><tr><td>1</td><td>Rozpoznaj, co wymaga zmiany</td><td>Problem przed narzędziem</td><td>Przed wyborem technologii opisz sytuację, użytkownika, cel i ograniczenia.</td><td>Zapisz odpowiedzi na cztery pytania; jeśli chcesz omówić trudność, skorzystaj z kontaktu na stronie FLOW.</td></tr><tr><td>3</td><td>Zacznij od konkretnej trudności</td><td>Pierwsza rozmowa bez gotowego briefu</td><td>Do pierwszej rozmowy przygotuj opis jednej sytuacji: co zaobserwowano i czego nadal nie wiadomo.</td><td>Opisz jedną sytuację i dopisz jedną niewiadomą.</td></tr><tr><td>6</td><td>Sprawdź podstawy decyzji</td><td>Jedno wymaganie pod lupą</td><td>Połącz wymaganie z potrzebą, ograniczeniem i założeniem do sprawdzenia.</td><td>Dopisz do jednego wymagania potrzebę, którą ma obsłużyć.</td></tr><tr><td>8</td><td>Uzgodnij właściwy zakres pomocy</td><td>Kto odpowiada za brakującą decyzję?</td><td>Rozrysuj odpowiedzialność za pytania, decyzję i wdrożenie oraz przekazanie między nimi.</td><td>Zapisz obok decyzji trzy role i to, co muszą sobie przekazać.</td></tr><tr><td>11</td><td>Sprawdź podstawy decyzji</td><td>Krótka notatka przed decyzją o AI</td><td>Zestaw pomysł użycia AI z celem i wariantem bez AI, zanim wybierzesz.</td><td>Zapisz zadanie i porównaj dwa podejścia bez przesądzania wyniku.</td></tr><tr><td>13</td><td>Rozpoznaj, co wymaga zmiany</td><td>Dwa zdania, jeden projekt</td><td>Osobno nazwij cel organizacji i to, co użytkownik próbuje zrobić.</td><td>Dokończ oba zdania i zaznacz punkt wspólny.</td></tr><tr><td>16</td><td>Rozpoznaj, co wymaga zmiany</td><td>Zanim zmienisz ekran, zobacz przekazanie zadania</td><td>Mapa jednego przekazania pomaga sformułować pytania o organizację pracy.</td><td>Wybierz jedno przekazanie i wypisz potrzebne informacje.</td></tr><tr><td>18</td><td>Sprawdź podstawy decyzji</td><td>Co musiałoby zmienić Twój plan?</td><td>Wybierz jedno założenie i zapisz, jaka odpowiedź zmieni dalszy kierunek.</td><td>Zapisz odpowiedź, po której zmienisz decyzję.</td></tr><tr><td>21</td><td>Uzgodnij właściwy zakres pomocy</td><td>Dobierz zakres do tego, co już masz</td><td>Zestaw to, co już rozpoznano, zaprojektowano i wykonano, z luką wymagającą pomocy.</td><td>Zaznacz brakujący etap lub potrzebę przejścia przez cały cykl.</td></tr><tr><td>23</td><td>Uzgodnij właściwy zakres pomocy</td><td>Przed wyceną: co wiemy, a czego nie?</td><td>Przed rozmową o wycenie rozdziel ustalony zakres od elementów wymagających doprecyzowania.</td><td>Wypełnij dwie kolumny: znany zakres i otwarte elementy.</td></tr><tr><td>26</td><td>Sprawdź podstawy decyzji</td><td>Wykonane nie znaczy jeszcze zmierzone</td><td>Oddziel sytuację, działanie i obserwację wyniku.</td><td>W notatce o projekcie rozdziel działanie i zaobserwowaną zmianę.</td></tr><tr><td>30</td><td>Zacznij od konkretnej trudności</td><td>Trzy zdania na początek rozmowy</td><td>Pierwszą wiadomość można złożyć z objawu, oczekiwanej zmiany i pytania do rozmowy.</td><td>Uzupełnij trzy zdania i wyślij wiadomość przez kontakt na stronie FLOW.</td></tr></tbody></table><section><h2>Rekomendacja</h2><p>Problem przed narzędziem</p><p>Najczytelniej uruchamia pozycjonowanie: daje odbiorcy cztery praktyczne pytania i przedstawia metodę bez nieudowodnionych rezultatów.</p></section></main>",
    "topics": [
      {
        "id": "TOP-01",
        "title": "Problem przed narzędziem",
        "readiness": "ready"
      },
      {
        "id": "TOP-02",
        "title": "Pierwsza rozmowa bez gotowego briefu",
        "readiness": "ready"
      },
      {
        "id": "TOP-03",
        "title": "Jedno wymaganie pod lupą",
        "readiness": "ready"
      },
      {
        "id": "TOP-04",
        "title": "Kto odpowiada za brakującą decyzję?",
        "readiness": "ready"
      },
      {
        "id": "TOP-05",
        "title": "Krótka notatka przed decyzją o AI",
        "readiness": "ready"
      },
      {
        "id": "TOP-06",
        "title": "Dwa zdania, jeden projekt",
        "readiness": "ready"
      },
      {
        "id": "TOP-07",
        "title": "Zanim zmienisz ekran, zobacz przekazanie zadania",
        "readiness": "ready"
      },
      {
        "id": "TOP-08",
        "title": "Co musiałoby zmienić Twój plan?",
        "readiness": "ready"
      },
      {
        "id": "TOP-09",
        "title": "Dobierz zakres do tego, co już masz",
        "readiness": "ready"
      },
      {
        "id": "TOP-10",
        "title": "Przed wyceną: co wiemy, a czego nie?",
        "readiness": "ready"
      },
      {
        "id": "TOP-11",
        "title": "Wykonane nie znaczy jeszcze zmierzone",
        "readiness": "ready"
      },
      {
        "id": "TOP-12",
        "title": "Trzy zdania na początek rozmowy",
        "readiness": "ready"
      }
    ]
  },
  {
    "caseId": "demo-flow",
    "version": "1.1",
    "status": "ready_for_review",
    "isCurrent": true,
    "mode": "content",
    "documentId": "demo-post",
    "versionId": "demo-post-v1.1",
    "templateId": "WZR-POST",
    "title": "Post",
    "html": "<style>body{font:16px/1.7 system-ui,sans-serif;color:#17212e;background:#fff;margin:0;padding:32px}main{max-width:860px;margin:auto}h1{font-size:30px;line-height:1.2}h2{font-size:20px;margin-top:28px}p{margin:12px 0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;border:1px solid #dde1e7;padding:10px}th{background:#f5f6f8}.tag{font-size:13px;color:#526071}.post{white-space:pre-wrap}@media(max-width:500px){body{padding:16px}table{font-size:12px}th,td{padding:5px}}</style><main><p class=\"tag\">FLOW · START KOMUNIKACJI · Przykład testowy</p><h1>Post do akceptacji</h1><p>Kanał: LinkedIn firmy FLOW</p><div class=\"post\">Chcesz nowego narzędzia do obsługi zamówień. Od czego zacząć?\n\nWyobraźmy sobie firmę, w której jedno z zamówień utknęło w procesie. Zespół rozważa nową aplikację, ale nie wie jeszcze, gdzie pojawia się trudność. Zanim opisze funkcje, warto nazwać problem.\n\nProponujemy cztery pytania:\n\n1. Jaką konkretną sytuację chcesz zmienić?\n2. Kto korzysta z tego procesu lub produktu i co próbuje zrobić?\n3. Jakiej zmiany biznesowej oczekujesz?\n4. Jakie ograniczenia organizacji pracy i technologii trzeba uwzględnić?\n\nZapisz odpowiedzi obok siebie. Jeśli czegoś jeszcze nie wiesz, oznacz to jako pytanie do sprawdzenia.\n\nW FLOW zaczynamy od potrzeb użytkowników, celu biznesowego, organizacji pracy i możliwości technicznych. Z tej perspektywy rozmawiamy o wyborze rozwiązania. Sztuczną inteligencję (AI) wdrażamy tylko wtedy, gdy ma uzasadnienie biznesowe. Tworzymy też rozwiązania bez AI.\n\nMasz konkretną trudność w procesie lub produkcie? Opisz ją nam — kontakt znajdziesz na https://makeitflow.pl/index.php</div><section><h2>Notatka</h2><p>Cztery pytania są propozycją do tego postu, a sytuacja z zamówieniem jest hipotetyczna. Do decyzji pozostają brzmienie głosu firmy i zaproszenia do kontaktu. Przegląd redakcyjny nie jest akceptacją FLOW ani zgodą na publikację.</p></section></main>"
  },
  {
    "caseId": "demo-flow",
    "version": "1.1",
    "status": "ready_for_review",
    "isCurrent": true,
    "mode": "publication",
    "documentId": "demo-post",
    "versionId": "demo-post-v1.1",
    "templateId": "WZR-POST",
    "title": "Zgoda na publikację",
    "html": "<style>body{font:16px/1.7 system-ui,sans-serif;color:#17212e;background:#fff;margin:0;padding:32px}main{max-width:860px;margin:auto}h1{font-size:30px;line-height:1.2}h2{font-size:20px;margin-top:28px}p{margin:12px 0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;border:1px solid #dde1e7;padding:10px}th{background:#f5f6f8}.tag{font-size:13px;color:#526071}.post{white-space:pre-wrap}@media(max-width:500px){body{padding:16px}table{font-size:12px}th,td{padding:5px}}</style><main><p class=\"tag\">FLOW · START KOMUNIKACJI · Przykład testowy</p><h1>Zgoda na publikację</h1><p>Miejsce testowe: LinkedIn · FLOW — profil demonstracyjny (bez połączenia z platformą).</p><p>Ta decyzja dotyczy wyłącznie poniższej wersji tekstu i wskazanego miejsca. W demonstracji nic nie zostanie opublikowane.</p><div class=\"post\">Chcesz nowego narzędzia do obsługi zamówień. Od czego zacząć?\n\nWyobraźmy sobie firmę, w której jedno z zamówień utknęło w procesie. Zespół rozważa nową aplikację, ale nie wie jeszcze, gdzie pojawia się trudność. Zanim opisze funkcje, warto nazwać problem.\n\nProponujemy cztery pytania:\n\n1. Jaką konkretną sytuację chcesz zmienić?\n2. Kto korzysta z tego procesu lub produktu i co próbuje zrobić?\n3. Jakiej zmiany biznesowej oczekujesz?\n4. Jakie ograniczenia organizacji pracy i technologii trzeba uwzględnić?\n\nZapisz odpowiedzi obok siebie. Jeśli czegoś jeszcze nie wiesz, oznacz to jako pytanie do sprawdzenia.\n\nW FLOW zaczynamy od potrzeb użytkowników, celu biznesowego, organizacji pracy i możliwości technicznych. Z tej perspektywy rozmawiamy o wyborze rozwiązania. Sztuczną inteligencję (AI) wdrażamy tylko wtedy, gdy ma uzasadnienie biznesowe. Tworzymy też rozwiązania bez AI.\n\nMasz konkretną trudność w procesie lub produkcie? Opisz ją nam — kontakt znajdziesz na https://makeitflow.pl/index.php</div></main>",
    "contentApproved": true,
    "target": {
      "id": "demo-linkedin",
      "ref": "demo-flow-profile",
      "label": "FLOW — profil demonstracyjny",
      "platform": "LinkedIn"
    }
  }
]

