import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PlayerWarned Event
 * @typedef {BaseEvent}
 * @property {SquadPlayer} player - the player that was warned
 * @property {string} message - the message that was sent to the player as a warning
 */

export default class PlayerWarned extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.RCON;

    this.player = data.player;
    this.message = data.reason;
  }
}
