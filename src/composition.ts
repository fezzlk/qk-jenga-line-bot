import { PuzzleRoundRepository } from "./repositories/PuzzleRoundRepository.js";
import { AnswerSessionRepository } from "./repositories/AnswerSessionRepository.js";
import { PlayerStatsRepository } from "./repositories/PlayerStatsRepository.js";
import { AnswerFlowService } from "./services/AnswerFlowService.js";
import { LineMessagingService } from "./services/LineMessagingService.js";
import { StartCreationUseCase } from "./useCases/commands/StartCreationUseCase.js";
import { HideUseCase } from "./useCases/commands/HideUseCase.js";
import { CreationStatusUseCase } from "./useCases/commands/CreationStatusUseCase.js";
import { StartChallengeUseCase } from "./useCases/commands/StartChallengeUseCase.js";
import { AnswerUseCase } from "./useCases/commands/AnswerUseCase.js";
import { SkipUseCase } from "./useCases/commands/SkipUseCase.js";
import { ChallengeStatusUseCase } from "./useCases/commands/ChallengeStatusUseCase.js";
import { ResultUseCase } from "./useCases/commands/ResultUseCase.js";
import { HandleLineEventUseCase } from "./useCases/HandleLineEventUseCase.js";

export function buildHandleLineEventUseCase(): HandleLineEventUseCase {
  const puzzleRounds = new PuzzleRoundRepository();
  const answerSessions = new AnswerSessionRepository();
  const playerStats = new PlayerStatsRepository();
  const answerFlow = new AnswerFlowService(answerSessions, puzzleRounds, playerStats);
  const lineMessaging = new LineMessagingService();

  return new HandleLineEventUseCase(
    {
      問題作成開始: new StartCreationUseCase(puzzleRounds),
      隠す: new HideUseCase(puzzleRounds),
      作成状況: new CreationStatusUseCase(puzzleRounds),
      挑戦開始: new StartChallengeUseCase(puzzleRounds, answerSessions, answerFlow),
      回答: new AnswerUseCase(puzzleRounds, answerSessions, answerFlow),
      スキップ: new SkipUseCase(puzzleRounds, answerSessions, answerFlow),
      挑戦状況: new ChallengeStatusUseCase(puzzleRounds, answerSessions),
      結果: new ResultUseCase(playerStats),
    },
    lineMessaging,
  );
}
