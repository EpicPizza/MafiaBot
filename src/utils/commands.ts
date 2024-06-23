import { Message } from "discord.js"
import { ZodObject, z } from "zod"

export interface Command {
    name: string,
    arguments: (string | number | boolean)[],
    message: Message,
}

export interface CommandOptions {
    name: string,
    arguments: ZodObject<any>[]
}