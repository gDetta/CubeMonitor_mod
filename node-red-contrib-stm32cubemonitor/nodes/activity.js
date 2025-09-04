/*!
 * module node-red-contrib-stm32cubemonitor
 * Copyright(c) 2022 STMicroelectronics
 */

/**
 * Export node to node-RED.
 * @param {*} RED - Node-RED env.
 */
module.exports = function (RED) {
  "use strict";
  var ui = undefined;
  const logger = RED.log;

  /**
   * Generate the HTML (as a text string) that will be showed in the browser
   * on the dashboard.
   * @param {*} config - Node configuration.
   */
  function HTML(config) {
    var html =
      String.raw`
        <style>
        .act {
            color: ` +
      config.textColor +
      `;
        }
        </style>
        <div class="act" >
            <span class="material-icons">{{activityIcon}}</span>{{activityLabel}}
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
    if (!conf) {
      node.error(RED._("ui_activity.error.no-config"));
      return false;
    }

    if (!{}.hasOwnProperty.call(conf, "group")) {
      node.error(RED._("ui_activity.error.no-group"));
      return false;
    }
    return true;
  }

  /**
   * Main function to register activity node.
   *
   * @param {*} config - Object holding configuration parameters.
   */
  function activity(config) {
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

              $scope.activityIcon = "home";
              $scope.activityLabel = "No activity";
            };

            $scope.$watch("msg", function (msg) {
              if (!msg) {
                return;
              } // Ignore undefined msg

              // The payload contains the new activity, which we will store on the scope (in the model)
              switch (msg.payload) {
                case 1:
                  $scope.activityIcon = "man";
                  $scope.activityLabel = "Stationnary";
                  break;
                case 2:
                  $scope.activityIcon = "directions_walk";
                  $scope.activityLabel = "Walking";
                  break;
                case 3:
                  $scope.activityIcon = "nordic_walking";
                  $scope.activityLabel = "Fast Walking";
                  break;
                case 4:
                  $scope.activityIcon = "directions_run";
                  $scope.activityLabel = "Jogging";
                  break;
                case 5:
                  $scope.activityIcon = "directions_bike";
                  $scope.activityLabel = "Biking";
                  break;
                case 6:
                  $scope.activityIcon = "directions_car";
                  $scope.activityLabel = "Driving";
                  break;
                default:
                  $scope.activityIcon = "home";
                  $scope.activityLabel = "No activity";
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
  RED.nodes.registerType("ui_activity", activity);
};
