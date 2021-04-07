import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PlayerDisconnected Event
 * @typedef {BaseEvent}
 * @property {SquadPlayer} player - The player that disconnected
 */

export class PlayerDisconnected extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.LOG;

    this.player = data.player;
  }
}
