import Sequelize from 'sequelize';
import DiscordBasePlugin from './discord-base-plugin.js';
import scrapeSteamProfile from '../utils/scrape-steam-profile.js';

const { DataTypes } = Sequelize;
const { Op } = Sequelize;

const steamUrlRgx = /(?:https?:\/\/)?(?<urlPart>steamcommunity.com\/id\/.*?)(?=[\s\b]|$)/;
const steamIdRgx = /(?<steamID>765\d{14})/;
const tokenRgx = /(?<=\b|^)[ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789]{6}(?=(?:\b|$))/;

export default class DiscordSteamLink extends DiscordBasePlugin {
  static get description() {
    return 'Associates a users Discord Profile with their SteamID with the option to verify in game';
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      database: {
        required: true,
        connector: 'sequelize',
        description: 'The Sequelize connector to log server information to.',
        default: 'mysql'
      },
      serverID: {
        required: true,
        description: 'Discord server ID to pull nicknames from.',
        default: '',
        example: '667741905228136459'
      },
      fetchDisplanameInterval: {
        required: false,
        description: 'interval of time between pulling displaynames, null to disable',
        default: null,
        example: 1000 * 60 * 30
      },
      verifySteamID: {
        required: false,
        description:
          'If this plugin will verify a users Steam64ID when it sees them online in game',
        default: false
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.defineSqlModels();
    this.tokenLength = 6;
    this.onMessage = this.onMessage.bind(this);
  }

  defineSqlModels() {
    // Assoications between a DiscordID and SteamID
    this.DiscordUsers = this.options.database.define(
      `DiscordSteam_Users`,
      {
        discordID: {
          type: DataTypes.STRING,
          primaryKey: true
        },
        discordDisplayname: {
          type: DataTypes.STRING
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

  async prepareToMount() {
    this.SteamUsers = this.options.database.models.DBLog_SteamUsers;
    await this.DiscordUsers.sync();
  }

  async mount() {
    this.options.discordClient.on('message', this.onMessage);

    if (this.options.fetchDisplanameInterval)
      this.updateDisplaynameInterval = setInterval(async () => {
        this.updateDisplaynames();
      }, 1000 * 60);
    if (this.options.verifySteamID)
      this.sendUserTokenInterval = setInterval(async () => {
        this.sendUserToken();
      }, 1000 * 60 * 0.25 /* 10 */);
  }

  async unmount() {
    this.options.discordClient.removeEventListener('message', this.onMessage);
    if (this.options.fetchDisplanameInterval) clearInterval(this.updateDisplaynameInterval);
    if (this.options.verifySteamID) clearInterval(this.sendUserTokenInterval);
  }

  async onMessage(message) {
    // dont respond to bots
    if (message.author.bot) return;

    // only respond to DMs
    if (!(message.channel.type === 'dm')) return;

    // check is message is verifacation message
    if (this.options.verifySteamID && message.content.match(tokenRgx)) {
      const user = await this.DiscordUsers.findOne({
        [Op.and]: [{ verified: false }, { discordID: message.author.id }]
      });
      if (user && message.content.includes(user.token)) {
        await this.DiscordUsers.update(
          {
            verified: true,
            token: ''
          },
          { where: { discordID: message.author.id } }
        );
        message.react('👍');
        this.verbose(1, `Verified ${message.author.tag} from token`);
      }
    } else {
      const steamIdMatch = message.content.match(steamIdRgx);
      const steamURLMatch = message.content.match(steamUrlRgx);

      // message does not contain relevant data
      if (!(steamIdMatch || steamURLMatch)) return;

      let steamID = null;
      if (steamURLMatch) {
        steamID = await this.getSteamIdFromURL(steamURLMatch.groups.urlPart);
      } else {
        this.getSteamIdFromURL(`steamcommunity.com/profiles/${steamIdMatch.groups.steamID}/`);
        steamID = steamIdMatch.groups.steamID;
      }

      // find or create initial user entry
      const user = await this.DiscordUsers.findOrCreate({
        where: { discordID: message.author.id },
        defaults: {
          steamID: steamID,
          discordTag: message.author.tag,
          token: this.generateToken()
        }
      });

      // update user entry if unverified
      if (user && !user.verified) {
        await this.DiscordUsers.upsert({
          discordID: message.author.id,
          steamID: steamID,
          discordTag: message.author.tag
        });
      }

      this.verbose(1, `Added SteamID for ${message.author.tag}`);
      message.react('👍');
      if (this.options.verifySteamID && !user.verified)
        message.reply(
          `Thanks, you will be sent a "token" in game to confirm your account, send that token back to me.`
        );
    }
  }

  async updateDisplaynames() {
    const guild = await this.options.discordClient.guilds.fetch(this.options.serverID);

    this.verbose(1, `Updating Displaynames...`);
    for (const row of await this.DiscordUsers.findAll()) {
      let member = null;
      try {
        member = await guild.members.fetch(row.discordID);
      } catch (e) {
        member = 'Left Discord Server';
      }
      if (member) {
        this.DiscordUsers.upsert({
          discordID: row.discordID,
          discordDisplayname: member.displayName
        });
      } else {
        this.verbose(1, `Unknown Member ${row.discordTag}`);
      }
    }
  }

  async getSteamIdFromURL(communityURL) {
    const steamData = await scrapeSteamProfile(communityURL);
    if (steamData) {
      await this.options.database.query(
        `INSERT DBLog_SteamUsers (steamID, lastName)
         VALUES (${steamData.steamID},"${steamData.name}")
         ON DUPLICATE KEY UPDATE steamID=steamID`,
        { type: Sequelize.QueryTypes.INSERT }
      );
      return steamData.steamID;
    }
  }

  async sendUserToken() {
    const unverifiedOnline = await this.DiscordUsers.findAll({
      where: {
        [Op.and]: [
          { verified: false },
          { steamID: this.server.players.map((player) => player.steamID) }
        ]
      }
    });

    for (const user of unverifiedOnline) {
      let userToken = user.token;
      if (!userToken) {
        userToken = this.generateToken();
        await this.DiscordUsers.upsert({
          discordID: user.discordID,
          token: userToken
        });
      }

      this.server.rcon.warn(
        user.steamID,
        `Send "${userToken}" to @${this.options.discordClient.user.username} in discord to verify your account`
      );
      this.verbose(1, `Sending token (${userToken}) to ${user.discordTag} (${user.steamID})`);
    }
  }
}
