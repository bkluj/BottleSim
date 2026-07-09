from __future__ import annotations

from flask import Flask, jsonify, render_template, request

from simulation import Bottle, Lens, compute_point_rays, compute_rays

app = Flask(__name__)


def _parse_float(payload: dict, key: str, default: float | None = None) -> float | None:
    if key not in payload or payload[key] in (None, ""):
        return default
    try:
        return float(payload[key])
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Nieprawidłowa wartość liczbowa dla '{key}'.") from exc


def _parse_int(payload: dict, key: str, default: int) -> int:
    if key not in payload or payload[key] in (None, ""):
        return default
    try:
        return int(payload[key])
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Nieprawidłowa wartość całkowita dla '{key}'.") from exc


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/simulate", methods=["POST"])
def api_simulate():
    payload = request.get_json(silent=True) or {}

    try:
        bottle = Bottle(
            outer_radius_mm=_parse_float(payload, "outer_radius_mm", 35.0),
            wall_thickness_mm=_parse_float(payload, "wall_thickness_mm", 3.0),
            n_outside=_parse_float(payload, "n_outside", 1.0003),
            n_glass=_parse_float(payload, "n_glass", 1.52),
            n_inside=_parse_float(payload, "n_inside", 1.0003),
        )
        ray_count = _parse_int(payload, "ray_count", 13)
        mode = payload.get("mode") or "parallel"
        source = None

        lens = None
        if payload.get("lens_enabled"):
            # Soczewka jest wyrażona w mm, tak jak reszta sceny (mm to jednostka świata).
            lens = Lens(
                center_x_mm=_parse_float(payload, "lens_center_x_mm", -100.0),
                center_y_mm=_parse_float(payload, "lens_center_y_mm", 0.0),
                diameter_mm=_parse_float(payload, "lens_diameter_mm", 40.0),
                refractive_index=_parse_float(payload, "lens_refractive_index", 1.5),
            )

        if mode == "point":
            source_x_mm = _parse_float(payload, "source_x_mm", -170.0)
            source_y_mm = _parse_float(payload, "source_y_mm", 0.0)
            angle_mode = payload.get("angle_mode") or "fixed"
            point_beam_angle_deg = _parse_float(payload, "point_beam_angle_deg", 0.0)
            aim_offset_deg = _parse_float(payload, "aim_offset_deg", 0.0)
            beam_spread_deg = _parse_float(payload, "beam_spread_deg", 20.0)

            rays = compute_point_rays(
                bottle=bottle,
                ray_count=ray_count,
                source_x_mm=source_x_mm,
                source_y_mm=source_y_mm,
                angle_mode=angle_mode,
                beam_angle_deg=point_beam_angle_deg,
                aim_offset_deg=aim_offset_deg,
                beam_spread_deg=beam_spread_deg,
                lens=lens,
            )
            source = {"x": source_x_mm, "y": source_y_mm}
        elif mode == "parallel":
            beam_angle_deg = _parse_float(payload, "beam_angle_deg", 0.0)
            beam_half_height_mm = _parse_float(payload, "beam_half_height_mm", None)

            rays = compute_rays(
                bottle=bottle,
                ray_count=ray_count,
                beam_angle_deg=beam_angle_deg,
                beam_half_height_mm=beam_half_height_mm,
                lens=lens,
            )
        else:
            return jsonify({"error": f"Nieznany tryb źródła światła: '{mode}'."}), 400
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    tir_count = sum(1 for ray in rays if ray.total_internal_reflection)

    return jsonify(
        {
            "mode": mode,
            "source": source,
            "outer_radius_mm": bottle.outer_radius_mm,
            "inner_radius_mm": bottle.inner_radius_mm,
            "tir_count": tir_count,
            "ray_count": len(rays),
            "rays": [
                {
                    "points": ray.points.tolist(),
                    "tir": ray.total_internal_reflection,
                    "reflected": [
                        {
                            "points": segment.points.tolist(),
                            "tir": segment.total_internal_reflection,
                        }
                        for segment in ray.reflected
                    ],
                }
                for ray in rays
            ],
        }
    )


if __name__ == "__main__":
    app.run(debug=True)
