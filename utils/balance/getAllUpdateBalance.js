/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const getBalance = require('./getBalance'),
  models = require('../../models');

/**
 * @function
 * @description grab balance for 0,3 and 6 confirmations
 * @param address - user address
 * @return {Promise<{data: *[], address: *}>}
 */
module.exports = async (address) => {

  const block = await models.blockModel.findOne().sort({number: -1}).select('number');

  const blockNumber = block ? block.number : 0;

  const balances0 = await getBalance(address, blockNumber);
  const balances3 = await getBalance(address, blockNumber - 3);
  const balances6 = await getBalance(address, blockNumber - 5);

  return {
    data: [{
      balances: {
        confirmations0: balances0,
        confirmations3: balances3,
        confirmations6: balances6
      },
      tx: null
    }],
    address: address
  };
};
