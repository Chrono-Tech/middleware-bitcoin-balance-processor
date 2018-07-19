/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const getBalance = require('./getBalance'),
  models = require('../../models');

/**
 * @function
 * @description calculate current balance
 * @param address - user address
 * @param tx - the user's tx
 * @return {Promise<{data: *[], address: *}>}
 */
module.exports = async (address, tx) => {

  const block = await models.blockModel.findOne().sort({number: -1}).select('number');

  const blockNumber = block ? block.number : 0;

  const balances0 = await getBalance(address);
  const balances3 = await getBalance(address, blockNumber - 3);
  const balances6 = await getBalance(address, blockNumber - 6);

  return {
    data: [{
      balances: {
        confirmations0: balances0,
        confirmations3: balances3,
        confirmations6: balances6
      },
      tx: tx
    }],
    address: address
  };

};
