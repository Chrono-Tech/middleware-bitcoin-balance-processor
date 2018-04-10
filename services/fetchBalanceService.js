/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const ipcExec = require('../utils/ipcExec'),
  transformTx = require('../utils/transformTx'),
  Promise = require('bluebird'),
  _ = require('lodash');

let countPositive = (txs, address) => {
  return _.chain(txs)
    .map(tx => tx.outputs)
    .flattenDeep()
    .filter(output => output.address === address)
    .map(output => output.value)
    .sum()
    .value();
};

let countNegative = (txs, address) => {
  return _.chain(txs)
    .map(tx => tx.inputs)
    .flattenDeep()
    .filter(input => _.get(input, 'coin.address') === address)
    .map(input => input.coin.value)
    .sum()
    .value();

};

/**
 * @service
 * @description get balances for an address
 * @param address - registered address
 * @returns {Promise.<[{balances, lastBlockCheck}]>}
 */


module.exports = async (address, lastTxs = []) => {

  let height = await ipcExec('getblockcount', []);

  let txsCoins = await ipcExec('getcoinsbyaddress', [address]);

  let balance0 = _.chain(txsCoins)
    .map(coin => coin.value)
    .sum()
    .defaultTo(0)
    .value();

  let balances = {
    confirmations0: balance0,
    confirmations3: _.chain()
      .thru(() => {
        let filteredTxs = _.filter(lastTxs, tx => tx.confirmations < 3);
        return balance0 - countPositive(filteredTxs, address) + countNegative(filteredTxs, address);
      })
      .value(),
    confirmations6: _.chain()
      .thru(() => {
        let filteredTxs = _.filter(lastTxs, tx => tx.confirmations < 6);
        return countNegative(filteredTxs, address) - countPositive(filteredTxs, address);
      })
      .defaultTo(0)
      .add(balance0)
      .value()
  };

  return {
    balances: balances,
    lastBlockCheck: height,
    lastTxs: lastTxs
  };

};
