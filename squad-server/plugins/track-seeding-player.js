import Sequelize from 'sequelize';
import DiscordBasePlugin from './discord-base-plugin.js';

const { DataTypes } = Sequelize;

export default class TrackSeedingPlayer extends DiscordBasePlugin {
  static get description() {
    return (
      'Tracks players that are seeding and rewards them with "points" which can be used across other plugins for rewards\n' +
      '"points" represent the number of seconds a player has seeded for \n' +
      'This plugin requires DiscordAwnAutoWhitelist to assign rewards properly'
    );
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
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
      minSeedingThreshold: {
        required: false,
        description: 'the minimum number of players in order to count as "seeding".',
        default: 3
      },
      maxSeedingThreshold: {
        required: false,
        description: 'the miximum number of players in order to count as "seeding".',
        default: 40
      },
      discordRewardRoleID: {
        required: false,
        description: 'A Discord role to give to a user for points',
        default: '',
        example: '667741905228136459'
      },
      noRewards: {
        required: false,
        description: 'Determines whether or not rewards are enabled',
        default: false
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.db = this.options.database;

    // rato of seed points days of whitelist
    this.pointRewardRatio = {
      points: /* sec */ 60 * /* min */ 60 * /* hour */ 3,
      whitelistTime: /* ms */ 1000 /* sec */ * 60 /* min */ * 60 /* hour */ * 24 /* day */ * 7
    };

    this.defineSqlModels();

    this.logPlayers = this.logPlayers.bind(this);
    this.clearExpiredRewards = this.clearExpiredRewards.bind(this);

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

    this.Redemptions = this.options.database.define(
      `SeedLog_Redemptions`,
      {
        discordID: {
          type: DataTypes.STRING,
          primaryKey: true
        },
        roleID: {
          type: DataTypes.STRING
        },
        expires: {
          type: DataTypes.DATE
        }
      },
      { timestamps: false }
    );
  }

  async prepareToMount() {
    this.guild = await this.options.discordClient.guilds.fetch(this.options.serverID);

    this.users = this.db.models.AutoWL_DiscordUsers;
    await this.SeedLog.sync();
    await this.Redemptions.sync();
  }

  async mount() {
    this.options.discordClient.on('message', this.onMessage);
    this.logPlayersInterval = setInterval(this.logPlayers, this.options.interval);
    this.clearExpiredRewardsInterval = setInterval(this.clearExpiredRewards, 1000 * 60 * 15);
  }

  async unmount() {
    this.options.discordClient.removeEventListener('message', this.onMessage);
    clearInterval(this.logPlayersInterval);
    clearInterval(this.clearExpiredRewardsInterval);
  }

  async onMessage(message) {
    if (message.author.bot || message.channel.id !== this.options.channelID) return;

    const rawQuerRes = await this.db.query(
      `SELECT * FROM AutoWL_DiscordUsers u 
      LEFT JOIN (
        SELECT * from SeedLog_Players 
      ) s ON s.steamID = u.steamID WHERE u.discordID = ${message.author.id}`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const userRow = rawQuerRes[0];

    if (!userRow.steamID) {
      message.reply(
        'Please post your Steam64Id so I can lookup your account activity and assign you rewards'
      );
      return;
    }

    if (message.content.toLowerCase().includes('!redeem')) {
      if (this.options.noRewards) return;

      const existing = await this.Redemptions.findOne({ where: { discordID: message.author.id } });
      if (existing) {
        message.reply('you already have an active reward');
        return;
      }
      if (userRow.points >= this.pointRewardRatio.points) {
        this.verbose(1, `POINTS`);
        const rewardRole = await message.guild.roles.resolve(this.options.discordRewardRoleID);
        await message.member.roles.add(rewardRole);
        this.SeedLog.decrement('points', {
          by: this.pointRewardRatio.points,
          where: { steamID: userRow.steamID }
        });
        this.Redemptions.upsert({
          discordID: message.author.id,
          roleID: this.options.discordRewardRoleID,
          expires: new Date(Date.now() + this.pointRewardRatio.whitelistTime)
        });
        this.verbose(
          1,
          `${message.author.tag} redeemed ${rewardRole.name} for ${this.pointRewardRatio.points}`
        );
        message.reply(`congratulations, your week of whitlisting starts now`);
      } else {
        message.reply(`You dont have enough seeding time to redeem a reward`);
      }
    }

    if (message.content.toLowerCase().includes('!seeding')) {
      if (userRow.points >= this.pointRewardRatio.points) {
        message.reply(
          `you have seeded on our server for ${this.formatSeconds(
            userRow.totalSeedTime
          )}\n**you are eligible for whitelist from seeding** use !redeem to get a week of whitelist`
        );
      } else {
        message.reply(
          `you have seeded on our server for ${this.formatSeconds(userRow.totalSeedTime)}`
        );
      }
    }
  }

  async logPlayers() {
    if (
      this.server.a2sPlayerCount > this.options.minSeedingThreshold &&
      this.server.a2sPlayerCount < this.options.maxSeedingThreshold
    ) {
      const currentPlayers = this.server.players.map((player) => player.steamID);
      const intervalTimeSec = parseInt(this.options.interval / 1000);
      await this.seedLog.increment('points', {
        by: intervalTimeSec,
        where: { steamID: currentPlayers }
      });
      await this.seedLog.increment('points', {
        by: intervalTimeSec,
        where: { steamID: currentPlayers }
      });
      await this.seedLog.findOrCreate({
        where: { steamID: currentPlayers },
        defaults: {
          totalSeedTime: 0,
          points: 0
        }
      });
    }
  }

  async clearExpiredRewards() {
    this.verbose(1, `Clearing Expired Rewards...`);
    const expired = await this.Redemptions.findAll({
      where: { expires: { [Sequelize.Op.lte]: Date.now() } }
    });
    for (const e of expired) {
      const member = await this.guild.members.fetch(e.discordID);
      member.roles.remove(await this.guild.roles.resolve(e.roleID));
      this.verbose(3, `removed role from ${member.tag}`);
      this.Redemptions.destroy({ where: { discordID: e.discordID } });
    }
    this.verbose(1, `${expired.length} rewards removed...`);
  }

  formatSeconds(timeInSeconds) {
    // take in generic # of ms and return formatted MM:SS
    const hr = Math.floor((timeInSeconds / 3600) % 24);
    let min = Math.floor((timeInSeconds / 60) % 60);
    // let sec = Math.floor(timeInSeconds % 60);

    min = `${min}`.padStart(2, '0');
    // sec = (`${sec}`).padStart(2, '0');
    return `${hr} hours and ${min} minutes`;
  }
}
