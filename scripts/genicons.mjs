import sharp from "sharp";
import { readFileSync } from "fs";
const svg = readFileSync("public/icon.svg");
for (const s of [512, 192, 180]) {
  await sharp(svg).resize(s, s).png().toFile(`public/icon-${s}.png`);
  console.log("wrote public/icon-" + s + ".png");
}
