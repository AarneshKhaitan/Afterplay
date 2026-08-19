# Implementation lessons

- Before planning from repository state, read `docs/prd/EVIDENCE.md`, `tasks/todo.md`, and the
  current product contract. Verify artifact dates and runtime wiring before claiming work is absent
  or complete.
- Browser verification means more than API assertions. Exercise the running product in Chromium,
  wait for creator switches and client hydration to settle, inspect desktop and mobile screenshots,
  and check console errors and document overflow.
- Test infrastructure must override every alias that addresses the same external store. Here both
  `AFTERPLAY_WORKDIR` and `AFTERPLAY_CLIPPER_WORKDIR` must point at the isolated fixture directory.
- Track every process and generated directory created for verification. Stop only owned processes,
  then remove disposable screenshots, logs, traces, reports, and build caches when they are no
  longer useful.
