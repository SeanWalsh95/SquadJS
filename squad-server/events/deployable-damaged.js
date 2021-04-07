import BaseEvent, { EventSource } from 'core/base-classes/event';

/**
 * DeployableDamaged Event
 * @property {string} chainID - TODO: Document this
 * @property {string} deployable - deployable that was damaged
 * @property {string} weapon - Weapon used to dam
 * @property {float} damage - ammount of damage done to deployable
 * @property {string} damageType - Type of damage
 * @property {string} healthRemaining - Remaining health of deployable
 * @property {string} player - the player that did the damage to the deployable
 */

export default class DeployableDamaged extends BaseEvent {
  constructor(server, time, data) {
    super(server, time);
    this.source = EventSource.LOG;

    this.chainID = data.chainID;
    this.deployable = data.deployable;
    this.weapon = data.weapon;
    this.damage = data.damage;
    this.damageType = data.damageType;
    this.healthRemaining = data.healthRemaining;
    this.player = data.player;
  }
}
