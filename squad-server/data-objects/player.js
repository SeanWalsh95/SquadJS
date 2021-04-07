/**
 * Player object representing an in game player
 * @property {string} id - playerId assigned from game server
 * @property {string} steamID - the players Steam64ID
 * @property {string} name - the players name from in game
 * @property {string} teamID - the teamID that the player is on
 * @property {string} squadID - the squadID of the squad the player is in
 */
export default class SquadPlayer {
  constructor(server, data) {
    this.server = server;

    this.id = data.playerID;
    this.steamID = data.steamID;
    this.name = data.name;

    this.teamID = data.teamID;
    this.squadID = data.squadID;
  }

  async kick(reason) {
    await this.server.rcon.kick(this.steamID, reason);
  }

  async warn(message) {
    await this.server.rcon.warn(this.steamID, message);
  }
}
