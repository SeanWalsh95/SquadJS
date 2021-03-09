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
    this.SeedPoints = this.options.database.define(`SeedLog_Points`, {
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
    });
    this.SeedPlayers = this.options.database.define(`SeedLog_PlayerLog`, {
      steamID: {
        type: DataTypes.STRING,
        primaryKey: true
      },
      timestamp: {
        type: DataTypes.DATE
      }
    });
  }

  async prepareToMount() {
    this.SteamUsers = this.options.database.models.DBLog_SteamUsers;

    await this.SeedPoints.sync();
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
      this.verbose(1, `Logging Current Players as Seeding...`);
      const currentPlayers = this.server.players.map((player) => player.steamID);
      const intervalTimeSec = parseInt(this.options.interval / 1000);
      await this.SeedPoints.increment('totalSeedTime', {
        by: intervalTimeSec,
        where: { steamID: currentPlayers }
      });
      await this.SeedPoints.increment('points', {
        by: intervalTimeSec,
        where: { steamID: currentPlayers }
      });
      await this.SeedPoints.findOrCreate({
        where: { steamID: currentPlayers },
        defaults: {
          totalSeedTime: 0,
          points: 0
        }
      });
    }
  }
}
