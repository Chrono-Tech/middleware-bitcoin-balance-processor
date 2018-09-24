/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const config = require('./config'),
  mongoose = require('mongoose'),
  Promise = require('bluebird'),
  networks = require('middleware-common-components/factories/btcNetworks'),
  network = networks[config.node.network],
  AmqpService = require('middleware_common_infrastructure/AmqpService'),
  InfrastructureInfo = require('middleware_common_infrastructure/InfrastructureInfo'),
  InfrastructureService = require('middleware_common_infrastructure/InfrastructureService'),
  getBalanceToBlock = require('./utils/balance/getBalanceToBlock'),
  getUnconfirmedBalance = require('./utils/balance/getUnconfirmedBalance'),
  bunyan = require('bunyan'),
  _ = require('lodash'),
  models = require('./models'),
  log = bunyan.createLogger({name: 'core.balanceProcessor', level: config.logs.level}),
  amqp = require('amqplib');

const TX_QUEUE = `${config.rabbit.serviceName}_transaction`;

mongoose.Promise = Promise;
mongoose.connect(config.mongo.data.uri, {useMongoClient: true});
mongoose.accounts = mongoose.createConnection(config.mongo.accounts.uri, {useMongoClient: true});


/**
 * @module entry point
 * @description update balances for registered addresses
 */

const runSystem = async function () {
  const rabbit = new AmqpService(
    config.systemRabbit.url, 
    config.systemRabbit.exchange,
    config.systemRabbit.serviceName
  );
  const info = new InfrastructureInfo(require('./package.json'));
  const system = new InfrastructureService(info, rabbit, {checkInterval: 10000});
  await system.start();
  system.on(system.REQUIREMENT_ERROR, (requirement, version) => {
    log.error(`Not found requirement with name ${requirement.name} version=${requirement.version}.` +
        ` Last version of this middleware=${version}`);
    process.exit(1);
  });
  await system.checkRequirements();
  system.periodicallyCheck();
};

let init = async () => {
  if (config.checkSystem)
    await runSystem();

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

      let updates = [];

      if (payload.block)
        updates = await getBalanceToBlock(payload.block);

      if ((!payload.block && !payload.hash) || payload.hash) {
        const addresses = _.chain(network.getAllAddressForms(addr))
          .values()
          .compact()
          .value();

        const account = await models.accountModel.findOne({address: {$in: addresses}});
        if (!account)
          return channel.ack(data);

        updates = [await getUnconfirmedBalance(account.address, payload.hash ? payload : null)];
      }


      for (let update of _.compact(updates)) {

        let account = await models.accountModel.findOne({address: update.address});
        const balances = _.transform(update.data, (result, item) => _.merge(result, item.balances), {});
        _.merge(account.balances, balances);
        account.markModified('balances');
        account.save();

        if (update.data.length)
          for (let item of update.data)
            await channel.publish('events', `${config.rabbit.serviceName}_balance.${update.address}`, new Buffer(JSON.stringify({
              address: update.address,
              balances: account.balances,
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
