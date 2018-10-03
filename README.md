# middleware-bitcoin-balance-processor [![Build Status](https://travis-ci.org/ChronoBank/middleware-bitcoin-balance-processor.svg?branch=master)](https://travis-ci.org/ChronoBank/middleware-bitcoin-balance-processor)

Middleware service for handling user balance

### Installation

This module is a part of middleware services. You can install it in 2 ways:

1) through core middleware installer  [middleware installer](https://github.com/ChronoBank/middleware)
2) by hands: just clone the repo, do 'npm install', set your .env - and you are ready to go

##### About
This module is used for updating balances for registered accounts.


#### rabbitmq events

Rabbitmq is used for 2 main reasons - the first one for inner communication between different core modules. And the second one - is for notification purpose. When block is being updated, the user get a notfication through an exchange called 'events' with routing key:

```
<rabbitmq_service_name>_balance.{address}
```
Where address is to or from address (and default rabbitmq_service_name=bitcoin).

This middleware get two type events from middleware bitcoin-block-processor

Input events:

| exchange | route | format message |
| ------ | ------- | ------- |
| events | ``` <rabbitmq_service_name>_transaction.* ``` | ``` {address: <String>, block: <String>, txs: [<String>]} ```
| events | ``` <rabbitmq_service_name>_block ``` | ``` {block: <String>} ```
| internal | ``` <rabbitmq_service_name>_user.created ``` | ``` {address: <String>} ```

Output events:

| name queue | format message | example |
| ------- | --------- | ----------- |
| ``` <rabbitmq_service_name>_balance.{address} ``` | ``` {address: <String>, balances: {confirmations0: <Number>, confirmations3: <Number>, confirmations6: <Number> }, tx: <String>} ``` | ``` { address: 'RUpuMAB1qLZK2ptV43kxMU5kcvyLogdx8R', balances: { confirmations0: 14999986960, confirmations3: 5000000000, confirmations6: 0 }, tx: {"index": 23, "timestamp": 1529924020180, "blockNumber": 1326321, "hash": "640abc80ef8efff8bfdbc70362ae4534b11f3944bc9bd983abd37e879f433823", "inputs": [{"address": "n3QSvYFjS6q5gfxq7hEk8qp2y3LuH1nLnA", "value": "376687"}], "outputs": [{"address": "2N2Xgg1HvQEMJTUZYkQ3apNik9gq8pPvyFB", "value": "324487"}], "confirmations": 0}  ```



##### сonfigure your .env

To apply your configuration, create a .env file in root folder of repo (in case it's not present already).
Below is the example configuration:

```
MONGO_URI=mongodb://localhost:27017/data
MONGO_COLLECTION_PREFIX=bitcoin
RABBIT_URI=amqp://localhost:5672
RABBIT_SERVICE_NAME=app_bitcoin
```

The options are presented below:

| name | description|
| ------ | ------ |
| MONGO_URI   | the URI string for mongo connection
| MONGO_COLLECTION_PREFIX   | the default prefix for all mongo collections. The default value is 'bitcoin'
| MONGO_ACCOUNTS_URI   | the URI string for mongo connection, which holds users accounts (if not specified, then default MONGO_URI connection will be used)
| MONGO_ACCOUNTS_COLLECTION_PREFIX   | the collection prefix for accounts collection in mongo (If not specified, then the default MONGO_COLLECTION_PREFIX will be used)
| MONGO_DATA_URI   | the URI string for mongo connection, which holds data collections (for instance, processed block's height). In case, it's not specified, then default MONGO_URI connection will be used)
| MONGO_DATA_COLLECTION_PREFIX   | the collection prefix for data collections in mongo (If not specified, then the default MONGO_COLLECTION_PREFIX will be used)
| RABBIT_URI   | rabbitmq URI connection string
| RABBIT_SERVICE_NAME   | rabbitmq queues prefix
| SYSTEM_RABBIT_URI   | rabbitmq URI connection string for infrastructure
| SYSTEM_RABBIT_SERVICE_NAME   | rabbitmq service name for infrastructure
| SYSTEM_RABBIT_EXCHANGE   | rabbitmq exchange name for infrastructure
| CHECK_SYSTEM | check infrastructure or not (default = true)
| CHECK_WAIT_TIME | interval for wait respond from requirements

License
----
 [GNU AGPLv3](LICENSE)

Copyright
----
LaborX PTY
