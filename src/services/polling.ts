import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  CommandInteraction,
  EmbedBuilder,
  Guild,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { ensureCommand } from "src/commands/ensure-command";
import {
  Handler,
  OnButton,
  OnCommand,
  OnFormSubmit,
  OnInit,
} from "src/decorators";
import { Poll } from "src/entities/poll";
import { dataSource, withResource } from "src/init/data-source";
import { getServer } from "src/members/get-server-member";
import { editMessage } from "src/messages";
import { chunks } from "src/util";
import { getSingleCached } from "src/util/caches";

@Handler("poll")
export class PollingService {
  polls: Record<string, Poll[]> = {};
  @OnInit()
  async onInit(client: Client<true>) {
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setDMPermission(false)
        .setName("create-poll")
        .setDescription("Erstelle eine Umfrage...")
        .addChannelOption(c =>
          c
            .setName("channel")
            .setDescription("Umfragekanal")
            .setRequired(false),
        )
        .addIntegerOption(c =>
          c
            .setName("timeframe")
            .setDescription("Zeitspanne")
            .setRequired(false)
            .addChoices(
              {
                name: "10 Sekunden",
                value: 0.161616,
              },
              {
                name: "5 Minuten",
                value: 5,
              },
              {
                name: "10 Minuen",
                value: 10,
              },
              {
                name: "20 Minuten",
                value: 20,
              },
              {
                name: "eine Stunde",
                value: 60,
              },
              {
                name: "zwei Stunden",
                value: 120,
              },
              {
                name: "6 Stunden",
                value: 360,
              },
              {
                name: "12 Stunden",
                value: 720,
              },
              {
                name: "ein Tag",
                value: 1440,
              },
              {
                name: "zwei Tage",
                value: 2880,
              },
              {
                name: "5 Tage",
                value: 7200,
              },
              {
                name: "zwei Wochen",
                value: 20160,
              },
              {
                name: "einen Monat",
                value: 43200,
              },
            ),
        ),
    );

    for (const guild of client.guilds.cache.values()) {
      const polls = (this.polls[guild.id] = await dataSource
        .getRepository(Poll)
        .find({
          where: {
            closed: false,
            guild: { discordId: guild.id },
          },
        }));
      this.schedulePolls(guild, ...polls);
    }
  }

  @OnCommand("create-poll")
  async onCreatePoll(interaction: CommandInteraction) {
    const channel =
      interaction.options.get("channel")?.channel ?? interaction.channel;
    const timeframe = interaction.options.get("timeframe", false)?.value ?? 10;
    await interaction.showModal(
      new ModalBuilder()
        .setTitle("Umfrageoptionen")
        .setCustomId(`poll:create:${channel.id}:${timeframe}`)
        .setComponents(
          new ActionRowBuilder<TextInputBuilder>().setComponents(
            new TextInputBuilder()
              .setStyle(TextInputStyle.Short)
              .setLabel("Umfragetitel")
              .setCustomId("title")
              .setRequired(true)
              .setPlaceholder("Veganismus"),
          ),
          new ActionRowBuilder<TextInputBuilder>().setComponents(
            new TextInputBuilder()
              .setStyle(TextInputStyle.Paragraph)
              .setLabel("Umfragebeschreibung")
              .setCustomId("description")
              .setRequired(true)
              .setPlaceholder("Wie findet ihr Veganismus?"),
          ),
          new ActionRowBuilder<TextInputBuilder>().setComponents(
            new TextInputBuilder()
              .setStyle(TextInputStyle.Paragraph)
              .setLabel("Umfrageoptionen (eine pro Zeile)")
              .setCustomId("options")
              .setRequired(true)
              .setPlaceholder("Super\nGut\nOkay\n..."),
          ),
        ),
    );
  }

  @OnFormSubmit("create")
  async onPollCreate(
    form: ModalSubmitInteraction,
    channelId: string,
    timeframe: string,
  ) {
    await form.deferUpdate();
    const conclusion = new Date(Date.now() + parseInt(timeframe) * 60000);
    const poll = new Poll();
    poll.conclusion = conclusion;
    poll.guild = await getServer(form.guildId);
    poll.options = [
      ...new Set(
        form.fields
          .getTextInputValue("options")
          .split(/[\r\n]+/g)
          .filter(it => it),
      ),
    ];
    poll.description = form.fields.getTextInputValue("description");
    poll.title = form.fields.getTextInputValue("title");
    poll.channelId = channelId;
    poll.counts = {};
    poll.results = Object.fromEntries(poll.options.map(opt => [opt, 0]));
    await dataSource.getRepository(Poll).save(poll);
    const channel = await getSingleCached(form.guild.channels, channelId);
    if (!channel.isTextBased()) return;
    const { id } = await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(`Umfrage: ${poll.title}`)
          .setDescription(poll.description)
          .setFooter({
            text: `Offen bis ${this.formatDate(poll.conclusion)}`,
          }),
      ],
      components: this.buildOptionButtons(poll),
    });
    poll.messageId = id;
    this.polls[form.guildId].push(poll);
    await dataSource.getRepository(Poll).save(poll);
    this.schedulePolls(form.guild, poll);
  }

  @OnButton("select")
  async onPollSelect(btn: ButtonInteraction, pollId: string, option: string) {
    await btn.deferUpdate();
    await withResource(Poll, { id: pollId }, poll => {
      if (poll.closed) return;
      poll.counts = {
        ...poll.counts,
        [btn.user.id]: option.replaceAll("🤡", ":"),
      };
    });
  }

  buildOptionButtons(poll: Poll): ActionRowBuilder<ButtonBuilder>[] {
    const buttonRows = poll.options.map(option =>
      new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setLabel(option)
        .setCustomId(`poll:select:${poll.id}:${option.replaceAll(":", "🤡")}`),
    );
    return chunks(buttonRows, 5).map(row =>
      new ActionRowBuilder<ButtonBuilder>().setComponents(row),
    );
  }

  formatDate(date: Date) {
    return `${date.getHours()}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")} - ${date.getDay()}.${date
      .getMonth()
      .toString()
      .padStart(2, "0")}.${date.getFullYear()}`;
  }

  schedulePolls(guild: Guild, ...polls: Poll[]) {
    for (const poll of polls) {
      if (poll.conclusion <= new Date()) this.concludePoll(guild, poll).then();
      else
        setTimeout(
          this.concludePoll.bind(this, guild, poll),
          +poll.conclusion - +new Date(),
        );
    }
  }

  async concludePoll(guild: Guild, poll: Poll) {
    const polls = this.polls[guild.id];
    polls.splice(polls.indexOf(poll), 1);
    poll.closed = true;
    for (const choice of Object.values(poll.counts)) {
      if (poll.results[choice] == null) poll.results[choice] = 1;
      else poll.results[choice]++;
    }
    await dataSource.getRepository(Poll).save(poll);
    const results = Object.entries(poll.results).sort(([, a], [, b]) => b - a);

    await editMessage(guild, poll.channelId, poll.messageId, {
      embeds: [
        new EmbedBuilder()
          .setTitle(`Geschlossen: ${poll.title}`)
          .setDescription(poll.description)
          .setFields(
            results.map(([title, value]) => ({
              name: title,
              value: value.toString(),
            })),
          )
          .setFooter({
            text: `Geschlossen am ${this.formatDate(poll.conclusion)}`,
          }),
      ],
      components: [],
    });
  }
}
