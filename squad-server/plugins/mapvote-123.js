import MapVote from '../utils/mapvote.js';
import BasePlugin from './base-plugin.js';

import { COPYRIGHT_MESSAGE } from '../utils/constants.js';
import { LayerFilter } from '../utils/squad-layer-filter.js';

export default class MapVote123 extends BasePlugin {
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

    this.mapvote = null;

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

  async onNewGame() {
    this.mapvote = null;
  }

  async onChatMessage(info) {
    const voteMatch = info.message.match(/^(?:!vote\s+)?([0-9])/);
    if (voteMatch) {
      if (!this.mapvote) return;
      try {
        const layerName = await this.mapvote.makeVoteByNumber(info.steamID, parseInt(voteMatch[1]));
        await this.server.rcon.warn(info.steamID, `You voted for ${layerName}.`);
      } catch (err) {
        await this.server.rcon.warn(info.steamID, err.message);
      }
      await this.server.rcon.warn(info.steamID, COPYRIGHT_MESSAGE);
    }

    const commandMatch = info.message.match(/^!mapvote ?(.*)/);
    if (commandMatch) {
      if (commandMatch[1].startsWith('start')) {
        if (info.chat !== 'ChatAdmin') return;

        if (this.mapvote) {
          await this.server.rcon.warn(info.steamID, 'A mapvote has already begun.');
        } else {
          this.mapvote = new MapVote(
            this.server,
            LayerFilter.buildFromDidYouMeanList(commandMatch[1].replace('start ', '').split(', ')),
            { minVoteCount: this.options.minVoteCount }
          );

          this.mapvote.on('NEW_WINNER', async (results) => {
            await this.server.rcon.broadcast(
              `New Map Vote Winner: ${results[0].layer.layer}. Participate in the map vote by typing "!mapvote help" in chat.`
            );
          });

          await this.server.rcon.broadcast(
            `A new map vote has started. Participate in the map vote by typing "!mapvote help" in chat. Map options to follow...`
          );
          await this.server.rcon.broadcast(
            this.mapvote.squadLayerFilter
              .getLayerNames()
              .map((layerName, key) => `${key + 1} - ${layerName}`)
              .join(', ')
          );
        }
        return;
      }

      if (!this.mapvote) {
        await this.server.rcon.warn(info.steamID, 'A map vote has not begun.');
        return;
      }

      if (commandMatch[1] === 'restart') {
        if (info.chat !== 'ChatAdmin') return;

        this.mapvote = new MapVote(this.server, this.mapvote.squadLayerFilter, {
          minVoteCount: this.options.minVoteCount
        });

        this.mapvote.on('NEW_WINNER', async (results) => {
          await this.server.rcon.broadcast(
            `New Map Vote Winner: ${results[0].layer}. Participate in the map vote by typing "!mapvote help" in chat.`
          );
        });

        await this.server.rcon.broadcast(
          `A new map vote has started. Participate in the map vote by typing "!mapvote help" in chat. Map options to follow...`
        );
        await this.server.rcon.broadcast(
          this.mapvote.squadLayerFilter
            .getLayerNames()
            .map((layerName, key) => `${key + 1} - ${layerName}`)
            .join(', ')
        );
        return;
      }

      if (commandMatch[1] === 'end') {
        if (info.chat !== 'ChatAdmin') return;

        const results = this.mapvote.getResults();

        if (results.length === 0)
          await this.server.rcon.broadcast(`No layer gained enough votes to win.`);
        else
          await this.server.rcon.broadcast(
            `${this.mapvote.getResults()[0].layer.layer} won the mapvote!`
          );

        this.mapvote = null;
        return;
      }

      if (commandMatch[1] === 'destroy') {
        if (info.chat !== 'ChatAdmin') return;
        this.mapvote = null;
        return;
      }

      if (commandMatch[1] === 'help') {
        await this.server.rcon.warn(info.steamID, 'To vote type the layer number into chat:');
        for (const layer of this.mapvote.squadLayerFilter.getLayers()) {
          await this.server.rcon.warn(info.steamID, `${layer.layerNumber} - ${layer.layer}`);
        }

        if (this.options.minVoteCount !== null)
          await this.server.rcon.warn(
            info.steamID,
            `${this.options.minVoteCount} votes need to be made for a winner to be selected.`
          );

        await this.server.rcon.warn(
          info.steamID,
          'To see current results type into chat: !mapvote results'
        );
      }

      if (commandMatch[1] === 'results') {
        const results = this.mapvote.getResults();

        if (results.length === 0) {
          await this.server.rcon.warn(info.steamID, 'No one has voted yet.');
        } else {
          await this.server.rcon.warn(info.steamID, 'The current vote counts are as follows:');
          for (const result of results) {
            await this.server.rcon.warn(
              info.steamID,
              `${result.layer.layerNumber} - ${result.layer.layer} (${result.votes} vote${
                result.votes > 1 ? 's' : ''
              })`
            );
          }
        }
      }
    }
  }
}
