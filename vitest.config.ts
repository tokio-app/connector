import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts", "scripts/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "lcov"],
      // `yarn test:coverage` fails below these. The codec has no excuse for
      // an untested line; the state machine, dispatch and the socket come
      // close, with room for defensive branches.
      thresholds: {
        statements: 90,
        "src/codec/**/*.ts": { lines: 100, branches: 100 },
        "src/connection.ts": { lines: 90, branches: 85 },
        "src/dispatch.ts": { lines: 90, branches: 85 },
        "src/routes/**/*.ts": { lines: 90, branches: 85 },
        "src/ws/**/*.ts": { lines: 90, branches: 85 },
      },
    },
  },
});
