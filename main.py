"""
CLI: rysuje śledzenie promieni przez przekrój butelki za pomocą matplotlib.

Logika obliczeniowa mieszka w simulation.py (współdzielona z aplikacją webową
app.py). Ten plik zajmuje się wyłącznie wizualizacją.

Instalacja:
    pip install -r requirements.txt

Uruchomienie:
    python main.py
"""

from __future__ import annotations

import matplotlib.pyplot as plt
from matplotlib.patches import Circle

from simulation import Bottle, compute_rays


def simulate(
    bottle: Bottle,
    ray_count: int = 11,
    beam_angle_deg: float = 0.0,
    beam_half_height_mm: float | None = None,
    save_path: str | None = None,
    show_reflected: bool = False,
) -> None:
    rays = compute_rays(
        bottle=bottle,
        ray_count=ray_count,
        beam_angle_deg=beam_angle_deg,
        beam_half_height_mm=beam_half_height_mm,
    )

    fig, ax = plt.subplots(figsize=(11, 7))
    ax.add_patch(Circle((0, 0), bottle.outer_radius_mm, fill=False, linewidth=2))
    ax.add_patch(Circle((0, 0), bottle.inner_radius_mm, fill=False, linewidth=2))

    tir_count = 0
    for ray in rays:
        tir_count += int(ray.total_internal_reflection)
        ax.plot(ray.points[:, 0], ray.points[:, 1], marker="o", markersize=2, color="tab:blue")
        if show_reflected:
            for segment in ray.reflected:
                ax.plot(
                    segment.points[:, 0],
                    segment.points[:, 1],
                    linestyle="--",
                    color="tab:red",
                    linewidth=1,
                    alpha=0.7,
                )

    ax.set_aspect("equal", adjustable="box")
    ax.set_xlabel("x [mm]")
    ax.set_ylabel("y [mm]")
    ax.set_title(
        "Śledzenie promieni przez szklaną butelkę\n"
        f"Rzew={bottle.outer_radius_mm:.1f} mm, "
        f"ścianka={bottle.wall_thickness_mm:.1f} mm, "
        f"n szkła={bottle.n_glass:.3f}, n wnętrza={bottle.n_inside:.3f}"
    )
    ax.grid(True)
    ax.autoscale_view()
    plt.tight_layout()

    if save_path:
        fig.savefig(save_path, dpi=180)
        plt.close(fig)
    else:
        plt.show()

    if tir_count:
        print(f"Całkowite wewnętrzne odbicie wystąpiło dla {tir_count} promieni.")


if __name__ == "__main__":
    model = Bottle(
        outer_radius_mm=35.0,
        wall_thickness_mm=3.0,
        n_outside=1.0003,
        n_glass=1.52,
        n_inside=1.0003,
    )

    simulate(
        bottle=model,
        ray_count=13,
        beam_angle_deg=0.0,
    )
