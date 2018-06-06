/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */

const coinModel = require('../models/coinModel'),
  _ = require('lodash');

module.exports = async (address) => {
  const sum  = await coinModel.aggregate([
    { 
      $match: {
        address: address, 
        inputBlock: {$exists: false}
      }
    },
    { 
      $group: { 
        _id : '$address', 
        sum: { $sum: '$value' } 
      } 
    }
  ]);

  return _.get(sum, '0.sum', 0);
};
