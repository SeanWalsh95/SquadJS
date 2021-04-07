import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PlayerKicked Event
 * @property {SquadPlayer} player - The player that sent the message
 * @property {string} reason - the message that was sent to the player as a reason for being kicked
 */

export default class PlayerKicked extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.RCON;

    this.player = data.player;
    this.reason = data.reason;
  }
}
