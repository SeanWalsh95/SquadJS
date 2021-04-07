import { EventSource } from 'core/base-classes/event';
import ChatMessage from './ChatMessage';

/**
 * ChatCommand Event
 * @typedef {ChatMessage} in
 * @property {string} command - The command that was used EX. !admin
 * @property {string} params - The parameters sent to the command EX. !admin <parameters>
 */

export class ChatCommand extends ChatMessage {
  constructor(server, time, data) {
    super(server, time, data);
    this.source = EventSource.RCON;

    if (this.isCommand) {
      this.command = this.isCommand[1];
      this.params = this.isCommand[2].trim();
    }
  }
}
