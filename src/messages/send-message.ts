import {
  Guild,
  GuildMember,
  MessageCreateOptions,
  MessageEditOptions,
  MessagePayload,
  TextChannel,
  User,
} from "discord.js";
import { findTextChannel } from "src/messages/find-channel";
import { findMessage } from "src/messages/find-message";

export async function sendMessage(
  guild: Guild,
  channel: TextChannel | string,
  message: string | MessagePayload | MessageCreateOptions,
) {
  if (typeof channel === "string")
    channel = await findTextChannel(guild, channel);
  return channel.send(message);
}

export async function editMessage(
  guild: Guild,
  channel: TextChannel | string,
  messageId: string,
  body: string | MessageEditOptions | MessagePayload,
) {
  const message = await findMessage(guild, channel, messageId);
  return message.edit(body);
}

export async function sendDm(
  member: GuildMember | User,
  body: string | MessagePayload | MessageCreateOptions,
) {
  if (member.dmChannel) return member.dmChannel.send(body);
  else {
    await member.createDM();
    member.dmChannel.send(body);
    await member.deleteDM();
  }
}
