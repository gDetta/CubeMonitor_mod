/*!
 * module node-red-contrib-stm32cubemonitor
 * Copyright(c) 2019 STMicroelectronics
 */
/**
 * Function called to validate expressions entered by user.
 *
 * @param {*} variables - Table of variables managed by the processing node.
 * @param {*} statistics - Table of statistics managed by the processing node.
 * @param {*} expression - Expression string to validate.
 */
exports.validateExpression = function (variables, statistics, expression) {
  const variablesPrefix = "CubeMonitor_Variable";

  const math = require("./bitwise.js").math;

  //Sort variables by size to avoid issue during replacement
  let modifiedOrderVariables = variables.slice();
  modifiedOrderVariables.sort(function (a, b) {
    return b.name.length - a.name.length;
  });

  //Replace variables names by safe naming and create scopes with different values
  let modifiedexpression = expression;
  let firstIndex;
  let scope1 = {};
  let scope2 = {};

  for (let i = 0; i < modifiedOrderVariables.length; i++) {
    let variableIndex = variables.findIndex(
      (element) => element.name === modifiedOrderVariables[i].name
    );

    let safeName = variablesPrefix + variableIndex;
    modifiedexpression = modifiedexpression
      .split(modifiedOrderVariables[i].name)
      .join(safeName);

    if (firstIndex == undefined && modifiedexpression.includes(safeName)) {
      firstIndex = variableIndex;
    }

    scope1[safeName] = 1;
    scope2[safeName] = Math.random();
  }
  for (let i = 0; i < statistics.length; i++) {
    scope1[statistics[i].name] = 1;
    scope2[statistics[i].name] = Math.random();
    if (
      firstIndex == undefined &&
      modifiedexpression.includes(statistics[i].name)
    ) {
      let statIndex = variables.findIndex(
        (variable) => variable.name == statistics[i].variable
      );
      if (statIndex != -1) {
        firstIndex = statIndex;
      }
    }
  }
  //Test expression
  try {
    math.evaluate(modifiedexpression, scope1);
  } catch (Error) {
    try {
      math.evaluate(modifiedexpression, scope2);
    } catch (Error) {
      return { validation: false, error: Error.message };
    }
  }
  return {
    validation: true,
    expression: modifiedexpression,
    firstIndex: firstIndex || 0
  };
};
