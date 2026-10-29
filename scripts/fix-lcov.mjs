// Vitest writes lcov paths relative to each package (src\app.js on Windows).
// SonarQube scans from the repo root, so rewrite them to backend/src/app.js.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

for (const pkg of ['backend', 'frontend']) {
  const file = `${pkg}/coverage/lcov.info`;
  if (!existsSync(file)) continue;
  const fixed = readFileSync(file, 'utf8').replace(/^SF:(.*)$/gm, (_, p) => {
    const path = p.replaceAll('\\', '/');
    return `SF:${path.startsWith(`${pkg}/`) ? path : `${pkg}/${path}`}`;
  });
  writeFileSync(file, fixed);
}
