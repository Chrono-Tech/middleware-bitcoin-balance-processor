/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */
const getBalanceForAddress = require('../utils/getBalanceForAddress'),
  accountModel = require('../models/accountModel'),
  _ = require('lodash');


module.exports = async (blockNumber, address) => {

  const account = await accountModel.findOne({address: address});
  if (!account)
    return;

  const balances0 = await getBalanceForAddress(address, blockNumber);
  const balances3 = await getBalanceForAddress(address, blockNumber-3);
  const balances6 = await getBalanceForAddress(address, blockNumber-5);
  await accountModel.findOneAndUpdate({
    address: address
  }, {
    $set: {
      'balances.confirmations0': balances0,
      'balances.confirmations3': balances3,
      'balances.confirmations6': balances6
    }
  }, {new: true});
};
