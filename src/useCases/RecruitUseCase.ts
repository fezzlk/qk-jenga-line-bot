import type { messagingApi } from "@line/bot-sdk";
import { PuzzleRoundRepository } from "../repositories/PuzzleRoundRepository.js";
import type { Transactor } from "../repositories/Transactor.js";
import { PuzzlePreviewService } from "../services/PuzzlePreviewService.js";
import { currentTurnUserId, displayNameOf } from "../domain/services/puzzleRound.js";
import { textMessage, withButtonsOnLast } from "../lineMessages.js";
import { MIN_PARTICIPANTS, type PuzzleRound } from "../types.js";
import { hideButtons, recruitButtons } from "./buttons.js";
import { STALE_BUTTON_REPLY } from "./replies.js";

export type DisplayNameLookup = {
  getDisplayName(groupId: string, userId: string): Promise<string | null>;
};

type JoinResult =
  { kind: "reply"; text: string } | { kind: "joined"; round: PuzzleRound; name: string };

/** 参加する / 締め切る: builds the turn order from the order members tap 参加する. */
export class RecruitUseCase {
  constructor(
    private readonly puzzleRounds: PuzzleRoundRepository,
    private readonly transactor: Transactor,
    private readonly puzzlePreview: PuzzlePreviewService,
    private readonly profiles: DisplayNameLookup,
  ) {}

  async join(groupId: string, userId: string, roundId: string): Promise<messagingApi.Message[]> {
    const existing = await this.puzzleRounds.getByGroupAndPhase(groupId, "recruiting");
    if (!existing || existing.id !== roundId) return [textMessage(STALE_BUTTON_REPLY)];

    // Fetched before the transaction: it's network I/O and the transaction may retry.
    const name = await this.profiles.getDisplayName(groupId, userId);

    // Read-modify-write in a transaction so simultaneous taps can't drop a participant.
    const result = await this.transactor.run(async (txn): Promise<JoinResult> => {
      const round = await this.puzzleRounds.getByIdInTransaction(txn, roundId);
      if (!round || round.phase !== "recruiting")
        return { kind: "reply", text: STALE_BUTTON_REPLY };
      if (round.participantIds.includes(userId)) {
        return { kind: "reply", text: "すでに参加しています。" };
      }
      const participantIds = [...round.participantIds, userId];
      const displayName = name ?? `参加者${participantIds.length}`;
      const participantNames = { ...round.participantNames, [userId]: displayName };
      this.puzzleRounds.updateInTransaction(txn, round.id, { participantIds, participantNames });
      return {
        kind: "joined",
        round: { ...round, participantIds, participantNames },
        name: displayName,
      };
    });

    if (result.kind === "reply") return [textMessage(result.text)];
    const order = result.round.participantIds
      .map((id, i) => `${i + 1}. ${displayNameOf(result.round, id)}`)
      .join("\n");
    return withButtonsOnLast(
      [textMessage(`${result.name}さんが参加しました。\n現在の手番:\n${order}`)],
      recruitButtons(result.round.id),
    );
  }

  async close(groupId: string, userId: string, roundId: string): Promise<messagingApi.Message[]> {
    const round = await this.puzzleRounds.getByGroupAndPhase(groupId, "recruiting");
    if (!round || round.id !== roundId) return [textMessage(STALE_BUTTON_REPLY)];
    if (round.creatorId !== userId) return [textMessage("締め切れるのは作成者だけです。")];
    if (round.participantIds.length < MIN_PARTICIPANTS) {
      return withButtonsOnLast(
        [
          textMessage(
            `隠す人が${MIN_PARTICIPANTS}人以上必要です（同じ人は連続で隠せないため）。現在${round.participantIds.length}人です。`,
          ),
        ],
        recruitButtons(round.id),
      );
    }

    const patch = { phase: "creating" as const, turnIndex: 0, pendingInput: null };
    await this.puzzleRounds.update(round.id, patch);
    const started = { ...round, ...patch };
    const first = currentTurnUserId(started)!;
    const order = started.participantIds
      .map((id, i) => `${i + 1}. ${displayNameOf(started, id)}`)
      .join("\n");
    const messages = await this.puzzlePreview.compose(started, 0, "creation", {
      before: `締め切りました。手番はこの順です:\n${order}`,
      label: "現在の状態",
      after: `最初は${displayNameOf(started, first)}さんの番です。「隠す」を押してください。`,
    });
    return withButtonsOnLast(messages, hideButtons(started.id));
  }
}
