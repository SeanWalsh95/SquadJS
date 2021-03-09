import Sequelize from 'sequelize';
import DiscordBasePlugin from './discord-base-plugin.js';

const { DataTypes } = Sequelize;

export default class DiscordSeedingRewards extends DiscordBasePlugin {
  static get description() {
    return 'Redeems seeding "Points" for a discord Role';
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

    this.db = this.options.database;
    this.discord = this.options.discordClient;

    // rato of seed points days of whitelist
    this.pointRewardRatio = {
      points: /* sec */ 60 * /* min */ 60 * /* hour */ 3,
      whitelistTime: /* ms */ 1000 /* sec */ * 60 /* min */ * 60 /* hour */ * 24 /* day */ * 7
    };

    this.defineSqlModels();

    this.clearExpiredRewards = this.clearExpiredRewards.bind(this);

    this.onMessage = this.onMessage.bind(this);
  }

  defineSqlModels() {
    this.Redemptions = this.options.database.define(
      `DiscordRewards_Redemptions`,
      {
        discordID: {
          type: DataTypes.STRING,
          primaryKey: true
        },
        serverID: {
          type: DataTypes.STRING
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

    await this.Redemptions.sync();
  }

  async mount() {
    this.options.discordClient.on('message', this.onMessage);
    this.clearExpiredRewardsInterval = setInterval(
      this.clearExpiredRewards,
      1000 * 60 * 0.25 /* 15 */
    );
  }

  async unmount() {
    this.options.discordClient.removeEventListener('message', this.onMessage);
    clearInterval(this.clearExpiredRewardsInterval);
  }

  async onMessage(message) {
    if (
      message.author.bot ||
      message.channel.id !== this.options.channelID ||
      !message.content.startsWith('!')
    )
      return;

    const rawQuerRes = await this.db.query(
      `SELECT * FROM DiscordSteam_Users u 
      LEFT JOIN (
        SELECT * from SeedLog_Points 
      ) s ON s.steamID = u.steamID WHERE u.discordID = ${message.author.id}`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const userRow = rawQuerRes[0];

    if (!userRow.steamID) {
      message.reply(
        'Send me your Steam64Id so I can lookup your account activity and assign you rewards'
      );
      return;
    }

    if (message.content.toLowerCase().startsWith('!redeem')) {
      if (this.options.noRewards) return;

      const existing = await this.Redemptions.findOne({ where: { discordID: message.author.id } });
      if (existing) {
        message.reply('you already have an active reward');
        return;
      }
      if (userRow.points >= this.pointRewardRatio.points) {
        const rewardRole = await message.guild.roles.resolve(this.options.discordRewardRoleID);
        await message.member.roles.add(rewardRole);
        await this.db.query(
          `UPDATE SeedLog_Points
           SET points = points - ${this.pointRewardRatio.points} 
           WHERE steamID = ${userRow.steamID}`,
          { type: Sequelize.QueryTypes.UPDATE }
        );
        await this.Redemptions.upsert({
          discordID: message.author.id,
          serverID: this.options.serverID,
          roleID: this.options.discordRewardRoleID,
          expires: new Date(Date.now() + this.pointRewardRatio.whitelistTime)
        });
        this.verbose(
          1,
          `${message.author.tag} redeemed "${rewardRole.name}" for ${this.pointRewardRatio.points}`
        );
        message.reply(`congratulations, your week of whitlisting starts now`);
      } else {
        message.reply(`You dont have enough seeding time to redeem a reward`);
      }
    }

    if (message.content.toLowerCase().startsWith('!seeding')) {
      if (userRow.points >= this.pointRewardRatio.points) {
        message.reply(
          `you have seeded on our server for ${this.formatSeconds(
            userRow.totalSeedTime
          )}\n**you are eligible for whitelist from seeding** use \`!redeem\` to get a week of whitelist`
        );
      } else {
        message.reply(
          `you have seeded on our server for ${this.formatSeconds(userRow.totalSeedTime)}`
        );
      }
    }
  }

  async clearExpiredRewards() {
    this.verbose(1, `Clearing Expired Rewards...`);
    const expired = await this.Redemptions.findAll({
      where: { expires: { [Sequelize.Op.lte]: Date.now() } }
    });
    for (const e of expired) {
      const guild = await this.discord.guilds.fetch(e.serverID);
      const member = await guild.members.fetch(e.discordID);
      member.roles.remove(await guild.roles.resolve(e.roleID));
      this.verbose(3, `removed role from ${member.tag}`);
      this.Redemptions.destroy({ where: { discordID: e.discordID } });
    }
    if (expired.length > 0) this.verbose(1, `${expired.length} rewards removed...`);
  }

  formatSeconds(timeInSeconds) {
    // take in generic # of seconds and return formatted HH:MM
    const hr = Math.floor((timeInSeconds / 3600) % 24);
    let min = Math.floor((timeInSeconds / 60) % 60);
    // let sec = Math.floor(timeInSeconds % 60);

    min = `${min}`.padStart(2, '0');
    // sec = (`${sec}`).padStart(2, '0');
    return `${hr} hours and ${min} minutes`;
  }
}
