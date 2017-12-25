const config = require('./config'),
  mongoose = require('mongoose'),
  fetchBalanceService = require('./services/fetchBalanceService'),
  fetchTXService = require('./services/fetchTXService'),
  transformTx = require('./utils/transformTx'),
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
    await channel.assertQueue(`app_${config.rabbit.serviceName}.balance_processor.tx`);
    await channel.bindQueue(`app_${config.rabbit.serviceName}.balance_processor.tx`, 'events', `${config.rabbit.serviceName}_transaction.*`);
  } catch (e) {
    log.error(e);
    channel = await conn.createChannel();
  }

  try {
    await channel.assertQueue(`app_${config.rabbit.serviceName}.balance_processor.block`);
    await channel.bindQueue(`app_${config.rabbit.serviceName}.balance_processor.block`, 'events', `${config.rabbit.serviceName}_block`);
  } catch (e) {
    log.error(e);
    channel = await conn.createChannel();
  }

  channel.prefetch(2);

  channel.consume(`app_${config.rabbit.serviceName}.balance_processor.block`, async data => {
    try {
      let payload = JSON.parse(data.content.toString());
      let accounts = await accountModel.find({
        $where: 'obj.lastTxs.length > 0',
        lastBlockCheck: {$lt: payload.block}
      });

      for (let account of accounts) {
        let balances = await fetchBalanceService(account.address);

        let txs = await Promise.mapSeries(account.lastTxs, tx =>
          fetchTXService(tx.txid)
            .catch(() => null)
        );

        let filteredTxs = _.chain(txs)
          .compact()
          .filter(tx => tx.confirmations === 3 || tx.confirmations === 6)
          .value();

        for (let filteredLastTx of filteredTxs) {
          try {
            let txHash = filteredLastTx.txid;
            let tx = await fetchTXService(txHash);
            tx = await transformTx(tx);

            let changedBalances = _.chain([
              {'balances.confirmations0': balances.balances.confirmations0, min: 0},
              {'balances.confirmations3': balances.balances.confirmations3, min: 3},
              {'balances.confirmations6': balances.balances.confirmations6, min: 6}
            ])
              .transform((result, item) => {
                if (tx.confirmations >= item.min)
                  Object.assign(result, item);
              }, {})
              .omit('min')
              .value();

            let savedAccount = await accountModel.findOneAndUpdate({address: account.address}, {
              $set: changedBalances
            }, {new: true});

            channel.publish('events', `${config.rabbit.serviceName}_balance.${account.address}`, new Buffer(JSON.stringify({
              address: account.address,
              balances: {
                confirmations0: _.get(savedAccount, 'balances.confirmations0', changedBalances['balances.confirmations0']),
                confirmations3: _.get(savedAccount, 'balances.confirmations3', changedBalances['balances.confirmations3']),
                confirmations6: _.get(savedAccount, 'balances.confirmations6', changedBalances['balances.confirmations6']),
              },
              tx: tx
            })));
          } catch (e) {
            log.error(e);
          }
        }

        await accountModel.update({address: account.address}, {
          $set: {
            lastBlockCheck: payload.block,
            lastTxs: _.filter(account.lastTxs, item => payload.block - item.blockHeight <= 6)
          }
        });
      }

    } catch (e) {
      log.error(e);
    }

    channel.ack(data);
  });

  channel.consume(`app_${config.rabbit.serviceName}.balance_processor.tx`, async (data) => {
    try {
      let payload = JSON.parse(data.content.toString());
      let balances = await fetchBalanceService(payload.address);
      let account = await accountModel.findOne({address: payload.address});

      let newTxHashes = _.chain(payload)
        .get('txs')
        .reject(txHash =>
          _.chain(account)
            .get('lastTxs', [])
            .find({txid: txHash})
            .value()
        )
        .value();

      for (let txHash of newTxHashes) {
        try {
          let tx = await fetchTXService(txHash);
          tx = await transformTx(tx);
          let changedBalances = _.chain([
            {'balances.confirmations0': balances.balances.confirmations0, min: 0},
            {'balances.confirmations3': balances.balances.confirmations3, min: 3},
            {'balances.confirmations6': balances.balances.confirmations6, min: 6}
          ])
            .transform((result, item) => {
              if (tx.confirmations >= item.min)
                Object.assign(result, item);
            }, {})
            .omit('min')
            .value();

          let savedAccount = await accountModel.findOneAndUpdate({
            address: payload.address,
            lastBlockCheck: {$lte: balances.lastBlockCheck}
          }, {
            $set: _.merge({}, changedBalances, {
              lastBlockCheck: balances.lastBlockCheck,
              lastTxs: _.chain(tx)
                .thru(tx =>
                  [({txid: tx.txid, blockHeight: tx.block === -1 ? balances.lastBlockCheck : tx.block})]
                )
                .union(_.get(account, 'lastTxs', []))
                .uniqBy('txid')
                .value()
            })
          }, {new: true});

          channel.publish('events', `${config.rabbit.serviceName}_balance.${payload.address}`, new Buffer(JSON.stringify({
            address: payload.address,
            balances: {
              confirmations0: _.get(savedAccount, 'balances.confirmations0', changedBalances['balances.confirmations0']),
              confirmations3: _.get(savedAccount, 'balances.confirmations3', changedBalances['balances.confirmations3']),
              confirmations6: _.get(savedAccount, 'balances.confirmations6', changedBalances['balances.confirmations6'])
            },
            tx: tx
          })));
        } catch (e) {
          log.error(e);
        }
      }

      log.info(`balance updated for ${payload.address}`);
    } catch (e) {
      log.error(e);
    }
    channel.ack(data);
  });

};

module.exports = init();
