/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const models = require('../../models'),
  keyring = require('bcoin/lib/primitives/keyring'),
  _ = require('lodash'),
  uniqid = require('uniqid'),
  getBalance = require('../../utils/balance/getBalance'),
  getUnconfirmedBalance = require('../../utils/balance/getUnconfirmedBalance'),
  getBalanceToBlock = require('../../utils/balance/getBalanceToBlock'),
  expect = require('chai').expect;

module.exports = (ctx) => {

  before(async () => {
    await models.blockModel.remove({});
    await models.txModel.remove({});
    await models.coinModel.remove({});
    await models.accountModel.remove({});


    let key = new keyring(ctx.keyPair);
    const address = key.getAddress('base58', ctx.network);

    await models.accountModel.create({
      address: address,
      balances: {
        confirmations0: 0,
        confirmations3: 0,
        confirmations6: 0
      },
      isActive: true
    });
  });


  it('generate 100 coins', async () => {

    let key = new keyring(ctx.keyPair);
    const address = key.getAddress('base58', ctx.network);


    for (let blockNumber = 0; blockNumber < 10; blockNumber++) {
      await models.blockModel.create({
        _id: uniqid(),
        number: blockNumber,
        timestamp: Date.now(),
        bits: 1024,
        merkleRoot: uniqid()
      });

      let coins = [];
      let txs = [];

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

  it('validate getBalance function', async () => {
    let key = new keyring(ctx.keyPair);
    const address = key.getAddress('base58', ctx.network);

    const block = await models.blockModel.findOne().sort({number: -1}).select('number');
    const blockNumber = block.number;

    let coins = await models.coinModel.find({inputBlock: null});

    const coinBalance0 = _.chain(coins)
      .map(coin => parseInt(coin.value))
      .sum()
      .value();

    const coinBalance3 = _.chain(coins)
      .filter(coin => coin.outputBlock <= blockNumber - 3)
      .map(coin => parseInt(coin.value))
      .sum()
      .value();

    const coinBalance6 = _.chain(coins)
      .filter(coin => coin.outputBlock <= blockNumber - 6)
      .map(coin => parseInt(coin.value))
      .sum()
      .value();

    const balances0 = await getBalance(address);
    const balances3 = await getBalance(address, blockNumber - 3);
    const balances6 = await getBalance(address, blockNumber - 6);

    expect(coinBalance0).to.eq(balances0);
    expect(coinBalance3).to.eq(balances3);
    expect(coinBalance6).to.eq(balances6);

  });

  it('validate getUnconfirmedBalance function', async () => {
    let key = new keyring(ctx.keyPair);
    const address = key.getAddress('base58', ctx.network);

    const block = await models.blockModel.findOne().sort({number: -1}).select('number');
    const blockNumber = block.number;

    const balances0 = await getBalance(address);
    const balances3 = await getBalance(address, blockNumber - 3);
    const balances6 = await getBalance(address, blockNumber - 6);

    const item = await getUnconfirmedBalance(address, null);

    expect(item.address).to.eq(address);
    expect(item.data[0].tx).to.eq(null);
    expect(item.data[0].balances.confirmations0).to.eq(balances0);
    expect(item.data[0].balances.confirmations3).to.eq(balances3);
    expect(item.data[0].balances.confirmations6).to.eq(balances6);

  });


  it('validate getBalanceToBlock function', async () => {
    let key = new keyring(ctx.keyPair, ctx.network);
    const address = key.getAddress('base58', ctx.network);

    const block = await models.blockModel.findOne().sort({number: -1}).select('number');
    const blockNumber = block.number;
    let coins = await models.coinModel.find({inputBlock: null});

    let txs = await models.txModel.find({
      $or: coins.map(coin => ({blockNumber: coin.outputBlock, index: coin.outputTxIndex}))
    });

    const balances0 = await getBalance(address);
    const balances3 = await getBalance(address, blockNumber - 2);
    const balances6 = await getBalance(address, blockNumber - 5);

    const records = await getBalanceToBlock(blockNumber);
    let record = records[0];

    expect(record.address).to.eq(address);

    for (let item of record.data) {
      let tx = _.find(txs, {_id: item.hash});
      expect(tx).to.not.eq(null);
      expect(item.balances.confirmations0).to.eq(balances0);
      expect(item.balances.confirmations3).to.eq(balances3);
      expect(item.balances.confirmations6).to.eq(balances6);
    }
  });


};
