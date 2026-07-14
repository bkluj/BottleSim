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
  const mirrorEnabledCheckbox = document.getElementById("mirror_enabled");
  const mirrorFields = document.getElementById("mirror-fields");
  const mirrorCenterXInput = document.getElementById("mirror_center_x_mm");
  const mirrorCenterYInput = document.getElementById("mirror_center_y_mm");
  const mirrorLengthInput = document.getElementById("mirror_length_mm");
  const mirrorAngleInput = document.getElementById("mirror_angle_deg");

  // --- positioning mode: cartesian (X/Y, draggable) vs orbital (angle + gap distances) ---
  const positionModeRadios = form.querySelectorAll('input[name="position_mode"]');
  const lensCartesianFields = document.getElementById("lens-cartesian-fields");
  const sourceCartesianFields = document.getElementById("source-cartesian-fields");
  const orbitalFields = document.getElementById("orbital-fields");
  const sourceOrbitalFields = document.getElementById("source-orbital-fields");
  const lensOrbitalAngleInput = document.getElementById("lens_orbital_angle_deg");
  const sourceOrbitalAngleInput = document.getElementById("source_orbital_angle_deg");
  const linkOrbitalAnglesCheckbox = document.getElementById("link_orbital_angles");
  const bottleLensGapInput = document.getElementById("bottle_lens_gap_mm");
  const sourceLensGapInput = document.getElementById("source_lens_gap_mm");
  const orbitalValidationMsg = document.getElementById("orbital-validation-msg");
  // Used only as a fallback radial distance for the source when the lens is
  // disabled (so there's no lens surface to measure the source gap against).
  const DEFAULT_SOURCE_STANDOFF_MM = 135;

  // --- per-ray-type opacity: rendering-only, applies to canvas, print view, and SVG export ---
  const incidentAlphaInput = document.getElementById("incident_alpha");
  const refractedAlphaInput = document.getElementById("refracted_alpha");
  const reflectedAlphaInput = document.getElementById("reflected_alpha");

  function currentAlphas() {
    const clamp = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);
    return {
      incident: clamp(Number(incidentAlphaInput.value)),
      refracted: clamp(Number(refractedAlphaInput.value)),
      reflected: clamp(Number(reflectedAlphaInput.value)),
    };
  }
  const resetColorsBtn = document.getElementById("reset-colors-btn");
  const colorInputs = {
    bottle: document.getElementById("color_bottle"),
    lens: document.getElementById("color_lens"),
    mirror: document.getElementById("color_mirror"),
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
  const exportShowReflected = document.getElementById("export_show_reflected");
  const exportShowDimensions = document.getElementById("export_show_dimensions");
  const exportShowColors = document.getElementById("export_show_colors");
  const exportWarning = document.getElementById("export-warning");
  const exportDownloadBtn = document.getElementById("export-download-btn");
  const exportDownloadPdfBtn = document.getElementById("export-download-pdf-btn");
  const exportOversizeBtn = document.getElementById("export-oversize-btn");
  const exportPrintViewBtn = document.getElementById("export-print-view-btn");
  const printView = document.getElementById("print-view");
  const printViewContent = document.getElementById("print-view-content");
  const printNowBtn = document.getElementById("print-now-btn");
  const printCloseBtn = document.getElementById("print-close-btn");

  // --- settings save/load (JSON) ---
  const saveSettingsBtn = document.getElementById("save-settings-btn");
  const loadSettingsBtn = document.getElementById("load-settings-btn");
  const loadSettingsInput = document.getElementById("load-settings-input");

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
      mirror: style.getPropertyValue("--mirror").trim(),
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

    const mirror = mirrorEnabledCheckbox.checked
      ? (() => {
          const centerXMm = Number(mirrorCenterXInput.value) || 0;
          const centerYMm = Number(mirrorCenterYInput.value) || 0;
          const lengthMm = Number(mirrorLengthInput.value) || 0;
          const angleDeg = Number(mirrorAngleInput.value) || 0;
          const angleRad = (angleDeg * Math.PI) / 180;
          const dir = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
          const half = lengthMm / 2;
          return {
            centerXMm,
            centerYMm,
            lengthMm,
            angleDeg,
            p1: { x: centerXMm - dir.x * half, y: centerYMm - dir.y * half },
            p2: { x: centerXMm + dir.x * half, y: centerYMm + dir.y * half },
          };
        })()
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
      mirror,
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
    params.mirror_enabled = mirrorEnabledCheckbox.checked;
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

    const angleAroundCenterDeg = (xMm, yMm) => (Math.atan2(yMm, xMm) * 180) / Math.PI;

    if (m.lens) {
      setInsp("insp-lens-x", fmtUnit(m.lens.centerXMm, "mm"));
      setInsp("insp-lens-y", fmtUnit(m.lens.centerYMm, "mm"));
      setInsp("insp-lens-d", fmtUnit(m.lens.diameterMm, "mm"));
      setInsp("insp-lens-n", m.lens.n.toFixed(3));
      setInsp("insp-lens-angle", fmtUnit(angleAroundCenterDeg(m.lens.centerXMm, m.lens.centerYMm), "°"));
    } else {
      ["insp-lens-x", "insp-lens-y", "insp-lens-d", "insp-lens-n", "insp-lens-angle"].forEach((id) => setInsp(id, "—"));
    }

    if (m.mirror) {
      setInsp("insp-mirror-active", "tak");
      setInsp("insp-mirror-x", fmtUnit(m.mirror.centerXMm, "mm"));
      setInsp("insp-mirror-y", fmtUnit(m.mirror.centerYMm, "mm"));
      setInsp("insp-mirror-length", fmtUnit(m.mirror.lengthMm, "mm"));
      setInsp("insp-mirror-angle", fmtUnit(m.mirror.angleDeg, "°"));
    } else {
      setInsp("insp-mirror-active", "nie");
      ["insp-mirror-x", "insp-mirror-y", "insp-mirror-length", "insp-mirror-angle"].forEach((id) => setInsp(id, "—"));
    }

    if (m.source) {
      setInsp("insp-source-x", fmtUnit(m.source.xMm, "mm"));
      setInsp("insp-source-y", fmtUnit(m.source.yMm, "mm"));
      setInsp("insp-source-dist", fmtUnit(Math.hypot(m.source.xMm, m.source.yMm), "mm"));
      setInsp("insp-source-angle", fmtUnit(angleAroundCenterDeg(m.source.xMm, m.source.yMm), "°"));
    } else {
      ["insp-source-x", "insp-source-y", "insp-source-dist", "insp-source-angle"].forEach((id) =>
        setInsp(id, "— (równoległa)")
      );
    }

    setInsp("insp-beam-angle", fmtUnit(m.centralAngleDeg, "°"));
    setInsp("insp-beam-spread", m.spreadDeg === null ? "—" : fmtUnit(m.spreadDeg, "°"));
    setInsp("insp-beam-mode", m.angleModeLabel);
    setInsp("insp-ray-count", String(m.rayCount));

    // Gaps are surface-to-surface (center distance minus the radii involved),
    // matching how "odległość" is defined for the orbital positioning mode.
    setInsp(
      "insp-dist-source-lens",
      m.source && m.lens
        ? fmtUnit(Math.hypot(m.source.xMm - m.lens.centerXMm, m.source.yMm - m.lens.centerYMm) - m.lens.radiusMm, "mm")
        : "—"
    );
    setInsp(
      "insp-dist-lens-bottle",
      m.lens ? fmtUnit(Math.hypot(m.lens.centerXMm, m.lens.centerYMm) - m.outerRadius - m.lens.radiusMm, "mm") : "—"
    );
    setInsp(
      "insp-angle-source-center",
      m.source ? fmtUnit((Math.atan2(-m.source.yMm, -m.source.xMm) * 180) / Math.PI, "°") : "—"
    );
    setInsp(
      "insp-angle-diff",
      m.source && m.lens
        ? fmtUnit(
            ((angleAroundCenterDeg(m.lens.centerXMm, m.lens.centerYMm) -
              angleAroundCenterDeg(m.source.xMm, m.source.yMm) +
              540) %
              360) -
              180,
            "°"
          )
        : "—"
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

    // mirror — an opaque segment, drawn as a thick line with perpendicular
    // hatch ticks (standard optics-diagram notation for a reflective surface)
    // so it reads as clearly distinct from the lens circle / bottle rings.
    if (mirrorEnabledCheckbox.checked) {
      const centerXMm = Number(mirrorCenterXInput.value) || 0;
      const centerYMm = Number(mirrorCenterYInput.value) || 0;
      const lengthMm = Number(mirrorLengthInput.value) || 0;
      const angleRad = ((Number(mirrorAngleInput.value) || 0) * Math.PI) / 180;
      const dir = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
      const half = lengthMm / 2;
      const [mx1, my1] = toCanvas(centerXMm - dir.x * half, centerYMm - dir.y * half);
      const [mx2, my2] = toCanvas(centerXMm + dir.x * half, centerYMm + dir.y * half);

      ctx.strokeStyle = colors.mirror;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(mx1, my1);
      ctx.lineTo(mx2, my2);
      ctx.stroke();

      // hatch ticks along the back of the mirror
      const nx = -dir.y;
      const ny = dir.x;
      const tickLenPx = 7;
      const tickCount = Math.max(2, Math.round(lengthMm / 12));
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= tickCount; i++) {
        const t = i / tickCount;
        const px = mx1 + (mx2 - mx1) * t;
        const py = my1 + (my2 - my1) * t;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + nx * tickLenPx, py - ny * tickLenPx);
        ctx.stroke();
      }
    }

    // rays — dense beams skip per-vertex markers and thin out for readability.
    // First segment (source to first hit) is drawn as "incident", the rest of
    // the transmitted path as "refracted" — a simple visual split, not a new
    // physical concept: the geometry itself is untouched.
    const dense = rays.length > 60;
    const alphas = currentAlphas();
    ctx.lineWidth = dense ? 1 : 1.5;

    for (const ray of rays) {
      const pts = ray.points;

      ctx.strokeStyle = colors.incident;
      ctx.globalAlpha = (dense ? 0.55 : 1) * alphas.incident;
      ctx.beginPath();
      const [ix0, iy0] = toCanvas(pts[0][0], pts[0][1]);
      ctx.moveTo(ix0, iy0);
      const [ix1, iy1] = toCanvas(pts[Math.min(1, pts.length - 1)][0], pts[Math.min(1, pts.length - 1)][1]);
      ctx.lineTo(ix1, iy1);
      ctx.stroke();

      if (pts.length > 2) {
        ctx.strokeStyle = colors.refracted;
        ctx.globalAlpha = (dense ? 0.55 : 1) * alphas.refracted;
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
        ctx.globalAlpha = alphas.refracted;
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
      ctx.globalAlpha = (dense ? 0.45 : 0.75) * alphas.reflected;
      ctx.setLineDash([6, 4]);
      for (const ray of rays) {
        for (const segment of ray.reflected) {
          ctx.beginPath();
          segment.points.forEach(([x, y], i) => {
            const [px, py] = toCanvas(x, y);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
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
    // Single choke point: whatever triggered this call (bottle radius, lens
    // diameter, an orbital angle/gap, or a mode switch), re-derive lens/source
    // X/Y from the orbital inputs first if that positioning mode is active.
    syncOrbitalPositions();

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
      applyPositionMode();
      syncOrbitalPositions();
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
    syncOrbitalPositions();
    liveUpdate();
  });
  applyLensMode();

  // Mirror is a self-contained opaque obstacle: no positioning-mode coupling
  // (no orbital placement, unlike the lens) — plain X/Y + length + angle only.
  function applyMirrorMode() {
    mirrorFields.classList.toggle("hidden", !mirrorEnabledCheckbox.checked);
  }
  mirrorEnabledCheckbox.addEventListener("change", () => {
    applyMirrorMode();
    liveUpdate();
  });
  applyMirrorMode();

  // --- positioning mode: cartesian (direct X/Y, draggable) vs orbital
  // (angle around the bottle + surface-to-surface gap distances). Either way,
  // the actual physics/backend payload is still just lens_center_x/y_mm and
  // source_x/y_mm — orbital mode only computes those two pairs differently
  // and writes them into the same (now hidden) cartesian inputs.
  function currentPositionMode() {
    return form.querySelector('input[name="position_mode"]:checked').value;
  }

  function applyPositionMode() {
    const isOrbital = currentPositionMode() === "orbital";
    lensCartesianFields.classList.toggle("hidden", isOrbital);
    sourceCartesianFields.classList.toggle("hidden", isOrbital);
    orbitalFields.classList.toggle("hidden", !isOrbital);
    sourceOrbitalFields.classList.toggle("hidden", currentMode() !== "point");
    if (!isOrbital) {
      orbitalValidationMsg.classList.add("hidden");
    }
  }

  // Solves for the source's distance from the bottle center (rho) along the
  // fixed direction sourceOrbitalAngleDeg, such that its distance to the LENS
  // SURFACE equals sourceLensGapMm: |rho*u - L| = lensRadius + gap. Expanding
  // that gives rho^2 - 2*rho*(u.L) + |L|^2 - (lensRadius+gap)^2 = 0; of its
  // (up to two) positive roots outside the bottle, the farther one is kept —
  // matching the requested "collinear beyond the lens" placement when linked.
  function solveSourceRadialDistance(sourceDirection, lensCenter, lensRadius, gapMm, bottleRadius) {
    const targetDist = lensRadius + gapMm;
    const uDotL = sourceDirection.x * lensCenter.x + sourceDirection.y * lensCenter.y;
    const lensDistSq = lensCenter.x * lensCenter.x + lensCenter.y * lensCenter.y;
    const a = 1;
    const b = -2 * uDotL;
    const c = lensDistSq - targetDist * targetDist;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;

    const sqrtDisc = Math.sqrt(discriminant);
    const roots = [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)];
    const valid = roots.filter((r) => r > bottleRadius + 1e-6);
    return valid.length ? Math.max(...valid) : null;
  }

  // Recomputes lens_center_x/y_mm and (in point mode) source_x/y_mm from the
  // orbital angle/gap inputs. No-op outside orbital mode. Never resets the
  // source position on failure — it just leaves the last valid X/Y in place
  // and surfaces a validation message, as requested.
  function syncOrbitalPositions() {
    if (currentPositionMode() !== "orbital") return;

    const bottleRadius = Number(outerRadiusInput.value) || 0;
    const lensOn = lensEnabledCheckbox.checked;
    const lensRadius = (Number(lensDiameterInput.value) || 0) / 2;
    const lensAngleRad = ((Number(lensOrbitalAngleInput.value) || 0) * Math.PI) / 180;
    const lensDirection = { x: Math.cos(lensAngleRad), y: Math.sin(lensAngleRad) };

    let lensCenter = null;
    if (lensOn) {
      const bottleLensGap = Number(bottleLensGapInput.value) || 0;
      const lensCenterDistance = bottleRadius + bottleLensGap + lensRadius;
      lensCenter = { x: lensDirection.x * lensCenterDistance, y: lensDirection.y * lensCenterDistance };
      lensCenterXInput.value = lensCenter.x.toFixed(1);
      lensCenterYInput.value = lensCenter.y.toFixed(1);
    }

    if (currentMode() !== "point") {
      orbitalValidationMsg.classList.add("hidden");
      return; // parallel beams have no discrete source position to place
    }

    const sourceAngleRad = ((Number(sourceOrbitalAngleInput.value) || 0) * Math.PI) / 180;
    const sourceDirection = { x: Math.cos(sourceAngleRad), y: Math.sin(sourceAngleRad) };

    let sourceRadialDistance;
    if (lensOn) {
      const gap = Number(sourceLensGapInput.value) || 0;
      sourceRadialDistance = solveSourceRadialDistance(sourceDirection, lensCenter, lensRadius, gap, bottleRadius);
    } else {
      // No lens surface to gap against — fall back to a fixed standoff.
      sourceRadialDistance = bottleRadius + DEFAULT_SOURCE_STANDOFF_MM;
    }

    if (sourceRadialDistance === null) {
      orbitalValidationMsg.textContent = "Dla podanych kątów nie można zachować zadanej odległości źródło–soczewka.";
      orbitalValidationMsg.classList.remove("hidden");
      return; // keep the last valid source_x_mm/source_y_mm untouched
    }

    orbitalValidationMsg.classList.add("hidden");
    sourceXInput.value = (sourceDirection.x * sourceRadialDistance).toFixed(1);
    sourceYInput.value = (sourceDirection.y * sourceRadialDistance).toFixed(1);
  }

  positionModeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      applyPositionMode();
      syncOrbitalPositions();
      liveUpdate();
    });
  });
  applyPositionMode();

  lensOrbitalAngleInput.addEventListener("input", () => {
    if (linkOrbitalAnglesCheckbox.checked) {
      sourceOrbitalAngleInput.value = lensOrbitalAngleInput.value;
    }
    syncOrbitalPositions();
    liveUpdate();
  });

  sourceOrbitalAngleInput.addEventListener("input", () => {
    syncOrbitalPositions();
    liveUpdate();
  });

  linkOrbitalAnglesCheckbox.addEventListener("change", () => {
    sourceOrbitalAngleInput.disabled = linkOrbitalAnglesCheckbox.checked;
    if (linkOrbitalAnglesCheckbox.checked) {
      sourceOrbitalAngleInput.value = lensOrbitalAngleInput.value;
    }
    syncOrbitalPositions();
    liveUpdate();
  });

  [bottleLensGapInput, sourceLensGapInput].forEach((input) => {
    input.addEventListener("input", () => {
      syncOrbitalPositions();
      liveUpdate();
    });
  });

  form.addEventListener("submit", (event) => event.preventDefault());
  form
    .querySelectorAll(
      'input:not(#ray_count_slider):not(#ray_count):not([name="mode"]):not(#angle_link_center):not(#show_grid):not(#lens_enabled):not(#mirror_enabled):not(#show_dimensions):not([type="color"]):not([type="range"])' +
        ':not([name="position_mode"]):not(#link_orbital_angles):not(#lens_orbital_angle_deg):not(#source_orbital_angle_deg):not(#bottle_lens_gap_mm):not(#source_lens_gap_mm)'
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

  [incidentAlphaInput, refractedAlphaInput, reflectedAlphaInput].forEach((input) => {
    input.addEventListener("input", () => {
      if (lastResult) draw(lastResult);
    });
  });

  // --- settings save/load: dumps/restores every toolbar value (geometry,
  // source, beam, lens, view toggles, colors) as a single JSON file, so a
  // scene can be handed off or reloaded later without retyping it.
  const SETTINGS_FIELD_IDS = [
    "outer_radius_mm", "wall_thickness_mm",
    "n_outside", "n_glass", "n_inside",
    "source_x_mm", "source_y_mm",
    "ray_count",
    "beam_angle_deg", "beam_half_height_mm",
    "point_beam_angle_deg", "aim_offset_deg", "beam_spread_deg",
    "lens_center_x_mm", "lens_center_y_mm", "lens_diameter_mm", "lens_refractive_index",
    "mirror_center_x_mm", "mirror_center_y_mm", "mirror_length_mm", "mirror_angle_deg",
  ];
  const SETTINGS_CHECKBOX_IDS = ["angle_link_center", "lens_enabled", "mirror_enabled", "show_grid", "show_dimensions"];

  function gatherSettings() {
    const values = {};
    for (const id of SETTINGS_FIELD_IDS) {
      values[id] = document.getElementById(id).value;
    }
    const checkboxes = {};
    for (const id of SETTINGS_CHECKBOX_IDS) {
      checkboxes[id] = document.getElementById(id).checked;
    }
    return {
      version: 1,
      mode: currentMode(),
      values,
      checkboxes,
      showReflectedRays,
      userColors,
      // Orbital (angle + gap-distance) positioning, saved regardless of which
      // mode is currently active so switching back to it later restores the
      // last values; older files without these keys stay in cartesian mode.
      positionMode: currentPositionMode(),
      lensOrbitalAngleDeg: Number(lensOrbitalAngleInput.value),
      sourceOrbitalAngleDeg: Number(sourceOrbitalAngleInput.value),
      linkOrbitalAngles: linkOrbitalAnglesCheckbox.checked,
      bottleLensGapMm: Number(bottleLensGapInput.value),
      sourceLensGapMm: Number(sourceLensGapInput.value),
      incidentAlpha: Number(incidentAlphaInput.value),
      refractedAlpha: Number(refractedAlphaInput.value),
      reflectedAlpha: Number(reflectedAlphaInput.value),
    };
  }

  function applySettings(data) {
    if (!data || typeof data !== "object") {
      throw new Error("Nieprawidłowy plik ustawień.");
    }

    if (data.values && typeof data.values === "object") {
      for (const [id, value] of Object.entries(data.values)) {
        const input = document.getElementById(id);
        if (input) input.value = value;
      }
    }
    if (data.checkboxes && typeof data.checkboxes === "object") {
      for (const [id, checked] of Object.entries(data.checkboxes)) {
        const input = document.getElementById(id);
        if (input) input.checked = Boolean(checked);
      }
    }
    if (data.mode === "parallel" || data.mode === "point") {
      const radio = form.querySelector(`input[name="mode"][value="${data.mode}"]`);
      if (radio) radio.checked = true;
    }
    if (data.userColors && typeof data.userColors === "object") {
      userColors = { ...data.userColors };
      saveUserColors();
    }
    if (typeof data.showReflectedRays === "boolean") {
      showReflectedRays = data.showReflectedRays;
      toggleReflectedBtn.setAttribute("aria-pressed", String(showReflectedRays));
      toggleReflectedBtn.textContent = showReflectedRays
        ? "Ukryj promienie odbite"
        : "Pokaż promienie odbite";
    }

    // Older JSON files predate orbital positioning and carry none of these
    // keys — they must keep working in plain cartesian mode.
    if (typeof data.lensOrbitalAngleDeg === "number") lensOrbitalAngleInput.value = data.lensOrbitalAngleDeg;
    if (typeof data.sourceOrbitalAngleDeg === "number") sourceOrbitalAngleInput.value = data.sourceOrbitalAngleDeg;
    if (typeof data.bottleLensGapMm === "number") bottleLensGapInput.value = data.bottleLensGapMm;
    if (typeof data.sourceLensGapMm === "number") sourceLensGapInput.value = data.sourceLensGapMm;
    if (typeof data.linkOrbitalAngles === "boolean") {
      linkOrbitalAnglesCheckbox.checked = data.linkOrbitalAngles;
      sourceOrbitalAngleInput.disabled = data.linkOrbitalAngles;
    }
    const positionModeRadio = form.querySelector(
      `input[name="position_mode"][value="${data.positionMode === "orbital" ? "orbital" : "cartesian"}"]`
    );
    if (positionModeRadio) positionModeRadio.checked = true;

    // Older JSON files predate per-ray-type opacity — default to fully opaque (1).
    incidentAlphaInput.value = typeof data.incidentAlpha === "number" ? data.incidentAlpha : 1;
    refractedAlphaInput.value = typeof data.refractedAlpha === "number" ? data.refractedAlpha : 1;
    reflectedAlphaInput.value = typeof data.reflectedAlpha === "number" ? data.reflectedAlpha : 1;

    syncRayCount(rayCountNumber.value);
    applyMode();
    applyAngleMode();
    applyLensMode();
    applyMirrorMode();
    applyPositionMode();
    syncOrbitalPositions();
    applyColorInputValues();
    gridNoteEl.classList.toggle("hidden", !showGridCheckbox.checked);
    runSimulation();
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  saveSettingsBtn.addEventListener("click", () => {
    downloadJson(gatherSettings(), "bottlesim-ustawienia.json");
  });

  loadSettingsBtn.addEventListener("click", () => {
    loadSettingsInput.value = "";
    loadSettingsInput.click();
  });

  loadSettingsInput.addEventListener("change", async () => {
    const file = loadSettingsInput.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      applySettings(data);
      setStatus("Wczytano ustawienia z pliku.", false);
    } catch (err) {
      setStatus(`Nie udało się wczytać ustawień: ${err.message}`, true);
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

    // In orbital mode, source/lens X/Y are derived from the angle+gap inputs,
    // not directly draggable — dragging the canvas always pans instead.
    const positioningLocked = currentPositionMode() === "orbital";

    let sourceDist = Infinity;
    if (!positioningLocked && currentMode() === "point") {
      const [spx, spy] = [
        lastTransform.originX + Number(sourceXInput.value) * lastTransform.scale,
        lastTransform.originY - Number(sourceYInput.value) * lastTransform.scale,
      ];
      sourceDist = Math.hypot(mx - spx, my - spy);
    }

    let lensDist = Infinity;
    if (!positioningLocked && lensEnabledCheckbox.checked) {
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

  function computeContentBBoxMm(m, includeRays, includeReflected) {
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
    if (m.mirror) {
      minX = Math.min(minX, m.mirror.p1.x, m.mirror.p2.x);
      maxX = Math.max(maxX, m.mirror.p1.x, m.mirror.p2.x);
      minY = Math.min(minY, m.mirror.p1.y, m.mirror.p2.y);
      maxY = Math.max(maxY, m.mirror.p1.y, m.mirror.p2.y);
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
    if (includeReflected && lastResult) {
      for (const ray of lastResult.rays) {
        for (const segment of ray.reflected) {
          for (const [x, y] of segment.points) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
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

    const parts = [`<g>`];
    function tier(spacingMm, strokeWidth, opacity) {
      const startX = Math.ceil(worldMinX / spacingMm) * spacingMm;
      for (let x = startX; x <= worldMaxX; x += spacingMm) {
        parts.push(
          `<line x1="${docX(x)}" y1="${EXPORT_MARGIN_MM}" x2="${docX(x)}" y2="${pageH - EXPORT_MARGIN_MM}" stroke="${color}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`
        );
      }
      const startY = Math.ceil(worldMinY / spacingMm) * spacingMm;
      for (let y = startY; y <= worldMaxY; y += spacingMm) {
        parts.push(
          `<line x1="${EXPORT_MARGIN_MM}" y1="${docY(y)}" x2="${pageW - EXPORT_MARGIN_MM}" y2="${docY(y)}" stroke="${color}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`
        );
      }
    }
    tier(EXPORT_FINE_GRID_MM, 0.08, 0.5);
    tier(EXPORT_MEDIUM_GRID_MM, 0.1, 0.7);
    tier(EXPORT_MAJOR_GRID_MM, 0.15, 1);
    parts.push(`</g>`);
    return parts.join("\n");
  }

  // Dimension lines only — no text on the drawing itself; every value and
  // label lives in svgTechTable() instead, to keep the printed scene clean.
  function svgDimensions(m, docX, docY, scaleFactor, color) {
    const parts = [`<g stroke="${color}" fill="${color}" font-size="3" stroke-width="0.2">`];

    function pDim(x1Mm, y1Mm, x2Mm, y2Mm) {
      const px1 = docX(x1Mm), py1 = docY(y1Mm), px2 = docX(x2Mm), py2 = docY(y2Mm);
      parts.push(`<line x1="${px1}" y1="${py1}" x2="${px2}" y2="${py2}"/>`);
      parts.push(`<circle cx="${px1}" cy="${py1}" r="0.8"/>`);
    }

    if (m.lens) {
      pDim(0, 0, m.lens.centerXMm, m.lens.centerYMm);
    }
    if (m.source) {
      pDim(0, 0, m.source.xMm, m.source.yMm);
    }

    parts.push(`</g>`);
    return parts.join("\n");
  }

  // Small technical table (corner of the print) holding every value that used
  // to be written directly on the drawing as long labels.
  function svgTechTable(m, pageW, color) {
    const lensSourceGapMm =
      m.source && m.lens
        ? Math.hypot(m.source.xMm - m.lens.centerXMm, m.source.yMm - m.lens.centerYMm) - m.lens.radiusMm
        : null;
    const bottleLensGapMm = m.lens ? Math.hypot(m.lens.centerXMm, m.lens.centerYMm) - m.outerRadius - m.lens.radiusMm : null;
    const sourceAngleDeg = m.source ? (Math.atan2(m.source.yMm, m.source.xMm) * 180) / Math.PI : null;
    const lensAngleDeg = m.lens ? (Math.atan2(m.lens.centerYMm, m.lens.centerXMm) * 180) / Math.PI : null;

    const rows = [
      ["Ø butelki", `${(m.outerRadius * 2).toFixed(0)} mm`],
      ["grubosc scianki", `${(m.outerRadius - m.innerRadius).toFixed(1)} mm`],
      ["Ø soczewki", m.lens ? `${m.lens.diameterMm.toFixed(0)} mm` : "—"],
      ["n soczewki", m.lens ? m.lens.n.toFixed(3) : "—"],
      ["Odleglosc soczewka-LED", lensSourceGapMm !== null ? `${lensSourceGapMm.toFixed(0)} mm` : "—"],
      ["Odleglosc butelka-soczewka", bottleLensGapMm !== null ? `${bottleLensGapMm.toFixed(0)} mm` : "—"],
      ["kat zrodla", sourceAngleDeg !== null ? `${sourceAngleDeg.toFixed(0)}°` : "—"],
      ["kat soczewki", lensAngleDeg !== null ? `${lensAngleDeg.toFixed(0)}°` : "—"],
      ["lustro", m.mirror ? "aktywne" : "nieaktywne"],
      ["dlugosc lustra", m.mirror ? `${m.mirror.lengthMm.toFixed(0)} mm` : "—"],
      ["kat lustra", m.mirror ? `${m.mirror.angleDeg.toFixed(0)}°` : "—"],
      ["rozwarcie", m.spreadDeg !== null && m.spreadDeg !== undefined ? `${m.spreadDeg.toFixed(0)}°` : "—"],
      ["liczba promieni", String(m.rayCount)],
    ];

    const rowHeight = 4;
    const width = 60;
    const startX = pageW - EXPORT_MARGIN_MM - width;
    const startY = EXPORT_MARGIN_MM + 4;

    const parts = [
      `<rect x="${startX - 2}" y="${startY - 4}" width="${width + 2}" height="${rows.length * rowHeight + 4}" fill="#ffffff" fill-opacity="0.85" stroke="${color}" stroke-width="0.15"/>`,
      `<g font-size="2.6" fill="${color}">`,
    ];
    rows.forEach(([label, value], i) => {
      const y = startY + i * rowHeight;
      parts.push(`<text x="${startX}" y="${y}">${escapeXml(label)}</text>`);
      parts.push(`<text x="${startX + width}" y="${y}" text-anchor="end">${escapeXml(value)}</text>`);
    });
    parts.push(`</g>`);
    return parts.join("\n");
  }

  function svgCalibration(pageW, pageH) {
    const size = 50; // mm — fixed regardless of world scale: this checks the PRINTER, not the model
    const x = 8;
    const y = pageH - 16;
    return `
      <g stroke="#000000" fill="none" stroke-width="0.3">
        <line x1="${x}" y1="${y}" x2="${x + size}" y2="${y}"/>
        <line x1="${x}" y1="${y - 2}" x2="${x}" y2="${y + 2}"/>
        <line x1="${x + size}" y1="${y - 2}" x2="${x + size}" y2="${y + 2}"/>
      </g>
      <text x="${x}" y="${y + 5}" font-size="3" fill="#000000">50 mm</text>
    `;
  }

  // Builds the full SVG document + reports whether it fits the chosen page
  // (at the chosen scale) so the UI can warn instead of silently rescaling.
  function buildSceneSvg(options) {
    const m = getSceneModel();
    const bbox = computeContentBBoxMm(m, options.showRays, options.showReflected);
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
    const strokeMirror = colorMode ? c.mirror : "#000000";
    const strokeIncident = colorMode ? c.incident : "#000000";
    const strokeRefracted = colorMode ? c.refracted : "#000000";
    const strokeReflected = colorMode ? c.reflected : "#000000";
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

    if (m.mirror) {
      parts.push(
        `<line x1="${docX(m.mirror.p1.x)}" y1="${docY(m.mirror.p1.y)}" x2="${docX(m.mirror.p2.x)}" y2="${docY(m.mirror.p2.y)}" stroke="${strokeMirror}" stroke-width="0.8"/>`
      );
    }

    if (m.source) {
      parts.push(`<circle cx="${docX(m.source.xMm)}" cy="${docY(m.source.yMm)}" r="1.2" fill="${fillSource}"/>`);
    }

    const alphas = currentAlphas();

    if (options.showRays && lastResult) {
      for (const ray of lastResult.rays) {
        const pts = ray.points;
        if (pts.length >= 2) {
          const seg = `${docX(pts[0][0])},${docY(pts[0][1])} ${docX(pts[1][0])},${docY(pts[1][1])}`;
          parts.push(`<polyline points="${seg}" fill="none" stroke="${strokeIncident}" stroke-width="0.25" opacity="${alphas.incident}"/>`);
        }
        if (pts.length > 2) {
          const rest = pts.slice(1).map(([x, y]) => `${docX(x)},${docY(y)}`).join(" ");
          parts.push(`<polyline points="${rest}" fill="none" stroke="${strokeRefracted}" stroke-width="0.25" opacity="${alphas.refracted}"/>`);
        }
      }
    }

    if (options.showReflected && lastResult) {
      for (const ray of lastResult.rays) {
        for (const segment of ray.reflected) {
          const pts = segment.points.map(([x, y]) => `${docX(x)},${docY(y)}`).join(" ");
          parts.push(
            `<polyline points="${pts}" fill="none" stroke="${strokeReflected}" stroke-width="0.25" stroke-dasharray="1.5,1" opacity="${alphas.reflected}"/>`
          );
        }
      }
    }

    if (options.showDimensions) {
      parts.push(svgDimensions(m, docX, docY, scaleFactor, "#555555"));
      parts.push(svgTechTable(m, pageW, "#555555"));
    }

    parts.push(svgCalibration(pageW, pageH));
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
      showReflected: exportShowReflected.checked,
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
    exportShowReflected.checked = showReflectedRays;
    exportShowDimensions.checked = showDimensionsCheckbox.checked;
    refreshExportWarning();
    exportDialog.showModal();
  });

  exportReferenceSelect.addEventListener("change", () => {
    exportCustomPosition.classList.toggle("hidden", exportReferenceSelect.value !== "custom");
    refreshExportWarning();
  });

  [exportPageSize, exportOrientation, exportScale, exportShowGrid, exportShowRays, exportShowReflected, exportShowDimensions, exportPosX, exportPosY].forEach(
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
    const options = currentExportOptions(false);
    const { svg } = buildSceneSvg(options);
    printViewContent.innerHTML = svg;

    if (!dynamicPrintStyle) {
      dynamicPrintStyle = document.createElement("style");
      dynamicPrintStyle.id = "dynamic-print-style";
      document.head.appendChild(dynamicPrintStyle);
    }
    // Named CSS page sizes (not numeric mm): Chrome maps `size: A4 landscape`
    // etc. straight to its "A4"/"A3" print-dialog option. A numeric
    // `size: 297mm 210mm` instead shows up as "Custom" and can fail to print
    // or save as PDF in some Chrome versions.
    dynamicPrintStyle.textContent = `@page { size: ${options.pageSize} ${options.orientation}; margin: 0; }`;

    printView.classList.remove("hidden");
    exportDialog.close();
  }

  exportPrintViewBtn.addEventListener("click", openPrintView);
  printNowBtn.addEventListener("click", () => {
    // Give the browser two paint frames to finish laying out the just-injected
    // SVG before invoking the print dialog, so it isn't racing an empty page.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  });
  printCloseBtn.addEventListener("click", () => printView.classList.add("hidden"));

  // --- "Pobierz PDF": renders the same SVG straight into a real PDF page via
  // jsPDF + svg2pdf.js — no system print dialog, no canvas screenshot, and no
  // rescaling: the SVG's own mm-based width/height (already computed for the
  // chosen page format/orientation) is passed through unchanged.
  exportDownloadPdfBtn.addEventListener("click", async () => {
    const options = currentExportOptions(false);
    const { svg, pageW, pageH } = buildSceneSvg(options);

    const svgElement = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: options.orientation,
      unit: "mm",
      format: options.pageSize.toLowerCase(),
    });

    await pdf.svg(svgElement, { x: 0, y: 0, width: pageW, height: pageH });
    pdf.save("bottle-simulation-1to1.pdf");
  });

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
