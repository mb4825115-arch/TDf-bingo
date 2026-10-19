# TDf Bingo Telegram Bot

A Python Telegram bot for TDf Bingo, an Ethiopian Bingo game. It uses Telegram's
standard persistent reply keyboard with **Play 20 Birr**, **Balance**, **Deposit**,
**Withdraw**, and **Support** options.

## Setup

1. Create a bot with [@BotFather](https://t.me/BotFather).
2. Save its token as the Replit Secret `TELEGRAM_BOT_TOKEN`.
3. Start the **TDf Bingo Bot** workflow, or run `uv run python main.py`.
4. Open the bot in Telegram and send `/start`.

The bot uses long polling, so it does not require a public webhook URL.

## Current limitations

The game, wallet tracking, deposits, withdrawals, and support routing are not
connected yet. The menu buttons explain this to users. The bot does not accept
or transfer Birr.
