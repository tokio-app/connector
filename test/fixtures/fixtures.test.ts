// Replays every capture in this folder through the real dispatch, with a
// listener on every event, the way an app listening to everything would get
// it. A capture is a `*.capture.json` file `yarn capture` wrote (format:
// scripts/capture/fixture.ts) from the user's own LIVE. For each one:
//
// - no message fails to decode (dispatch reports no error);
// - dispatch handles as many messages of each method as the capture holds;
// - the first decoded message of each event matches its snapshot
//   (__snapshots__/, written by the first run: review it and commit it with
//   the capture).
import { readdirSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  fromFixtureMessage,
  parseFixture,
  type Fixture,
} from "../../scripts/capture/fixture.js";
import { replay, type Replay } from "../helpers/replay.js";

const FOLDER = new URL("./", import.meta.url);

const CAPTURES = readdirSync(FOLDER)
  .filter((name) => name.endsWith(".capture.json"))
  .sort();

describe("captured fixtures", () => {
  if (CAPTURES.length === 0) {
    it.skip("none yet: record one on your own LIVE with `yarn capture <your-username> --out test/fixtures/<name>.capture.json`", () => {});
    return;
  }

  describe.each(CAPTURES)("%s", (file) => {
    let fixture: Fixture;
    let result: Replay;

    beforeAll(() => {
      fixture = parseFixture(readFileSync(new URL(file, FOLDER), "utf8"));
      result = replay(fixture.messages.map(fromFixtureMessage));
    });

    it("decodes every message without a ProtocolError", () => {
      expect(result.errors.map((error) => error.message)).toEqual([]);
    });

    it("hands dispatch as many messages of each method as it holds", () => {
      expect(result.counts).toEqual(fixture.counts);
    });

    it("decodes the first message of each event as before", () => {
      expect(result.firsts).toMatchSnapshot();
    });
  });
});
