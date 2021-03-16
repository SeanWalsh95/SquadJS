import Sequelize from 'sequelize';
import BasePlugin from './base-plugin.js';

export default class Discord75th extends BasePlugin {
  static get description() {
    return 'Custom 75th plugin';
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      discordClient: {
        required: true,
        description: 'Discord connector name.',
        connector: 'discord',
        default: 'discord'
      },
      database: {
        required: true,
        connector: 'sequelize',
        description: 'The Sequelize connector to log server information to.',
        default: 'mysql'
      },
      serverID: {
        required: true,
        description: 'The discord serverID.',
        default: '',
        example: '667741905228136459'
      },
      permissions: {
        required: false,
        description: "list of role ID's that are allowed to use this",
        default: [],
        example: ['123456789123456789']
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.db = this.options.database;
    this.commands = ['!getS64'];

    this.onMessage = this.onMessage.bind(this);
  }

  async prepareToMount() {
    this.guild = await this.options.discordClient.guilds.fetch(this.options.serverID);
  }

  async mount() {
    this.options.discordClient.on('message', this.onMessage);
  }

  async unmount() {
    this.options.discordClient.removeEventListener('message', this.onMessage);
  }

  /** This requires the discord bot to have Privileged Gateway - SERVER MEMBERS INTENT  enabled */
  async getRoleInfo(roleID) {
    const resp = [`SteamID, DiscordTag, DiscordName, IGN`];

    const role = await this.guild.roles.fetch(roleID);
    if (!role) return 'Role not found';
    this.verbose(1, `Searching "${role.name}"...`);

    for (const [memberID, member] of await this.guild.members.fetch()) {
      if (!member._roles.includes(role.id)) continue;

      this.verbose(1, `Querying "${member.displayName}"...`);
      const rawQuerRes = await this.db.query(
        `SELECT u.steamID, s.lastName AS "IGN" FROM DiscordSteam_Users u 
        LEFT JOIN ( SELECT * from DBLog_SteamUsers ) s 
        ON s.steamID = u.steamID WHERE u.discordID = ${memberID}`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      const queryResp = rawQuerRes[0] || { steamID: '76500000000000000', IGN: 'None' };

      resp.push(`${queryResp.steamID}, ${member.tag}, ${member.displayName}, ${queryResp.IGN}`);
    }

    // JSON.stringify(info, null, 4)
    return resp.join('\n');
  }

  async onMessage(message) {
    let response = null;

    // check the author of the message is not a bot and that the channel is the RCON console channel
    if (message.author.bot || !this.commands.some((command) => message.content.includes(command)))
      return;

    // no perms return
    if (!this.options.permissions.some((roleID) => message.member._roles.includes(roleID))) return;

    const cmdMatch = message.content.match(/!getS64\s+(?<roleID>\d+)/);
    if (cmdMatch) {
      this.verbose(1, `parsed ${cmdMatch.groups.roleID} from ${message.content}`);
      response = await this.getRoleInfo(cmdMatch.groups.roleID);
    }

    this.verbose(1, response);

    if (response) await this.respondToMessage(message, response);
  }

  async respondToMessage(message, response) {
    for (const splitResponse of this.splitLongResponse(response))
      await message.channel.send(`\`\`\`${splitResponse}\`\`\``);
  }

  splitLongResponse(response) {
    const responseMessages = [''];

    for (const line of response.split('\n')) {
      if (responseMessages[responseMessages.length - 1].length + line.length > 1994) {
        responseMessages.push(line);
      } else {
        responseMessages[responseMessages.length - 1] = `${
          responseMessages[responseMessages.length - 1]
        }\n${line}`;
      }
    }

    return responseMessages;
  }
}
