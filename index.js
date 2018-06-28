/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const config = require('./config'),
  mongoose = require('mongoose'),
  Promise = require('bluebird'),
  getConfirmedBalanceToBlock = require('./utils/balance/getConfirmedBalanceToBlock'),
  getUnconfirmedBalance = require('./utils/balance/getConfirmedBalanceToBlock'),
  getAllUpdateBalance = require('./utils/balance/getAllUpdateBalance'),
  bunyan = require('bunyan'),
  _ = require('lodash'),
  models = require('./models'),
  log = bunyan.createLogger({name: 'core.balanceProcessor'}),
  amqp = require('amqplib');

const TX_QUEUE = `${config.rabbit.serviceName}_transaction`;

mongoose.Promise = Promise;
mongoose.connect(config.mongo.data.uri, {useMongoClient: true});
mongoose.accounts = mongoose.createConnection(config.mongo.accounts.uri, {useMongoClient: true});


/**
 * @module entry point
 * @description update balances for addresses, which were specified
 * in received transactions from blockParser via amqp
 */


let init = async () => {

  models.init();

  [mongoose.accounts, mongoose.connection].forEach(connection =>
    connection.on('disconnected', function () {
      throw new Error('mongo disconnected!');
    })
  );


  let conn = await amqp.connect(config.rabbit.url);
  let channel = await conn.createChannel();

  channel.on('close', () => {
    throw new Error('rabbitmq process has finished!');
  });


  await channel.assertExchange('events', 'topic', {durable: false});
  await channel.assertExchange('internal', 'topic', {durable: false});

  await channel.assertQueue(`${config.rabbit.serviceName}.balance_processor`);
  await channel.bindQueue(`${config.rabbit.serviceName}.balance_processor`, 'events', `${TX_QUEUE}.*`);
  await channel.bindQueue(`${config.rabbit.serviceName}.balance_processor`, 'events', `${config.rabbit.serviceName}_block`);
  await channel.bindQueue(`${config.rabbit.serviceName}.balance_processor`, 'internal', `${config.rabbit.serviceName}_user.created`);


  channel.prefetch(2);

  channel.consume(`${config.rabbit.serviceName}.balance_processor`, async data => {

    try {
      let payload = JSON.parse(data.content.toString());
      const addr = data.fields.routingKey.slice(TX_QUEUE.length + 1) || payload.address;

      let account = await models.accountModel.findOne({address: addr});

      if (!account)
        return channel.ack(data);

      let updates = {};

      if (payload.block)
        updates = await getConfirmedBalanceToBlock(payload.block);

      if (payload.hash)
        updates = [await getUnconfirmedBalance(addr, payload.hash ? payload : null)];

      if (!payload.block && !payload.hash)
        updates = [await getAllUpdateBalance(addr)];


      for (let update of _.compact(updates)) {

        const balances = _.transform(update.data, (result, item) => _.merge(result, item.balances), {});
        _.merge(account.balances, balances);
        account.markModified('balances');
        account.save();

        for (let item of update.data)
          await channel.publish('events', `${config.rabbit.serviceName}_balance.${item.address}`, new Buffer(JSON.stringify({
            address: update.address,
            balances: item.balances,
            tx: item.tx
          })));
        log.info(`balance updated for ${update.address}`);
      }
    } catch (err) {
      log.error(err);
      return channel.nack(data);
    }

    channel.ack(data);
  });

};

module.exports = init().catch(err => {
  log.error(err);
  process.exit(0);
});
