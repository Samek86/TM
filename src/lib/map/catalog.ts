/** Playable map catalog — 3 creative strategic arenas. */

export interface MapCatalogEntry {
  id: string;
  label: string;
  mapFile: string | null;
  tilFile: string | null;
  bobFile: string | null;
  lfxFile: string | null;
  theme: string;
  width: number;
  height: number;
}

const DATA = "/archive/client/extracted/data";

/** Only the three high-quality arenas (creative phase). */
export const MAP_CATALOG: MapCatalogEntry[] = [
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
  },
];

export const MAP_CATALOG_COUNT = MAP_CATALOG.length;

export function mapUrl(file: string): string {
  return `${DATA}/${file}`;
}

export function getMapEntry(id: string): MapCatalogEntry {
  return MAP_CATALOG.find((m) => m.id === id) ?? MAP_CATALOG[0]!;
}
