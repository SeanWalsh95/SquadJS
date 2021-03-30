import Sequelize from 'sequelize';
import DiscordBasePlugin from './discord-base-plugin.js';

const { DataTypes } = Sequelize;

/**
 * @typedef {Object} ListEntry
 * @property {Object} member  - DiscordJS Member object of the user looking for whitelist
 * @property {String} steamID - Steam64ID of to be added to the whitelist
 * @property {String} roleID  - Discord RoleID that was the reason for the whitelist
 * @property {String} listID  - AWN Admin List ID
 * @property {String} reason  - A description for the reason the user was added
 */
class ListEntry {
  constructor() {
    this.member = null;
    this.steamID = null;
    this.roleID = 'unknown';
    this.listID = null;
    this.reason = null;
  }
}

export default class DiscordAwnAutoWhitelist extends DiscordBasePlugin {
  static get description() {
    return (
      'Automatically add Discord users with a given role to an associated AWN AdminList<br>' +
      'This plugin relys on the DiscordSteamLink plugin to source Steam64IDs from users'
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
        required: false,
        description: 'The channelID to notify members from.',
        default: '',
        example: '667741905228136459'
      },
      whitelistRoles: {
        required: true,
        description: 'Discord Role ID and the AWN Admin List ID Pairs',
        default: {},
        example: { '667741905228136459': '1234', '667741905228136460': '1452' }
      },
      updateInterval: {
        required: false,
        description: 'Time in Seconds that admins are updated from discord roles',
        default: 60 * 15
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
        reason: {
          type: DataTypes.STRING
        },
        roleID: {
          type: DataTypes.STRING
        }
      },
      { timestamps: false }
    );
  }

  async prepareToMount() {
    this.guild = await this.options.discordClient.guilds.fetch(this.options.serverID);
    await this.WhitelistEntries.sync();
  }

  async mount() {
    this.usersUpdateInterval = setInterval(async () => {
      await this.pruneUsers();
      await this.updateEntrysFromRoles();
    }, 1000 * this.options.updateInterval);
    this.requestMissingSteamIDsInterval = setInterval(async () => {
      this.requestMissingSteamIDs();
    }, 1000 * 60 * 30);
  }

  async unmount() {
    clearInterval(this.usersUpdateInterval);
    clearInterval(this.requestMissingSteamIDsInterval);
  }

  async pruneUsers() {
    this.verbose(1, `Pruning Users...`);

    const userRows = await this.db.query(
      `SELECT * FROM DiscordSteam_Users u 
      INNER JOIN (
        SELECT * from AutoWL_Entries 
      ) s ON s.discordID = u.discordID`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    for (const userRow of userRows) {
      const member = await this.guild.members.fetch(userRow.discordID);

      // member no longer has role that was reason for whitelist
      if (!member._roles.includes(userRow.roldID)) {
        const res = await this.removeAdmin(member.discordID, member.awnListID, member.awnAdminID);
        if (res) this.verbose(1, `Pruned user ${member.discordTag}(${member.steamID})`);
        else this.verbose(1, `Failed to prune ${member.discordTag}(${member.steamID})`);
      }
    }
  }

  /** This requires the discord bot to have Privileged Gateway - SERVER MEMBERS INTENT  enabled */
  async updateEntrysFromRoles() {
    this.missingSteamIDs = {};
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

        const listID = this.options.whitelistRoles[role.id];
        if (!listID) continue;

        const entry = new ListEntry();
        entry.roleID = role.id;
        entry.member = member;
        entry.steamID = userData.steamID;
        entry.listID = listID;
        entry.reason = `${role.name}`;
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
      if (this.options.channelID) {
        const channel = await this.discord.channels.fetch(this.options.channelID);
        channel.send(
          `${member.user} You have a pending reward but I need your steamID to give it to you, please send me your steam64ID (https://steamid.io/)`
        );
      } else {
        member.send(
          `You have a pending reward but I need your steamID to give it to you, please send me your steam64ID (https://steamid.io/)`
        );
      }
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
        reason: entry.reason,
        roleID: entry.roleID
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
