/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

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

  let blocks = await Promise.mapSeries(_.map(new Array(6), (item, iter) => blockHeight - iter), height =>
    ipcExec('getblockbyheight', [height])
  );

  let items = await Promise.mapSeries(accounts, async account => {

    let filteredTxs3 = _.intersection(blocks[2].tx, account.lastTxs) || [];
    let filteredTxs6 = _.intersection(blocks[5].tx, account.lastTxs) || [];

    filteredTxs3 = await Promise.mapSeries(filteredTxs3, async txid => {
      let tx = await ipcExec('getrawtransaction', [txid, true]);
      return await transformTx(tx);
    });

    filteredTxs6 = await Promise.mapSeries(filteredTxs6, async txid => {
      let tx = await ipcExec('getrawtransaction', [txid, true]);
      return await transformTx(tx);
    });

    let balances = await fetchBalanceService(account.address, filteredTxs6.length ? filteredTxs6 : filteredTxs3);

    let changes = await Promise.mapSeries(_.union(filteredTxs3, filteredTxs6), async tx => {
      let newBalances = _.chain([
        {
          'balances.confirmations0': balances.balances.confirmations0,
          include: filteredTxs6.length || filteredTxs3.length
        },
        {'balances.confirmations3': balances.balances.confirmations3, include: filteredTxs3.length},
        {'balances.confirmations6': balances.balances.confirmations6, include: filteredTxs6.length}
      ])
        .transform((result, item) => {
          if (item.include)
            Object.assign(result, item);
        }, {})
        .omit('include')
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
          .intersection(account.lastTxs)
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
