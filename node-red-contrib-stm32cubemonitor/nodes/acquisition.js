/*!
 * module node-red-contrib-stm32cubemonitor
 * Copyright(c) 2019 STMicroelectronics
 */

/*global SharedArrayBuffer, Atomics */
/**
 * Export the node to node-RED .
 * @param {*} RED  - Node-RED context.
 */
module.exports = function (RED) {
  "use strict";
  const { Worker } = require("worker_threads");
  const path = require("path");
  const os = require("os");
  const fs = require("fs");
  const logger = RED.log;
  let settings = RED.settings;
  // safely accessing nested level key from settings
  const logLevel = (((settings || {}).logging || {}).console || {}).level;
  // temporary dll files cleanup.
  const tmpDir = path.join(os.tmpdir(), "stm32cubemon-tmp");
  if (fs.existsSync(tmpDir)) {
    const files = fs.readdirSync(tmpDir);
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(tmpDir, file));
      } catch (err) {
        logger.warn("Temporary dll files cleanup: " + err.message);
      }
    }
  } else {
    fs.mkdirSync(tmpDir);
  }
  const acquisitionServices =
    require("@stm32/stm32cubemonitor-acquisitionservices").AcquisitionServices;
  acquisitionServices.initLogger(logLevel);
  const events = require("events");
  const object = require("lodash/fp");

  const acqWorkerPath = require.resolve(
    "@stm32/stm32cubemonitor-acquisitionservices/dist/stm32cubemon-worker.js"
  );

  const sharedBuffer = new SharedArrayBuffer(16);
  const sab = new Int32Array(sharedBuffer);

  // if stlinkReconnectTime not defined in settings.js file, set default value to 10s
  if (!settings.stlinkReconnectTime) settings.stlinkReconnectTime = 10000;

  // Fallback to "p2p" mode in case the connectType key is not defined in settings.js or key not set to "p2p" or "tcp"
  if (
    !settings.connectionType ||
    (settings.connectionType !== "p2p" && settings.connectionType !== "tcp")
  ) {
    settings.connectionType = "p2p";
  }
  let actualConnectionType = acquisitionServices.initConnectionType(
    settings.connectionType
  );
  if (actualConnectionType !== settings.connectionType) {
    logger.info("tcp server not reachable, fallback to p2p connection type");
    logger.warn("------------------------------------------------------");
    logger.warn("tcp server not reachable, fallback to p2p connection type");
    logger.warn("------------------------------------------------------");
  }

  //Ini acqFrequencyThreshold in case the setting.js file not yet updated
  if (!settings.acqFrequencyThreshold) {
    settings.acqFrequencyThreshold = "10";
  }

  /**
   * Acquisition out node constructor.
   *
   * @param {*} config - Acquisition out node configuration.
   */
  function AcquisitionOutNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name || "";
    this.probeconfig = config.probeconfig || "";
    this.probeconfiguration = RED.nodes.getNode(this.probeconfig);
    var oldmsg = "";

    if (this.probeconfiguration) {
      var node = this;
      node.status({ fill: "grey", shape: "dot", text: "not connected" });
      node.probe = probePool.get(this.probeconfiguration);

      node.probe.on("ready", function (msg) {
        oldmsg = "";
        node.status({
          fill: "green",
          shape: "dot",
          text: `${actualConnectionType} connected ${msg}`
        });
      });
      node.probe.on("closed", function (msg) {
        if (oldmsg !== msg) {
          oldmsg = msg;
          node.status({
            fill: "red",
            shape: "dot",
            text: `not connected ! ${msg}`
          });
        }
      });

      node.probe.on("error", function (err) {
        //only log errors and  ignore warnings
        //status is updated on closed, no need to change it
        if (err.topic === "error") {
          node.error(err.payload);
        }
      });

      node.on("input", function (msg) {
        if (
          !{}.hasOwnProperty.call(msg, "payload") ||
          !{}.hasOwnProperty.call(msg, "topic")
        ) {
          return; // do nothing unless we have a payload
        }

        node.probe.sendCommand(msg.topic, msg.payload);
      });
      node.probe.connect();
    } else {
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
  RED.nodes.registerType("acquisition out", AcquisitionOutNode);

  /**
   * Acquisition in node constructor.
   *
   * @param {*} config - Acquisition in node configuration.
   */
  function AcquisitionInNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name || "";
    this.probeconfig = config.probeconfig || "";
    this.probeconfiguration = RED.nodes.getNode(this.probeconfig);
    var oldmsg = "";

    if (this.probeconfiguration) {
      var node = this;
      node.status({ fill: "grey", shape: "dot", text: "not connected" });
      node.probe = probePool.get(this.probeconfiguration);

      this.probe.on("data", function (msgout) {
        const myMsg = object.cloneDeep(msgout);
        node.send([{ payload: myMsg }, null]);
      });
      this.probe.on("error", function (err) {
        node.send([null, err]);
      });
      this.probe.on("stop", function () {
        node.send({ payload: "", topic: "stop" });
      });
      this.probe.on("ready", function (msg) {
        oldmsg = "";
        node.status({
          fill: "green",
          shape: "dot",
          text: `${actualConnectionType} connected ${msg}`
        });
      });
      this.probe.on("closed", function (msg) {
        if (oldmsg !== msg) {
          oldmsg = msg;
          node.status({
            fill: "red",
            shape: "dot",
            text: `not connected ! ${msg}`
          });
        }
      });
      node.probe.connect();
    } else {
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
  RED.nodes.registerType("acquisition in", AcquisitionInNode);

  /**
   * Probe config node constructor.
   *
   * @param {*} config - Probe config node configuration.
   */
  function probe(config) {
    RED.nodes.createNode(this, config);
    this.probeid = config.probeid || "";
    this.nickname = config.nickname || "";
    this.protocol = config.protocol || "";
    this.frequency = config.frequency || "";
  }
  RED.nodes.registerType("probe", probe);

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
        var probeid = probeConfig.probeid,
          frequency = probeConfig.frequency,
          protocol = probeConfig.protocol;

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

          // eslint-disable-next-line jsdoc/require-jsdoc
          var initProbesConfig = function () {
            obj.acqServ = new Worker(acqWorkerPath, {
              workerData: {
                probeId: probeid,
                settings: settings.stlinkReconnectTime,
                protocol: protocol,
                frequency: frequency,
                connectionType: settings.connectionType,
                sab: sab,
                acquFrequThreshold: settings.acqFrequencyThreshold,
                probeType: "stlink"
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
    "/blink/*",
    RED.auth.needsPermission("probe.read"),
    function (req, res) {
      let result = acquisitionServices.blinkLed(sab, req.params[0]);
      res.send(result);
    }
  );

  RED.httpAdmin.get(
    "/getprobestlink",
    RED.auth.needsPermission("probe.read"),
    function (req, res) {
      acquisitionServices.probesDiscovery(
        "stlink",
        sab,
        "",
        (receivedList, receivedUpdated) => {
          res.send({ list: receivedList, updated: receivedUpdated });
        }
      );
    }
  );

  const select2Path = require.resolve("select2");
  RED.httpAdmin.get("/select2/*", function (req, res) {
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

  RED.httpAdmin.get("/images/*", function (req, res) {
    var filename = path.join(__dirname, "images", req.params[0]);
    res.sendFile(filename, function (err) {
      if (err) {
        logger.error(filename + " not found. Maybe running in dev mode.");
      }
    });
  });
};
