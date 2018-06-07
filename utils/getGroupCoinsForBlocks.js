/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */

const coinModel = require('../models/coinModel'),
  _ = require('lodash');

/**
 * @returns {coinModel} {key: {address, value, outputBlock, outputTxIndex}}
 */
module.exports = async (blockNumbers) => {
  const coins = await coinModel.find({ 
    outputBlock: {$in: blockNumbers}
  });

  const groupCoins = _.reduce(coins, (groupCoins, coin) => {
    const groupKey = coin.address + '_' + coin.outputBlock;
    
    if (!groupCoins[groupKey])
      groupCoins[groupKey] = {
        outputBlock: coin.outputBlock,
        outputTxIndex: coin.outputTxIndex,
        address: coin.address
      };      

    return groupCoins;
  }, {});
  
  return _.values(groupCoins);
};
