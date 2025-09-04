/*!
 * module node-red-contrib-stm32cubemonitor
 * Copyright(c) 2019 STMicroelectronics
 */
const { fork } = require("child_process");
const TRIGGER_OFF = "manual";
const TRIGGER_RISING = "rising-edge";
const TRIGGER_FALLING = "falling-edge";
const ACQ_DIRECT = "direct";
var path = require("path");
let newValues = [];
let node = {};
let timer = null;
const variablesPrefix = "CubeMonitor_Variable";
const math = require("./bitwise.js").math;
var validation = require(path.join(__dirname, "validation.js"));

/*
const create = require("mathjs").create;
const all = require("mathjs").all;
const math = create(all);

math.import({
  readBit_n: (a, n) => {
    return a & (1 << n);
  },
  setTo0Bit_n: (a, n) => {
    return a & ~(1 << n);
  },
  setTo1Bit_n: (a, n) => {
    return a | (1 << n);
  }
});*/

process.on("message", (msg) => {
  switch (msg.topic) {
    case "initialize":
      initialize(msg.config, msg.directory, msg.linkedVariableNode);
      break;
    case "input":
      newInput(msg.data);
      break;
    case "stop":
      if (node.logmode != "no") {
        node.logData.send({ topic: msg.topic });
      }
      break;
    case "clear":
      if (node.logmode != "no") {
        node.logData.send({ topic: msg.topic });
      }
      break;
  }
});

/**
 * Function called to initialize.
 *
 * @param {*} config - NodeRed config.
 * @param {*} directory - Log Directory.
 * @param {*} linkedVariableNode -  Attached variables node.
 *
 */
function initialize(config, directory, linkedVariableNode) {
  node.groupname = config.groupname || "";
  node.groupid = config.groupid || "";
  node.variables = config.variables || [];
  node.statistics = config.statistics || [];
  node.expressions = config.expressions || [];
  node.logmode = config.logmode || "no";
  node.logformat = config.logformat || "stcm";
  node.logdirectory = directory;
  node.logData = fork(path.join(__dirname, "logData.js"));
  node.processingOff = false;
  newValues = [];
  node.triggerFilterActivated = false;
  for (let i = 0; i < node.variables.length; i++) {
    newValues.push({
      payload: {
        groupname: node.groupname,
        variabledata: [],
        variablename: node.variables[i].name
      },
      topic: "data"
    });
  }

  for (let i = 0; i < node.statistics.length; i++) {
    /**
     *  Counters for reducing computing time.
     *  Typically:
     *  [0] = number of records
     *  [1] = global sum (required for average and standard deviation)
     *  [2] = global sum of squared values (required for standard deviation).
     */
    node.statistics[i].counter = [0, 0, 0];
    node.statistics[i].data = [];

    node.statistics[i].targetVarIndex = node.variables.findIndex(
      (variable) => variable.name == node.statistics[i].variable
    );
    newValues[node.variables.length + i] = {
      payload: {
        groupname: node.groupname,
        variabledata: [],
        variablename: node.statistics[i].name
      },
      topic: "data"
    };
  }

  for (let i = 0; i < node.expressions.length; i++) {
    node.expressions[i].validation = validation.validateExpression(
      node.variables,
      node.statistics,
      node.expressions[i].formula
    );
    newValues[node.variables.length + node.statistics.length + i] = {
      payload: {
        groupname: node.groupname,
        variabledata: [],
        variablename: node.expressions[i].name
      },
      topic: "data"
    };
  }
  updateStatus(linkedVariableNode);
}

/**
 * Function called to update status of node.
 *
 * @param {*} linkedVariableNode - Attached variables node.
 */
function updateStatus(linkedVariableNode) {
  node.processingOff = false;
  let status = { fill: "green", shape: "dot", text: "processing on" };
  let expressionsNotValid = "";
  for (let i = 0; i < node.expressions.length; i++) {
    if (!node.expressions[i].validation.validation) {
      expressionsNotValid =
        expressionsNotValid + node.expressions[i].name + " ";
    }
  }

  let statisticsNotValid = "";
  for (let i = 0; i < node.statistics.length; i++) {
    if (node.statistics[i].targetVarIndex == -1) {
      statisticsNotValid = statisticsNotValid + node.statistics[i].name + " ";
    }
  }

  if (linkedVariableNode) {
    node.triggerStartMode = linkedVariableNode.triggerstartmode;
    node.acquisitionMode = linkedVariableNode.mode;
    if (node.triggerStartMode !== TRIGGER_OFF) {
      node.triggerName = linkedVariableNode.triggername;
      node.triggerThreshold = linkedVariableNode.triggerthreshold;
      node.triggerIndex = node.variables.findIndex(
        (variable) => variable.name === node.triggerName
      );
      //control if trigger variable is still available in the variable list
      if (node.triggerIndex === -1) {
        node.triggerStartMode = TRIGGER_OFF;
        process.send({
          topic: "error",
          data: {
            topic: "warning",
            data: "trigger variable is not available in the list"
          }
        });
      }
    }

    if (linkedVariableNode.groupname == node.groupname) {
      status = { fill: "green", shape: "dot", text: "processing on" };
    } else {
      status = {
        fill: "yellow",
        shape: "dot",
        text: "processing on but variable node name has been changed"
      };
    }
    if (expressionsNotValid != "" || statisticsNotValid != "") {
      node.processingOff = true;
      status = {
        fill: "red",
        shape: "dot",
        text:
          "processing off - following outputs not valid : " +
          expressionsNotValid +
          statisticsNotValid
      };
    }
  } else {
    node.processingOff = true;
    status = {
      fill: "red",
      shape: "dot",
      text:
        "processing off - " +
        node.groupname +
        " variable node not present or disable"
    };
  }
  process.send({
    topic: "status",
    status: status
  });
}

/**
 * Function called to manage new measure.
 *
 * @param {*} msg - Msg sent by probe.
 */
function newInput(msg) {
  if (!node.processingOff) {
    let groupname = msg.payload.groupname;
    let first = msg.payload.first;
    let evaluateExpression = true;
    if (groupname && groupname === node.groupname) {
      if (
        node.logmode != "no" &&
        node.logdirectory &&
        node.logdirectory != ""
      ) {
        if (first) {
          node.logData.send({
            topic: "initializeLog",
            directory: node.logdirectory,
            groupname: node.groupname,
            logmode: node.logmode,
            logformat: node.logformat,
            variables: node.variables
          });
        }
      }

      if (
        first &&
        node.acquisitionMode === ACQ_DIRECT &&
        node.triggerStartMode !== TRIGGER_OFF
      ) {
        node.triggerFilterActivated = true;
        node.triggerPreviousValue = undefined;
        for (let i = 0; i < newValues.length; i++) {
          newValues[i].payload.variabledata.push({
            x: msg.payload.data[0][0].x
          });
        }

        process.send({
          topic: "data",
          data: newValues
        });

        for (let i = 0; i < newValues.length; i++) {
          newValues[i].payload.variabledata = [];
        }
      }

      if (node.triggerFilterActivated) {
        let triggerCurrentValue = msg.payload.data[node.triggerIndex][0].y;
        if (node.triggerPreviousValue === undefined) {
          node.triggerPreviousValue = triggerCurrentValue;
          return;
        }
        switch (node.triggerStartMode) {
          case TRIGGER_RISING:
            if (
              triggerCurrentValue >= node.triggerThreshold &&
              node.triggerPreviousValue < node.triggerThreshold
            ) {
              node.triggerFilterActivated = false;
            } else {
              node.triggerPreviousValue = triggerCurrentValue;
              return;
            }
            break;
          case TRIGGER_FALLING:
            if (
              triggerCurrentValue <= node.triggerThreshold &&
              node.triggerPreviousValue > node.triggerThreshold
            ) {
              node.triggerFilterActivated = false;
            } else {
              node.triggerPreviousValue = triggerCurrentValue;
              return;
            }
            break;
        }
      }

      if (!timer) {
        timer = setInterval(() => {
          if (newValues[0] && newValues[0].payload.variabledata.length > 0) {
            process.send({
              topic: "data",
              data: newValues
            });

            if (node.logmode != "no") {
              node.logData.send({ topic: "log", data: newValues });
            }
            for (let i = 0; i < newValues.length; i++) {
              newValues[i].payload.variabledata = [];
            }
          } else {
            clearInterval(timer);
            timer = null;
          }
        }, 50);
      }

      let groupdata = msg.payload.data;
      let scope = {};
      for (let i = 0; i < node.variables.length; i++) {
        newValues[i].payload.variabledata.push(groupdata[i][0]);
        if (groupdata[i][0].y != undefined) {
          scope[variablesPrefix + i] = groupdata[i][0].y;
        } else {
          evaluateExpression = false;
        }
      }

      for (let i = 0; i < node.statistics.length; i++) {
        if (node.statistics[i].targetVarIndex != -1 && evaluateExpression) {
          if (first) {
            node.statistics[i].value = undefined;
            node.statistics[i].data = [];
            node.statistics[i].counter = [0, 0, 0];
          }

          let newValue = groupdata[node.statistics[i].targetVarIndex][0].y;
          switch (node.statistics[i].statistic) {
            case "min":
              if (node.statistics[i].scope == "") {
                if (node.statistics[i].value == undefined) {
                  node.statistics[i].value = newValue;
                } else {
                  node.statistics[i].value = math.min(
                    node.statistics[i].value,
                    newValue
                  );
                }
              } else {
                node.statistics[i].data.push(newValue);
                node.statistics[i].data.splice(
                  0,
                  node.statistics[i].data.length - node.statistics[i].scope
                );
                node.statistics[i].value = math.min(node.statistics[i].data);
              }
              break;

            case "max":
              if (node.statistics[i].scope == "") {
                if (node.statistics[i].value == undefined) {
                  node.statistics[i].value = newValue;
                } else {
                  node.statistics[i].value = math.max(
                    node.statistics[i].value,
                    newValue
                  );
                }
              } else {
                node.statistics[i].data.push(newValue);
                node.statistics[i].data.splice(
                  0,
                  node.statistics[i].data.length - node.statistics[i].scope
                );
                node.statistics[i].value = math.max(node.statistics[i].data);
              }

              break;

            case "mean":
              if (node.statistics[i].scope == "") {
                node.statistics[i].counter[0]++;
                node.statistics[i].counter[1] += newValue;
                node.statistics[i].value = math.divide(
                  node.statistics[i].counter[1],
                  node.statistics[i].counter[0]
                );
              } else {
                node.statistics[i].data.push(newValue);
                node.statistics[i].data.splice(
                  0,
                  node.statistics[i].data.length - node.statistics[i].scope
                );
                node.statistics[i].value = math.mean(node.statistics[i].data);
              }
              break;

            case "std":
              if (node.statistics[i].scope == "") {
                node.statistics[i].counter[0]++;
                node.statistics[i].counter[1] += newValue;
                node.statistics[i].counter[2] += newValue * newValue;
                // Standard deviation is the square root of the average of the squared minus the square of the average
                node.statistics[i].value = math.sqrt(
                  node.statistics[i].counter[2] /
                    node.statistics[i].counter[0] -
                    (node.statistics[i].counter[1] *
                      node.statistics[i].counter[1]) /
                      (node.statistics[i].counter[0] *
                        node.statistics[i].counter[0])
                );
                if (typeof node.statistics[i].value !== "number") {
                  //raise an error
                  process.send({
                    topic: "warning",
                    data: "std() result is not a real number"
                  });
                }
              } else {
                node.statistics[i].data.push(newValue);
                node.statistics[i].data.splice(
                  0,
                  node.statistics[i].data.length - node.statistics[i].scope
                );
                node.statistics[i].value = math.std(node.statistics[i].data);
              }
              break;
          }
          let statCalculate = {};
          statCalculate.x = groupdata[node.statistics[i].targetVarIndex][0].x;
          statCalculate.y = node.statistics[i].value;

          newValues[node.variables.length + i].payload.variabledata.push(
            statCalculate
          );
          scope[node.statistics[i].name] = statCalculate.y;
        } else {
          scope[node.statistics[i].name] = null;
        }
      }

      for (let i = 0; i < node.expressions.length; i++) {
        if (node.expressions[i].validation.validation && evaluateExpression) {
          var expCalculate = {};
          expCalculate.x =
            groupdata[node.expressions[i].validation.firstIndex][0].x;
          expCalculate.y = resultOperation(
            node.expressions[i].validation.expression,
            scope
          );
          if (typeof expCalculate.y !== "number") {
            //raise an error
            process.send({
              topic: "warning",
              data: "expression result is not a real number"
            });
          }
          newValues[
            node.variables.length + node.statistics.length + i
          ].payload.variabledata.push(expCalculate);
        }
      }
    }
  }

  /**
   * Function called to check if formula contains bitWise opérations.
   *
   * @param {*} formula - Formula to be analysed.
   */
  function checkBitWiseFormula(formula) {
    let bitWise = ["&", "|", "^|", "~", "<<", ">>"];

    /**
     * This function true is bitwisee operator is present in formula.
     *
     *  @param {*} element - Expression to check.
     */ const isBitWise = (element) => formula.indexOf(element) != -1;

    return bitWise.some(isBitWise);
  }

  /**
   * Function called to check if formula contains shift  opérations.
   *
   * @param {*} formula - Formula to be analysed.
   */
  function checkBitWiseRLshFormula(formula) {
    let bitWise = ["<<", ">>"];

    /**
     * This function return true is a shif operator is present in formula.
     *
     *  @param {*} element - Expression to check.
     */ const isBitWise = (element) => formula.indexOf(element) != -1;

    return bitWise.some(isBitWise);
  }

  /**
   * Function called to check if scope contains value superior to 31Bits.
   *
   * @param {*} scope - Scope to be analysed.
   */
  function checkSuperiorTo31Bits(scope) {
    const valMax = 0x80000000;

    /**
     * This function return true if a value is superior to valMax.
     *
     *  @param {*} element - Expression to check.
     */ const isSuperior = (element) => element >= valMax;

    return Object.values(scope).some(isSuperior);
  }

  /**
   * Function called to choose the right operation to be done.
   *
   * @param {*} formula - Formula to be analysed.
   * @param {*} scope - Scope to be analysed.
   */ function resultOperation(formula, scope) {
    if (!checkBitWiseFormula(formula)) {
      return math.evaluate(formula, scope);
    } else {
      if (!checkSuperiorTo31Bits(scope)) {
        return math.evaluate(formula, scope);
      } else {
        if (!checkBitWiseRLshFormula(formula)) {
          return bitWiseOperation(formula, scope);
        } else {
          return operationShift(formula, scope);
        }
      }
    }
  }

  /**
   * Function called to evaluate bitWise case (without shift).
   *
   * @param {*} formula - Formula to be analysed.
   * @param {*} scope - Scope to be analysed.
   */ function bitWiseOperation(formula, scope) {
    const FFFF = 0xffff;
    const FFFFplus1 = 0xffff + 1;

    let expCalculateHI = {};
    let expCalculateLO = {};

    let scopeHI = {};
    let scopeLO = {};
    for (const prop in scope) {
      scopeHI[prop] = Math.trunc(scope[prop] / FFFF);
      scopeLO[prop] = scope[prop] - scopeHI[prop] * FFFFplus1;
    }
    expCalculateHI.y = math.evaluate(formula, scopeHI);
    expCalculateLO.y = math.evaluate(formula, scopeLO);
    return expCalculateHI.y * FFFFplus1 + expCalculateLO.y;
  }

  /**
   * Function called to evaluate bitWise case with shift.
   *
   * @param {*} formula - Formula to be analysed.
   * @param {*} scope - Scope to be analysed.
   */ function operationShift(formula, scope) {
    let valueToShift = "";
    let shifterValue;
    let shifter = "";
    let shifted = "";

    if (formula.indexOf("<<") != -1) {
      valueToShift = formula.slice(0, formula.indexOf("<<")).replace(/ /g, "");
      shifter = formula.slice(formula.indexOf("<<") + 2).replace(/ /g, "");
    }
    if (formula.indexOf(">>") != -1) {
      valueToShift = formula.slice(0, formula.indexOf(">>")).replace(/ /g, "");
      shifter = formula.slice(formula.indexOf(">>") + 2).replace(/ /g, "");
    }

    for (const prop in scope) {
      if (prop == valueToShift) {
        valueToShift = scope[prop].toString(2);
      }
      if (prop == shifter) {
        shifterValue = parseInt(scope[prop]);
      }
    }

    if (formula.indexOf(">>") != -1) {
      shifted = valueToShift.slice(0, valueToShift.length - shifterValue);
      return parseInt(shifted, 2);
    }

    if (formula.indexOf("<<") != -1) {
      const ttz = "00000000000000000000000000000000";
      shifted = valueToShift + ttz.slice(0, shifterValue);
      return parseInt(shifted, 2);
    }
  }
}
