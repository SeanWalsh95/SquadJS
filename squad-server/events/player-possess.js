import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PlayerPossess Event
 * @typedef {BaseEvent}
 * @property {string} chainID - TODO
 * @property {SquadPlayer} player - the player that possesed the item
 * @property {string} possessClassname - the classname of the item that was possesed
 */

export default class PlayerPossess extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.LOG;

    this.chainID = data.chainID;
    this.player = data.player;
    this.possessClassname = data.possessClassname;
  }
}
