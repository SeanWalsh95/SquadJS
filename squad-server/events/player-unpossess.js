import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PlayerUnpossess Event
 * @typedef {BaseEvent}
 * @property {string} chainID - TODO
 * @property {SquadPlayer} player - the player that possesed the item
 * @property {string} unpossessClassname - the classname of the item that was possesed
 */

export class PlayerUnpossess extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.LOG;

    this.chainID = data.chainID;
    this.player = data.player;
    this.unpossessClassname = data.switchPossess;
  }
}
