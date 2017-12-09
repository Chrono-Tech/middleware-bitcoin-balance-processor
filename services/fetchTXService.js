const Promise = require('bluebird'),
  ipc = require('node-ipc'),
  config = require('../config');

/**
 * @service
 * @description get raw Tx by its hash
 * @param hash - tx's hash (or txid)
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

  let rawTx = await new Promise((res, rej) => {
    ipcInstance.of[config.node.ipcName].on('message', data => data.error ? rej(data.error) : res(data.result));
    ipcInstance.of[config.node.ipcName].emit('message', JSON.stringify({
      method: 'getrawtransaction',
      params: [hash, true]
    })
    );
  });

  let block = rawTx.blockhash ? await new Promise((res, rej) => {
    ipcInstance.of[config.node.ipcName].on('message', data => data.error ? rej(data.error) : res(data.result));
    ipcInstance.of[config.node.ipcName].emit('message', JSON.stringify({
      method: 'getblockheader',
      params: [rawTx.blockhash]
    })
    );
  }) : -1;

  ipcInstance.disconnect(config.node.ipcName);

  rawTx.block = rawTx.blockhash ? block.height : block;

  return rawTx;
};
