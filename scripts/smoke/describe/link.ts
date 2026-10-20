// The sample lines of the link group's events (link-mic and battles): the
// full-tier messages; the two tail messages (battle item cards and layout
// states) get the generic line. Pure functions; link.test.ts checks them.
import {
  AgreeStatus,
  ArmiesTriggerReason,
  BattleAction,
  BattleNoticeType,
  BattleTaskMessageType,
  BattleTaskResult,
  GroupStatus,
  GuestMicCameraManageOp,
  IceShowdownSetting,
  LinkLayerMessageType,
  LinkStateType,
  MuteStatus,
  PunishFinishReason,
  type BattleGameplayMessage,
  type BattleUserArmy,
  type GroupChannelAllUser,
  type GroupPlayer,
  type LinkLayerMessage,
  type LinkListChangeContent,
  type LinkMessage,
  type LinkMicArmies,
  type LinkMicBattle,
  type LinkMicBattleNotice,
  type LinkMicBattlePunishFinish,
  type LinkMicBattleTask,
  type LinkMicFanTicketMethod,
  type LinkMicMethod,
  type LinkMicOpponentGifts,
  type LinkStateMessage,
  type Player,
  type WebcastEventMap,
} from "../../../src/index.js";
import type { LinkEvent } from "../../../src/routes/groups.js";
import { formatCount, nickname, quote } from "../../lib/format.js";

/** The names of an enum constant's values, in lowercase with spaces: `KICK_OUT` → `kick out`. */
function namesOf(
  values: Readonly<Record<string, number>>,
): Readonly<Record<number, string>> {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      value,
      name.toLowerCase().replaceAll("_", " "),
    ]),
  );
}

const BATTLE_ACTIONS: Readonly<Record<number, string>> = {
  [BattleAction.INVITE]: "invited",
  [BattleAction.REJECT]: "rejected",
  [BattleAction.CANCEL]: "canceled",
  [BattleAction.OPEN]: "started",
  [BattleAction.FINISH]: "finished",
  [BattleAction.CUT_SHORT]: "cut short",
  [BattleAction.ACCEPT]: "accepted",
};
const PUNISH_REASONS: Readonly<Record<number, string>> = {
  [PunishFinishReason.TIME_UP]: "time up",
  [PunishFinishReason.CUT_SHORT]: "cut short",
};
const TASK_RESULTS: Readonly<Record<number, string>> = {
  [BattleTaskResult.SUCCEED]: "succeeded",
  [BattleTaskResult.FAILED]: "failed",
  [BattleTaskResult.BOTH_SUCCEED]: "both succeeded",
};
const MEDIA_OPS: Readonly<Record<number, string>> = {
  [GuestMicCameraManageOp.OPEN_MIC]: "mic on",
  [GuestMicCameraManageOp.OPEN_CAMERA]: "camera on",
  [GuestMicCameraManageOp.CLOSE_MIC]: "mic off",
  [GuestMicCameraManageOp.CLOSE_CAMERA]: "camera off",
  [GuestMicCameraManageOp.CLOSE_MIC_PUNISH]: "mic off (punished)",
};
const NOTICE_TYPES = namesOf(BattleNoticeType);
const ICE_SHOWDOWN_SETTINGS = namesOf(IceShowdownSetting);
const LAYER_TYPES = namesOf(LinkLayerMessageType);
const STATE_TYPES = namesOf(LinkStateType);

/** A value's name, or `(what N)` for one the constant doesn't have. */
function named(
  names: Readonly<Record<number, string>>,
  value: number,
  what: string,
): string {
  return names[value] ?? `(${what} ${value})`;
}

function agreed(status: number): string {
  return status === AgreeStatus.AGREE
    ? "agreed"
    : status === AgreeStatus.REJECT
      ? "rejected"
      : `replied ${status}`;
}

function userId(player: Player | undefined): string {
  return player?.userId ?? "?";
}

function describeBattle(battle: LinkMicBattle): string {
  const action = named(BATTLE_ACTIONS, battle.action, "action");
  const names = new Map<string, string>();
  for (const { key, value } of battle.anchorsInfo) {
    names.set(key, value?.user?.nickName.trim() || key);
  }
  const scores = new Map<string, number>();
  for (const { key, value } of battle.battleResult) {
    if (value !== undefined) scores.set(key, value.score);
  }
  const hosts = [...new Set([...names.keys(), ...scores.keys()])].map((key) => {
    const score = scores.get(key);
    const name = names.get(key) ?? key;
    return score === undefined ? name : `${name} ${formatCount(score)}`;
  });
  const sides = hosts.length > 0 ? `: ${hosts.join(" vs ")}` : "";
  return `battle ${battle.battleId} ${action}${sides}`;
}

function describeArmies(armies: LinkMicArmies): string {
  const sides = armies.armies.map(({ key, value }) => {
    const top = value?.userArmies.reduce<BattleUserArmy | undefined>(
      (best, army) =>
        best === undefined || army.score > best.score ? army : best,
      undefined,
    );
    const supporter =
      top === undefined
        ? ""
        : ` (top: ${nickname(top)} ${formatCount(top.score)})`;
    return `${key} ${formatCount(value?.hostScore ?? 0)}${supporter}`;
  });
  const end =
    armies.triggerReason === ArmiesTriggerReason.BATTLE_END
      ? ", battle end"
      : "";
  return sides.length > 0
    ? `battle ${armies.battleId} scores: ${sides.join(", ")}${end}`
    : `battle ${armies.battleId}: no scores${end}`;
}

function describeTask(task: LinkMicBattleTask): string {
  const what = (() => {
    switch (task.taskMessageType) {
      case BattleTaskMessageType.START:
        return "started";
      case BattleTaskMessageType.TASK_UPDATE:
        return `progressed to ${formatCount(task.taskUpdate?.progress ?? 0)}`;
      case BattleTaskMessageType.TASK_SETTLE:
        return `settled: ${named(TASK_RESULTS, task.taskSettle?.result ?? 0, "result")}`;
      case BattleTaskMessageType.REWARD_SETTLE:
        return "reward settled";
      default:
        return `(type ${task.taskMessageType})`;
    }
  })();
  return `battle ${task.battleId} task ${what}`;
}

/** One part of a line: what one content says, or undefined when it isn't set. */
type Part<T> = (payload: T) => string | undefined;

/** The parts of a payload's contents that are set, in order. */
function partsOf<T>(payload: T, parts: readonly Part<T>[]): string[] {
  return parts.flatMap((part) => part(payload) ?? []);
}

const LINK_MESSAGE_PARTS: readonly Part<LinkMessage>[] = [
  ({ inviteContent: invite }) =>
    invite && `invited by ${nickname(invite.fromUser)}`,
  ({ replyContent: reply }) =>
    reply && `reply ${reply.replyStatus} from ${nickname(reply.fromUser)}`,
  ({ enterContent: enter }) => enter && `${enter.linkedUsers.length} entered`,
  ({ leaveContent: leave }) => leave && `${leave.userId} left`,
  ({ kickOutContent: kick }) => kick && `kicked out by ${kick.fromUserId}`,
  ({ linkedListChangeContent: linked }) =>
    linked && `${linked.linkedUsers.length} linked`,
  ({ muteContent: mute }) =>
    mute &&
    `${mute.userId} ${mute.muteStatus === MuteStatus.UN_MUTE ? "unmuted" : "muted"}`,
  ({ listChangeContent: lists }) =>
    lists &&
    `${lists.linkedUsers.length} linked, ${lists.appliedUsers.length} applied, ${lists.connectingUsers.length} connecting`,
  ({ mediaChangeContent: media }) =>
    media && `${named(MEDIA_OPS, media.op, "op")} for ${media.toUserId}`,
];

function describeLinkMessage(link: LinkMessage): string {
  const parts = partsOf(link, LINK_MESSAGE_PARTS);
  const what = parts.length > 0 ? parts.join("; ") : "no content";
  return `link type ${link.messageType} (${link.linkerId}): ${what}`;
}

function describeLayerLists({ list }: LinkListChangeContent): string {
  const ids = (list?.linkedList ?? []).map((user) => userId(user.user));
  return `linked ${ids.length > 0 ? ids.join(", ") : "none"}, ${list?.appliedList.length ?? 0} applied, ${list?.invitedList.length ?? 0} invited`;
}

// A group participant: its user id, else its channel.
function groupPlayerId(player: GroupPlayer | undefined): string {
  const id = player?.user?.userId;
  return id !== undefined && id !== "0" ? id : (player?.channelId ?? "?");
}

// A group's channels: each one's linked user (else the channel), marked when
// it is still waiting.
function describeGroup(group: GroupChannelAllUser | undefined): string {
  if (group === undefined) return "group ?";
  const members = group.user.map((channel) => {
    const id =
      channel.allUser?.linkedList[0]?.user?.userId ?? channel.channelId;
    return channel.status === GroupStatus.WAITING ? `${id} (waiting)` : id;
  });
  return `group ${group.groupChannelId}: ${members.length > 0 ? members.join(", ") : "nobody"}`;
}

const LAYER_PARTS: readonly Part<LinkLayerMessage>[] = [
  ({ listChangeContent: lists }) => lists && describeLayerLists(lists),
  ({ inviteContent: invite }) =>
    invite && `${userId(invite.invitor)} invited ${userId(invite.invitee)}`,
  ({ applyContent: apply }) => apply && `${userId(apply.applier)} applied`,
  ({ permitApplyContent: permit }) =>
    permit &&
    `${userId(permit.permiter)} ${agreed(permit.replyStatus)} ${userId(permit.applier)}`,
  ({ replyInviteContent: reply }) =>
    reply && `${userId(reply.invitee)} ${agreed(reply.replyStatus)}`,
  ({ kickOutContent: kick }) =>
    kick &&
    `${userId(kick.offliner)} kicked out (reason ${kick.kickoutReason})`,
  ({ leaveContent: leave }) => leave && `${userId(leave.leaver)} left`,
  ({ finishContent: finish }) => finish && `${userId(finish.owner)} finished`,
  ({ joinGroupContent: join }) =>
    join &&
    `${groupPlayerId(join.joinUser)} joined ${describeGroup(join.groupUser)}`,
  ({ permitGroupContent: permit }) =>
    permit &&
    `${groupPlayerId(permit.approver)} ${agreed(permit.agreeStatus)} joining ${describeGroup(permit.groupUser)}`,
  ({ cancelGroupContent: cancel }) =>
    cancel &&
    `${cancel.leaver.map(groupPlayerId).join(", ") || "?"} canceled joining`,
  ({ leaveGroupContent: leave }) =>
    leave &&
    `${groupPlayerId(leave.operator)} left group ${leave.groupChannelId}`,
  ({ p2pGroupChangeContent: change }) =>
    change && describeGroup(change.groupUser),
  ({ groupChangeContent: change }) => change && describeGroup(change.groupUser),
  ({ joinGroupDirectContent: join }) =>
    join && `joined directly ${describeGroup(join.groupUser)}`,
  ({ joinRoomDirectContent: join }) =>
    join && `${userId(join.joiner)} joined the room directly`,
];

function describeLayer(layer: LinkLayerMessage): string {
  const parts = partsOf(layer, LAYER_PARTS);
  const type = named(LAYER_TYPES, layer.messageType, "type");
  const what = parts.length > 0 ? `: ${parts.join("; ")}` : "";
  return `link ${type} in channel ${layer.channelId}${what}`;
}

function describeState(state: LinkStateMessage): string {
  const type = named(STATE_TYPES, state.stateType, "type");
  const ids = state.userStates.map((user) => userId(user.user));
  const users = ids.length > 0 ? `users ${ids.join(", ")}` : "no users";
  return `link state ${type} in channel ${state.channelId}: ${users}`;
}

function describeNotice(notice: LinkMicBattleNotice): string {
  const type = named(NOTICE_TYPES, notice.noticeType, "type");
  const text = notice.commonGuide?.displayText;
  if (text === undefined) return `battle notice ${type}`;
  return `battle notice ${type}: ${text.key} ${quote(text.defaultPattern)}`;
}

function describeOpponentGifts(gifts: LinkMicOpponentGifts): string {
  const each = `${formatCount(gifts.giftPrice)} coin${gifts.giftPrice === 1 ? "" : "s"} each`;
  return `battle ${gifts.battleId}: ${gifts.fromUserId} sent gift ${gifts.giftId} x${formatCount(gifts.giftCount)} (${each}, streak ${formatCount(gifts.repeatCount)}) to ${gifts.giftToUserId}`;
}

function describeGameplay(gameplay: BattleGameplayMessage): string {
  const ice = gameplay.iceShowdownInfo;
  if (ice === undefined) return `battle ${gameplay.battleId} gameplay`;
  const lead = Number(ice.startTimeMs) - Number(ice.promptTimeMs);
  return `battle ${gameplay.battleId} ice showdown, ${named(ICE_SHOWDOWN_SETTINGS, ice.settingType, "setting")}, starts ${formatCount(lead)} ms after its prompt`;
}

/** The link group's describers: one per event with a sample line of its own. */
export const linkDescribers = {
  linkMicBattle: describeBattle,
  linkMicArmies: describeArmies,
  linkMicBattlePunishFinish: (finish: LinkMicBattlePunishFinish) =>
    `battle ${finish.battleId} punishment over, ${named(PUNISH_REASONS, finish.reason, "reason")}`,
  linkMicBattleTask: describeTask,
  linkMicFanTicketMethod: (tickets: LinkMicFanTicketMethod) => {
    const notice = tickets.fanTicketRoomNotice;
    if (notice === undefined) return "fan tickets (no notice)";
    const guests = notice.userFanTicket.length;
    return `fan tickets: ${formatCount(notice.totalLinkmicFanTicket)} in total, ${guests} guest${guests === 1 ? "" : "s"}`;
  },
  linkMicMethod: (method: LinkMicMethod) => {
    const linked =
      method.linkedUsers.length > 0
        ? `, ${method.linkedUsers.length} linked`
        : "";
    return `link-mic type ${method.messageType}, user ${method.userId}${linked}`;
  },
  linkMessage: describeLinkMessage,
  linkLayer: describeLayer,
  linkState: describeState,
  linkMicBattleNotice: describeNotice,
  linkMicOpponentGifts: describeOpponentGifts,
  battleGameplay: describeGameplay,
} satisfies { [K in LinkEvent]?: (payload: WebcastEventMap[K]) => string };
