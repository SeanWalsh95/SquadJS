import Sequelize from 'sequelize';
import axios from 'axios';
import DiscordBasePlugin from './discord-base-plugin.js';

const { DataTypes } = Sequelize;

const steamUrlRgx = /(?:https?:\/\/)?(steamcommunity.com\/id\/.*?)(?=[\s\b]|$)/;
const steamIdRgx = /(765\d{14})/;

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
      discordName: {
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

    if (message.content.match(steamIdRgx) || message.content.match(/steamcommunity.com/)) {
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

    let msgContent = message.content;

    const matchURL = msgContent.match(steamUrlRgx);
    if (matchURL) {
      const scrapedSteamID = await this.getSteamIdFromURL(matchURL[1]);
      if (scrapedSteamID) msgContent = msgContent.replace(steamUrlRgx, scrapedSteamID);
      else return '❌';
    }

    if (
      msgContent.match(/\d{17} \d{17}/) &&
      message.member._roles.includes(this.options.whitelistModerator)
    ) {
      entry.source = 'Moderator Post';
      const discordId = msgContent.replace(steamIdRgx, '').match(/(\d{17})/)[1];
      entry.member = message.guild.members.resolve(discordId);
    } else {
      entry.source = 'User Message';
      entry.member = message.member;
    }

    // check if member has whitelist role
    const listID = this.getMemberListID(entry.member);
    if (listID) entry.listID = listID;
    else return '👎';

    const matchSteamId = msgContent.match(steamIdRgx);
    if (matchSteamId) entry.steamID = matchSteamId[1];
    else return '❌';

    return entry;
  }

  /**
   * Ensures a discord user only has one entry
   *
   * @param {Object} message - discord.js message related to new entry.
   * @param {Object} entry - A potential addidion entry into a whitelist.
   * @param {string} entry.member - DiscordJS Member object of the user looking for whitelist.
   * @param {string} entry.steamID - Steam64ID of the user.
   * @param {string} entry.listID - The ID of the list they will be added to.
   */
  async validateEntry(message, entry) {
    const lookup = await this.db.findOne({
      where: { discordID: entry.member.id }
    });

    // discord user already entered SteamID into list, Overwrite?
    if (lookup) {
      if (entry.steamID === lookup.steamID) return '👍'; // user in list as entered

      await message.react('⏏️');
      const filter = (reaction, user) => {
        return ['⏏️'].includes(reaction.emoji.name) && user.id === message.author.id;
      };
      const collection = await message.awaitReactions(filter, {
        max: 1,
        time: 60000,
        errors: ['time']
      });

      // User chooses to overwrite existing entry
      if (collection.first().emoji.name === '⏏️') {
        const res = await this.overwiteAdmin(lookup, entry);
        await message.reactions.removeAll();
        if (res) return '👍';
        else return '❌';
      }
    }

    // Check if Steam64Id already in AWN admin list
    const awnList = await this.getAwnList(entry.listID);
    if (awnList.steam64IDs.includes(entry.steamID)) {
      this.verbose(
        3,
        `${entry.member.user.tag} already in '${awnList.label}' as S64ID:${entry.steamID}`
      );
      return '☑️';
    }

    const res = await this.addAdmin(entry);

    if (res) {
      this.verbose(1, `Added ${entry.steamID} to '${awnList.label}' from ${entry.source}`);
      return '👍';
    } else return '❌';
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
      const res = await this.removeAdmin(member.discordID, member.awnListID, member.awnAdminID);
      if (res) this.verbose(1, `Pruned user ${member.lastKnownName}(${member.steamID})`);
      else this.verbose(1, `Failed to prune ${member.lastKnownName}(${member.steamID})`);
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
    const res = await this.awn.getAdminList(awnListID);
    if (res.success) {
      this.lists[res.data.id] = res.data;
    } else {
      this.verbose(1, `Failed to update listId:${awnListID}`);
    }
  }

  async getAwnList(listID) {
    await this.updateList(listID);
    const s64Ids = this.lists[listID].admins
      .filter((a) => {
        return a.type === 'steam64';
      })
      .map((a) => {
        return a.value;
      });
    return Object.assign(this.lists[listID], { steam64IDs: s64Ids });
  }

  /**
   * returns awnListID if a given member has the approprate roles, otherwise returns null
   * @param {Object} member - discord.js member object
   */
  getMemberListID(member) {
    for (const [role, roleListID] of Object.entries(this.options.whitelistRoles))
      if (member._roles.includes(role)) return roleListID;
    return null;
  }

  async getSteamIdFromURL(communityURL) {
    try {
      const res = await axios({
        method: 'get',
        url: `https://${communityURL}`
      });
      const steamData = JSON.parse(res.data.match(/(?<=g_rgProfileData\s*=\s*)\{.*\}/));
      this.verbose(2, `Scraped Steam64ID:${steamData.steamid} from ${steamData.url}`);
      return steamData.steamid;
    } catch (err) {
      this.verbose(2, JSON.stringify(err));
      return null;
    }
  }

  async addAdmin(entry) {
    const resAwn = await this.awn.addAdmin(entry.listID, entry.steamID);
    if (resAwn.success) {
      const resSql = await this.db.upsert({
        discordID: entry.member.id,
        steamID: entry.steamID,
        awnAdminID: resAwn.data.id,
        awnListID: entry.listID,
        discordName: entry.member.user.tag,
        addedBy: entry.source
      });
      this.verbose(3, resSql);
      return Boolean(resSql);
    }
    return false;
  }

  async removeAdmin(discordID, awnListID, awnAdminID) {
    const res = await this.awn.removeAdmin(awnListID, awnAdminID);
    if (res.success) {
      const resSql = this.db.destroy({ where: { discordID: discordID } });
      this.verbose(3, resSql);
      return Boolean(resSql);
    }
    return false;
  }

  async overwiteAdmin(lookup, entry) {
    const resRemove = await this.awn.removeAdmin(lookup.awnListID, lookup.awnAdminID);
    let resAdd;
    if (resRemove.success) {
      resAdd = await this.awn.addAdmin(entry.listID, entry.steamID);
    }

    if (resRemove.success && resAdd.success) {
      const resSql = await this.db.upsert({
        discordID: entry.member.id,
        steamID: entry.steamID,
        awnAdminID: resAdd.data.id,
        awnListID: entry.listID,
        discordName: entry.member.user.tag,
        addedBy: entry.source
      });
      this.verbose(3, resSql);

      this.verbose(
        1,
        `Overwrite ${lookup.steamID} with ${entry.steamID} for member: ${entry.member.user.tag}`
      );

      return true;
    } else if (resRemove.success) {
      this.db.destroy({ where: { discordID: entry.member.discordID } });
    }

    const requests = {
      remove: resRemove.success || resRemove,
      add: resAdd.success || resAdd
    };
    this.verbose(2, `Overwrite ERROR: ${JSON.stringify(requests)}`);

    return false;
  }
}
