const _ = require('lodash');

/**
 * @service
 * @description calculate balances by specified utxos
 * @param utxos - utxo transactions
 * @returns {Promise.<[{balances, lastBlockCheck}]>}
 */

module.exports = utxos => {

  let highestCoin = _.chain(utxos)
    .sortBy('height')
    .last()
    .defaults({
      confirmations: 0,
      height: 0
    })
    .value();

  let balances = {
    confirmations0: _.chain(utxos)
      .map(coin => coin.satoshis)
      .sum()
      .defaultTo(0)
      .value(),
    confirmations3: _.chain(utxos)
      .filter(coin => coin.confirmations >= 3)
      .map(coin => coin.satoshis)
      .sum()
      .defaultTo(0)
      .value(),
    confirmations6: _.chain(utxos)
      .filter(coin => coin.confirmations >= 6)
      .map(coin => coin.satoshis)
      .sum()
      .defaultTo(0)
      .value()
  };

  return {
    balances: balances,
    lastBlockCheck: highestCoin.confirmations + highestCoin.height
  };
};
