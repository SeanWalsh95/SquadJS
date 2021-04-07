import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * NewGame Event
 * @typedef {BaseEvent}
 *
 * TODO: Finish this Event
 *
 */

export default class NewGame extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.LOG;
  }
}
