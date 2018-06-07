/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const Promise = require('bluebird'),
  getUpdatedAccounts = require('../utils/getUpdatedAccounts'),
  _ = require('lodash');


module.exports = async (blockHeight) => {
  const updatedAccounts = await getUpdatedAccounts(blockHeight);

  await Promise.map(updatedAccounts, async updateAccount => {
    await updateAccount.save();
  });

  return updatedAccounts.map(updatedAccount => ({
    data: [{
      balances: {
        confirmations0: _.get(updatedAccount, 'balances.confirmations0'),
        confirmations3: _.get(updatedAccount, 'balances.confirmations3'),
        confirmations6: _.get(updatedAccount, 'balances.confirmations6')
      },
      tx: updatedAccount.tx
    }],
    address: updatedAccount.address
  }));
};
