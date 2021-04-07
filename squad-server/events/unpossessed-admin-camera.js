import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * UnpossessedAdminCamera Event
 * @typedef {BaseEvent} UnpossessedAdminCamera
 * @property {SquadPlayer} player - The player that exited admincam
 */
export default class UnpossessedAdminCamera extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.RCON;

    this.player = data.player;
  }
}
