// The sample lines of the room group's events (the room's state, ranks,
// polls, shopping, system messages). Pure functions; room.test.ts checks
// them.
import {
  ControlAction,
  PollEndType,
  RankOpType,
  type AnchorToolModificationMessage,
  type ControlMessage,
  type OecLiveShoppingMessage,
  type PerceptionMessage,
  type PollMessage,
  type PollOption,
  type RankTextMessage,
  type RankUpdateMessage,
  type RoomUserMessage,
  type WebcastEventMap,
} from "../../../src/index.js";
import type { RoomEvent } from "../../../src/routes/groups.js";
import { formatCount, nickname, quote } from "../../lib/format.js";

const CONTROL_ACTIONS: Readonly<Record<number, string>> = {
  [ControlAction.PAUSED]: "paused",
  [ControlAction.UNPAUSED]: "resumed",
  [ControlAction.STREAM_ENDED]: "ended",
  [ControlAction.STREAM_SUSPENDED]: "suspended",
};

const RANK_OPS: Readonly<Record<number, string>> = {
  [RankOpType.ADD]: "added",
  [RankOpType.REMOVE]: "removed",
  [RankOpType.RELOAD]: "reloaded",
};

const POLL_ENDS: Readonly<Record<number, string>> = {
  [PollEndType.BY_TIME]: "time ran out",
  [PollEndType.BY_OWNER]: "ended by the host",
  [PollEndType.BY_OTHER]: "ended by someone else",
  [PollEndType.BY_ADMIN]: "ended by a moderator",
};

function describeOptions(options: readonly PollOption[]): string {
  if (options.length === 0) return "no options";
  return options
    .map((option) => `${quote(option.displayContent, 20)} ${option.votes}`)
    .join(", ");
}

function describePoll(poll: PollMessage): string {
  const { startContent, endContent, updateVotesContent } = poll;
  if (startContent !== undefined) {
    return `poll ${poll.pollId} by ${nickname(startContent.operator)}: ${quote(startContent.title)}, ${describeOptions(startContent.optionList)}`;
  }
  if (endContent !== undefined) {
    return `poll ${poll.pollId} ${POLL_ENDS[endContent.endType] ?? `ended (type ${endContent.endType})`}: ${describeOptions(endContent.optionList)}`;
  }
  if (updateVotesContent !== undefined) {
    return `poll ${poll.pollId} votes: ${describeOptions(updateVotesContent.optionList)}`;
  }
  return `poll ${poll.pollId} (message type ${poll.messageType})`;
}

function describeToolChange(change: AnchorToolModificationMessage): string {
  const tool = change.modification;
  if (tool === undefined) return "tool change (no modification)";
  const what =
    tool.endTime === "0"
      ? "started"
      : `ended after ${formatCount(tool.duration)} s`;
  return `host ${tool.userId} tool ${quote(tool.name)} ${what}`;
}

/** The room group's describers: one per event with a sample line of its own. */
export const roomDescribers = {
  controlMessage: (control: ControlMessage) =>
    `${CONTROL_ACTIONS[control.action] ?? `action ${control.action}`}${control.tips ? `: ${quote(control.tips)}` : ""}`,
  roomUser: (roomUser: RoomUserMessage) => {
    const top = roomUser.ranks[0];
    return `${formatCount(roomUser.total)} watching, ${formatCount(roomUser.totalUser)} so far${top ? `, top viewer ${nickname(top.user)}` : ""}`;
  },
  perception: (perception: PerceptionMessage) => {
    const title = perception.dialog?.title?.key || "(no title)";
    const punish = perception.punishInfo?.punishType;
    return `${title} (scene ${perception.dialog?.scene ?? "none"})${punish ? `, punished: ${punish}` : ""}`;
  },
  rankUpdate: (rankUpdate: RankUpdateMessage) => {
    const op = RANK_OPS[rankUpdate.opType] ?? `op ${rankUpdate.opType}`;
    const ranks = rankUpdate.updates.map(
      (update) =>
        `type ${update.rankType} #${update.ownRank} (${formatCount(update.currentScore)})`,
    );
    return `${op}: ${ranks.length === 0 ? "no ranks" : ranks.join(", ")}`;
  },
  rankText: (rankText: RankTextMessage) =>
    `${rankText.content?.key || "(no key)"} (scene ${rankText.scene}, rank type ${rankText.rankType}, ${rankText.ownerIdxBefore} to ${rankText.ownerIdxAfter})`,
  pollMessage: describePoll,
  oecLiveShopping: (shopping: OecLiveShoppingMessage) => {
    const { popProduct, productSnapShot } = shopping;
    const what =
      popProduct !== undefined
        ? `pinned ${quote(popProduct.title)} ${popProduct.price}`
        : productSnapShot !== undefined
          ? `product ${quote(productSnapShot.title)}`
          : `action ${shopping.actionType}`;
    return `${what}, ${formatCount(shopping.liveProductNumber)} products`;
  },
  anchorToolModification: describeToolChange,
} satisfies { [K in RoomEvent]?: (payload: WebcastEventMap[K]) => string };
