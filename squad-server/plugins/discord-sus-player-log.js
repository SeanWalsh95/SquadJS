import DiscordBasePlugin from './discord-base-plugin.js';
import Logger from 'core/logger';

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
      },
      thingsToLookFor: {
        required: true,
        description: 'List of weapons of intrest to watch for',
        default: [],
        example: ['40MM']
      },
      susProjectileCount: {
        required: false,
        description: 'number of projectiles within the purge limit',
        default: 5,
      },
      projectilePurgeAfter: {
        required: false,
        description: 'Time in minutes before a projectile is purged',
        default: 1.5,
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

    this.playerCounter = {};

    this.suspiciousThreshold = this.options.susProjectileCount; //number of events within purge limit
    this.purgeAfter = this.options.projectilePurgeAfter; //minutes

    const weaponsOfIntrest = this.options.thingsToLookFor;

    this.server.on('PLAYER_DAMAGED', async (info) => {
      if (!weaponsOfIntrest.some((r) => info.weapon.includes(r))) return;

      // Copy data to new Object
      var event = Object.assign({}, info);

      if(event.attacker && event.attacker.steamID){
        const steamID = event.attacker.steamID;
        const weaponID = event.weapon;
        const projectileID = event.projectileID;


        // Track player if not currently tracked
        if (!(steamID in this.playerCounter)) this.playerCounter[steamID] = {};
        var _weapons = this.playerCounter[steamID];

        //Track weapon if not tracked
        if(!(weaponID in _weapons)) _weapons[weaponID] = {};
        var _projectiles = _weapons[weaponID]

        // Track projectile if not currently tracked
        if (!(projectileID in _projectiles)) {
          _projectiles[projectileID] = {
            firstEvent: event,
            events: 0,
            loggedTime: Date.now()
          };
        }
        _projectiles[projectileID].events++;

        if( Object.keys(_projectiles).length >= this.suspiciousThreshold ){
          Logger.verbose('SusLog', 1, `Suspicious Player: ${event.attacker.name}(${steamID}) using ${event.weapon} ${JSON.stringify(Object.keys( _projectiles ))}`);
          //this.logPlayer(event);
        }

        let tmp = {};
        for (const [weaponID, projectileDict] of Object.entries( _weapons )) {
          tmp[weaponID] = Object.keys(projectileDict);
        }
        Logger.verbose('SusLog', 3, `(${event.attacker.name}) ${JSON.stringify(tmp)}`);
      }
    });

    
    // Interval to purge old data
    setInterval(() => {
      const time = Date.now();
      // Remove old entries from playerCounter
      for (const steamID in this.playerCounter) {
        for (const weaponID in this.playerCounter[steamID]){
          this.playerCounter[steamID][weaponID] = Object.fromEntries(
            Object.entries( this.playerCounter[steamID][weaponID] ).filter(([ projectileID, meta ]) => {
              return time < meta.loggedTime + 1000 * 60 * this.purgeAfter;
            })
          );
        }
      }

      // check if ammount remaining after purge is over threshold
      for (const steamID in this.playerCounter) {
        for (const weaponID in this.playerCounter[steamID]){
          let projectiles = this.playerCounter[steamID][weaponID]
          if( Object.keys(projectiles).length > this.suspiciousThreshold ){
            this.logPlayer( Object.values(projectiles)[0].firstEvent );
          }
        }
      }
    }, 1000 * 60 * 1);

    // Reset counter on new game
    server.on('NEW_GAME', async (info) => {
      this.playerCounter = {};
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
