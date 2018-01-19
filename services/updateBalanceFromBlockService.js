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

  let mempool = await ipcExec('getrawmempool', [false]);
  let blocks = await Promise.mapSeries(_.map(new Array(6), (item, iter) => blockHeight - iter), height =>
    ipcExec('getblockbyheight', [height])
  );

  let items = await Promise.mapSeries(accounts, async account => {

    let filteredTxs3 = _.intersection(blocks[2].tx, account.lastTxs);
    let filteredTxs6 = _.intersection(blocks[5].tx, account.lastTxs);

    if (!filteredTxs3 && !filteredTxs6)
      return;

    let balances = await fetchBalanceService(account.address, filteredTxs6 ? 6 : 3);

    let changes = await Promise.mapSeries(_.union(filteredTxs3, filteredTxs6), async filteredLastTxId => {
      let tx = await ipcExec('getrawtransaction', [filteredLastTxId, true]);
      tx = await transformTx(tx);

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
        lastTxs: _.chain(blocks)
          .map(block => block.tx)
          .flatten()
          .thru(blockTxs => [
            _.intersection(account.lastTxs, mempool),
            _.intersection(account.lastTxs, blockTxs)
          ])
          .flattenDeep()
          .value()
      }, _.chain(changes)
        .sortBy('tx.confirmations')
        .last()
        .get('balances')
        .value())
    });

    return {data: changes, address: account.address};

  });

  return _.filter(items, item => _.get(item, 'data.length'));

};
