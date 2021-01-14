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
      database: {
        required: true,
        connector: 'sequelize',
        description: 'The Sequelize connector to log server information to.',
        default: 'mysql'
      },
      interval: {
        required: false,
        description: 'Frequency of checking for players.',
        default: 1000 * 60 * 2.5
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
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.defineSqlModels();

    this.logPlayers = this.logPlayers.bind(this);
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
  }

  async prepareToMount() {
    this.SteamUsers = this.options.database.models.DBLog_SteamUsers;

    await this.SeedLog.sync();
  }

  async mount() {
    this.logPlayersInterval = setInterval(this.logPlayers, this.options.interval);
  }

  async unmount() {
    clearInterval(this.logPlayersInterval);
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
}
