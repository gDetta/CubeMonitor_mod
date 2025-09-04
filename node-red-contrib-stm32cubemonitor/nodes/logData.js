/*!
 * module node-red-contrib-stm32cubemonitor
 * Copyright(c) 2019 STMicroelectronics
 *
 * ****************************************************
 * The code to open file is from node-red project, 10-file.js
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

let fs = require("fs-extra");
let os = require("os");
let path = require("path");

let node = this;
node.wstream = null;
node.filename = null;
let lastValues = {};
const FILE_SIZE = 104857600; // 100MB of data
let waitFirstLine = false;
let newFile = true;
let dataBuffer = "";
let csvSeparator = ",";
let digitSeparator = ".";
let startTime = 0;

process.on("message", (msg) => {
  switch (msg.topic) {
    case "initializeLog":
      node.logmode = msg.logmode;
      node.logformat = msg.logformat;
      node.directory = msg.directory;
      node.groupname = msg.groupname;
      node.variables = msg.variables;
      createFile();
      break;
    case "log":
      switch (node.logformat) {
        case "csv":
          logDataCsv(msg.data);
          break;
        case "csvc":
          logDataCsvColumns(msg.data);
          break;
        default:
          logDataStcm(msg.data);
      }
      break;
    case "stop":
      if (node.wstream) {
        if (node.logformat === "csv" || node.logformat === "csvc") {
          node.wstream.end();
        } else {
          node.wstream.end("]", function () {});
        }
      }
      break;
    case "clear":
      startTime = 0;
      break;
  }
});

/**
 * Function called to create file of log.
 */
function createFile() {
  newFile = true;
  node.wstream = null;
  lastValues = {};

  // detect the separator based on decimal separator format
  let testValue = 1.2;
  if (testValue.toLocaleString() === "1,2") {
    csvSeparator = ";";
    digitSeparator = ",";
  }

  try {
    fs.ensureDirSync(node.directory);
  } catch (err) {
    let error = {};
    error.title = "file.errors.createfail";
    error.type = err.toString();
    error.msg = node.directory;
    process.send(error);
    return;
  }
  var now = new Date();
  var monthValue = now.getMonth() + 1;
  var fileExtension;
  switch (node.logformat) {
    case "csvc":
    case "csv":
      fileExtension = ".csv";
      break;
    default:
      fileExtension = ".stcm";
  }
  node.filename = path.join(
    node.directory,
    "Log_" +
      node.groupname +
      "_" +
      now.getFullYear() +
      "-" +
      ("0" + monthValue).slice(-2) +
      "-" +
      ("0" + now.getDate()).slice(-2) +
      "_" +
      ("0" + now.getHours()).slice(-2) +
      "h" +
      ("0" + now.getMinutes()).slice(-2) +
      "m" +
      ("0" + now.getSeconds()).slice(-2) +
      "s" +
      fileExtension
  );
}

/**
 * Function called to log measures in file during acquisition.
 *
 * @param {*} msgData - Array of data used as input of the processing node.
 */
function logDataStcm(msgData) {
  for (let j = 0; j < msgData.length; j++) {
    let msg = msgData[j].payload;

    // filter the data if "changes" is selected
    if (node.logmode === "changes") {
      for (let i = 0; i < msg.variabledata.length; i++) {
        if (
          !Object.hasOwn(lastValues, msg.variablename) ||
          msg.variabledata[i].y !== lastValues[msg.variablename]
        ) {
          lastValues[msg.variablename] = msg.variabledata[i].y;
        } else {
          msg.variabledata.splice(i, 1);
          i--;
        }
      }
    }

    // format the data to log and write in the file
    if (msg.variabledata.length !== 0) {
      let data = JSON.stringify(msg) + "," + os.EOL;
      writeDataToFile(data);
    }
  }
}

/**
 * Function called to log measures in file during acquisition in CSV format.
 *
 * @param {*} msgData - Array of data used as input of the processing node.
 */
function logDataCsv(msgData) {
  for (let j = 0; j < msgData.length; j++) {
    let msg = msgData[j].payload;

    // filter the data if "changes" is selected
    if (node.logmode === "changes") {
      for (let i = 0; i < msg.variabledata.length; i++) {
        if (
          !Object.hasOwn(lastValues, msg.variablename) ||
          msg.variabledata[i].y !== lastValues[msg.variablename]
        ) {
          lastValues[msg.variablename] = msg.variabledata[i].y;
        } else {
          msg.variabledata.splice(i, 1);
          i--;
        }
      }
    }
    if (msg.variabledata.length !== 0) {
      // format the data to log and write in the file
      let data = DataToCsv(msg);
      writeDataToFile(data);
    }
  }
}

/**
 * Function called to log measures in file during acquisition in CSV multiple columns format.
 *
 * @param {*} msgData - Array of data used as input of the processing node.
 */
function logDataCsvColumns(msgData) {
  // retrieve the number of sample in first variable data
  let nbSample = msgData[0].payload.variabledata.length;
  // initialise the start time with the first sample received
  if (startTime === 0) {
    startTime = msgData[0].payload.variabledata[0].x;
  }

  // parse the data i = sample number, j = variable#
  for (let i = 0; i < nbSample; i++) {
    let changed = false;

    // insert the time
    let line = ((msgData[0].payload.variabledata[i].x - startTime) / 1000)
      .toString()
      .replace(".", digitSeparator)
      .concat(csvSeparator);

    // insert the data values
    for (let j = 0; j < msgData.length; j++) {
      if (msgData[j].payload.variabledata[i].y !== undefined) {
        let value = msgData[j].payload.variabledata[i].y;
        line = line.concat(
          value.toString().replace(".", digitSeparator),
          csvSeparator
        );
        // detect change in the variable values
        if (lastValues[msgData[j].payload.variablename] !== value) {
          changed = true;
        }
        lastValues[msgData[j].payload.variablename] = value;
      } else {
        // the value is not defined or empty
        line = line.concat("0", csvSeparator);
      }
    }
    line = line.concat(os.EOL);

    // log in the file is there are change of in full mode
    if (node.logmode === "full" || changed === true) {
      writeDataToFile(line);
    }
  }
}

/**
 * Function writeDataToFile  store the formated data in the log file.
 * @param {string} data - String to write in the file. Can be one multiple lines.
 */
function writeDataToFile(data) {
  var filename = node.filename;
  var size = null;
  var recreateStream = !node.wstream;
  if (node.wstream && node.wstreamIno) {
    // There is already a stream open and we have the inode
    // of the file. Check the file hasn't been deleted
    // or deleted and recreated.
    try {
      var stat = fs.statSync(filename);
      size = stat["size"];
      // File exists - check the inode matches
      if (stat.ino !== node.wstreamIno) {
        // The file has been recreated. Close the current
        // stream and recreate it
        recreateStream = true;
        delete node.wstream;
        delete node.wstreamIno;
      }
    } catch (err) {
      // File does not exist
      recreateStream = true;
      node.wstream.end();
      delete node.wstream;
      delete node.wstreamIno;
    }
  }
  if (recreateStream) {
    node.wstream = fs.createWriteStream(filename, {
      encoding: "utf8",
      // Append mode
      flags: "a",
      autoClose: true
    });
    node.wstream.on("open", function () {
      try {
        var stat = fs.statSync(filename);
        node.wstreamIno = stat.ino;
      } catch (err) {
        node.warn("file :" + filename + " issue to open");
      }
    });
    node.wstream.on("error", function (err) {
      let error = {};
      error.title = "file.errors.appendfail";
      error.type = err.toString();
      error.msg = data;
      process.send(error);
    });
  }
  if (filename) {
    if (newFile === true) {
      node.wstream.write(fileHeader(), firstChunkWritten);
      waitFirstLine = true;
      newFile = false;
    }
    if (waitFirstLine === true) {
      dataBuffer += data;
    } else {
      node.wstream.write(data, function () {});
    }
  }

  // manage the max file size and recreate file
  if (size && size >= FILE_SIZE) {
    if (node.logformat === "csv" || node.logformat === "csvc") {
      node.wstream.end();
    } else {
      node.wstream.end("]", function () {});
    }
    createFile();
  }
}

/**
 *
 */
function fileHeader() {
  let header;
  switch (node.logformat) {
    case "csv":
      header =
        "groupname" +
        csvSeparator +
        "variablename" +
        csvSeparator +
        "x" +
        csvSeparator +
        "y" +
        os.EOL;
      break;
    case "csvc":
      header = "time" + csvSeparator;
      for (const variable of node.variables) {
        header = header.concat(variable.name, csvSeparator);
      }
      header = header.concat(os.EOL);
      break;
    default: // stcm
      header = "[" + os.EOL;
  }

  return header;
}

/**
 * Callback when first chunk of log have been written.
 */
function firstChunkWritten() {
  waitFirstLine = false;
  node.wstream.write(dataBuffer, function () {});
  dataBuffer = "";
}

/**
 * Function DataToCsv to convert data for one variable into CSV lines (comma separated values).
 * @param {*} data -  data.
 * @returns {string} CSV formated data.
 */
function DataToCsv(data) {
  let line = "";
  if (startTime === 0) {
    startTime = data.variabledata[0].x;
  }
  for (let i = 0; i < data.variabledata.length; i++) {
    if (data.variabledata[i].y) {
      line = line.concat(
        data.groupname,
        csvSeparator,
        data.variablename,
        csvSeparator,
        ((data.variabledata[i].x - startTime) / 1000)
          .toString()
          .replace(".", digitSeparator),
        csvSeparator,
        data.variabledata[i].y.toString().replace(".", digitSeparator),
        os.EOL
      );
    }
  }
  return line;
}
