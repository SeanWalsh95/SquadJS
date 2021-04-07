import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PlayerSquadChange Event
 * @typedef {BaseEvent}
 * @property {SquadPlayer} player - the player that switched squads
 * @property {(string|null)} oldTeamID - the id of the squad the player switched from, null if they were not in a squad
 */

export class PlayerSquadChange extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.RCON;

    this.player = data.player;
    this.oldSquadID = data.oldSquadID;
  }
}
