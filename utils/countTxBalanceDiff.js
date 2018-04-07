/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

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
