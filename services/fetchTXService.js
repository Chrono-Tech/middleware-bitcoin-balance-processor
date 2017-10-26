const Promise = require('bluebird'),
  ipc = require('node-ipc'),
  Tx = require('bcoin/lib/primitives/tx'),
  Network = require('bcoin/lib/protocol/network'),
  config = require('../config');

/**
 * @service
 * @description get utxos for a specified address
 * @param address - registered address
 * @returns {Promise.<[{address: *,
 *     txid: *,
 *     scriptPubKey: *,
 *     amount: *,
 *     satoshis: *,
 *     height: *,
 *     confirmations: *}]>}
 */


module.exports = async hash => {

  const ipcInstance = new ipc.IPC;

  Object.assign(ipcInstance.config, {
    id: Date.now(),
    socketRoot: config.bitcoin.ipcPath,
    retry: 1500,
    sync: true,
    silent: true,
    unlink: false,
    maxRetries: 3
  });

  await new Promise((res, rej) => {
    ipcInstance.connectTo(config.bitcoin.ipcName, () => {
      ipcInstance.of[config.bitcoin.ipcName].on('connect', res);
      ipcInstance.of[config.bitcoin.ipcName].on('error', rej);
    });
  });

  let rawTx = await new Promise((res, rej) => {
    ipcInstance.of[config.bitcoin.ipcName].on('message', data => data.error ? rej(data.error) : res(data.result));
    ipcInstance.of[config.bitcoin.ipcName].emit('message', JSON.stringify({
        method: 'getrawtransaction',
        params: [hash, true]
      })
    );
  });

  let block = rawTx.blockhash ? await new Promise((res, rej) => {
    ipcInstance.of[config.bitcoin.ipcName].on('message', data => data.error ? rej(data.error) : res(data.result));
    ipcInstance.of[config.bitcoin.ipcName].emit('message', JSON.stringify({
        method: 'getblockheader',
        params: [rawTx.blockhash]
      })
    );
  }) :
    await new Promise((res, rej) => {
      ipcInstance.of[config.bitcoin.ipcName].on('message', data => data.error ? rej(data.error) : res(data.result));
      ipcInstance.of[config.bitcoin.ipcName].emit('message', JSON.stringify({
          method: 'getblockcount',
          params: []
        })
      );
    });

  ipcInstance.disconnect(config.bitcoin.ipcName);

  rawTx.block = rawTx.blockhash ? block.height : block + 1;

  return rawTx;
};
