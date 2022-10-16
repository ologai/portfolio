const {
  time,
  loadFixture,
} = require('@nomicfoundation/hardhat-network-helpers');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
const { expect } = require('chai');

const ERC20_SOURCE = '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20';

/*
 * Improvements to testing
 * - Should randomize amounts and test several runs
 * - Should create different fixtures to reuse more code
 */

// Simplify BigNumber operations
function n(val) {
  return ethers.utils.parseUnits(val.toString(), 18);
}

function f(val) {
  var str = '000000000000000000' + val.toString();
  var idx = str.length - 18;
  str = str.substring(0, idx) + '.' + str.substring(idx, str.length);
  return parseFloat(str);
}

describe('Pool', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.

  async function startup() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory('Factory');
    const Pool    = await ethers.getContractFactory('Pool');
    const ERC20   = await ethers.getContractFactory('myERC20');
    // constructor arguments go here
    const factory = await Factory.deploy();
    // create two pools for testing purposes
    await factory.createPool();
    await factory.createPool();

    const pools = await factory.getPools(owner.address);

    const tokens = [];
    tokens.push(await ERC20.deploy('Token 1', 'TKN1'));
    tokens.push(await ERC20.deploy('Token 2', 'TKN2'));
    tokens.push(await ERC20.deploy('Token 3', 'TKN3'));
    tokens.push(await ERC20.deploy('Token 4', 'TKN4'));


    // approve pools to transfer tokens from owner account
    for (var j = 0; j < pools.length; j++) {
      for (var i = 0; i < tokens.length; i++) {
        await tokens[i].approve(pools[j], n(100));
      }
    }

    return { owner,
              otherAccount,
              factory,
              pools,
              Pool,
              ERC20,
              tokens,
              getBalance: ethers.provider.getBalance,
            };
  }

  // Chai cheatsheet
  // expect().to.equal();
  // await expect().to.be.revertedWith(<message>);
  // await expect().to.be.revertedWithCustomError(<contrac>, <error name>).withArgs(<expected argument>);
  // await expect().not.to.be.reverted;
  // await expect().to.emit(<contract>, <event name>).withArgs(<expected arguments>); // use 'anyValue' if any argument is acceptable
  // await expect().to.changeEtherBalances(<list of account>, <list of delta in balances>);

  // Ether cheatsheet
  // <contract>.connect(otherAccount)   // msg.sender changes to otherAccount
  //
  //
  describe('Deployment', function () {

    it('Should set the right owner', async function () {

      const { owner, factory, pools, Pool } = await loadFixture(startup);

      expect(pools.length).to.equal(2);

      for (var i = 0; i < pools.length; i++) {
        const pool = Pool.attach(pools[i]);
        expect(await pool.admin()).to.equal(owner.address);
      }
    });

    it('We should have 4 tokens, each with 100 tokens balance', async function () {

      const { owner, tokens } = await loadFixture(startup);

      expect(tokens.length).to.equal(4);

      for (var i = 0; i < tokens.length; i++) {
        expect(await tokens[i].balanceOf(owner.address)).to.equal(n(100));
      }
    });
  });

  // Helper function
  async function startPool(pool, tokens) {
    const balances = [n(20), n(1)];

    await pool.startPool(
        tokens[0].address,
        tokens[1].address,
        {
            weight: n(0.5),
            balance: balances[0],
          }, // send structures to contract
        {
            weight: n(0.5),
            balance: balances[1],
          }// send structures to contract
    );

    return balances;
  }

  describe('Setup pools', function () {

    it('Other accounts cannot start pool', async function () {
        const { otherAccount, pools, Pool, tokens } = await loadFixture(startup);

        const tx = Pool.attach(pools[0]).connect(otherAccount).startPool(
            tokens[0].address,
            tokens[1].address,
            {
                weight: n(0.5),
                balance: n(20),
              }, // send structures to contract
            {
                weight: n(0.5),
                balance: n(1),
              }// send structures to contract
        );
        await expect(tx).to.be.revertedWithCustomError(Pool, 'AdminOnly');
      });

    it('Cannot add one token to empty pool', async function () {
        const { otherAccount, pools, Pool, tokens } = await loadFixture(startup);

        const tx = Pool.attach(pools[0]).addToken(
          tokens[0].address,
          n(1),
          tokens[1].address,
          n(1)
        );
        await expect(tx).to.be.revertedWithCustomError(Pool, 'InvalidPool');
      });

    it('Pools have correct balance', async function () {
      const { owner, pools, Pool, tokens, ERC20 } = await loadFixture(startup);

      // get previous balance
      const prevBalance = await tokens[0].balanceOf(owner.address);
      expect(prevBalance).to.equal(n(100));

      const pool1 = Pool.attach(pools[0]);
      //const balances = [n(20), n(1)];
      const balances = await startPool(pool1, tokens);

      expect(await pool1.getTokenCount()).to.equal(2);

      for (var i = 0; i < 2; i++) {
        var tkn = ERC20.attach(await pool1.tokenList(i));

        expect(tkn.address).to.equal(tokens[i].address);
        var tknInfo = await pool1.tokens(tkn.address);

        expect(tknInfo.weight).to.equal(n(0.5));

        expect(await tkn.balanceOf(owner.address)).to.equal(prevBalance.sub(balances[i]));
        expect(await tkn.balanceOf(pool1.address)).to.equal(balances[i]);
      }
    });

    it('Other accounts cannot add tokens to a pool', async function () {
      const { otherAccount, pools, Pool, tokens } = await loadFixture(startup);

      const pool1 = Pool.attach(pools[0]);
      //const balances = [n(20), n(1)];
      const balances = await startPool(pool1, tokens);

      const tx = pool1.connect(otherAccount).addToken(
        tokens[2].address,
        n(10),
        tokens[1].address,
        n(1)
      );
      await expect(tx).to.be.revertedWithCustomError(Pool, 'AdminOnly');
    });

    it('Cannot use a non-existing pool as reference', async function () {
      const { pools, Pool, tokens } = await loadFixture(startup);

      const pool1 = Pool.attach(pools[0]);
      //const balances = [n(20), n(1)];
      const balances = await startPool(pool1, tokens);

      const tx = pool1.addToken(
        tokens[2].address,
        n(10),
        tokens[3].address,
        n(1)
      );
      await expect(tx).to.be.revertedWithCustomError(Pool, 'InvalidToken');
    });

    it('Added one more token to the pool', async function () {
      const { owner, pools, Pool, tokens, ERC20 } = await loadFixture(startup);

      const pool1 = Pool.attach(pools[0]);
      const balances = await startPool(pool1, tokens);

      const tk3Balance = n(2);

      await expect(
          pool1.addToken(
            tokens[2].address,
            tk3Balance,
            tokens[1].address,
            n(1)
          )
      ).to.changeTokenBalances(
          tokens[2],
          [owner.address, pool1.address],
          [tk3Balance.mul(-1), tk3Balance]
      );

      // pool now has 3 tokens?
      expect(await pool1.getTokenCount()).to.equal(3);

      // new token is the deposited token?
      var tkn = ERC20.attach(await pool1.tokenList(2));
      expect(tkn.address).to.equal(tokens[2].address);

      var tkInfo = await pool1.tokens(tokens[0].address);
      expect(tkInfo.weight).to.equal(n(0.25));
      expect(tkInfo.balance).to.equal(balances[0]);
      tkInfo = await pool1.tokens(tokens[1].address);
      expect(tkInfo.weight).to.equal(n(0.25));
      expect(tkInfo.balance).to.equal(balances[1]);
      tkInfo = await pool1.tokens(tokens[2].address);
      expect(tkInfo.weight).to.equal(n(0.5));
      expect(tkInfo.balance).to.equal(tk3Balance);
    });

    it('Added more of existing token', async function () {
      const { owner, pools, Pool, tokens } = await loadFixture(startup);

      const pool1 = Pool.attach(pools[0]);
      const balances = await startPool(pool1, tokens);

      const tk2Balance = n(2);

      await expect(
          pool1.addToken(
            tokens[1].address,
            tk2Balance,
            tokens[3].address,  // some token that does not exist in the pool
            n(23423)            // some value to prove that this argument is not used
          )
      ).to.changeTokenBalances(
          tokens[1],
          [owner.address, pool1.address],
          [tk2Balance.mul(-1), tk2Balance]
      );

      // pool now still 2 tokens?
      expect(await pool1.getTokenCount()).to.equal(2);

      var tkInfo = await pool1.tokens(tokens[0].address);
      expect(tkInfo.weight).to.equal(n(0.25));
      expect(tkInfo.balance).to.equal(balances[0]);
      tkInfo = await pool1.tokens(tokens[1].address);
      expect(tkInfo.weight).to.equal(n(0.75));
      expect(tkInfo.balance).to.equal(balances[1].add(tk2Balance));
    });

    it('Remove some amount of existing token', async function () {
      const { owner, pools, Pool, tokens } = await loadFixture(startup);

      const pool1 = Pool.attach(pools[0]);
      const balances = await startPool(pool1, tokens);

      const tk1Balance = n(15);

      await expect(
          pool1.withdrawToken(
            tokens[0].address,
            tk1Balance,
          )
      ).to.changeTokenBalances(
          tokens[0],
          [owner.address, pool1.address],
          [tk1Balance, tk1Balance.mul(-1)]
      );

      // pool now still 2 tokens?
      expect(await pool1.getTokenCount()).to.equal(2);

      var tkInfo = await pool1.tokens(tokens[0].address);
      expect(tkInfo.weight).to.equal(n(0.20));
      expect(tkInfo.balance).to.equal(balances[0].sub(tk1Balance));
      tkInfo = await pool1.tokens(tokens[1].address);
      expect(tkInfo.weight).to.equal(n(0.80));
      expect(tkInfo.balance).to.equal(balances[1]);
    });

    it('Cannot remove entire amount of one token if only one remains', async function () {
      const { owner, pools, Pool, tokens } = await loadFixture(startup);

      const pool1 = Pool.attach(pools[0]);
      const balances = await startPool(pool1, tokens);

      const tk1Balance = n(20);

      await expect(
          pool1.withdrawToken(
            tokens[0].address,
            tk1Balance,
          )
      ).to.be.revertedWithCustomError(Pool, 'InvalidPool');
    });

    it('Remove entire amount of existing token', async function () {

      // Setup
      const { owner, pools, Pool, tokens } = await loadFixture(startup);

      const pool1 = Pool.attach(pools[0]);
      const balances = await startPool(pool1, tokens);

      const tk3Balance = n(3);

      await pool1.addToken(
                tokens[2].address,
                tk3Balance,
                tokens[1].address,
                n(1)
          );

      const tk1Balance = n(20);
      // Test
      await expect(
          pool1.withdrawToken(
            tokens[0].address,
            tk1Balance,
          )
      ).to.changeTokenBalances(
          tokens[0],
          [owner.address, pool1.address],
          [tk1Balance, tk1Balance.mul(-1)]
      );


      // pool now has 2 tokens?
      expect(await pool1.getTokenCount()).to.equal(2);
      // Token 0 in pool is now token 2
      expect(await pool1.tokenList(0)).to.equal(tokens[2].address);
      // Token 1 in pool still token 1 (remained the same)
      expect(await pool1.tokenList(1)).to.equal(tokens[1].address);

      // Prices:
      // 1 Token[2] = 1  Token[1]

      // Balances:
      // Token[1] = 1
      // Token[2] = 3

      // check contract state
      var tkInfo = await pool1.tokens(tokens[2].address);
      expect(tkInfo.weight).to.equal(n(0.75));
      expect(tkInfo.balance).to.equal(n(3));

      tkInfo = await pool1.tokens(tokens[1].address);
      expect(tkInfo.weight).to.equal(n(0.25));
      expect(tkInfo.balance).to.equal(balances[1]);
    });

  });

  describe('Swaps', function () {
    it('Get no slippage price', async function () {
      // Setup
      const { owner, pools, Pool, tokens } = await loadFixture(startup);

      const pool1 = Pool.attach(pools[0]);
      const balances = await startPool(pool1, tokens);
      const fee      = 0.001;
      const ONE     = n(1);

      // Test
      const tk1Info = await pool1.tokens(tokens[0].address);
      const tk2Info = await pool1.tokens(tokens[1].address);
      //console.log(tk1Info);
      //console.log(tk2Info);
      //console.log(tk1Info.balance/tk1Info.weight);
      //console.log(tk2Info.balance/tk2Info.weight);
      const expectedPrice = ONE.mul(tk1Info.balance).div(tk1Info.weight).mul(tk2Info.weight).div(tk2Info.balance).mul(ONE).div(n(1 - fee));
      expect(await pool1.getPrice(tk1Info, tk2Info, n(fee))).to.equal(expectedPrice);
    });

    /*
    * aO = outAmount
    * bO = tkOut.balance
    * bI = tkIn.balance              /      /            bI             \    (wI / wO) \
    * aI = inAmount       aO = bO * |  1 - | --------------------------  | ^            |
    * wI = tkin.weight               \      \ ( bI + ( aI * ( 1 - sF )) /              /
    * wO = tkOut.weight
    * sF = swapFee
    */
    it('Swap with defined input amount', async function () {

        // Setup
        const { owner, pools, Pool, tokens } = await loadFixture(startup);

        const pool1 = Pool.attach(pools[0]);
        const balances = await startPool(pool1, tokens);
        const fee = n(0.3 / 100);
        const tkInAmount = n(1);

        // get previous balance
        var userBalance = {
          tkIn: await tokens[0].balanceOf(owner.address),
          tkOut: await tokens[1].balanceOf(owner.address),
        };

        const tkIn = await pool1.tokens(tokens[0].address);
        const tkOut = await pool1.tokens(tokens[1].address);

        const weightRatio = f(tkIn.weight) / f(tkOut.weight);
        const base  = f(tkIn.balance) / (f(tkIn.balance) + f(tkInAmount) * (1 - f(fee)));
        var expectedOut = f(tkOut.balance) * (1 - Math.pow(base, weightRatio));
        expectedOut = n(expectedOut);

        // Test

        await expect(
            pool1.swap(
                tokens[0].address,
                tokens[1].address,
                tkInAmount,
                0
            )
        ).to.changeTokenBalances(
          tokens[0],
          [owner.address, pool1.address],
          [tkInAmount.mul(-1), tkInAmount]
        );

        const tkInAfter = await pool1.tokens(tokens[0].address);
        const tkOutAfter = await pool1.tokens(tokens[1].address);

        const actualOut = tkOut.balance.sub(tkOutAfter.balance);
        const actualIn  = tkInAfter.balance.sub(tkIn.balance);

        expect(actualIn).to.equal(tkInAmount);
        expect(actualOut).closeTo(expectedOut, 10000);

        var tkn = tokens[0];
        expect(await tkn.balanceOf(owner.address)).to.equal(userBalance.tkIn.sub(actualIn));
        expect(await tkn.balanceOf(pool1.address)).to.equal(tkIn.balance.add(actualIn));

        var tkn = tokens[1];
        expect(await tkn.balanceOf(owner.address)).to.equal(userBalance.tkOut.add(actualOut));
        expect(await tkn.balanceOf(pool1.address)).to.equal(tkOut.balance.sub(actualOut));
      });

    /*
    * aI = inAmount
    * bO = tkOut.balance                 /  /     bO      \    (wO / wI)      \
    * bI = tkIn.balance            bI * |  | ------------  | ^            - 1  |
    * aO = outAmount         aI =        \  \ ( bO - aO ) /                   /
    * wI = tkIn.weight             --------------------------------------------
    * wO = tkOut.weight                            ( 1 - sF )
    * sF = swapFee
    */

    it('Swap with defined output amount', async function () {
      // Setup
      const { owner, pools, Pool, tokens } = await loadFixture(startup);

      const pool1 = Pool.attach(pools[0]);
      const balances = await startPool(pool1, tokens);
      const fee = await pool1.fee();
      const tkOutAmount = n(0.01);

      // get previous balance
      var userBalance = {
        tkIn: await tokens[0].balanceOf(owner.address),
        tkOut: await tokens[1].balanceOf(owner.address),
      };

      const tkIn = await pool1.tokens(tokens[0].address);
      const tkOut = await pool1.tokens(tokens[1].address);

      const weightRatio = f(tkOut.weight) / f(tkIn.weight);
      const base  = f(tkOut.balance) / (f(tkOut.balance) - f(tkOutAmount));
      var expectedIn = f(tkIn.balance) * (Math.pow(base, weightRatio) - 1) / (1 - f(fee));
      expectedIn = n(expectedIn);

      // Test

      await expect(
          pool1.swap(
              tokens[0].address,
              tokens[1].address,
              0,
              tkOutAmount
          )
      ).to.changeTokenBalances(
        tokens[1],
        [owner.address, pool1.address],
        [tkOutAmount, tkOutAmount.mul(-1)]
      );

      const tkInAfter = await pool1.tokens(tokens[0].address);
      const tkOutAfter = await pool1.tokens(tokens[1].address);

      const actualOut = tkOut.balance.sub(tkOutAfter.balance);
      const actualIn  = tkInAfter.balance.sub(tkIn.balance);

      expect(actualOut).to.equal(tkOutAmount);
      expect(actualIn).closeTo(expectedIn, 10000);

      var tkn = tokens[0];
      expect(await tkn.balanceOf(owner.address)).to.equal(userBalance.tkIn.sub(actualIn));
      expect(await tkn.balanceOf(pool1.address)).to.equal(tkIn.balance.add(actualIn));

      var tkn = tokens[1];
      expect(await tkn.balanceOf(owner.address)).to.equal(userBalance.tkOut.add(actualOut));
      expect(await tkn.balanceOf(pool1.address)).to.equal(tkOut.balance.sub(actualOut));
    });
  });

});
