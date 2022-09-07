# Bingo

## Introduction

This project replicates the British version of the Bingo game.
A card costs 0.1 $ETH.
The first to make a line wins 30% of the pot and the first to make the full card wins the remaining 70% of the pot.

## Game play

### Cards

Any user can buy a card, which contains 3 lines, each line with 5 numbers. Only one number can exist per decade per line.

The user calls function `generateCard` and supply 0.1 $ETH to it (the price of the ticket).

The start of the game is delayed 100 blocks every time a user buys a card, to give other users the opportunity to buy cards.

### Game

After the 100 blocks have passed, any user can call function `startGame()` to start the game. In this function, all numbers are called out until there is a winner of the game. At the end of the function, the contract's state contains the winners of the game.

To distribute the prizes and reset the players and winners, any user can call function `endGame()`.

## Winners

Winners can call function `collectPrize()` to transfer their prize to their wallet.

## Test

To run the test, just run
``
truffle test
``
It only uses one card, so the coverage is pretty limited. Anyway, it's enough to test the card generation and number draws.