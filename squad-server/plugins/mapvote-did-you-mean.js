import MapVote from '../utils/mapvote.js';
import BasePlugin from './base-plugin.js';

import { COPYRIGHT_MESSAGE } from '../utils/constants.js';

export default class MapVoteDidYouMean extends BasePlugin {
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

    this.mapvote = null;
    this.manuallyCreated = false;

    this.onNewGame = this.onNewGame.bind(this);
    this.onChatMessage = this.onChatMessage.bind(this);
  }

  async mount() {
    if (this.options.alwaysOn) this.startVote(false);

    this.server.on('NEW_GAME', this.onNewGame);
    this.server.on('CHAT_MESSAGE', this.onChatMessage);
  }

  async unmount() {
    this.server.removeEventListener('NEW_GAME', this.onNewGame);
    this.server.removeEventListener('CHAT_MESSAGE', this.onChatMessage);
  }

  async onNewGame() {
    if (this.options.alwaysOn) {
      this.startVote(false);
    } else {
      this.mapvote = null;
    }
  }

  async onChatMessage(info) {
    const match = info.message.match(/^!mapvote ?(.*)/);
    if (!match) return;
    const mapVoteCommnad = match[1];

    if (mapVoteCommnad === 'help') {
      await this.server.rcon.warn(
        info.steamID,
        'You may use any of the following commands in chat:'
      );
      await this.server.rcon.warn(info.steamID, '!mapvote results - View the current vote counts.');
      await this.server.rcon.warn(
        info.steamID,
        '!mapvote <layer name> - Vote for the specified layer.'
      );
      await this.server.rcon.warn(
        info.steamID,
        'When inputting a layer name, we autocorrect any miss spelling.'
      );

      if (this.options.minVoteCount !== null)
        await this.server.rcon.warn(
          info.steamID,
          `${this.options.minVoteCount} votes need to be made for a winner to be selected.`
        );

      return;
    }

    if (mapVoteCommnad === 'start') {
      if (info.chat !== 'ChatAdmin') return;

      if (this.mapvote) {
        await this.server.rcon.warn(info.steamID, 'A mapvote has already begun.');
      } else {
        await this.startVote();
      }
      return;
    }

    if (!this.mapvote) {
      await this.server.rcon.warn(info.steamID, 'A map vote has not begun.');
      return;
    }

    if (mapVoteCommnad === 'restart') {
      if (info.chat !== 'ChatAdmin') return;
      await this.startVote();
      return;
    }

    if (mapVoteCommnad === 'end') {
      if (info.chat !== 'ChatAdmin') return;

      const results = this.mapvote.getResults(true);

      if (results.length === 0)
        await this.server.rcon.broadcast(`No layer gained enough votes to win.`);
      else
        await this.server.rcon.broadcast(
          `${this.mapvote.getResults()[0].layer.layer} won the mapvote!`
        );

      this.mapvote = null;
      return;
    }

    if (mapVoteCommnad === 'destroy') {
      if (info.chat !== 'ChatAdmin') return;
      this.mapvote = null;
      return;
    }

    if (mapVoteCommnad === 'results') {
      const results = this.mapvote.getResults();

      if (results.length === 0) {
        await this.server.rcon.warn(info.steamID, 'No one has voted yet.');
      } else {
        await this.server.rcon.warn(info.steamID, 'The current vote counts are as follows:');
        for (const result of results) {
          await this.server.rcon.warn(
            info.steamID,
            `${result.layer.layer} - ${result.votes} vote${result.votes > 1 ? 's' : ''}`
          );
        }
        return;
      }
    }

    if (!this.manuallyCreated && this.server.players.length < this.options.minPlayerCount) {
      await this.server.rcon.warn(info.steamID, 'Not enough players online to vote.');
      return;
    }

    try {
      const layerName = await this.mapvote.makeVoteByDidYouMean(info.steamID, match[1]);
      await this.server.rcon.warn(info.steamID, `You voted for ${layerName}.`);
    } catch (err) {
      await this.server.rcon.warn(info.steamID, err.message);
    }
    await this.server.rcon.warn(info.steamID, COPYRIGHT_MESSAGE);
  }

  async startVote(manuallyCreatedOption = true) {
    this.mapvote = new MapVote(this.server, this.options.layerFilter, {
      minVoteCount: this.options.minVoteCount
    });

    this.manuallyCreated = manuallyCreatedOption;

    this.mapvote.on('NEW_WINNER', async (results) => {
      await this.server.rcon.broadcast(
        `New Map Vote Winner: ${results[0].layer.layer}. Participate in the map vote by typing "!mapvote help" in chat.`
      );
    });

    if (this.manuallyCreated)
      await this.server.rcon.broadcast(
        `A new map vote has started. Participate in the map vote by typing "!mapvote help" in chat.`
      );
  }
}
