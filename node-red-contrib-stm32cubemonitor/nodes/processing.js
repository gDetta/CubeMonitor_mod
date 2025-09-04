/*!
 * module node-red-contrib-stm32cubemonitor
 * Copyright(c) 2019 STMicroelectronics
 */
/**
 * Export the node to node-RED .
 * @param {*} RED  - Node-RED context.
 */
module.exports = function (RED) {
  "use strict";

  var path = require("path");
  const homedir = require("os").homedir();
  const logger = RED.log;
  const { fork } = require("child_process");
  var validation = require(path.join(__dirname, "validation.js"));

  /**
   * Main function to register processing node.
   *
   * @param {*} config - Object holding configuration parameters.
   */
  function processing(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.config = config;
    node.computeData = fork(path.join(__dirname, "computeData.js"));
    node.computeData.on("message", (msg) => {
      switch (msg.topic) {
        case "data":
          for (let i = 0; i < msg.data.length; i++) {
            node.send([msg.data[i], null]);
          }
          break;
        case "status":
          node.status(msg.status);
          break;
        case "error":
        case "warning":
          node.send([null, { topic: msg.topic, data: msg.data }]);
          break;
      }
    });

    /**
     * Main function called after start of all nodes ( event 'nodes-started").
     * Objective is to be sure that all nodes are available.
     *
     */
    var handler = function () {
      RED.events.setMaxListeners(RED.events.getMaxListeners() - 1);
      let linkedVariableNode = RED.nodes.getNode(node.config.groupid);
      if (!linkedVariableNode) {
        //managing case of flow import leads to new IDs
        RED.nodes.eachNode((element) => {
          if (
            element.type === "variables" &&
            element.groupname === node.config.groupname
          ) {
            linkedVariableNode = element;
          }
        });
      }
      let variableList =
        linkedVariableNode && linkedVariableNode.variablelist
          ? linkedVariableNode.variablelist
          : [];

      let selectedConfigVariables =
        linkedVariableNode && linkedVariableNode.execonfig
          ? RED.nodes
              .getNode(linkedVariableNode.execonfig)
              .variablelist.filter((elem) => elem.checked)
          : [];
      // Remove from manual variablelist variable having the same name than the ones imported
      variableList = variableList.filter((elem) => {
        return (
          selectedConfigVariables.findIndex((i) => i.name === elem.name) === -1
        );
      });

      node.config.variables =
        variableList.concat(selectedConfigVariables) || [];

      node.computeData.send({
        topic: "initialize",
        config: node.config,
        directory: RED.settings.logpath || homedir,
        linkedVariableNode: linkedVariableNode
      });
    };

    node.on("input", function (msg) {
      if (!node.computeData.killed && msg.topic === "stop") {
        node.computeData.send({ topic: "stop" });
      } else if (!node.computeData.killed && msg.topic === "clear") {
        node.computeData.send({ topic: "clear" });
      } else if (
        !node.computeData.killed &&
        msg.payload.groupname === node.config.groupname
      ) {
        if (msg.payload.first) {
          let initMsg = [];
          for (let i = 0; i < node.config.variables.length; i++) {
            initMsg.push({
              topic: "data",
              payload: {
                groupname: node.config.groupname,
                variablename: node.config.variables[i].name,
                variabledata: [{ x: msg.payload.data[0][0].x }]
              }
            });
          }
          let i = 0,
            j = 0;
          while (
            i < node.config.expressions.length ||
            j < node.config.statistics.length
          ) {
            let exp = node.config.expressions[i];
            let stat = node.config.statistics[j];

            let expIndex = exp ? Number(exp.index) : Number.POSITIVE_INFINITY;
            let statIndex = stat
              ? Number(stat.index)
              : Number.POSITIVE_INFINITY;

            if (expIndex < statIndex) {
              initMsg.push({
                topic: "data",
                payload: {
                  groupname: node.config.groupname,
                  variablename: exp.name,
                  variabledata: [{ x: msg.payload.data[0][0].x }]
                }
              });
              i++;
            } else {
              initMsg.push({
                topic: "data",
                payload: {
                  groupname: node.config.groupname,
                  variablename: stat.name,
                  variabledata: [{ x: msg.payload.data[0][0].x }]
                }
              });
              j++;
            }
          }
          node.send([initMsg, null]);
        }
        node.computeData.send({
          topic: "input",
          data: msg
        });
      }
    });

    RED.events.setMaxListeners(RED.events.getMaxListeners() + 1);

    node.on("close", function (done) {
      RED.events.removeListener("flows:started", handler);
      node.computeData.on("exit", () => {
        done();
      });
      node.computeData.kill();
    });

    RED.events.on("flows:started", handler);
  }
  RED.nodes.registerType("processing", processing);

  RED.httpAdmin.post(
    "/validateexpression",
    RED.auth.needsPermission("exe-config.write"),
    function (req, res) {
      var variables = JSON.parse(req.body.var);
      var statistics = JSON.parse(req.body.stat);
      const result = validation.validateExpression(
        variables,
        statistics,
        req.body.exp
      );
      res.send(result);
    }
  );

  RED.httpAdmin.get("/images/*", function (req, res) {
    var filename = path.join(__dirname, "images", req.params[0]);
    res.sendFile(filename, function (err) {
      if (err) {
        logger.error(filename + " not found. Maybe running in dev mode.");
      }
    });
  });
};
