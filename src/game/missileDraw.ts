/**
 * The clean 2D missile / bomb silhouettes used in the canvas play view.
 * 1999 SPR frames are tiny cropped pixels; these drawings are what looked tidy.
 */
export type MissileKind = "dart" | "scatter" | "cruise" | "standard";

export function missileKindFromStyle(style: string | undefined): MissileKind {
  if (style === "dart") return "dart";
  if (style === "cruise") return "cruise";
  if (style === "scatter") return "scatter";
  return "standard";
}

export type PickupIconKind =
  | "pierce"
  | "heavy"
  | "dart"
  | "scatter"
  | "cruise"
  | "bomb"
  | "nuke"
  | "frost"
  | "standard";

export function pickupIconKind(w: {
  ammo: string;
  style?: string;
}): PickupIconKind {
  if (w.style === "pierce") return "pierce";
  if (w.style === "heavy") return "heavy";
  if (w.style === "dart") return "dart";
  if (w.style === "scatter") return "scatter";
  if (w.style === "cruise") return "cruise";
  if (w.style === "lob") return "bomb";
  if (w.style === "nuke") return "nuke";
  if (w.style === "frost") return "frost";
  if (w.ammo === "explosive") return "bomb";
  if (w.ammo === "missile") return "standard";
  return "standard";
}

export function pickupTag(name: string): string {
  const first = name.split(/\s+/)[0] ?? name;
  return first.slice(0, 5).toUpperCase();
}

export function drawProjShadow(
  ctx: CanvasRenderingContext2D,
  L: number,
  W: number,
  alpha = 0.28,
): void {
  ctx.save();
  ctx.translate(0, W * 0.85 + 2);
  ctx.scale(1, 0.28);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(0, 0, L * 0.42, W * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawRealisticMissile(
  ctx: CanvasRenderingContext2D,
  opts: {
    L: number;
    W: number;
    accent: string;
    lifeT: number;
    time: number;
    kind: MissileKind;
  },
): void {
  const { L, W, accent, lifeT, time, kind } = opts;
  const nose = L * (kind === "cruise" ? 0.52 : kind === "dart" ? 0.48 : 0.46);
  const tail = -L * (kind === "cruise" ? 0.48 : 0.42);
  const bodyR =
    W *
    (kind === "cruise" ? 1.05 : kind === "dart" ? 0.72 : kind === "scatter" ? 0.82 : 0.92);
  const flicker = 0.82 + 0.18 * Math.sin(time * 48 + L);

  drawProjShadow(ctx, L, bodyR, kind === "cruise" ? 0.34 : 0.24);

  const plumeLen =
    L *
    (kind === "cruise" ? 1.15 : kind === "dart" ? 0.85 : kind === "scatter" ? 0.7 : 0.95) *
    (0.9 + 0.1 * flicker);
  const plume = ctx.createLinearGradient(tail, 0, tail - plumeLen, 0);
  plume.addColorStop(0, `rgba(255,255,255,${0.75 * lifeT * flicker})`);
  plume.addColorStop(0.12, `rgba(254,240,138,${0.7 * lifeT})`);
  plume.addColorStop(0.35, `rgba(251,146,60,${0.45 * lifeT})`);
  plume.addColorStop(0.65, `rgba(239,68,68,${0.22 * lifeT})`);
  plume.addColorStop(1, "rgba(100,100,120,0)");
  ctx.fillStyle = plume;
  ctx.beginPath();
  ctx.moveTo(tail + 1, 0);
  ctx.quadraticCurveTo(
    tail - plumeLen * 0.35,
    -bodyR * (1.1 + 0.25 * flicker),
    tail - plumeLen,
    0,
  );
  ctx.quadraticCurveTo(
    tail - plumeLen * 0.35,
    bodyR * (1.1 + 0.25 * flicker),
    tail + 1,
    0,
  );
  ctx.fill();
  ctx.globalAlpha = 0.55 * lifeT * flicker;
  ctx.fillStyle = "#fff7ed";
  ctx.beginPath();
  ctx.ellipse(tail - plumeLen * 0.18, 0, plumeLen * 0.22, bodyR * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const noz = ctx.createLinearGradient(tail - 1, -bodyR, tail - 1, bodyR);
  noz.addColorStop(0, "#64748b");
  noz.addColorStop(0.5, "#0f172a");
  noz.addColorStop(1, "#475569");
  ctx.fillStyle = noz;
  ctx.beginPath();
  ctx.roundRect(tail - 2.5, -bodyR * 0.95, 4.5, bodyR * 1.9, 1.2);
  ctx.fill();
  ctx.fillStyle = `rgba(251,191,36,${0.55 * flicker})`;
  ctx.beginPath();
  ctx.ellipse(tail - 0.5, 0, 1.6, bodyR * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  if (kind !== "dart") {
    const finX0 = tail + L * 0.08;
    const finX1 = tail + L * 0.22;
    const finOut = bodyR * (kind === "cruise" ? 2.35 : 1.95);
    const finGrad = ctx.createLinearGradient(finX0, 0, finX1, 0);
    finGrad.addColorStop(0, "#1e293b");
    finGrad.addColorStop(1, accent);
    ctx.fillStyle = finGrad;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(finX1, s * bodyR * 0.85);
      ctx.lineTo(finX0 - 1, s * finOut);
      ctx.lineTo(finX0 + L * 0.06, s * bodyR * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#334155";
    ctx.beginPath();
    ctx.moveTo(finX1, 0);
    ctx.lineTo(finX0, -bodyR * 0.15);
    ctx.lineTo(finX0 - 2, 0);
    ctx.lineTo(finX0, bodyR * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = "#475569";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(nose * 0.15, s * bodyR * 0.9);
      ctx.lineTo(nose * -0.05, s * bodyR * 1.55);
      ctx.lineTo(nose * -0.18, s * bodyR * 0.85);
      ctx.closePath();
      ctx.fill();
    }
  }

  const bodyX0 = tail + 2;
  const bodyX1 = nose * 0.55;
  const metal = ctx.createLinearGradient(0, -bodyR, 0, bodyR);
  metal.addColorStop(0, "#f1f5f9");
  metal.addColorStop(0.18, "#cbd5e1");
  metal.addColorStop(0.42, accent);
  metal.addColorStop(0.55, "#1e293b");
  metal.addColorStop(0.78, accent);
  metal.addColorStop(1, "#0f172a");
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.moveTo(bodyX0, -bodyR);
  ctx.lineTo(bodyX1, -bodyR);
  ctx.quadraticCurveTo(bodyX1 + bodyR * 0.15, 0, bodyX1, bodyR);
  ctx.lineTo(bodyX0, bodyR);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = Math.max(0.8, bodyR * 0.22);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bodyX0 + 2, -bodyR * 0.45);
  ctx.lineTo(bodyX1 - 2, -bodyR * 0.42);
  ctx.stroke();
  ctx.lineCap = "butt";

  ctx.strokeStyle = "rgba(15,23,42,0.35)";
  ctx.lineWidth = 0.8;
  for (const t of [0.22, 0.48, 0.72]) {
    const x = bodyX0 + (bodyX1 - bodyX0) * t;
    ctx.beginPath();
    ctx.moveTo(x, -bodyR * 0.92);
    ctx.lineTo(x, bodyR * 0.92);
    ctx.stroke();
  }

  const bandX = bodyX0 + (bodyX1 - bodyX0) * (kind === "cruise" ? 0.38 : 0.55);
  const bandW = kind === "cruise" ? L * 0.1 : L * 0.055;
  const band = ctx.createLinearGradient(bandX, -bodyR, bandX, bodyR);
  band.addColorStop(0, "#fef9c3");
  band.addColorStop(0.5, kind === "cruise" ? "#facc15" : accent);
  band.addColorStop(1, "#713f12");
  ctx.fillStyle = band;
  ctx.fillRect(bandX - bandW * 0.5, -bodyR * 0.95, bandW, bodyR * 1.9);

  if (kind === "cruise") {
    ctx.fillStyle = "#334155";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(nose * 0.05, s * bodyR * 0.9);
      ctx.lineTo(nose * -0.12, s * bodyR * 1.85);
      ctx.lineTo(nose * -0.28, s * bodyR * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  const tip = L * (kind === "dart" ? 0.58 : 0.55);
  const noseMetal = ctx.createLinearGradient(bodyX1, -bodyR, tip, 0);
  noseMetal.addColorStop(0, "#e2e8f0");
  noseMetal.addColorStop(0.35, "#94a3b8");
  noseMetal.addColorStop(0.7, "#475569");
  noseMetal.addColorStop(1, "#0f172a");
  ctx.fillStyle = noseMetal;
  ctx.beginPath();
  ctx.moveTo(bodyX1, -bodyR * 0.98);
  ctx.quadraticCurveTo(bodyX1 + (tip - bodyX1) * 0.45, -bodyR * 0.55, tip, 0);
  ctx.quadraticCurveTo(bodyX1 + (tip - bodyX1) * 0.45, bodyR * 0.55, bodyX1, bodyR * 0.98);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bodyX1 + 1, -bodyR * 0.35);
  ctx.quadraticCurveTo((bodyX1 + tip) * 0.55, -bodyR * 0.2, tip - 2, -1);
  ctx.stroke();
  ctx.fillStyle = kind === "dart" ? "rgba(56,189,248,0.85)" : "rgba(248,250,252,0.9)";
  ctx.beginPath();
  ctx.ellipse(tip - bodyR * 0.35, 0, bodyR * 0.45, bodyR * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  if (kind === "dart") {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(tip - bodyR * 0.45, -bodyR * 0.12, bodyR * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawRealisticBomb(
  ctx: CanvasRenderingContext2D,
  opts: {
    r: number;
    accent: string;
    lifeT: number;
    time: number;
    nuke: boolean;
  },
): void {
  const { r, accent, lifeT, time, nuke } = opts;
  const L = r * (nuke ? 2.6 : 2.2);
  const W = r * (nuke ? 0.95 : 0.78);

  drawProjShadow(ctx, L * 0.9, W, 0.3);

  ctx.fillStyle = "#1e293b";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-L * 0.35, s * W * 0.7);
    ctx.lineTo(-L * 0.62, s * W * 1.85);
    ctx.lineTo(-L * 0.42, s * W * 0.75);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#334155";
  ctx.fillRect(-L * 0.55, -W * 0.35, L * 0.18, W * 0.7);

  const casing = ctx.createLinearGradient(0, -W, 0, W);
  casing.addColorStop(0, "#f8fafc");
  casing.addColorStop(0.2, "#cbd5e1");
  casing.addColorStop(0.45, nuke ? "#fecaca" : accent);
  casing.addColorStop(0.55, "#1e293b");
  casing.addColorStop(0.8, accent);
  casing.addColorStop(1, "#0f172a");
  ctx.fillStyle = casing;
  ctx.beginPath();
  ctx.ellipse(0, 0, L * 0.42, W, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = nuke ? "#7f1d1d" : "#3f6212";
  ctx.fillRect(-L * 0.12, -W * 0.95, L * 0.14, W * 1.9);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, -W * 0.35, L * 0.28, W * 0.25, 0, 0, Math.PI);
  ctx.stroke();

  const fuse = ctx.createLinearGradient(L * 0.25, 0, L * 0.55, 0);
  fuse.addColorStop(0, "#94a3b8");
  fuse.addColorStop(1, "#0f172a");
  ctx.fillStyle = fuse;
  ctx.beginPath();
  ctx.moveTo(L * 0.28, -W * 0.55);
  ctx.lineTo(L * 0.58, 0);
  ctx.lineTo(L * 0.28, W * 0.55);
  ctx.closePath();
  ctx.fill();
  const blink = Math.sin(time * (nuke ? 14 : 9)) > 0;
  ctx.fillStyle = blink ? "#fef08a" : "#ef4444";
  ctx.globalAlpha = 0.7 + 0.3 * lifeT;
  ctx.beginPath();
  ctx.arc(L * 0.52, 0, nuke ? 2.2 : 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (nuke) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.42, W, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(250,204,21,0.55)";
    ctx.lineWidth = 2.5;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 5 - 8, -W);
      ctx.lineTo(i * 5 + 8, W);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function opaqueBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cut = 12,
): { x: number; y: number; w: number; h: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > cut) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function cropCanvas(src: HTMLCanvasElement, pad = 6): HTMLCanvasElement {
  const ctx = src.getContext("2d");
  if (!ctx) return src;
  const { data, width, height } = ctx.getImageData(0, 0, src.width, src.height);
  const box = opaqueBounds(data, width, height);
  if (!box) return src;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const w = Math.min(width - x, box.w + pad * 2);
  const h = Math.min(height - y, box.h + pad * 2);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")?.drawImage(src, x, y, w, h, 0, 0, w, h);
  return out;
}

export function bakeMissileCanvas(
  kind: MissileKind,
  accent: string,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.translate(canvas.width * 0.54, canvas.height * 0.5);
  drawRealisticMissile(ctx, {
    L: 88,
    W: 13,
    accent,
    lifeT: 1,
    time: 0,
    kind,
  });
  return cropCanvas(canvas);
}

export function bakeBombCanvas(accent: string, nuke: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.translate(canvas.width * 0.5, canvas.height * 0.5);
  drawRealisticBomb(ctx, { r: 22, accent, lifeT: 1, time: 0, nuke });
  return cropCanvas(canvas);
}

function drawPierceRod(ctx: CanvasRenderingContext2D, accent: string): void {
  const L = 92;
  const W = 6;
  const metal = ctx.createLinearGradient(0, -W, 0, W);
  metal.addColorStop(0, "#f8fafc");
  metal.addColorStop(0.45, accent);
  metal.addColorStop(1, "#0f172a");
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.moveTo(L * 0.52, 0);
  ctx.lineTo(L * 0.18, -W);
  ctx.lineTo(-L * 0.48, -W * 0.7);
  ctx.lineTo(-L * 0.55, 0);
  ctx.lineTo(-L * 0.48, W * 0.7);
  ctx.lineTo(L * 0.18, W);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.globalAlpha = 0.7;
  ctx.fillRect(-L * 0.1, -W * 0.25, L * 0.35, W * 0.35);
  ctx.globalAlpha = 1;
}

function drawHeavySlug(ctx: CanvasRenderingContext2D, accent: string): void {
  const L = 70;
  const W = 18;
  const g = ctx.createRadialGradient(-8, -6, 2, 0, 0, L * 0.55);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.35, accent);
  g.addColorStop(1, "#1e1b4b");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, L * 0.5, W, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(8, -4, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawScatterPack(ctx: CanvasRenderingContext2D, accent: string): void {
  for (const [dx, dy, sc] of [
    [0, 0, 1],
    [-10, -16, 0.72],
    [-10, 16, 0.72],
  ] as const) {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.scale(sc, sc);
    drawRealisticMissile(ctx, {
      L: 48,
      W: 7,
      accent,
      lifeT: 1,
      time: 0,
      kind: "scatter",
    });
    ctx.restore();
  }
}

function drawFrostShard(ctx: CanvasRenderingContext2D, accent: string): void {
  const R = 28;
  ctx.fillStyle = "rgba(224,242,254,0.35)";
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? R : R * 0.55;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#f0f9ff";
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawPickupLabel(ctx: CanvasRenderingContext2D, tag: string): void {
  ctx.font = "bold 18px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(15,23,42,0.85)";
  ctx.lineWidth = 5;
  ctx.strokeText(tag, 0, 48);
  ctx.fillStyle = "#f8fafc";
  ctx.fillText(tag, 0, 48);
}

export function bakePickupCanvas(
  kind: PickupIconKind,
  accent: string,
  tag: string,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 176;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.translate(canvas.width * 0.5, canvas.height * 0.42);
  if (kind === "pierce") drawPierceRod(ctx, accent);
  else if (kind === "heavy") drawHeavySlug(ctx, accent);
  else if (kind === "scatter") drawScatterPack(ctx, accent);
  else if (kind === "frost") drawFrostShard(ctx, accent);
  else if (kind === "bomb") drawRealisticBomb(ctx, { r: 20, accent, lifeT: 1, time: 0, nuke: false });
  else if (kind === "nuke") drawRealisticBomb(ctx, { r: 22, accent, lifeT: 1, time: 0, nuke: true });
  else {
    drawRealisticMissile(ctx, {
      L: kind === "cruise" ? 80 : kind === "dart" ? 78 : 72,
      W: kind === "cruise" ? 14 : kind === "dart" ? 8 : 11,
      accent,
      lifeT: 1,
      time: 0,
      kind: kind === "cruise" ? "cruise" : kind === "dart" ? "dart" : "standard",
    });
  }
  drawPickupLabel(ctx, tag);
  return cropCanvas(canvas, 8);
}
