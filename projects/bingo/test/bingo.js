const Bingo = artifacts.require("Bingo");


/*
*	Real testing would have to be done with randomized accounts and 
*	more players in the game. Also, it would have to validate if the winners
*	match the sequence of called out numbers
*
*	For now, this kind of validates that the contract is generating cards,
*	calling out numbers, selecting winners and distributing prizes.
*/


// Time out found in contract. Could be read from contract instead
const timeOut = 100;

contract("bingo", function (accounts) {
  it("should assert true", async function () {
    const b = await Bingo.deployed();
    return assert.isTrue(true);
  });

  it("should fail to generate card", async function () {
    const bingo = await Bingo.deployed();

    try {
        await bingo.generateCard({value: web3.utils.toWei('0.099', 'ether')})
    } catch (error) {
        assert(error.reason == 'Insufficient funds');
    }
  })
  
  it("cannot start game without players", async function () {
    const bingo = await Bingo.deployed();

    try {
        await bingo.startGame()
    } catch (error) {
        assert(error.reason == "No players subscribed");
    }
  })
	
  it("should generate a card", async function () {
    const bingo = await Bingo.deployed();

    var acc = accounts[0]
    result = await bingo.generateCard({value: web3.utils.toWei('0.1', 'ether')});
    // SeedChanged event
    //console.log(result.logs[0].args.seed);
    // CardGenerated event
    card = result.logs[1].args.card;
    card = card.map( (line) => {
        return line.map( (slot) => {
            return slot.toNumber();
        })
    })
    console.log(card);

    for (var l = 0; l < 3; l++) {
        card[l].forEach( async (n) => {
            var add = await bingo.lines(l,n,0);
            assert.equal(add, acc);
        })
    }
    
    var add = await bingo.players(0);
    assert.equal(add, acc);
  
	var blockNumber = (await web3.eth.getBlock('latest')).number;
    console.log("Registered at block height: " + blockNumber);
	assert.equal((await bingo.timeLastCard()).toNumber(), blockNumber); 
 })

  it("Same player cannot generate another card", async () => {
    const bingo = await Bingo.deployed();

    try {
        await bingo.generateCard({value: web3.utils.toWei('0.1', 'ether')})
    } catch (error) {
        assert(error.reason == "Address already subscribed for next play");
    }
  })
  
  it("Need to wait for timeout before starting game", async () => {
    const bingo = await Bingo.deployed();

    try {
        await bingo.startGame()
    } catch (error) {
        assert(error.reason == "Game cannot start yet");
    } 
  })
  
  it("Game starts and finishes successfully", async () => {
    const bingo = await Bingo.deployed();

	for (var i = 0; i < timeOut; i++) {	
    	await advanceBlock();
	}
    console.log("Starting at block height: " + (await web3.eth.getBlock('latest')).number);
    await bingo.startGame()

    var acc = accounts[0]
	var oneLineWinners = (await bingo.getOneLineWinners());
	assert.equal(oneLineWinners.length, 1);
	assert.equal(oneLineWinners[0], acc);
	var fullHouseWinners = (await bingo.getFullHouseWinners());
	assert.equal(fullHouseWinners.length, 1);
	assert.equal(fullHouseWinners[0], acc);
  })

  it("Cannot collect prizes until game is ended", async () => {
    const bingo = await Bingo.deployed();

	try {
		await bingo.collectPrize();
	} catch (error) {
		assert.equal(error.reason, 'Game ongoing');
	}
  });
  
  it("End game to distribute prizes and reset the game", async () => {
    const bingo = await Bingo.deployed();
    
	await bingo.endGame()
	
	var oneLineWinners = (await bingo.getOneLineWinners());
	assert.equal(oneLineWinners.length, 0);
	var fullHouseWinners = (await bingo.getFullHouseWinners());
	assert.equal(fullHouseWinners.length, 0);
    var numberOfPlayers = await bingo.getNumberOfPlayers();
	assert.equal(numberOfPlayers, 0);
	// Total prize should equal invested amount
    var acc = accounts[0]
	var prize = (await bingo.prizes(acc)).toString();
	assert.equal(prize, web3.utils.toWei('0.1', 'ether'));
	assert.equal(await web3.eth.getBalance(bingo.address), prize);
  });
  
  it("Prize is collected correctly", async () => {
    const bingo = await Bingo.deployed();

	var acc = accounts[0]
    var prevBalance = (await web3.eth.getBalance(acc))
	
	var result = await bingo.collectPrize();
  	var txCost = result.gasUsed * result.effectiveGasPrice; 
    var postBalance = (await web3.eth.getBalance(acc))
	assert(postBalance, prevBalance - txCost + web3.utils.toWei('0.1', 'ether'));
  });
  

  // Mine a block to increase height
  advanceBlock = () => {
  	return new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: '2.0',
      method: 'evm_mine',
      id: new Date().getTime()
    }, (err, result) => {
      if (err) { return reject(err) }
      const newBlockHash = web3.eth.getBlock('latest').hash

      return resolve(newBlockHash)
      })
    })
  }
});
