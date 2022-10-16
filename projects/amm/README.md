# Custom Automated Market Maker

## Introduction

This project is an AMM with the following features:
- Any user can create a pool, starting with two tokens, with any weight ratio between the pair.
- Only the creator of the pool can then add/remove tokens, change ratios and end the pool.
- The pool can be used by any user.
- The user can set the fee of the pool.
- The user can create one or more pools.

## Contracts

### `Factory`

Responsible for creating and destroying pools.

 Contains list of pools for each user.

Functions:
- `getPools` - returns list of pools of a user
- `createPool` - creates an empty pool and adds to list
- `destroyPool` - destroys a pool and removes from list

### `Pool`

An instance of a pool.

#### Start pool

Deposits two tokens to an empty pool.

The user must provide the starting balances and their weights in the pool.

Functions:
- `startPool`


#### Add new token

If a new token is added, the user must provide the address of a token that already exists in the pool and the price ratio between the new token and that token.

The pool weights are then recalculated according to the new balances.

Functions:
- `addToken`

#### Add/Remove supply of existing token

The supplies of an existing token can be changed. The weight ratios of the pool are calculated according to the new balances.

In case the token supply goes to zero (only allowed for pools with >2 tokens), the token is removed from the pool and the weights for the remaining tokens are recalculated.

Functions:
- `addToken`
- `withdrawToken`

#### Swap

Any user can swap between two tokens in a pool. They can specify a fixed input amount or output amount and the contract calculates the corresponding output or input amounts, respectively.


Functions:
- `swap`

#### End the pool

A user can end one of his pools, withdrawing all tokens in it.

Functions:
- `endPool`
