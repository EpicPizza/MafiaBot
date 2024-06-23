import { Message } from "discord.js"
import { ZodObject, z } from "zod"

export interface Command {
    name: string,
    arguments: (string | number | boolean)[],
    message: Message,
    type: 'text',
    reply: Message["reply"],
    user: Message["author"]
}

export interface CommandOptions {
    name: string,
    arguments: ZodObject<any>[]
}