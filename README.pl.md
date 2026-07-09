[English](README.md) | [Polski](README.pl.md)

# BottleSim

BottleSim to symulator optyki geometrycznej 2D, który śledzi bieg promieni świetlnych przez okrągły przekrój butelki, z opcjonalną okrągłą soczewką umieszczoną w dowolnym miejscu sceny. To aplikacja webowa oparta na Flasku: backend w Pythonie/NumPy wykonuje obliczenia śledzenia promieni, a frontend w czystym JavaScripcie rysuje scenę na elemencie canvas i pozwala nią sterować na żywo.

## Wersja demo

https://bkluj.github.io/BottleSim/

> Uwaga: to repozytorium zawiera obecnie aplikację Flask renderowaną po stronie serwera. GitHub Pages hostuje wyłącznie pliki statyczne, więc uruchomienie tam BottleSim wymagałoby albo statycznego eksportu frontendu, albo hostowania backendu Flask gdzie indziej — zobacz sekcję „Wdrożenie na GitHub Pages” poniżej.

## Główne funkcje

- Źródło światła równoległe („słońce”) lub punktowe („lampa”), przełączane w locie
- Źródło punktowe można przeciągać bezpośrednio na scenie albo ustawiać liczbowo (w mm)
- Tryb stałego kąta wiązki albo tryb „celuj w środek butelki” z regulowanym odchyleniem
- Regulowany kąt rozwarcia wiązki (źródło punktowe) oraz gęstość/liczba promieni
- Konfigurowalna geometria butelki: promień zewnętrzny i grubość ścianki
- Konfigurowalne współczynniki załamania: otoczenia, szkła i wnętrza butelki
- Opcjonalna okrągła soczewka: pozycja (X/Y), średnica i współczynnik załamania — wszystko w milimetrach, przeciągana na scenie
- Kolejność przecięć promienia z soczewką i butelką jest wyznaczana geometrycznie (wygrywa najbliższe trafienie), więc promień może najpierw trafić w soczewkę, najpierw w butelkę, albo ominąć jedno z nich
- Przełączalna nakładka promieni odbitych (linia przerywana) obok głównych promieni transmitowanych
- Siatka pomiarowa w milimetrach (poziomy co 10 mm / 50 mm / 100 mm) z opisami osi
- Opcjonalna nakładka wymiarów technicznych (średnice butelki/soczewki, odległości źródło–soczewka–butelka, kąt wiązki i jej rozwarcie)
- W pełni konfigurowalne kolory (butelka, soczewka, promienie padające, promienie załamane, promienie odbite, kratka), zapamiętywane w przeglądarce, z przyciskiem przywracania domyślnych
- Zwijany górny pasek ustawień (HUD), który oddaje odzyskaną przestrzeń scenie bez resetowania jakichkolwiek wartości
- Zwijany panel informacyjny sceny (tylko do odczytu), pokazujący na żywo wartości butelki/soczewki/źródła/wiązki oraz wyliczone odległości i kąty
- Przybliżanie widoku scrollem myszy i przesuwanie widoku przeciągnięciem, niezależne od skali świata
- Eksport SVG oraz widok wydruku w rzeczywistej skali 1:1 (albo 1:2 / 2:1), z wyborem formatu strony, orientacji, punktu odniesienia, wzorcem kontrolnym 100 mm oraz trybem awaryjnym dla sceny większej niż strona

## Jak działa symulator

Przeglądarka wysyła bieżące wartości formularza do `POST /api/simulate`. Backend Flask (`app.py`) buduje obiekt `Bottle` oraz, jeśli jest włączona, soczewkę `Lens` (`simulation.py`), śledzi każdy promień z użyciem NumPy i zwraca jego ścieżkę jako łamaną wraz z flagami całkowitego wewnętrznego odbicia. Frontend (`static/js/app.js`) rysuje otrzymane promienie, butelkę, soczewkę, siatkę i wszystkie nakładki na elemencie `<canvas>`, i ponownie odpytuje backend za każdym razem, gdy zmieni się parametr fizyczny (z opóźnieniem/debounce). Zmiany czysto wizualne — kolory, zoom, przesunięcie widoku, zwinięcie HUD-u, nakładka wymiarów, przełącznik kratki — nigdy nie wywołują nowego zapytania; jedynie przerysowują ostatnio otrzymany wynik.

## Instalacja

```bash
git clone https://github.com/bkluj/BottleSim.git
cd BottleSim
python -m venv .venv
.venv\Scripts\activate   # Windows; na macOS/Linux użyj `source .venv/bin/activate`
pip install -r requirements.txt
```

## Uruchomienie deweloperskie

```bash
python app.py
```

Uruchamia to serwer deweloperski Flaska (`debug=True`) pod adresem `http://127.0.0.1:5000/`. Zmiany w `static/js/app.js`, `static/css/style.css` czy `templates/index.html` są widoczne po odświeżeniu strony — mechanizm przeładowania Flaska sam restartuje serwer, gdy zmienią się pliki Python.

Jest też niewielki CLI oparty na Matplotlib, `main.py`, który renderuje pojedynczy przebieg wiązki równoległej przez butelkę (bez obsługi soczewki) do okna lub zapisanego obrazu — przydatny do szybkiej, lekkiej weryfikacji logiki śledzenia promieni:

```bash
python main.py
```

## Build produkcyjny

Repozytorium nie zawiera konfiguracji produkcyjnego serwera WSGI. `app.run(debug=True)` w `app.py` uruchamia wbudowany serwer deweloperski Flaska, który sam Flask oznacza jako nieprzeznaczony do produkcji. Aby wdrożyć aplikację, należy uruchomić istniejący obiekt `app` za standardowym produkcyjnym serwerem WSGI (np. Gunicorn albo Waitress) zamiast wywoływać `app.run()` bezpośrednio — taki serwer nie jest obecnie wymieniony w `requirements.txt`.

## Wdrożenie na GitHub Pages

GitHub Pages hostuje wyłącznie pliki statyczne i nie jest w stanie uruchomić backendu Flask, który wykonuje obliczenia śledzenia promieni. To repozytorium nie zawiera obecnie pipeline'u wdrożeniowego w `.github/workflows`. Aby opublikować BottleSim na GitHub Pages, trzeba by albo wyeksportować statyczną wersję frontendu działającą na ustalonym zestawie danych, albo hostować aplikację Flask osobno i wykorzystać Pages tylko do zasobów statycznych.

## Użycie

1. Wybierz źródło światła: **Równoległa** („słońce”) albo **Punktowe** („lampa”) w sekcji „Źródło światła”.
2. Dla źródła punktowego ustaw jego pozycję X/Y (mm) albo przeciągnij je bezpośrednio na scenie; opcjonalnie powiąż jego kierunek ze środkiem butelki wraz z odchyleniem.
3. Dostosuj wiązkę w sekcji „Wiązka”: liczbę/gęstość promieni, stały kąt albo odchylenie od środka, a dla źródła punktowego — kąt rozwarcia.
4. Ustaw promień zewnętrzny butelki, grubość ścianki oraz trzy współczynniki załamania (otoczenie / szkło / wnętrze).
5. Włącz soczewkę („Pokaż soczewkę”) i ustaw jej pozycję X/Y, średnicę i współczynnik załamania — albo przeciągnij jej środek na scenie.
6. Przełącz kratkę, nakładkę wymiarów i nakładkę promieni odbitych w sekcji „Widok”; dostosuj kolory w zwijanej sekcji „Kolory”.
7. Przewiń scrollem, by przybliżyć widok, i przeciągnij pusty obszar sceny, by go przesunąć; użyj „Ukryj ustawienia”, by zwinąć HUD i odzyskać wysokość sceny.
8. Użyj „Eksport / wydruk 1:1”, by wyeksportować SVG w rzeczywistej skali fizycznej albo otworzyć widok wydruku.

## Podstawy fizyczne

### Optyka geometryczna

BottleSim modeluje światło jako pojedyncze promienie poruszające się po liniach prostych, które zmieniają kierunek wyłącznie na granicach ośrodków. To przybliżenie optyki geometrycznej: zjawiska falowe, takie jak dyfrakcja, interferencja i polaryzacja, nie są symulowane.

### Prawo odbicia

$$\theta_i = \theta_r$$

Kąt padania i kąt odbicia są mierzone względem normalnej do powierzchni. Kierunek odbity jest wyliczany wektorowo jako:

$$\mathbf{r} = \mathbf{d} - 2(\mathbf{d}\cdot\mathbf{n})\mathbf{n}$$

gdzie **d** to kierunek padającego promienia, **n** to (jednostkowa) normalna powierzchni, a **r** to kierunek odbity. Jest to zaimplementowane wprost w funkcji `reflect()` w `simulation.py` i wykorzystywane do rysowania przerywanej nakładki promieni odbitych na każdej granicy napotkanej przez promień.

### Prawo Snelliusa

$$n_1 \sin(\theta_1) = n_2 \sin(\theta_2)$$

`n_1` i `n_2` to współczynniki załamania po obu stronach granicy, a `θ_1`/`θ_2` to kąty padania i załamania, oba mierzone od normalnej. Promień ugina się w stronę normalnej przy wejściu w ośrodek gęstszy optycznie (`n_2 > n_1`) i odgina się od normalnej przy wejściu w ośrodek rzadszy. Jest to zaimplementowane w funkcji `refract()` w `simulation.py` przy użyciu standardowej wektorowej postaci prawa Snelliusa.

### Całkowite wewnętrzne odbicie

$$\theta_c = \arcsin\left(\frac{n_2}{n_1}\right), \quad n_1 > n_2$$

Gdy światło przechodzi z ośrodka gęstszego optycznie (`n_1`) do rzadszego (`n_2`) pod kątem większym niż kąt krytyczny `θ_c`, promień załamany nie istnieje — całe światło ulega odbiciu. W funkcji `refract()` jest to wykrywane, gdy wyrażenie pod pierwiastkiem staje się ujemne; funkcja zwraca wtedy `None`, `trace_ray()` oznacza promień jako podlegający całkowitemu wewnętrznemu odbiciu, a główna ścieżka promienia kończy się w tym punkcie (dalej istnieje wyłącznie nakładka odbicia).

### Przecięcie promienia z okręgiem

Promień jest parametryzowany jako:

$$\mathbf{p}(t) = \mathbf{o} + t\mathbf{d}$$

gdzie **o** to punkt początkowy promienia, **d** to jego (jednostkowy) kierunek, a `t ≥ 0`. Przecięcie go z okręgiem o środku **c** i promieniu `R` sprowadza się do rozwiązania równania:

$$\left\|\mathbf{o} + t\mathbf{d} - \mathbf{c}\right\|^2 = R^2$$

które po rozwinięciu daje równanie kwadratowe względem `t`. Funkcja `ray_circle_intersection()` rozwiązuje to równanie i wybiera najmniejszy ściśle dodatni pierwiastek (`t > EPS`), czyli najbliższe przecięcie leżące przed promieniem — dzięki temu mechanizm śledzenia może wybrać, którą powierzchnię (butelki czy soczewki) promień napotka jako pierwszą, bez zakładania z góry ich kolejności.

### Normalna powierzchni okręgu

$$\mathbf{n} = \frac{\mathbf{p}_{hit} - \mathbf{c}}{\left\|\mathbf{p}_{hit} - \mathbf{c}\right\|}$$

Normalna skierowana na zewnątrz w punkcie trafienia to po prostu kierunek od środka okręgu **c** do punktu trafienia **p**_hit. Ponieważ ten sam wzór daje normalną skierowaną na zewnątrz niezależnie od tego, czy promień wchodzi, czy wychodzi z ośrodka, `trace_ray()` odwraca jej znak za każdym razem, gdy wskazuje w tę samą stronę co promień padający — tak, by zawsze była zwrócona w stronę promienia padającego przed obliczeniem załamania/odbicia.

### Model butelki

Butelka (`Bottle` w `simulation.py`) jest modelowana jako dwa współśrodkowe okręgi o wspólnym środku:

- **granica zewnętrzna** — promień `outer_radius_mm`, oddzielająca ośrodek zewnętrzny (`n_outside`) od ścianki butelki (`n_glass`)
- **granica wewnętrzna** — promień `outer_radius_mm - wall_thickness_mm`, oddzielająca ściankę (`n_glass`) od wnętrza butelki (`n_inside`)

Promień przechodzący przez całą butelkę napotyka więc kolejno cztery granice:

```
powietrze (n_outside) → szkło (n_glass) → wnętrze (n_inside) → szkło (n_glass) → powietrze (n_outside)
```

Na każdej granicy stosowane jest prawo Snelliusa (albo zachodzi całkowite wewnętrzne odbicie); `n_inside` może reprezentować zarówno ciecz, jak i powietrze, w zależności od ustawionej wartości.

### Okrągła soczewka

Opcjonalna soczewka (`Lens` w `simulation.py`) to drugi, niezależny okrąg: jednorodny, okrągły ośrodek refrakcyjny o własnym środku, średnicy i współczynniku załamania, umieszczony w dowolnym miejscu sceny (niekoniecznie stykający się z butelką). Śledzenie promienia przez nią przebiega tak samo jak dla dowolnej granicy okrągłej:

1. znalezienie przecięcia promienia z okręgiem soczewki,
2. załamanie przy wejściu (współczynnik otoczenia → współczynnik soczewki),
3. propagacja promienia po linii prostej wewnątrz soczewki,
4. znalezienie drugiego przecięcia (punktu wyjścia),
5. załamanie przy wyjściu (współczynnik soczewki → współczynnik otoczenia), albo odbicie wewnętrzne, jeśli kąt przekracza kąt krytyczny.

To rzeczywiste geometryczne śledzenie promieni przez obszar okrągły — nie przybliżenie cienkiej soczewki (`1/f = 1/p + 1/q`). Na każdym kroku `trace_ray()` porównuje najbliższe oczekujące przecięcie z butelką z najbliższym oczekującym przecięciem z soczewką i przetwarza to, które jest bliżej, więc promień może trafić w soczewkę przed butelką, po niej, albo wcale.

### Stabilność numeryczna

- Po każdym przecięciu kolejny odcinek promienia zaczyna się z przesunięciem `ORIGIN_EPSILON` (1e-5 mm) wzdłuż nowego kierunku, dzięki czemu nie trafia od razu ponownie w tę samą powierzchnię.
- Zawsze wybierane jest wyłącznie najbliższe ściśle dodatnie przecięcie (`t > EPS`, `EPS = 1e-8`), co eliminuje przecięcia leżące za punktem startu promienia.
- Każdy promień jest ograniczony do `max_interactions` (domyślnie 20) przecięć z granicami, co ogranicza pętlę nawet w skrajnych konfiguracjach i zapobiega nieskończonej rekurencji między butelką a soczewką.

## Założenia modelu i ograniczenia

- Symulacja jest czysto dwuwymiarowa: butelka i soczewka to okręgi w przekroju, a nie bryły obrotowe 3D.
- Uwzględniana jest wyłącznie optyka geometryczna (promieniowa) — brak dyfrakcji, interferencji i polaryzacji.
- Brak dyspersji zależnej od długości fali: każdy ośrodek ma pojedynczy, stały współczynnik załamania.
- Natężenie/transmitancja Fresnela nie są modelowane — promienie odbite i załamane są rysowane jako ścieżki o pełnym natężeniu, bez podziału ani tłumienia energii.
- Powierzchnie to idealne okręgi matematyczne, bez chropowatości ani rozpraszania.
- Wszystkie materiały są jednorodne w obrębie swojego obszaru (ścianka butelki, wnętrze butelki, soczewka).
- Każdy promień jest ograniczony do stałej liczby interakcji z granicami (domyślnie 20).

BottleSim to narzędzie edukacyjne i wizualizacyjne do poznawania załamania, odbicia i prostego zachowania soczewek — nie zastępuje profesjonalnego oprogramowania do projektowania czy symulacji optycznej.

## Struktura projektu

```
BottleSim/
├── app.py              Aplikacja Flask: trasy HTTP i parsowanie żądań (/api/simulate)
├── simulation.py       Silnik śledzenia promieni: Bottle, Lens, prawo Snelliusa, odbicie, przecięcia promień/okrąg
├── main.py             Niewielki CLI oparty na Matplotlib do pojedynczego przebiegu wiązki równoległej (bez soczewki)
├── requirements.txt    Zależności Pythona (numpy, matplotlib, flask)
├── templates/
│   └── index.html      Znaczniki strony: kontrolki paska narzędzi, canvas, panel sceny, okno eksportu
└── static/
    ├── js/app.js        Logika frontendu: rysowanie, przeciąganie, zoom/przesuwanie, panel informacyjny, eksport SVG
    └── css/style.css     Style paska narzędzi, nakładki na canvasie i widoku wydruku
```

## Współpraca

Zgłoszenia (issues) i pull requesty są mile widziane. Przed przesłaniem większego pull requesta warto najpierw otworzyć issue opisujące zmianę, utrzymywać zmiany skupione na jednym temacie i unikać modyfikowania fizyki śledzenia promieni bez jasnego wyjaśnienia powodu.

## Wsparcie

W sprawie pytań, błędów czy propozycji funkcji prosimy o korzystanie z zakładki Issues tego repozytorium na GitHubie.

## Opiekun projektu

[bkluj](https://github.com/bkluj)
