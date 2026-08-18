/**
 * Render budget. The play view was drawing a 1.5× framebuffer, a 2048
 * shadow map, MSAA, then bloom + SMAA on top — four full-screen passes
 * after the scene. That is what made the whole match hitch, not the
 * engine choice.
 */
export type QualityTier = "high" | "low";

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
    maxDpr: 1.25,
    antialias: true,
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
