// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./Pool.sol";

contract Factory {

    mapping (address => Pool[]) public pools;
    address public admin;

    constructor () {
        admin = msg.sender;
    }

    /*
    *   Initialize pool with two tokens
    *
    *   @param      _owner   Owner of pools
    *   @returns    list of pools
    */
    function getPools(address _owner) public view returns (Pool[] memory){
        return pools[_owner];
    }

    /*
    *   Creates an empty pool and adds to owner's list
    *
    *   @returns    instance of new pool
    */
    function createPool() public returns (Pool) {
        Pool newPool = new Pool(msg.sender);
        pools[msg.sender].push(newPool);
        return newPool;
    }

    /*
    *   Destroys a pool
    *
    *   @param idx      Index of pool to be destroyed
    */
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
