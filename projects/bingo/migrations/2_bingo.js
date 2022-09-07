const Bingo = artifacts.require("Bingo");

module.exports = function (deployer) {
  deployer.deploy(Bingo, /* maxCards */ 255);
};
