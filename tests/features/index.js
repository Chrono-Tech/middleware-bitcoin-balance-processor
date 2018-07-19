/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

require('dotenv/config');

const models = require('../../models'),
  config = require('../../config'),
  getFullTxFromCache = require('../../utils/tx/getFullTxFromCache'),
  bcoin = require('bcoin'),
  _ = require('lodash'),
  uniqid = require('uniqid'),
  spawn = require('child_process').spawn,
  expect = require('chai').expect,
  Promise = require('bluebird');

module.exports = (ctx) => {

  before(async () => {
    await models.blockModel.remove({});
    await models.txModel.remove({});
    await models.coinModel.remove({});
    await models.accountModel.remove({});

    await ctx.amqp.channel.deleteQueue(`${config.rabbit.serviceName}.balance_processor`);
    ctx.balanceProcessorPid = spawn('node', ['index.js'], {env: process.env, stdio: 'ignore'});

    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    let keyring2 = new bcoin.keyring(ctx.keyPair2, ctx.network);

    const address = keyring.getAddress().toString();
    const address2 = keyring2.getAddress().toString();

    await models.accountModel.create({
      address: address,
      balances: {
        confirmations0: 0,
        confirmations3: 0,
        confirmations6: 0
      },
      isActive: true
    });
    await models.accountModel.create({
      address: address2,
      balances: {
        confirmations0: 0,
        confirmations3: 0,
        confirmations6: 0
      },
      isActive: true
    });

  });

  it('generate coins', async () => {

    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    const address = keyring.getAddress().toString();


    for (let blockNumber = 0; blockNumber < 1000; blockNumber++) {
      await models.blockModel.create({
        _id: uniqid(),
        number: blockNumber,
        timestamp: Date.now(),
        bits: 1024,
        merkleRoot: uniqid()
      });

      for (let i = 0; i < 10; i++) {

        let tx = {
          _id: uniqid(),
          blockNumber: blockNumber,
          index: i,
          timestamp: Date.now()
        };

        let coin = {
          _id: uniqid(),
          outputBlock: blockNumber,
          outputTxIndex: i,
          outputIndex: i,
          value: _.random(1000, 4000),
          address: address
        };

        if (_.random(0, 10) > 5) {
          coin.inputBlock = blockNumber - 1;
          coin.inputTxIndex = i;
          coin.inputIndex = i;
        }

        await models.coinModel.create(coin);
        await models.txModel.create(tx);
      }
    }

  });

  it('validate balance change on unconfirmed tx', async () => {
    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    const address = keyring.getAddress().toString();

    let tx;

    await Promise.all([
      (async () => {

        tx = await models.txModel.findOne({});
        tx = await getFullTxFromCache(tx.blockNumber, tx.index);
        await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_transaction.${address}`, new Buffer(JSON.stringify(tx)));
      })(),
      (async () => {
        await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
        await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features.balance`, 'events', `${config.rabbit.serviceName}_balance.${address}`);
        await new Promise(res =>
          ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features.balance`, async data => {

            if (!data)
              return;

            const message = JSON.parse(data.content.toString());

            expect(_.isEqual(JSON.parse(JSON.stringify(tx)), message.tx)).to.equal(true);
            await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
            res();
          }, {noAck: true})
        );

      })()
    ]);

  });

  it('generate unconfirmed coin for accountB', async () => {

    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    let keyring2 = new bcoin.keyring(ctx.keyPair2, ctx.network);

    const address = keyring.getAddress().toString();
    const address2 = keyring2.getAddress().toString();

    ctx.coins = [];
    ctx.txs = [];

    for (let i = 0; i < 10; i++) {

      let tx = {
        _id: uniqid(),
        blockNumber: -1,
        index: i,
        timestamp: Date.now()
      };

      ctx.txs.push(tx);

      let coin = {
        _id: uniqid(),
        outputBlock: -1,
        outputTxIndex: i,
        outputIndex: i,
        value: _.random(1000, 4000),
        address: address2
      };

      await models.coinModel.update({
        address: address,
        outputBlock: {$lt: _.random(10, 100)},
        outputTxIndex: coin.outputTxIndex
      }, {
        $set: {
          inputBlock: -1,
          inputTxIndex: coin.outputTxIndex
        }
      });

      ctx.coins.push(coin);

      await models.coinModel.create(coin);
      await models.txModel.create(tx);
    }

    ctx.balance = _.chain(ctx.coins)
      .reject(coin => _.has(coin, 'inputBlock'))
      .map(coin => coin.value)
      .sum()
      .value();

  });

  it('validate balance change on unconfirmed tx', async () => {
    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    let keyring2 = new bcoin.keyring(ctx.keyPair2, ctx.network);

    const address = keyring.getAddress().toString();
    const address2 = keyring2.getAddress().toString();

    await Promise.all([
      (async () => {
        const coin = await models.coinModel.findOne({outputBlock: -1, address: address2});
        ctx.tx = await models.txModel.findOne({blockNumber: -1, index: coin.outputTxIndex});
        ctx.tx = await getFullTxFromCache(ctx.tx.blockNumber, ctx.tx.index);
        await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_transaction.${address}`, new Buffer(JSON.stringify(ctx.tx)));
        await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_transaction.${address2}`, new Buffer(JSON.stringify(ctx.tx)));
      })(),
      (async () => {
        await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
        await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features.balance`, 'events', `${config.rabbit.serviceName}_balance.${address2}`);
        await new Promise(res =>
          ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features.balance`, async data => {

            if (!data)
              return;

            const message = JSON.parse(data.content.toString());

            expect(_.isEqual(JSON.parse(JSON.stringify(ctx.tx)), message.tx)).to.equal(true);
            expect(message.balances.confirmations0).to.equal(ctx.balance);
            expect(message.balances.confirmations3).to.equal(0);
            expect(message.balances.confirmations6).to.equal(0);

            await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
            res();
          }, {noAck: true})
        );

      })(),
      (async () => {
        await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features2.balance`);
        await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features2.balance`, 'events', `${config.rabbit.serviceName}_balance.${address}`);
        await new Promise(res =>
          ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features2.balance`, async data => {

            if (!data)
              return;

            const message = JSON.parse(data.content.toString());

            expect(_.isEqual(JSON.parse(JSON.stringify(ctx.tx)), message.tx)).to.equal(true);
            await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features2.balance`);
            res();
          }, {noAck: true})
        );

      })()
    ]);

  });


  it('validate balance change after 3 blocks (3 confirmations)', async () => {
    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    let keyring2 = new bcoin.keyring(ctx.keyPair2, ctx.network);

    const address = keyring.getAddress().toString();
    const address2 = keyring2.getAddress().toString();

    let block = await models.blockModel.find({}).sort({number: -1}).limit(1);
    block = block[0].number;
    const includeBlock = block + 1;

    await Promise.all([
      (async () => {

        for (let currentBlock = includeBlock; currentBlock < includeBlock + 3; currentBlock++) {
          await models.blockModel.create({
            _id: uniqid(),
            number: currentBlock,
            timestamp: Date.now(),
            bits: 1024,
            merkleRoot: uniqid()
          });

          if (currentBlock === includeBlock) {
            await models.txModel.update({blockNumber: -1}, {$set: {blockNumber: includeBlock}}, {multi: true});
            await models.coinModel.update({outputBlock: -1}, {$set: {outputBlock: includeBlock}}, {multi: true});
            await models.coinModel.update({inputBlock: -1}, {$set: {inputBlock: includeBlock}}, {multi: true});

            ctx.tx.blockNumber = includeBlock;
            ctx.tx.confirmations++;
            await models.txModel.update({_id: ctx.tx.hash}, {$set: {blockNumber: includeBlock}});

            await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_transaction.${address}`, new Buffer(JSON.stringify(ctx.tx)));
            await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_transaction.${address2}`, new Buffer(JSON.stringify(ctx.tx)));
          }

          await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_block`, new Buffer(JSON.stringify({block: currentBlock})));
          await Promise.delay(5000);
        }
      })(),
      (async () => {
        await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
        let confirmed = 0;
        await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features.balance`, 'events', `${config.rabbit.serviceName}_balance.${address2}`);
        await new Promise((res, rej) =>
          ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features.balance`, async data => {

            if (!data)
              return;

            const message = JSON.parse(data.content.toString());

            if (![1, 3].includes(message.tx.confirmations))
              return rej();

            if (message.tx.hash !== ctx.tx.hash)
              return;

            expect(message.balances.confirmations0).to.equal(ctx.balance);
            expect(message.balances.confirmations3).to.equal(message.tx.confirmations === 1 ? 0 : ctx.balance);
            expect(message.balances.confirmations6).to.equal(0);

            confirmed++;

            if (confirmed === 2) {
              await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
              res();
            }
          }, {noAck: true})
        );

      })(),
      (async () => {
        await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features2.balance`);
        await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features2.balance`, 'events', `${config.rabbit.serviceName}_balance.${address}`);
        let confirmed = 0;
        await new Promise((res, rej) =>
          ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features2.balance`, async data => {

            if (!data)
              return;

            const message = JSON.parse(data.content.toString());

            if (![1, 3, 6].includes(message.tx.confirmations))
              return rej();

            if (message.tx.hash !== ctx.tx.hash)
              return;

            confirmed++;

            if (confirmed === 2) {
              await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features2.balance`);
              res();
            }
          }, {noAck: true})
        );

      })()
    ]);

  });

  it('validate balance change after 6 blocks (6 confirmations)', async () => {
    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    let keyring2 = new bcoin.keyring(ctx.keyPair2, ctx.network);

    const address = keyring.getAddress().toString();
    const address2 = keyring2.getAddress().toString();

    let block = await models.blockModel.find({}).sort({number: -1}).limit(1);
    block = block[0].number;
    const includeBlock = block + 1;

    await Promise.all([
      (async () => {

        for (let currentBlock = includeBlock; currentBlock < includeBlock + 3; currentBlock++) {
          await models.blockModel.create({
            _id: uniqid(),
            number: currentBlock,
            timestamp: Date.now(),
            bits: 1024,
            merkleRoot: uniqid()
          });

          if (currentBlock === includeBlock) {
            await models.txModel.update({blockNumber: -1}, {$set: {blockNumber: includeBlock}}, {multi: true});
            await models.coinModel.update({outputBlock: -1}, {$set: {outputBlock: includeBlock}}, {multi: true});
            await models.coinModel.update({inputBlock: -1}, {$set: {inputBlock: includeBlock}}, {multi: true});
          }
          await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_block`, new Buffer(JSON.stringify({block: currentBlock})));
          await Promise.delay(5000);
        }
      })(),
      (async () => {
        await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
        await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features.balance`, 'events', `${config.rabbit.serviceName}_balance.${address2}`);
        await new Promise((res, rej) =>
          ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features.balance`, async data => {

            if (!data)
              return;

            const message = JSON.parse(data.content.toString());

            if (message.tx.confirmations !== 6)
              return rej();

            if (message.tx.hash !== ctx.tx.hash)
              return;

            expect(message.balances.confirmations0).to.equal(ctx.balance);
            expect(message.balances.confirmations3).to.equal(ctx.balance);
            expect(message.balances.confirmations6).to.equal(ctx.balance);

            await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
            res();
          }, {noAck: true})
        );

      })(),
      (async () => {
        await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features2.balance`);
        await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features2.balance`, 'events', `${config.rabbit.serviceName}_balance.${address}`);
        await new Promise((res, rej) =>
          ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features2.balance`, async data => {

            if (!data)
              return;

            const message = JSON.parse(data.content.toString());

            if (message.tx.confirmations !== 3 && message.tx.confirmations !== 6)
              return rej();

            if (message.tx.hash !== ctx.tx.hash)
              return;

            await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features2.balance`);
            res();
          }, {noAck: true})
        );

      })()
    ]);
  });

  it('validate balance on user registration', async () => {
    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    const address = keyring.getAddress().toString();

    await models.accountModel.update({address: address}, {
      $set: {
        balances: {
          confirmations0: 0,
          confirmations3: 0,
          confirmations6: 0
        }
      }
    });

    await Promise.all([
      (async () => {
        await ctx.amqp.channel.publish('internal', `${config.rabbit.serviceName}_user.created`, new Buffer(JSON.stringify({address: address})));
      })(),
      (async () => {
        await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
        await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features.balance`, 'events', `${config.rabbit.serviceName}_balance.${address}`);
        await new Promise(res =>
          ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features.balance`, async data => {

            if (!data)
              return;

            const message = JSON.parse(data.content.toString());

            expect(message.balances.confirmations0).to.be.above(0);
            expect(message.balances.confirmations0).to.equal(message.balances.confirmations3);
            expect(message.balances.confirmations6).to.be.above(0);

            await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
            res();
          }, {noAck: true})
        );

      })()
    ]);

  });



  after(() => {
    delete ctx.balance;
    delete ctx.tx;
    delete ctx.coins;
  })

};
