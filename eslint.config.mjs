import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  // `.venv` is the Python service's virtualenv, which the service README tells you to
  // create inside `services/video-clipper`. Without this, eslint walks vendored yt-dlp
  // JavaScript and reports warnings against third-party code nobody here can fix.
  globalIgnores([
    ".next/**",
    ".agents/**",
    ".intel/**",
    "playwright-report/**",
    "test-results/**",
    "**/.venv/**",
    "services/video-clipper/**",
  ]),
]);
