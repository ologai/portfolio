// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./Pool.sol";

contract Factory {

    mapping (address => Pool[]) public pools;
    address public admin;

    constructor () {
        admin = msg.sender;
    }

    function getPools(address _owner) public view returns (Pool[] memory){
        return pools[_owner];
    }

    function createPool() public returns (Pool) {
        Pool newPool = new Pool(msg.sender);
        pools[msg.sender].push(newPool);
        return newPool;
    }

    function destroyPool(uint idx) public {
        Pool myPool = pools[msg.sender][idx];
        uint poolsLength = pools[msg.sender].length;
        
        // end pool
        myPool.endPool();
        
        // remove pool from array
        pools[msg.sender][idx] = pools[msg.sender][poolsLength - 1];
        pools[msg.sender].pop();
    }
}
