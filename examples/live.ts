// Watch a LIVE from the terminal: `yarn example <username> [seconds]`.
// Attach the listeners first, then connect; every event from then on is printed.
import {
  createConsoleLogger,
  EulerSigner,
  isStreakEnd,
  PinAction,
  TikTokLiveConnection,
  WebcastEvent,
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

connection.on(WebcastEvent.CONNECTED, ({ roomId, reconnected }) =>
  log("connected", `room ${roomId}${reconnected ? " (reconnected)" : ""}`),
);
connection.on(WebcastEvent.RECONNECTING, ({ attempt, delayMs, reason }) =>
  log("reconnect", `attempt ${attempt} in ${delayMs} ms (${reason})`),
);
connection.on(WebcastEvent.DISCONNECTED, ({ reason, willReconnect }) =>
  log("stopped", `${reason}${willReconnect ? ", reconnecting" : ""}`),
);
connection.on(WebcastEvent.STREAM_END, ({ action }) =>
  log("LIVE", `stream ${action}`),
);
connection.on(WebcastEvent.ERROR, (error) =>
  log("error", `${error.code}: ${error.message}`),
);

connection.on(WebcastEvent.CHAT, (chat) =>
  log("chat", `${name(chat.user)}: ${chat.content}`),
);
connection.on(WebcastEvent.GIFT, (gift) => {
  // A streakable gift repeats until repeatEnd; count it once, when the streak ends.
  if (!isStreakEnd(gift)) return;
  const coins = (gift.gift?.diamondCount ?? 0) * gift.repeatCount;
  log(
    "gift",
    `${name(gift.user)} sent ${gift.repeatCount}x ${gift.gift?.name} (${coins} coins)`,
  );
});
connection.on(WebcastEvent.LIKE, (like) =>
  log("like", `${name(like.user)} x${like.count} (${like.total} total)`),
);
connection.on(WebcastEvent.FOLLOW, (social) =>
  log("follow", name(social.user)),
);
connection.on(WebcastEvent.SHARE, (social) => log("share", name(social.user)));
connection.on(WebcastEvent.MEMBER, (member) => log("join", name(member.user)));
connection.on(WebcastEvent.SUPER_FAN, (fan) => log("superfan", name(fan.user)));
connection.on(WebcastEvent.SUPER_FAN_JOIN, (fan) =>
  log("superfan", `${name(fan.user)} joined`),
);
connection.on(WebcastEvent.SUPER_FAN_BOX, () => log("superfan", "box"));
connection.on(WebcastEvent.ENVELOPE, () => log("envelope", "treasure box"));
connection.on(WebcastEvent.ROOM_USER, (room) =>
  log("viewers", `${room.total} watching, ${room.totalUser} so far`),
);
connection.on(WebcastEvent.SUB_NOTIFY, (sub) =>
  log("subscribe", `${name(sub.user)}, month ${sub.subMonth}`),
);
connection.on(WebcastEvent.EMOTE, (emote) =>
  log("emote", `${name(emote.user)}: ${emote.emoteList.length} emote(s)`),
);
connection.on(WebcastEvent.ROOM_PIN, (pin) =>
  log("pin", pin.action === PinAction.PIN ? pin.method : "unpinned"),
);
connection.on(WebcastEvent.IM_DELETE, (deleted) =>
  log("deleted", `${deleted.deleteMsgIds.length} comment(s)`),
);
connection.on(WebcastEvent.LINK_MIC_BATTLE, (battle) =>
  log("battle", `${battle.battleId}, action ${battle.action}`),
);
connection.on(WebcastEvent.POLL_MESSAGE, (poll) =>
  log("poll", poll.startContent?.title || `poll ${poll.pollId}`),
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
