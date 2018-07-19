/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const models = require('../../models'),
  config = require('../../config'),
  bcoin = require('bcoin'),
  _ = require('lodash'),
  uniqid = require('uniqid'),
  getUnconfirmedBalance = require('../../utils/balance/getUnconfirmedBalance'),
  getBalanceToBlock = require('../../utils/balance/getBalanceToBlock'),
  memwatch = require('memwatch-next'),
  expect = require('chai').expect,
  Promise = require('bluebird'),
  spawn = require('child_process').spawn;

module.exports = (ctx) => {

  before(async () => {
    await models.blockModel.remove({});
    await models.txModel.remove({});
    await models.coinModel.remove({});
    await models.accountModel.remove({});


    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    const address = keyring.getAddress().toString();

    await models.accountModel.create({
      address: address,
      balances: {
        confirmations0: 0,
        confirmations3: 0,
        confirmations6: 0
      },
      isActive: true
    });

    await ctx.amqp.channel.deleteQueue(`${config.rabbit.serviceName}.balance_processor`);
    ctx.balanceProcessorPid = spawn('node', ['index.js'], {env: process.env, stdio: 'ignore'});
    await Promise.delay(10000);
  });


  it('generate 100.000 unspent coins', async () => {

    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    const address = keyring.getAddress().toString();


    for (let blockNumber = 0; blockNumber < 100; blockNumber++) {
      await models.blockModel.create({
        _id: uniqid(),
        number: blockNumber,
        timestamp: Date.now(),
        bits: 1024,
        merkleRoot: uniqid()
      });

      let coins = [];
      let txs = [];

      for (let i = 0; i < 1000; i++) {

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

        coins.push(coin);
        txs.push(tx)
      }


      let bulkOpsCoins = coins.map(coin => ({
        updateOne: {
          filter: {_id: coin._id},
          update: {$set: coin},
          upsert: true
        }
      }));

      let bulkOpsTxs = txs.map(tx => ({
        updateOne: {
          filter: {_id: tx._id},
          update: tx,
          upsert: true
        }
      }));

      await models.coinModel.bulkWrite(bulkOpsCoins);
      await models.txModel.bulkWrite(bulkOpsTxs);

    }

  });


  it('validate unconfirmed balance calculate performance and leaks', async () => {
    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    const address = keyring.getAddress().toString();
    let coinAmount = await models.coinModel.count();

    let start = Date.now();
    let hd = new memwatch.HeapDiff();
    await getUnconfirmedBalance(address);

    let diff = hd.end();

    let leakObjects = _.filter(diff.change.details, detail => detail.size_bytes / 1024 / 1024 > 3);

    expect(leakObjects.length).to.be.eq(0);
    expect(Date.now() - start).to.be.below(coinAmount);
  });


  it('validate confirmed balance calculate performance and leaks', async () => {
    let block = await models.blockModel.find({}).sort({number: -1}).limit(1);
    let blockNumber = block[0].number;
    let coinAmount = await models.coinModel.count();

    let start = Date.now();
    let hd = new memwatch.HeapDiff();
    await getBalanceToBlock(blockNumber);

    let diff = hd.end();

    let leakObjects = _.filter(diff.change.details, detail => detail.size_bytes / 1024 / 1024 > 3);
    ctx.balanceCalcTime = Date.now() - start;

    expect(leakObjects.length).to.be.eq(0);
    expect(ctx.balanceCalcTime).to.be.below(coinAmount);
  });


  it('validate balance processor notification speed', async () => {
    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    const address = keyring.getAddress().toString();

    let block = await models.blockModel.find({}).sort({number: -1}).limit(1);
    block = block[0].number;
    await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_performance.balance`);
    await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_performance.balance`, 'events', `${config.rabbit.serviceName}_balance.${address}`);

    const start = Date.now();
    await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_block`, new Buffer(JSON.stringify({block: block})));

    await new Promise((res) => {
      ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_performance.balance`, res, {noAck: true});
    });

    await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_performance.balance`);
    expect(Date.now() - start).to.be.below(500 + ctx.balanceCalcTime);
  });



  after(async () => {
    delete ctx.balanceCalcTime;
    ctx.balanceProcessorPid.kill();
  });


};
