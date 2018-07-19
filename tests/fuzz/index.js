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


  it('generate coins', async () => {

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


  it('validate balance processor update balance ability', async () => {
    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    const address = keyring.getAddress().toString();

    let block = await models.blockModel.find({}).sort({number: -1}).limit(1);
    block = block[0].number;
    await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_fuzz.balance`);
    await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_fuzz.balance`, 'events', `${config.rabbit.serviceName}_balance.${address}`);

    await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_block`, new Buffer(JSON.stringify({block: block})));

    await new Promise((res) => {
      ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_fuzz.balance`, async data => {

        if (!data)
          return;

        const message = JSON.parse(data.content.toString());

        if (message.address === address) {
          await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_fuzz.balance`);
          res();
        }

      });
    });

    let account = await models.accountModel.findOne({address: address});

    ctx.balances = account.balances;
    expect(account.balances.confirmations0).to.be.above(0);
  });


  it('kill balance processor', async () => {
    ctx.balanceProcessorPid.kill();
  });

  it('generate again coins and send notifications', async () => {

    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    const address = keyring.getAddress().toString();

    let block = await models.blockModel.find({}).sort({number: -1}).limit(1);
    block = block[0].number;
    const nextBlock = block + 1;

    for (let blockNumber = nextBlock; blockNumber < nextBlock + 100; blockNumber++) {
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
      await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_block`, new Buffer(JSON.stringify({block: blockNumber})));
    }

  });




  it('restart balance processor', async () => {
    let keyring = new bcoin.keyring(ctx.keyPair, ctx.network);
    const address = keyring.getAddress().toString();

    ctx.balanceProcessorPid = spawn('node', ['index.js'], {env: process.env, stdio: 'ignore'});
    await Promise.delay(20000);
    let account = await models.accountModel.findOne({address: address});
    expect(_.isEqual(JSON.parse(JSON.stringify(ctx.balances)), JSON.parse(JSON.stringify(account.balances)))).to.equal(false);
  });




  after(async () => {
    ctx.balanceProcessorPid.kill();
  });


};
