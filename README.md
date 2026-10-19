# TDf Bingo

TDf Bingo is an Ethiopian 75-ball Bingo demo with a Python Telegram bot and a
Telegram Web App. The bot uses Telegram's standard persistent reply keyboard with
**Play 20 Birr**, **Balance**, **Deposit**, **Withdraw**, and **Support** options.
Play opens the shared card-selection and live-game interface.

## Setup

1. Create a bot with [@BotFather](https://t.me/BotFather).
2. Save its token as the Replit Secret `TELEGRAM_BOT_TOKEN`.
3. Start the **API Server**, **web**, and **TDf Bingo Bot** workflows.
4. Open the bot in Telegram and send `/start`, then tap **Play 20 Birr**.

The bot uses long polling, so it does not require a webhook. For the Play button,
the bot uses `TELEGRAM_WEBAPP_URL` when set, otherwise it uses the configured
Replit web domain. Telegram Web Apps require an HTTPS address.

## Demo rules and limitations

The room uses standard 75-ball cards, lets each session choose up to two cards
from 1–400, and shares called numbers through server-sent events. The displayed
20 Birr/card pool is split 80% Jackpot and 20% Derash. All amounts are
illustrative only: there are no deposits, charges, withdrawals, or payouts.

The live round is stored in API-server memory and resets when that service
restarts. Balance, Deposit, Withdraw, and Support remain informational menu
options; wallet tracking and support routing are not connected.
