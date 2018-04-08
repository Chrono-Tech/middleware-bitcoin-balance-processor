/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const ipcExec = require('../utils/ipcExec'),
  accountModel = require('../models/accountModel'),
  utxoModel = require('../models/utxoModel'),
  txModel = require('../models/txModel'),
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

  let tx = await txModel.find({hash: lastTx});
  tx = _.chain(tx)
    .map(tx => tx.hash)
    .flattenDeep()
    .value();

  let balances = {};
 
  let result = await utxoModel.find({address: address});
    
  balances = _.chain(result)
    .map(result => result.value)
    .flattenDeep()
    .sum()
    .value();

  let savedAccount = await accountModel.findOneAndUpdate({
    address: address,
    lastBlockCheck: {$lte: currentHeight}
  }, {
    $set: {
      'balances.confirmations0': balances,
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
