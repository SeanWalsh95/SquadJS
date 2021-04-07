import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PossessedAdminCamera Event
 * @property {SquadPlayer} player - The player that entered admincam
 */

export default class PossessedAdminCamera extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.RCON;

    this.player = data.player;
  }
}
