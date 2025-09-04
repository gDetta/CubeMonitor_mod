const create = require("mathjs").create;
const all = require("mathjs").all;
const math = create(all);

math.import({
  /**
   * Fonction to check is a bit is set in a value (ie register).
   * @param {number} a - Value.
   * @param {number} n - Bit position.
   */
  readBit_n: (a, n) => {
    if ((a & (1 << n)) != 0) return 1;
    else return 0;
  },
  /**
   * Fonction to reset a bit in a value (ie register).
   * @param {number} a - Value.
   * @param {number} n - Bit position.
   */
  setTo0Bit_n: (a, n) => {
    return (a & ~(1 << n)) >>> 0;
  },
  /**
   * Fonction to set a bit in a value (ie register).
   * @param {number} a - Value.
   * @param {number} n - Bit position.
   */
  setTo1Bit_n: (a, n) => {
    return (a | (1 << n)) >>> 0;
  }
});

exports.math = math;
