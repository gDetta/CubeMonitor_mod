/*!
 * module node-red-contrib-stm32cubemonitor
 * Copyright(c) 2019 STMicroelectronics
 */

/*global SharedArrayBuffer, Atomics */
/**
 *
 * @param {*} RED  - Node-RED env.
 */
module.exports = function (RED) {
  "use strict";
  const { Worker } = require("worker_threads");
  const path = require("path");
  const os = require("os");
  const logger = RED.log;
  let settings = RED.settings;
  // safely accessing nested level key from settings
  const logLevel = (((settings || {}).logging || {}).console || {}).level;

  const acquisitionServices1 =
    require("@stm32/stm32cubemonitor-acquisitionservices").AcquisitionServices;
  acquisitionServices1.initLogger(logLevel);
  const events = require("events");
  const object = require("lodash/fp");

  const acqWorkerPath = require.resolve(
    "@stm32/stm32cubemonitor-acquisitionservices/dist/stm32cubemon-worker.js"
  );

  const sharedBuffer = new SharedArrayBuffer(16);
  const sab = new Int32Array(sharedBuffer);

  // if stlinkReconnectTime not defined in settings.js file, set default value to 10s
  if (!settings.stlinkReconnectTime) settings.stlinkReconnectTime = 10000;

  //Ini acqFrequencyThreshold in case the setting.js file not yet updated
  if (!settings.acqFrequencyThreshold) {
    settings.acqFrequencyThreshold = "10";
  }

  /**
   * Acquisition out node constructor.
   *
   * @param {*} config - Acquisition out node configuration.
   */
  function AcqJLinkOutNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name || "";
    this.probeconfig = config.probeconfig || "";
    this.probeconfiguration = RED.nodes.getNode(this.probeconfig);
    var oldmsg = "";

    if (this.probeconfiguration) {
      let mcuname = this.probeconfiguration.mcuname;
      var node = this;
      node.status({ fill: "grey", shape: "dot", text: "not connected" });
      node.probejlink = probePool.get(this.probeconfiguration);

      this.probejlink.on("error", function (msg) {
        if (oldmsg !== msg) {
          oldmsg = msg;
          node.status({
            fill: "gray",
            shape: "dot",
            text: `Jlink not connected`
          });
        }
      });

      this.probejlink.on("closed", function (msg) {
        if (oldmsg !== msg) {
          oldmsg = msg;
          node.status({
            fill: "red",
            shape: "dot",
            text: `no jlink configured`
          });
        }
      });

      this.probejlink.on("connecttojlinkdone", function (msg) {
        if (oldmsg !== msg) {
          oldmsg = msg;
          if (mcuname != "") {
            node.status({
              fill: "green",
              shape: "dot",
              text: `${mcuname} ready`
            });
          } else {
            node.status({
              fill: "red",
              shape: "dot",
              text: `MCU model not set`
            });
          }
        }
      });

      this.probejlink.on("ready", function () {
        oldmsg = "";
        node.status({
          fill: "green",
          shape: "dot",
          text: `Connected to ${mcuname}`
        });
      });

      node.on("input", function (msg) {
        if (
          !{}.hasOwnProperty.call(msg, "payload") ||
          !{}.hasOwnProperty.call(msg, "topic")
        ) {
          return; // do nothing unless we have a payload
        }

        node.probejlink.sendCommand(msg.topic, msg.payload);
      });
      node.probejlink.connect();
    } else {
      this.status({
        fill: "red",
        shape: "dot",
        text: `no jlink configured`
      });
      this.error(RED._("Missing probe config"));
    }

    this.on("close", function (done) {
      if (this.probeconfiguration) {
        probePool.close(this.probeconfiguration.probeid, done);
      } else {
        done();
      }
    });
  }

  // create the jlink node only if it should be activated
  if (!settings.jlink || settings.jlink === true) {
    RED.nodes.registerType("acquisition jlink out", AcqJLinkOutNode);
  }

  /**
   * Acquisition JLink in node constructor.
   *
   * @param {*} config - Acquisition out node configuration.
   */
  function AcqJLinkInNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name || "";
    this.probeconfig = config.probeconfig || "";
    this.probeconfiguration = RED.nodes.getNode(this.probeconfig);
    var oldmsg = "";

    if (this.probeconfiguration) {
      let mcuname = this.probeconfiguration.mcuname;
      var node = this;
      node.status({ fill: "grey", shape: "dot", text: "not connected" });
      node.probejlink = probePool.get(this.probeconfiguration);

      this.probejlink.on("data", function (msgout) {
        const myMsg = object.cloneDeep(msgout);
        node.send([{ payload: myMsg }, null]);
      });

      this.probejlink.on("error", function (err) {
        node.send([null, err]);
      });

      this.probejlink.on("error", function (msg) {
        if (oldmsg !== msg) {
          oldmsg = msg;
          node.status({
            fill: "gray",
            shape: "dot",
            text: `Jlink not connected`
          });
        }
      });

      this.probejlink.on("stop", function () {
        node.send({ payload: "", topic: "stop" });
      });
      this.probejlink.on("ready", function () {
        oldmsg = "";
        node.status({
          fill: "green",
          shape: "dot",
          text: `Connected to ${mcuname}`
        });
      });

      this.probejlink.on("connecttojlinkdone", function (msg) {
        if (oldmsg !== msg) {
          oldmsg = msg;
          if (mcuname != "") {
            node.status({
              fill: "green",
              shape: "dot",
              text: `${mcuname} ready`
            });
          } else {
            node.status({
              fill: "red",
              shape: "dot",
              text: `MCU model not set`
            });
          }
        }
      });

      this.probejlink.on("closed", function (msg) {
        if (oldmsg !== msg) {
          oldmsg = msg;
          node.status({
            fill: "red",
            shape: "dot",
            text: `no jlink configured`
          });
        }
      });

      node.probejlink.connect();
    } else {
      this.status({
        fill: "red",
        shape: "dot",
        text: `no jlink configured`
      });
      this.error(RED._("Missing probe config"));
    }

    this.on("close", function (done) {
      if (this.probeconfiguration) {
        probePool.close(this.probeconfiguration.probeid, done);
      } else {
        done();
      }
    });
  }

  // create the jlink node only if it should be activated
  if (!settings.jlink || settings.jlink === true) {
    RED.nodes.registerType("acquisition jlink in", AcqJLinkInNode);
  }

  /**
   * Probe config node constructor.
   *
   * @param {*} config - Probe config node configuration.
   */
  function probejlink(config) {
    RED.nodes.createNode(this, config);

    this.probeid = config.probeid || "";
    this.mcuname = config.mcuname || "";
    this.nickname = config.nickname || "";
  }

  RED.nodes.registerType("probejlink", probejlink);

  var probePool = (function () {
    // set Shared Array Buffer acqCount index to 0
    Atomics.store(sab, 0, 0);
    // set the Shared Array Buffer Lock index to unlocked value
    Atomics.store(sab, 1, 0);
    var connections = {};
    return {
      // eslint-disable-next-line jsdoc/require-jsdoc
      get: function (probeConfig) {
        // make local copy of configuration -- perhaps not needed?
        var probeid = probeConfig.probeid;
        var id = probeid;
        // just return the connection object if already have one
        // key is the probeid (file path)
        if (connections[id]) {
          return connections[id];
        }

        connections[id] = (function () {
          var obj = {
            _emitter: new events.EventEmitter(),
            acqServ: null,
            on: function (a, b) {
              this._emitter.on(a, b);
            },
            // eslint-disable-next-line jsdoc/require-jsdoc
            close: function () {
              this.acqServ.postMessage({
                cmd: "close"
              });
            },
            // eslint-disable-next-line jsdoc/require-jsdoc
            sendCommand: function (topic, data) {
              this.acqServ.postMessage({
                cmd: "sendCommand",
                args: {
                  topic: topic,
                  data: data
                }
              });
            },
            connect: function () {
              this.acqServ.postMessage({ cmd: "connect" });
            },
            exit: function () {
              this.acqServ.postMessage({ cmd: "exit" });
            }
          };

          /**
           * Init probe configuration.
           */
          var initProbesConfig = function () {
            obj.acqServ = new Worker(acqWorkerPath, {
              workerData: {
                probeId: probeid,
                settings: settings.stlinkReconnectTime,
                connectionType: settings.connectionType,
                sab: sab,
                acquFrequThreshold: settings.acqFrequencyThreshold,
                probeType: "jlink",
                boardModel: probeConfig.mcuname
              }
            });
            obj.acqServ.on("online", () => {
              // Acquisition service requires a hight priority to improve acquisition performance for Windows os only.
              if (os.type() === "Windows_NT") {
                try {
                  os.setPriority(os.constants.priority.PRIORITY_HIGHEST);
                } catch (error) {
                  logger.warn("OS priority setting: " + error);
                }
              }
            });
            obj.acqServ.on("message", (messageFromWorker) => {
              switch (messageFromWorker.cmd) {
                case "open":
                  obj._emitter.emit("ready", messageFromWorker.msg);
                  break;
                case "close":
                  obj._emitter.emit("closed", messageFromWorker.msg);
                  break;
                case "connecttojlink":
                  obj._emitter.emit(
                    "connecttojlinkdone",
                    messageFromWorker.msg
                  );
                  break;
                case "data":
                  obj._emitter.emit("data", messageFromWorker.msg);
                  break;
                case "error":
                  obj._emitter.emit("error", messageFromWorker.msg);
                  break;
                case "stop":
                  obj._emitter.emit("stop", messageFromWorker.msg);
                  break;
              }
            });
            obj.acqServ.on("error", (err) => {
              logger.error(
                "Worker error - Probe ID:" +
                  probeid +
                  " - error: " +
                  err.message
              );
            });
            obj.acqServ.on("messageerror", (err) => {
              logger.error(
                "Worker message error - Probe ID:" +
                  probeid +
                  " - message error: " +
                  err
              );
            });
            obj.acqServ.on("exit", (code) => {
              if (code == 1) {
                logger.info(
                  "Worker exit - Probe ID:" +
                    probeid +
                    " - stopped with exit code: " +
                    code
                );
                obj._emitter.emit("closed", "Probe exit");
              }
            });
          };
          initProbesConfig();
          return obj;
        })();
        return connections[id];
      },
      // eslint-disable-next-line jsdoc/require-jsdoc
      close: function (probeid, done) {
        if (connections[probeid]) {
          connections[probeid].close();
          done();
          delete connections[probeid];
        } else {
          done();
        }
      }
    };
  })();

  RED.httpAdmin.get(
    "/getprobejlink",
    RED.auth.needsPermission("probejlink.read"),
    function (req, res) {
      var hwname = req.query.hwname;
      acquisitionServices1.probesDiscovery(
        "jlink",
        sab,
        hwname,
        (receivedList, receivedUpdated) => {
          res.send({ list: receivedList, updated: receivedUpdated });
        }
      );
    }
  );

  RED.httpAdmin.get(
    "/getstmodels",
    RED.auth.needsPermission("probejlink.read"),
    function (req, res) {
      res.send("test");
    }
  );

  /**
   * Check if jlink probe should be enabled.
   */
  RED.httpAdmin.get(
    "/jlinkEnabled",
    RED.auth.needsPermission("probejlink.read"),
    function (req, res) {
      let enable = false;
      // Jlink probe is available only for windows
      if (process.platform === "win32") {
        // check the setting in setting.js to hide if required
        // if there is no setting, node will be displayed
        enable = settings.jlink != false; // editorTheme.palette.
      }
      res.send(enable);
    }
  );

  const select2Path = require.resolve("select2");
  RED.httpNode.get("/select2/*", function (req, res) {
    var filename = path.join(select2Path, "../..", req.params[0]);
    res.sendFile(filename, function (err) {
      if (err) {
        logger.error(
          "acquisition.js : " +
            filename +
            " not found. Maybe running in dev mode."
        );
      }
    });
  });

  RED.httpNode.get("/images/*", function (req, res) {
    var filename = path.join(__dirname, "images", req.params[0]);
    res.sendFile(filename, function (err) {
      if (err) {
        logger.error(filename + " not found. Maybe running in dev mode.");
      }
    });
  });
};
