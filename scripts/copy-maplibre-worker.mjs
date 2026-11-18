// Copia o worker do MapLibre para /public/maplibre (servido estático).
// O MapLibre 6 procura o worker ao lado do próprio bundle (import.meta.url), o que não existe depois
// que o Next renomeia os chunks; sem o worker, fontes GeoJSON (o círculo do raio) não aparecem.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("maplibre-gl/package.json"));
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
mkdirSync("public/maplibre", { recursive: true });
copyFileSync(join(pkgDir, "dist", "maplibre-gl-worker.mjs"), "public/maplibre/maplibre-gl-worker.mjs");
console.log(`maplibre-gl-worker ${version} copiado para public/maplibre`);
