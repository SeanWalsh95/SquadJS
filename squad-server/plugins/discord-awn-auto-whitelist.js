import Sequelize from 'sequelize';
import axios from 'axios';
import DiscordBasePlugin from './discord-base-plugin.js';

const { DataTypes } = Sequelize;

class ListEntry {
  constructor() {
    this.source = 'unknown';
    this.name = null;
    this.discordID = null;
    this.steamID = null;
    this.listID = null;
  }
}

export default class DiscordAwnAutoWhitelist extends DiscordBasePlugin {
  static get description() {
    return 'Automatacally push matching DiscordID:SteamID pairs out to AWN Admin List where a users SteamID has a given role in Discord';
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      awnAPI: {
        required: true,
        description: 'Discord connector name.',
        connector: 'awnAPI',
        default: 'awnAPI'
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
      channelID: {
        required: true,
        description: 'The ID of the channel to control awn from.',
        default: '',
        example: '667741905228136459'
      },
      whitelistModerator: {
        required: false,
        description:
          'Discord Role ID of a moderator the manually inputs discordID and steamID pairs into the whitelist channel',
        default: '',
        example: '667741905228136459'
      },
      whitelistRoles: {
        required: true,
        description: 'Discord Role ID and the AWN Admin List ID Pairs',
        default: {},
        example: { '667741905228136459': '1234', '667741905228136460': '1452' }
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.lists = {};

    this.discord = this.options.discordClient;
    this.awn = this.options.awnAPI;

    const schema = {
      discordID: {
        type: DataTypes.STRING,
        primaryKey: true
      },
      steamID: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      awnAdminID: {
        type: DataTypes.STRING,
        allowNull: false
      },
      awnListID: {
        type: DataTypes.STRING,
        allowNull: false
      },
      lastKnownName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      addedBy: {
        type: DataTypes.STRING
      }
    };

    this.db = this.options.database.define(`AutoWL_Log`, schema, { timestamps: false });

    this.onMessage = this.onMessage.bind(this);

    setInterval(async () => {
      await this.loadLists();
      await this.pruneUsers();
    }, 1000 * 60 * 15);
  }

  async prepareToMount() {
    await this.db.sync();
  }

  async mount() {
    this.options.discordClient.on('message', this.onMessage);
    await this.loadLists();
  }

  async unmount() {
    this.options.discordClient.removeEventListener('message', this.onMessage);
  }

  async onMessage(message) {
    // check the author of the message is not a bot and that the channel is the api request channel
    if (message.author.bot || message.channel.id !== this.options.channelID) return;

    if (message.content.toLowerCase() === '!refresh') {
      message.react('🔄');
      await this.loadLists();
      await message.reactions.removeAll();
      message.react('☑️');
      return;
    }

    if (message.content.toLowerCase() === '!prune') {
      await this.pruneUsers();
      message.react('☑️');
      return;
    }

    if (message.content.match(/\d{17}/) || message.content.match(/steamcommunity.com/)) {
      const entry = await this.parseDiscordMessage(message);
      if (!(entry instanceof ListEntry)) {
        message.react(entry);
        return;
      }
      const reaction = await this.validateEntry(message, entry);
      message.react(reaction);
    }
  }

  /**
   * Parses given discord message for discord/steam Id's
   *
   * @param {Object} message  - A discord.js message object
   * @returns {Object} ListEntry - An AdminList entry
   */
  async parseDiscordMessage(message) {
    const entry = new ListEntry();

    if (
      message.content.match(/\d{17} \d{17}/) &&
      message.member._roles.includes(this.options.whitelistModerator)
    ) {
      // moderator message

      const [discordID, steamId] = message.content.split(' ');
      const member = message.guild.members.resolve(discordID);

      // check if member still has whitelist
      const listID = this.getMemberListID(member);
      if (listID === null) return '👎';

      entry.source = 'Moderator Post';
      entry.name = member.displayName;
      entry.discordID = member.id;
      entry.steamID = steamId;
      entry.listID = listID;
    } else {
      // generic user message

      const listID = this.getMemberListID(message.member);
      if (listID === null) return '👎';

      const matchURL = message.content.match(/steamcommunity.com\/id\/.*(?=[\s\b]|$)/);
      const matchSteamId = message.content.match(/\d{17}/);

      if (matchURL) {
        let res;
        try {
          res = await axios({
            method: 'get',
            url: `https://${matchURL[0]}`
          });
        } catch (err) {
          this.verbose(1, JSON.stringify(err));
          return '❌';
        }
        const steamData = JSON.parse(res.data.match(/(?<=g_rgProfileData\s*=\s*)\{.*\}/));
        this.verbose(2, `Scraped Steam64ID:${steamData.steamid} from ${steamData.url}`);
        entry.steamID = steamData.steamid;
      } else if (matchSteamId) {
        entry.steamID = matchSteamId[0];
      } else {
        return '❌';
      }

      entry.source = 'User Message';
      entry.name = message.member.displayName;
      entry.discordID = message.member.id;
      entry.listID = listID;
    }
    return entry;
  }

  /**
   * Ensures a discord user only has one entry
   *
   * @param {Object} message - discord.js message related to new entry.
   * @param {Object} entry - A potential addidion entry into a whitelist.
   * @param {string} entry.name - Discord displayname of the user looking for whitelist.
   * @param {string} entry.steamID - Steam64ID of the user.
   * @param {string} entry.discordID - DiscordID of the user.
   * @param {string} entry.listID - The ID of the list they will be added to.
   */
  async validateEntry(message, entry) {
    const lookup = await this.db.findOne({
      where: { discordID: entry.discordID }
    });

    // discord user already entered SteamID into list, Override?
    if (lookup) {
      // user in list as entered
      if (entry.steamID === lookup.steamID) return '👍';

      await message.react('⏏️');
      const filter = (reaction, user) => {
        return ['⏏️'].includes(reaction.emoji.name) && user.id === message.author.id;
      };
      const collection = await message.awaitReactions(filter, {
        max: 1,
        time: 60000,
        errors: ['time']
      });

      // User chooses to override existing entry
      if (collection.first().emoji.name === '⏏️') {
        this.verbose(1, `Overrite ${entry.name}(${entry.discordID}) with ${entry.steamID}`);

        const resp = await this.awn.removeAdmin(lookup.awnListID, lookup.awnAdminID);
        await this.updateList(lookup.awnListID);
        await message.reactions.removeAll();

        if (resp.success) {
          this.verbose(1, `Override ERROR: ${JSON.stringify(resp)}`);
          return '❌';
        }
      }
    }

    const awnList = this.lists[entry.listID];

    if (awnList.steam64s.includes(entry.steamID)) {
      this.verbose(1, `${entry.name} already in '${awnList.label}'`);
      message.react('☑️');
      return;
    }

    const res = await this.awn.addAdmin(entry.listID, entry.steamID);
    if (res.success) {
      await this.db.upsert({
        discordID: entry.discordID,
        steamID: entry.steamID,
        awnAdminID: res.data.id,
        awnListID: entry.listID,
        lastKnownName: entry.name,
        addedBy: entry.source
      });

      this.verbose(1, `Added ${entry.steamID} to '${awnList.label}' from ${entry.source}`);
      this.updateList(entry.listID);
      return '👍';
    } else {
      return '❌';
    }
  }

  /**
   * Removes stale users without discord role from whitelist
   */
  async pruneUsers() {
    this.verbose(1, `Pruning Users...`);
    const guild = await this.discord.guilds.fetch(this.options.serverID);

    const inactiveMembersList = [];
    for (const row of await this.db.findAll()) {
      const listID = this.getMemberListID(await guild.members.resolve(row.discordID));
      if (listID == null) inactiveMembersList.push(row);
    }

    for (const member of inactiveMembersList) {
      const res = await this.awn.removeAdmin(member.awnListID, member.awnAdminID);
      if (res.success) {
        this.db.destroy({ where: { discordID: member.discordID } });
        this.verbose(1, `Pruned user ${member.lastKnownName}(${member.steamID})`);
      } else {
        this.verbose(1, `Failed to prune ${member.lastKnownName}(${member.steamID})`);
      }
    }
  }

  /**
   * loads all admin lists in options from awn.
   */
  async loadLists() {
    const adminListIDs = Object.values(this.options.whitelistRoles).filter((v, i, s) => {
      return s.indexOf(v) === i;
    });
    for (const listID of adminListIDs) this.updateList(listID);
  }

  /**
   * updates list from AWN with latest data
   * @param {String} awnListID - ID of list from AWN to update
   */
  async updateList(awnListID) {
    const res = await this.awn.request('get', `game-servers/admin-lists/${awnListID}`);
    if (res.status === 200) {
      res.data.steam64s = res.data.admins.map((a) => {
        return a.value;
      });
      this.lists[res.data.id] = res.data;
    } else this.verbose(1, `Failed to update listId:${awnListID}`);
  }

  /**
   * returns awnListID if a given member has the approprate roles, otherwise returns null
   * @param {Object} member - discord.js member object
   */
  getMemberListID(member) {
    for (const [role, roleListID] of Object.entries(this.options.whitelistRoles))
      if (member._roles.includes(role)) {
        return roleListID;
      }
    return null;
  }
}
