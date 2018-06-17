/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */

const updateAllBalances = require('./updateAllBalances'),
  blockModel = require('../models/blockModel');

const EXCHANGE_NAME = 'internal';

/**
 * @class UserCreatedService
 *
 * Class, that listen events from rest about user.created
 * and update balance for this user in database
 *
 *
 */
class UserCreatedService {

  /**
   *
   * Constructor, that only create main variables in class
   * not done anything work
   *
   * @param {AmqpClient} _channel [from amqplib] _channel Channel, through send and response messages
   * @param {String} rabbitPrefix config.rabbit.serviceName | 'app_eth'
   *
   * @memberOf MasterNode
   */
  constructor (channel, rabbitPrefix) {
    this.rabbitPrefix = rabbitPrefix;
    this.channel = channel;
  }

  /**
   *
   * Async start function
   * in this function process subscribe on main events in rabbitmq, connected to elections
   * and through MASTER_UPDATE_TIMEOUT run periodic checkMasterProcess
   *
   * @memberOf MasterNode
   */
  async start () {
    await this.channel.assertExchange(EXCHANGE_NAME, 'topic', {durable: false});
    await this.channel.assertQueue(`${this.rabbitPrefix}_balance_user.created`);
    await this.channel.bindQueue(`${this.rabbitPrefix}_balance_user.created`, EXCHANGE_NAME, 
      `${this.rabbitPrefix}_user.created`);

    this.channel.consume(`${this.rabbitPrefix}_balance_user.created`, async (message) => {
      const accData = JSON.parse(message.content);
      if (accData['address']) {
        const block = await blockModel.findOne().sort({number: -1}).select('number');
        if (block.number)
          await updateAllBalances(block.number, accData['address']);
      }
      this.channel.ack(message);
    });
  }

}

module.exports = UserCreatedService;
