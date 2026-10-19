import type { Response } from "express";
import type { BingoCard, BingoGameState } from "@workspace/api-zod";
import { logger } from "./logger";

const CARD_LIMIT = 400;
const ENTRY_FEE_BIRR = 20;
const JACKPOT_PERCENT = 80;
const DERASH_PERCENT = 20;
const DRAW_INTERVAL_MS = 4_000;

export class GameRuleError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 409,
  ) {
    super(message);
    this.name = "GameRuleError";
  }
}

type GameStatus = BingoGameState["status"];

const selections = new Map<string, number[]>();
const calledNumbers: number[] = [];
const eventClients = new Map<Response, string>();

let status: GameStatus = "waiting";
let winnerCardNumbers: number[] = [];
let notice =
  "Demo round is ready. Choose up to two cards. No real Birr is collected.";
let drawTimer: ReturnType<typeof setInterval> | undefined;

function seededRandom(seed: number): () => number {
  let value = (seed * 9_973 + 37) % 2_147_483_647;
  return () => {
    value = (value * 48_271) % 2_147_483_647;
    return value / 2_147_483_647;
  };
}

function createCard(cardNumber: number): BingoCard {
  const random = seededRandom(cardNumber);
  const ranges = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ] as const;
  const numbers = Array<number>(25).fill(0);

  ranges.forEach(([minimum, maximum], column) => {
    const columnNumbers = Array.from(
      { length: maximum - minimum + 1 },
      (_, index) => minimum + index,
    );

    for (let index = columnNumbers.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [columnNumbers[index], columnNumbers[swapIndex]] = [
        columnNumbers[swapIndex],
        columnNumbers[index],
      ];
    }

    columnNumbers
      .slice(0, 5)
      .sort((a, b) => a - b)
      .forEach((number, row) => {
        numbers[row * 5 + column] = number;
      });
  });

  numbers[12] = 0;
  return { cardNumber, numbers };
}

function winningLines(): number[][] {
  const lines: number[][] = [];
  for (let row = 0; row < 5; row += 1) {
    lines.push(Array.from({ length: 5 }, (_, column) => row * 5 + column));
  }
  for (let column = 0; column < 5; column += 1) {
    lines.push(Array.from({ length: 5 }, (_, row) => row * 5 + column));
  }
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return lines;
}

const LINES = winningLines();

function cardHasLine(card: BingoCard, calls: Set<number>): boolean {
  return LINES.some((line) =>
    line.every((index) => index === 12 || calls.has(card.numbers[index])),
  );
}

function findWinners(): number[] {
  const calls = new Set(calledNumbers);
  const winners: number[] = [];

  for (const cardNumbers of selections.values()) {
    for (const cardNumber of cardNumbers) {
      if (cardHasLine(createCard(cardNumber), calls)) winners.push(cardNumber);
    }
  }

  return [...new Set(winners)].sort((a, b) => a - b);
}

function writeEvent(response: Response, sessionId: string): void {
  if (response.writableEnded) {
    eventClients.delete(response);
    return;
  }

  try {
    response.write(`data: ${JSON.stringify(getBingoGameState(sessionId))}\n\n`);
  } catch (error) {
    logger.warn({ err: error }, "Failed to write Bingo event to client");
    response.end();
    eventClients.delete(response);
  }
}

function broadcast(): void {
  for (const [response, sessionId] of eventClients) {
    writeEvent(response, sessionId);
  }
}

function stopDrawTimer(): void {
  if (drawTimer) clearInterval(drawTimer);
  drawTimer = undefined;
}

function callNextNumber(): void {
  if (status !== "calling") {
    stopDrawTimer();
    return;
  }

  const called = new Set(calledNumbers);
  const remaining = Array.from({ length: 75 }, (_, index) => index + 1).filter(
    (number) => !called.has(number),
  );

  if (remaining.length === 0) {
    status = "complete";
    notice = "All 75 numbers were called. The demo round is complete.";
    stopDrawTimer();
    broadcast();
    return;
  }

  const nextNumber = remaining[Math.floor(Math.random() * remaining.length)];
  calledNumbers.push(nextNumber);
  winnerCardNumbers = findWinners();

  if (winnerCardNumbers.length > 0) {
    status = "complete";
    notice = "Line Bingo! The demo round is complete. No payout is made.";
    stopDrawTimer();
  } else if (calledNumbers.length === 75) {
    status = "complete";
    notice = "All 75 numbers were called. No line Bingo; the demo round is complete.";
    stopDrawTimer();
  }

  broadcast();
}

export function getBingoGameState(sessionId: string): BingoGameState {
  const reservedCardNumbers = [...selections.values()]
    .flat()
    .sort((a, b) => a - b);
  const myCardNumbers = [...(selections.get(sessionId) ?? [])].sort(
    (a, b) => a - b,
  );
  const displayedPoolBirr = reservedCardNumbers.length * ENTRY_FEE_BIRR;
  const jackpotBirr = Math.floor(
    (displayedPoolBirr * JACKPOT_PERCENT) / 100,
  );

  return {
    status,
    demo: true,
    entryFeeBirr: ENTRY_FEE_BIRR,
    jackpotPercent: JACKPOT_PERCENT,
    derashPercent: DERASH_PERCENT,
    selectedCardCount: reservedCardNumbers.length,
    displayedPoolBirr,
    jackpotBirr,
    derashBirr: displayedPoolBirr - jackpotBirr,
    reservedCardNumbers,
    myCardNumbers,
    myCards: myCardNumbers.map(createCard),
    calledNumbers: [...calledNumbers],
    currentNumber: calledNumbers.at(-1) ?? null,
    winnerCardNumbers: [...winnerCardNumbers],
    drawIntervalSeconds: 4,
    notice,
  };
}

export function selectBingoCards(
  sessionId: string,
  cardNumbers: number[],
): BingoGameState {
  if (status !== "waiting") {
    throw new GameRuleError(
      "Cards can only be changed before the demo round starts.",
      409,
    );
  }

  if (cardNumbers.length > 2 || new Set(cardNumbers).size !== cardNumbers.length) {
    throw new GameRuleError("Choose no more than two different cards.", 400);
  }

  if (cardNumbers.some((cardNumber) => cardNumber < 1 || cardNumber > CARD_LIMIT)) {
    throw new GameRuleError("Card numbers must be between 1 and 400.", 400);
  }

  const otherReservations = new Set(
    [...selections.entries()]
      .filter(([owner]) => owner !== sessionId)
      .flatMap(([, cards]) => cards),
  );
  const conflict = cardNumbers.find((cardNumber) =>
    otherReservations.has(cardNumber),
  );

  if (conflict !== undefined) {
    throw new GameRuleError(`Card ${conflict} has already been selected.`, 409);
  }

  if (cardNumbers.length === 0) {
    selections.delete(sessionId);
  } else {
    selections.set(sessionId, [...cardNumbers]);
  }

  notice =
    "Demo round is ready. Choose up to two cards. No real Birr is collected.";
  broadcast();
  return getBingoGameState(sessionId);
}

export function startBingoGame(sessionId: string): BingoGameState {
  if (status === "complete") {
    throw new GameRuleError(
      "This demo round is complete. Reset it before starting another.",
      409,
    );
  }

  if (!selections.get(sessionId)?.length) {
    throw new GameRuleError("Choose at least one card before starting.", 400);
  }

  if (status === "waiting") {
    status = "calling";
    notice =
      "The shared demo round is live. A number is called every four seconds.";
    broadcast();
    drawTimer = setInterval(callNextNumber, DRAW_INTERVAL_MS);
  }

  return getBingoGameState(sessionId);
}

export function resetBingoGame(): BingoGameState {
  if (status !== "complete") {
    throw new GameRuleError(
      "The round can only be reset after it is complete.",
      409,
    );
  }

  stopDrawTimer();
  selections.clear();
  calledNumbers.length = 0;
  winnerCardNumbers = [];
  status = "waiting";
  notice = "A new demo round is ready. Choose up to two cards.";
  broadcast();
  return getBingoGameState("");
}

export function streamBingoGame(
  response: Response,
  sessionId: string,
): void {
  response.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  eventClients.set(response, sessionId);
  writeEvent(response, sessionId);

  const heartbeat = setInterval(() => {
    if (!response.writableEnded) response.write(": keep-alive\n\n");
  }, 25_000);

  response.on("close", () => {
    clearInterval(heartbeat);
    eventClients.delete(response);
  });
}
