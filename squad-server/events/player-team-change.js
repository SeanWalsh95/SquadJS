import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * PlayerTeamChange Event
 * @typedef {BaseEvent}
 * @property {SquadPlayer} player - the player that switched teams
 * @property {string} oldTeamID - the id of the team the player switched from
 */

export class PlayerTeamChange extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.RCON;

    this.player = data.player;
    this.oldTeamID = data.oldTeamID;
  }
}
