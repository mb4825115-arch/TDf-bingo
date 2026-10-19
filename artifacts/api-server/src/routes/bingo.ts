import { Router, type IRouter } from "express";
import {
  GetBingoStateQueryParams,
  GetBingoStateResponse,
  ResetBingoGameBody,
  ResetBingoGameResponse,
  SelectBingoCardsBody,
  SelectBingoCardsResponse,
  StartBingoGameBody,
  StartBingoGameResponse,
  SubscribeBingoEventsQueryParams,
  SubscribeBingoEventsResponse,
} from "@workspace/api-zod";
import {
  GameRuleError,
  getBingoGameState,
  resetBingoGame,
  selectBingoCards,
  startBingoGame,
  streamBingoGame,
} from "../lib/bingoGame";

const router: IRouter = Router();

router.get("/bingo/state", (req, res): void => {
  const query = GetBingoStateQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.json(GetBingoStateResponse.parse(getBingoGameState(query.data.sessionId)));
});

router.put("/bingo/cards", (req, res): void => {
  const body = SelectBingoCardsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  try {
    const state = selectBingoCards(body.data.sessionId, body.data.cardNumbers);
    res.json(SelectBingoCardsResponse.parse(state));
  } catch (error) {
    if (error instanceof GameRuleError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    req.log.error({ err: error }, "Failed to select Bingo cards");
    res.status(500).json({ error: "Unable to select cards." });
  }
});

router.post("/bingo/game/start", (req, res): void => {
  const body = StartBingoGameBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  try {
    const state = startBingoGame(body.data.sessionId);
    res.json(StartBingoGameResponse.parse(state));
  } catch (error) {
    if (error instanceof GameRuleError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    req.log.error({ err: error }, "Failed to start Bingo game");
    res.status(500).json({ error: "Unable to start the game." });
  }
});

router.post("/bingo/game/reset", (req, res): void => {
  const body = ResetBingoGameBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  try {
    const state = resetBingoGame();
    res.json(ResetBingoGameResponse.parse({ ...state, myCardNumbers: [], myCards: [] }));
  } catch (error) {
    if (error instanceof GameRuleError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    req.log.error({ err: error }, "Failed to reset Bingo game");
    res.status(500).json({ error: "Unable to reset the game." });
  }
});

router.get("/bingo/events", (req, res): void => {
  const query = SubscribeBingoEventsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  if (req.get("accept")?.includes("text/event-stream")) {
    streamBingoGame(res, query.data.sessionId);
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.json(
    SubscribeBingoEventsResponse.parse(
      getBingoGameState(query.data.sessionId),
    ),
  );
});

export default router;
