const Promise = require('bluebird'),
  ipc = require('node-ipc'),
  config = require('../config'),
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


module.exports = async address => {

  const ipcInstance = new ipc.IPC;

  Object.assign(ipcInstance.config, {
    id: Date.now(),
    socketRoot: config.node.ipcPath,
    retry: 1500,
    sync: true,
    silent: true,
    unlink: false,
    maxRetries: 3
  });

  await new Promise((res, rej) => {
    ipcInstance.connectTo(config.node.ipcName, () => {
      ipcInstance.of[config.node.ipcName].on('connect', res);
      ipcInstance.of[config.node.ipcName].on('error', rej);
    });
  });

  let height = await new Promise((res, rej) => {
    ipcInstance.of[config.node.ipcName].on('message', data => data.error ? rej(data.error) : res(data.result));
    ipcInstance.of[config.node.ipcName].emit('message', JSON.stringify({
        method: 'getblockcount',
        params: []
      })
    );
  });

  let txs = await new Promise((res, rej) => {
    ipcInstance.of[config.node.ipcName].on('message', data => data.error ? rej(data.error) : res(data.result));
    ipcInstance.of[config.node.ipcName].emit('message', JSON.stringify({
        method: 'gettxbyaddress',
        params: [address]
      })
    );
  });

  let balances = {
    confirmations0: _.chain()
      .thru(() => {
        return countPositive(txs, address) - countNegative(txs, address);
      })
      .defaultTo(0)
      .value(),
    confirmations3: _.chain()
      .thru(() => {
        let filteredTxs = _.filter(txs, tx => tx.height > 0 && (height - (tx.height - 1)) > 2);
        return countPositive(filteredTxs, address) - countNegative(filteredTxs, address);
      })
      .defaultTo(0)
      .value(),
    confirmations6: _.chain()
      .thru(() => {
        let filteredTxs = _.filter(txs, tx => tx.height > 0 && (height - (tx.height - 1)) > 5);
        return countPositive(filteredTxs, address) - countNegative(filteredTxs, address);
      })
      .defaultTo(0)
      .value()
  };

  ipcInstance.disconnect(config.node.ipcName);

  return {
    balances: balances,
    lastBlockCheck: height
  };

};
