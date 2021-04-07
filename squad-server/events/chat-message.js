import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * ChatMessage Event
 * @typedef {BaseEvent} ChatMessage
 * @property {boolean} isCommand - Boolean that is true when the message matches a command ex. !admin
 * @property {string} chatChannel - The channel the message was sent in
 * @property {SquadPlayer} player - The player that sent the message
 * @property {string} message - The contents of the message sent by the player
 */
export default class ChatMessage extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.RCON;

    this.chatChannel = data.chat;
    this.player = data.player;
    this.message = data.message;
  }
}
