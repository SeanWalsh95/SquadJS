import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PlayerWounded Event
 * @typedef {BaseEvent}
 * @property {SquadPlayer} victim - The player that was incapacitated
 * @property {SquadPlayer} attacker - The attacking player incapacitated the victim player
 */

export class PlayerWounded extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.LOG;

    this.victim = data.victim;
    this.attacker = data.attacker;
  }
}
