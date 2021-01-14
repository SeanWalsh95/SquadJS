import Sequelize from 'sequelize';
import DiscordBasePlugin from './discord-base-plugin.js';
import scrapeSteamProfile from '../utils/scrape-steam-profile.js';

const { DataTypes } = Sequelize;

const steamUrlRgx = /(?:https?:\/\/)?(?<urlPart>steamcommunity.com\/id\/.*?)(?=[\s\b]|$)/;
const steamIdRgx = /(?<steamID>765\d{14})/;

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
      'Automatically request steamIDs from users and add users with a given Discord role to an associated AWN AdminList<br>' +
      '<ul><li>👍 = SteamID registered with bot successfully</li>' +
      '<li>❌ = An Error occurred registering a the user</li></ul>'
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

    this.defineSqlModels();

    this.db = this.options.database;
    this.discord = this.options.discordClient;
    this.awn = this.options.awnAPI;

    this.missingSteamIDs = {};
    this.tokenLength = 6;

    this.onMessage = this.onMessage.bind(this);

    this.requestMissingSteamIDs = this.requestMissingSteamIDs.bind(this);
  }

  defineSqlModels() {
    // Record of entries into AdminLists from this bot
    this.WhitelistEntries = this.options.database.define(
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
  }

  async prepareToMount() {
    this.guild = await this.options.discordClient.guilds.fetch(this.options.serverID);
    this.SteamUsers = this.options.database.models.DBLog_SteamUsers;
    this.DiscordUsers = this.options.database.models.DiscordSteam_Users;

    await this.WhitelistEntries.sync();
  }

  async mount() {
    this.options.discordClient.on('message', this.onMessage);

    this.usersUpdateInterval = setInterval(async () => {
      await this.pruneUsers();
      await this.updateEntrysFromRoles();
    }, 1000 * 60 * 1 /* 15 */);
    this.requestMissingSteamIDsInterval = setInterval(async () => {
      this.requestMissingSteamIDs();
    }, 1000 * 60 * 0.5 /* 30 */);
  }

  async unmount() {
    this.options.discordClient.removeEventListener('message', this.onMessage);

    clearInterval(this.usersUpdateInterval);
    clearInterval(this.requestMissingSteamIDsInterval);
  }

  async onMessage(message) {
    const alwaysTrue = true;
    if (alwaysTrue) return;
    // dont respond to bots
    if (message.author.bot) return;

    // only respond to channel in options and DMs
    if (!(message.channel.id === this.options.channelID) && !(message.channel.type === 'dm'))
      return;

    if (message.channel.type === 'dm') {
      this.verbose(3, `Rceived DM from ${message.author.tag}`);
      delete this.missingSteamIDs[message.author.id];
    }

    try {
      const reaction = await this.parseDiscordMessage(message);
      if (reaction) message.react(reaction);
    } catch (err) {
      this.verbose(3, `${err.message}\n ${err.stack}`);
      message.react('❌');
    }
  }

  /** returns awnListID if a given member has the approprate roles, otherwise returns null
   *   @param {Object} member - discord.js member object  */
  getMemberListID(member) {
    for (const [roleID, roleListID] of Object.entries(this.options.whitelistRoles))
      if (member._roles.includes(roleID)) return roleListID;
    return null;
  }

  async getSteamIdFromURL(communityURL) {
    const steamData = scrapeSteamProfile(communityURL);
    if (steamData) {
      await this.db.query(
        `INSERT DBLog_SteamUsers (steamID, lastName)
         VALUES (${steamData.steamID},${steamData.name})
         ON DUPLICATE KEY UPDATE
         lastName = ${steamData.name}`,
        { type: Sequelize.QueryTypes.INSERT }
      );
      return steamData.steamID;
    }
  }

  /** Parses given discord message for discord/steam ID's
   *   @param {Object} message  - A discord.js message object
   *   @returns {String} Emoji - An emoji responce to the original message */
  async parseDiscordMessage(message) {
    const steamIdMatch = message.content.match(steamIdRgx);
    const steamURLMatch = message.content.match(steamUrlRgx);

    // message does not contain relevant data
    if (!(steamIdMatch || steamURLMatch)) return;

    const entry = new ListEntry();

    if (steamURLMatch) {
      entry.steamID = await this.getSteamIdFromURL(steamURLMatch.groups.urlPart);
    } else {
      this.getSteamIdFromURL(`steamcommunity.com/profiles/${steamIdMatch.groups.steamID}/`);
      entry.steamID = steamIdMatch.groups.steamID;
    }

    if (message.channel.type === 'dm') entry.addedBy = 'DM Message';
    else entry.addedBy = 'Channel Message';

    entry.member = await this.guild.members.fetch(message.author.id);

    // check if member has whitelist role
    const listID = this.getMemberListID(entry.member);
    if (listID) {
      entry.reason = `Discord Role`;
      entry.listID = listID;
    }

    const rawQuerRes = await this.db.query(
      `SELECT * FROM DiscordSteam_Users u 
      LEFT JOIN (
        SELECT * from AutoWL_Entries 
      ) s ON s.discordID = u.discordID WHERE u.discordID = ${entry.member.id}`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const lookup = rawQuerRes[0];

    // user already exists
    if (lookup) {
      // user in list as entered
      if (lookup.steamID === entry.steamID) return '👍';

      // lookup has no entry, only update steamID
      if (!lookup.AutoWL_Entry) {
        await this.storeSteamID(entry.member, entry.steamID);
        return '👍';
      }

      // previous SteamID has entry overwrite it.
      const res = await this.overwriteAdmin(lookup, entry);
      if (res) return '👍';
      else return '❌';
    }

    if (!listID) return '❌';

    const res = await this.addAdmin(entry);

    if (res) {
      this.verbose(
        1,
        `Added ${entry.steamID} to AdminList:${entry.listID} from ${entry.addedBy} for ${entry.reason}`
      );
      return '👍';
    } else return '❌';
  }

  async pruneUsers() {
    this.verbose(1, `Pruning Users...`);

    const membersToPrune = [];

    const userRows = await this.db.query(
      `SELECT * FROM DiscordSteam_Users u 
      INNER JOIN (
        SELECT * from AutoWL_Entries 
      ) s ON s.discordID = u.discordID`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    for (const userRow of userRows) {
      const member = await this.guild.members.fetch(userRow.discordID);
      const listID = this.getMemberListID(member);
      if (listID === null) {
        membersToPrune.push(userRow);
        continue;
      }
      if (listID !== userRow.awnListID) {
        membersToPrune.push(userRow);
        continue;
      }
    }

    for (const member of membersToPrune) {
      const res = await this.removeAdmin(member.discordID, member.awnListID, member.awnAdminID);
      if (res) this.verbose(1, `Pruned user ${member.discordTag}(${member.steamID})`);
      else this.verbose(1, `Failed to prune ${member.discordTag}(${member.steamID})`);
    }
  }

  /** This requires the discord bot to have Privileged Gateway - SERVER MEMBERS INTENT  enabled */
  async updateEntrysFromRoles() {
    this.verbose(1, `Updating role rewards...`);
    for (const roleID of Object.keys(this.options.whitelistRoles)) {
      const role = await this.guild.roles.fetch(roleID);
      if (!role) continue;
      this.verbose(2, `Searching "${role.name}"...`);

      for (const [memberID, member] of await this.guild.members.fetch()) {
        if (!member._roles.includes(role.id)) continue;

        const rawQuerRes = await this.db.query(
          `SELECT * FROM DiscordSteam_Users u 
          LEFT JOIN (
            SELECT * from AutoWL_Entries 
          ) s ON s.discordID = u.discordID WHERE u.discordID = ${memberID}`,
          { type: Sequelize.QueryTypes.SELECT }
        );
        const userData = rawQuerRes[0];

        if (!userData) {
          this.verbose(3, `${member.displayName} not registered`);
          this.missingSteamIDs[member.id] = null;
          continue;
        }
        if (userData.awnAdminID) {
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
        `You have a pending reward but I need your steamID to give it to you, please send me your steam64ID`
      );
    }
  }

  /** Add admin to AWN Admin List
   *   @param {ListEntry} entry - ListEntry Object for the member to be added */
  async addAdmin(entry) {
    const res = await this.awn.addAdmin(entry.listID, entry.steamID);
    if (res.success) {
      await this.WhitelistEntries.upsert({
        discordID: entry.member.id,
        awnAdminID: res.data.id,
        awnListID: entry.listID,
        addedBy: entry.addedBy,
        reason: entry.reason
      });
    }
    return res;
  }

  /** Removes Admin from AWN Admin List and DB
   *   @param {String} discordID - discord user unique id
   *   @param {String} awnListID  - the list to remove the user from
   *   @param {String} awnAdminID  - the awn admin id to remove from the list */
  async removeAdmin(discordID, awnListID, awnAdminID) {
    const res = await this.awn.removeAdmin(awnListID, awnAdminID);
    if (res.success) {
      await this.WhitelistEntries.destroy({ where: { discordID: discordID } });
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
    const resRemove = this.removeAdmin(
      entry.member.id,
      lookup.AutoWL_Entry.awnListID,
      lookup.AutoWL_Entry.awnAdminID
    );
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
