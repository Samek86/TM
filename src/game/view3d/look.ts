/**
 * Play-view light budget. Bloom + stacked fill made dirt, sky, and
 * pre-lit craft engines flash; keep these knobs low so highlights stay put.
 */
export const PLAY_LOOK = {
  toneMappingExposure: 0.92,
  environmentIntensity: 0.32,
  hemiIntensity: 0.32,
  ambientIntensity: 0.08,
  sunIntensity: 1.15,
  bloomStrength: 0.04,
  bloomRadius: 0.18,
  bloomThreshold: 0.94,
  skySunDisc: 0.18,
  skySunHaze: 0.04,
  metalEnv: 0.32,
  glassEnv: 0.36,
  glowEmissive: 0.4,
  artTint: 0xd6d6d6,
  particleEmissive: 0.4,
} as const;
