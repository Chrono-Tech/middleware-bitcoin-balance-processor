const Promise = require('bluebird'),
  config = require('../config'),
  ipc = require('node-ipc');

module.exports = async (method, params) => {

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

  await new Promise(res => {
    ipcInstance.connectTo(config.node.ipcName, () => {
      ipcInstance.of[config.node.ipcName].on('connect', res);
    });
  });

  let response = await new Promise((res, rej) => {
    ipcInstance.of[config.node.ipcName].on('message', data => data.error ? rej(data.error) : res(data.result));
    ipcInstance.of[config.node.ipcName].emit('message', JSON.stringify({method: method, params: params})
    );
  });

  ipcInstance.disconnect(config.node.ipcName);

  return response;
};
