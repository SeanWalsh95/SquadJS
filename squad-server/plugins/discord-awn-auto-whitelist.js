import Sequelize from 'sequelize';
import axios from 'axios';
import DiscordBasePlugin from './discord-base-plugin.js';

const { DataTypes } = Sequelize;

const steamUrlRgx = /(?:https?:\/\/)?(?<urlPart>steamcommunity.com\/id\/.*?)(?=[\s\b]|$)/;
const steamIdRgx = /(?<steamID>765\d{14})/;
const moderatorMsgRgx = /(?:<@!?)?(?<discordID>\d+)>? (?<steamID>765\d{14})/;

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
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.lists = {};

    this.defineSqlModels();

    this.discord = this.options.discordClient;
    this.awn = this.options.awnAPI;

    this.missingSteamIDs = {};

    this.onMessage = this.onMessage.bind(this);

    this.requestMissingSteamIDs = this.requestMissingSteamIDs.bind(this);
  }

  defineSqlModels() {
    // Record of entries into AdminLists from this bot
    this.wlEntries = this.options.database.define(
      `AutoWL_Entries`,
      {
        discordID: {
          type: DataTypes.STRING,
          primaryKey: true
        },
        awnAdminID: {
          type: DataTypes.STRING,
          allowNull: false
        },
        awnListID: {
          type: DataTypes.STRING,
          allowNull: false
        },
        addedBy: {
          type: DataTypes.STRING
        },
        reason: {
          type: DataTypes.STRING
        }
      },
      { timestamps: false }
    );
    // Assoications between a DiscordID and SteamID
    this.discordUsers = this.options.database.define(
      `AutoWL_DiscordUsers`,
      {
        discordID: {
          type: DataTypes.STRING,
          primaryKey: true
        },
        discordTag: {
          type: DataTypes.STRING
        },
        steamID: {
          type: DataTypes.STRING,
          allowNull: false,
          unique: true
        }
      },
      { timestamps: false }
    );

    this.discordUsers.hasOne(this.wlEntries, {
      foreignKey: { name: 'discordID' }
    });
  }

  async prepareToMount() {
    this.guild = await this.options.discordClient.guilds.fetch(this.options.serverID);
    await this.loadLists();

    await this.discordUsers.sync();
    await this.wlEntries.sync();
    this.steamUsers = this.options.database.models.DBLog_SteamUsers;
  }

  async mount() {
    this.options.discordClient.on('message', this.onMessage);

    this.usersUpdateInterval = setInterval(async () => {
      await this.updateEntrysFromRoles();
      await this.pruneUsers();
    }, 1000 * 60 * 1 /* 15 */);
    this.requestMissingSteamIDsInterval = setInterval(
      this.requestMissingSteamIDs,
      1000 * 60 * 0.5 /* 30 */
    );
  }

  async unmount() {
    clearInterval(this.usersUpdateInterval);
    clearInterval(this.requestMissingSteamIDsInterval);
    this.options.discordClient.removeEventListener('message', this.onMessage);
  }

  async onMessage(message) {
    // dont respond to bots
    if (message.author.bot) return;

    // grab/update steamID from DM's
    if (message.channel.type === 'dm') {
      this.verbose(3, `Rceived DM from ${message.author.tag}`);
      const steamIdMatch = message.content.match(steamIdRgx);
      if (steamIdMatch) {
        try {
          await this.storeSteamID(message.author, steamIdMatch.groups.steamID);
          message.react('👍');
          delete this.missingSteamIDs[message.author.id];
        } catch (err) {
          this.verbose(3, `${err.message}\n ${err.stack}`);
          message.react('❌');
        }
      } else return;
    }

    // all functions below this are bound to the channel defined in the config
    if (message.channel.id !== this.options.channelID) return;

    if (message.content.toLowerCase() === '!join') {
      const entries = await this.discordUsers.findAll({
        include: [{ model: this.wlEntries, required: true }]
      });
      for (const row of entries) {
        console.log(JSON.stringify(row));
      }
    }

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
   * Parses given discord message for discord/steam ID's
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
    else entry.steamID = steamIdMatch.groups.steamID;

    if (
      message.content.match(moderatorMsgRgx) &&
      message.member._roles.includes(this.options.whitelistModerator)
    ) {
      entry.addedBy = 'Moderator Post';
      if (message.mentions.members) entry.member = message.mentions.members.first();
      else entry.member = message.guild.members.resolve(moderatorMsgRgx.groups.discordID);
    } else {
      entry.addedBy = 'User Message';
      entry.member = message.member;
    }

    // always record steamID
    await this.storeSteamID(entry.member, entry.steamID);

    // check if member has whitelist role
    const listID = this.getMemberListID(entry.member);
    if (listID) {
      entry.reason = 'Discord Role';
      entry.listID = listID;
    } else return '👎';

    // Begin valadation of Entry into AdminList

    // Lookup discord user from DB of Admin List entrys
    const lookup = await this.wlEntries.findOne({
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
    // Check if Steam64ID already in AWN admin list
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
      return '👍';
    } else return '❌';
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
      const s64IDs = res.data.admins
        .filter((a) => {
          return a.type === 'steam64';
        })
        .map((a) => {
          return a.value;
        });
      const ret = Object.assign(res.data, { steam64IDs: s64IDs });
      this.lists[res.data.id] = ret;
      return ret;
    } else {
      this.verbose(1, `Failed to update listID:${awnListID}`);
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

    /**
     *  steamData object = {
     *    "url":"<profile_url>",
     *    "steamid":"<id>",
     *    "personaname":"<current_displayname>",
     *    "summary":"<summary_from_profile>"
     *  }
     */
    const steamData = JSON.parse(res.data.match(/(?<=g_rgProfileData\s*=\s*)\{.*\}/));
    this.verbose(2, `Scraped Steam64ID:${steamData.steamid} from ${steamData.url}`);

    // non blocking upsert
    this.steamUsers.upsert({
      steamID: steamData.steamid,
      lastName: steamData.personaname
    });

    return steamData.steamid;
  }

  async pruneUsers() {
    this.verbose(1, `Pruning Users...`);

    const membersToPrune = [];

    const userEntries = await this.discordUsers.findAll({
      include: [{ model: this.wlEntries, required: true }]
    });
    for (const userEntry of userEntries) {
      const member = await this.guild.members.fetch(userEntry.discordID);
      const listID = this.getMemberListID(member);
      if (listID == null) membersToPrune.push(userEntry);
    }

    for (const member of membersToPrune) {
      const res = await this.removeAdmin(
        member.discordID,
        member.AutoWL_Entry.awnListID,
        member.AutoWL_Entry.awnAdminID
      );
      if (res) this.verbose(1, `Pruned user ${member.discordTag}(${member.steamID})`);
      else this.verbose(1, `Failed to prune ${member.discordTag}(${member.steamID})`);
    }
  }

  /** This requires the discord bot to have Privileged Gateway - SERVER MEMBERS INTENT  enabled */
  async updateEntrysFromRoles() {
    this.verbose(1, `Updating role rewards...`);
    this.guild = await this.options.discordClient.guilds.fetch(this.options.serverID);

    for (const roleID of Object.keys(this.options.whitelistRoles)) {
      const role = await this.guild.roles.fetch(roleID);
      if (!role) continue;
      this.verbose(2, `Searching "${role.name}"...`);
      for (const [memberID, member] of await this.guild.members.fetch()) {
        if (!member._roles.includes(role.id)) continue;

        const userData = await this.discordUsers.findOne({
          include: [{ model: this.wlEntries, required: false }],
          where: { discordID: memberID }
        });
        if (!userData) {
          this.verbose(
            3,
            `${member.displayName} not registered for rewards from role ${role.name}`
          );
          this.missingSteamIDs[member.id] = null;
          continue;
        }
        if (userData.AutoWL_Entry) {
          this.verbose(3, `${member.displayName} already in list`);
          continue;
        }

        const listID = await this.getMemberListID(member);
        if (!listID) continue;

        const entry = new ListEntry();
        entry.addedBy = 'Role Interval';
        entry.member = member;
        entry.steamID = userData.steamID;
        entry.listID = listID;
        entry.reason = 'Discord Role';
        const res = await this.addAdmin(entry);

        if (res.success) this.verbose(2, `Added ${member.displayName} to whitelist`);
        else this.verbose(1, `ERROR Adding ${JSON.stringify(entry)}`);
      }
    }
  }

  async requestMissingSteamIDs() {
    for (const discordID of Object.keys(this.missingSteamIDs)) {
      const member = await this.guild.members.fetch(discordID);
      if (!member) continue;
      this.verbose(2, `Requesting SteamID from ${member.displayName}...`);
      member.send(
        `You seem to have a pending reward but I need your steamID to give it to you, please send me your steam64ID`
      );
    }
  }

  async storeSteamID(discordUser, steamID) {
    await this.discordUsers.upsert({
      discordID: discordUser.id,
      steamID: steamID,
      discordTag: discordUser.tag
    });
  }

  /**
   * Add admin to AWN Admin List
   *
   * @param {ListEntry} entry - ListEntry Object for the member to be added
   */
  async addAdmin(entry) {
    const res = await this.awn.addAdmin(entry.listID, entry.steamID);
    if (res.success) {
      await this.storeSteamID(entry.member.user, entry.steamID);
      await this.wlEntries.upsert({
        discordID: entry.member.id,
        awnAdminID: res.data.id,
        awnListID: entry.listID,
        addedBy: entry.addedBy,
        reason: entry.reason
      });
    }
    return res;
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
      await this.wlEntries.destroy({ where: { discordID: discordID } });
    }
    return res;
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
