/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const config = require('./config'),
  mongoose = require('mongoose'),
  Promise = require('bluebird');

mongoose.Promise = Promise;
mongoose.connect(config.mongo.data.uri, {useMongoClient: true});
mongoose.accounts = mongoose.createConnection(config.mongo.accounts.uri, {useMongoClient: true});
  
const  updateBalanceFromBlockService = require('./services/updateBalanceFromBlockService'),
  updateBalanceFromTxService = require('./services/updateBalanceFromTxService'),
  bunyan = require('bunyan'),
  _ = require('lodash'),
  UserCreatedService = require('./services/UserCreatedService'),
  log = bunyan.createLogger({name: 'core.balanceProcessor'}),
  amqp = require('amqplib');

/**
 * @module entry point
 * @description update balances for addresses, which were specified
 * in received transactions from blockParser via amqp
 */
[mongoose.accounts, mongoose.connection].forEach(connection =>
  connection.on('disconnected', function () {
    log.error('mongo disconnected!');
    process.exit(0);
  })
);

let init = async () => {
  let conn = await amqp.connect(config.rabbit.url)
    .catch(() => {
      log.error('rabbitmq is not available!');
      process.exit(0);
    });
  let channel = await conn.createChannel();

  channel.on('close', () => {
    log.error('rabbitmq process has finished!');
    process.exit(0);
  });


  const userCreatedService = new UserCreatedService(channel, config.rabbit.serviceName);
  await userCreatedService.start();

  try {
    await channel.assertExchange('events', 'topic', {durable: false});
    await channel.assertQueue(`app_${config.rabbit.serviceName}.balance_processor`);
    await channel.bindQueue(`app_${config.rabbit.serviceName}.balance_processor`, 'events', `${config.rabbit.serviceName}_transaction.*`);
    await channel.bindQueue(`app_${config.rabbit.serviceName}.balance_processor`, 'events', `${config.rabbit.serviceName}_block`);
  } catch (e) {
    log.error(e);
    channel = await conn.createChannel();
  }

  channel.prefetch(2);
  channel.consume(`app_${config.rabbit.serviceName}.balance_processor`, async data => {

    try {
      let payload = JSON.parse(data.content.toString());

      let updates = payload.txs ?
        await updateBalanceFromTxService(payload.address, payload.txs) :
        await updateBalanceFromBlockService(payload.block);

      for (let update of _.compact(updates)) {
        for (let item of update.data) {
          await channel.publish('events', `${config.rabbit.serviceName}_balance.${payload.address}`, new Buffer(JSON.stringify({
            address: update.address,
            balances: item.balances,
            tx: item.tx
          })));
        }
        log.info(`balance updated for ${update.address}`);
      }
      channel.ack(data);
    } catch (err) {

      if (err instanceof Promise.TimeoutError) {
        log.error('Timeout processing the request. Restarting in 5 seconds...');
        await Promise.delay(5000);
        return process.exit(0);
      }

      if (err && err.code === 'ENOENT') {
        log.error('Node is not available. Restarting in 5 seconds...');
        await Promise.delay(5000);
        return process.exit(0);
      }

      channel.ack(data);
      log.error(err);
    }

  });

};

module.exports = init();
