/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const getBalance = require('./getBalance');


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
