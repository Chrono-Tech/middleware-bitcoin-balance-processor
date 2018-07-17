/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

require('dotenv/config');

const models = require('../../models'),
  config = require('../../config'),
  getFullTxFromCache = require('../utils/tx/getFullTxFromCache'),
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

    //ctx.balanceProcessorPid = spawn('node', ['node.js'], {env: process.env, stdio: 'ignore'});
    ctx.balanceProcessorPid = spawn('node', ['index.js'], {env: process.env, stdio: 'inherit'});

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
        tx = await getFullTxFromCache(tx._id);
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

  it('validate balance change on block arrive', async () => {
    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    const address = keyring.getAddress().toString();

    let block = await models.blockModel.find({}).sort({number: -1}).limit(1);

    block = block[0].number;
    let confirmations = 0;

    await Promise.all([
      (async () => {

        await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_block`, new Buffer(JSON.stringify({block: block})));
      })(),
      (async () => {
        await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
        await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features.balance`, 'events', `${config.rabbit.serviceName}_balance.${address}`);
        await new Promise((res, rej) =>
          ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features.balance`, async data => {

            if (!data)
              return;

            const message = JSON.parse(data.content.toString());

            if (message.tx.confirmations !== 3 && message.tx.confirmations !== 6)
              rej();

            if (confirmations > 1)
              res();

            confirmations++;

            await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
          }, {noAck: true})
        );

      })()
    ]);

  });

  it('generate unconfirmed coin for accountB', async () => {

    let keyring = new bcoin.keyring(ctx.keyPair2, ctx.network);
    const address = keyring.getAddress().toString();

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
        address: address
      };

      if (_.random(0, 10) > 5) {
        coin.inputBlock = 1000 - _.shuffle(10, 100);
        coin.inputTxIndex = i;
        coin.inputIndex = i;
      }

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
    let keyring = new bcoin.keyring(ctx.keyPair2, ctx.network);
    const address = keyring.getAddress().toString();

    let tx;

    await Promise.all([
      (async () => {
        const coin = await models.coinModel.findOne({outputBlock: -1, address: address});
        tx = await models.txModel.findOne({blockNumber: -1, index: coin.outputTxIndex});
        tx = await getFullTxFromCache(tx._id);
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
            expect(message.balances.confirmations0).to.equal(ctx.balance);
            expect(message.balances.confirmations3).to.equal(0);
            expect(message.balances.confirmations6).to.equal(0);

            await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
            res();
          }, {noAck: true})
        );

      })()
    ]);

  });


  it('validate balance change on block arrive', async () => {
    let keyring = new bcoin.keyring(ctx.keyPair2, ctx.network);
    const address = keyring.getAddress().toString();

    let block = await models.blockModel.find({}).sort({number: -1}).limit(1);

    block = block[0].number;

    const includeBlock = block + 1;

    for (let i = includeBlock; i < includeBlock + 3; i++) {
      await models.blockModel.create({
        _id: uniqid(),
        number: i,
        timestamp: Date.now(),
        bits: 1024,
        merkleRoot: uniqid()
      });

      block = i;

      if (i === includeBlock) {
        await models.txModel.update({blockNumber: -1}, {$set: {blockNumber: includeBlock}}, {multi: true});
        await models.coinModel.update({outputBlock: -1}, {$set: {outputBlock: includeBlock}}, {multi: true});
        await models.coinModel.update({inputBlock: -1}, {$set: {inputBlock: includeBlock}}, {multi: true});
      }
    }

    await Promise.all([
      (async () => {

        await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_block`, new Buffer(JSON.stringify({block: block})));
      })(),
      (async () => {
        await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
        await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features.balance`, 'events', `${config.rabbit.serviceName}_balance.${address}`);
        await new Promise((res, rej) =>
          ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features.balance`, async data => {

            if (!data)
              return;

            const message = JSON.parse(data.content.toString());

            if (message.tx.confirmations !== 3)
              return rej();

            expect(message.balances.confirmations0).to.equal(ctx.balance);
            expect(message.balances.confirmations3).to.equal(ctx.balance);
            expect(message.balances.confirmations6).to.equal(0);

            res();
            await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
          }, {noAck: true})
        );

      })()
    ]);

  });


};
