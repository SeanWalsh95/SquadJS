import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PlayerConnected Event
 * @typedef {BaseEvent} PlayerConnected
 * @property {SquadPlayer} player - The player that connected
 */
export default class PlayerConnected extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.LOG;

    this.player = data.player;
  }
}
