/** Map catalog — original client maps (viewer) + creative arenas (play / TIL). */

export interface MapCatalogEntry {
  id: string;
  label: string;
  /** Original .MAP binary; null for creative arenas (no client MAP). */
  mapFile: string | null;
  tilFile: string | null;
  bobFile: string | null;
  lfxFile: string | null;
  theme: string;
  /** Grid size (MAP cells or creative cols×rows). */
  width: number;
  height: number;
  /** true = revival strategic map (play tab); false = original client map. */
  creative?: boolean;
}

const DATA = "/archive/client/extracted/data";

/** Original client maps — primary content for MAP 뷰어. */
export const ORIGINAL_MAP_CATALOG: MapCatalogEntry[] = [
  {
    id: "jungle",
    label: "JUNGLE",
    mapFile: "JUNGLE.MAP",
    tilFile: "jungle.til",
    bobFile: "jungle.bob",
    lfxFile: "jungle.lfx",
    theme: "원작 정글",
    width: 0,
    height: 0,
  },
  {
    id: "jungle2",
    label: "jungle2",
    mapFile: "jungle2.map",
    tilFile: "jungle.til",
    bobFile: "jungle.bob",
    lfxFile: "jungle.lfx",
    theme: "원작 정글 변형",
    width: 0,
    height: 0,
  },
  {
    id: "vil",
    label: "VIL",
    mapFile: "vil.map",
    tilFile: "VIL.TIL",
    bobFile: "VIL.BOB",
    lfxFile: "vil.lfx",
    theme: "원작 빌리지",
    width: 0,
    height: 0,
  },
  {
    id: "z-desert",
    label: "z-desert",
    mapFile: "z-desert.map",
    tilFile: "z-desert.til",
    bobFile: "z-desert.bob",
    lfxFile: "z-desert.lfx",
    theme: "원작 사막",
    width: 0,
    height: 0,
  },
  {
    id: "z-desert2",
    label: "z-desert2",
    mapFile: "z-desert2.map",
    tilFile: "z-desert.til",
    bobFile: "z-desert.bob",
    lfxFile: "z-desert.lfx",
    theme: "원작 사막 변형",
    width: 0,
    height: 0,
  },
];

/**
 * Creative play arenas — no original MAP binary.
 * tilFile kept so play can load matching palettes.
 */
export const CREATIVE_MAP_CATALOG: MapCatalogEntry[] = [
  {
    id: "jade_basin",
    label: "Jade Basin",
    mapFile: null,
    tilFile: "jungle.til",
    bobFile: null,
    lfxFile: null,
    theme: "정글 분지 · 매복 · 고지 링",
    width: 72,
    height: 56,
    creative: true,
  },
  {
    id: "scar_ridge",
    label: "Scar Ridge",
    mapFile: null,
    tilFile: "z-desert.til",
    bobFile: null,
    lfxFile: null,
    theme: "사막 능선 · 시야 · 스나이프 고지",
    width: 80,
    height: 48,
    creative: true,
  },
  {
    id: "iron_ring",
    label: "Iron Ring",
    mapFile: null,
    tilFile: "VIL.TIL",
    bobFile: null,
    lfxFile: null,
    theme: "요새 · 십자 레인 · 거점 쟁탈",
    width: 64,
    height: 64,
    creative: true,
  },
];

/** Full catalog: originals first (viewer default), then creative. */
export const MAP_CATALOG: MapCatalogEntry[] = [
  ...ORIGINAL_MAP_CATALOG,
  ...CREATIVE_MAP_CATALOG,
];

export const MAP_CATALOG_COUNT = MAP_CATALOG.length;

export function mapUrl(file: string): string {
  return `${DATA}/${file}`;
}

export function getMapEntry(id: string): MapCatalogEntry {
  return MAP_CATALOG.find((m) => m.id === id) ?? MAP_CATALOG[0]!;
}
