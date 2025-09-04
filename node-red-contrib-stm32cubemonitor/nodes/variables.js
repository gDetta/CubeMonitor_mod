/*!
 * module node-red-contrib-stm32cubemonitor
 * Copyright(c) 2019 STMicroelectronics
 */
const path = require("path");
const fs = require("fs");

/**
 * Export the node to node-RED .
 * @param {*} RED  - Node-RED context.
 */
module.exports = function (RED) {
  "use strict";
  var ElfParser = require("@stm32/stm32cubemonitor-elfparser").ElfParser;
  const logger = RED.log;
  let progressStatus = 0;

  /**
   * Function to check if symbols of old list are unchanged in new list.
   *
   * @param {*} oldL - The old list.
   * @param {*} newL  - The new list.
   * @returns {*} The list of symbols missing or changed in new list.
   */
  function compareList(oldL, newL) {
    let difference = oldL.filter((oldSymbol) => {
      let test = newL.find(
        (newSymbol) =>
          oldSymbol.name === newSymbol.name &&
          oldSymbol.address === newSymbol.address &&
          oldSymbol.type === newSymbol.type
      );
      return test === undefined;
    });
    return difference;
  }

  /**
   * Main function to register variables node.
   *
   * @param {*} config - Object holding configuration parameters.
   */
  function initVariables(config) {
    RED.nodes.createNode(this, config);
    this.execonfig = config.execonfig || "";
    this.execonfiguration = RED.nodes.getNode(this.execonfig);
    let node = this;
    this.groupname = config.groupname;
    this.variablelist = config.variablelist || [];
    this.variablelist.forEach((v) => {
      v.type = Number(v.type);
    });
    this.mode = config.mode || "direct";
    this.snapshotheader = config.snapshotheader || "";
    this.triggerstartmode = config.triggerstartmode || "manual";
    this.triggername = config.triggername || "";
    this.triggerthreshold = config.triggerthreshold || "";
    config.frequencyType = config.frequencyType || "0";
    this.frequency = Number.parseFloat(
      config.frequencyType === "custom"
        ? RED.util.evaluateNodeProperty(
            config.frequency,
            config.frequencyType,
            this
          )
        : config.frequencyType
    );

    let imported = node.execonfig
      ? RED.nodes
          .getNode(node.execonfig)
          .variablelist.filter((elem) => elem.checked)
      : [];
    // Remove from manual variablelist variable having the same name than the ones imported
    this.variablelist = this.variablelist.filter((elem) => {
      return imported.findIndex((i) => i.name === elem.name) === -1;
    });
    this.fullVariableList = this.variablelist.concat(imported);
    this.accesspoint = Number.parseInt(config.accesspoint) || 0;
    if (
      config.frequencyType !== "custom" ||
      (config.frequencyType === "custom" && this.frequency > 0)
    ) {
      let status = this.mode;
      let color = "green";
      if (this.triggerstartmode !== "manual") {
        const found = this.fullVariableList.findIndex(
          (elem) => elem.name === node.triggername
        );
        if (
          found === -1 ||
          this.triggerthreshold.length === 0 ||
          isNaN(Number(this.triggerthreshold))
        ) {
          this.triggerstartmode = "manual";
          status += " - invalid trigger";
          color = "red";
        } else {
          status += " - trigger enable";
        }
      }

      node.status({ fill: color, shape: "dot", text: status });

      node.on("input", function (msg) {
        var param = {};
        let msgWarning = {};

        param.groupname = node.groupname;
        param.variablelist = node.fullVariableList;
        param.mode = node.mode;
        param.snapshotheader = node.snapshotheader;
        param.triggerstartmode = node.triggerstartmode;
        param.triggername = node.triggername;
        param.triggerthreshold = node.triggerthreshold;
        param.frequency = node.frequency;
        param.accesspoint = node.accesspoint;
        param.exefile = node.execonfiguration
          ? node.execonfiguration.exefile
          : "";
        msg.payload = param;

        if (msg.topic == "start") {
          const changedConfig = execonfigPool.getChange(this.execonfig);
          if (changedConfig === true) {
            execonfigPool.getNewListVariables(
              this.execonfig,
              function (newList) {
                let listComparison = compareList(
                  param.variablelist,
                  newList.list
                );
                let listComparisonLight = "";
                for (let i = 0; i < listComparison.length; i++) {
                  listComparisonLight =
                    listComparisonLight +
                    JSON.stringify(listComparison[i].name) +
                    "@" +
                    JSON.stringify(listComparison[i].address) +
                    "; ";
                }
                if (listComparison != "") {
                  msgWarning.topic =
                    " Warning : Change detected in symbol file.";
                  msgWarning.payload =
                    'Please update the variable list in "' +
                    param.groupname +
                    '" and redeploy the flow. Variable(s) added/modified: ' +
                    listComparisonLight;
                  let msg1 = [null, msgWarning];
                  node.send(msg1);
                } /*else {
                  msgWarning.topic = "Warning";
                  msgWarning.payload = "Symbol file has been modified";
                  let msg1 = [null, msgWarning];
                  node.send(msg1);
                }*/
              }
            );
          }
        }
        node.send(msg);
      });
    } else {
      logger.error(
        "Sampling frequency not correctly set for '" +
          node.groupname +
          "' variable node "
      );
      node.status({
        fill: "red",
        shape: "dot",
        text: "off - invalid frequency"
      });
    }
  }
  RED.nodes.registerType("variables", initVariables);

  /**
   * Main function to register exe-config node.
   *
   * @param {*} n - Object holding configuration parameters.
   */
  function execonfig(n) {
    RED.nodes.createNode(this, n);
    this.exefile = n.exefile;
    this.exefolder = n.exefolder;
    this.fullpathname = n.fullpathname;
    this.exeModifiedTime = n.exeModifiedTime;
    this.variablelist = n.exevariablelist;
    this.configLastUpdate = n.configLastUpdate;
  }
  RED.nodes.registerType("exe-config", execonfig);

  let execonfigPool = (function () {
    return {
      /**
       * Function getChange.
       * @param {*} execonfig - The config node.
       * @returns {string} Returns true if file has changed.
       */
      getChange: function (execonfig) {
        if (execonfig === "" || execonfig === undefined) {
          return false;
        }
        this.execonfiguration = RED.nodes.getNode(execonfig);
        if (
          this.execonfiguration === undefined ||
          this.execonfiguration.exefile === undefined
        ) {
          return false;
        }
        let currentTime = 0;
        try {
          currentTime = fs
            .statSync(this.execonfiguration.exefile)
            .mtime.getTime();
        } catch (err) {
          // file do not exist anymore
          return true;
        }
        if (currentTime == this.execonfiguration.exeModifiedTime) return false;
        else return true;
      },
      /**
       * GetNewListVariables.
       * @param {*} execonfig - The config node.
       * @param {*} callback - Call back with parsed variable.
       */
      getNewListVariables: function (execonfig, callback) {
        this.execonfiguration = RED.nodes.getNode(execonfig);
        const expand = "true";
        let elfParser = new ElfParser();
        // progressStatus = 0;
        elfParser.readElf(
          this.execonfiguration.exefile,
          (list) => {
            callback({ list });
          },
          expand
        );
      }
    };
  })();

  /**
   * Service to return the list of exe files (with extensions .elf, .out or .axf).
   *
   * @param {string} currentDirPath - Current directory.
   * @param {Function} callback - Callback called for each exe file.
   */
  function walkSync(currentDirPath, callback) {
    try {
      var files = fs.readdirSync(currentDirPath, { withFileTypes: true });
      files.forEach(function (file) {
        if (file.isFile()) {
          var name = file.name;
          var filePath = path.join(currentDirPath, name);
          if (
            path.extname(name) === ".elf" ||
            path.extname(name) === ".out" ||
            path.extname(name) === ".axf"
          ) {
            callback(filePath, name);
          }
        }
      });
    } catch (e) {
      // Handle error
      logger.warn(currentDirPath + " path does not exist");
      throw new Error(currentDirPath + " path does not exist");
    }
  }

  RED.httpAdmin.post(
    "/listfiles",
    RED.auth.needsPermission("exe-config.write"),
    function (req, res) {
      var files = [];
      try {
        walkSync(req.body.folderpath, function (filePath, name) {
          var item = { filePath, name };
          files.push(item);
        });
        res.send(files);
      } catch (e) {
        res.status(404).send(e.name + ": " + e.message);
      }
    }
  );

  RED.httpAdmin.post(
    "/getvariables",
    RED.auth.needsPermission("exe-config.write"),
    function (req, res) {
      const exefilename = req.body.id;
      const expand = req.body.exp === "true";
      const exeModifiedTime = fs.statSync(exefilename).mtime.getTime();
      let elfParser = new ElfParser();
      progressStatus = 0;
      elfParser.readElf(
        exefilename,
        (list) => {
          res.send({ list, exeModifiedTime });
        },
        expand,
        (progress) => {
          progressStatus = progress;
        }
      );
    }
  );

  RED.httpAdmin.post(
    "/getstat",
    RED.auth.needsPermission("exe-config.write"),
    function (req, res) {
      const exeFilename = req.body.id;
      const exeTime = fs.statSync(exeFilename).mtime.getTime();
      res.send({ exeTime });
    }
  );

  RED.httpAdmin.get("/getElfParsingProgress", function (req, res) {
    logger.trace("Progress status = " + progressStatus);
    res.send(progressStatus.toString());
  });

  RED.httpAdmin.get("/images/*", function (req, res) {
    var filename = path.join(__dirname, "images", req.params[0]);
    res.sendFile(filename, function (err) {
      if (err) {
        logger.error(filename + " not found. Maybe running in dev mode.");
      }
    });
  });

  const hyperlistPath = require.resolve("hyperlist");
  RED.httpAdmin.get("/hyperlist.js", function (req, res) {
    res.sendFile(hyperlistPath, function (err) {
      if (err) {
        logger.error(
          "variable.js : " +
            hyperlistPath +
            " not found. Maybe running in dev mode."
        );
      }
    });
  });
  const select2Path = require.resolve("select2");
  RED.httpNode.get("/select2/*", function (req, res) {
    var filename = path.join(select2Path, "../..", req.params[0]);
    res.sendFile(filename, function (err) {
      if (err) {
        logger.error(
          "variable.js : " + filename + " not found. Maybe running in dev mode."
        );
      }
    });
  });
};
