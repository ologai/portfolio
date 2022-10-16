// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

/* Bingo game (british style)
* Each card has 3 lines, each line containing 5 numbers
*
* Each line cannot repeat a number in the same tenths
* E.g. 11 and 15 in the same line is not possible
* 
* Numbers are drawn and the first player(s) filling a line
* win part of the prize
*
* The first player(s) filling the whole card (full house)
* win the remaining part of the prize
*
* Extra rules:
*   Only one card per address
*   Each card costs 0.1 Ether
* Prizes:
*   30% to first full line
*   70% to full house
* Notes: 
* For convenience, numbers go from 0 to 89.
*/


contract Bingo {

  enum State {
      finished,
      started
  }

  /* Events */
  event SeedChanged(bytes32 seed);
  event CardGenerated(uint8[5][3] card);
  event DrawNumber(uint8 number);
  event OneLineWinner(address add, uint8 number);
  event FullHouseWinner(address add, uint8 number);
  
  /* Constants */
  uint256 constant MAX_INT = 2**256 - 1;
  uint constant cardPrice = 0.1 ether;
  // Blocks produced between last card and start of game
  uint constant timeOut = 100;

  /* Variables */
  // mapping of ball number to list of addresses
  address[][90][3] public lines;

  address[] public players;

  // accumulated prizes of previous runs
  mapping (address => uint) public prizes;

  // counter of matches for current run
  mapping (address => uint8) public counter;
  mapping (address => uint8)[3] public counterLines;
 
  address[] public oneLineWinners;
  address[] public fullHouseWinners;
  
  // current state
  State private state = State.finished;
  // maximum number of cards per run
  uint8 public maxCards;
  uint public timeLastCard;
  address public admin;
  bytes32 private seed = 0x75e07b686570bbcc103a79ccc90ff45b93f46fd6054bf080b0005512e6415e71;

  /* Modifiers */
  modifier onlyAdmin {
      require (msg.sender == admin, "Not admin"); 
      _;
  }
  modifier onlyFinished {
      require (state == State.finished, "Game ongoing");
      _;
  }
  modifier onlyStarted {
      require (state == State.started, "Game finished");
      _;
  }
  
  /* Functions */
  constructor (uint8 _maxCards) {
      maxCards = _maxCards;
      admin = msg.sender;
  }

  function getOneLineWinners () public view returns (address[] memory) {
      return oneLineWinners;
  }
  
  function getFullHouseWinners () public view returns (address[] memory) {
      return fullHouseWinners;
  }

  function getNumberOfPlayers () public view returns (uint) {
      return players.length;
  }
  /* Callout number
  * Winners are found in this function
  *
  * @param  _number Number being called out
  * @return a player won the game?
  */
  function _callOutNumber (uint8 _number) internal onlyStarted returns (bool) {
      bool prizeOneLine = oneLineWinners.length > 0;

      // find matches in line. Find line winner
      for (uint8 line = 0; line < 3; line++) {
          address[] memory lineMatches = lines[line][_number];

          for (uint8 m = 0; m < lineMatches.length; m++) {
              address matchedAddress = lineMatches[m];
             
              // if line is full 
              if (++counterLines[line][matchedAddress] == 5) {
                  if (!prizeOneLine) {
                      oneLineWinners.push(matchedAddress);
                      emit OneLineWinner(matchedAddress, _number);
                  }
                  counter[matchedAddress]++;
                 
                  // check if card is full too 
                  // remember the counter = 1 to check if address is registered
                  if (counter[matchedAddress] == 4) {
                      // WINNER!!
                      fullHouseWinners.push(matchedAddress);
                      emit FullHouseWinner(matchedAddress, _number);
                  }
              }
          }
      }

      // Return true if there was a winner
      return fullHouseWinners.length > 0;
  }

  /* Draw numbers from the ball pool
  * The number is generated pseudorandomly internally
  * British bingo has 90 balls
  */
  function _drawGameNumbers () internal onlyStarted {
      updateSeed(abi.encode(seed));
      uint8[90] memory draws;

      // make a sequence to avoid repetitions
      for (uint8 i = 0; i < 90; i++) {
          draws[i] = i;
      }

      // randomly permute a sequence of 90 numbers (Fisher-Yates)
      for (uint8 i = 0; i < 90; i++) {
          // number between i (zero-index) and 89
          uint8 number = uint8(uint256(seed) % (90-i) + i);
          
          // swap positions
          uint8 temp = draws[number];
          draws[number] = draws[i];
          draws[i] = temp;

          emit DrawNumber(draws[i]);

          // call out number in position i;
          bool win = _callOutNumber(draws[i]);
          if (win) break;
      }
  }

  /* Draws (pseudo-)random numbers to fill a card
  *  It needs to be 5 per line, cannot be repeated and
  * each line cannot have more than one number in the same decade
  */
  function _drawCardNumbers () private onlyFinished {
      uint8[5][3] memory card;
      uint8[90] memory draws;
      uint8 slotsFilled;

      // make a sequence to avoid repetitions
      for (uint8 i = 0; i < 90; i++) {
          draws[i] = i;
      }

      for (uint8 line = 0; line < 3; line++) {
          bool[9] memory numberInSlot;
          uint8   numbersInLine;

          while (numbersInLine < 5) {
              // number between i (zero-index) and 89
              uint8 number = uint8(uint256(seed) % (90-slotsFilled) + slotsFilled);
              seed = keccak256(abi.encode(seed, number));
                
              // swap positions
              uint8 temp = draws[number];
              draws[number] = draws[slotsFilled];
              draws[slotsFilled] = temp;
              number = draws[slotsFilled];
                
              //seed = keccak256(abi.encode(seed, number));

              uint8 slot = number / 10;
              if (numberInSlot[slot]) continue;
             
              // for event 
              card[line][numbersInLine] = number;

              slotsFilled++;
              numbersInLine++;
              numberInSlot[slot] = true;

              // for storage
              lines[line][number].push(msg.sender);
          }
      }

      emit CardGenerated(card);  
  }

  /* Update seed. Perform hashing inside
  *
  * @param  _seed Input of hash function for new seed
  */
  function updateSeed(bytes memory _seed) private {
      seed = keccak256(_seed);
      emit SeedChanged(seed);
  }

  /* Generate a card for msg.sender
  */
  function generateCard () public payable onlyFinished {
      require(counter[msg.sender] == 0, "Address already subscribed for next play");
      require(msg.value >= cardPrice, "Insufficient funds");
      require(players.length < maxCards, "Registration maxed out");

      // Start with 1 to know if address is registered or not
      counter[msg.sender] = 1;
      timeLastCard = block.number;
      // mix the seed with player's address
      updateSeed(abi.encode(seed,msg.sender));

      _drawCardNumbers();

      players.push(msg.sender);
  }
 
  /* Collect prize of previous runs
  */
  function collectPrize () public onlyFinished{
      uint prize = prizes[msg.sender];
      require (prize > 0, "Nothing to collect");

      delete prizes[msg.sender];

      // calling send function and at the end
      // avoids reentrancy attacks
      payable(msg.sender).transfer(prize);
  } 

  function _resetCards() internal onlyFinished {
     for (uint8 i = 0; i < 90; i++) {
        delete lines[0][i];
        delete lines[1][i];
        delete lines[2][i];
     }  
  }

  function _resetCounters() internal onlyFinished {
      for (uint8 i = 0; i < players.length; i++) {
        address p = players[i];
        counter[p] = 0;
        counterLines[0][p] = 0;
        counterLines[1][p] = 0;
        counterLines[2][p] = 0;
      }
  }

  function _resetWinners() internal onlyFinished {
      delete oneLineWinners;
      delete fullHouseWinners;
  }

  /* Distributes the prizes to the winners of last game
  */
  function _distributePrizes() internal onlyFinished {
      require (players.length > 0, "No players to distribute prizes");
      uint totalPrize = players.length*cardPrice;
      // 30% goes to One Line Winners
      uint oneLinePrize = totalPrize*3/10/oneLineWinners.length;
      // 70% goes to Full House Winners    
      uint fullHousePrize = totalPrize*7/10/fullHouseWinners.length;

      for (uint8 i = 0; i < oneLineWinners.length; i++) {
          prizes[oneLineWinners[i]] += oneLinePrize;
      } 
      
      for (uint8 i = 0; i < fullHouseWinners.length; i++) {
          prizes[fullHouseWinners[i]] += fullHousePrize;
      } 
  }

  /* A reset after the game is finished
  */
  function _reset() internal onlyFinished {
      _resetCards();
      _resetCounters();
      _resetWinners();
      // no need to keep players anymore
      delete players;
  }

  /* Distributes the prizes and resets the game
  */
  function endGame() public onlyStarted {
      state = State.finished;

      _distributePrizes();

      _reset();
  }

  /* Checks if game can start and draws numbers
  */
  function startGame() public onlyFinished {
      require (players.length > 0, "No players subscribed");
      require ((block.number > timeLastCard + timeOut) || (players.length == maxCards), "Game cannot start yet");
      
      state = State.started;

      // draw numbers until there is a winner
      if (fullHouseWinners.length == 0)
          _drawGameNumbers();
  }

  /* NOT USED: Force reset during a gameplay
  * Stakers are redistributed to players
  */
  function forceReset() public onlyAdmin onlyStarted {
      // redistribute stakes to players
      for (uint8 i = 0; i < players.length; i++) {
          address p = players[i];
          prizes[p] += cardPrice;
      }

      state = State.finished;

      // it's ok to do the soft reset now
      _reset();
  } 
}

