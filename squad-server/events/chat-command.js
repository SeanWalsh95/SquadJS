import { EventSource } from 'core/base-classes/event';
import ChatMessage from './ChatMessage';

/**
 * ChatCommand Event
 * @property {string} command - The command that was used EX. !admin
 * @property {string} params - The parameters sent to the command EX. !admin <parameters>
 */

export default class ChatCommand extends ChatMessage {
  constructor(server, time, data) {
    super(server, time, data);
    this.source = EventSource.RCON;

    this.command = data.commandMatch[1];
    this.params = data.commandMatch[2].trim();
  }
}
