import Sequelize from 'sequelize';
import BasePlugin from './base-plugin.js';

const { DataTypes } = Sequelize;

export default class TrackSeedingPlayer extends BasePlugin {
  static get description() {
    return (
      'Tracks players that are seeding and rewards them with "points" which can be used across other plugins for rewards\n' +
      '"points" represent the number of seconds a player has seeded for'
    );
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
      interval: {
        required: false,
        description: 'Frequency of checking for players.',
        default: 1000 * 60 * 2.5
      },
      database: {
        required: true,
        connector: 'sequelize',
        description: 'The Sequelize connector to log server information to.',
        default: 'mysql'
      },
      seedingThreshold: {
        required: false,
        description: 'Player count required for server not to be in seeding mode.',
        default: 50
      },
      discordRewardRoleID: {
        required: false,
        description: 'A Discord role to give to a user for points',
        default: '',
        example: '667741905228136459'
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    // rato of seed points days of whitelist
    this.pointRewardRatio = {
      points: /* sec */ 60 * /* min */ 60 * /* hour */ 3,
      whitelistTime: /* ms */ 1000 /* sec */ * 60 /* min */ * 60 /* hour */ * 24 /* day */ * 7
    };

    this.defineSqlModels();

    this.logPlayers = this.logPlayers.bind(this);
    this.onMessage = this.onMessage.bind(this);
  }

  defineSqlModels() {
    this.SeedLog = this.options.database.define(
      `SeedLog_Players`,
      {
        steamID: {
          type: DataTypes.STRING,
          primaryKey: true
        },
        totalSeedTime: {
          type: DataTypes.INTEGER
        },
        points: {
          type: DataTypes.INTEGER
        }
      },
      { timestamps: false }
    );

    this.redemptions = this.options.database.define(
      `SeedLog_Redemptions`,
      {
        discordID: {
          type: DataTypes.STRING,
          primaryKey: true
        },
        expires: {
          type: DataTypes.DATE
        }
      },
      { timestamps: false }
    );
  }

  async prepareToMount() {
    await this.SeedLog.sync();
    await this.redemptions.sync();

    this.discordUsers = this.database.models.AutoWL_DiscordUsers;
  }

  async mount() {
    this.options.discordClient.on('message', this.onMessage);
    this.interval = setInterval(this.logPlayers, this.options.interval);
  }

  async unmount() {
    this.options.discordClient.removeEventListener('message', this.onMessage);
    clearInterval(this.interval);
  }

  async onMessage(message) {
    const bypass = true;
    if (message.author.bot || bypass) return;

    const steamID = this.discordUsers.findOne({ where: { discordID: message.author.id } });

    // check if message.author.id exists in DB with steamID if not request steamID
    if (!steamID) {
      message.reply('Please post your Steam64Id so I can lookup your account activity');
      return;
    }

    if (message.content.toLowerCase().includes('!redeem')) {
      const seedTime = false;
      if (seedTime) {
        const seedingRewardRole = message.guild.roles.resolve(this.options.discordRewardRoleID);
        message.member.addRole(seedingRewardRole);
        this.seedLog.decrement('points', {
          by: this.seedRewardRatio.points,
          where: { steamID: steamID }
        });
        this.redemptions.upsert({
          discordID: message.author.id,
          expires: new Date(Date.now() + this.pointRewardRatio.whitelistTime)
        });
      }
    }

    if (message.content.toLowerCase().includes('!seeding')) {
      // reply with seeind time from db
      // message.reply();
    }
  }

  async logPlayers() {
    if (
      this.server.a2sPlayerCount !== 0 &&
      this.server.a2sPlayerCount < this.options.seedingThreshold
    )
      for (const player of this.server.players) {
        const match = await this.SeedLog.findOne({ where: { steamID: player.steamID } });
        if (match) {
          const intervalTimeSec = parseInt(this.options.interval / 1000);
          await this.SeedLog.increment('totalSeedTime', {
            by: intervalTimeSec,
            where: { steamID: player.steamID }
          });
          await this.SeedLog.increment('points', {
            by: intervalTimeSec,
            where: { steamID: player.steamID }
          });
        } else {
          await this.SeedLog.upsert({
            steamID: player.steamID,
            totalSeedTime: 0,
            points: 0
          });
        }
      }
  }
}
