import BasePlugin from './base-plugin.js';

export default class VoteMap123 extends BasePlugin {
  static get description() {
    return (
      'The <code>mapvote-123</code> plugin provides map voting functionality. This variant of map voting allows admins to specify ' +
      'a small number of maps which are numbered and announced in admin broadcasts. Players can then vote for the map ' +
      'their choice by typing the corresponding map number into chat.' +
      '\n\n' +
      'Player Commands:\n' +
      ' * <code>!mapvote help</code> - Show other commands players can use.\n' +
      ' * <code>!mapvote results</code> - Show the results of the current map vote.\n' +
      ' * <code><layer number></code> - Vote for a layer using the layer number.\n' +
      '\n\n' +
      'Admin Commands (Admin Chat Only):\n' +
      ' * <code>!mapvote start <layer name 1>, <layer name 2>, ...</code> - Start a new map vote with the specified maps.\n' +
      ' * <code>!mapvote restart</code> - Restarts the map vote with the same layers.\n' +
      ' * <code>!mapvote end</code> - End the map vote and announce the winner.\n' +
      ' * <code>!mapvote destroy</code> - End the map vote without announcing the winner.\n'
    );
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      minVoteCount: {
        required: false,
        description: 'The minimum number of votes required for the vote to succeed.',
        default: null,
        example: 3
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onNewGame = this.onNewGame.bind(this);
    this.onChatMessage = this.onChatMessage.bind(this);
  }

  async mount() {
    this.server.on('NEW_GAME', this.onNewGame);
    this.server.on('CHAT_MESSAGE', this.onChatMessage);
  }

  async unmount() {
    this.server.removeEventListener('NEW_GAME', this.onNewGame);
    this.server.removeEventListener('CHAT_MESSAGE', this.onChatMessage);
  }

  async onNewGame() {}

  async onChatMessage(info) {}

  async startVote() {}

  async endVote() {}
}
