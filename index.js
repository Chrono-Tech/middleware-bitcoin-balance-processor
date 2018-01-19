const config = require('./config'),
  mongoose = require('mongoose'),
  fetchBalanceService = require('./services/fetchBalanceService'),
  updateBalanceFromBlockService = require('./services/updateBalanceFromBlockService'),
  updateBalanceFromTxService = require('./services/updateBalanceFromTxService'),
  accountModel = require('./models/accountModel'),
  bunyan = require('bunyan'),
  Promise = require('bluebird'),
  _ = require('lodash'),
  log = bunyan.createLogger({name: 'core.balanceProcessor'}),
  amqp = require('amqplib');

/**
 * @module entry point
 * @description update balances for addresses, which were specified
 * in received transactions from blockParser via amqp
 */

mongoose.Promise = Promise;
mongoose.connect(config.mongo.accounts.uri, {useMongoClient: true});

mongoose.connection.on('disconnected', function () {
  log.error('mongo disconnected!');
  process.exit(0);
});

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

  try {
    await channel.assertExchange('events', 'topic', {durable: false});
    await channel.assertQueue(`app_${config.rabbit.serviceName}.balance_processor`);
    await channel.bindQueue(`app_${config.rabbit.serviceName}.balance_processor`, 'events', `${config.rabbit.serviceName}_transaction.*`);
    await channel.bindQueue(`app_${config.rabbit.serviceName}.balance_processor`, 'events', `${config.rabbit.serviceName}_block`);
  } catch (e) {
    log.error(e);
    channel = await conn.createChannel();
  }

  /*
   try {
   await channel.assertQueue(`app_${config.rabbit.serviceName}.balance_processor.block`);
   await channel.bindQueue(`app_${config.rabbit.serviceName}.balance_processor.block`, 'events', `${config.rabbit.serviceName}_block`);
   } catch (e) {
   log.error(e);
   channel = await conn.createChannel();
   }
   */

  channel.prefetch(2);

  channel.consume(`app_${config.rabbit.serviceName}.balance_processor`, async data => {

    try {
      let payload = JSON.parse(data.content.toString());
      let updates = payload.txs ?
        [await updateBalanceFromTxService(payload.address, payload.block, payload.txs)] :
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
    } catch (e) {
      log.error(e);
    }
    channel.ack(data);

  });

};

module.exports = init();
