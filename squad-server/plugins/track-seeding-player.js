import Sequelize from 'sequelize';
import BasePlugin from './base-plugin.js';

const { DataTypes } = Sequelize;

export default class TrackSeedingPlayer extends BasePlugin {
  static get description() {
    return 'Tracks players that are seeding and rewards them with "points" which are awarded on every interval defined in options';
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
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
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    const schema = {
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
    };

    this.SeedLog = this.options.database.define(`SeedLog_Seeders`, schema, { timestamps: false });

    this.logPlayers = this.logPlayers.bind(this);
  }

  async prepareToMount() {
    await this.SeedLog.sync();
  }

  async mount() {
    this.interval = setInterval(this.logPlayers, this.options.interval);
  }

  async unmount() {
    clearInterval(this.interval);
  }

  async logPlayers() {
    if (
      this.server.a2sPlayerCount !== 0 &&
      this.server.a2sPlayerCount < this.options.seedingThreshold
    ) {
      for (const player of this.server.players) {
        const match = await this.SeedLog.findOne({ where: { steamID: player.steamID } });
        if (match) {
          await this.SeedLog.increment('totalSeedTime', {
            by: parseInt(this.options.interval / 1000),
            where: { steamID: player.steamID }
          });
          await this.SeedLog.increment('points', { where: { steamID: player.steamID } });
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

  async getPlayerPoints(player) {
    const playerRow = await this.SeedLog.findOne({ where: { steamID: player.steamID } });
    return playerRow.points || null;
  }

  async updatePlayerPoints(player, updatedPoints) {
    return await this.SeedLog.upsert({
      steamID: player.steamID,
      points: updatedPoints
    });
  }
}
