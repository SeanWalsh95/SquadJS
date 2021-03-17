import BasePlugin from './base-plugin.js';

export default class VoteMapSkip extends BasePlugin {
  static get description() {
    return 'The <code>skipmap</code> plugin will allow players to vote via <code>+</code>/<code>-</code> if they wish to skip the current map';
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      command: {
        required: false,
        description: 'The name of the command to be used in chat.',
        default: '!skipmap'
      },
      voteDefinition: {
        required: false,
        description: 'Defines what counts as a vote',
        default: { '+': true, '-': false }
      },
      voteDuration: {
        required: false,
        description: 'How long the vote should go on for.',
        default: 5 * 60 * 1000
      },
      startTimer: {
        required: false,
        description: 'Time before voting is allowed.',
        default: 15 * 60 * 1000
      },
      endTimer: {
        required: false,
        description: 'Time before voting is no longer allowed.',
        default: 30 * 60 * 1000
      },
      pastVoteTimer: {
        required: false,
        description: 'Time that needs to have passed since the last vote.',
        default: 10 * 60 * 1000
      },
      minimumVotes: {
        required: false,
        description:
          'The minimum percentage of people required to vote for the vote to go through.',
        default: 20
      },
      reminderInterval: {
        required: false,
        description: 'The time between individual reminders.',
        default: 2 * 60 * 1000
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.voteActive = false;
    this.votes = {};
    this.intervalReminderBroadcasts = null;
    this.timeoutVote = null;
    this.timeLastVote = null;

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
    clearInterval(this.intervalReminderBroadcasts);
    clearTimeout(this.timeoutVote);
    this.voteActive = false;
    this.timeLastVote = null;
  }

  async onChatMessage(info) {
    // check for command
    if (!info.message.startsWith(this.options.command)) return;

    if (!this.voteActive) {
      await this.startVote(info);
      return;
    }

    let messageHasVote = false;

    // count vote
    for (const [voteDef, voteValue] of Object.entries(this.options.voteDefinition)) {
      if (info.message.includes(voteDef)) {
        messageHasVote = true;
        this.votes[info.steamID] = voteValue;
        this.server.rcon.warn(
          info.steamID,
          `Your vote ${voteValue ? 'in favour' : 'against'} has been saved.`
        );
      }
    }

    // message not recognised as a vote
    if (!messageHasVote) {
      this.server.rcon.warn(
        info.steamID,
        `Invalid. Vote with ${Object.keys(this.options.voteDefinition)}`
      );
      return;
    }

    // If half current server pop voted in favour, instantly win the vote
    if (this.server.players.length / 2 < this.getPosVotes()) {
      this.endVote(true);
    }
  }

  getPosVotes() {
    return Object.values(this.votes).filter((voteToSkip) => voteToSkip).length;
  }

  getNegVotes() {
    return Object.values(this.votes).filter((voteToSkip) => !voteToSkip).length;
  }

  async startVote(info) {
    // check if enough time has passed since start of round and if not, inform the player
    if (
      this.server.layerHistory.length > 0 &&
      this.server.layerHistory[0].time > Date.now() - this.options.startTimer
    ) {
      const seconds = Math.floor(
        (this.server.layerHistory[0].time + this.options.startTimer - Date.now()) / 1000
      );
      const minutes = Math.floor(seconds / 60);

      await this.server.rcon.warn(
        info.steamID,
        `Not enough time has passed since the start of the match. Please try again in ${
          minutes ? `${minutes}min` : ''
        } ${seconds ? `${seconds - minutes * 60}s` : ''}`
      );
      return;
    }

    // check if enough time remains in the round, if not, inform player
    if (
      this.server.layerHistory.length > 0 &&
      this.server.layerHistory[0].time < Date.now() - this.options.endTimer
    ) {
      await this.server.rcon.warn(info.steamID, 'Match has progressed too far.');
      return;
    }

    // check if enough time has passed since the last vote
    if (this.timeLastVote && this.timeLastVote > Date.now() - this.options.pastVoteTimer) {
      await this.server.rcon.warn(info.steamID, 'Not enough time has passed since the last vote.');
      return;
    }

    this.verbose(1, `Starting new vote...`);

    await this.server.rcon.warn(info.steamID, 'You have started a skip map vote.');
    await this.server.rcon.broadcast(
      'A vote to skip the current map has been started. Please vote in favour of skipping the map with + or against with -.'
    );

    // Actual vote
    this.voteActive = true;
    this.votes = {};

    this.votes[info.steamID] = true;
    this.timeLastVote = new Date(); // As a vote happened, stop any further votes from happening until enough time has passed

    // Set reminders
    this.intervalReminderBroadcasts = setInterval(async () => {
      await this.server.rcon.broadcast(
        'A vote to skip the current map is in progress. Please vote in favour of skipping the map with + or against with -.'
      );
      await this.server.rcon.broadcast(
        `Currently ${this.getPosVotes()} people voted in favour and ${this.getNegVotes()} against skipping the current map.`
      );
    }, this.options.reminderInterval);

    this.timeoutVote = setTimeout(() => {
      this.endVote();
    }, this.options.voteDuration);
  }

  clearVote() {
    this.votes = {};
    this.voteActive = false;
    clearInterval(this.intervalReminderBroadcasts);
    clearTimeout(this.timeoutVote);
  }

  async endVote(votePassed = false) {
    const posVotes = this.getPosVotes();
    const negVotes = this.getNegVotes();

    this.verbose(1, `Finished vote +:${posVotes} -:${negVotes}`);
    if (posVotes > negVotes || votePassed) {
      this.server.rcon.broadcast(
        `The vote to skip the current map has passed. ${posVotes} voted in favour, ${negVotes} against.`
      );
      await this.server.rcon.execute('AdminEndMatch');
      this.clearVote();
    } else {
      this.server.rcon.broadcast(
        `Not enough people voted in favour of skipping the match. ${posVotes} voted in favour, ${negVotes} against.`
      );
    }
  }
}
