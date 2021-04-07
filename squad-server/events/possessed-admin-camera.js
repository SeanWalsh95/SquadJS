import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * @typedef {BaseEvent}
 * @property {SquadPlayer} player - The player that entered admincam
 */

export class PossessedAdminCamera extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.RCON;

    this.player = data.player;
  }
}
