export function computePresentationZoom({ width, height, safeWidth, safeHeight }) {
  if (![width, height, safeWidth, safeHeight].every((value) => Number.isFinite(value) && value > 0)) return 1;
  const safeScale = Math.min(safeWidth / width, safeHeight / height);
  if (width <= 820) return Math.min(0.72, Math.max(0.48, safeScale * 0.9));
  return Math.min(1.14, Math.max(0.62, safeScale * 1.32));
}
