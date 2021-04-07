/**
 * EventSource is an Enum definination of the source of an event
 */
export const EventSource = Object.freeze({
  RCON: 'RCON',
  LOG: 'LOGS',
  UNKNOWN: 'UNKNOWN'
});

/**
 * BaseEvent serves as the core class to be inherited by all other events
 * @typedef {Object} BaseEvent
 * @property {Server} server - the server object
 * @property {Date} time - a Date object representing a timestamp
 * @property {EventSource} source - the origin of the event
 */
export default class BaseEvent {
  constructor(server, time) {
    this.server = server;
    this.time = time;
    this.source = EventSource.UNKNOWN;
  }
}
