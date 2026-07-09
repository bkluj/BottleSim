(() => {
  const form = document.getElementById("params-form");
  const statusEl = document.getElementById("status");
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  const rayCountSlider = document.getElementById("ray_count_slider");
  const rayCountNumber = document.getElementById("ray_count");
  const rayCountReadout = document.getElementById("ray_count_readout");
  const modeRadios = form.querySelectorAll('input[name="mode"]');
  const parallelFields = document.getElementById("mode-parallel-fields");
  const pointFields = document.getElementById("mode-point-fields");
  const pointPositionFields = document.getElementById("mode-point-position-fields");
  const simulationContainer = document.querySelector(".simulation-container");
  const outerRadiusInput = document.getElementById("outer_radius_mm");
  const sourceXInput = document.getElementById("source_x_mm");
  const sourceYInput = document.getElementById("source_y_mm");
  const toggleReflectedBtn = document.getElementById("toggle-reflected-btn");
  const angleLinkCheckbox = document.getElementById("angle_link_center");
  const pointBeamAngleField = document.getElementById("point_beam_angle_field");
  const aimOffsetField = document.getElementById("aim_offset_field");
  const showGridCheckbox = document.getElementById("show_grid");
  const gridNoteEl = document.getElementById("grid-note");
  const lensEnabledCheckbox = document.getElementById("lens_enabled");
  const lensFields = document.getElementById("lens-fields");
  const lensCenterXInput = document.getElementById("lens_center_x_mm");
  const lensCenterYInput = document.getElementById("lens_center_y_mm");
  const lensDiameterInput = document.getElementById("lens_diameter_mm");
  const resetColorsBtn = document.getElementById("reset-colors-btn");
  const colorInputs = {
    bottle: document.getElementById("color_bottle"),
    lens: document.getElementById("color_lens"),
    incident: document.getElementById("color_incident"),
    refracted: document.getElementById("color_refracted"),
    reflected: document.getElementById("color_reflected"),
    grid: document.getElementById("color_grid"),
  };
  const showDimensionsCheckbox = document.getElementById("show_dimensions");

  // --- collapsible HUD (top toolbar) ---
  const toggleHudBtn = document.getElementById("toggle-hud-btn");
  const hudSettings = document.getElementById("hud-settings");

  // --- scene inspector (read-only overlay) ---
  const sceneInspector = document.getElementById("scene-inspector");
  const toggleInspectorBtn = document.getElementById("toggle-inspector-btn");

  // --- export / print ---
  const openExportBtn = document.getElementById("open-export-btn");
  const exportDialog = document.getElementById("export-dialog");
  const exportPageSize = document.getElementById("export_page_size");
  const exportOrientation = document.getElementById("export_orientation");
  const exportScale = document.getElementById("export_scale");
  const exportReferenceSelect = document.getElementById("export_reference");
  const exportCustomPosition = document.getElementById("export-custom-position");
  const exportPosX = document.getElementById("export_pos_x_mm");
  const exportPosY = document.getElementById("export_pos_y_mm");
  const exportShowGrid = document.getElementById("export_show_grid");
  const exportShowRays = document.getElementById("export_show_rays");
  const exportShowDimensions = document.getElementById("export_show_dimensions");
  const exportShowColors = document.getElementById("export_show_colors");
  const exportWarning = document.getElementById("export-warning");
  const exportDownloadBtn = document.getElementById("export-download-btn");
  const exportOversizeBtn = document.getElementById("export-oversize-btn");
  const exportPrintViewBtn = document.getElementById("export-print-view-btn");
  const printView = document.getElementById("print-view");
  const printViewContent = document.getElementById("print-view-content");
  const printNowBtn = document.getElementById("print-now-btn");
  const printCloseBtn = document.getElementById("print-close-btn");

  let requestToken = 0;
  let lastTransform = null; // {scale, originX, originY} of the most recent draw()
  let lastResult = null; // most recent successful /api/simulate payload
  let draggingSource = false;
  let draggingLens = false;
  let showReflectedRays = false; // independent of source/params — toggled locally, never refetched

  // Mouse-wheel zoom: a pure display multiplier on top of the fixed world
  // window. It never changes bottleCenter, world units, or triggers a
  // refetch — only how many screen pixels one world mm occupies.
  let zoomFactor = 1;
  const MIN_ZOOM = 0.15;
  const MAX_ZOOM = 10;

  // Pan: a pure screen-pixel offset added to the fixed origin. Like zoom,
  // it never touches bottleCenter/source/lens model values or triggers a
  // refetch — it only shifts where (0,0) lands on screen. Never used by the
  // SVG/print export, which always renders from the model, not the viewport.
  let panOffsetX = 0;
  let panOffsetY = 0;
  let draggingPan = false;
  let panStartMouse = null;
  let panStartOffset = null;

  // Collapsing the HUD only hides the settings markup (CSS display:none) —
  // the form and all its input values stay in the DOM untouched, so nothing
  // resets. The freed height is reclaimed by .simulation-container (flex:1),
  // and the ResizeObserver already watching it redraws the cached rays at
  // the new canvas size — no new /api/simulate request, no view change.
  let isHudCollapsed = false;

  function currentMode() {
    return form.querySelector('input[name="mode"]:checked').value;
  }

  function debounce(fn, waitMs) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), waitMs);
    };
  }

  const COLOR_STORAGE_KEY = "bottlesim_user_colors";

  function loadUserColors() {
    try {
      return JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function saveUserColors() {
    localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(userColors));
  }

  let userColors = loadUserColors(); // user overrides only; rendering-only, never triggers a refetch

  function defaultColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      surface: style.getPropertyValue("--surface").trim(),
      textMuted: style.getPropertyValue("--text-muted").trim(),
      source: style.getPropertyValue("--source").trim(),
      bottle: style.getPropertyValue("--baseline").trim(),
      lens: style.getPropertyValue("--lens").trim(),
      incident: style.getPropertyValue("--incident").trim(),
      refracted: style.getPropertyValue("--accent").trim(),
      reflected: style.getPropertyValue("--danger").trim(),
      grid: style.getPropertyValue("--gridline").trim(),
    };
  }

  // Merges CSS theme defaults with any user color overrides. Pure lookup —
  // never touches ray geometry, so changing colors only redraws.
  function currentColors() {
    const defaults = defaultColors();
    return { ...defaults, ...userColors };
  }

  // Single source of truth for "the scene in world mm/degrees", read straight
  // from the live inputs. Used by the read-only inspector, the dimension
  // overlay, and the SVG exporter — never by the physics request itself,
  // so it can't influence ray computation.
  function getSceneModel() {
    const mode = currentMode();
    const outerRadius = Number(outerRadiusInput.value) || 0;
    const wallThickness = Number(document.getElementById("wall_thickness_mm").value) || 0;
    const innerRadius = outerRadius - wallThickness;

    const lens = lensEnabledCheckbox.checked
      ? {
          centerXMm: Number(lensCenterXInput.value) || 0,
          centerYMm: Number(lensCenterYInput.value) || 0,
          radiusMm: (Number(lensDiameterInput.value) || 0) / 2,
          diameterMm: Number(lensDiameterInput.value) || 0,
          n: Number(document.getElementById("lens_refractive_index").value) || 0,
        }
      : null;

    const source =
      mode === "point"
        ? { xMm: Number(sourceXInput.value) || 0, yMm: Number(sourceYInput.value) || 0 }
        : null;

    const linked = angleLinkCheckbox.checked;
    let centralAngleDeg;
    if (mode === "parallel") {
      centralAngleDeg = Number(document.getElementById("beam_angle_deg").value) || 0;
    } else if (linked) {
      const angleToCenterDeg = (Math.atan2(-source.yMm, -source.xMm) * 180) / Math.PI;
      centralAngleDeg = angleToCenterDeg + (Number(document.getElementById("aim_offset_deg").value) || 0);
    } else {
      centralAngleDeg = Number(document.getElementById("point_beam_angle_deg").value) || 0;
    }

    const spreadDeg = mode === "point" ? Number(document.getElementById("beam_spread_deg").value) || 0 : null;

    return {
      mode,
      outerRadius,
      innerRadius,
      lens,
      source,
      centralAngleDeg,
      spreadDeg,
      rayCount: Number(rayCountNumber.value) || 0,
      angleModeLabel: mode === "point" ? (linked ? "kieruj na środek" : "kąt stały") : "równoległa",
    };
  }

  function readParams() {
    const data = new FormData(form);
    const params = {};
    for (const [key, value] of data.entries()) {
      params[key] = value;
    }
    params.angle_mode = angleLinkCheckbox.checked ? "center" : "fixed";
    params.lens_enabled = lensEnabledCheckbox.checked;
    return params;
  }

  function setStatus(message, isError) {
    statusEl.classList.toggle("error", Boolean(isError));
    statusEl.textContent = message;
  }

  function showLegend() {
    const existing = statusEl.querySelector(".legend");
    if (existing) existing.remove();

    const colors = currentColors();
    const legend = document.createElement("div");
    legend.className = "legend";
    legend.innerHTML = `
      <span class="legend-item"><span class="legend-swatch" style="background:${colors.incident}"></span>promień padający</span>
      <span class="legend-item"><span class="legend-swatch" style="background:${colors.refracted}"></span>promień załamany</span>
      ${
        showReflectedRays
          ? `<span class="legend-item"><span class="legend-swatch dashed" style="color:${colors.reflected}"></span>promień odbity</span>`
          : ""
      }
    `;
    statusEl.appendChild(legend);
  }

  // Fixed world window around the bottle (bottleCenter is always (0,0)).
  // Deliberately independent of rays/source: only outerRadius (bottle geometry)
  // and the canvas size may affect this, so dragging the source or changing
  // ray_count/beam angle/reflected-toggle can never move or rescale the scene.
  const VIEW_MARGIN_MM = 150;

  function computeFixedTransform(outerRadius, cssWidth, cssHeight) {
    const padding = 40;
    const halfExtent = outerRadius + VIEW_MARGIN_MM;
    const baseScale = Math.min(
      (cssWidth - 2 * padding) / (2 * halfExtent),
      (cssHeight - 2 * padding) / (2 * halfExtent)
    );
    // zoomFactor/panOffset are pure on-screen display adjustments (mouse-wheel
    // zoom, click-drag pan): they never change bottleCenter or the world
    // window, only px-per-mm and where (0,0) lands on screen — and they're
    // applied only here, never in the SVG/print export, which always renders
    // true physical scale/position regardless of the current on-screen view.
    return {
      scale: baseScale * zoomFactor,
      originX: cssWidth / 2 + panOffsetX,
      originY: cssHeight / 2 + panOffsetY,
    };
  }

  // The app's world unit is mm throughout, and grid labels are shown in mm
  // too; grid spacing is defined purely in world mm, so it's identical
  // regardless of source/rays.
  const FINE_GRID_MM = 10; // 10 mm
  const MEDIUM_GRID_MM = 50; // 50 mm
  const MAJOR_GRID_MM = 100; // 100 mm

  function drawGrid(scale, originX, originY, cssWidth, cssHeight, colors) {
    const worldMinX = -originX / scale;
    const worldMaxX = (cssWidth - originX) / scale;
    const worldMinY = (originY - cssHeight) / scale;
    const worldMaxY = originY / scale;

    function lines(spacingMm, strokeColor, alpha, lineWidth, withLabels) {
      ctx.strokeStyle = strokeColor;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lineWidth;

      const startX = Math.ceil(worldMinX / spacingMm) * spacingMm;
      for (let x = startX; x <= worldMaxX; x += spacingMm) {
        const px = originX + x * scale;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, cssHeight);
        ctx.stroke();
        if (withLabels) {
          ctx.fillStyle = colors.textMuted;
          ctx.font = "10px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(String(Math.round(x)), px, cssHeight - 4);
        }
      }

      const startY = Math.ceil(worldMinY / spacingMm) * spacingMm;
      for (let y = startY; y <= worldMaxY; y += spacingMm) {
        const py = originY - y * scale;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(cssWidth, py);
        ctx.stroke();
        if (withLabels) {
          ctx.fillStyle = colors.textMuted;
          ctx.font = "10px system-ui, sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(String(Math.round(y)), 4, py);
        }
      }
    }

    // trzy poziomy: co 10 mm (delikatna), co 50 mm (mocniejsza), co 100 mm (główna + opis)
    lines(FINE_GRID_MM, colors.grid, 0.18, 1, false);
    lines(MEDIUM_GRID_MM, colors.grid, 0.38, 1, false);
    lines(MAJOR_GRID_MM, colors.grid, 0.65, 1.2, true);
    ctx.globalAlpha = 1;
  }

  // Read-only overlay: mirrors current inputs (+ a few derived distances/angles)
  // into the panel. Never reads or writes physics state — purely display.
  function fmtUnit(value, unit, digits = 1) {
    return `${value.toFixed(digits)} ${unit}`;
  }

  function setInsp(id, text) {
    document.getElementById(id).textContent = text;
  }

  function updateInspector() {
    const m = getSceneModel();

    setInsp("insp-bottle-x", "0,0 mm");
    setInsp("insp-bottle-y", "0,0 mm");
    setInsp("insp-bottle-outer", fmtUnit(m.outerRadius * 2, "mm"));
    setInsp("insp-bottle-inner", fmtUnit(m.innerRadius * 2, "mm"));

    if (m.lens) {
      setInsp("insp-lens-x", fmtUnit(m.lens.centerXMm, "mm"));
      setInsp("insp-lens-y", fmtUnit(m.lens.centerYMm, "mm"));
      setInsp("insp-lens-d", fmtUnit(m.lens.diameterMm, "mm"));
      setInsp("insp-lens-n", m.lens.n.toFixed(3));
    } else {
      ["insp-lens-x", "insp-lens-y", "insp-lens-d", "insp-lens-n"].forEach((id) => setInsp(id, "—"));
    }

    if (m.source) {
      setInsp("insp-source-x", fmtUnit(m.source.xMm, "mm"));
      setInsp("insp-source-y", fmtUnit(m.source.yMm, "mm"));
      setInsp("insp-source-dist", fmtUnit(Math.hypot(m.source.xMm, m.source.yMm), "mm"));
    } else {
      ["insp-source-x", "insp-source-y", "insp-source-dist"].forEach((id) => setInsp(id, "— (równoległa)"));
    }

    setInsp("insp-beam-angle", fmtUnit(m.centralAngleDeg, "°"));
    setInsp("insp-beam-spread", m.spreadDeg === null ? "—" : fmtUnit(m.spreadDeg, "°"));
    setInsp("insp-beam-mode", m.angleModeLabel);
    setInsp("insp-ray-count", String(m.rayCount));

    setInsp(
      "insp-dist-source-lens",
      m.source && m.lens
        ? fmtUnit(Math.hypot(m.source.xMm - m.lens.centerXMm, m.source.yMm - m.lens.centerYMm), "mm")
        : "—"
    );
    setInsp(
      "insp-dist-lens-bottle",
      m.lens ? fmtUnit(Math.hypot(m.lens.centerXMm, m.lens.centerYMm), "mm") : "—"
    );
    setInsp(
      "insp-angle-source-center",
      m.source ? fmtUnit((Math.atan2(-m.source.yMm, -m.source.xMm) * 180) / Math.PI, "°") : "—"
    );
  }

  // Technical dimension overlay — rendering-only, drawn from the same
  // getSceneModel() the inspector uses. Never touches ray geometry.
  function drawDimensions(m, colors, scale, originX, originY) {
    const toCanvas = (x, y) => [originX + x * scale, originY - y * scale];
    ctx.save();
    ctx.strokeStyle = colors.textMuted;
    ctx.fillStyle = colors.textMuted;
    ctx.font = "10px system-ui, sans-serif";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.9;

    function line(x1, y1, x2, y2) {
      const [px1, py1] = toCanvas(x1, y1);
      const [px2, py2] = toCanvas(x2, y2);
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
      return [px1, py1, px2, py2];
    }

    function horizontalDimension(xCenterMm, yCenterMm, halfWidthMm, offsetMm, label) {
      const y = yCenterMm - offsetMm;
      const [px1, py1, px2, py2] = line(xCenterMm - halfWidthMm, y, xCenterMm + halfWidthMm, y);
      ctx.beginPath();
      ctx.moveTo(px1, py1 - 4);
      ctx.lineTo(px1, py1 + 4);
      ctx.moveTo(px2, py2 - 4);
      ctx.lineTo(px2, py2 + 4);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, (px1 + px2) / 2, Math.max(py1, py2) + 3);
    }

    function pointDimension(x1Mm, y1Mm, x2Mm, y2Mm, label) {
      const [px1, py1, px2, py2] = line(x1Mm, y1Mm, x2Mm, y2Mm);
      ctx.beginPath();
      ctx.arc(px1, py1, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, (px1 + px2) / 2 + 6, (py1 + py2) / 2 - 4);
    }

    // bottle + lens diameters
    horizontalDimension(0, 0, m.outerRadius, m.outerRadius + 14 / scale, `⌀ butelki = ${(m.outerRadius * 2).toFixed(0)} mm`);
    if (m.lens) {
      horizontalDimension(
        m.lens.centerXMm,
        m.lens.centerYMm,
        m.lens.radiusMm,
        m.lens.radiusMm + 14 / scale,
        `⌀ soczewki = ${m.lens.diameterMm.toFixed(0)} mm`
      );
      pointDimension(0, 0, m.lens.centerXMm, m.lens.centerYMm, `${Math.hypot(m.lens.centerXMm, m.lens.centerYMm).toFixed(0)} mm`);
    }

    // source distance from bottle center
    if (m.source) {
      pointDimension(0, 0, m.source.xMm, m.source.yMm, `${Math.hypot(m.source.xMm, m.source.yMm).toFixed(0)} mm`);
    }

    // central beam angle, shown as a small arc at the bottle center
    {
      const arcRadiusPx = 30;
      const [ox, oy] = toCanvas(0, 0);
      const angleRad = (m.centralAngleDeg * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(ox, oy, arcRadiusPx, 0, -angleRad, angleRad > 0);
      ctx.stroke();
      const labelAngle = -angleRad / 2;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`θ = ${m.centralAngleDeg.toFixed(1)}°`, ox + Math.cos(labelAngle) * (arcRadiusPx + 16), oy + Math.sin(labelAngle) * (arcRadiusPx + 16));
    }

    // beam spread, shown as a small arc at the source (point mode only)
    if (m.source && m.spreadDeg) {
      const halfRad = (m.spreadDeg / 2) * (Math.PI / 180);
      const centralRad = (m.centralAngleDeg * Math.PI) / 180;
      const [sx, sy] = toCanvas(m.source.xMm, m.source.yMm);
      const r = 22;
      ctx.beginPath();
      ctx.arc(sx, sy, r, -(centralRad + halfRad), -(centralRad - halfRad));
      ctx.stroke();
      const midA = -centralRad;
      ctx.fillText(`Δ = ${m.spreadDeg.toFixed(0)}°`, sx + Math.cos(midA) * (r + 14), sy + Math.sin(midA) * (r + 14));
    }

    ctx.restore();
  }

  function draw(result) {
    const colors = currentColors();
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 1000;
    const cssHeight = canvas.clientHeight || 700;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const { outer_radius_mm: outerRadius, inner_radius_mm: innerRadius, rays } = result;
    const { scale, originX, originY } = computeFixedTransform(outerRadius, cssWidth, cssHeight);

    lastTransform = { scale, originX, originY };
    const toCanvas = (x, y) => [originX + x * scale, originY - y * scale];

    // measurement grid — world-space only (outerRadius/canvas size), drawn under
    // everything else; never touches rays/source, so it can't move or rescale
    if (showGridCheckbox.checked) {
      drawGrid(scale, originX, originY, cssWidth, cssHeight, colors);
    }

    // bottle circles — lightened: thin translucent glass fill so contours and
    // rays passing through stay clearly legible
    const [bcx, bcy] = toCanvas(0, 0);
    ctx.strokeStyle = colors.bottle;
    ctx.lineWidth = 2;
    for (const r of [outerRadius, innerRadius]) {
      ctx.beginPath();
      ctx.arc(bcx, bcy, r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = colors.bottle;
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.arc(bcx, bcy, outerRadius * scale, 0, Math.PI * 2);
    ctx.arc(bcx, bcy, innerRadius * scale, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.globalAlpha = 1;

    // lens — a circle in world coordinates, position/diameter stored in mm
    // (same world unit as the rest of the scene); drawn straight from the
    // live inputs so dragging feels instant
    if (lensEnabledCheckbox.checked) {
      const lensCenterMm = [Number(lensCenterXInput.value) || 0, Number(lensCenterYInput.value) || 0];
      const lensRadiusMm = (Number(lensDiameterInput.value) || 0) / 2;
      const [lcx, lcy] = toCanvas(lensCenterMm[0], lensCenterMm[1]);
      ctx.strokeStyle = colors.lens;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(lcx, lcy, lensRadiusMm * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = colors.lens;
      ctx.globalAlpha = 0.12;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // rays — dense beams skip per-vertex markers and thin out for readability.
    // First segment (source to first hit) is drawn as "incident", the rest of
    // the transmitted path as "refracted" — a simple visual split, not a new
    // physical concept: the geometry itself is untouched.
    const dense = rays.length > 60;
    ctx.lineWidth = dense ? 1 : 1.5;
    ctx.globalAlpha = dense ? 0.55 : 1;

    for (const ray of rays) {
      const pts = ray.points;

      ctx.strokeStyle = colors.incident;
      ctx.beginPath();
      const [ix0, iy0] = toCanvas(pts[0][0], pts[0][1]);
      ctx.moveTo(ix0, iy0);
      const [ix1, iy1] = toCanvas(pts[Math.min(1, pts.length - 1)][0], pts[Math.min(1, pts.length - 1)][1]);
      ctx.lineTo(ix1, iy1);
      ctx.stroke();

      if (pts.length > 2) {
        ctx.strokeStyle = colors.refracted;
        ctx.beginPath();
        pts.slice(1).forEach(([x, y], i) => {
          const [px, py] = toCanvas(x, y);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }

      if (!dense) {
        ctx.fillStyle = colors.refracted;
        for (const [x, y] of pts) {
          const [px, py] = toCanvas(x, y);
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;

    // reflected rays — geometric direction only, rendering is purely local (no refetch);
    // the transform above never depends on ray/reflected data, so toggling can't shift the view
    if (showReflectedRays) {
      ctx.strokeStyle = colors.reflected;
      ctx.lineWidth = dense ? 1 : 1.25;
      ctx.globalAlpha = dense ? 0.45 : 0.75;
      ctx.setLineDash([6, 4]);
      for (const ray of rays) {
        for (const segment of ray.reflected) {
          const [[x1, y1], [x2, y2]] = segment.points;
          const [px1, py1] = toCanvas(x1, y1);
          const [px2, py2] = toCanvas(x2, y2);
          ctx.beginPath();
          ctx.moveTo(px1, py1);
          ctx.lineTo(px2, py2);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // point light source marker
    if (result.mode === "point" && result.source) {
      const [px, py] = toCanvas(result.source.x, result.source.y);
      ctx.fillStyle = colors.source;
      ctx.strokeStyle = colors.surface;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // technical dimension overlay — purely additive, reads the same live
    // inputs as the inspector; never feeds back into ray computation
    if (showDimensionsCheckbox.checked) {
      drawDimensions(getSceneModel(), colors, scale, originX, originY);
    }

    updateInspector();
  }

  async function runSimulation() {
    const token = ++requestToken;

    let response;
    try {
      response = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(readParams()),
      });
    } catch (err) {
      if (token !== requestToken) return;
      setStatus("Błąd sieci: nie można połączyć się z serwerem.", true);
      return;
    }

    const result = await response.json();
    if (token !== requestToken) return; // a newer request superseded this one

    if (!response.ok) {
      setStatus(result.error || "Nieznany błąd.", true);
      return;
    }

    lastResult = result;
    draw(result);
    setStatus(
      `Promieni: ${result.ray_count}, całkowite wewnętrzne odbicie: ${result.tir_count}.`,
      false
    );
    showLegend();
  }

  const liveUpdate = debounce(runSimulation, 80);

  function syncRayCount(value) {
    rayCountSlider.value = value;
    rayCountNumber.value = value;
    rayCountReadout.textContent = value;
  }

  rayCountSlider.addEventListener("input", () => {
    syncRayCount(rayCountSlider.value);
    liveUpdate();
  });
  rayCountNumber.addEventListener("input", () => {
    const clamped = Math.min(Number(rayCountSlider.max), Number(rayCountNumber.value) || 1);
    rayCountSlider.value = clamped;
    rayCountReadout.textContent = rayCountNumber.value;
    liveUpdate();
  });

  // Toggling reflected rays never refetches: it only changes what the cached
  // result is rendered with, so the bottle/source/scale never move.
  toggleReflectedBtn.addEventListener("click", () => {
    showReflectedRays = !showReflectedRays;
    toggleReflectedBtn.setAttribute("aria-pressed", String(showReflectedRays));
    toggleReflectedBtn.textContent = showReflectedRays
      ? "Ukryj promienie odbite"
      : "Pokaż promienie odbite";
    if (lastResult) {
      draw(lastResult);
      showLegend();
    }
  });

  function applyMode() {
    const isPoint = currentMode() === "point";
    parallelFields.classList.toggle("hidden", isPoint);
    pointFields.classList.toggle("hidden", !isPoint);
    pointPositionFields.classList.toggle("hidden", !isPoint);
    // grab cursor is always shown: dragging empty canvas space now pans the
    // view regardless of mode/lens, not just source/lens markers
    canvas.classList.add("draggable-source");
  }

  modeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      applyMode();
      liveUpdate();
    });
  });
  applyMode();

  // Angle mode only changes which field drives the beam direction; it never
  // touches sourcePosition, bottleCenter, or the viewport.
  function applyAngleMode() {
    const linked = angleLinkCheckbox.checked;
    pointBeamAngleField.classList.toggle("hidden", linked);
    aimOffsetField.classList.toggle("hidden", !linked);
  }

  angleLinkCheckbox.addEventListener("change", () => {
    applyAngleMode();
    liveUpdate();
  });
  applyAngleMode();

  // Grid visibility is a pure rendering flag: instant redraw from the cached
  // result, no refetch, so it can't perturb the source/bottle/viewport either.
  showGridCheckbox.addEventListener("change", () => {
    gridNoteEl.classList.toggle("hidden", !showGridCheckbox.checked);
    if (lastResult) draw(lastResult);
  });
  gridNoteEl.classList.toggle("hidden", !showGridCheckbox.checked);

  // Enabling/disabling the lens never auto-fits the view: it only adds/removes
  // a refractive object and refetches rays through the same fixed viewport.
  function applyLensMode() {
    lensFields.classList.toggle("hidden", !lensEnabledCheckbox.checked);
    applyMode();
  }
  lensEnabledCheckbox.addEventListener("change", () => {
    applyLensMode();
    liveUpdate();
  });
  applyLensMode();

  form.addEventListener("submit", (event) => event.preventDefault());
  form
    .querySelectorAll(
      'input:not(#ray_count_slider):not(#ray_count):not([name="mode"]):not(#angle_link_center):not(#show_grid):not(#lens_enabled):not(#show_dimensions):not([type="color"])'
    )
    .forEach((input) => {
      input.addEventListener("input", liveUpdate);
    });

  // Dimension overlay is a pure rendering flag, just like the grid: instant
  // redraw from the cached result, no refetch, no view change.
  showDimensionsCheckbox.addEventListener("change", () => {
    if (lastResult) draw(lastResult);
  });

  // --- scene inspector: collapse/expand only, never touches state ---
  toggleInspectorBtn.addEventListener("click", () => {
    const collapsed = sceneInspector.classList.toggle("collapsed");
    toggleInspectorBtn.textContent = collapsed ? "Pokaż dane" : "Ukryj dane";
  });

  // --- collapsible HUD: hides the settings markup only, form values persist ---
  toggleHudBtn.addEventListener("click", () => {
    isHudCollapsed = !isHudCollapsed;
    hudSettings.classList.toggle("hud-hidden", isHudCollapsed);
    toggleHudBtn.textContent = isHudCollapsed ? "Pokaż ustawienia" : "Ukryj ustawienia";
    toggleHudBtn.setAttribute("aria-expanded", String(!isHudCollapsed));
    // no liveUpdate()/runSimulation() call: the ResizeObserver on
    // simulationContainer picks up the reclaimed height and redraws the
    // cached rays — bottle/source/lens/grid/scale are all untouched.
  });

  // --- color overrides: rendering-only, never trigger a refetch ---
  function applyColorInputValues() {
    const colors = currentColors();
    for (const [key, input] of Object.entries(colorInputs)) {
      input.value = colors[key];
    }
  }
  applyColorInputValues();

  Object.entries(colorInputs).forEach(([key, input]) => {
    input.addEventListener("input", () => {
      userColors[key] = input.value;
      saveUserColors();
      if (lastResult) {
        draw(lastResult);
        showLegend();
      }
    });
  });

  resetColorsBtn.addEventListener("click", () => {
    userColors = {};
    saveUserColors();
    applyColorInputValues();
    if (lastResult) {
      draw(lastResult);
      showLegend();
    }
  });

  // --- point-source and lens-center dragging on the canvas ---
  function clampOutsideBottle(x, y) {
    const outerRadius = Number(outerRadiusInput.value) || 1;
    const minDistance = outerRadius * 1.05;
    const dist = Math.hypot(x, y);
    if (dist >= minDistance) return [x, y];
    if (dist < 1e-6) return [-minDistance, 0];
    const factor = minDistance / dist;
    return [x * factor, y * factor];
  }

  function pointerToCanvasXY(event) {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  // Dragging the source/lens marker writes to source_x/y_mm or
  // lens_center_x/y_mm and calls liveUpdate(); dragging empty canvas space
  // instead pans the view (a screen-pixel offset, redraw-only, no refetch).
  // Neither ever touches the bottle, grid, or scale, which are computed
  // purely from outerRadius + canvas size.
  canvas.addEventListener("pointerdown", (event) => {
    if (!lastTransform) return;
    const [mx, my] = pointerToCanvasXY(event);

    let sourceDist = Infinity;
    if (currentMode() === "point") {
      const [spx, spy] = [
        lastTransform.originX + Number(sourceXInput.value) * lastTransform.scale,
        lastTransform.originY - Number(sourceYInput.value) * lastTransform.scale,
      ];
      sourceDist = Math.hypot(mx - spx, my - spy);
    }

    let lensDist = Infinity;
    if (lensEnabledCheckbox.checked) {
      const [lpx, lpy] = [
        lastTransform.originX + Number(lensCenterXInput.value) * lastTransform.scale,
        lastTransform.originY - Number(lensCenterYInput.value) * lastTransform.scale,
      ];
      lensDist = Math.hypot(mx - lpx, my - lpy);
    }

    if (sourceDist > 14 && lensDist > 14) {
      draggingPan = true;
      panStartMouse = [mx, my];
      panStartOffset = [panOffsetX, panOffsetY];
      canvas.classList.add("dragging-source");
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (sourceDist <= lensDist) {
      draggingSource = true;
    } else {
      draggingLens = true;
    }
    canvas.classList.add("dragging-source");
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!lastTransform) return;

    if (draggingPan) {
      const [mx, my] = pointerToCanvasXY(event);
      panOffsetX = panStartOffset[0] + (mx - panStartMouse[0]);
      panOffsetY = panStartOffset[1] + (my - panStartMouse[1]);
      if (lastResult) draw(lastResult);
      return;
    }

    if (!draggingSource && !draggingLens) return;
    const [mx, my] = pointerToCanvasXY(event);
    const xmm = (mx - lastTransform.originX) / lastTransform.scale;
    const ymm = (lastTransform.originY - my) / lastTransform.scale;

    if (draggingSource) {
      const [cx, cy] = clampOutsideBottle(xmm, ymm);
      sourceXInput.value = cx.toFixed(1);
      sourceYInput.value = cy.toFixed(1);
    } else {
      lensCenterXInput.value = xmm.toFixed(1);
      lensCenterYInput.value = ymm.toFixed(1);
    }
    updateInspector(); // instant feedback; the debounced liveUpdate() below refreshes the rays
    liveUpdate();
  });

  function stopDragging(event) {
    if (!draggingSource && !draggingLens && !draggingPan) return;
    draggingSource = false;
    draggingLens = false;
    draggingPan = false;
    canvas.classList.remove("dragging-source");
    if (event) canvas.releasePointerCapture(event.pointerId);
  }

  canvas.addEventListener("pointerup", stopDragging);
  canvas.addEventListener("pointercancel", stopDragging);

  // Scroll-wheel zoom: multiplies zoomFactor and redraws the cached rays —
  // no refetch, no change to bottleCenter/world window/scale computation
  // beyond the multiplier itself, so the bottle stays put and only appears
  // bigger/smaller. preventDefault stops the page from scrolling instead.
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const zoomStep = Math.exp(-event.deltaY * 0.001);
      zoomFactor = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomFactor * zoomStep));
      if (lastResult) draw(lastResult);
    },
    { passive: false }
  );

  // ==========================================================================
  // Export / print at true physical 1:1 scale.
  //
  // This whole block reads getSceneModel() + lastResult and writes an SVG
  // string with width/height/viewBox in millimetres — it never touches the
  // canvas, devicePixelRatio, or the on-screen viewport, and never mutates
  // app state. 1 world mm = `scaleFactor` document mm (1 at "1:1").
  // ==========================================================================

  const PAGE_SIZES_MM = { A4: [210, 297], A3: [297, 420] };
  const EXPORT_MARGIN_MM = 10;
  const EXPORT_FINE_GRID_MM = 10;
  const EXPORT_MEDIUM_GRID_MM = 50;
  const EXPORT_MAJOR_GRID_MM = 100;

  function pageDimsMm(pageSize, orientation) {
    const [w, h] = PAGE_SIZES_MM[pageSize];
    return orientation === "landscape" ? [Math.max(w, h), Math.min(w, h)] : [Math.min(w, h), Math.max(w, h)];
  }

  function computeContentBBoxMm(m, includeRays) {
    let minX = -m.outerRadius;
    let maxX = m.outerRadius;
    let minY = -m.outerRadius;
    let maxY = m.outerRadius;

    if (m.lens) {
      minX = Math.min(minX, m.lens.centerXMm - m.lens.radiusMm);
      maxX = Math.max(maxX, m.lens.centerXMm + m.lens.radiusMm);
      minY = Math.min(minY, m.lens.centerYMm - m.lens.radiusMm);
      maxY = Math.max(maxY, m.lens.centerYMm + m.lens.radiusMm);
    }
    if (m.source) {
      minX = Math.min(minX, m.source.xMm);
      maxX = Math.max(maxX, m.source.xMm);
      minY = Math.min(minY, m.source.yMm);
      maxY = Math.max(maxY, m.source.yMm);
    }
    if (includeRays && lastResult) {
      for (const ray of lastResult.rays) {
        for (const [x, y] of ray.points) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    return { minX, maxX, minY, maxY };
  }

  function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  }

  function svgGrid(offsetX, offsetY, scaleFactor, color, pageW, pageH) {
    const worldMinX = (EXPORT_MARGIN_MM - offsetX) / scaleFactor;
    const worldMaxX = (pageW - EXPORT_MARGIN_MM - offsetX) / scaleFactor;
    const worldMinY = -(pageH - EXPORT_MARGIN_MM - offsetY) / scaleFactor;
    const worldMaxY = -(EXPORT_MARGIN_MM - offsetY) / scaleFactor;
    const docX = (x) => offsetX + x * scaleFactor;
    const docY = (y) => offsetY - y * scaleFactor;

    const parts = [`<g font-size="2.6">`];
    function tier(spacingMm, strokeWidth, opacity, withLabels) {
      const startX = Math.ceil(worldMinX / spacingMm) * spacingMm;
      for (let x = startX; x <= worldMaxX; x += spacingMm) {
        parts.push(
          `<line x1="${docX(x)}" y1="${EXPORT_MARGIN_MM}" x2="${docX(x)}" y2="${pageH - EXPORT_MARGIN_MM}" stroke="${color}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`
        );
        if (withLabels) {
          parts.push(`<text x="${docX(x)}" y="${pageH - EXPORT_MARGIN_MM + 4}" text-anchor="middle" fill="${color}">${x.toFixed(0)}</text>`);
        }
      }
      const startY = Math.ceil(worldMinY / spacingMm) * spacingMm;
      for (let y = startY; y <= worldMaxY; y += spacingMm) {
        parts.push(
          `<line x1="${EXPORT_MARGIN_MM}" y1="${docY(y)}" x2="${pageW - EXPORT_MARGIN_MM}" y2="${docY(y)}" stroke="${color}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`
        );
        if (withLabels) {
          parts.push(`<text x="${EXPORT_MARGIN_MM + 1}" y="${docY(y) - 1}" fill="${color}">${y.toFixed(0)}</text>`);
        }
      }
    }
    tier(EXPORT_FINE_GRID_MM, 0.08, 0.5, false);
    tier(EXPORT_MEDIUM_GRID_MM, 0.1, 0.7, false);
    tier(EXPORT_MAJOR_GRID_MM, 0.15, 1, true);
    parts.push(`</g>`);
    return parts.join("\n");
  }

  function svgDimensions(m, docX, docY, scaleFactor, color) {
    const parts = [`<g stroke="${color}" fill="${color}" font-size="3" stroke-width="0.2">`];

    function hDim(xCenter, yCenter, halfWidth, offset, label) {
      const y = docY(yCenter - offset);
      const x1 = docX(xCenter - halfWidth);
      const x2 = docX(xCenter + halfWidth);
      parts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`);
      parts.push(`<line x1="${x1}" y1="${y - 1.5}" x2="${x1}" y2="${y + 1.5}"/>`);
      parts.push(`<line x1="${x2}" y1="${y - 1.5}" x2="${x2}" y2="${y + 1.5}"/>`);
      parts.push(`<text x="${(x1 + x2) / 2}" y="${y + 4.5}" text-anchor="middle">${escapeXml(label)}</text>`);
    }

    function pDim(x1Mm, y1Mm, x2Mm, y2Mm, label) {
      const px1 = docX(x1Mm), py1 = docY(y1Mm), px2 = docX(x2Mm), py2 = docY(y2Mm);
      parts.push(`<line x1="${px1}" y1="${py1}" x2="${px2}" y2="${py2}"/>`);
      parts.push(`<circle cx="${px1}" cy="${py1}" r="0.8"/>`);
      parts.push(`<text x="${(px1 + px2) / 2 + 2}" y="${(py1 + py2) / 2 - 1.5}">${escapeXml(label)}</text>`);
    }

    hDim(0, 0, m.outerRadius, m.outerRadius + 6, `⌀ butelki = ${(m.outerRadius * 2).toFixed(0)} mm`);
    if (m.lens) {
      hDim(m.lens.centerXMm, m.lens.centerYMm, m.lens.radiusMm, m.lens.radiusMm + 6, `⌀ soczewki = ${m.lens.diameterMm.toFixed(0)} mm`);
      pDim(0, 0, m.lens.centerXMm, m.lens.centerYMm, `${Math.hypot(m.lens.centerXMm, m.lens.centerYMm).toFixed(0)} mm`);
    }
    if (m.source) {
      pDim(0, 0, m.source.xMm, m.source.yMm, `${Math.hypot(m.source.xMm, m.source.yMm).toFixed(0)} mm, θ=${m.centralAngleDeg.toFixed(0)}°`);
    }
    if (m.source && m.spreadDeg) {
      parts.push(`<text x="${docX(m.source.xMm)}" y="${docY(m.source.yMm) - 4}">rozwarcie = ${m.spreadDeg.toFixed(0)}°</text>`);
    }

    parts.push(`</g>`);
    return parts.join("\n");
  }

  function svgCalibration(pageW, pageH, scaleFactor, pageSize, orientation, oversizeFit) {
    const size = 100; // mm — fixed regardless of world scale: this checks the PRINTER, not the model
    const x = 8;
    const y = pageH - size - 24;
    const scaleLabel = scaleFactor === 1 ? "1:1" : scaleFactor === 2 ? "2:1" : "1:2";
    return `
      <g stroke="#000000" fill="none" stroke-width="0.3">
        <rect x="${x}" y="${y}" width="${size}" height="${size}"/>
        <line x1="${x}" y1="${y + size + 8}" x2="${x + size}" y2="${y + size + 8}"/>
        <line x1="${x}" y1="${y + size + 6}" x2="${x}" y2="${y + size + 10}"/>
        <line x1="${x + size}" y1="${y + size + 6}" x2="${x + size}" y2="${y + size + 10}"/>
      </g>
      <text x="${x}" y="${y + size + 14}" font-size="3" fill="#000000">Po wydrukowaniu bok kwadratu i ten odcinek powinny mieć dokładnie 100 mm.</text>
      <text x="${x}" y="${y + size + 18.5}" font-size="3" fill="#000000">Drukuj w skali 100% / Rzeczywisty rozmiar. Wyłącz opcję "Dopasuj do strony".</text>
      <text x="${x}" y="${y + size + 23}" font-size="3" fill="#000000">Skala: ${scaleLabel} (1 mm świata = ${scaleFactor.toFixed(2)} mm dokumentu). Format: ${pageSize} ${orientation === "landscape" ? "poziomo" : "pionowo"}${oversizeFit ? " (dopasowany)" : ""}.</text>
    `;
  }

  // Builds the full SVG document + reports whether it fits the chosen page
  // (at the chosen scale) so the UI can warn instead of silently rescaling.
  function buildSceneSvg(options) {
    const m = getSceneModel();
    const bbox = computeContentBBoxMm(m, options.showRays);
    const scaleFactor = options.scaleFactor;

    let pageW, pageH;
    if (options.oversizeFit) {
      pageW = Math.max((bbox.maxX - bbox.minX) * scaleFactor + 2 * EXPORT_MARGIN_MM, 140);
      pageH = Math.max((bbox.maxY - bbox.minY) * scaleFactor + 2 * EXPORT_MARGIN_MM, 140);
    } else {
      [pageW, pageH] = pageDimsMm(options.pageSize, options.orientation);
    }

    const bboxCenterX = (bbox.minX + bbox.maxX) / 2;
    const bboxCenterY = (bbox.minY + bbox.maxY) / 2;

    let offsetX, offsetY;
    if (options.oversizeFit || options.reference === "autofit") {
      offsetX = pageW / 2 - bboxCenterX * scaleFactor;
      offsetY = pageH / 2 + bboxCenterY * scaleFactor;
    } else if (options.reference === "custom") {
      offsetX = options.customPosMm.x;
      offsetY = options.customPosMm.y;
    } else {
      offsetX = pageW / 2;
      offsetY = pageH / 2;
    }

    const docX = (xMm) => offsetX + xMm * scaleFactor;
    const docY = (yMm) => offsetY - yMm * scaleFactor;

    let fits = true;
    if (!options.oversizeFit) {
      const corners = [
        [bbox.minX, bbox.minY],
        [bbox.maxX, bbox.maxY],
        [bbox.minX, bbox.maxY],
        [bbox.maxX, bbox.minY],
      ];
      for (const [wx, wy] of corners) {
        const x = docX(wx);
        const y = docY(wy);
        if (x < EXPORT_MARGIN_MM || x > pageW - EXPORT_MARGIN_MM || y < EXPORT_MARGIN_MM || y > pageH - EXPORT_MARGIN_MM) {
          fits = false;
        }
      }
    }

    const colorMode = options.colorMode;
    const c = currentColors();
    const strokeBottle = colorMode ? c.bottle : "#000000";
    const strokeLens = colorMode ? c.lens : "#000000";
    const strokeIncident = colorMode ? c.incident : "#000000";
    const strokeRefracted = colorMode ? c.refracted : "#000000";
    const strokeGrid = colorMode ? c.grid : "#999999";
    const fillSource = colorMode ? c.source : "#000000";

    const parts = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}mm" height="${pageH}mm" viewBox="0 0 ${pageW} ${pageH}" font-family="sans-serif">`
    );
    parts.push(`<rect x="0" y="0" width="${pageW}" height="${pageH}" fill="#ffffff"/>`);

    if (options.showGrid) {
      parts.push(svgGrid(offsetX, offsetY, scaleFactor, strokeGrid, pageW, pageH));
    }

    parts.push(`<circle cx="${docX(0)}" cy="${docY(0)}" r="${m.outerRadius * scaleFactor}" fill="none" stroke="${strokeBottle}" stroke-width="0.3"/>`);
    parts.push(`<circle cx="${docX(0)}" cy="${docY(0)}" r="${m.innerRadius * scaleFactor}" fill="none" stroke="${strokeBottle}" stroke-width="0.3"/>`);

    if (m.lens) {
      parts.push(
        `<circle cx="${docX(m.lens.centerXMm)}" cy="${docY(m.lens.centerYMm)}" r="${m.lens.radiusMm * scaleFactor}" fill="none" stroke="${strokeLens}" stroke-width="0.3"/>`
      );
    }

    if (m.source) {
      parts.push(`<circle cx="${docX(m.source.xMm)}" cy="${docY(m.source.yMm)}" r="1.2" fill="${fillSource}"/>`);
    }

    if (options.showRays && lastResult) {
      for (const ray of lastResult.rays) {
        const pts = ray.points;
        if (pts.length >= 2) {
          const seg = `${docX(pts[0][0])},${docY(pts[0][1])} ${docX(pts[1][0])},${docY(pts[1][1])}`;
          parts.push(`<polyline points="${seg}" fill="none" stroke="${strokeIncident}" stroke-width="0.25"/>`);
        }
        if (pts.length > 2) {
          const rest = pts.slice(1).map(([x, y]) => `${docX(x)},${docY(y)}`).join(" ");
          parts.push(`<polyline points="${rest}" fill="none" stroke="${strokeRefracted}" stroke-width="0.25"/>`);
        }
      }
    }

    if (options.showDimensions) {
      parts.push(svgDimensions(m, docX, docY, scaleFactor, "#555555"));
    }

    parts.push(svgCalibration(pageW, pageH, scaleFactor, options.pageSize, options.orientation, options.oversizeFit));
    parts.push(`</svg>`);

    return { svg: parts.join("\n"), fits, pageW, pageH };
  }

  function currentExportOptions(oversizeFit) {
    return {
      pageSize: exportPageSize.value,
      orientation: exportOrientation.value,
      scaleFactor: Number(exportScale.value),
      reference: exportReferenceSelect.value,
      customPosMm: { x: Number(exportPosX.value) || 0, y: Number(exportPosY.value) || 0 },
      showGrid: exportShowGrid.checked,
      showRays: exportShowRays.checked,
      showDimensions: exportShowDimensions.checked,
      colorMode: exportShowColors.checked,
      oversizeFit: Boolean(oversizeFit),
    };
  }

  function refreshExportWarning() {
    const { fits } = buildSceneSvg(currentExportOptions(false));
    exportWarning.classList.toggle("hidden", fits);
    exportOversizeBtn.classList.toggle("hidden", fits);
    if (!fits) {
      exportWarning.textContent =
        "Scena jest większa niż wybrany format przy tej skali. Wybierz większy format, zmień skalę albo użyj eksportu całej sceny (dopasowany rozmiar strony).";
    }
  }

  openExportBtn.addEventListener("click", () => {
    // seed from the current on-screen toggles so the export starts consistent with what's visible
    exportShowGrid.checked = showGridCheckbox.checked;
    exportShowDimensions.checked = showDimensionsCheckbox.checked;
    refreshExportWarning();
    exportDialog.showModal();
  });

  exportReferenceSelect.addEventListener("change", () => {
    exportCustomPosition.classList.toggle("hidden", exportReferenceSelect.value !== "custom");
    refreshExportWarning();
  });

  [exportPageSize, exportOrientation, exportScale, exportShowGrid, exportShowRays, exportShowDimensions, exportPosX, exportPosY].forEach(
    (el) => {
      el.addEventListener("input", refreshExportWarning);
      el.addEventListener("change", refreshExportWarning);
    }
  );

  function downloadSvg(svgString, filename) {
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  exportDownloadBtn.addEventListener("click", () => {
    const { svg } = buildSceneSvg(currentExportOptions(false));
    downloadSvg(svg, "bottle-simulation-1to1.svg");
  });

  exportOversizeBtn.addEventListener("click", () => {
    const { svg } = buildSceneSvg(currentExportOptions(true));
    downloadSvg(svg, "bottle-simulation-1to1.svg");
  });

  let dynamicPrintStyle = null;

  function openPrintView() {
    const { svg, pageW, pageH } = buildSceneSvg(currentExportOptions(false));
    printViewContent.innerHTML = svg;

    if (!dynamicPrintStyle) {
      dynamicPrintStyle = document.createElement("style");
      dynamicPrintStyle.id = "dynamic-print-style";
      document.head.appendChild(dynamicPrintStyle);
    }
    dynamicPrintStyle.textContent = `@page { size: ${pageW}mm ${pageH}mm; margin: 0; }`;

    printView.classList.remove("hidden");
    exportDialog.close();
  }

  exportPrintViewBtn.addEventListener("click", openPrintView);
  printNowBtn.addEventListener("click", () => window.print());
  printCloseBtn.addEventListener("click", () => printView.classList.add("hidden"));

  // Resizing the viewport (window resize, toolbar collapsing/expanding, a
  // <details> section opening) only needs to re-render the cached rays at
  // the new canvas pixel size — it must never re-fit, re-center, or rescale
  // the fixed world window, and never needs a network round-trip.
  const redrawOnResize = debounce(() => {
    if (lastResult) draw(lastResult);
  }, 100);
  new ResizeObserver(redrawOnResize).observe(simulationContainer);

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (lastResult) draw(lastResult);
    });

  runSimulation();
})();
