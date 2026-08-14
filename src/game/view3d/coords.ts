export function engineToThree(
  x: number,
  y: number,
  h: number,
): { x: number; y: number; z: number } {
  return { x, y: h, z: y };
}

export function threeToEngine(x: number, z: number): { x: number; y: number } {
  return { x, y: z };
}
