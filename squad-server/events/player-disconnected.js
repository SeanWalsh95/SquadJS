import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PlayerDisconnected Event
 * @property {SquadPlayer} player - The player that disconnected
 */

export default class PlayerDisconnected extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.LOG;

    this.player = data.player;
  }
}
