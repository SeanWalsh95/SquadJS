import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * @typedef {BaseEvent}
 * @property {SquadPlayer} player - The player that exited admincam
 */

export class UnpossessedAdminCamera extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.RCON;

    this.player = data.player;
  }
}
