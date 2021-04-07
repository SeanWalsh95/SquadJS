import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PlayerDamaged Event
 * @property {SquadPlayer} victim - The player that was damaged
 * @property {SquadPlayer} attacker - The player that attacked the damaged player
 */

export default class PlayerDamaged extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.LOG;

    this.victim = data.victim;
    this.attacker = data.attacker;
  }
}
