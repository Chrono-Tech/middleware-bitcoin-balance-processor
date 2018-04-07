# middleware-bitcoin-balance-processor [![Build Status](https://travis-ci.org/ChronoBank/middleware-bitcoin-balance-processor.svg?branch=master)](https://travis-ci.org/ChronoBank/middleware-bitcoin-balance-processor)

Middleware service for handling user balance

### Installation

This module is a part of middleware services. You can install it in 2 ways:

1) through core middleware installer  [middleware installer](https://github.com/ChronoBank/middleware-bitcoin)
2) by hands: just clone the repo, do 'npm install', set your .env - and you are ready to go

##### About
This module is used for updating balances for registered accounts.


#### rabbitmq events

Rabbitmq is used for 2 main reasons - the first one for inner communication between different core modules. And the second one - is for notification purpose. When block is being updated, the user get a notfication through an exchange called 'events' with routing key:

```
<rabbitmq_service_name>_balance.{address}
```
Where address is to or from address (and default rabbitmq_service_name=bitcoin).

##### сonfigure your .env

To apply your configuration, create a .env file in root folder of repo (in case it's not present already).
Below is the example configuration:

```
MONGO_URI=mongodb://localhost:27017/data
MONGO_COLLECTION_PREFIX=bitcoin
RABBIT_URI=amqp://localhost:5672
RABBIT_SERVICE_NAME=app_bitcoin
IPC_NAME=bitcoin
IPC_PATH=/tmp/
```

The options are presented below:

| name | description|
| ------ | ------ |
| MONGO_URI   | the URI string for mongo connection
| MONGO_COLLECTION_PREFIX   | the prefix name for all created collections, like for Account model - it will be called (in our case) BitcoinAccount
| RABBIT_URI   | rabbitmq URI connection string
| RABBIT_SERVICE_NAME   | rabbitmq queues prefix
| IPC_NAME   | ipc file name
| IPC_PATH   | directory, where to store ipc file (you can skip this option on windows)

License
----
 [GNU AGPLv3](LICENSE)

Copyright
----
LaborX PTY