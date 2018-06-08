/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

require('dotenv').config();
const config = require('../../config');
/**
 * @factory config
 * @description base app's configuration
 * @returns {{
 *    mongo: {
 *      uri: string
 *      collectionPrefix: string
 *      },
 *    rabbit: {
 *      url: (*)
 *      }
 *    }}
 */

module.exports = Object.assign({
  node: {
    ipcName: process.env.IPC_NAME || 'bitcoin',
    ipcPath: process.env.IPC_PATH || '/tmp/'
  }
}, config);
