"""
Silnik symulacji 2D promieni przechodzących przez korpus szklanej butelki.

Model:
- przekrój poprzeczny korpusu jako dwa współśrodkowe okręgi,
- pomiędzy nimi szkło,
- wewnątrz ciecz albo powietrze,
- na każdej granicy stosowane jest prawo Snelliusa.

Ten moduł zawiera wyłącznie logikę obliczeniową (bez rysowania), żeby dało się
go współdzielić między CLI (main.py) i aplikacją webową (app.py).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

EPS = 1e-8
ORIGIN_EPSILON = 1e-5  # offsets a new ray origin off a hit point so it doesn't re-hit the same surface


@dataclass(frozen=True)
class Bottle:
    outer_radius_mm: float = 35.0
    wall_thickness_mm: float = 3.0
    n_outside: float = 1.0003
    n_glass: float = 1.52
    n_inside: float = 1.0003

    def __post_init__(self) -> None:
        if self.outer_radius_mm <= 0:
            raise ValueError("Promień zewnętrzny musi być dodatni.")
        if self.wall_thickness_mm <= 0:
            raise ValueError("Grubość ścianki musi być dodatnia.")
        if self.wall_thickness_mm >= self.outer_radius_mm:
            raise ValueError("Grubość ścianki musi być mniejsza od promienia zewnętrznego.")
        for name in ("n_outside", "n_glass", "n_inside"):
            if getattr(self, name) <= 0:
                raise ValueError(f"Współczynnik załamania {name} musi być dodatni.")

    @property
    def inner_radius_mm(self) -> float:
        return self.outer_radius_mm - self.wall_thickness_mm


@dataclass(frozen=True)
class Lens:
    """Jednorodna, okrągła soczewka refrakcyjna (przekrój 2D) o dowolnym środku."""

    center_x_mm: float = -100.0
    center_y_mm: float = 0.0
    diameter_mm: float = 40.0
    refractive_index: float = 1.5

    def __post_init__(self) -> None:
        if self.diameter_mm <= 0:
            raise ValueError("Średnica soczewki musi być dodatnia.")
        if self.refractive_index <= 0:
            raise ValueError("Współczynnik załamania soczewki musi być dodatni.")

    @property
    def radius_mm(self) -> float:
        return self.diameter_mm / 2.0

    @property
    def center(self) -> np.ndarray:
        return np.array([self.center_x_mm, self.center_y_mm])


@dataclass(frozen=True)
class Mirror:
    """Płaskie lustro 2D — odcinek o zadanym środku, długości i kącie (0° = poziomo, 90° = pionowo)."""

    center_x_mm: float = 0.0
    center_y_mm: float = 0.0
    length_mm: float = 60.0
    angle_deg: float = 90.0

    def __post_init__(self) -> None:
        if self.length_mm <= 0:
            raise ValueError("Długość lustra musi być dodatnia.")

    @property
    def center(self) -> np.ndarray:
        return np.array([self.center_x_mm, self.center_y_mm])

    @property
    def direction(self) -> np.ndarray:
        angle = math.radians(self.angle_deg)
        return np.array([math.cos(angle), math.sin(angle)])

    @property
    def endpoints(self) -> tuple[np.ndarray, np.ndarray]:
        half = self.direction * (self.length_mm / 2.0)
        return self.center - half, self.center + half


@dataclass
class ReflectedSegment:
    points: np.ndarray  # shape (N, 2): [hit_point, ...further refracted/TIR-bounded polyline]
    total_internal_reflection: bool  # whether the *originating* boundary hit was a TIR event


@dataclass
class RayPath:
    points: np.ndarray  # shape (N, 2), the transmitted/main path
    total_internal_reflection: bool
    reflected: list[ReflectedSegment] = field(default_factory=list)


def normalize(vector: np.ndarray) -> np.ndarray:
    length = np.linalg.norm(vector)
    if length == 0:
        raise ValueError("Wektor kierunku nie może mieć zerowej długości.")
    return vector / length


def ray_circle_intersection(
    origin: np.ndarray,
    direction: np.ndarray,
    radius: float,
    center: np.ndarray | None = None,
) -> np.ndarray | None:
    """Najbliższe dodatnie przecięcie półprostej z okręgiem o danym środku (domyślnie (0, 0))."""
    direction = normalize(direction)
    local_origin = origin if center is None else origin - center

    b = 2.0 * np.dot(local_origin, direction)
    c = np.dot(local_origin, local_origin) - radius**2
    discriminant = b**2 - 4.0 * c

    if discriminant < 0:
        return None

    root = math.sqrt(max(discriminant, 0.0))
    candidates = [(-b - root) / 2.0, (-b + root) / 2.0]
    positive = [t for t in candidates if t > EPS]

    if not positive:
        return None

    hit_local = local_origin + min(positive) * direction
    return hit_local if center is None else hit_local + center


def ray_segment_intersection(
    origin: np.ndarray,
    direction: np.ndarray,
    p1: np.ndarray,
    p2: np.ndarray,
) -> np.ndarray | None:
    """Najbliższe dodatnie przecięcie półprostej z odcinkiem [p1, p2] (nie z nieskończoną prostą)."""
    direction = normalize(direction)
    edge = p2 - p1
    diff = p1 - origin

    denom = direction[0] * edge[1] - direction[1] * edge[0]
    if abs(denom) < EPS:
        return None  # promień równoległy do lustra

    t = (diff[0] * edge[1] - diff[1] * edge[0]) / denom
    s = (diff[0] * direction[1] - diff[1] * direction[0]) / denom

    if t <= EPS or s < 0.0 or s > 1.0:
        return None

    return origin + t * direction


def refract(
    incident: np.ndarray,
    normal_into_incident_medium: np.ndarray,
    n1: float,
    n2: float,
) -> np.ndarray | None:
    """
    Załamanie zgodne z prawem Snelliusa.
    Zwraca None przy całkowitym wewnętrznym odbiciu.
    """
    incident = normalize(incident)
    normal = normalize(normal_into_incident_medium)

    if np.dot(incident, normal) > 0:
        normal = -normal

    eta = n1 / n2
    cos_i = -np.dot(normal, incident)
    k = 1.0 - eta**2 * (1.0 - cos_i**2)

    if k < 0:
        return None

    transmitted = eta * incident + (eta * cos_i - math.sqrt(k)) * normal
    return normalize(transmitted)


def reflect(incident: np.ndarray, normal: np.ndarray) -> np.ndarray:
    incident = normalize(incident)
    normal = normalize(normal)
    return normalize(incident - 2.0 * np.dot(incident, normal) * normal)


def _bottle_medium(bottle: Bottle, region: str) -> float:
    if region == "outside":
        return bottle.n_outside
    if region == "glass":
        return bottle.n_glass
    return bottle.n_inside


def _other_bottle_region(kind: str, region: str) -> str:
    """The region on the far side of the bottle surface just hit."""
    if kind == "outer":
        return "outside" if region == "glass" else "glass"
    return "inside" if region == "glass" else "glass"


def _trace_polyline(
    origin: np.ndarray,
    direction: np.ndarray,
    bottle: Bottle,
    lens: Lens | None,
    mirror: Mirror | None,
    bottle_region: str,
    lens_state: int,
    n_ambient: float,
    exit_length_mm: float,
    max_interactions: int,
    reflected_segments: list[ReflectedSegment] | None,
) -> tuple[list[np.ndarray], bool]:
    """
    Śledzi jedną łamaną (drogę transmitowaną) przez butelkę/soczewkę/lustro, zaczynając
    z jawnie podanego kontekstu (bottle_region, lens_state) zamiast zakładać z góry
    stałą kolejność granic — dzięki temu ta sama funkcja obsługuje zarówno promień
    główny (zaczynający się na zewnątrz butelki), jak i promień odbity, który może
    zawrócić w kierunku granicy, którą już wcześniej minął.

    bottle_region to bieżący ośrodek promienia względem butelki ("outside" /
    "glass" / "inside"); zewnętrzny okrąg graniczy zawsze z outside<->glass,
    wewnętrzny zawsze z glass<->inside, więc region jednoznacznie wyznacza n1,
    a trafiona granica wyznacza n2.

    Lustro (jeśli podane) jest nieprzezroczystym odcinkiem: promień, który go
    trafi, zawsze się odbija (r = d - 2(d·n)n) i kontynuuje jako ta sama
    śledzona łamana — w przeciwieństwie do granic butelki/soczewki, nie
    doliczana jest tu żadna osobna droga odbita, bo transmisji przez lustro
    nie ma.

    Jeśli reflected_segments nie jest None, na każdej napotkanej granicy
    butelki/soczewki doliczana jest w pełni prześledzona droga promienia
    odbitego (r = d - 2(d·n)n), podlegająca tym samym prawom (Snellius,
    całkowite wewnętrzne odbicie, a także ewentualne lustro na drodze) — ale
    bez dalszego odbijania (spawn_reflections=False w rekurencyjnym wywołaniu),
    żeby koszt pozostał liniowy, a nie eksponencjalny w głębi odbić.
    """
    points = [origin.copy()]

    mirror_p1 = mirror_p2 = mirror_edge = None
    if mirror is not None:
        mirror_p1, mirror_p2 = mirror.endpoints
        mirror_edge = mirror_p2 - mirror_p1

    for _ in range(max_interactions):
        candidates = []  # (rodzaj, podrodzaj, odległość, punkt trafienia)

        for kind, radius in (("outer", bottle.outer_radius_mm), ("inner", bottle.inner_radius_mm)):
            hit = ray_circle_intersection(origin, direction, radius)
            if hit is not None:
                candidates.append(("bottle", kind, float(np.linalg.norm(hit - origin)), hit))

        if lens is not None and lens_state in (0, 1):
            hit = ray_circle_intersection(origin, direction, lens.radius_mm, center=lens.center)
            if hit is not None:
                candidates.append(("lens", None, float(np.linalg.norm(hit - origin)), hit))

        if mirror is not None:
            hit = ray_segment_intersection(origin, direction, mirror_p1, mirror_p2)
            if hit is not None:
                candidates.append(("mirror", None, float(np.linalg.norm(hit - origin)), hit))

        if not candidates:
            break

        kind, sub_kind, _, hit = min(candidates, key=lambda c: c[2])
        points.append(hit.copy())

        if kind == "mirror":
            perp = normalize(np.array([-mirror_edge[1], mirror_edge[0]]))
            normal = perp if np.dot(direction, perp) < 0 else -perp
            direction = reflect(direction, normal)
            origin = hit + direction * ORIGIN_EPSILON
            continue

        if kind == "bottle":
            center = np.zeros(2)
            new_region = _other_bottle_region(sub_kind, bottle_region)
            n1, n2 = _bottle_medium(bottle, bottle_region), _bottle_medium(bottle, new_region)
        else:
            center = lens.center
            new_region = None
            n1, n2 = (
                (n_ambient, lens.refractive_index)
                if lens_state == 0
                else (lens.refractive_index, n_ambient)
            )

        radial_normal = normalize(hit - center)
        normal = radial_normal if np.dot(direction, radial_normal) < 0 else -radial_normal

        reflected_direction = reflect(direction, normal)
        transmitted = refract(direction, normal, n1, n2)
        is_tir = transmitted is None

        if reflected_segments is not None:
            reflected_origin = hit + reflected_direction * ORIGIN_EPSILON
            sub_points, _ = _trace_polyline(
                reflected_origin,
                reflected_direction,
                bottle,
                lens,
                mirror,
                bottle_region,
                lens_state,
                n_ambient,
                exit_length_mm,
                max_interactions,
                None,
            )
            reflected_segments.append(
                ReflectedSegment(np.vstack([hit.copy(), *sub_points[1:]]), is_tir)
            )

        if kind == "bottle":
            bottle_region = new_region
        else:
            lens_state += 1

        if is_tir:
            return points, True

        direction = transmitted
        origin = hit + direction * ORIGIN_EPSILON

    points.append(origin + direction * exit_length_mm)
    return points, False


def trace_ray(
    start: np.ndarray,
    direction: np.ndarray,
    bottle: Bottle,
    lens: Lens | None = None,
    mirror: Mirror | None = None,
    exit_length_mm: float = 80.0,
    max_interactions: int = 20,
) -> RayPath:
    """
    Droga główna: powietrze -> szkło -> wnętrze -> szkło -> powietrze, z opcjonalną
    okrągłą soczewką refrakcyjną gdzieś na drodze promienia. Promień startuje
    zawsze na zewnątrz butelki (region "outside"), zgodnie z tym, jak startują
    go compute_rays/compute_point_rays.

    Na każdym kroku wyznaczane są kandydujące, jeszcze nienapotkane powierzchnie
    (obie granice butelki oraz wejście/wyjście soczewki, jeśli jest włączona)
    i wybierane jest najbliższe dodatnie przecięcie wzdłuż promienia — dzięki temu
    nie zakłada się z góry, czy promień trafi najpierw w soczewkę, czy w butelkę,
    ani w jakiej kolejności napotka granice butelki (co jest istotne dla promieni
    odbitych, które mogą zawrócić w stronę granicy już wcześniej minionej).

    Na każdej napotkanej granicy, oprócz kontynuacji promienia głównego
    (transmitowanego), doliczana jest też w pełni prześledzona droga promienia
    odbitego — podlega ona tym samym prawom optyki geometrycznej (Snellius,
    całkowite wewnętrzne odbicie) na każdej kolejnej granicy, którą napotka,
    zamiast rysować się jako sztywny, prosty odcinek ignorujący geometrię butelki.
    Przy całkowitym wewnętrznym odbiciu promień główny urywa się dokładnie
    w punkcie trafienia — dalej istnieje wyłącznie odbicie.
    """
    direction = normalize(direction)
    origin = np.asarray(start, dtype=float)
    reflected_segments: list[ReflectedSegment] = []

    points, total_internal_reflection = _trace_polyline(
        origin,
        direction,
        bottle,
        lens,
        mirror,
        "outside",
        0,
        bottle.n_outside,
        exit_length_mm,
        max_interactions,
        reflected_segments,
    )

    return RayPath(np.vstack(points), total_internal_reflection, reflected_segments)


def compute_rays(
    bottle: Bottle,
    ray_count: int = 11,
    beam_angle_deg: float = 0.0,
    beam_half_height_mm: float | None = None,
    exit_length_mm: float = 80.0,
    lens: Lens | None = None,
    mirror: Mirror | None = None,
) -> list[RayPath]:
    if ray_count < 1:
        raise ValueError("ray_count musi być co najmniej równy 1.")

    inner_radius = bottle.inner_radius_mm
    if beam_half_height_mm is None:
        beam_half_height_mm = 0.70 * inner_radius

    if beam_half_height_mm >= inner_radius:
        raise ValueError(
            "beam_half_height_mm powinno być mniejsze od promienia wewnętrznego."
        )

    angle = math.radians(beam_angle_deg)
    direction = np.array([math.cos(angle), math.sin(angle)])

    start_x = -bottle.outer_radius_mm - exit_length_mm
    y_values = np.linspace(-beam_half_height_mm, beam_half_height_mm, ray_count)

    rays = []
    for y in y_values:
        start = np.array([start_x, y], dtype=float)
        rays.append(
            trace_ray(start, direction, bottle, lens=lens, mirror=mirror, exit_length_mm=exit_length_mm)
        )
    return rays


def compute_point_rays(
    bottle: Bottle,
    ray_count: int = 13,
    source_x_mm: float = -180.0,
    source_y_mm: float = 0.0,
    angle_mode: str = "fixed",
    beam_angle_deg: float = 0.0,
    aim_offset_deg: float = 0.0,
    beam_spread_deg: float = 20.0,
    exit_length_mm: float = 80.0,
    lens: Lens | None = None,
    mirror: Mirror | None = None,
) -> list[RayPath]:
    """
    Wiązka rozbieżna z punktowego źródła światła.

    angle_mode="fixed": beam_angle_deg to bezwzględny kąt kierunku wiązki
    (0° = oś X), całkowicie niezależny od pozycji źródła — przesuwanie
    źródła zmienia tylko punkt startu promieni, nie ich kierunek.

    angle_mode="center": kierunek wiązki jest wyliczany od źródła do stałego
    środka butelki (0, 0), z opcjonalnym odchyleniem aim_offset_deg
    (0° = dokładnie na środek); po przesunięciu źródła kąt aktualizuje się
    automatycznie.

    beam_spread_deg to pełny kąt rozwarcia stożka promieni wokół kierunku centralnego.
    """
    if ray_count < 1:
        raise ValueError("ray_count musi być co najmniej równy 1.")
    if beam_spread_deg < 0:
        raise ValueError("Kąt rozwarcia wiązki nie może być ujemny.")
    if angle_mode not in ("fixed", "center"):
        raise ValueError(f"Nieznany tryb kąta wiązki: '{angle_mode}'.")

    source = np.array([source_x_mm, source_y_mm], dtype=float)
    distance_to_center = float(np.linalg.norm(source))
    if distance_to_center <= bottle.outer_radius_mm:
        raise ValueError(
            "Źródło światła musi znajdować się poza butelką (promień zewnętrzny)."
        )

    if angle_mode == "fixed":
        central_angle = math.radians(beam_angle_deg)
    else:
        angle_to_center = math.atan2(-source[1], -source[0])
        central_angle = angle_to_center + math.radians(aim_offset_deg)

    half_spread = math.radians(beam_spread_deg) / 2.0

    if ray_count == 1:
        angles = [central_angle]
    else:
        angles = np.linspace(central_angle - half_spread, central_angle + half_spread, ray_count)

    rays = []
    for angle in angles:
        direction = np.array([math.cos(angle), math.sin(angle)])
        rays.append(
            trace_ray(source, direction, bottle, lens=lens, mirror=mirror, exit_length_mm=exit_length_mm)
        )
    return rays
