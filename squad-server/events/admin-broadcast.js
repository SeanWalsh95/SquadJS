import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * AdminBroadcast Event
 * @typedef {BaseEvent}
 * @property {string} chainID - TODO: Document this
 * @property {string} message - Message sent via adminbroadcast
 * @property {(SquadPlayer|String)} from - either Player object if from game or "RCON" if via RCON
 */

export default class AdminBroadcast extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.LOG;

    this.chainID = data.chainID;
    this.message = data.message;
    this.from = data.from;
  }
}
