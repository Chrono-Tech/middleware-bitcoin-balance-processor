/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const _ = require('lodash'),
  Promise = require('bluebird'),
  ipcExec = require('../utils/ipcExec');

/**
 * @service
 * @description add outputs, inputs, inValue, outValue, fee - to already decoded Tx
 * @param tx - decoded Tx
 * @returns {Promise.<{TX}>}
 */


module.exports = async tx => {

  if(!tx.vin)
  console.log(tx)
  tx.inputs = await Promise.mapSeries(tx.vin, async vin => {
    if (vin.coinbase)
      return {
        value: _.get(tx, 'vout.0.value'),
        addresses: null
      };

    let vinTx = await ipcExec('getrawtransaction', [vin.txid, true]);

    return vinTx.vout[vin.vout];
  });

  tx.outputs = tx.vout.map(v => ({
    value: Math.floor(v.value * Math.pow(10, 8)),
    scriptPubKey: v.scriptPubKey,
    addresses: v.scriptPubKey.addresses
  }));

  for (let i = 0; i < tx.inputs.length; i++) {
    tx.inputs[i] = {
      addresses: _.get(tx.inputs[i], 'scriptPubKey.addresses', null),
      prev_hash: tx.vin[i].txid, //eslint-disable-line
      script: tx.inputs[i].scriptPubKey,
      value: Math.floor(tx.inputs[i].value * Math.pow(10, 8)),
      output_index: tx.vin[i].vout //eslint-disable-line
    };
  }

  tx.valueIn = _.chain(tx.inputs)
    .map(i => i.value)
    .sum()
    .value();

  tx.valueOut = _.chain(tx.outputs)
    .map(i => i.value)
    .sum()
    .value();

  tx.fee = tx.valueIn - tx.valueOut;
  tx = _.omit(tx, ['vin', 'vout', 'blockhash']);

  return tx;

};
