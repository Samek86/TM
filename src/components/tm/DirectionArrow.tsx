export function DirectionArrow({
  angle,
  color,
  size,
}: {
  angle: number;
  color: string;
  size: number;
}) {
  return (
    <svg
      aria-hidden
      className="shrink-0"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ transform: `rotate(${angle}rad)` }}
    >
      <path
        d="M1.5 2.2 14.5 8 1.5 13.8 4.8 8z"
        fill={color}
        stroke="#0b1018"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
