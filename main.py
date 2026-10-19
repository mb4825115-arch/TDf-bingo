"""Telegram entry point for the TDf Bingo bot."""

import logging
import os

from telegram import BotCommand, KeyboardButton, ReplyKeyboardMarkup, Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

PLAY_BUTTON = "Play 20 Birr"
BALANCE_BUTTON = "Balance"
DEPOSIT_BUTTON = "Deposit"
WITHDRAW_BUTTON = "Withdraw"
SUPPORT_BUTTON = "Support"

MENU = ReplyKeyboardMarkup(
    [
        [KeyboardButton(PLAY_BUTTON)],
        [KeyboardButton(BALANCE_BUTTON), KeyboardButton(DEPOSIT_BUTTON)],
        [KeyboardButton(WITHDRAW_BUTTON), KeyboardButton(SUPPORT_BUTTON)],
    ],
    resize_keyboard=True,
    is_persistent=True,
    input_field_placeholder="Choose an option",
)

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("tdf_bingo")


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_message is None:
        return

    await update.effective_message.reply_text(
        "Welcome to TDf Bingo!\n"
        "Play Ethiopian Bingo with a 20 Birr entry.\n\n"
        "Choose an option below to get started.",
        reply_markup=MENU,
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_message is None:
        return

    await update.effective_message.reply_text(
        "Use the menu buttons below to explore TDf Bingo.",
        reply_markup=MENU,
    )


async def play(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_message is None:
        return

    await update.effective_message.reply_text(
        "The 20 Birr game is not accepting entries yet. "
        "No payment has been taken. Game and wallet services are not live."
    )


async def balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_message is None:
        return

    await update.effective_message.reply_text(
        "Balance checks are not available yet because wallet tracking is not enabled."
    )


async def deposit(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_message is None:
        return

    await update.effective_message.reply_text(
        "Deposits are not available yet. This bot does not currently process payments."
    )


async def withdraw(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_message is None:
        return

    await update.effective_message.reply_text(
        "Withdrawals are not available yet. This bot does not currently process payments."
    )


async def support(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_message is None:
        return

    await update.effective_message.reply_text(
        "Support is not connected yet. Please contact the person who shared this bot with you."
    )


async def unknown_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_message is None:
        return

    await update.effective_message.reply_text(
        "Please choose one of the menu options below, or send /start to reopen the menu.",
        reply_markup=MENU,
    )


async def handle_error(
    update: object, context: ContextTypes.DEFAULT_TYPE
) -> None:
    error_type = type(context.error).__name__ if context.error else "UnknownError"
    logger.error("Update handling failed (%s)", error_type)


async def configure_commands(application: Application) -> None:
    await application.bot.set_my_commands(
        [
            BotCommand("start", "Open the TDf Bingo menu"),
            BotCommand("help", "Show how to use this bot"),
        ]
    )


def build_application(token: str) -> Application:
    application = Application.builder().token(token).post_init(configure_commands).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(
        MessageHandler(filters.Regex(r"^Play 20 Birr$"), play)
    )
    application.add_handler(MessageHandler(filters.Regex(r"^Balance$"), balance))
    application.add_handler(MessageHandler(filters.Regex(r"^Deposit$"), deposit))
    application.add_handler(MessageHandler(filters.Regex(r"^Withdraw$"), withdraw))
    application.add_handler(MessageHandler(filters.Regex(r"^Support$"), support))
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, unknown_message)
    )
    application.add_error_handler(handle_error)
    return application


def main() -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError(
            "TELEGRAM_BOT_TOKEN is missing. Add it as a Replit Secret before starting the bot."
        )

    logger.info("Starting TDf Bingo Telegram bot polling.")
    build_application(token).run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
