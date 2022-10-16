const {
  time,
  loadFixture,
} = require('@nomicfoundation/hardhat-network-helpers');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
const { expect } = require('chai');

describe('Factory', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.

  async function startup() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory('Factory');
    const Pool    = await ethers.getContractFactory('Pool');

    // constructor arguments go here
    const factory = await Factory.deploy();

    return { owner,
              otherAccount,
              factory,
              Pool,
              getBalance: ethers.provider.getBalance,
            };
  }

  // Chai cheatsheet
  // expect().to.equal();
  // await expect().to.be.revertedWith(<message>);
  // await expect().not.to.be.reverted;
  // await expect().to.emit(<contract>, <event name>).withArgs(<expected arguments>); // use 'anyValue' if any argument is acceptable
  // await expect().to.changeEtherBalances(<list of account>, <list of delta in balances>);

  // Ether cheatsheet
  // <contract>.connect(otherAccount)   // msg.sender changes to otherAccount
  //
  //
  describe('Deployment', function () {

    it('Should set the right owner', async function () {
      const { owner, factory } = await loadFixture(startup);

      expect(await factory.admin()).to.equal(owner.address);
    });

  });

  describe('Create pools', function () {
    describe('Validations', function () {

        it('Two pools have been created', async function () {
          const { owner, factory } = await loadFixture(startup);

          // returns transaction info
          await factory.createPool();
          await factory.createPool();

          const pools = await factory.getPools(owner.address);

          expect(pools.length).to.equal(2);
          expect(pools[0]).to.not.equal(pools[1]);
        });

        it('Two pools have been destroyed', async function () {
          const { owner, factory } = await loadFixture(startup);

          // returns transaction info
          await factory.createPool();
          await factory.createPool();

          const poolsBefore = await factory.getPools(owner.address);

          await factory.destroyPool(0);

          var poolsAfter = await factory.getPools(owner.address);

          expect(poolsAfter.length).to.equal(1);
          expect(poolsAfter[0]).to.equal(poolsBefore[1]);

          await factory.destroyPool(0);

          poolsAfter = await factory.getPools(owner.address);

          expect(poolsAfter.length).to.equal(0);
        });

      });
  });
});
