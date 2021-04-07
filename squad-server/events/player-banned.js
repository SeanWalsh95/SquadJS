import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PlayerBanned Event
 * @typedef {BaseEvent}
 * @property {SquadPlayer} player - The player that was banned
 * @property {string} interval - the ammount of time the player was banned for
 */

export class PlayerBanned extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.RCON;

    this.player = data.player;
    this.interval = data.interval;
  }
}
