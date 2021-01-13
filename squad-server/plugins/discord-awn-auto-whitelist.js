import Sequelize from 'sequelize';
import axios from 'axios';
import DiscordBasePlugin from './discord-base-plugin.js';

const { DataTypes } = Sequelize;
const { Op } = Sequelize;

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
      },
      verifySteamID: {
        required: false,
        description: 'If this plugin will verify a users Steam64ID when it sees them online',
        default: false
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.defineSqlModels();

    this.discord = this.options.discordClient;
    this.awn = this.options.awnAPI;

    this.missingSteamIDs = {};
    this.tokenLength = 6;

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
        },
        verified: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        token: {
          type: DataTypes.STRING
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
    this.steamUsers = this.options.database.models.DBLog_SteamUsers;

    await this.discordUsers.sync();
    await this.wlEntries.sync();
  }

  async mount() {
    this.options.discordClient.on('message', this.onMessage);

    this.usersUpdateInterval = setInterval(async () => {
      await this.pruneUsers();
      await this.updateEntrysFromRoles();
    }, 1000 * 60 * 1 /* 15 */);
    this.requestMissingSteamIDsInterval = setInterval(async () => {
      if (this.options.verifySteamID) this.verifySteamID();
      this.requestMissingSteamIDs();
    }, 1000 * 60 * 0.5 /* 30 */);
  }

  async unmount() {
    this.options.discordClient.removeEventListener('message', this.onMessage);

    clearInterval(this.usersUpdateInterval);
    clearInterval(this.requestMissingSteamIDsInterval);
  }

  async onMessage(message) {
    // dont respond to bots
    if (message.author.bot) return;

    // only respond to channel in options and DMs
    if (!(message.channel.id === this.options.channelID) && !(message.channel.type === 'dm'))
      return;

    if (this.options.verifySteamID) {
      const user = this.discordUsers.findOne({ where: { steamID: message.author.id } });
      if (!user.verified && message.content.includes(user.token)) {
        this.discordUsers.upsert({
          steamID: message.author.id,
          verified: true,
          token: ''
        });
      }
    }

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

  /** Scrape Steamcommunity profile for Steam64ID
   *   @param {String} communityURL - URL to community profile
   *   @returns {String|null} Steam64ID or null if the scrape failed */
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
      this.getSteamIdFromURL(`https://steamcommunity.com/profiles/${steamIdMatch.groups.steamID}/`);
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

    const lookup = await this.discordUsers.findOne({
      include: [{ model: this.wlEntries, required: false }],
      where: { discordID: entry.member.id }
    });

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

    const userRows = await this.discordUsers.findAll({
      include: [{ model: this.wlEntries, required: true }]
    });
    for (const userRow of userRows) {
      const member = await this.guild.members.fetch(userRow.discordID);
      const listID = this.getMemberListID(member);
      if (listID === null) {
        membersToPrune.push(userRow);
        continue;
      }
      if (listID !== userRow.AutoWL_Entry.awnListID) {
        membersToPrune.push(userRow);
        continue;
      }
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

  async verifySteamID() {
    const unverifiedOnline = await this.discordUsers.findAll({
      where: {
        [Op.and]: [
          { verified: false },
          { steamID: this.server.players.map((player) => player.steamID) }
        ]
      }
    });

    for (const user of unverifiedOnline) {
      this.server.rcon.warn(user.steamID, `Verify your steamID with ${user.token}`);
    }
  }

  generateToken() {
    let token = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < this.tokenLength; i++) {
      token += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return token;
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
        const userData = await this.discordUsers.findOne({
          include: [{ model: this.wlEntries, required: false }],
          where: { discordID: memberID }
        });
        if (!userData) {
          this.verbose(3, `${member.displayName} not registered`);
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
        `You have a pending reward but I need your steamID to give it to you, please send me your steam64ID`
      );
    }
  }

  async storeSteamID(discordUser, steamID) {
    const user = await this.discordUsers.findOrCreate({
      where: { steamID: steamID },
      defaults: {
        discordID: discordUser.id,
        steamID: steamID,
        discordTag: discordUser.tag,
        token: this.generateToken()
      }
    });
    if (user && !user.verified) {
      await this.discordUsers.upsert({
        discordID: discordUser.id,
        steamID: steamID,
        discordTag: discordUser.tag
      });
    }
  }

  /** Add admin to AWN Admin List
   *   @param {ListEntry} entry - ListEntry Object for the member to be added */
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

  /** Removes Admin from AWN Admin List and DB
   *   @param {String} discordID - discord user unique id
   *   @param {String} awnListID  - the list to remove the user from
   *   @param {String} awnAdminID  - the awn admin id to remove from the list */
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
