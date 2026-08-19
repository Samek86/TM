/**
 * Render budget. Fullscreen hitching is fill-rate: MSAA plus a 1.25×
 * framebuffer at 1080p/1440p/4K. Keep one scene pass, no MSAA, and cap
 * the drawing buffer near 1080p so a 4K window does not 4× the pixels.
 */
export type QualityTier = "high" | "low";

/** Target drawing-buffer pixels (1080p). */
export const DRAW_PIXEL_BUDGET = 1920 * 1080;

/**
 * Device DPR, then shrink so cssW × cssH × dpr² stays near DRAW_PIXEL_BUDGET.
 * 1080p @1 → 1; 4K @1 → 0.5 (1080p buffer); never below 0.5.
 */
export function resolvePixelRatio(
  cssW: number,
  cssH: number,
  deviceDpr: number,
  maxDpr: number,
): number {
  const requested = Math.min(Math.max(0.5, deviceDpr || 1), maxDpr);
  const area = Math.max(1, cssW) * Math.max(1, cssH);
  const budgetDpr = Math.sqrt(DRAW_PIXEL_BUDGET / area);
  return Math.min(requested, Math.max(0.5, budgetDpr));
}

export type QualityProfile = {
  tier: QualityTier;
  maxDpr: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** Playfield cliffs. Scenery never casts — it is a huge off-screen mesh. */
  terrainCastsShadow: boolean;
  /** Bloom + SMAA composer. Off by default; the bloom was nearly invisible. */
  postFx: boolean;
};

export function detectQualityTier(input: {
  coarsePointer: boolean;
  innerWidth: number;
  hardwareConcurrency?: number;
  saveData?: boolean;
}): QualityTier {
  if (input.saveData) return "low";
  if (input.coarsePointer) return "low";
  if (input.innerWidth <= 768) return "low";
  if ((input.hardwareConcurrency ?? 8) <= 4) return "low";
  return "high";
}

export function qualityProfile(tier: QualityTier): QualityProfile {
  if (tier === "low") {
    return {
      tier,
      maxDpr: 1,
      antialias: false,
      shadows: false,
      shadowMapSize: 512,
      terrainCastsShadow: false,
      postFx: false,
    };
  }
  return {
    tier,
    maxDpr: 1,
    antialias: false,
    shadows: true,
    shadowMapSize: 1024,
    terrainCastsShadow: true,
    postFx: false,
  };
}

export function detectQuality(
  input: Parameters<typeof detectQualityTier>[0],
): QualityProfile {
  return qualityProfile(detectQualityTier(input));
}
