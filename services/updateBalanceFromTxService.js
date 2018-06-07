/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const getBalanceForAddress = require('../utils/getBalanceForAddress'),
  accountModel = require('../models/accountModel'),
  _ = require('lodash');



module.exports = async (address, blockHeight, txs) => {

  const account = await accountModel.findOne({address: address});
  if (!account)
    return;
  
  const initBalance = _.get(account, 'balances.confirmations0', null);
  const tx = _.last(txs);    
  const balance = await getBalanceForAddress(address);
  if (balance === initBalance)
    return [];

  const updatedAccount = await accountModel.findOneAndUpdate({
    address: address
  }, {
    $set: {
      'balances.confirmations0': balance,
      lastBlockCheck: (blockHeight) ? blockHeight : -1
    }
  }, {new: true});

  return [{
    data: [{
      balances: updatedAccount.balances,
      tx: tx
    }],
    address: address
  }];
};
