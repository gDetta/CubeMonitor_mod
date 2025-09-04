/*!
 * module node-red-contrib-stm32cubemonitor
 * Copyright(c) 2019 STMicroelectronics
 */
/* global d3 */

(function () {
  "use strict";

  /**
   * Line chart class.
   */
  class BarChart {
    /**
     * Bar chart constructor.
     *
     * @param {object} barChartConfig - Bar chart configuration.
     */
    constructor(barChartConfig) {
      /*
       * Store input parameters
       */
      this.divId = barChartConfig.divId; // Widget container identifier.
      this.inputWidth = barChartConfig.width; // widget width
      this.inputHeight = barChartConfig.height; // widget height
      this.widgetUnit = barChartConfig.widgetUnit; // widget units
      if (barChartConfig.yMin !== "" && barChartConfig.yMax !== "") {
        this.yMin = parseFloat(barChartConfig.yMin); // Y-Axis min value
        this.yMax = parseFloat(barChartConfig.yMax); // Y-Axis max value
      }

      /*
       * Constants used for chart drawing.
       */
      this.WIDGET_WIDTH_UNIT = this.widgetUnit.sx;
      this.WIDGET_HEIGHT_UNIT = this.widgetUnit.sy;
      this.WIDGET_MARGIN_WIDTH = this.widgetUnit.cx;
      this.WIDGET_MARGIN_HEIGHT = this.widgetUnit.cy;

      /*
       * Padding coming from md-card.nr-dashboard-template.
       * The padding values are coming from form app.min.less.
       *  @nrUnitHeight: 24px;
       *  .nr-dashboard-template {
       *     padding: (@nrUnitHeight / 8) 6px;
       * }
       * and @nrUnitHeight default value might be updated from app.min.js to
       * sizes.sy/2 hence resulting to WIDGET_WIDTH_UNIT/16.
       */
      this.PADDING_HORIZONTAL = 6;
      this.PADDING_VERTICAL = this.WIDGET_WIDTH_UNIT / 16;

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

      /*
       * Constants used for chart rendering (timing, sub-sampling, ...).
       */
      /* Timer duration to render incoming data */
      this.TIMER_DURATION = 100;
      /* Idle delay before doing another brush */
      this.IDLE_DELAY = 300;

      /*
       * Private variables.
       */
      /* Main structure containing all data sets */
      this.dataSets = [];
      /* Used to add and configure new variable */
      this.variableIndex = 0;
      /* Boolean set when the brush mode is selected */
      this.brushSelected = true;
      /* Boolean set when the points should be rendered */
      this.valuesAreRendered = false;
      /* Boolean set when one variable has been added in the variables container */
      this.variablesContainerUpdated = false;
      /* Chart margins */
      this.chartMargin = {
        top: this.DEFAULT_CHART_MARGIN_TOP,
        right: this.DEFAULT_CHART_MARGIN_RIGHT,
        bottom: this.DEFAULT_CHART_MARGIN_BOTTOM,
        left: this.DEFAULT_CHART_MARGIN_LEFT
      };

      /*
       * D3 functions and objects.
       */
      /* Pool of 10 colors */
      this.lineColor = d3.scale.category10();
      /* Current Zoom transformation */
      this.zoomTransform = { k: 1 };
      /* Draw chart */
      this.drawChart();
    }

    /**
     * Init all D3 functions used for the chart.
     */
    initChart() {
      let yMin, yMax;

      this.computeChartDimensions();

      this.xScale = d3
        .scaleBand()
        .range([0, this.chartWidth])
        .domain([])
        .padding(0.4);

      yMin = this.yMin !== undefined ? this.yMin : -50;
      yMax = this.yMax !== undefined ? this.yMax : 50;
      this.yScale = d3
        .scaleLinear()
        .range([this.chartHeight, 0])
        .domain([yMin, yMax]);

      this.xAxis = d3
        .axisBottom()
        .scale(this.xScale)
        .tickSizeInner(5)
        .tickSizeOuter(0)
        .tickPadding(10);

      this.yAxis = d3
        .axisLeft()
        .scale(this.yScale)
        .tickSizeInner(-this.chartWidth)
        .tickSizeOuter(0)
        .tickPadding(10);

      this.brushY = d3.brushY().on("end", (event) => this.brushended(event));

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

      this.timerId = null;
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
        .text("Variable(s)")
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

      this.$waitingMsg = this.$widget
        .append("text")
        .text("Acquisition started - waiting for value")
        .attr("transform", "translate(" + this.chartWidth / 3 + "," + 20 + ")")
        .style("font-family", "sans-serif")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .style("fill", "var(--nr-dashboard-widgetColor)")
        .style("display", "none");

      this.$brushY = this.$chart
        .append("g")
        .attr("clip-path", "url(#" + this.divId + "_clip)")
        .call(this.brushY);

      this.$brushY
        .select(".overlay")
        .attr("width", this.chartWidth)
        .attr("height", this.chartHeight);

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
        .property("checked", this.valuesAreRendered)
        .on("change", () => this.showValues());

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
          this.showValues();
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
    }

    /**
     * Redraw dynamically chart.
     * This function can be called during the acquisition (renderData), when showing all data or after zooming.
     *
     * @param {number} yMin - YAxis min value.
     * @param {number} yMax - YAxis max value.
     * @param {number} zoomIsActive - True if reDrawChart is called after zooming.
     */
    reDrawChart(yMin, yMax, zoomIsActive) {
      // console.log("reDrawChart - yMin = " + yMin + ", yMax = " + yMax + ", zoomIsActive = " + zoomIsActive);
      let currentYScale;
      let chartSizeUpdated = false;

      if (zoomIsActive && !this.brushSelected && this.zoomTransform.k !== 1) {
        currentYScale = this.yScaleTransform;
      } else {
        currentYScale = this.yScale;
      }

      // update current scale domains
      currentYScale.domain([yMin, yMax]);
      this.yAxis = this.yAxis.scale(currentYScale);
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

      // Compute the height of the variables container if new variables has been added
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
        // console.log("CHARTSIZEUPDATED - this.chartWidth = " + this.chartWidth + ",
        // this.chartHeight = " + this.chartHeight);

        this.$clipPath = d3
          .select("#" + this.divId + "_clip")
          .select("rect")
          .attr("width", this.chartWidth)
          .attr("height", this.chartHeight);

        currentYScale = currentYScale
          .range([this.chartHeight, 0])
          .domain([yMin, yMax]);
        this.yScale = this.yScale.range([this.chartHeight, 0]);

        this.yAxis = this.yAxis
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

        this.$brushY = this.$brushY
          .attr("clip-path", "url(#" + this.divId + "_clip)")
          .call(this.brushY);

        this.$brushY
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
          let yCenter = this.yScale((yMax + yMin) / 2);

          let initialScale = this.zoomTransform.k;
          // console.log("zoomTransform.k = " + zoomTransform.k);

          let initialTranslate = [
            0,
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
      }

      // console.log("reDrawChart - end");
    }

    /**
     * Listener when selecting / deselecting "show points" checkbox.
     */
    showValues() {
      let currentXScale, currentYScale;

      if (!this.brushSelected && this.zoomTransform.k !== 1) {
        currentXScale = this.xScaleTransform;
        currentYScale = this.yScaleTransform;
      } else {
        currentXScale = this.xScale;
        currentYScale = this.yScale;
      }

      this.valuesAreRendered = d3
        .select("#" + this.divId + "_checkboxShowPoints")
        .property("checked");

      for (let i = 0; i < this.dataSets.length; i++) {
        if (this.dataSets[i].visibleData !== 0) {
          // Redraw values
          this.drawValue(
            this.dataSets[i].$value,
            this.dataSets[i].variablename,
            this.dataSets[i].visibleData,
            currentXScale,
            currentYScale
          );
        }
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

        // Compute initial zoom configuration (initialScale, initialTranslate)
        if (this.dataSets.length === 0) {
          initialScale = 1;
          initialTranslate = [0, 0];
        } else {
          brushSelection = {
            yMin: this.yScale.domain()[0],
            yMax: this.yScale.domain()[1],
            yCenter: (this.yScale.domain()[0] + this.yScale.domain()[1]) / 2
          };
          // console.log ("brushSelection = " + JSON.stringify(brushSelection));

          fullDomains = this.getDomains();
          // console.log ("fullDomains = " + JSON.stringify(fullDomains));

          scales = {
            top:
              (fullDomains.yMax - brushSelection.yCenter) /
              (brushSelection.yMax - brushSelection.yCenter),
            bottom:
              (fullDomains.yMin - brushSelection.yCenter) /
              (brushSelection.yMin - brushSelection.yCenter)
          };
          // console.log ("scales = " + JSON.stringify(scales));

          initialScale = d3.max([scales.top, scales.bottom]);
          // console.log ("initialScale = " + initialScale);

          fullSelection = {
            yMin:
              brushSelection.yCenter +
              initialScale * (brushSelection.yMin - brushSelection.yCenter),
            yMax:
              brushSelection.yCenter +
              initialScale * (brushSelection.yMax - brushSelection.yCenter)
          };
          // console.log("fullSelection = " + JSON.stringify(fullSelection));

          this.yScale.domain([fullSelection.yMin, fullSelection.yMax]);
          this.$yAxis.call(this.yAxis);

          initialTranslate = [0, (this.chartHeight * (1 - initialScale)) / 2];
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
        this.yScale.domain(this.yScaleTransform.domain());

        // Remove zoom object
        this.$zoom.on(".zoom", null);
        this.$zoom.remove();
        this.$zoom = null;

        // Redraw chart
        this.reDrawChart(
          this.yScale.domain()[0],
          this.yScale.domain()[1],
          false
        );
      }
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
      this.xScaleTransform = this.xScale;
      this.yScaleTransform = this.zoomTransform.rescaleY(this.yScale);
      // console.log("zoomed - k = " + this.zoomTransform.k + " - x = " + this.zoomTransform.x + " - y = " +
      // this.zoomTransform.y + " - xDomain = " + this.xScaleTransform.domain() + " - yDomain = " +
      // this.yScaleTransform.domain());

      this.reDrawChart(
        this.yScaleTransform.domain()[0],
        this.yScaleTransform.domain()[1],
        true
      );

      for (let i = 0; i < this.dataSets.length; i++) {
        if (this.dataSets[i].visibleData !== 0) {
          // Redraw rect
          this.drawRect(
            this.dataSets[i].$rect,
            this.dataSets[i].visibleData,
            this.yScaleTransform
          );

          // Redraw values
          this.drawValue(
            this.dataSets[i].$value,
            this.dataSets[i].variablename,
            this.dataSets[i].visibleData,
            this.xScaleTransform,
            this.yScaleTransform
          );
        }
      }

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
        // Compute the Y domain corresponding to the brush selection
        this.yScale.domain([s[1], s[0]].map(this.yScale.invert, this.yScale));
        // Remove the brush
        this.$brushY.call(this.brushY.clear);
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

      this.reDrawChart(this.yScale.domain()[0], this.yScale.domain()[1], false);

      for (let i = 0; i < this.dataSets.length; i++) {
        if (this.dataSets[i].visibleData !== 0) {
          // Redraw rect
          this.drawRect(
            this.dataSets[i].$rect,
            this.dataSets[i].visibleData,
            this.yScale
          );

          // Redraw values
          this.drawValue(
            this.dataSets[i].$value,
            this.dataSets[i].variablename,
            this.dataSets[i].visibleData,
            this.xScale,
            this.yScale
          );
        }
      }

      // renderingTime = new Date().getTime() - startTime;
      // console.log("Brush renderingTime = " + renderingTime);
    }

    /**
     * Get the X and Y domains of data.
     * If the end user did not set the y min and/or max values in the chart configuration panel, add a margin of 10%.
     *
     * @returns {object} - Object containing yMin and yMax values.
     */
    getDomains() {
      const Y_AXIS_MARGIN = 10; // Add one margin of (at least) Y_AXIS_MARGIN units for Y Axis;
      let data = [];
      let yMin, yMax, yMinWithMargin, yMaxWithMargin;

      if (this.yMin !== undefined && this.yMax !== undefined) {
        // yMin and yMax have been set by the end user
        return {
          yMin: this.yMin,
          yMax: this.yMax
        };
      } else {
        for (let i = 0; i < this.dataSets.length; i++) {
          data.push(this.dataSets[i].visibleData);
        }

        if (this.yMin !== undefined) {
          // yMin has been set by the end user
          yMin = this.yMin;
          yMax = d3.max(data, function (d) {
            return d.y;
          });
          if (yMin === yMax) {
            // If all the variables have the same value
            if (yMax === 0) {
              // Add a margin of 10 units
              yMaxWithMargin = yMax + Y_AXIS_MARGIN;
            } else if (yMax > 0) {
              // Add a margin of 10%
              yMaxWithMargin = yMax * 1.1;
            } else {
              // Add a margin of 10%
              yMaxWithMargin = -yMax * 0.9;
            }
          } else if (yMin > yMax) {
            yMaxWithMargin = yMin + Y_AXIS_MARGIN;
          } else {
            // All the variables have not all the same value
            // Add a margin of 10% in upper bound (with a minimal value of 10)
            let margin = (yMax - yMin) / 10;
            yMaxWithMargin =
              Math.ceil((yMax + margin) / Y_AXIS_MARGIN) * Y_AXIS_MARGIN;
          }
          return {
            yMin: yMin,
            yMax: yMaxWithMargin
          };
        } else if (this.yMax != undefined) {
          // yMax has been set by the end user
          yMin = d3.min(data, function (d) {
            return d.y;
          });
          yMax = this.yMax;
          if (yMin === yMax) {
            // If all the variables have the same value
            if (yMin === 0) {
              // Add a margin of 10 units
              yMinWithMargin = yMin - Y_AXIS_MARGIN;
            } else if (yMin > 0) {
              // Add a margin of 10%
              yMinWithMargin = yMin * 0.9;
            } else {
              // Add a margin of 10%
              yMinWithMargin = yMin * 1.1;
            }
          } else {
            // All the variables have not all the same value
            // Add a margin of 10% in lower bound (with a minimal value of 10)
            let margin = (yMax - yMin) / 10;
            yMinWithMargin =
              Math.floor((yMin - margin) / Y_AXIS_MARGIN) * Y_AXIS_MARGIN;
          }
          return {
            yMin: yMinWithMargin,
            yMax: yMax
          };
        } else {
          // yMin and yMax have not been set by the end user
          yMin = d3.min(data, function (d) {
            return d.y;
          });
          yMax = d3.max(data, function (d) {
            return d.y;
          });

          if (yMin === 0 && yMax === 0) {
            yMinWithMargin = yMin - Y_AXIS_MARGIN;
            yMaxWithMargin = yMax + Y_AXIS_MARGIN;
          } else {
            yMax = d3.max([Math.abs(yMin), Math.abs(yMax)]);
            yMin = -yMax;
            // Add a margin of 10% in lower and upper bound (with a minimal value of 10)
            let margin = (yMax - yMin) / 10;
            yMinWithMargin =
              Math.floor((yMin - margin) / Y_AXIS_MARGIN) * Y_AXIS_MARGIN;
            yMaxWithMargin =
              Math.ceil((yMax + margin) / Y_AXIS_MARGIN) * Y_AXIS_MARGIN;
          }
          return {
            yMin: yMinWithMargin,
            yMax: yMaxWithMargin
          };
        }
      }
    }

    /**
     * Draw rectangle of the variable.
     *
     * @param {object} graphicElement - Rectangle of the variable.
     * @param {object} data - Data value.
     * @param {Function} yScaleParam - Current Y scale.
     */
    drawRect(graphicElement, data, yScaleParam) {
      if (yScaleParam(0) - yScaleParam(data.y) >= 0) {
        graphicElement
          .attr("y", yScaleParam(data.y))
          .attr("height", yScaleParam(0) - yScaleParam(data.y));
      } else {
        graphicElement
          .attr("y", yScaleParam(0))
          .attr("height", yScaleParam(data.y) - yScaleParam(0));
      }
    }

    /**
     * Draw variable value.
     *
     * @param {object} graphicElement - D3 text of the variable.
     * @param {string} name - Variable name.
     * @param {object} data - Data value.
     * @param {Function} xScaleParam - Current X scale.
     * @param {Function} yScaleParam - Current Y scale.
     */
    drawValue(graphicElement, name, data, xScaleParam, yScaleParam) {
      if (!this.valuesAreRendered) {
        graphicElement.text("");
      } else {
        // Set the variable value in the d3 text
        graphicElement.text(data.y);
        // Get the text length of the variable
        let textLength = graphicElement.node().getComputedTextLength();
        // Set the variable value in X position
        graphicElement.attr(
          "x",
          xScaleParam(name) + this.xScale.bandwidth() / 2 - textLength / 2
        );
        // Set the variable value in Y position
        if (data.y >= 0) {
          graphicElement.attr("y", yScaleParam(data.y) - 5);
        } else {
          graphicElement.attr("y", yScaleParam(data.y) + 15);
        }
      }
    }

    /**
     * Listener when clicking on "Show All" button or when "double-clicking" in brush.
     */
    renderFullData() {
      // Clear the timer if it is running
      if (this.timerId) {
        // console.log("clearInterval");
        clearInterval(this.timerId);
        this.timerId = null;
      }

      // return if no data to render
      if (this.dataSets.length === 0) {
        return;
      }

      // Get the Y domains of "full data"
      let fullDomains = this.getDomains();

      // Redraw chart
      this.reDrawChart(fullDomains.yMin, fullDomains.yMax, false);

      for (let i = 0; i < this.dataSets.length; i++) {
        if (this.dataSets[i].visibleData !== 0) {
          // Redraw rect
          this.drawRect(
            this.dataSets[i].$rect,
            this.dataSets[i].visibleData,
            this.yScale
          );

          // Redraw values
          this.drawValue(
            this.dataSets[i].$value,
            this.dataSets[i].variablename,
            this.dataSets[i].visibleData,
            this.xScale,
            this.yScale
          );
        }
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

      for (let i = 0; i < this.dataSets.length; i++) {
        // Set the "latest received data points" to the "visible data points"
        if (this.dataSets[i].lastData.length !== 0) {
          this.dataSets[i].visibleData =
            this.dataSets[i].lastData[this.dataSets[i].lastData.length - 1];
        }
        this.dataSets[i].lastData = [];
      }

      // Get the X and Y domains of "visible data"
      let visibleDomains = this.getDomains();

      // Redraw chart
      this.reDrawChart(visibleDomains.yMin, visibleDomains.yMax, false);

      for (let i = 0; i < this.dataSets.length; i++) {
        if (this.dataSets[i].visibleData !== this.dataSets[i].lastValue) {
          // Update the last value
          this.dataSets[i].lastValue = this.dataSets[i].visibleData;

          // Redraw rect
          this.drawRect(
            this.dataSets[i].$rect,
            this.dataSets[i].visibleData,
            this.yScale
          );

          // Redraw values
          this.drawValue(
            this.dataSets[i].$value,
            this.dataSets[i].variablename,
            this.dataSets[i].visibleData,
            this.xScale,
            this.yScale
          );
        }
      }

      if (this.$zoom && this.zoomTransform.k !== 1) {
        // Reset zoom
        this.$zoom.call(this.zoom.transform, d3.zoomIdentity);
      }

      // renderingTime = new Date().getTime() - startTime;
      // console.log("renderingTime = " + renderingTime);
    }

    /**
     * Flush all data and reset all chart objects.
     */
    flushData() {
      // console.log("flush Data");
      let yMin, yMax;

      // Remove paths, dots and focus
      for (let i = 0; i < this.dataSets.length; i++) {
        this.dataSets[i].$rect.remove();
        this.dataSets[i].$value.remove();
      }
      // Remove datasets
      for (let i = 0; i < this.dataSets.length; i++) {
        this.dataSets[i].lastData = [];
        this.dataSets[i].visibleData = 0;
      }
      this.dataSets = [];

      // Remove variables
      this.$variablesContainer.selectAll("div").remove();
      this.variablesContainerUpdated = true;

      // Reset index
      this.variableIndex = 0;

      // Reset zoom
      if (this.$zoom) {
        this.$zoom.call(this.zoom.transform, d3.zoomIdentity);
      }

      // Reset X scale
      this.xScale.domain([]);
      this.xAxis = this.xAxis.scale(this.xScale);
      this.$xAxis = this.$xAxis.call(this.xAxis);

      // Redraw chart
      this.chartMargin.left = this.DEFAULT_CHART_MARGIN_LEFT;
      yMin = this.yMin !== undefined ? this.yMin : -50;
      yMax = this.yMax !== undefined ? this.yMax : 50;
      this.reDrawChart(yMin, yMax, false);
    }

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
        visibleData: 0,
        lastValue: 0
      };

      newDataset.$rect = this.$chart
        .append("rect")
        .attr("clip-path", "url(#" + this.divId + "_clip)")
        .style("fill", this.lineColor(this.variableIndex % 10));

      newDataset.$value = this.$chart
        .append("text")
        .attr("clip-path", "url(#" + this.divId + "_clip)");

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
            self.dataSets[variableIndex].$rect.style("opacity");
          self.dataSets[variableIndex].$rect
            .transition()
            .style("opacity", currentOpacity == 1 ? 0 : 1);
          self.dataSets[variableIndex].$value
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

      // Update $xAxis to take into account new dataSet
      this.xScale.domain(this.dataSets.map((s) => s.variablename));
      this.xAxis = this.xAxis.scale(this.xScale);
      this.$xAxis = this.$xAxis.call(this.xAxis);

      // Compute X position and width of each rectangle
      // (Height of each rectangle will be computed in drawRect function)
      // Limit the width of each rectangle to 100px
      let width;
      if (this.xScale.bandwidth() > 100) {
        width = 100;
      } else {
        width = this.xScale.bandwidth();
      }
      for (let index = 0; index < datasets.length; index++) {
        datasets[index].$rect
          .attr(
            "x",
            this.xScale(datasets[index].variablename) +
              (this.xScale.bandwidth() - width) / 2
          )
          .attr("width", width);
      }

      // Return dataset index
      return datasets.length - 1;
    }

    /**
     * Clear the chart (stop & remove timer, flush all data and reset chart objets).
     */
    clearChart() {
      if (this.timerId) {
        // console.log("clearInterval");
        clearInterval(this.timerId);
        this.timerId = null;
      }
      this.flushData();
      this.$waitingMsg.style("display", "none");
    }

    /**
     * Update chart with a new variable value.
     * This function can be called when data are coming from processing node (live mode) or when importing a
     * previous data log.
     *
     * @param {object} variable - Variable information.
     * @param {boolean} live - If true, data are coming from processing node else data are coming a data log.
     */
    updateChart(variable, live) {
      // console.log("updateChart");
      let datasets = this.dataSets;

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
          if (!live) {
            // Keep the last point only
            datasets[indexdataset].visibleData = variable.variabledata[i];
          } else {
            // push data in lastData array (in case of live only)
            datasets[indexdataset].lastData.push(variable.variabledata[i]);
          }
        }
      }
    }
  }

  window.BarChart = BarChart;
})();
