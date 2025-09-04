/*!
 * module node-red-contrib-stm32cubemonitor
 * Copyright(c) 2019 STMicroelectronics
 */
const path = require("path");
const Mustache = require("mustache");
const fs = require("fs");
/**
 * Export node to node-RED.
 * @param {*} RED - Node-RED env.
 */
module.exports = function (RED) {
  const logger = RED.log;
  const uiPath = (RED.settings.ui || {}).path || "ui";

  /**
   * Service to check chart node configuration.
   *
   * @param {*} node - Node.
   * @param {*} conf - Node configuration.
   */
  function checkConfig(node, conf) {
    if (!conf) {
      node.error(RED._("ui_chartst.error.no-config"));
      return false;
    }

    if (!{}.hasOwnProperty.call(conf, "group")) {
      node.error(RED._("ui_chartst.error.no-group"));
      return false;
    }
    return true;
  }

  /**
   * Chart node part running in front-end.
   *
   * @param {*} config - Chart node configuration.
   */
  function HTML(config) {
    var id = "id_" + config.id.replace(".", "");
    var timer = "timer_" + id;
    var width = config.width;
    var height = config.height;
    var chartType = config.chartType;
    var curveType = config.curveType;
    var sizes = config.sizes;
    var duration = config.duration;
    var yMin = config.ymin;
    var yMax = config.ymax;
    var template = fs
      .readFileSync(path.join(__dirname, "chart.mst"))
      .toString();
    var html = Mustache.render(template, {
      id,
      timer,
      width,
      height,
      chartType,
      curveType,
      duration,
      sizes,
      yMin,
      yMax
    });

    return html;
  }

  var ui = undefined;
  /**
   * Chart node constructor.
   *
   * @param {*} config - Chart node configuration.
   */
  function STChart(config) {
    try {
      var node = this;
      if (ui === undefined) {
        ui = RED.require("node-red-dashboard")(RED);
      }
      // Ensure default values for config object to ease migration between different versions
      config.width = config.width || 0;
      config.height = config.height || 0;
      config.chartType = config.chartType || "line";
      config.curveType = config.curveType || "linear";
      config.duration = config.duration || "10";
      config.ymin = config.ymin || "";
      config.ymax = config.ymax || "";

      // setting sizes to ui one, or fallback to hard coded default values
      config.sizes =
        typeof ui.getSizes === "function"
          ? ui.getSizes()
          : { sx: 48, sy: 48, gx: 6, gy: 6, cx: 6, cy: 6, px: 0, py: 0 };
      var group = RED.nodes.getNode(config.group);
      var groupWidth;
      if (
        group &&
        {}.hasOwnProperty.call(group, "config") &&
        {}.hasOwnProperty.call(group.config, "width")
      ) {
        groupWidth = parseInt(group.config.width);
      }
      const groupHeight = Math.ceil(groupWidth / 2 + 1);
      if (parseInt(config.width) === 0) {
        delete config.width;
        config.width = parseInt(groupWidth || 6);
      }
      if (parseInt(config.height) === 0) {
        delete config.height;
        config.height = parseInt(groupHeight || 4);
      }
      RED.nodes.createNode(this, config);
      var done = null;
      if (checkConfig(node, config)) {
        var html = HTML(config);
        done = ui.addWidget({
          node: node,
          order: config.order,
          width: config.width,
          height: config.height,
          format: html,
          templateScope: "local",
          group: config.group,
          emitOnlyNewValues: false,
          forwardInputMessages: false,
          storeFrontEndInputAsState: false,
          persistantFrontEndValue: false,
          /**
           * Callback to convert sent message.
           *
           * @param {*} value - Value.
           */
          convertBack: function (value) {
            return value;
          },
          /**
           * Callback to prepare message.
           *
           * @param {*} msg - Message.
           * @param {*} value - Value.
           */
          beforeEmit: function (msg, value) {
            return { msg: { topic: msg.topic, payload: value } };
          },
          /**
           * Callback to prepare message.
           *
           * @param {*} msg - Message.
           * @param {*} orig - Origin.
           */
          beforeSend: function (msg, orig) {
            if (orig) {
              return orig.msg;
            }
          }
        });
      }
    } catch (e) {
      logger.log(e);
    }
    node.on("close", function () {
      if (done) {
        done();
      }
    });
  }
  RED.nodes.registerType("ui_chartst", STChart);

  const d3Path = require.resolve("d3");
  const d3fcrebindPath = require.resolve("@d3fc/d3fc-rebind");
  const d3fcSamplePath = require.resolve("@d3fc/d3fc-sample");
  RED.httpNode.get("/" + uiPath + "/d3/*", function (req, res) {
    var filename;
    switch (req.params[0]) {
      case "d3.min.js":
        filename = path.join(d3Path, "../../dist", "d3.min.js");
        break;
      case "d3fc-rebind.min.js":
        filename = path.join(d3fcrebindPath, "..", "d3fc-rebind.min.js");
        break;
      case "d3fc-sample.min.js":
        filename = path.join(d3fcSamplePath, "..", "d3fc-sample.min.js");
        break;
      default:
        logger.error("chart.js : " + req.params[0] + " not defined.");
        return;
    }
    res.sendFile(filename, function (err) {
      if (err) {
        logger.error(
          "chart.js : " + filename + " not found. Maybe running in dev mode."
        );
      }
    });
  });

  RED.httpNode.get("/" + uiPath + "/linechart.js", function (req, res) {
    var filename = path.join(__dirname, ".", "linechart.js");
    res.sendFile(filename, function (err) {
      if (err) {
        logger.error(
          "chart.js : " + filename + " not found. Maybe running in dev mode."
        );
      }
    });
  });

  RED.httpNode.get("/" + uiPath + "/barchart.js", function (req, res) {
    var filename = path.join(__dirname, ".", "barchart.js");
    res.sendFile(filename, function (err) {
      if (err) {
        logger.error(
          "chart.js : " + filename + " not found. Maybe running in dev mode."
        );
      }
    });
  });

  /**
   * Service to return the list of data log files (with extensions .stcm).
   *
   * @param {*} currentDirPath - Directory containing data log files.
   * @param {*} callback - Callback called for each data log file.
   */
  function walkSync(currentDirPath, callback) {
    var fs = require("fs");
    try {
      var files = fs.readdirSync(currentDirPath, { withFileTypes: true });
      files.forEach(function (file) {
        if (file.isFile()) {
          var name = file.name;
          var filePath = path.join(currentDirPath, name);
          if (path.extname(name) === ".stcm") {
            callback(filePath, name);
          }
        }
      });
    } catch (e) {
      // Handle error
      logger.warn(currentDirPath + " does not exist");
      throw new Error(currentDirPath + " does not exist");
    }
  }

  RED.httpNode.get("/" + uiPath + "/listlogfile", function (req, res) {
    const homedir = require("os").homedir();
    const logpath = RED.settings.logpath || homedir;
    var files = [];
    try {
      walkSync(logpath, function (filePath, name) {
        var item = { filePath, name };
        // var item = { name };
        files.push(item);
      });
      res.json(files);
    } catch (e) {
      res.sendStatus(404);
    }
  });

  const select2Path = require.resolve("select2");
  RED.httpNode.get("/" + uiPath + "/select2/*", function (req, res) {
    var filename = path.join(select2Path, "../..", req.params[0]);
    res.sendFile(filename, function (err) {
      if (err) {
        logger.error(
          "chart.js : " + filename + " not found. Maybe running in dev mode."
        );
      }
    });
  });

  RED.httpNode.get("/" + uiPath + "/import/*", function (req, res) {
    res.sendFile(path.resolve(req.params[0]), function (err) {
      if (err) {
        logger.error(
          "chart.js : " +
            req.params[0] +
            " not found. Maybe running in dev mode."
        );
      }
    });
  });

  RED.httpAdmin.get("/images/*", function (req, res) {
    var filename = path.join(__dirname, "images", req.params[0]);
    res.sendFile(filename, function (err) {
      if (err) {
        logger.error(
          "chart.js : " + filename + " not found. Maybe running in dev mode."
        );
      }
    });
  });
};
