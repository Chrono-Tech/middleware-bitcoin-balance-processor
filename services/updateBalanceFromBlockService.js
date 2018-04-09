const Promise = require('bluebird'),
  accountModel = require('../models/accountModel'),
  utxoModel = require('../models/utxoModel'),
  txModel = require('../models/txModel'),
  _ = require('lodash');

module.exports = async (blockHeight) => {

  let txs = await txModel.find({blockNumber: blockHeight});
  
  let addresses = _.chain(txs)
    .map(tx => tx.outputs)
    .flattenDeep()
    .map(output => output.address)
    .flattenDeep()
    .uniq()
    .compact()
    .value();

  let accounts = await accountModel.find({address: {$in: addresses}});

  let items = await Promise.mapSeries(accounts, async account => {
    let result = await utxoModel.find({address: account.address});

    let balances = _.chain(result)
      .map(result => result.value)
      .flattenDeep()
      .sum()
      .value();

    let changes = await Promise.mapSeries(txs, async tx => {
      let newBalances = _.chain([
        {
          'balances.confirmations0': balances,
          include: tx.length
        },
        {'balances.confirmations3': balances, include: tx.length},
        {'balances.confirmations6': balances, include: tx.length}
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
        lastTxs: _.chain(txs)
          .map(tx => tx.hash)
          .flatten()
          .intersection(account.lastTxs)
          .flattenDeep()
          .value()
      }, _.chain(changes)
        .last()
        .get('balances')
        .value())
    });

    return {data: changes, address: account.address};

  });

  return _.filter(items, item => _.get(item, 'data.length'));

};