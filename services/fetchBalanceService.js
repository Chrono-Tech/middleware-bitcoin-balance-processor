const Promise = require('bluebird'),
  ipc = require('node-ipc'),
  config = require('../config'),
  _ = require('lodash');

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

  let rawCoins = await new Promise((res, rej) => {
    ipcInstance.of[config.node.ipcName].on('message', data => data.error ? rej(data.error) : res(data.result));
    ipcInstance.of[config.node.ipcName].emit('message', JSON.stringify({
      method: 'getcoinsbyaddress',
      params: [address]
    })
    );
  });

  let height = await new Promise((res, rej) => {
    ipcInstance.of[config.node.ipcName].on('message', data => data.error ? rej(data.error) : res(data.result));
    ipcInstance.of[config.node.ipcName].emit('message', JSON.stringify({
      method: 'getblockcount',
      params: []
    })
    );
  });
  
  let balances = {
    confirmations0: _.chain(rawCoins)
      .map(coin => coin.value)
      .sum()
      .defaultTo(0)
      .value(),
    confirmations3: _.chain(rawCoins)
      .filter(c => c.height > -1 && height - c.height >= 3)
      .map(coin => coin.value)
      .sum()
      .defaultTo(0)
      .value(),
    confirmations6: _.chain(rawCoins)
      .filter(c => c.height > -1 && height - c.height >= 6)
      .map(coin => coin.value)
      .sum()
      .defaultTo(0)
      .value()
  };

  ipcInstance.disconnect(config.node.ipcName);

  return {
    balances: balances,
    lastBlockCheck: height
  };

};
