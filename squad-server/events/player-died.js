import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PlayerDied Event
 * @typedef {BaseEvent} PlayerDied
 * @property {SquadPlayer} victim - The player that was killed
 * @property {SquadPlayer} attacker - The player that killed the dead player
 */
export default class PlayerDied extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.LOG;

    this.victim = data.victim;
    this.attacker = data.attacker;
  }
}
