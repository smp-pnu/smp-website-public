// Build-time image compression: visitors never download the design originals.
import sharp from "sharp"
import { mkdir } from "node:fs/promises"

const sources = ["home-gwangan-3.png", "page-gwangan-3.png", "research-desk.jpg",
  "achievements-building.jpg", "pnu-campus-upscaled.png", "recruit-bull.jpg",
  "network-yeouido-portrait.jpg", "network-yeouido.jpg", "curriculum-skyscrapers.jpg",
  "central-business-district-singapore.jpg", "home-gwangan-2.jpg"]
await mkdir("public/backgrounds", { recursive: true })
for (const name of sources) {
  await sharp(`public/${name}`).rotate().resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 }).toFile(`public/backgrounds/${name.replace(/\.[^.]+$/, ".webp")}`)
}
