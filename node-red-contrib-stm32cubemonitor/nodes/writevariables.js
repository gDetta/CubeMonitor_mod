/*!
 * module node-red-contrib-stm32cubemonitor
 * Copyright(c) 2019 STMicroelectronics
 */
const path = require("path");

/**
 * Export the node to node-RED .
 * @param {*} RED  - Node-RED context.
 */
module.exports = function (RED) {
  const logger = RED.log;
  /**
   * Check configuration validity.
   *
   * @param {*} node - Node instance used for error notification.
   * @param {*} conf - Configuration to check.
   */
  function checkConfig(node, conf) {
    if (!conf) {
      node.error(RED._("ui_write.error.no-config"));
      return false;
    }

    if (!{}.hasOwnProperty.call(conf, "group")) {
      node.error(RED._("ui_write.error.no-group"));
      return false;
    }
    return true;
  }

  /**
   * Provide html template to send to front-end for writevariable widget.
   *
   * @param {*} config - Node configuration.
   */
  function HTML(config) {
    let sizes = config.sizes;
    let nbHeight = config.height;
    let id = "id_" + config.id.replace(".", "");
    let html = String.raw`
<style>
.select-all-checkboxes {
  padding-left: 15px;
}

.flexbox {
display:flex;
height:30px;
}

.button-write {
    width:100%;
    min-height:${sizes.sy}px!important;
}

.value-input {
  margin-left:8px;
  color: #888;
  padding: 0px 0px 0px 5px;
  border: 1px solid var(--nr-dashboard-widgetBgndColor);
  background: #FBFBFB;
  outline: 0;
  font: 100 12px/25px Verdana, Helvetica, sans-serif;
  height: 20px;
  line-height:15px;
  margin: 2px 0px 2px 0px;
  width:calc(100% - 30px);
  min-width:95px;
  resize:none;
}
.value-input:disabled {
    background-color:#D3D3D3;
}
.value-input::placeholder{
      font-style:italic;
}

.value-input:invalid+span:after {
  /*position: absolute;*/
  content: '✖';
  padding:1px 0 0 2px;
  color:red;
}

.value-input:valid+span:after {
  /*position: absolute;*/
  content: '✓';
  padding:1px 0 0 2px;
  color:green;
}
.nameColumn, .addressColumn, .typeColumn, .selectAllLabel {
    font: 100 12px/25px Verdana, Helvetica, sans-serif;
}
.nameColumn {
    white-space: nowrap; 
    overflow: hidden;
    text-overflow: ellipsis;
}

.clear-md-checkbox {
    min-height:0px !important;
}

.md-tooltip {
    height: auto;
}

.divnameColumn {
  width:calc(70% - 15px);
  min-width:90px;
  margin-top: 10px;
  margin-left: 10px;
  margin-right: 10px;
  white-space: nowrap; 
  overflow: hidden;
  text-overflow: ellipsis;
}

.divinput {
    width:calc(50% - 15px);
    min-width:125px;
    margin-top: 10px;
    margin-left: 1px;
    margin-right: 10px;

}

::placeholder { /* Chrome, Firefox, Opera, Safari 10.1+ */
  opacity: 0.5; /* Firefox */
}

:-ms-input-placeholder { /* Internet Explorer 10-11 */
  color: grey;
}

::-ms-input-placeholder { /* Microsoft Edge */
  color: grey;
}

.value-input:valid {
    color: green;
}
.value-input:invalid {
    color: red;
}
.listVariables {
  overflow: auto;
  /* styling firefox scrollbar */
  scrollbar-color: var(--nr-dashboard-widgetColor) var(--nr-dashboard-widgetBgndColor);
  scrollbar-width: thin;
}

.nr-dashboard-theme .nr-dashboard-template ::-webkit-scrollbar {
  background:var(--nr-dashboard-widgetBgndColor);
}
.nr-dashboard-template {
  padding: 0px 0px;
}

md-checkbox .md-label{
  top: auto;
}

md-checkbox {
  width:20px;
}

</style>
<div style="height:100%">
<div class="flexbox">
<md-checkbox class="clear-md-checkbox" aria-label="Select All" ng-checked="isChecked()" md-indeterminate="isIndeterminate()" ng-click="toggleAll()">
</md-checkbox>
  <div class="divnameColumn">
    <md-label class="selectAllLabel"><span ng-if="isChecked()">Un-</span>Select All</md-label>
  </div>
</div>
<div id="${id}"class="listVariables">
    <div  class="select-all-checkboxes flexbox" ng-repeat="item in items">
        <md-checkbox aria-label="checkbox {{item.name}}" class="clear-md-checkbox" ng-checked="exists(item, selected)" ng-click="toggle(item, selected)">
          
        </md-checkbox>
        <div class="divnameColumn">

        <md-label class="nameColumn">{{ item.name }}<md-tooltip md-delay="500"><u><b>{{item.name}}:</b></u><br> -address: {{item.address}}<br> -type: {{typeList[item.type-1]}}<br></md-tooltip></md-label>
        </div>
        <div class="divinput">
            <input form="novalidatedform" type="text" mytype="{{ item.type }}" class="value-input" ng-disabled="!exists(item, selected)" placeholder={{typeList[item.type-1]}} 
            ng-model="item.value" pattern="(?:(0[xX][0-9a-fA-F]+)|([-]?[0-9]+([.][0-9]+)?))" ng-keyup="validateType($event,item)"  required>
            <span class="validity"></span>
        </div>
    </div>
    </div>
    <md-button class="button-write" aria-label="Write" ng-click="updateValues(selected)">WRITE</md-button>
    <!--patch du disable tooltip on text input  -->
    <form id="novalidatedform" novalidate></form>
</div>
<script>

(function(scope) {
  /* If widget size is auto, set the widget height to 3 units,
    nb is (nb units-1) as the WRITE BUTTON is 1 unit height */
  let nb = ${nbHeight}===0?2:${nbHeight}-1;

  /* Finally the height of "un-Select All" div must be remove to determine the remaining 
    space for the height of listVariables container */
  let listVariablesSize = nb * (${sizes.sy} + ${sizes.cy}) - 30;

  /* Finally set the height of listVariables container to the computed height */ 
  document.querySelector("#${id}").style.height=listVariablesSize+'px';
  
  scope.items = [];
  scope.typeList = ["Unsigned-8bit","Signed-8bit","Unsigned-16bit","Signed-16bit","Unsigned-32bit","Signed-32bit","Unsigned-64bit","Signed-64bit","Float","Double"];

  scope.$watch('msg.payload', newVar => {
      if (newVar && newVar.hasOwnProperty('variablelist') && newVar.hasOwnProperty('accesspoint')) {
        scope.items = newVar.variablelist.slice();
        scope.selected = newVar.variablelist.slice();
        scope.accesspoint = newVar.accesspoint;
      }
  });
  scope.selected = [];

  scope.toggle = function (item, list) {
    var idx = list.indexOf(item);
    if (idx > -1) {
      list.splice(idx, 1);
    }
    else {
      list.push(item);
    }
  };
  
  scope.validateType = function (evt,i) {
    var errorMsg = "Please match the format requested.";
    var e = evt.target;
    var type = $(e).attr('mytype');
    var textarea = e;
    const valString = e.value;
    const val = Number(valString)
    var hasError,max;
    switch(type) {
        case "1": // Unsigned 8-bit
            hasError = !Number.isInteger(val) || (val < 0) || (val > Number("0xFF"));
            break;
        case "2": // Signed 8-bit
            if (valString.startsWith("0x") || valString.startsWith("0X")) { // hexadecimal 
                hasError = (val > Number("0xFF"))
            } else { // decimal
                max = 127;
                hasError = !Number.isInteger(val) || (val < -max-1) || (val > max);
            }
            break;
        case "3": // Unsigned 16-bit
          hasError = !Number.isInteger(val) || (val < 0) || (val > Number("0xFFFF"));
          break;
        case "4": // Signed 16-bit
            if (valString.startsWith("0x") || valString.startsWith("0X")) { // hexadecimal 
                hasError = (val > Number("0xFFFF"))
            } else { // decimal
                max = 32767;
                hasError = !Number.isInteger(val) || (val < -max-1) || (val > max);
            }
            break;
        case "5": // Unsigned 32-bit
            hasError = !Number.isInteger(val) || (val < 0) || (val > Number("0xFFFFFFFF"));
            break;
        case "6": // Signed 32-bit
            if (valString.startsWith("0x") || valString.startsWith("0X")) { // hexadecimal 
                hasError = (val > Number("0xFFFFFFFF"))
            } else { // decimal
                max = 2147483647;
                hasError = !Number.isInteger(val) || (val < -max-1) || (val > max);
            }
            break;
        case "9": // float
            hasError = false;
            if (valString.startsWith("0x") || valString.startsWith("0X")) { // hexadecimal 
              hasError = valString.length > "0xFFFFFFFF".length;
            }
            break;
        case "10": // Double
            hasError = false;
            if (valString.startsWith("0x") || valString.startsWith("0X")) { // hexadecimal 
              hasError = valString.length > "0xFFFFFFFFFFFFFFFF".length;
            }
            break;
        default:
            hasError = true;
            break;
        }
    if (typeof textarea.setCustomValidity === 'function') {
        textarea.setCustomValidity(hasError ? errorMsg : '');
    } else {
    // Not supported by the browser, fallback to manual error display...
        $(textarea).toggleClass('error', !!hasError);
        $(textarea).toggleClass('ok', !hasError);
        if (hasError) {
            $(textarea).attr('title', errorMsg);
        } else {
            $(textarea).removeAttr('title');
        }
    }
    i.validity = !hasError;
    return !hasError;
  };
  
  
  
  
  scope.exists = function (item, list) {
    return list.indexOf(item) > -1;
  };

  scope.isIndeterminate = function() {
    return (scope.selected.length !== 0 &&
        scope.selected.length !== scope.items.length);
  };

  scope.isChecked = function() {
    return scope.selected.length === scope.items.length;
  };

  scope.toggleAll = function() {
    if (scope.selected.length === scope.items.length) {
      scope.selected = [];
    } else if (scope.selected.length === 0 || scope.selected.length > 0) {
      scope.selected = scope.items.slice(0);
    }
  };
  
  scope.updateValues = function(list) {
      if (list.length>0) {
        let result =   list.filter(function(e)  {
            if (e.hasOwnProperty("value") && e.value !== undefined && e.hasOwnProperty("validity") && e.validity) {
                return e;
            }
        })
        if (result.length) scope.send({payload:{variablelist:result, accesspoint:scope.accesspoint}, topic:"write"});
      }
  };
})(scope);
</script>
 `;
    return html;
  }

  var ui = undefined;
  /**
   * Write variable node constructor.
   *
   * @param {*} config - Object holding configuration parameters for write variable.
   */
  function Writevariables(config) {
    try {
      var node = this;
      if (ui === undefined) {
        ui = RED.require("node-red-dashboard")(RED);
      }
      config.width = config.width || 0;
      config.height = config.height || 0;
      // setting sizes to ui one, or fallback to hard coded default values
      config.sizes =
        typeof ui.getSizes === "function"
          ? ui.getSizes()
          : { sx: 48, sy: 48, gx: 6, gy: 6, cx: 6, cy: 6, px: 0, py: 0 };
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
          convertBack: function (value) {
            return value;
          },
          beforeEmit: function (msg, value) {
            return { msg: { topic: msg.topic, payload: value } };
          },
          // eslint-disable-next-line jsdoc/require-jsdoc
          beforeSend: function (msg, orig) {
            if (orig) {
              return orig.msg;
            }
          }
        });
      }
    } catch (e) {
      node.log(e);
    }
    node.on("close", function () {
      if (done) {
        done();
      }
    });
  }
  RED.nodes.registerType("ui_write", Writevariables);

  RED.httpAdmin.get("/images/*", function (req, res) {
    var filename = path.join(__dirname, "images", req.params[0]);
    res.sendFile(filename, function (err) {
      if (err) {
        logger.error(filename + " not found. Maybe running in dev mode.");
      }
    });
  });
};
