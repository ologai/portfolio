// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

// Uncomment this line to use console.log
//import "hardhat/console.sol";


library MyMath {
    uint public constant MIN_EXP = 1;
    uint public constant MAX_EXP = 10**18;
    uint constant ONE = 10**18;
    uint constant PRECISION = 10**7;

    error BaseOutOfBounds();

	function ntoi(uint _n) internal pure returns (uint) {
		return _n/ONE;
	}

	function floor(uint _n) internal pure returns (uint) {
		return ntoi(_n)*ONE;
	}

    function subSign(uint a, uint b)
        internal pure
        returns (uint, bool)
    {
        if (a >= b) {
            return (a - b, false);
        } else {
            return (b - a, true);
        }
    }

    /*
		x ^ y = x ^ (n.f) = x ^ (n + 0.f) = x ^ n * x ^ 0.f
    */
	function pow (uint _x, uint _y) internal pure returns (uint) {
		uint n = ntoi(_y);
		uint f;
		uint res;

		if (n > 0)
			res = powi(_x, n);
		else
            res = ONE;
		f = _y - n*ONE;

        if (f > 0)
            res = res*powf(_x, f)/ONE;

        return res;
    }

    // DSMath.rpow
	function powi (uint _x, uint _n) internal pure returns (uint) {
        uint z = _n % 2 != 0 ? _x : ONE;

        for (_n /= 2; _n != 0; _n /= 2) {
            _x = _x*_x / ONE;

            if (_n % 2 != 0) {
                z = z*_x/ONE;
            }
        }
        return z;
    }

    // From Balancer code
    // based on Taylor series of (1+x)^a
    // did some Gas optimizations
    function powf(uint base, uint exp)
        internal pure
        returns (uint)
    {
        // term 0:
        uint a     = exp;
        (uint x, bool xneg)  = subSign(base, ONE);
        uint term = ONE;
        uint sum   = term;
        bool negative = false;
        uint bigK;


        // term(k) = numer / denom
        //         = (product(a - i - 1, i=1-->k) * x^k) / (k!)
        // each iteration, multiply previous term by (a-(k-1)) * x / k
        // continue until term is less than precision
        for (uint i = 1; term >= PRECISION; i++) {
            (uint c, bool cneg) = subSign(a, bigK);
            bigK += ONE;
            term = term * c / ONE * x / bigK;
            if (term == 0) break;


            if (xneg) negative = !negative;
            if (cneg) negative = !negative;
            if (negative) {
                sum = sum - term;
            } else {
                sum = sum + term;
            }
        }

        return sum;
    }
}

using MyMath for uint;

/*
 Improvements to contract:
 - There could be a receipt token for composability.
 - Swaps could have a max slippage (or min amount received/max amount paid) argument
 - Could get away with using balance in token instead of storing in the contract
 */

contract Pool {

    error AdminOnly();
    error FactoryOnly();
    error InvalidPool();
    error InvalidFee(uint fee);
    error InvalidToken(address token);

    uint constant ONE = 10**18;

    modifier onlyAdmin {
        if (msg.sender != admin) revert AdminOnly();
        _;
    }
    modifier onlyFactory {
        if (msg.sender != factory) revert FactoryOnly();
        _;
    }

    struct StPool {
        uint weight;
        uint balance;   // could use balance from token itself
    }

    address public admin;
    address public factory;
    // swap fee
    uint public fee;
    mapping (address => StPool) public tokens;
    address[] public tokenList;

    /*
    *   @param _fee New swap fee
    */
    function setFee(uint _fee) public onlyAdmin {
        if (_fee >= ONE) revert InvalidFee(_fee);
        fee = _fee;
    }

    function getTokenCount() public view returns (uint) {
        return tokenList.length;
    }

    function removeToken(uint _idx) internal {
        address add = tokenList[_idx];
        delete tokens[add];
        tokenList[_idx] = tokenList[tokenList.length-1];
        tokenList.pop();
    }

    function getIndex(address _add) public view returns (uint) {
        for (uint i = 0; i < tokenList.length; i++) {
            if (tokenList[i] == _add) return i;
        }
        // if not found, return out of bounds index
        return tokenList.length;
    }

    /*
    * sP = spotPrice
    * bI = tkIn.balance                  ( bI / wI )         1
    * bO = tkOut.balance           sP =  -----------  *  ----------
    * wI = tkIn.weight                   ( bO / wO )     ( 1 - sF )
    * wO = tkOut.weight
    * sF = swapFee
    *   @param tkIn the input token
    *   @param tkOut the output token
    *   @param fee fee in percentage
    */
    function getPrice(StPool memory _tkIn, StPool memory _tkOut, uint _fee) public pure returns (uint) {
        if (_fee >= ONE ) revert InvalidFee(_fee);
        return ONE * _tkIn.balance / _tkIn.weight * _tkOut.weight / _tkOut.balance * ONE / (ONE - _fee);
    }

    /*
    * from Balancer code
    * Ratio of weights that result in integers simplify the math a lot.
    * In this case, we accept arbitrary ratios
    * aO = outAmount
    * bO = tkOut.balance
    * bI = tkIn.balance              /      /            bI             \    (wI / wO) \
    * aI = inAmount       aO = bO * |  1 - | --------------------------  | ^            |
    * wI = tkin.weight               \      \ ( bI + ( aI * ( 1 - sF )) /              /
    * wO = tkOut.weight
    * sF = swapFee
    *   @param tkIn the input token
    *   @param tkOut the output token
    *   @param inAmount amount of tkIn
    *   @param fee fee in percentage
    */
    function getOutAmount(StPool memory _tkIn, StPool memory _tkOut, uint _inAmount, uint _fee) public pure returns (uint) {

        uint weightRatio    = ONE*_tkIn.weight/_tkOut.weight;
        uint adjustedIn     = _inAmount * (ONE - _fee) / ONE;
        uint y              = ONE * _tkIn.balance / (_tkIn.balance + adjustedIn);
        y                   = ONE - y.pow(weightRatio);
        return                _tkOut.balance*y/ONE;
    }

    /*
    * from Balancer code
    * Ratio of weights that result in integers simplify the math a lot.
    * In this case, we accept arbitrary ratios
    * aI = inAmount
    * bO = tkOut.balance                 /  /     bO      \    (wO / wI)      \
    * bI = tkIn.balance            bI * |  | ------------  | ^            - 1  |
    * aO = outAmount         aI =        \  \ ( bO - aO ) /                   /
    * wI = tkIn.weight             --------------------------------------------
    * wO = tkOut.weight                            ( 1 - sF )
    * sF = swapFee
    *   @param tkIn the input token
    *   @param tkOut the output token
    *   @param outAmount amount of tkIn
    *   @param fee fee in percentage
    */
    function getInAmount(StPool memory _tkIn, StPool memory _tkOut, uint _outAmount, uint _fee) public pure returns (uint) {
        uint weightRatio    = ONE * _tkOut.weight / _tkIn.weight;
        uint diff           = _tkOut.balance - _outAmount;
        uint y              = ONE * _tkOut.balance / diff;
        uint foo            = y.pow(weightRatio) - ONE;
        uint denom          = ONE - _fee;
        return              _tkIn.balance * foo / denom;

    }

    function swap(address _addIn, address _addOut, uint _inAmount, uint _outAmount) public {
        // it's a reference to update the values
        StPool storage tkIn = tokens[_addIn];
        StPool storage tkOut = tokens[_addOut];

        if (_outAmount == 0) {
            _outAmount = getOutAmount(tkIn, tkOut, _inAmount, fee);
        } else {
            _inAmount = getInAmount(tkIn, tkOut, _outAmount, fee);
        }

        tkIn.balance += _inAmount;
        tkOut.balance -= _outAmount;


        // transfer tokens
        IERC20(_addIn).transferFrom(msg.sender, address(this), _inAmount);
        IERC20(_addOut).transfer(msg.sender, _outAmount);
    }

    /*
    *   @param _tk          token to be added
    *   @param _amount      amount to be added
    *   @param _tkRef       reference token to get price
    *   @param _priceRef    1 (_tk) = _priceRef (_tkRef)
    */
    function addToken(address _tk, uint _amount, address _tkRef, uint _priceRef) public onlyAdmin {
        if (tokenList.length < 2) revert InvalidPool();

        /*
        *   OLD state
        *   weight  WX  WY    (WX + WY = 1)
        *   balance BX  BY
        *
        *   NEW state
        *   weight  WX'  WY'  WZ'  (WX' + WY' + WZ' = 1)
        *   balance BX   BY   BZ
        *
        *   _priceRef = (BZ/BY)*(WZ/WY)
        *   WZ = (BZ/BY)*WY*_priceRef
        *   WX' = WX/(WX + WY + WZ) = WX/(1 + WZ)
        *   WY' = WY/(WX + WY + WZ) = WY/(1 + WZ)
        *   WZ' = WZ/(WX + WY + WZ) = WZ/(1 + WZ)
        */

        uint tkWeight;
        if (tokens[_tk].balance == 0) {
            // New token
            if (tokens[_tkRef].weight == 0) revert InvalidToken(_tkRef);

            tkWeight   = _priceRef*_amount/tokens[_tkRef].balance*tokens[_tkRef].weight/ONE;

            tokens[_tk] = StPool({
                balance : _amount,
                weight: tkWeight
            });

            tokenList.push(_tk);
        } else {
            // if token already exists, weight is easier to calculate
            tkWeight   = _amount*tokens[_tk].weight/tokens[_tk].balance;
            // but it still needs to be a integer ratio of weights. Get other token for reference
            _tkRef = (tokenList[0] == _tk) ? tokenList[1]: tokenList[0];
            uint proposedWeight = tkWeight + tokens[_tk].weight;

            tokens[_tk].balance = _amount + tokens[_tk].balance;
            tokens[_tk].weight  = proposedWeight ;
        }

        // if new amount has X weight, then current weights must be scale by 1/(1 + X)
        for (uint i = 0; i < tokenList.length; i++) {
            address add = tokenList[i];
            tokens[add].weight = ONE*tokens[add].weight/(ONE + tkWeight);
        }

        IERC20(_tk).transferFrom(msg.sender, address(this), _amount);
    }

    function withdrawToken(address _tk, uint _amount) public onlyAdmin {
        /*
        *   OLD state
        *   weight  WX  WY    (WX + WY = 1)
        *   balance BX  BY
        *
        *   NEW state
        *   weight  WX'  WY'  (WX' + WY'= 1)
        *   balance BX   BY
        *
        *   _priceRef = (BZ/BY)*(WZ/WY)
        *   WZ = (BZ/BY)*WY*_priceRef
        *   WX' = WX/(WX + WY) = WX/(1 + WZ)
        *   WY' = WY/(WX + WY) = WY/(1 + WZ)
        */
        // it's a reference to update the values

        StPool storage tk = tokens[_tk];
        if (tk.balance < _amount) _amount == tk.balance;
        bool _removeToken = (_amount == tk.balance);
        /*
        * if total weight was 1, and token weight was X, now:
        * token weight is Y = X*(tk.balance - amount)/(tk.balance);
        * and total weight 1 - X + Y
        */
        uint tkWeight   = tokens[_tk].weight*_amount/tk.balance;
        tokens[_tk].weight -= tkWeight;

        // adjust the weights of all tokens
        uint idx;
        for (uint i = 0; i < tokenList.length; i++) {
            address add = tokenList[i];
            if (add == _tk) {
                idx = i;
            }
            tokens[add].weight = ONE*tokens[add].weight/(ONE - tkWeight);
        }

        // Remove token from list if balance is zero
        if (_removeToken) {
            if (tokenList.length == 2) revert InvalidPool();
            removeToken(idx);
        } else {
            tk.balance -= _amount;
        }
        IERC20(_tk).transfer(admin, _amount);
    }

    function endPool() public onlyFactory {
        for (uint i = 0; i < tokenList.length; i++) {
            address tk = tokenList[i];
            IERC20(tk).transferFrom(address(this), admin, tokens[tk].balance);
        }
    }

    function startPool (address _tk1, address _tk2, StPool memory _tk1Info, StPool memory _tk2Info) public onlyAdmin {
        if (tokenList.length > 0) revert InvalidPool();

        tokenList.push(_tk1);
        tokenList.push(_tk2);
        tokens[_tk1] = _tk1Info;
        tokens[_tk2] = _tk2Info;

        IERC20(_tk1).transferFrom(msg.sender, address(this), _tk1Info.balance);
        IERC20(_tk2).transferFrom(msg.sender, address(this), _tk2Info.balance);
    }

    constructor(address _owner) {
        admin = _owner;
        factory = msg.sender;
        fee = 3*10**15; // default = 0.3%
    }

}
