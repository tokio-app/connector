# Notes from T1 (message tables and dispatch)

For the Phase 2 integrator. T1 only edited its own files; below are the changes it needs in files it doesn't own, and what the connection (T3) should know about `dispatch()`. Delete this file once they are handled.

## Changes to frozen files

### AGENTS.md: list the new test helper

T1 added `test/helpers/samples.ts`: a user and common data with every field the tables read, and `unknownFields()`, one field of each wire type for the "skips what it doesn't read" tests. The tests of the nine LIVE message tables and of dispatch use it. The Layout names each helper, so it should name this one too:

```diff
-  helpers/            encoder.ts (builds fixture bytes from the schemas), fakeSigner.ts, fakeTikTok.ts (a local ws server)
+  helpers/            encoder.ts (builds fixture bytes from the schemas), samples.ts (sample LIVE message values, unknown fields), fakeSigner.ts, fakeTikTok.ts (a local ws server)
```

### PROTOCOL.md: say what dispatch reports (optional)

"Batches" says what dispatch drops, not what it reports. Proposed, after the "Messages." bullet:

```diff
+- **Failures.** A payload a route can't decode is dropped and reported through `error` as a `ProtocolError` (`Dropped message <msgId> (<method>): <reason>`). Only payloads that get decoded are checked: a malformed message whose events have no listener goes unnoticed (`raw` only reads its `common`, and an unreadable one gives `createTime` `"0"` without a report). Anything else that fails inside dispatch is reported as a `ConnectorError` with code `INTERNAL`; dispatch never throws.
```

## For the connection

- `dispatch()` never throws. A payload that can't be decoded goes to `context.reportError` as a `ProtocolError`; an exception from the context itself (say `endStream` or `emit` throwing) goes there as a `ConnectorError` with code `INTERNAL`. `emit` and `reportError` must not throw (`TypedEmitter.emit` doesn't).
- `endStream()` is called synchronously from `dispatch()`, possibly in the middle of a batch. Dispatch doesn't stop the batch: the connection decides whether the batch's remaining messages are still dispatched after a stream end (2.4.0 went on with them).
- A history message that is dropped still counts as seen: its id goes into `recentIds` before the history check, in the order PROTOCOL.md's "Batches" gives.
- `msgId` `"0"` and `""` are never deduplicated and never stored in `recentIds`.
