const _ = require('lodash');

let countPositive = (txs, address) => {
  return _.chain(txs)
    .map(tx => tx.outputs)
    .flattenDeep()
    .filter(output =>  (_.get(output, 'addresses', []) || []).includes(address))
    .map(output => output.value)
    .sum()
    .value();
};

let countNegative = (txs, address) => {
  return _.chain(txs)
    .map(tx => tx.inputs)
    .flattenDeep()
    .filter(input => (_.get(input, 'addresses', []) || []).includes(address))
    .map(input => input.value)
    .sum()
    .value();

};

/**
 * @service
 * @description get balances for an address
 * @param address - registered address
 * @returns {Promise.<[{balances, lastBlockCheck}]>}
 */


module.exports = (txs, address) => {



  return {
    positive: countPositive(txs, address),
    negative: countNegative(txs, address)
  };

};
