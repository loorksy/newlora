// Extract only three official Mono leaf modules from the pinned package's source map.
// Metro cannot tree-shake its bundled root (which also imports Expo gradients).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const root = new URL("../", import.meta.url);
const map = JSON.parse(
  readFileSync(
    new URL("node_modules/@lobehub/icons-rn/dist/index.js.map", root),
    "utf8"
  )
);
const out = new URL("apps/mobile/src/vendor/lobe/", root);
mkdirSync(out, { recursive: true });
for (const name of ["OpenAI", "Anthropic", "ZAI"]) {
  const source = `../src/icons/${name}/components/Mono.tsx`;
  const index = map.sources.indexOf(source);
  if (index < 0 || !map.sourcesContent[index])
    throw new Error(`Missing official icon: ${name}`);
  const content = map.sourcesContent[index].replace(
    "from '@/features'",
    "from '@lobehub/icons-rn'"
  );
  writeFileSync(
    new URL(`${name}.tsx`, out),
    `// Copyright (c) 2023 LobeHub. MIT; see docs/licenses/Lobe-Icons-MIT.txt.\n// Generated from @lobehub/icons-rn 2.14.0: ${source}. Do not redraw.\n${content}`
  );
}
