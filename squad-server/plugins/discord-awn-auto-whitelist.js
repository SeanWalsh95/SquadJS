import Sequelize from 'sequelize';
import axios from 'axios';
import DiscordBasePlugin from './discord-base-plugin.js';

const { DataTypes } = Sequelize;

const steamUrlRgx = /(?:https?:\/\/)?(?<urlPart>steamcommunity.com\/id\/.*?)(?=[\s\b]|$)/;
const steamIdRgx = /(?<steamId>765\d{14})/;
const moderatorMsgRgx = /(?:<@!?)?(?<discordId>\d+)>? (?<steamId>765\d{14})/;

/**
 *  Refactor this to have two seprate systems where one adds to the DB and the other syncs the DB with AWN
 *  prefer try catch with a funtion that throws errors as opposed to if else catch blocks
 *
 */
class ListEntry {
  constructor() {
    this.addedBy = 'unknown'; // Source of the whitelist request
    this.member = null; // DiscordJS Member object of the user looking for whitelist.
    this.steamID = null; // Steam64ID of to be added to the whitelist
    this.listID = null; // AWN Admin List ID
    this.reason = null; // The reason the user was added
  }
}

export default class DiscordAwnAutoWhitelist extends DiscordBasePlugin {
  static get description() {
    return (
      'Automatacally push matching DiscordID:SteamID pairs out to AWN Admin List where a users SteamID has a given role in Discord<br>' +
      '<ul><li>👍 = User added to list successfully</li>' +
      '<li>👎 = Discord user does not have approprate role to be added</li>' +
      '<li>👌 = User already in list as defined</li>' +
      '<li>⏏️ = User already in list with diffrent Steam64ID click to overwrite old ID</li>' +
      '<li>❌ = An Error occurred attempting to add user to list</li></ul>'
    );
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
      },
      seedingWhitelistId: {
        required: false,
        description: 'AWN Admin List ID to add players that have contributed to server seeding',
        default: '',
        example: '1234'
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

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
      },
      reason: {
        type: DataTypes.STRING
      },
      expires: {
        type: DataTypes.DATE
      }
    };

    this.lists = {};

    this.discord = this.options.discordClient;
    this.awn = this.options.awnAPI;

    this.wlLog = this.options.database.define(`AutoWL_Log`, schema, { timestamps: false });
    this.seedLog = null;

    this.seedRewardRatio = {
      points: /* sec */ 60 * /* min */ 60 * /* hour */ 3,
      whitelistTime: /* ms */ 1000 /* sec */ * 60 /* min */ * 60 /* hour */ * 24 /* day */ * 7
    };

    this.onMessage = this.onMessage.bind(this);

    // prune users every 15 minutes
    setInterval(async () => {
      await this.pruneUsers();
    }, 1000 * 60 * 15);
  }

  async prepareToMount() {
    await this.wlLog.sync();
    this.seedLog = this.options.database.models.SeedLog_Players;
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

    try {
      const reaction = await this.parseDiscordMessage(message);
      if (reaction) message.react(reaction);
    } catch (err) {
      this.verbose(3, `${err.message}\n ${err.stack}`);
      message.react('❌');
    }
  }

  /**
   * Parses given discord message for discord/steam Id's
   *
   * @param {Object} message  - A discord.js message object
   * @returns {String} Emoji - An emoji responce to the original message
   */
  async parseDiscordMessage(message) {
    const steamIdMatch = message.content.match(steamIdRgx);
    const steamURLMatch = message.content.match(steamUrlRgx);

    // message does not contain relevant data
    if (!(steamIdMatch || steamURLMatch)) return;

    const entry = new ListEntry();

    if (steamURLMatch) entry.steamID = await this.getSteamIdFromURL(steamURLMatch.groups.urlPart);
    else entry.steamID = steamIdMatch.groups.steamId;

    if (
      message.content.match(moderatorMsgRgx) &&
      message.member._roles.includes(this.options.whitelistModerator)
    ) {
      entry.addedBy = 'Moderator Post';
      if (message.mentions.members) entry.member = message.mentions.members.first();
      else entry.member = message.guild.members.resolve(moderatorMsgRgx.groups.discordId);
    } else {
      entry.addedBy = 'User Message';
      entry.member = message.member;
    }

    const seedInfo = (await this.seedLog.findOne({ where: { steamID: entry.steamID } })) || null;

    // check if member has whitelist role
    const listID = this.getMemberListID(entry.member);
    if (listID) {
      entry.reason = 'Discord Role';
      entry.listID = listID;
    } else if (seedInfo && seedInfo.points >= this.seedRewardRatio.points) {
      entry.reason = 'Seeding Time';
      entry.listID = this.options.seedingWhitelistId;
      entry.expires = new Date(Date.now() + this.seedRewardRatio.whitelistTime);
    } else return '👎';

    // Begin valadation of Entry into AdminList

    // Lookup discord user from DB of Admin List entrys
    const lookup = await this.wlLog.findOne({
      where: { discordID: entry.member.id }
    });

    // discord user already entered SteamID into Admin List, Overwrite?
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
        const res = await this.overwriteAdmin(lookup, entry);
        await message.reactions.removeAll();
        if (res) return '👍';
        else return;
      }
    }

    // not sure this is nessasary if we just sync db and awn periodically and only add/remove from db
    // Check if Steam64Id already in AWN admin list
    const awnList = await this.updateList(entry.listID);
    if (awnList.steam64IDs.includes(entry.steamID)) {
      this.verbose(
        3,
        `${entry.member.user.tag} already in '${awnList.label}' as S64ID:${entry.steamID}`
      );
      return '👌';
    }

    const res = await this.addAdmin(entry);

    if (res) {
      this.verbose(
        1,
        `Added ${entry.steamID} to '${awnList.label}' from ${entry.addedBy} for ${entry.reason}`
      );
      if (entry.reason === 'Seeding Time') {
        await this.seedLog.decrement('points', {
          by: this.seedRewardRatio.points,
          where: { steamID: entry.steamID }
        });
      }
      return '👍';
    } else return '❌';
  }

  /**
   * Removes stale users without discord role from whitelist
   */
  async pruneUsers() {
    this.verbose(1, `Pruning Users...`);
    const guild = await this.discord.guilds.fetch(this.options.serverID);

    const pruneMembers = [];
    for (const row of await this.wlLog.findAll()) {
      const member = await guild.members.resolve(row.discordID);
      const listID = this.getMemberListID(member);
      const seedInfo = (await this.seedLog.findOne({ where: { steamID: row.steamID } })) || null;

      if (row.reason === 'Seeding Time' && seedInfo) {
        if (seedInfo.expires - Date.now() < 0) pruneMembers.push(row);
      } else if (listID == null) pruneMembers.push(row);
    }

    for (const member of pruneMembers) {
      const res = await this.removeAdmin(member.discordID, member.awnListID, member.awnAdminID);
      if (res) this.verbose(1, `Pruned user ${member.lastKnownName}(${member.steamID})`);
      else this.verbose(1, `Failed to prune ${member.lastKnownName}(${member.steamID})`);
    }
  }

  /**
   * updates list from AWN with latest data, adds the attrabute 'steam64IDs' for a quick lookup of all admins in the list
   * returns the updated list or false if the API request failed
   *
   * @param {String} awnListID - ID of list from AWN to update
   */
  async updateList(awnListID) {
    const res = await this.awn.getAdminList(awnListID);
    if (res.success) {
      const s64Ids = res.data.admins
        .filter((a) => {
          return a.type === 'steam64';
        })
        .map((a) => {
          return a.value;
        });
      const ret = Object.assign(res.data, { steam64IDs: s64Ids });
      this.lists[res.data.id] = ret;
      return ret;
    } else {
      this.verbose(1, `Failed to update listId:${awnListID}`);
      return false;
    }
  }

  /**
   * loads all admin lists defined in Options from AWN API.
   */
  async loadLists() {
    const adminListIDs = Object.values(this.options.whitelistRoles).filter((v, i, s) => {
      return s.indexOf(v) === i;
    });
    for (const listID of adminListIDs) this.updateList(listID);
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

  /**
   * Scrape Steamcommunity profile for Steam64ID
   * @param {String} communityURL - URL to community profile
   * @returns {String|null} Steam64ID or null if the scrape failed
   */
  async getSteamIdFromURL(communityURL) {
    const res = await axios({
      method: 'get',
      url: `https://${communityURL}`
    });
    const steamData = JSON.parse(res.data.match(/(?<=g_rgProfileData\s*=\s*)\{.*\}/));
    this.verbose(2, `Scraped Steam64ID:${steamData.steamid} from ${steamData.url}`);
    return steamData.steamid;
  }

  /**
   * Add admin to AWN Admin List
   *
   * @param {ListEntry} entry - ListEntry Object for the member to be added
   */
  async addAdmin(entry) {
    const resAwn = await this.awn.addAdmin(entry.listID, entry.steamID);
    if (resAwn.success) {
      const resSql = await this.wlLog.upsert({
        discordID: entry.member.id,
        steamID: entry.steamID,
        awnAdminID: resAwn.data.id,
        awnListID: entry.listID,
        discordName: entry.member.user.tag,
        addedBy: entry.addedBy,
        reason: entry.reason,
        expires: entry.expires
      });
      this.verbose(3, resSql);
      return Boolean(resSql);
    }
    return false;
  }

  /**
   * Removes Admin from AWN Admin List and DB
   *
   * @param {String} discordID - discord user unique id
   * @param {String} awnListID  - the list to remove the user from
   * @param {String} awnAdminID  - the awn admin id to remove from the list
   */
  async removeAdmin(discordID, awnListID, awnAdminID) {
    const res = await this.awn.removeAdmin(awnListID, awnAdminID);
    if (res.success) {
      const resSql = this.wlLog.destroy({ where: { discordID: discordID } });
      this.verbose(3, resSql);
      return Boolean(resSql);
    }
    return false;
  }

  /**
   * Overerite AWN Admin List entry for a Discord member,
   * this is used when a Discord user has already been added to a AWN Admin List and attempts to add a diffrent Steam64ID
   *
   * @param {Object} lookup - Member Lookup row from DB
   * @param {ListEntry} entry - ListEntry object for the member to be altered
   */
  async overwriteAdmin(lookup, entry) {
    const resRemove = this.removeAdmin(entry.member.id, lookup.awnListID, lookup.awnAdminID);
    let resAdd;

    if (resRemove.success) {
      resAdd = await this.addAdmin(entry);
      this.verbose(
        1,
        `Overwrite ${lookup.steamID} with ${entry.steamID} for member: ${entry.member.user.tag}`
      );
    }

    if (resRemove.success && resAdd.success) {
      return true;
    } else {
      const requests = {
        remove: resRemove.success || resRemove,
        add: resAdd.success || resAdd
      };
      this.verbose(2, `Overwrite ERROR: ${JSON.stringify(requests)}`);
      return false;
    }
  }
}
