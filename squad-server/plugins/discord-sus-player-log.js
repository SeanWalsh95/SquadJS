import DiscordBasePlugin from './discord-base-plugin.js';

var squadDateRegx = /(?<year>[0-9]{4})\.(?<month>[0-9]{2})\.(?<day>[0-9]{2})-(?<hour>[0-9]{2}).(?<minute>[0-9]{2}).(?<second>[0-9]{2}):(?<milisecond>[0-9]{3})/;

export default class DiscordSusPlayerLog extends DiscordBasePlugin {
  static get description() {
    return 'The <code>LogSusActivity</code> plugin will log actions in game that are deemed suspicious.';
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      channelID: {
        required: true,
        description: 'ID of channel to log activity to.',
        default: '',
        example: '667741905228136459'
      },
      sendToAPI: {
        required: false,
        description: 'Send activity to API?',
        default: false
      }
    };
  }

  /**
   * Structure of player counter is as follows
   *
   * playerCounter = {
   *   "steamID": { "projectileID":{events:[<relatedProjectileEvents>, loggedTime:firstTimeProjectileWasLogged], "projectileID":{...  }
   *   ...
   * }
   *
   */
  constructor(server, options, optionsRaw) {
    super(server, options, optionsRaw);

    const suspiciousThreshold = 5;
    const purgeAfter = 3;
    const weaponsOfIntrest = ['40MM'];

    let playerCounter = {};

    this.server.on('PLAYER_DAMAGED', async (info) => {
      if (!weaponsOfIntrest.some((r) => info.weapon.includes(r))) return;

      // Copy data to new Object
      var event = Object.assign({}, info);

      // Parse timestamp in event to JS Date
      const d = event.time.match(squadDateRegx).groups;
      event.time = Date.parse(
        `${d.year}-${d.month}-${d.day}T${d.hour}:${d.minute}:${d.second}.${d.milisecond}`
      );

      const steamID = event.attacker.steamID;
      const projectileID = event.projectileID;

      // Track player if not currently tracked
      if (!(steamID in playerCounter)) playerCounter[steamID] = {};

      // Track projectile if not currently tracked
      if (!(projectileID in playerCounter[steamID]))
        playerCounter[steamID][projectileID] = {
          player: event.attacker,
          events: [],
          loggedTime: Date.now()
        };

      // Push current event to projectile list (can be removed if needed, only need to track distinct projectiles)
      playerCounter[steamID][projectileID].events.push(event);
    });

    // Interval to purge old data
    setInterval(() => {
      const time = Date.now();

      // Remove old entries from playerCounter
      for (const steamID in this.playerCounter) {
        playerCounter[steamID] = Object.fromEntries(
          Object.entries(playerCounter[steamID]).filter(([k, v]) => {
            return time < v.loggedTime + 1000 * 60 * purgeAfter;
          })
        );
      }

      // check if ammount remaining after purge is over threshold
      for (const steamID in this.playerCounter) {
        if (Object.keys(playerCounter[steamID]).length > suspiciousThreshold) {
          this.logPlayer(Object.entries(playerCounter[steamID])[0]);
        }
      }
    }, 1000 * 60 * purgeAfter);

    // Reset counter on new game
    server.on('NEW_GAME', async (info) => {
      playerCounter = {};
    });
  }

  async logPlayer(info) {
    const message = {
      embed: {
        title: `${info.attacker.name} detected as Suspicious`,
        color: this.options.color,
        fields: [
          {
            name: 'Player',
            value: info.attacker.name,
            inline: true
          },
          {
            name: 'SteamID',
            value: `[${info.attacker.steamID}](https://squad-community-ban-list.com/search/${info.attacker.steamID})`,
            inline: true
          },
          {
            name: 'Using',
            value: info.weapon
          }
        ],
        timestamp: new Date().toISOString()
      }
    };

    await this.sendDiscordMessage(message);
  }
}
