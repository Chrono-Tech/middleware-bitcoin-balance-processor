/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const Promise = require('bluebird'),
  getAddressBalanceOnConfirmations = require('../utils/getAddressBalanceOnConfirmations'),
  accountModel = require('../models/accountModel'),
  _ = require('lodash');


module.exports = async (blockHeight) => {
  const balanceChanges = await getAddressBalanceOnConfirmations(blockHeight);

  const totalChangesAddress = await Promise.map(balanceChanges, async balanceChange => {
    let updatedAccount = await accountModel.findOneAndUpdate({address: balanceChange.address}, {$set: balanceChange.balances}, {new: true});

    return balanceChange.txs.map(tx => ({
      data: [{
        balances: {
          confirmations0: _.get(updatedAccount, 'balances.confirmations0'),
          confirmations3: _.get(updatedAccount, 'balances.confirmations3'),
          confirmations6: _.get(updatedAccount, 'balances.confirmations6')
        },
        tx: tx
      }],
      address: updatedAccount.address
    }));

  });

  return _.flattenDeep(totalChangesAddress);

};
