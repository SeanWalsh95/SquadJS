/**
 * EventSource is an Enum definination of the source of an event
 */
export const EventSource = Object.freeze({
  RCON: 'RCON',
  LOG: 'LOGS'
});

/**
 * BaseEvent serves as the core class to be inherited by all other events
 * @property {Server} server - the server object
 * @property {Date} time - a Date object representing a timestamp
 * @property {EventSource} source - the origin of the evnet
 */
export default class BaseEvent {
  constructor(server, time) {
    this.server = server;
    this.time = time;
  }
}
