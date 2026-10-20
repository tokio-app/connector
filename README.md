# @tokioapp/connector

Connect to a TikTok LIVE and receive its events (chat, gifts, likes, follows, shares, viewers and more) in Node. It reconnects on its own, decodes only the messages you listen to, and gives you typed events and errors. It is written from scratch, MIT-licensed, and has a single runtime dependency (`ws`). It is the connector behind [Tokio](https://tokio.ialfaro.com).

## Status

Pre-release. The API isn't settled yet and nothing is published to npm. The first version will be `0.1.0`.

## Install

```sh
npm install @tokioapp/connector
```

The package is ESM only and ships its TypeScript types.

## Usage

The full API is documented with the first release. In short:

```ts
import { TikTokLiveConnection } from "@tokioapp/connector";

const connection = new TikTokLiveConnection("username");

connection.on("chat", (message) => {
  console.log(`${message.user?.nickname}: ${message.content}`);
});

const { roomId } = await connection.connect();
```

## Requirements

Node.js 24 or later (Electron's main process included).

## Signing

TikTok only accepts the WebSocket connection with a signed request. By default the library gets it from [Euler Stream](https://www.eulerstream.com). An Euler Stream API key is optional (its limits depend on your plan); when you pass one, it is only ever sent in the `x-api-key` header, never in a URL. The signer is pluggable: implement the `Signer` interface to use another service.

## License

MIT, see [`LICENSE`](LICENSE). The protocol was learned from the MIT releases of [TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector) and [TikTok-Webcast-Protobuf](https://github.com/isaackogan/TikTok-Webcast-Protobuf); see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the credits and the online services it uses. This project isn't affiliated with TikTok.
