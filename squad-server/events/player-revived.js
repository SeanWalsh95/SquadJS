import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PlayerRevived Event
 * @typedef {BaseEvent}
 * @property {SquadPlayer} victim - The player that was incapacitated
 * @property {SquadPlayer} attacker - The attacking player incapacitated the victim player
 * @property {SquadPlayer} reviver - The player that revived the incapacitated player
 */

export default class PlayerRevived extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.LOG;

    this.victim = data.victim;
    this.attacker = data.attacker;
    this.reviver = data.reviver;
  }
}
