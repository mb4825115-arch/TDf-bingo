# TDf Bingo

A Python Telegram bot for TDf Bingo, an Ethiopian Bingo game with a 20 Birr entry option.

## Run & Operate

- Start the Telegram bot with `uv run python main.py`.
- The bot runs as a long-polling process and requires the `TELEGRAM_BOT_TOKEN` Replit Secret.
- Menu actions for balance, deposits, withdrawals, and the 20 Birr game are informational only; no wallet or payment processing is enabled.

## Stack

- Python 3.11
- `python-telegram-bot` 22.x

## Where things live

- `main.py` — bot commands, menu, and button responses
- `pyproject.toml` / `uv.lock` — Python dependencies

## Architecture decisions

- Uses Telegram long polling, so no public webhook endpoint is required.
- Uses a persistent reply keyboard to match the standard Telegram bot menu layout.
- Payment and wallet actions are explicitly unavailable until those systems are configured.

## Product

- `/start` displays the TDf Bingo welcome message and menu.
- Menu options: Play 20 Birr, Balance, Deposit, Withdraw, and Support.

## User preferences

-

## Gotchas

- Never put the Telegram bot token in source code or chat; keep it in Replit Secrets.

## Pointers

- See `README.md` for setup and current limitations.
