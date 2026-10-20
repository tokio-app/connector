# Third-party notices

## Summary

`@tokioapp/connector` is MIT ([`LICENSE`](LICENSE)). It is an independent implementation: no code from the projects below was copied into it, and it doesn't depend on them.

| What                                       | License                                          |
| ------------------------------------------ | ------------------------------------------------ |
| This library's source code and its package | MIT ([`LICENSE`](LICENSE))                       |
| `ws`, its only runtime dependency          | MIT                                              |
| Projects used as a reference (below)       | MIT, credited here; none of their code is copied |

## Reference implementations

The TikTok LIVE protocol isn't documented by TikTok. The behavior of the protocol (how a room is found, the signed connect request, the WebSocket frames, the heartbeat and acknowledgements, how messages are routed) and the layout of its messages (field numbers and types) are learned by reading the two MIT-licensed releases below. This library's code, including its wire decoder and message tables, is written from scratch from that understanding; no source code, generated code or schema file from them is included.

Only these exact releases are used. Later versions of both packages (tiktok-live-connector 2.4.1 and later, tiktok-live-proto 0.2.4 and later) are licensed AGPL-3.0-only and are not used, as a reference or otherwise. `yarn reference` (`scripts/reference/index.ts`) downloads the reference copies and checks their licenses; they are kept out of the repository and the package. One folder of the tiktok-live-proto repository at that commit, `targets/typescript/tiktok-live-proto-full/`, isn't MIT: its package.json declares `UNLICENSED` (`@eulerstream/tiktok-live-proto-full`, Euler Stream's private package). It is not used, and `yarn reference` deletes it.

### tiktok-live-connector

|             |                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| **Version** | 2.4.0 (MIT)                                                                                               |
| **Author**  | zerodytrash and contributors                                                                              |
| **Source**  | <https://github.com/zerodytrash/TikTok-Live-Connector>, commit `54ff9a9ef6079e7235cced70abc47eb8e3211a72` |
| **Use**     | Reference for the connection protocol and message routing. No code copied.                                |

```text
MIT License

Copyright (c) 2026 zerodytrash

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### tiktok-live-proto

|             |                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| **Version** | 0.2.3 (MIT)                                                                                                |
| **Author**  | Isaac Kogan                                                                                                |
| **Source**  | <https://github.com/isaackogan/TikTok-Webcast-Protobuf>, commit `9e34a85c40ed75e4db73bafd47232f82c056c3b3` |
| **Use**     | Reference for the message layout (the `.proto` field numbers and types). No code or schema copied.         |

```text
MIT License

Copyright (c) 2026 Isaac Kogan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Runtime dependency

|             |                                                                                |
| ----------- | ------------------------------------------------------------------------------ |
| **Package** | [`ws`](https://github.com/websockets/ws) 8.x                                   |
| **License** | MIT                                                                            |
| **Use**     | The WebSocket client (Node's built-in one can't set the headers TikTok needs). |

`ws` has no dependencies of its own and ships its license file in its package. Development tools (TypeScript, Vitest, oxlint, Prettier and the rest of `devDependencies`) aren't part of the published package. A scan of the 136 installed packages on 2026-10-19 found only permissive licenses: MIT, Apache-2.0, ISC, BSD-3-Clause and Python-2.0.

## Services

The library talks to these online services. None of them is covered by this library's license or by the licenses above. Each one is subject to its operator's terms and can stop working at any time.

- **TikTok** (`www.tiktok.com`, `webcast.tiktok.com` and its WebSocket push servers): TikTok LIVE room lookup, room info, gift lists and the event stream. None of it is an official public API.
- **Euler Stream** (<https://www.eulerstream.com>, `tiktok.eulerstream.com`): request signing for the connect request, and fallbacks for the room id, room info and gift list. It is the default `Signer`; pass your own `Signer` to use another service, and an API key to use your Euler Stream plan.
