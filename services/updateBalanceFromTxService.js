const Promise = require('bluebird'),
  config = require('../config'),
  ipcExec = require('../utils/ipcExec'),
  fetchBalanceService = require('./fetchBalanceService'),
  accountModel = require('../models/accountModel'),
  transformTx = require('../utils/transformTx'),
  _ = require('lodash');

module.exports = async (address, blockHeight, txs) => {

  let account = await accountModel.findOne({address: address});

  if (!account)
    return;

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

  let balances = await fetchBalanceService(address, 0);

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
    address: address,
    lastBlockCheck: {$lte: balances.lastBlockCheck}
  }, {
    $set: _.merge({}, changedBalances, {
      lastBlockCheck: balances.lastBlockCheck,
      lastTxs: _.chain(tx)
        .thru(tx =>
          [tx.txid]
        )
        .union(_.get(account, 'lastTxs', []))
        .value()
    })
  }, {new: true});

  if(!savedAccount)
    return;

  return {
    data: [{
      balances: savedAccount.balances,
      tx: tx
    }],
    address: savedAccount.address
  };

};
