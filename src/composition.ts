import { PuzzleRoundRepository } from "./repositories/PuzzleRoundRepository.js";
import { AnswerSessionRepository } from "./repositories/AnswerSessionRepository.js";
import { PlayerStatsRepository } from "./repositories/PlayerStatsRepository.js";
import { FirestoreTransactor } from "./repositories/Transactor.js";
import { AnswerFlowService } from "./services/AnswerFlowService.js";
import { LineMessagingService } from "./services/LineMessagingService.js";
import { ImageStorageService } from "./services/ImageStorageService.js";
import { PuzzleImageService } from "./services/PuzzleImageService.js";
import { PuzzlePreviewService } from "./services/PuzzlePreviewService.js";
import { StartCreationUseCase } from "./useCases/commands/StartCreationUseCase.js";
import { HideUseCase } from "./useCases/commands/HideUseCase.js";
import { CreationStatusUseCase } from "./useCases/commands/CreationStatusUseCase.js";
import { StartChallengeUseCase } from "./useCases/commands/StartChallengeUseCase.js";
import { AnswerUseCase } from "./useCases/commands/AnswerUseCase.js";
import { SkipUseCase } from "./useCases/commands/SkipUseCase.js";
import { ChallengeStatusUseCase } from "./useCases/commands/ChallengeStatusUseCase.js";
import { ResultUseCase } from "./useCases/commands/ResultUseCase.js";
import { RoundSetupUseCase } from "./useCases/RoundSetupUseCase.js";
import { RecruitUseCase } from "./useCases/RecruitUseCase.js";
import { HandleLineEventUseCase } from "./useCases/HandleLineEventUseCase.js";

export function buildHandleLineEventUseCase(): HandleLineEventUseCase {
  const puzzleRounds = new PuzzleRoundRepository();
  const answerSessions = new AnswerSessionRepository();
  const playerStats = new PlayerStatsRepository();
  const transactor = new FirestoreTransactor();
  const answerFlow = new AnswerFlowService(answerSessions, puzzleRounds, playerStats, transactor);
  const lineMessaging = new LineMessagingService();
  const puzzleImages = new PuzzleImageService(new ImageStorageService());
  const puzzlePreview = new PuzzlePreviewService(puzzleImages);

  return new HandleLineEventUseCase({
    commands: {
      問題作成開始: new StartCreationUseCase(puzzleRounds),
      作成状況: new CreationStatusUseCase(puzzleRounds, puzzlePreview),
      挑戦開始: new StartChallengeUseCase(puzzleRounds, answerSessions, answerFlow, puzzlePreview),
      スキップ: new SkipUseCase(puzzleRounds, answerSessions, answerFlow, puzzlePreview),
      挑戦状況: new ChallengeStatusUseCase(puzzleRounds, answerSessions, puzzlePreview),
      結果: new ResultUseCase(playerStats),
    },
    roundSetup: new RoundSetupUseCase(puzzleRounds, puzzleImages, lineMessaging),
    recruit: new RecruitUseCase(puzzleRounds, transactor, puzzlePreview, lineMessaging),
    hide: new HideUseCase(puzzleRounds, transactor, puzzlePreview),
    answer: new AnswerUseCase(puzzleRounds, answerSessions, answerFlow, puzzlePreview, transactor),
    puzzleRounds,
    answerSessions,
    lineMessaging,
  });
}
