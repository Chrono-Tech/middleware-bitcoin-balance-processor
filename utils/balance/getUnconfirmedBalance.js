/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const getBalance = require('./getBalance');

/**
 * @function
 * @description calculate current (unconfirmed) balance
 * @param address - user address
 * @param tx - the user's tx
 * @return {Promise<{data: *[], address: *}>}
 */
module.exports = async (address, tx) => {

  const balance = await getBalance(address);

  return {
    data: [{
      balances: {
        confirmations0: balance
      },
      tx: tx
    }],
    address: address
  };
};
