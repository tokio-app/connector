// Watch a LIVE from the terminal: `yarn example <username> [seconds]`.
// Attach the listeners first, then connect; every event from then on is printed.
import {
  createConsoleLogger,
  EulerSigner,
  isStreakEnd,
  TikTokLiveConnection,
  type User,
} from "../src/index.js";

const username = process.argv[2];
const seconds = Number(process.argv[3] ?? 120);
if (!username) {
  console.error("Usage: yarn example <username> [seconds]");
  process.exit(2);
}

const name = (user?: User) => user?.nickname || user?.displayId || "someone";
const log = (label: string, text: string) =>
  console.log(`${label.padEnd(10)} ${text}`);

const connection = new TikTokLiveConnection(username, {
  // Set EULER_API_KEY to use your Euler Stream key; anonymous works within its limits.
  signer: process.env.EULER_API_KEY
    ? new EulerSigner({ apiKey: process.env.EULER_API_KEY })
    : undefined,
  logger: createConsoleLogger({ level: "warn" }),
});

connection.on("connected", ({ roomId, reconnected }) =>
  log("connected", `room ${roomId}${reconnected ? " (reconnected)" : ""}`),
);
connection.on("reconnecting", ({ attempt, delayMs, reason }) =>
  log("reconnect", `attempt ${attempt} in ${delayMs} ms (${reason})`),
);
connection.on("disconnected", ({ reason, willReconnect }) =>
  log("stopped", `${reason}${willReconnect ? ", reconnecting" : ""}`),
);
connection.on("streamEnd", ({ action }) => log("LIVE", `stream ${action}`));
connection.on("error", (error) =>
  log("error", `${error.code}: ${error.message}`),
);

connection.on("chat", (chat) =>
  log("chat", `${name(chat.user)}: ${chat.content}`),
);
connection.on("gift", (gift) => {
  // A streakable gift repeats until repeatEnd; count it once, when the streak ends.
  if (!isStreakEnd(gift)) return;
  const coins = (gift.gift?.diamondCount ?? 0) * gift.repeatCount;
  log(
    "gift",
    `${name(gift.user)} sent ${gift.repeatCount}x ${gift.gift?.name} (${coins} coins)`,
  );
});
connection.on("like", (like) =>
  log("like", `${name(like.user)} x${like.count} (${like.total} total)`),
);
connection.on("follow", (social) => log("follow", name(social.user)));
connection.on("share", (social) => log("share", name(social.user)));
connection.on("member", (member) => log("join", name(member.user)));
connection.on("superFan", (fan) => log("superfan", name(fan.user)));
connection.on("superFanJoin", (fan) =>
  log("superfan", `${name(fan.user)} joined`),
);
connection.on("superFanBox", () => log("superfan", "box"));
connection.on("envelope", () => log("envelope", "treasure box"));
connection.on("roomUser", (room) =>
  log("viewers", `${room.total} watching, ${room.totalUser} so far`),
);

const stop = async () => {
  await connection.disconnect();
  process.exit(0);
};
process.on("SIGINT", stop);
setTimeout(stop, seconds * 1000);

log("connect", `@${connection.username} for ${seconds}s (Ctrl-C to stop)`);
try {
  await connection.connect();
} catch (error) {
  console.error(error);
  process.exit(1);
}
