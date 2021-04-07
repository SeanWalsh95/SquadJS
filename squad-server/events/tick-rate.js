import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * TickRate Event
 * @typedef {BaseEvent}
 * @property {string} chainID - TODO
 * @property {float} tickRate - Server Tickrate
 */

export default class TickRate extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.LOG;

    this.chainID = data.chainID;
    this.tickRate = data.tickRate;
  }
}
