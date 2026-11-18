// Instance-wide settings from instances/{instance}/settings/game.
// Per-game data (started, locked, players, day, grace, extensions, hammer) lives on a GameContext (utils/mafia/context.ts).
export interface Global {
    game: string | null, // the running game; goes away once more than one game can run
    admin: string[],
}
