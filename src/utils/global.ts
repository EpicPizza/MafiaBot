// Instance-wide settings from instances/{instance}/settings/game.
// Per-game data (started, locked, players, day, grace, extensions, hammer) lives on a GameContext (utils/mafia/context.ts),
// and which games are running comes from each game's state (getRunningGames).
export interface Global {
    admin: string[],
}
