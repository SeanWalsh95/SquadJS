import BasePlugin from './base-plugin.js';

export default class VoteMapDidYouMean extends BasePlugin {
  static get description() {
    return (
      'The <code>mapvote-did-you-mean</code> plugin provides map voting functionality. This variant of map voting uses a "Did you ' +
      'mean?" algorithm to allow players to easily select one of a large pool of layers by typing it\'s name into ' +
      'the in-game chat.' +
      '\n\n' +
      'Player Commands:\n' +
      ' * <code>!mapvote help</code> - Show other commands players can use.\n' +
      ' * <code>!mapvote results</code> - Show the results of the current map vote.\n' +
      ' * <code>!mapvote <layer name></code> - Vote for the specified layer. Misspelling will be corrected where possible.\n' +
      '\n\n' +
      'Admin Commands (Admin Chat Only):\n' +
      ' * <code>!mapvote start</code> - Start a new map vote\n' +
      ' * <code>!mapvote restart</code> - Restarts the map vote.\n' +
      ' * <code>!mapvote end</code> - End the map vote and announce the winner.\n' +
      ' * <code>!mapvote destroy</code> - End the map vote without announcing the winner.\n'
    );
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      layerFilter: {
        required: false,
        description: 'The layers players can choose from.',
        default: 'layerFilter'
      },
      alwaysOn: {
        required: false,
        description: 'If true then the map voting system will always be live.',
        default: true
      },
      minPlayerCount: {
        required: false,
        description: 'The minimum number of players required for the vote to succeed.',
        default: null,
        example: 10
      },
      minVoteCount: {
        required: false,
        description: 'The minimum number of votes required for the vote to succeed.',
        default: null,
        example: 5
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
