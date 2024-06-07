# Mafia Bot

This bot is made using discord.js library and typescript. Unless someone else recommends another database, I will be using Firebase since it is free and I know how to use it.

## Production

~~Not sure where I will running the bot, Heroku is kinda expensive now.~~ Heroku easy to use and somehow cheaper than google cloud.

## Commands

| Command                   | Action                                                 |
| :------------------------ | :------------------------------------------------------|
| `npm install`             | Installs dependencies                                  |
| `npm run dev`             | Updates commands on dev and starts the local bot.      |
| `npm run build`           | Build the production bot to `./build/`                 |
| `npm run prod`            | Updates commands on prod and runs the production bot.  |

## .env

| Value                     | Description                                            |
| :------------------------ | :------------------------------------------------------|
| `DEV`                     | Either TRUE or FALSE, signifies if running on dev.     |
| `DEVTOKEN`                | Token for development bot.                             |
| `DEVCLIENT`               | Client id of development bot.                          |
| `DEVGUILD`                | Guild id of server development bot is in.              |
| `FIREBASE_ADMIN`          | Key for firebase admin.                                |

## Database

Once you've added firebase admin credentials, run the /setup database command then fill out all null values in settings > setup. Use /setup check to check which values are missing.



