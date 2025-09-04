/*!
 * module node-red-contrib-stm32cubemonitor
 * Copyright(c) 2022 STMicroelectronics
 */

/**
 * Export the node to node-RED .
 * @param {*} RED  - Node-RED context.
 */
module.exports = function (RED) {
  "use strict";
  var ui = undefined;
  const logger = RED.log;

  /**
   * Generate the HTML (as a text string) that will be showed in the browser
   * on the dashboard.
   * @param {*} config - Node config.
   */
  function HTML(config) {
    // Convert config to a JSON string
    var configAsJson = JSON.stringify(config);
    var gridvisiblity = config.backgroundGrid === true ? "visible" : "hidden";

    var defaultSvg =
      String.raw`<svg
        style="visibility: ` +
      gridvisiblity +
      `;"
        width="100%"
        height="100%"
        viewBox="0 0 482.44 482.44">
          <defs><style>.cls-1,.cls-2,.cls-4{fill:none;stroke-miterlimit:10;}.cls-1,.cls-4{stroke:#03234b;}.cls-2{stroke:#404040;stroke-width:0.5px;}.cls-3{fill:#3cb4e6;}.cls-4{stroke-width:0.35px;}</style></defs>
          <g id="Calque_2" data-name="Calque 2">
            <g id="Calque_1-2" data-name="Calque 1">
              <g id="Radar_1"><line id="ordonnée" class="cls-1" x1="241.23" y1="241.22" x2="241.23"/>
                <line id="ordonnée-2" data-name="ordonnée" class="cls-1" x1="241.23" y1="482.44" x2="241.23" y2="241.22"/>
                <line id="abscisse" class="cls-1" x1="241.22" y1="241.22" x2="482.44" y2="241.22"/>
                <line id="abscisse-2" data-name="abscisse" class="cls-1" y1="241.22" x2="241.22" y2="241.22"/>
                <g id="graduation"><line class="cls-2" x1="218.27" y1="238.23" x2="218.27" y2="244.23"/>
                  <line class="cls-2" x1="192.9" y1="238.23" x2="192.9" y2="244.23"/><line class="cls-2" x1="167.53" y1="238.22" x2="167.53" y2="244.22"/>
                  <line class="cls-2" x1="142.16" y1="238.22" x2="142.16" y2="244.22"/><line class="cls-2" x1="116.78" y1="238.22" x2="116.78" y2="244.22"/>
                  <line class="cls-2" x1="91.41" y1="238.22" x2="91.41" y2="244.22"/><line class="cls-2" x1="66.04" y1="238.21" x2="66.04" y2="244.21"/>
                  <line class="cls-2" x1="40.67" y1="238.21" x2="40.67" y2="244.21"/><line class="cls-2" x1="15.3" y1="238.21" x2="15.3" y2="244.21"/>
                  <line class="cls-2" x1="244.22" y1="218.45" x2="238.22" y2="218.45"/><line class="cls-2" x1="244.23" y1="193.08" x2="238.23" y2="193.08"/>
                  <line class="cls-2" x1="244.23" y1="167.71" x2="238.23" y2="167.71"/><line class="cls-2" x1="244.23" y1="142.34" x2="238.23" y2="142.34"/>
                  <line class="cls-2" x1="244.23" y1="116.97" x2="238.23" y2="116.97"/><line class="cls-2" x1="244.24" y1="91.6" x2="238.24" y2="91.6"/>
                  <line class="cls-2" x1="244.24" y1="66.23" x2="238.24" y2="66.23"/><line class="cls-2" x1="244.24" y1="40.86" x2="238.24" y2="40.86"/>
                  <line class="cls-2" x1="244.25" y1="15.49" x2="238.25" y2="15.49"/><line class="cls-2" x1="264.09" y1="244.21" x2="264.09" y2="238.21"/>
                  <line class="cls-2" x1="289.46" y1="244.21" x2="289.46" y2="238.21"/><line class="cls-2" x1="314.83" y1="244.21" x2="314.83" y2="238.21"/>
                  <line class="cls-2" x1="340.2" y1="244.22" x2="340.2" y2="238.22"/><line class="cls-2" x1="365.57" y1="244.22" x2="365.57" y2="238.22"/>
                  <line class="cls-2" x1="390.94" y1="244.22" x2="390.94" y2="238.22"/><line class="cls-2" x1="416.31" y1="244.22" x2="416.31" y2="238.22"/>
                  <line class="cls-2" x1="441.69" y1="244.23" x2="441.69" y2="238.23"/><line class="cls-2" x1="467.06" y1="244.23" x2="467.06" y2="238.23"/>
                  <line class="cls-2" x1="238.25" y1="264.3" x2="244.25" y2="264.3"/><line class="cls-2" x1="238.24" y1="289.67" x2="244.24" y2="289.67"/>
                  <line class="cls-2" x1="238.24" y1="315.04" x2="244.24" y2="315.04"/><line class="cls-2" x1="238.24" y1="340.42" x2="244.24" y2="340.42"/>
                  <line class="cls-2" x1="238.23" y1="365.79" x2="244.23" y2="365.79"/><line class="cls-2" x1="238.23" y1="391.16" x2="244.23" y2="391.16"/>
                  <line class="cls-2" x1="238.23" y1="416.53" x2="244.23" y2="416.53"/><line class="cls-2" x1="238.23" y1="441.9" x2="244.23" y2="441.9"/>
                  <line class="cls-2" x1="238.22" y1="467.27" x2="244.22" y2="467.27"/>
                </g>
                <g id="centre"><circle class="cls-3" cx="241.23" cy="241.22" r="4.14"/></g>
                <g id="cercle"><circle class="cls-4" cx="241.22" cy="241.19" r="11.84"/>
                  <circle class="cls-4" cx="241.22" cy="241.19" r="36.78"/><circle class="cls-4" cx="241.22" cy="241.19" r="61.73"/>
                  <circle class="cls-4" cx="241.22" cy="241.19" r="86.67"/><circle class="cls-4" cx="241.22" cy="241.19" r="111.61"/>
                  <circle class="cls-4" cx="241.22" cy="241.19" r="136.56"/><circle class="cls-4" cx="241.22" cy="241.19" r="161.5"/>
                  <circle class="cls-4" cx="241.22" cy="241.19" r="186.45"/><circle class="cls-4" cx="241.22" cy="241.19" r="211.39"/>
                  <circle class="cls-4" cx="241.22" cy="241.19" r="236.33"/>
                </g>
              </g>
            </g>
          </g>
        </svg>`;
    var userImg =
      String.raw`<img src="/` +
      config.backgroundImg +
      `" alt="Image not found">`;
    var grid = config.backgroundImg === "" ? defaultSvg : userImg;
    var html =
      String.raw`
        <style>
        .wrapper { display: flex; justify-content: center;}
        .panel {
            position: relative;
            width: max-content;
        }
        .panel img {
            z-index: 1;
            display: inline-block;
            max-width: 100%;
            max-height: 100%;
            visibility: ` +
      gridvisiblity +
      `;
        }

        .icon-wrap {
            z-index:2;
            position: absolute;
            top:50%;
            left:50%;
            margin-top: -13px;
            margin-left: -7px;
        }
        </style>
        <div class="wrapper">
          <div class="panel">
              <div class="icon-wrap" ng-style="{'transform': changeXY1, '-webkit-transform': changeXY1, '-ms-transform': changeXY1}">
                <i class="fa fa-circle" style='color:{{color1}}; opacity:{{dotOpacity1}};' ng-init='init(` +
      configAsJson +
      `)' ng-model='msg' ></i>
              </div>
              <div class="icon-wrap" ng-style="{'transform': changeXY2, '-webkit-transform': changeXY2, '-ms-transform': changeXY2}">
                <i class="fa fa-circle" style='color:{{color2}}; opacity:{{dotOpacity2}};' ng-init='init(` +
      configAsJson +
      `)' ng-model='msg' ></i>
              </div>
              <div class="icon-wrap" ng-style="{'transform': changeXY3, '-webkit-transform': changeXY3, '-ms-transform': changeXY3}">
                <i class="fa fa-circle" style='color:{{color3}}; opacity:{{dotOpacity3}};' ng-init='init(` +
      configAsJson +
      `)' ng-model='msg' ></i>
              </div>
              <div class="icon-wrap" ng-style="{'transform': changeXY4, '-webkit-transform': changeXY4, '-ms-transform': changeXY4}">
                <i class="fa fa-circle" style='color:{{color4}}; opacity:{{dotOpacity4}};' ng-init='init(` +
      configAsJson +
      `)' ng-model='msg' ></i>
              </div>
              <div class="img" id="sonarImg">
              ` +
      grid +
      `
              </div>
          </div>
          <div class="caption" style="position: absolute; top: 0; left: 0; color:{{color1}};">{{topicContent1}}</div>
          <div class="caption" style="position: absolute; bottom: 0.5em; left: 0; color:{{color2}};">{{topicContent2}}</div>
          <div class="caption" style="position: absolute; top: 0; right: 0; color:{{color3}};">{{topicContent3}}</div>
          <div class="caption" style="position: absolute; bottom: 0.5em; right: 0; color:{{color4}};">{{topicContent4}}</div>
        </div>
        `;

    return html;
  }

  /**
   * Verify  the configuration is valid.
   * @param {*} node - The Node reference.
   * @param {*} conf - Node configuration.
   */
  function checkConfig(node, conf) {
    if (!conf || !{}.hasOwnProperty.call(conf, "group")) {
      node.error(RED._("ui_radar.error.no-group"));
      return false;
    }
    return true;
  }

  /**
   * Constructor.
   *
   * @param {*} config - Node configuration.
   */
  function radar(config) {
    try {
      var node = this;
      if (ui === undefined) {
        ui = RED.require("node-red-dashboard")(RED);
      }
      RED.nodes.createNode(this, config);

      if (checkConfig(node, config)) {
        var html = HTML(config);
        var done = ui.addWidget({
          node: node,
          order: config.order,
          group: config.group,
          width: config.width,
          height: config.height,
          format: html,
          templateScope: "local",
          emitOnlyNewValues: false,
          forwardInputMessages: false,
          storeFrontEndInputAsState: false,

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
           */
          beforeEmit: function (msg) {
            return { msg: msg };
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
          },

          /**
           * Controller init.
           *
           * @param {*} $scope - Css elements.
           */
          initController: function ($scope) {
            $scope.flag = true;
            // eslint-disable-next-line jsdoc/require-jsdoc
            $scope.init = function (config) {
              $scope.config = config;

              // The configuration contains the default text, which needs to be stored in the scope
              // (to make sure it will be displayed via the model).
              $scope.changeXY1 = "translate(0px, 0px)";
              $scope.changeXY2 = "translate(0px, 0px)";
              $scope.changeXY3 = "translate(0px, 0px)";
              $scope.changeXY4 = "translate(0px, 0px)";
              $scope.topicContent1 = "";
              $scope.topicContent2 = "";
              $scope.topicContent3 = "";
              $scope.topicContent4 = "";
              $scope.dotOpacity1 = 0;
              $scope.dotOpacity2 = 0;
              $scope.dotOpacity3 = 0;
              $scope.dotOpacity4 = 0;
              $scope.color1 = "#03234B";
              $scope.color2 = "#3CB4E6";
              $scope.color3 = "#FFD200";
              $scope.color4 = "#E6007E";
            };

            $scope.$watch("msg", function (msg) {
              if (!msg) {
                return;
              } // Ignore undefined

              // The payload contains the new text, which we will store on the scope (in the model)
              if (msg.payload === undefined || msg.payload === "") {
                if (
                  $scope.topicContent1 !== "" &&
                  $scope.topicContent1 === msg.topic
                ) {
                  $scope.dotOpacity1 = 0;
                  $scope.topicContent1 = "";
                } else if (
                  $scope.topicContent2 !== "" &&
                  $scope.topicContent2 === msg.topic
                ) {
                  $scope.dotOpacity2 = 0;
                  $scope.topicContent2 = "";
                } else if (
                  $scope.topicContent3 !== "" &&
                  $scope.topicContent3 === msg.topic
                ) {
                  $scope.dotOpacity3 = 0;
                  $scope.topicContent3 = "";
                } else if (
                  $scope.topicContent4 !== "" &&
                  $scope.topicContent4 === msg.topic
                ) {
                  $scope.dotOpacity4 = 0;
                  $scope.topicContent4 = "";
                } else if (msg.topic === undefined || msg.topic === "") {
                  $scope.dotOpacity1 = 0;
                  $scope.topicContent1 = "";
                  $scope.dotOpacity2 = 0;
                  $scope.topicContent2 = "";
                  $scope.dotOpacity3 = 0;
                  $scope.topicContent3 = "";
                  $scope.dotOpacity4 = 0;
                  $scope.topicContent4 = "";
                }
                return;
              }
              if (
                $scope.topicContent1 === "" ||
                $scope.topicContent1 === msg.topic
              ) {
                $scope.dotOpacity1 = 1;
                var xTranslate =
                  (msg.payload.x *
                    document.getElementById("sonarImg").clientWidth) /
                  ($scope.config.maxXValue - $scope.config.minXValue);
                var yTranslate =
                  0 -
                  (msg.payload.y *
                    document.getElementById("sonarImg").clientHeight) /
                    ($scope.config.maxYValue - $scope.config.minYValue);
                $scope.changeXY1 =
                  "translate(" + xTranslate + "px ," + yTranslate + "px)";
                $scope.topicContent1 = msg.topic;
              } else if (
                $scope.topicContent2 === "" ||
                $scope.topicContent2 === msg.topic
              ) {
                $scope.dotOpacity2 = 1;
                xTranslate =
                  (msg.payload.x *
                    document.getElementById("sonarImg").clientWidth) /
                  ($scope.config.maxXValue - $scope.config.minXValue);
                yTranslate =
                  0 -
                  (msg.payload.y *
                    document.getElementById("sonarImg").clientHeight) /
                    ($scope.config.maxYValue - $scope.config.minYValue);
                $scope.changeXY2 =
                  "translate(" + xTranslate + "px ," + yTranslate + "px)";
                $scope.topicContent2 = msg.topic;
              } else if (
                $scope.topicContent3 === "" ||
                $scope.topicContent3 === msg.topic
              ) {
                $scope.dotOpacity3 = 1;
                xTranslate =
                  (msg.payload.x *
                    document.getElementById("sonarImg").clientWidth) /
                  ($scope.config.maxXValue - $scope.config.minXValue);
                yTranslate =
                  0 -
                  (msg.payload.y *
                    document.getElementById("sonarImg").clientHeight) /
                    ($scope.config.maxYValue - $scope.config.minYValue);
                $scope.changeXY3 =
                  "translate(" + xTranslate + "px ," + yTranslate + "px)";
                $scope.topicContent3 = msg.topic;
              } else if (
                $scope.topicContent4 === "" ||
                $scope.topicContent4 === msg.topic
              ) {
                $scope.dotOpacity4 = 1;
                xTranslate =
                  (msg.payload.x *
                    document.getElementById("sonarImg").clientWidth) /
                  ($scope.config.maxXValue - $scope.config.minXValue);
                yTranslate =
                  0 -
                  (msg.payload.y *
                    document.getElementById("sonarImg").clientHeight) /
                    ($scope.config.maxYValue - $scope.config.minYValue);
                $scope.changeXY4 =
                  "translate(" + xTranslate + "px ," + yTranslate + "px)";
                $scope.topicContent4 = msg.topic;
              }
            });
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
  RED.nodes.registerType("ui_radar", radar);
};
