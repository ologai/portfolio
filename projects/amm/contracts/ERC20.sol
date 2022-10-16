// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract myERC20 is ERC20 {

    constructor (string memory _name, string memory _symbol) ERC20(_name, _symbol)  {
        _mint(msg.sender, 100*(10**18));
    }
    
}
