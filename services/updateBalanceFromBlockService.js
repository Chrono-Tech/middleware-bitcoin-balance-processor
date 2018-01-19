const Promise = require('bluebird'),
  ipcExec = require('../utils/ipcExec'),
  fetchBalanceService = require('./fetchBalanceService'),
  accountModel = require('../models/accountModel'),
  transformTx = require('../utils/transformTx'),
  _ = require('lodash');

module.exports = async (blockHeight) => {

  let accounts = await accountModel.find({
    $where: 'obj.lastTxs.length > 0',
    lastBlockCheck: {$lt: blockHeight}
  });

  let items = await Promise.mapSeries(accounts, async account => {

    let txs = await Promise.map(account.lastTxs, tx =>
      ipcExec('getrawtransaction', [tx, true])
        .catch(() => null)
    );

    let filteredTxs = _.chain(txs)
      .compact()
      .filter(tx => tx.confirmations === 3 || tx.confirmations === 6)
      .value();

    if(!filteredTxs)
      return;

    let highestConfirmation = _.chain(filteredTxs)
      .sortBy('tx.confirmations')
      .last()
      .value();


    let balances = await fetchBalanceService(account.address, highestConfirmation);

    let changes = await Promise.mapSeries(filteredTxs, async filteredLastTx => {
      let tx = await transformTx(filteredLastTx);

      let newBalances = _.chain([
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

      return {
        balances: newBalances,
        tx: tx
      };
    });

    await accountModel.update({address: account.address}, {
      $set: _.merge({
        lastBlockCheck: blockHeight,
        lastTxs: _.chain(txs)
          .transform((result, tx) => {
            if (tx && tx.confirmations <= 6) {
              result.push(tx.txid);
            }
          }, [])
          .value()
      }, _.chain(changes)
        .sortBy('tx.confirmations')
        .last()
        .get('balances')
        .value())
    });

    return {data: changes, address: account.address};

  });


  return _.filter(items, item=> _.get(item, 'data.length'));

};
