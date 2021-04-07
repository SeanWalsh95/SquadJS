import Logger from 'core/logger';

export default class BasePlugin {
  constructor(server, options, connectors) {
    this.server = server;
    this.options = {};
    this.rawOptions = options;

    for (const [optionName, option] of Object.entries(this.constructor.optionsSpecification)) {
      if (option.connector) {
        this.options[optionName] = connectors[this.rawOptions[optionName]];
      } else {
        if (option.required) {
          if (!(optionName in this.rawOptions))
            throw new Error(`${this.constructor.name}: ${optionName} is required but missing.`);
          if (option.default === this.rawOptions[optionName])
            throw new Error(
              `${this.constructor.name}: ${optionName} is required but is the default value.`
            );
        }

        this.options[optionName] =
          typeof this.rawOptions[optionName] !== 'undefined'
            ? this.rawOptions[optionName]
            : option.default;
      }
    }
  }

  async prepareToMount() {}

  async mount() {}

  async unmount() {}

  static get description() {
    throw new Error('Plugin missing "static get description()" method.');
  }

  static get defaultEnabled() {
    throw new Error('Plugin missing "static get defaultEnabled()" method.');
  }

  static get optionsSpecification() {
    throw new Error('Plugin missing "static get optionSpecification()" method.');
  }

  verbose(...args) {
    Logger.verbose(this.constructor.name, ...args);
  }

  // event functions
  async onChatMessage(event) {}

  async onChatCommand(command, event) {}

  async onAdminCameraPossesed(event) {}

  async onAdminCameraUnpossesed(event) {}

  async onPlayerWarned(event) {}

  async onPlayerKicked(event) {}

  async onPlayerBanned(event) {}

  async onPlayerConnected(event) {}

  async onPlayerDisconnected(event) {}

  async onPlayerDamaged(event) {}

  async onPlayerWounded(event) {}

  async onPlayerDied(event) {}

  async onPlayerRevived(event) {}

  async onPlayerPosses(event) {}

  async onPlayerUnposses(event) {}

  async onPlayerTeamChanged(event) {}

  async onPlayerSquadChanged(event) {}

  async onPlayerListUpdated() {}

  async onLayereventrmationUpdated() {}

  async onA2SUpdated() {}

  async onAdminBroadcast(event) {}

  async onNewGame(event) {}

  async onDeployabeDamaged(event) {}

  async onTickRate(event) {}
}
