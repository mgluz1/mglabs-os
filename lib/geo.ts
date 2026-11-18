export type LatLng = { lat: number; lng: number };
export type Circle = LatLng & { radius: number };

const R_EARTH = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

/** Desloca um ponto em metros (aproximação plana, ok para poucos km). */
export function offset(p: LatLng, dxM: number, dyM: number): LatLng {
  const lat = p.lat + (dyM / R_EARTH) * (180 / Math.PI);
  const lng = p.lng + (dxM / (R_EARTH * Math.cos(toRad(p.lat)))) * (180 / Math.PI);
  return { lat, lng };
}

/**
 * Cobre o círculo de busca com círculos menores em grade quadrada.
 * Espaçamento = r·√2 garante cobertura total; mantém só as células que tocam o círculo.
 */
export function gridCover(center: LatLng, radiusM: number, cellRadiusM = 1500): Circle[] {
  if (radiusM <= cellRadiusM) return [{ ...center, radius: radiusM }];
  const step = cellRadiusM * Math.SQRT2;
  const n = Math.ceil(radiusM / step);
  const cells: Circle[] = [];
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const dx = i * step;
      const dy = j * step;
      // a célula toca o círculo se o centro dela está a menos de R + r do centro
      if (Math.hypot(dx, dy) <= radiusM + cellRadiusM * 0.7) {
        cells.push({ ...offset(center, dx, dy), radius: cellRadiusM });
      }
    }
  }
  return cells;
}

/** Divide uma célula saturada em 4 (cobre o quadrado que circunscreve o círculo). */
export function subdivide(c: Circle): Circle[] {
  const h = c.radius / 2;
  const r = c.radius * 0.75; // > r/√2, com sobreposição
  return [
    { ...offset(c, -h, -h), radius: r },
    { ...offset(c, h, -h), radius: r },
    { ...offset(c, -h, h), radius: r },
    { ...offset(c, h, h), radius: r },
  ];
}
