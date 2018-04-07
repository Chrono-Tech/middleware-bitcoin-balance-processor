/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const ipcExec = require('../utils/ipcExec'),
  fetchBalanceService = require('./fetchBalanceService'),
  accountModel = require('../models/accountModel'),
  transformTx = require('../utils/transformTx'),
  countTxBalanceDiff = require('../utils/countTxBalanceDiff'),
  _ = require('lodash');

module.exports = async (address, blockHeight, txs) => {

  let account = await accountModel.findOne({address: address});
  if (!account)
    return;

  let currentHeight = await ipcExec('getblockcount', []);

  let lastTx = _.chain(txs)
    .reject(txHash =>
      _.chain(account)
        .get('lastTxs', [])
        .find({txid: txHash})
        .value()
    )
    .last()
    .value();

  let tx = await ipcExec('getrawtransaction', [lastTx, true]);
  tx = await transformTx(tx);

  let balances = {};
  if (account.lastBlockCheck === currentHeight) {
    let diff = countTxBalanceDiff([tx], address);
    balances.confirmations0 = _.get(account, 'balances.confirmations0', 0) + diff.positive - diff.negative;
  } else {
    let items = await fetchBalanceService(address);
    balances = items.balances;
  }

  let savedAccount = await accountModel.findOneAndUpdate({
    address: address,
    lastBlockCheck: {$lte: currentHeight}
  }, {
    $set: {
      'balances.confirmations0': balances.confirmations0,
      lastBlockCheck: currentHeight,
      lastTxs: _.chain(lastTx)
        .thru(txid => [txid])
        .union(_.get(account, 'lastTxs', []))
        .value()
    }
  }, {new: true});

  if (!savedAccount)
    return;

  return {
    data: [{
      balances: savedAccount.balances,
      tx: tx
    }],
    address: savedAccount.address
  };

};
