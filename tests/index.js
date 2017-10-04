require('dotenv/config');

const config = require('../config'),
  Network = require('bcoin/lib/protocol/network'),
  bcoin = require('bcoin'),
  expect = require('chai').expect,
  accountModel = require('../models/accountModel'),
  ipcExec = require('./helpers/ipcExec'),
  _ = require('lodash'),
  Promise = require('bluebird'),
  Coin = require('bcoin/lib/primitives/coin'),
  ctx = {
    network: null,
    accounts: []
  },
  mongoose = require('mongoose');

mongoose.Promise = Promise;

describe('core/balanceProcessor', function () {

  before(async () => {

    ctx.network = Network.get('regtest');

    let keyPair = bcoin.hd.generate(ctx.network);
    let keyPair2 = bcoin.hd.generate(ctx.network);
    let keyPair3 = bcoin.hd.generate(ctx.network);
    let keyPair4 = bcoin.hd.generate(ctx.network);

    ctx.accounts.push(keyPair, keyPair2, keyPair3, keyPair4);

    mongoose.connect(config.mongo.uri, {useMongoClient: true});
  });

  after(() => {
    return mongoose.disconnect();
  });

  it('remove registered addresses from mongodb', async () => {

    let keyring = new bcoin.keyring(ctx.accounts[0].privateKey, ctx.network);
    let keyring2 = new bcoin.keyring(ctx.accounts[1].privateKey, ctx.network);
    let keyring3 = new bcoin.keyring(ctx.accounts[2].privateKey, ctx.network);
    let keyring4 = new bcoin.keyring(ctx.accounts[3].privateKey, ctx.network);

    return await accountModel.remove({
      address: {
        $in: [keyring.getAddress().toString(),
          keyring2.getAddress().toString(),
          keyring3.getAddress().toString(),
          keyring4.getAddress().toString()]
      }
    })
  });

  it('register addresses', async () => {
    for (let account of ctx.accounts) {
      let keyring = new bcoin.keyring(account.privateKey, ctx.network);
      await new accountModel({address: keyring.getAddress().toString()})
        .save().catch(() => {
        });
    }
  });

  it('generate some coins for accountA', async () => {
    let keyring = new bcoin.keyring(ctx.accounts[0].privateKey, ctx.network);
    return await ipcExec('generatetoaddress', [10, keyring.getAddress().toString()])
  });

  it('generate some coins for accountB', async () => {
    let keyring = new bcoin.keyring(ctx.accounts[1].privateKey, ctx.network);
    return await ipcExec('generatetoaddress', [100, keyring.getAddress().toString()])
  });

  it('validate balance for account in mongodb', async () => {
    await Promise.delay(10000);
    let keyring = new bcoin.keyring(ctx.accounts[0].privateKey, ctx.network);
    let account = await accountModel.findOne({address: keyring.getAddress().toString()});
    ctx.amountA = account.balances.confirmations0;
    expect(account.balances.confirmations0).to.be.gt(0);
  });

  it('send coins to accountB and accountC', async () => {

    let keyring = new bcoin.keyring(ctx.accounts[0].privateKey, ctx.network);
    let keyring2 = new bcoin.keyring(ctx.accounts[1].privateKey, ctx.network);
    let keyring3 = new bcoin.keyring(ctx.accounts[2].privateKey, ctx.network);
    let coins = await ipcExec('getcoinsbyaddress', [keyring.getAddress().toString()]);

    let inputCoins = _.chain(coins)
      .transform((result, coin) => {
        result.coins.push(Coin.fromJSON(coin));
        result.amount += coin.value;
      }, {amount: 0, coins: []})
      .value();

    const mtx = new bcoin.mtx();

    mtx.addOutput({
      address: keyring2.getAddress(),
      value: Math.round(inputCoins.amount * 0.2)
    });

    mtx.addOutput({
      address: keyring3.getAddress(),
      value: Math.round(inputCoins.amount * 0.5)
    });

    await mtx.fund(inputCoins.coins, {
      rate: 10000,
      changeAddress: keyring.getAddress()
    });

    mtx.sign(keyring);

    const tx = mtx.toTX();
    return await ipcExec('sendrawtransaction', [tx.toRaw().toString('hex')]);
  });

  it('generate some coins for accountB', async () => {
    let keyring = new bcoin.keyring(ctx.accounts[1].privateKey, ctx.network);
    return await ipcExec('generatetoaddress', [10, keyring.getAddress().toString()])
  });

  it('validate balance for all accounts in mongodb', async () => {
    await Promise.delay(10000);
    let keyring = new bcoin.keyring(ctx.accounts[0].privateKey, ctx.network);
    let account = await accountModel.findOne({address: keyring.getAddress().toString()});
    expect(account.balances.confirmations0).to.be.lt(ctx.amountA);
  });

});
