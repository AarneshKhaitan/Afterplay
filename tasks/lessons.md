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
- Treat a safety filter and its required data migration as one acceptance unit. After excluding
  unverified evidence, rebuild the configured store and prove a real retrieval hit before calling
  callback detection complete.
- Validate the running demo stores and screens, not only schemas and tests. A stricter manifest
  boundary is incomplete if the configured Studio artifact is rejected and the page is empty.
- Never label memory as transcript-extracted unless every displayed claim has available,
  verifier-backed source material. Remove authored fixtures instead of letting provenance UI imply
  they are real.
- Scope opaque artifact ids at load time. Creator ownership must be checked when loading a scan,
  manifest, or job, not only when listing or creating it.
- Do not run `next dev` alongside a production server from the same checkout during verification.
  Both use `.next`; dev output can contaminate the production type graph. Use the production
  Playwright config or isolate `distDir`, and delete only the verified generated `.next` directory
  before rebuilding if the modes were mixed.
- Treat an existing Graphify graph as potentially stale. Check its update state against the current
  working tree and run the incremental update before using graph results to plan or describe code.
- When removing a creator default from test server configuration, provide an isolated selectable
  workspace fixture and select it through `/api/creator`; otherwise the suite becomes dependent on
  whichever memory directory happens to exist on the developer's machine.
- Test creator identity and scan ownership as separate contracts: omit `creatorId` for a foreign-scan
  ownership assertion, and use a separate request to prove an explicit creator mismatch returns 409.
- When a test selects the workspace that owns its main fixture, a nonexistent scan id is insufficient
  for ownership coverage. Seed an existing scan under a second creator and request that exact id.
- Do not treat a locally stalled Node wrapper as verification. Stop the process, report the missing
  runtime result, and require an independent full-suite run before calling a commit verified.
- On Node 22, always pass explicit unit-test files through an npm script; an unexpanded `node --test`
  glob can trigger recursive discovery across `node_modules`, virtual environments, and build output.
- Keep pure domain resolvers free of eager request/framework imports. Lazy-load server-bound dependencies
  inside the server function so direct Node unit tests can exercise the pure contract.
