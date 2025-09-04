/*!
 * module node-red-contrib-stm32cubemonitor
 * Copyright(c) 2019 STMicroelectronics
 */
/* global d3, fc */

(function () {
  "use strict";

  /**
   * Line chart class.
   */
  class LineChart {
    /**
     * Line chart constructor.
     *
     * @param {object} lineChartConfig - Line chart configuration.
     */
    constructor(lineChartConfig) {
      // console.log(lineChartConfig);

      /*
       * Store input parameters
       */
      this.divId = lineChartConfig.divId; // Widget container identifier.
      this.curveType = lineChartConfig.curveType; // Curve type.
      this.inputWidth = lineChartConfig.width; // widget width
      this.inputHeight = lineChartConfig.height; // widget height
      this.widgetUnit = lineChartConfig.widgetUnit; // widget units
      this.slidingWindowDuration = lineChartConfig.slidingWindowDuration; // Sliding window duration
      /*
       * Constants used for chart drawing.
       */
      this.WIDGET_WIDTH_UNIT = this.widgetUnit.sx;
      this.WIDGET_HEIGHT_UNIT = this.widgetUnit.sy;
      this.WIDGET_MARGIN_WIDTH = this.widgetUnit.cx;
      this.WIDGET_MARGIN_HEIGHT = this.widgetUnit.cy;

      /*
       * Chart margins.
       */
      this.DEFAULT_CHART_MARGIN_TOP = 30;
      this.DEFAULT_CHART_MARGIN_RIGHT = 30;
      this.DEFAULT_CHART_MARGIN_BOTTOM = 54; // X_AXIS_TITLE_MARGIN_TOP (40px) + X-Axis Title height (14px)
      this.DEFAULT_CHART_MARGIN_LEFT = 40;
      this.CONTROL_CONTAINER_WIDTH = 200;
      this.X_AXIS_TITLE_MARGIN_TOP = 40;
      this.VARIABLES_CONTAINER_MARGIN_TOP = this.DEFAULT_CHART_MARGIN_BOTTOM;

      /**
       * Size for axis tick values.
       */
      this.TICK_LABEL_HEIGHT = 16;
      this.TICK_LABEL_WIDTH = 55;

      /*
       * Constants used for chart rendering (timing, sub-sampling, ...)
       */
      /* Timer duration to render incoming data */
      this.TIMER_DURATION = 100;
      /* Sliding window size */
      this.WINDOW_SIZE = this.slidingWindowDuration;
      /* Maximal number of points to be rendered when no acquisition is ongoing */
      this.MAX_RENDERED_POINTS = 20000;
      /* Maximal number of points to be rendered when acquisition is ongoing */
      this.MAX_RENDERED_POINTS_DURING_LIVE = 5000;
      /* Maximal number of points to be rendered each TIMER_DURATION duration */
      this.MAX_RENDERED_POINTS_PER_TIMER_DURATION = Math.round(
        (this.MAX_RENDERED_POINTS_DURING_LIVE * this.TIMER_DURATION) /
          this.WINDOW_SIZE
      );
      /* Maximal number of points to be rendered (when "Show points" is selected) */
      this.MAX_RENDERED_DOTS_PER_VARIABLE = 200;
      /* Idle delay before doing another brush */
      this.IDLE_DELAY = 300;
      /* Duration of Validity set to 1 hour to avoid "out of memory" issue */
      this.DURATION_OF_VALIDITY = 3600;

      /*
       * Private variables.
       */
      /* Main structure containing all data sets */
      this.dataSets = [];
      /* Used to save the timestamp of the first incoming point */
      this.firstts = 0;
      /* Used to add and configure new variable */
      this.variableIndex = 0;
      /* Boolean set when the brush mode is selected */
      this.brushSelected = true;
      /* Boolean set when the points should be rendered */
      this.pointsAreRendered = false;
      /* Boolean set when one variable has been added in the variables container */
      this.variablesContainerUpdated = false;
      /* Counter incremented each time the renderData function is called */
      this.renderingDataCounter = 0;
      /* Chart margins */
      this.chartMargin = {
        top: this.DEFAULT_CHART_MARGIN_TOP,
        right: this.DEFAULT_CHART_MARGIN_RIGHT,
        bottom: this.DEFAULT_CHART_MARGIN_BOTTOM,
        left: this.DEFAULT_CHART_MARGIN_LEFT
      };

      /*
       * Custom Private variables. 
       */
      /* Save opacity state of variables before graph flush */
      this.variableOpacities = [];

      /*
       * D3 functions and objects
       */
      /* Pool of 10 colors */
      this.lineColor = d3.scale.category10();
      /* function used to determine the x value closest of the mouse position */
      this.bisector = d3.bisector(function (d) {
        return d.x;
      }).right;
      /* Last Mouse position */
      this.lastMousePos = [-1, -1];
      /* Current Zoom transformation */
      this.zoomTransform = { k: 1 };

      /* Draw chart */
      this.drawChart();
    }

    /**
     * Init all D3 functions used for the chart.
     */
    initChart() {
      this.computeChartDimensions();

      this.xScale = d3
        .scaleLinear()
        .range([0, this.chartWidth])
        .domain([0, this.WINDOW_SIZE]);

      this.yScale = d3
        .scaleLinear()
        .range([this.chartHeight, 0])
        .domain([0, 100]);

      this.xAxis = d3
        .axisBottom()
        .tickArguments([this.chartWidth / this.TICK_LABEL_WIDTH])
        .scale(this.xScale)
        .tickSizeInner(5)
        .tickSizeOuter(0)
        .tickPadding(10);

      this.yAxis = d3
        .axisLeft()
        .tickArguments([this.chartHeight / this.TICK_LABEL_HEIGHT])
        .scale(this.yScale)
        .tickSizeInner(-this.chartWidth)
        .tickSizeOuter(0)
        .tickPadding(10);

      this.line = d3
        .line()
        .curve(this.lineCurve(this.curveType))
        .x(function (d) {
          return this.xScale(d.x);
        })
        .y(function (d) {
          return this.yScale(d.y);
        });

      this.brush = d3.brush().on("end", (event) => this.brushended(event));

      this.zoom = d3
        .zoom()
        .scaleExtent([1, Infinity])
        .translateExtent([
          [0, 0],
          [this.chartWidth, this.chartHeight]
        ])
        .extent([
          [0, 0],
          [this.chartWidth, this.chartHeight]
        ])
        .on("zoom", (event) => this.zoomed(event));

      this.bucketSize = 1;
      this.sampler = fc
        .largestTriangleThreeBucket()
        .bucketSize(this.bucketSize)
        .x(function (d) {
          return d.x;
        })
        .y(function (d) {
          return d.y;
        });

      this.timerId = null;
    }

    /**
     * Compute D3 line curve type.
     *
     * @param {string} interpolate - Interpolate function.
     * @returns {Function} - D3 line curve type.
     */
    lineCurve(interpolate) {
      let type;

      switch (interpolate) {
        case "linear":
          type = d3.curveLinear;
          break;

        case "monotoneX":
          type = d3.curveMonotoneX;
          break;

        case "natural":
          type = d3.curveNatural;
          break;

        case "step":
          type = d3.curveStep;
          break;

        case "step after":
          type = d3.curveStepAfter;
          break;

        case "step before":
          type = d3.curveStepBefore;
          break;

        default:
          type = d3.curveLinear;
          break;
      }
      return type;
    }

    /**
     * Compute the chart width and height values.
     */
    computeChartDimensions() {
      /* End user set the chart size (width and height) in the chart node. */
      /* available space in card is = nbUnit*unitSize+ (nbUnit-1)*spaceBetWeenUnit */
      /* no padding to remove as we force it to 0 */

      /* width of of chart container is equal to available card width */
      this.width =
        this.inputWidth * this.WIDGET_WIDTH_UNIT +
        (this.inputWidth - 1) * this.WIDGET_MARGIN_WIDTH;

      /* height of chart container is available card height - height of import button which is set to one unit height */
      this.height =
        (this.inputHeight - 1) * this.WIDGET_HEIGHT_UNIT +
        (this.inputHeight - 1) * this.WIDGET_MARGIN_HEIGHT;

      this.chartWidth =
        this.width - this.chartMargin.left - this.chartMargin.right;
      this.chartHeight =
        this.height - this.chartMargin.top - this.chartMargin.bottom;
    }

    /**
     * Draw the chart (constructor).
     */
    drawChart() {
      this.initChart();
      this.$widget = d3
        .select("#" + this.divId)
        .append("svg")
        .attr("display", "block")
        .attr("width", this.width)
        .attr("height", this.height);

      this.$chart = this.$widget
        .append("g")
        .attr(
          "transform",
          "translate(" +
            this.chartMargin.left +
            "," +
            this.chartMargin.top +
            ")"
        );

      this.$xAxis = this.$chart
        .append("g")
        .attr("transform", "translate(0," + this.chartHeight + ")")
        .style("font-size", "12px")
        .call(this.xAxis);

      this.$yAxis = this.$chart
        .append("g")
        .style("font-size", "12px")
        .attr("class", "yAxis")
        .call(this.yAxis);

      this.$xAxisTitle = this.$widget
        .append("text")
        .text("Time (s)")
        .attr(
          "transform",
          "translate(" +
            this.chartWidth / 2 +
            "," +
            (this.chartMargin.top +
              this.chartHeight +
              this.X_AXIS_TITLE_MARGIN_TOP) +
            ")"
        )
        .style("font-family", "sans-serif")
        .style("font-size", "14px")
        .style("fill", "var(--nr-dashboard-widgetTextColor");

      this.$yAxisTitle = this.$widget
        .append("text")
        .text("Value(s)")
        .attr(
          "transform",
          "translate(10," +
            (this.chartMargin.top + this.chartHeight / 2) +
            ")rotate(-90)"
        )
        .style("font-family", "sans-serif")
        .style("font-size", "14px")
        .style("fill", "var(--nr-dashboard-widgetTextColor");

      this.$clipPath = this.$chart
        .append("defs")
        .append("clipPath")
        .attr("id", this.divId + "_clip")
        .append("rect")
        .attr("width", this.chartWidth)
        .attr("height", this.chartHeight);
      const xPos = Math.max(this.chartWidth / 2 - 125, 0); // label is 250px long
      const fontSize = 0.9 * Math.min(1, this.chartWidth / 250);
      this.$waitingMsg = this.$chart
        .append("text")
        .text("Acquisition started - waiting for value")
        .attr(
          "transform",
          "translate(" + xPos + "," + this.chartHeight / 2 + ")"
        ) // label is 250px long at 14px=0.9em
        .style("font-family", "sans-serif")
        .style("font-size", fontSize + "em")
        .style("font-weight", "bold")
        .style("fill", "var(--nr-dashboard-widgetColor)")
        .style("display", "none");

      this.$brush = this.$chart
        .append("g")
        .attr("clip-path", "url(#" + this.divId + "_clip)")
        .call(this.brush);

      this.$brush
        .select(".overlay")
        .attr("width", this.chartWidth)
        .attr("height", this.chartHeight)
        .on("mouseover", () => {
          if (this.pointsAreRendered) {
            for (let i = 0; i < this.dataSets.length; i++) {
              this.dataSets[i].$focus.style("display", null);
            }
            this.$variablesInformation.style("display", null);
          }
        })
        .on("mouseout", () => {
          for (let i = 0; i < this.dataSets.length; i++) {
            this.dataSets[i].$focus.style("display", "none");
          }
          this.$variablesInformation.style("display", "none");
          this.lastMousePos = [-1, -1];
        })
        .on("mousemove", (event) => this.mousemove(event));

      let controlContainerLeft = this.chartWidth - this.CONTROL_CONTAINER_WIDTH;
      let $controlContainer = d3
        .select("#" + this.divId)
        .append("form")
        .append("div")
        .style("position", "absolute")
        .style("top", "5px")
        .style("left", controlContainerLeft + "px")
        .style("display", "flex")
        .style("float", "left")
        .style("align-items", "center");

      $controlContainer
        .append("input")
        .attr("id", this.divId + "_checkboxShowPoints")
        .attr("type", "checkbox")
        .property("checked", this.pointsAreRendered)
        .on("change", () => this.showPoints());

      $controlContainer
        .append("label")
        .text("Show Points")
        .style("font-size", "12px")
        .style("padding-right", "10px")
        .on("click", () => {
          let checkBoxSelected = d3
            .select("#" + this.divId + "_checkboxShowPoints")
            .property("checked");
          d3.select("#" + this.divId + "_checkboxShowPoints").property(
            "checked",
            checkBoxSelected == 1 ? 0 : 1
          );
          this.showPoints();
        });

      let $zoomOrBrushButton = $controlContainer
        .append("button")
        .text("Zoom")
        .style("width", "70px")
        .style("min-height", "14px")
        .style("font-size", "12px")
        .style("margin-right", "10px")
        .style("background-color", "var(--nr-dashboard-widgetColor)")
        .style("color", "white")
        .style("border-radius", "2px")
        .style("border", "0px")
        .style("outline", "none")
        .on("mouseover", () => {
          $zoomOrBrushButton.style("opacity", "0.8");
        })
        .on("mouseout", () => {
          $zoomOrBrushButton.style("opacity", "1");
        })
        .on("click", () => {
          let buttonText = "";
          $zoomOrBrushButton.style("opacity", "0.5");
          if (this.brushSelected === true) {
            this.brushSelected = false;
            buttonText = "Brush";
          } else {
            this.brushSelected = true;
            buttonText = "Zoom";
          }
          this.configureBrushOrZoom(this.brushSelected);
          $zoomOrBrushButton.text(buttonText);
          $zoomOrBrushButton.transition().duration(500).style("opacity", "1");
        });

      let $showAllButton = $controlContainer
        .append("button")
        .text("Show All")
        .style("width", "70px")
        .style("min-height", "14px")
        .style("font-size", "12px")
        .style("background-color", "var(--nr-dashboard-widgetColor)")
        .style("color", "white")
        .style("border-radius", "2px")
        .style("border", "0px")
        .style("outline", "none")
        .on("mouseover", () => {
          $showAllButton.style("opacity", "0.8");
        })
        .on("mouseout", () => {
          $showAllButton.style("opacity", "1");
        })
        .on("click", () => {
          $showAllButton.style("opacity", "0.5");
          this.renderFullData();
          $showAllButton.transition().duration(500).style("opacity", "1");
        });

      let variablesContainerTop =
        this.chartMargin.top +
        this.chartHeight +
        this.VARIABLES_CONTAINER_MARGIN_TOP;
      this.$variablesContainer = d3
        .select("#" + this.divId)
        .append("div")
        .style("position", "absolute")
        .style("top", variablesContainerTop + "px")
        .style("left", "0px")
        .style("width", this.width + "px")
        .style("display", "flex")
        .style("flex-wrap", "wrap")
        .style("align-items", "center")
        .style("justify-content", "space-around");

      this.$variablesInformation = this.$chart
        .append("g")
        .style("display", "none");
    }

    /**
     * Redraw dynamically chart.
     * This function can be called during the acquisition (renderData), when showing all data or after zooming.
     *
     * @param {number} xMin - XAxis min value.
     * @param {number} xMax - XAxis max value.
     * @param {number} yMin - YAxis min value.
     * @param {number} yMax - YAxis max value.
     * @param {number} zoomIsActive - True if reDrawChart is called after zooming.
     */
    reDrawChart(xMin, xMax, yMin, yMax, zoomIsActive) {
      // console.log("reDrawChart - xMin = " + xMin + ", xMax = " + xMax + ", yMin = " + yMin + ", yMax = " + yMax);
      let currentXScale, currentYScale;
      let chartSizeUpdated = false;

      if (zoomIsActive && !this.brushSelected && this.zoomTransform.k !== 1) {
        currentXScale = this.xScaleTransform;
        currentYScale = this.yScaleTransform;
      } else {
        currentXScale = this.xScale;
        currentYScale = this.yScale;
      }

      // update current scale domains
      currentXScale.domain([xMin, xMax]);
      currentYScale.domain([yMin, yMax]);
      this.xAxis = this.xAxis.scale(currentXScale);
      this.yAxis = this.yAxis.scale(currentYScale);
      this.$xAxis = this.$xAxis.call(this.xAxis);
      this.$yAxis = this.$yAxis.call(this.yAxis);

      // Get the length of the Y-AXIS values
      let yAxisValues = [];
      this.$yAxis
        .selectAll(".tick")
        .selectAll("text")
        .select(function () {
          yAxisValues.push(this.getComputedTextLength());
        });

      // Compute the new chart left margin.
      // Apply one hysteresis to avoid to update chart for small updates
      // If update higher than hysteresis, compute the new chart width
      let yAxisValuesMax = d3.max(yAxisValues);
      if (
        yAxisValuesMax > this.chartMargin.left - 25 ||
        yAxisValuesMax < this.chartMargin.left - 35
      ) {
        this.chartMargin.left = 25 + Math.ceil(yAxisValuesMax / 10) * 10;
        this.chartWidth =
          this.width - this.chartMargin.left - this.chartMargin.right;
        chartSizeUpdated = true;
      }

      // compute the height of the variables container if new variables has been added
      // Update chart bottom margin following the height of the variables container
      if (this.variablesContainerUpdated === true) {
        let variablesContainerHeight = this.$variablesContainer
          .node()
          .getBoundingClientRect().height;
        this.chartMargin.bottom =
          this.DEFAULT_CHART_MARGIN_BOTTOM +
          Math.ceil(variablesContainerHeight / 10) * 10;
        // console.log ("this.chartMargin.bottom = " + this.chartMargin.bottom);
        this.chartHeight =
          this.height - this.chartMargin.top - this.chartMargin.bottom;
        chartSizeUpdated = true;
        this.variablesContainerUpdated = false;
      }

      if (chartSizeUpdated === true) {
        // Update the position of all graphical elements
        // console.log("CHARTSIZEUPDATED - this.chartWidth = " + this.chartWidth + ", this.chartHeight = "
        // + this.chartHeight);

        this.$clipPath = d3
          .select("#" + this.divId + "_clip")
          .select("rect")
          .attr("width", this.chartWidth)
          .attr("height", this.chartHeight);

        currentXScale = currentXScale
          .range([0, this.chartWidth])
          .domain([xMin, xMax]);
        this.xScale = this.xScale.range([0, this.chartWidth]);

        currentYScale = currentYScale
          .range([this.chartHeight, 0])
          .domain([yMin, yMax]);
        this.yScale = this.yScale.range([this.chartHeight, 0]);

        this.xAxis = this.xAxis
          .tickArguments([this.chartWidth / this.TICK_LABEL_WIDTH])
          .scale(currentXScale);
        this.yAxis = this.yAxis
          .tickArguments([this.chartHeight / this.TICK_LABEL_HEIGHT])
          .scale(currentYScale)
          .tickSizeInner(-this.chartWidth);

        this.$chart = this.$chart.attr(
          "transform",
          "translate(" +
            this.chartMargin.left +
            "," +
            this.chartMargin.top +
            ")"
        );

        this.$xAxis = this.$xAxis
          .attr("transform", "translate(0," + this.chartHeight + ")")
          .call(this.xAxis);

        this.$yAxis = this.$yAxis.call(this.yAxis);

        this.$xAxisTitle = this.$xAxisTitle.attr(
          "transform",
          "translate(" +
            this.chartWidth / 2 +
            "," +
            (this.chartMargin.top +
              this.chartHeight +
              this.X_AXIS_TITLE_MARGIN_TOP) +
            ")"
        );

        this.$brush = this.$brush
          .attr("clip-path", "url(#" + this.divId + "_clip)")
          .call(this.brush);

        this.$brush
          .select(".overlay")
          .attr("width", this.chartWidth)
          .attr("height", this.chartHeight);

        let variablesContainerTop =
          this.chartMargin.top +
          this.chartHeight +
          this.VARIABLES_CONTAINER_MARGIN_TOP;
        this.$variablesContainer = this.$variablesContainer.style(
          "top",
          variablesContainerTop + "px"
        );

        if (this.$zoom && zoomIsActive) {
          let xCenter = this.xScale((xMax + xMin) / 2);
          let yCenter = this.yScale((yMax + yMin) / 2);

          let initialScale = this.zoomTransform.k;
          // console.log("zoomTransform.k = " + zoomTransform.k);

          let initialTranslate = [
            (this.chartWidth * (1 - this.zoomTransform.k)) / 2 +
              (-xCenter + this.chartWidth / 2) * this.zoomTransform.k,
            (this.chartHeight * (1 - this.zoomTransform.k)) / 2 +
              (-yCenter + this.chartHeight / 2) * this.zoomTransform.k
          ];
          // console.log ("initialTranslate = " + initialTranslate);

          this.zoom = this.zoom
            .translateExtent([
              [0, 0],
              [this.chartWidth, this.chartHeight]
            ])
            .extent([
              [0, 0],
              [this.chartWidth, this.chartHeight]
            ]);

          this.$zoom = this.$zoom
            .attr("width", this.chartWidth)
            .attr("height", this.chartHeight)
            .attr("clip-path", "url(#" + this.divId + "_clip)")
            .call(
              this.zoom.transform,
              d3.zoomIdentity
                .translate(initialTranslate[0], initialTranslate[1])
                .scale(initialScale)
            );
        }

        // console.log("CHARTSIZEUPDATED - END")
      }

      // console.log("reDrawChart - end");
    }

    /**
     * Returns the visible points of an array of data.
     * This function is called when zooming.
     * Returns the points from the first point on the left of the left domain border to the first point on the
     * right of the right domain border.
     *
     * @param {Array} data - Input values.
     * @param {number} xMin - X axis min.
     * @param {number} xMax - Y axis max value.
     */
    visiblePoints(data, xMin, xMax) {
      // find the first point on the left of the left border
      let leftBorderIndex = data.findIndex((elem) => elem.x > xMin);
      if (leftBorderIndex > 0) {
        leftBorderIndex--;
      }

      // find the first point on the right of the right border
      let rightBorderIndex = data.findIndex((elem) => elem.x > xMax);
      if (rightBorderIndex === -1) {
        rightBorderIndex = data.length;
      } else {
        rightBorderIndex++;
      }

      let visibleData = data.slice(leftBorderIndex, rightBorderIndex);
      return visibleData;
    }

    /**
     * Discard the input values older than DURATION_OF_VALIDITY value.
     */
    discardOldestPoints() {
      let startValidityPeriod;
      for (
        let indexDataSet = 0;
        indexDataSet < this.dataSets.length;
        indexDataSet++
      ) {
        // Compute the start of the validity period
        startValidityPeriod =
          this.dataSets[indexDataSet].fullData[
            this.dataSets[indexDataSet].fullData.length - 1
          ].x - this.DURATION_OF_VALIDITY;

        // Identify the older point which is still in period of validity
        for (
          let indexData = 0;
          indexData < this.dataSets[indexDataSet].fullData.length;
          indexData++
        ) {
          if (
            startValidityPeriod <
            this.dataSets[indexDataSet].fullData[indexData].x
          ) {
            if (indexData !== 0) {
              this.dataSets[indexDataSet].fullData =
                this.dataSets[indexDataSet].fullData.slice(indexData);
            }
            break;
          }
        }
      }
    }

    /**
     * Subsample data.
     *
     * @param {Array} data - Data to be subsampled.
     * @param {number} expectedDataLength - Expected subsampled data length.
     * @returns {Array} Subsampled data.
     */
    subsample(data, expectedDataLength) {
      // let startTime = new Date().getTime();
      // let subSamplingTime = 0;

      let sampledData = [];

      this.bucketSize = Math.round(data.length / expectedDataLength);
      this.sampler.bucketSize(this.bucketSize);
      sampledData = this.sampler(data);

      // subSamplingTime = new Date().getTime() - startTime;
      // console.log ("subSamplingTime = " + subSamplingTime);

      return sampledData;
    }

    /**
     * Listener when selecting / deselecting "show points" checkbox.
     */
    showPoints() {
      let currentXScale, currentYScale;

      if (!this.brushSelected && this.zoomTransform.k !== 1) {
        currentXScale = this.xScaleTransform;
        currentYScale = this.yScaleTransform;
      } else {
        currentXScale = this.xScale;
        currentYScale = this.yScale;
      }

      this.pointsAreRendered = d3
        .select("#" + this.divId + "_checkboxShowPoints")
        .property("checked");

      for (let i = 0; i < this.dataSets.length; i++) {
        // Redraw points
        this.drawDots(
          this.dataSets[i].$dots,
          this.dataSets[i].visibleData,
          currentXScale,
          currentYScale,
          this.lineColor(this.dataSets[i].index % 10)
        );
      }
    }

    /**
     * Listener when clicking on "zoom"/"brush" button.
     *
     * @param {boolean} selectBrush - Boolean indicating if brush or zoom is selected.
     */
    configureBrushOrZoom(selectBrush) {
      if (selectBrush === false) {
        // switch from brush to zoom
        // console.log("switch from brush to zoom");
        let fullDomains;
        let brushSelection, fullSelection;
        let scales, initialScale, initialTranslate;
        let emptyData = this.dataSets.every(
          (elem) => elem.fullData.length === 0
        );

        // Compute initial zoom configuration (initialScale, initialTranslate)
        if (this.dataSets.length === 0 || emptyData) {
          initialScale = 1;
          initialTranslate = [0, 0];
        } else {
          brushSelection = {
            xMin: this.xScale.domain()[0],
            xMax: this.xScale.domain()[1],
            xCenter: (this.xScale.domain()[0] + this.xScale.domain()[1]) / 2,
            yMin: this.yScale.domain()[0],
            yMax: this.yScale.domain()[1],
            yCenter: (this.yScale.domain()[0] + this.yScale.domain()[1]) / 2
          };
          // console.log ("brushSelection = " + JSON.stringify(brushSelection));

          fullDomains = this.getDomains(true);
          // console.log ("fullDomains = " + JSON.stringify(fullDomains));

          scales = {
            top:
              (fullDomains.yMax - brushSelection.yCenter) /
              (brushSelection.yMax - brushSelection.yCenter),
            right:
              (fullDomains.xMax - brushSelection.xCenter) /
              (brushSelection.xMax - brushSelection.xCenter),
            bottom:
              (fullDomains.yMin - brushSelection.yCenter) /
              (brushSelection.yMin - brushSelection.yCenter),
            left:
              (fullDomains.xMin - brushSelection.xCenter) /
              (brushSelection.xMin - brushSelection.xCenter)
          };
          // console.log ("scales = " + JSON.stringify(scales));

          initialScale = d3.max([
            scales.top,
            scales.right,
            scales.bottom,
            scales.left
          ]);
          // console.log ("initialScale = " + initialScale);

          fullSelection = {
            xMin:
              brushSelection.xCenter +
              initialScale * (brushSelection.xMin - brushSelection.xCenter),
            xMax:
              brushSelection.xCenter +
              initialScale * (brushSelection.xMax - brushSelection.xCenter),
            yMin:
              brushSelection.yCenter +
              initialScale * (brushSelection.yMin - brushSelection.yCenter),
            yMax:
              brushSelection.yCenter +
              initialScale * (brushSelection.yMax - brushSelection.yCenter)
          };
          // console.log("fullSelection = " + JSON.stringify(fullSelection));

          this.xScale.domain([fullSelection.xMin, fullSelection.xMax]);
          this.yScale.domain([fullSelection.yMin, fullSelection.yMax]);
          this.$xAxis.call(this.xAxis);
          this.$yAxis.call(this.yAxis);

          initialTranslate = [
            (this.chartWidth * (1 - initialScale)) / 2,
            (this.chartHeight * (1 - initialScale)) / 2
          ];
          // console.log ("initialTranslate = " + initialTranslate);
        }

        // Add zoom object
        this.zoom = d3
          .zoom()
          .scaleExtent([1, Infinity])
          .translateExtent([
            [0, 0],
            [this.chartWidth, this.chartHeight]
          ])
          .extent([
            [0, 0],
            [this.chartWidth, this.chartHeight]
          ])
          .on("zoom", (event) => this.zoomed(event));

        this.$zoom = this.$chart
          .append("rect")
          .attr("width", this.chartWidth)
          .attr("height", this.chartHeight)
          .attr("clip-path", "url(#" + this.divId + "_clip)")
          .style("fill", "none")
          .style("pointer-events", "all")
          .on("mouseover", () => {
            if (this.pointsAreRendered) {
              for (let i = 0; i < this.dataSets.length; i++) {
                this.dataSets[i].$focus.style("display", null);
              }
              this.$variablesInformation.style("display", null);
            }
          })
          .on("mouseout", () => {
            for (let i = 0; i < this.dataSets.length; i++) {
              this.dataSets[i].$focus.style("display", "none");
            }
            this.$variablesInformation.style("display", "none");
            this.lastMousePos = [-1, -1];
          })
          .on("mousemove", (event) => this.mousemove(event))
          .call(this.zoom)
          .call(
            this.zoom.transform,
            d3.zoomIdentity
              .translate(initialTranslate[0], initialTranslate[1])
              .scale(initialScale)
          );
      } else {
        // switch from zoom to brush
        // console.log("switch from zoom to brush");

        // Set xScale and yScale domains following current xScaleTransform and yScaleTransform values
        this.xScale.domain(this.xScaleTransform.domain());
        this.yScale.domain(this.yScaleTransform.domain());

        // Remove zoom object
        this.$zoom.on(".zoom", null);
        this.$zoom.remove();
        this.$zoom = null;

        // Redraw chart
        this.reDrawChart(
          this.xScale.domain()[0],
          this.xScale.domain()[1],
          this.yScale.domain()[0],
          this.yScale.domain()[1],
          false
        );
      }
    }

    /**
     * Listener when moving mouse over chart.
     *
     * @param {object} event - 3 event.
     */
    mousemove(event) {
      let currentXScale, currentYScale;

      if (!this.brushSelected && this.zoomTransform.k !== 1) {
        currentXScale = this.xScaleTransform;
        currentYScale = this.yScaleTransform;
      } else {
        currentXScale = this.xScale;
        currentYScale = this.yScale;
      }

      this.drawVariablesInfo(event, currentXScale, currentYScale);
    }

    /**
     * Listener when zoom is ended.
     *
     * @param {object} event - D3 event.
     */
    zoomed(event) {
      // let startTime = new Date().getTime();
      // let renderingTime = 0;

      // Get zoom transformation values (scale, translation)
      this.zoomTransform = event.transform;

      // Compute X & Y scales
      this.xScaleTransform = this.zoomTransform.rescaleX(this.xScale);
      this.yScaleTransform = this.zoomTransform.rescaleY(this.yScale);
      // console.log("zoomed - k = " + this.zoomTransform.k + " - x = " + this.zoomTransform.x + " - y = " + this.zoomTransform.y
      //   + " - xDomain = " + this.xScaleTransform.domain() + " - yDomain = " + this.yScaleTransform.domain());

      // keep only visible points
      // Subsample data if the number of points is higher than subsampling threshold
      let dataSetsSubsamplingThreshold = Math.ceil(
        this.MAX_RENDERED_POINTS / this.dataSets.length
      );
      for (let i = 0; i < this.dataSets.length; i++) {
        let zoomData = this.visiblePoints(
          this.dataSets[i].fullData,
          this.xScaleTransform.domain()[0],
          this.xScaleTransform.domain()[1]
        );

        if (zoomData.length > dataSetsSubsamplingThreshold) {
          this.dataSets[i].visibleData = this.subsample(
            zoomData,
            dataSetsSubsamplingThreshold
          );
        } else {
          this.dataSets[i].visibleData = zoomData;
        }
      }

      this.reDrawChart(
        this.xScaleTransform.domain()[0],
        this.xScaleTransform.domain()[1],
        this.yScaleTransform.domain()[0],
        this.yScaleTransform.domain()[1],
        true
      );

      for (let i = 0; i < this.dataSets.length; i++) {
        // Redraw line
        this.drawPath(
          this.dataSets[i].$path,
          this.dataSets[i].visibleData,
          this.xScaleTransform,
          this.yScaleTransform
        );

        // Redraw points
        this.drawDots(
          this.dataSets[i].$dots,
          this.dataSets[i].visibleData,
          this.xScaleTransform,
          this.yScaleTransform,
          this.lineColor(this.dataSets[i].index % 10)
        );
      }

      // Update point(s) focus
      this.drawVariablesInfo(event, this.xScaleTransform, this.yScaleTransform);

      // renderingTime = new Date().getTime() - startTime;
      // console.log("Zoom renderingTime = " + renderingTime);
    }

    /**
     * Listener when brush is ended.
     *
     * @param {object} event - D3 event.
     */
    brushended(event) {
      // Get the brush selection values
      let s = event.selection;

      if (!s) {
        // Timeout to detect a double-click on the brush area.
        if (!this.idleTimeout)
          return (this.idleTimeout = setTimeout(
            () => this.idled(),
            this.IDLE_DELAY
          ));
        this.renderFullData();
      } else {
        // Compute the X & Y domains corresponding to the brush selection
        this.xScale.domain(
          [s[0][0], s[1][0]].map(this.xScale.invert, this.xScale)
        );
        this.yScale.domain(
          [s[1][1], s[0][1]].map(this.yScale.invert, this.yScale)
        );
        // Remove the brush
        this.$brush.call(this.brush.clear);
      }
      // Zoom the brush selection
      this.zoomBrushSelection();
    }

    /**
     * Brush timer callback.
     * Allow to detect a double-click on the brush area.
     */
    idled() {
      this.idleTimeout = null;
    }

    /**
     * Zoom the brush selection.
     */
    zoomBrushSelection() {
      // let startTime = new Date().getTime();
      // let renderingTime = 0;

      // keep only visible points
      // Subsample data if the number of points is higher than subsampling threshold
      let dataSetsSubsamplingThreshold = Math.ceil(
        this.MAX_RENDERED_POINTS / this.dataSets.length
      );
      for (let i = 0; i < this.dataSets.length; i++) {
        let brushSelectionData = this.visiblePoints(
          this.dataSets[i].fullData,
          this.xScale.domain()[0],
          this.xScale.domain()[1]
        );

        if (brushSelectionData.length > dataSetsSubsamplingThreshold) {
          this.dataSets[i].visibleData = this.subsample(
            brushSelectionData,
            dataSetsSubsamplingThreshold
          );
        } else {
          this.dataSets[i].visibleData = brushSelectionData;
        }
      }

      this.reDrawChart(
        this.xScale.domain()[0],
        this.xScale.domain()[1],
        this.yScale.domain()[0],
        this.yScale.domain()[1],
        false
      );

      for (let i = 0; i < this.dataSets.length; i++) {
        // Redraw line
        this.drawPath(
          this.dataSets[i].$path,
          this.dataSets[i].visibleData,
          this.xScale,
          this.yScale
        );

        // Redraw points
        this.drawDots(
          this.dataSets[i].$dots,
          this.dataSets[i].visibleData,
          this.xScale,
          this.yScale,
          this.lineColor(this.dataSets[i].index % 10)
        );
      }

      // renderingTime = new Date().getTime() - startTime;
      // console.log("Brush renderingTime = " + renderingTime);
    }

    /**
     * Get the X and Y domains of data.
     * Add a margin of 10% for the Y domain lower and upper bounds.
     *
     * @param {boolean} isForFullData - If true, data are the "full data" else data are the "visible data".
     * @returns {object} - Object containing xMin, xMax, yMin and yMax.
     */
    getDomains(isForFullData) {
      const Y_AXIS_MARGIN = 10; // Add one margin of (at least) Y_AXIS_MARGIN units for Y Axis;
      let data = [];
      let xMinForEachDataSet = [];
      let xMaxForEachDataSet = [];
      let yMinForEachDataSet = [];
      let yMaxForEachDataSet = [];
      let xMin, xMax, yMin, yMax, yMinWithMargin, yMaxWithMargin;

      for (let i = 0; i < this.dataSets.length; i++) {
        let currentOpacity = this.dataSets[i].$path.style("opacity");
        if (currentOpacity == 1) {
          if (isForFullData) {
            data.push(this.dataSets[i].fullData);
          } else {
            data.push(this.dataSets[i].visibleData);
          }
        }
      }

      // Identify the xMin, xMax, yMin and yMax for each path
      for (let i = 0; i < data.length; i++) {
        xMinForEachDataSet.push(
          d3.min(
            data[i].map(function (d) {
              return d.x;
            })
          )
        );
        xMaxForEachDataSet.push(
          d3.max(
            data[i].map(function (d) {
              return d.x;
            })
          )
        );
        yMinForEachDataSet.push(
          d3.min(
            data[i].map(function (d) {
              return d.y;
            })
          )
        );
        yMaxForEachDataSet.push(
          d3.max(
            data[i].map(function (d) {
              return d.y;
            })
          )
        );
      }

      xMin = d3.min(xMinForEachDataSet);
      // console.log ("xMin = " + xMin);
      xMax = d3.max(xMaxForEachDataSet);
      // console.log ("xMax = " + xMax);

      yMin = d3.min(yMinForEachDataSet);
      yMax = d3.max(yMaxForEachDataSet);
      if (yMin === yMax) {
        // If all the variables have the same value
        if (yMin === 0) {
          yMinWithMargin = yMin - Y_AXIS_MARGIN;
          yMaxWithMargin = yMax + Y_AXIS_MARGIN;
        } else if (yMin > 0) {
          yMinWithMargin = yMin * 0.9;
          yMaxWithMargin = yMax * 1.1;
        } else {
          yMinWithMargin = yMin * 1.1;
          yMaxWithMargin = yMax * 0.9;
        }
      } else {
        // All the variables have not all the same value
        // Add a margin of 10% in lower and upper bound (with a minimal value of 10)
        let margin = (yMax - yMin) / 10;
        yMinWithMargin =
          Math.floor((yMin - margin) / Y_AXIS_MARGIN) * Y_AXIS_MARGIN;
        yMaxWithMargin =
          Math.ceil((yMax + margin) / Y_AXIS_MARGIN) * Y_AXIS_MARGIN;
      }
      // console.log("yMinWithMargin = " + yMinWithMargin + " - yMaxWithMargin = " + yMaxWithMargin);

      return {
        xMin: xMin,
        xMax: xMax,
        yMin: yMinWithMargin,
        yMax: yMaxWithMargin
      };
    }

    /**
     * Draw path of the variable.
     *
     * @param {object} graphicElement - D3 path.
     * @param {Array} data - Data linked to the path.
     * @param {Function} xScaleParam - X scale.
     * @param {Function} yScaleParam - Y scale.
     */
    drawPath(graphicElement, data, xScaleParam, yScaleParam) {
      graphicElement.datum(data).attr(
        "d",
        this.line
          .x(function (d) {
            return xScaleParam(d.x);
          })
          .y(function (d) {
            return yScaleParam(d.y);
          })
      );
    }

    /**
     * Draw dots of the variable.
     *
     * @param {object} graphicElement - D3 group of circles.
     * @param {Array} data - Data linked to the dots.
     * @param {Function} xScaleParam - X scale.
     * @param {Function} yScaleParam - Y scale.
     * @param {number} color - Dots color.
     */
    drawDots(graphicElement, data, xScaleParam, yScaleParam, color) {
      if (
        !this.pointsAreRendered ||
        data.length > this.MAX_RENDERED_DOTS_PER_VARIABLE
      ) {
        // End user has not selected the "show points" checkbox
        // Or there are more than MAX_RENDERED_DOTS_PER_VARIABLE to render
        // Remove all the circles from the group of circles
        graphicElement.selectAll(".circles").data([]).exit().remove();
      } else {
        // Redraw points
        let dots = graphicElement.selectAll(".circles").data(data);
        // Add circles for the new data
        dots
          .enter()
          .append("circle")
          .merge(dots)
          .attr("r", 2)
          .attr("cx", function (d) {
            return xScaleParam(d.x);
          })
          .attr("cy", function (d) {
            return yScaleParam(d.y);
          })
          .style("fill", color)
          .attr("class", "circles");
        // Remove circles for the previous data no longer existing in the new data
        dots.exit().remove();
      }
    }

    /**
     * Draw focus of the variable.
     *
     * @param {object} graphicElement - Focus of the variable.
     * @param {object} point - Coordinate of the point.
     * @param {number} opacity - Focus opacity.
     * @param {Function} xScaleParam - X scale.
     * @param {Function} yScaleParam - Y scale.
     */
    drawFocus(graphicElement, point, opacity, xScaleParam, yScaleParam) {
      graphicElement
        .select("circle")
        .attr("cx", function () {
          return xScaleParam(point.x);
        })
        .attr("cy", function () {
          return yScaleParam(point.y);
        })
        .style("opacity", opacity);
    }

    /**
     * Identify all points closest of the mouse pointer.
     *
     * @param {number} mouseXValue - X value of the mouse position.
     * @returns {Array} - List of points.
     */
    getFocusPoints(mouseXValue) {
      // Determine the visibleData index corresponding to the mouse position
      let focusPoints = [];

      for (let index = 0; index < this.dataSets.length; index++) {
        let pathOpacity = this.dataSets[index].$path.style("opacity");
        if (pathOpacity == 0) {
          // End user has previously click on variable name to hide the path
          // Then information about the variable should be hidden
          focusPoints.push({
            indexDataSet: index,
            point: { x: 0, y: 0 },
            opacity: 0
          });
        } else if (this.dataSets[index].visibleData.length > 0) {
          // Compute the insertion index in visible data corresponding to the mouse position
          let i = this.bisector(this.dataSets[index].visibleData, mouseXValue);

          let point0, point1;
          // Identify the closest point on the left of the mouse
          if (i > 0) {
            point0 = this.dataSets[index].visibleData[i - 1];
          } else {
            point0 = this.dataSets[index].visibleData[0];
          }
          // Identify the closest point on the right of the mouse
          if (i > this.dataSets[index].visibleData.length - 1) {
            point1 = point0;
          } else {
            point1 = this.dataSets[index].visibleData[i];
          }
          // Compute the point which is the closest of the the mouse focus
          let point =
            mouseXValue - point0.x > point1.x - mouseXValue ? point1 : point0;

          // console.log ("index = " + index + ", i = " + i + ", point = " + point.x + ", " + point.y);
          focusPoints.push({
            indexDataSet: index,
            point: point,
            opacity: 1
          });
        }
      }

      // Compute the distance of the points closest of the mouse pointer
      let minimalDistance = d3.min(
        focusPoints.map(function (d) {
          return Math.abs(d.point.x - mouseXValue);
        })
      );
      // console.log ("minimalDistance = " + minimalDistance);

      // Set the opacity to 0 for points farer than the closest points
      for (let index = 0; index < focusPoints.length; index++) {
        if (
          Math.abs(focusPoints[index].point.x - mouseXValue) - minimalDistance >
          0.0000001
        ) {
          focusPoints[index].opacity = 0;
        }
      }

      return focusPoints;
    }

    /**
     * Draw variables information.
     * Variables information includes:
     *   - the vertical dashed line,
     *   - the focus closest to the vertical line for each variable,
     *   - the panel containing information (X & Y values) for each focus.
     *
     * @param {object} event - D3 event.
     * @param {Function} xScaleParam - X scale.
     * @param {Function} yScaleParam - Y scale.
     */
    drawVariablesInfo(event, xScaleParam, yScaleParam) {
      // Draw variables information only if checkbox "Show Points" is selected
      if (this.pointsAreRendered) {
        // Shift (in px) between the X mouse position and rectangle containing variables information
        const SHIFT = 10;
        // Padding (in px) inside the rectangle containing variables information
        const PADDING = 5;
        // Font size (in px) of the variables text inside the rectangle
        const VARIABLE_TEXT_FONT = 12;
        // Mouse Position (X & Y in px)
        let mousePos;
        // Mouse Position (x & Y values)
        let mouseValues;

        // Determine the mouse position above the graph
        if (event !== null) {
          // drawVariablesInfo has been called when the end user has moved the mouse over the graph or
          // has zoomed the graph
          mousePos = d3.pointer(event);
          if (isNaN(mousePos[0]) || isNaN(mousePos[1])) {
            // It can happen that d3.pointer returns an invalid position when zooming.
            return;
          }
          // Save this position
          this.lastMousePos = mousePos;
        } else {
          // drawVariablesInfo has been called when the acquisition is ongoing
          if (this.lastMousePos[0] === -1 && this.lastMousePos[1] === -1) {
            // Mouse is not over the graph
            return;
          } else {
            // Mouse is over the graph. Use the last mouse position
            mousePos = this.lastMousePos;
          }
        }

        // Compute the values from the X & Y domains using the mouse position (in px)
        mouseValues = {
          x: xScaleParam.invert(mousePos[0]),
          y: yScaleParam.invert(mousePos[1])
        };
        // console.log ("mousePos = " + mousePos + ", mouseValues.x = " + mouseValues.x + ", mouseValues.y = "
        // + mouseValues.y);

        // Identify all points closest of the mouse pointer
        let focusPoints = this.getFocusPoints(mouseValues.x);

        for (let i = 0; i < focusPoints.length; i++) {
          // Draw focus for each closest point of the mouse pointer.
          // opacity field will indicate whether the focus should be displayed or hidden
          this.drawFocus(
            this.dataSets[focusPoints[i].indexDataSet].$focus,
            focusPoints[i].point,
            focusPoints[i].opacity,
            xScaleParam,
            yScaleParam
          );
        }

        // remove previous values from $variablesInformation
        this.$variablesInformation
          .selectAll(".variablesInfo")
          .data([])
          .exit()
          .remove();

        // Display information in one rectangle of all displayed focus points
        let displayedFocusPoints = focusPoints.filter(
          (elem) => elem.opacity == 1
        );
        if (displayedFocusPoints.length !== 0) {
          let rectPosX = mousePos[0] + SHIFT;
          let rectPosY = mousePos[1];

          // draw vertical dashed line at mouse pointer position
          let linePos = xScaleParam(displayedFocusPoints[0].point.x);
          this.$variablesInformation
            .append("line")
            .attr("class", "variablesInfo")
            .attr("x1", linePos)
            .attr("y1", 0)
            .attr("x2", linePos)
            .attr("y2", this.chartHeight)
            .style("stroke-width", 2)
            .style("stroke-dasharray", "3,3")
            .style("stroke", "#C0C0C0")
            .style("pointer-events", "none")
            .style("fill", "none");

          // display text corresponding to the time value
          this.$variablesInformation
            .append("text")
            .attr("class", "variablesInfo")
            .text("time : " + displayedFocusPoints[0].point.x + " s")
            .attr("x", rectPosX + PADDING)
            .attr("y", rectPosY)
            .style("pointer-events", "none")
            .style("font-size", "12px");

          // display text for each variable (closest of the mouse pointer)
          let positionYDelta = VARIABLE_TEXT_FONT;
          for (let i = 0; i < displayedFocusPoints.length; i++) {
            this.$variablesInformation
              .append("text")
              .attr("class", "variablesInfo")
              .text(
                this.dataSets[displayedFocusPoints[i].indexDataSet].name +
                  ": " +
                  displayedFocusPoints[i].point.y
              )
              .attr("x", rectPosX + PADDING)
              .attr("y", rectPosY + positionYDelta)
              .style("font-size", "12px")
              .style("pointer-events", "none")
              .style(
                "fill",
                this.lineColor(displayedFocusPoints[i].indexDataSet % 10)
              );
            positionYDelta += VARIABLE_TEXT_FONT;
          }

          // Compute the width of the rectangle following the length of each text inside the rectangle
          let variablesInfoValuesLength = [];
          this.$variablesInformation.selectAll("text").select(function () {
            variablesInfoValuesLength.push(this.getComputedTextLength());
          });
          let variablesInformationRectWidth =
            d3.max(variablesInfoValuesLength) + 2 * PADDING;

          // If the rectangle is wider than the remaining space on the right, move the rectangle on the left
          if (rectPosX + variablesInformationRectWidth > this.chartWidth) {
            rectPosX = rectPosX - variablesInformationRectWidth - 2 * SHIFT;
            this.$variablesInformation
              .selectAll("text")
              .attr("x", rectPosX + PADDING);
          }

          // Display rectangle
          this.$variablesInformation
            .insert("rect", "text")
            .attr("class", "variablesInfo")
            .attr("x", rectPosX)
            .attr("y", rectPosY - VARIABLE_TEXT_FONT)
            .attr("width", variablesInformationRectWidth)
            .attr(
              "height",
              VARIABLE_TEXT_FONT * (displayedFocusPoints.length + 1) + PADDING
            )
            .attr("stroke", "black")
            .attr("fill", "white")
            .style("pointer-events", "none")
            .attr("stroke-width", 1);
        }
      }
    }

    /**
     * Listener when clicking on "Show All" button or when "double-clicking" in brush.
     */
    renderFullData() {
      // Clear the timer if it is running
      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
      }

      // return if no data to render
      let emptyData = this.dataSets.every((elem) => elem.fullData.length === 0);

      if (this.dataSets.length === 0 || emptyData) {
        return;
      }

      // let startTime = new Date().getTime();
      // let renderingTime = 0;

      // Subsample data if the number of points is higher than subsampling threshold
      let dataSetsSubsamplingThreshold = Math.ceil(
        this.MAX_RENDERED_POINTS / this.dataSets.length
      );
      for (let i = 0; i < this.dataSets.length; i++) {
        // console.log("dataSets[" + i + "].fullData.length = " + this.dataSets[i].fullData.length);
        if (this.dataSets[i].fullData.length > dataSetsSubsamplingThreshold) {
          this.dataSets[i].visibleData = this.subsample(
            this.dataSets[i].fullData,
            dataSetsSubsamplingThreshold
          );
        } else {
          this.dataSets[i].visibleData = this.dataSets[i].fullData.slice(0);
        }
      }

      // Get the X and Y domains of "full data"
      let fullDomains = this.getDomains(true);

      // Redraw chart
      this.reDrawChart(
        fullDomains.xMin,
        fullDomains.xMax,
        fullDomains.yMin,
        fullDomains.yMax,
        false
      );

      for (let i = 0; i < this.dataSets.length; i++) {
        // Redraw path
        this.drawPath(
          this.dataSets[i].$path,
          this.dataSets[i].visibleData,
          this.xScale,
          this.yScale
        );

        // Redraw points
        this.drawDots(
          this.dataSets[i].$dots,
          this.dataSets[i].visibleData,
          this.xScale,
          this.yScale,
          this.lineColor(this.dataSets[i].index % 10)
        );
      }

      if (this.$zoom) {
        // Reset zoom
        this.$zoom.call(this.zoom.transform, d3.zoomIdentity);
      }

      // renderingTime = new Date().getTime() - startTime;
      // console.log("renderingTime = " + renderingTime);
    }

    /**
     * Render data during the acquisition.
     * This function is called when timer occurs (each TIMER_DURATION duration).
     */
    renderData() {
      // return if no data received since the previous call of renderData()
      let dataReceived = false;
      for (let i = 0; i < this.dataSets.length; i++) {
        if (this.dataSets[i].lastData.length !== 0) {
          dataReceived = true;
          break;
        }
      }
      if (!dataReceived) {
        // Clear the timer if it is running
        if (this.timerId) {
          clearInterval(this.timerId);
          this.timerId = null;
        }
        return;
      }

      // let startTime = new Date().getTime();
      // let renderingTime = 0;

      let dataSetsSubsamplingThreshold = Math.ceil(
        this.MAX_RENDERED_POINTS_PER_TIMER_DURATION / this.dataSets.length
      );
      for (let i = 0; i < this.dataSets.length; i++) {
        // Subsample the latest data points if the number of points is higher than subsampling threshold
        if (this.dataSets[i].lastData.length > dataSetsSubsamplingThreshold) {
          this.dataSets[i].lastData = this.subsample(
            this.dataSets[i].lastData,
            dataSetsSubsamplingThreshold
          );
        }
        // Concatenate the "latest received data points" to the "visible data points"
        this.dataSets[i].visibleData = this.dataSets[i].visibleData.concat(
          this.dataSets[i].lastData
        );
        this.dataSets[i].lastData = [];
      }

      // Get the X and Y domains of "visible data"
      let visibleDomains = this.getDomains(false);

      // Remove points no longer displayed in the sliding window
      if (visibleDomains.xMax > this.WINDOW_SIZE) {
        visibleDomains.xMin = visibleDomains.xMax - this.WINDOW_SIZE;
      } else {
        visibleDomains.xMax = this.WINDOW_SIZE;
      }
      for (let i = 0; i < this.dataSets.length; i++) {
        this.dataSets[i].visibleData = this.visiblePoints(
          this.dataSets[i].visibleData,
          visibleDomains.xMin,
          visibleDomains.xMax
        );
      }

      // Redraw chart
      this.reDrawChart(
        visibleDomains.xMin,
        visibleDomains.xMax,
        visibleDomains.yMin,
        visibleDomains.yMax,
        false
      );

      for (let i = 0; i < this.dataSets.length; i++) {
        // Redraw path
        this.drawPath(
          this.dataSets[i].$path,
          this.dataSets[i].visibleData,
          this.xScale,
          this.yScale
        );

        // Redraw points
        this.drawDots(
          this.dataSets[i].$dots,
          this.dataSets[i].visibleData,
          this.xScale,
          this.yScale,
          this.lineColor(this.dataSets[i].index % 10)
        );
      }

      if (this.$zoom && this.zoomTransform.k !== 1) {
        // Reset zoom
        this.$zoom.call(this.zoom.transform, d3.zoomIdentity);
      }

      // Update variables information
      this.drawVariablesInfo(null, this.xScale, this.yScale);

      // Discard the oldest points (older than DURATION_OF_VALIDITY)
      this.renderingDataCounter++;
      if (this.renderingDataCounter % 100 == 0) {
        this.discardOldestPoints();
      }

      // renderingTime = new Date().getTime() - startTime;
      // console.log("renderingTime = " + renderingTime);
    }

    /**
     * Flush all data and reset all chart objects.
     */
    flushData() {
      // console.log("flush Data");

      // Save current opacities
      this.variableOpacities = this.dataSets.map(dataset => {
        return {
          index: dataset.index,
          opacity: dataset.$path.style("opacity")
        };
      });

      // console.info("Current dataSets: ", this.dataSets);
      // console.info("Saved opacities: ", this.variableOpacities);


      // Remove pathss, dots and focus
      for (let i = 0; i < this.dataSets.length; i++) {
        this.dataSets[i].$path.datum([]).attr("d", this.line);
        this.dataSets[i].$dots.selectAll(".circles").data([]).exit().remove();
        this.dataSets[i].$path.remove();
        this.dataSets[i].$dots.remove();
        this.dataSets[i].$focus.remove();
      }
      // Remove datasets
      for (let i = 0; i < this.dataSets.length; i++) {
        this.dataSets[i].lastData = [];
        this.dataSets[i].visibleData = [];
        this.dataSets[i].fullData = [];
      }
      this.dataSets = [];

      // Remove variables
      this.$variablesContainer.selectAll("div").remove();
      this.variablesContainerUpdated = true;

      // remove previous values from $variablesInformation
      this.$variablesInformation
        .selectAll(".variablesInfo")
        .data([])
        .exit()
        .remove();

      // Reset index
      this.variableIndex = 0;
      this.renderingDataCounter = 0;

      // Reset zoom
      if (this.$zoom) {
        this.$zoom.call(this.zoom.transform, d3.zoomIdentity);
      }

      // Redraw chart
      this.chartMargin.left = this.DEFAULT_CHART_MARGIN_LEFT;
      this.reDrawChart(0, this.WINDOW_SIZE, 0, 100, false);
    }

    /**
     * Restore variables opacity after flush.
     */
    restoreOpacities() {

        if (this.dataSets.length === 0) {
          console.warn("No datasets available to restore opacities.");
          return;
        }

        for (const dataset of this.dataSets) 
        {
          // console.log(`Dataset index: ${dataset.index}`);

          const savedOpacity = this.variableOpacities.find(opacity => opacity.index === dataset.index);
          
          if (savedOpacity) 
          {
            // console.log(`Restoring opacity for index ${dataset.index} and opacity:`, savedOpacity.opacity);

            this.dataSets[dataset.index].$path.style("opacity", savedOpacity.opacity );
            this.dataSets[dataset.index].$dots.style("opacity", savedOpacity.opacity );
            this.dataSets[dataset.index].$focus.style("opacity", savedOpacity.opacity);
            this.$variablesContainer
              .selectAll(".variable_" + dataset.index)
              .style("opacity", savedOpacity.opacity == 1 ? 1 : 0.5);

          } 
          else 
          {
            console.warn(`No saved opacity found for index ${dataset.index}`);
          }
        }
    }

    /** @NOTE:  
     * log, debug, dbg
     * 
     * to enable log console uncomment:
     * dashboard.webContents.openDevTools(); in main.js
     */
    

    /**
     * Return the dataset index of the group/variable.
     * If the group/variable does not exist in datasets, build a new data set and return the dataset index.
     *
     * @param {Array} datasets - Data sets.
     * @param {string} group - Variable group name.
     * @param {string} variable - Variable name.
     * @returns {number} - Dataset index.
     */
    findDataset(datasets, group, variable) {
      let varname = variable;
      for (let index = 0; index < datasets.length; ++index) {
        if (
          datasets[index].variablename == variable &&
          datasets[index].groupname == group
        ) {
          // return the index of the already existing data set
          return index;
        }
      }

      for (let i = 0; i < datasets.length; ++i) {
        if (datasets[i].variablename == variable) {
          varname = variable + "(" + group + ")";
          datasets[i].name =
            datasets[i].variablename + "(" + datasets[i].groupname + ")";
          this.$variablesContainer
            .select("#" + this.divId + "_variableContainer_" + i)
            .text(datasets[i].name);
          break;
        }
      }

      // No data set contains the variable => create a new dataset
      let newDataset = {
        name: varname,
        variablename: variable,
        groupname: group,
        index: this.variableIndex,
        lastData: [],
        visibleData: [],
        fullData: []
      };

      newDataset.$path = this.$chart
        .append("path")
        .attr("clip-path", "url(#" + this.divId + "_clip)")
        .style("fill", "none")
        .style("stroke", this.lineColor(this.variableIndex % 10))
        .style("stroke-width", "2px")
        .style("pointer-events", "none");

      newDataset.$dots = this.$chart
        .append("g")
        .attr("clip-path", "url(#" + this.divId + "_clip)")
        .style("pointer-events", "none");

      newDataset.$focus = this.$chart
        .append("g")
        .attr("clip-path", "url(#" + this.divId + "_clip)")
        .style("pointer-events", "none")
        .style("display", "none");

      newDataset.$focus
        .append("circle")
        .style("fill", "none")
        .style("stroke", "#2F4F4F")
        .attr("r", 5);

      let variableContainer = this.$variablesContainer
        .append("div")
        .attr("class", "variable_" + this.variableIndex)
        .attr("width", "10px")
        .attr("height", "10px")
        .style("display", "flex")
        .style("float", "left")
        .style("align-items", "center");

      variableContainer
        .append("svg")
        .attr("class", "variable_" + this.variableIndex)
        .attr("width", "10px")
        .attr("height", "10px")
        .append("circle")
        .attr("fill", this.lineColor(this.variableIndex % 10))
        .attr("r", 5)
        .attr("cx", 5)
        .attr("cy", 5);

      let self = this;
      variableContainer
        .append("button")
        .attr("id", this.divId + "_variableContainer_" + this.variableIndex)
        .attr("class", "chartVariableContainer variable_" + this.variableIndex)
        .text(newDataset.name)
        .style("left", "10px")
        .style("font-size", "12px")
        .style("background", "none")
        .style("color", "var(--nr-dashboard-widgetTextColor)")
        .style("border", "none")
        .on("click", function () {
          let variableIndex = parseInt(
            this.id.substring(this.id.lastIndexOf("_") + 1),
            10
          );
          // Change the opacity: from 0 to 1 or from 1 to 0
          let currentOpacity =
            self.dataSets[variableIndex].$path.style("opacity");
          self.dataSets[variableIndex].$path
            .transition()
            .style("opacity", currentOpacity == 1 ? 0 : 1);
          self.dataSets[variableIndex].$dots
            .transition()
            .style("opacity", currentOpacity == 1 ? 0 : 1);
          self.dataSets[variableIndex].$focus
            .transition()
            .style("opacity", currentOpacity == 1 ? 0 : 1);
          self.$variablesContainer
            .selectAll(".variable_" + variableIndex)
            .transition()
            .style("opacity", currentOpacity == 1 ? 0.5 : 1);
        });

      this.variableIndex++;
      this.variablesContainerUpdated = true;

      // Add new dataset in datasets
      datasets.push(newDataset);

      // remove and add again $variablesInformation to keep this element above the others graphical elements
      this.$variablesInformation.remove();
      this.$variablesInformation = this.$chart
        .append("g")
        .style("display", "none");

      // Return dataset index
      return datasets.length - 1;
    }

    /**
     * Clear the chart (stop & remove timer, flush all data and reset chart objets).
     */
    clearChart() {
      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
      }
      this.flushData();
      this.$waitingMsg.style("display", "none");
    }



    /**
     * Update chart with a new variable value.
     * This function can be called when data are coming from processing node (live mode) or when importing a previous
     * data log.
     *
     * @param {object} variable - Variable information (msg.payload).
     * @param {boolean} live - If true, data are coming from processing node else data are coming a data log.
     */
    updateChart(variable, live) {
      let datasets = this.dataSets;

      // if there is no data in dataSets, set the first timestamp.
      // This value will be the time "0" of the monitoring session
      if (datasets.length === 0 || this.firstts === null) {
        this.firstts = variable.variabledata[0].x;
      }

      // Start timer
      if (live) {
        if (!this.timerId) {
          this.timerId = setInterval(() => {
            this.renderData();
          }, this.TIMER_DURATION);

          this.$waitingMsg.style("display", "block");
        }
      }

      if (
        variable.variabledata[0].y != undefined &&
        variable.variabledata[0].y != null &&
        !isNaN(variable.variabledata[0].y)
      ) {
        this.$waitingMsg.style("display", "none");
      }

      // Get the index dataset
      let indexdataset = this.findDataset(
        datasets,
        variable.groupname,
        variable.variablename
      );
      for (let i = 0; i < variable.variabledata.length; i++) {
        // Discard the variable data if the Y value is not correct (undefined, null or not a number)
        if (
          !(
            variable.variabledata[i].y == undefined ||
            variable.variabledata[i].y == null ||
            isNaN(variable.variabledata[i].y)
          )
        ) {
          // Reset the data x value (by taking into account the first timestamp) and convert x value from ms to s
          variable.variabledata[i].x =
            (variable.variabledata[i].x - this.firstts) / 1000;

          // push data in fullData array
          datasets[indexdataset].fullData.push(variable.variabledata[i]);

          // push data in lastData array (in case of live only)
          if (live) {
            datasets[indexdataset].lastData.push(variable.variabledata[i]);
          }
        }
      }
    }
  }

  window.LineChart = LineChart;
})();
