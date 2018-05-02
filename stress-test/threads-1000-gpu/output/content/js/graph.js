/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 28800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? 28800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 3102.0, "series": [{"data": [[0.0, 0.0], [0.1, 0.0], [0.2, 0.0], [0.3, 0.0], [0.4, 0.0], [0.5, 0.0], [0.6, 0.0], [0.7, 0.0], [0.8, 0.0], [0.9, 0.0], [1.0, 0.0], [1.1, 0.0], [1.2, 0.0], [1.3, 0.0], [1.4, 0.0], [1.5, 0.0], [1.6, 0.0], [1.7, 0.0], [1.8, 0.0], [1.9, 0.0], [2.0, 0.0], [2.1, 0.0], [2.2, 0.0], [2.3, 0.0], [2.4, 0.0], [2.5, 0.0], [2.6, 0.0], [2.7, 0.0], [2.8, 0.0], [2.9, 0.0], [3.0, 0.0], [3.1, 0.0], [3.2, 0.0], [3.3, 0.0], [3.4, 0.0], [3.5, 0.0], [3.6, 0.0], [3.7, 0.0], [3.8, 0.0], [3.9, 0.0], [4.0, 0.0], [4.1, 0.0], [4.2, 0.0], [4.3, 0.0], [4.4, 0.0], [4.5, 0.0], [4.6, 0.0], [4.7, 0.0], [4.8, 0.0], [4.9, 0.0], [5.0, 0.0], [5.1, 0.0], [5.2, 0.0], [5.3, 0.0], [5.4, 0.0], [5.5, 0.0], [5.6, 0.0], [5.7, 0.0], [5.8, 0.0], [5.9, 0.0], [6.0, 0.0], [6.1, 0.0], [6.2, 0.0], [6.3, 0.0], [6.4, 0.0], [6.5, 0.0], [6.6, 0.0], [6.7, 0.0], [6.8, 0.0], [6.9, 0.0], [7.0, 0.0], [7.1, 0.0], [7.2, 0.0], [7.3, 0.0], [7.4, 0.0], [7.5, 0.0], [7.6, 0.0], [7.7, 0.0], [7.8, 0.0], [7.9, 0.0], [8.0, 0.0], [8.1, 0.0], [8.2, 0.0], [8.3, 0.0], [8.4, 0.0], [8.5, 0.0], [8.6, 0.0], [8.7, 0.0], [8.8, 0.0], [8.9, 0.0], [9.0, 0.0], [9.1, 0.0], [9.2, 0.0], [9.3, 0.0], [9.4, 0.0], [9.5, 0.0], [9.6, 0.0], [9.7, 0.0], [9.8, 0.0], [9.9, 0.0], [10.0, 0.0], [10.1, 1.0], [10.2, 1.0], [10.3, 1.0], [10.4, 1.0], [10.5, 1.0], [10.6, 1.0], [10.7, 1.0], [10.8, 1.0], [10.9, 1.0], [11.0, 1.0], [11.1, 1.0], [11.2, 1.0], [11.3, 1.0], [11.4, 1.0], [11.5, 1.0], [11.6, 1.0], [11.7, 1.0], [11.8, 1.0], [11.9, 1.0], [12.0, 1.0], [12.1, 1.0], [12.2, 1.0], [12.3, 1.0], [12.4, 1.0], [12.5, 1.0], [12.6, 1.0], [12.7, 1.0], [12.8, 1.0], [12.9, 1.0], [13.0, 1.0], [13.1, 1.0], [13.2, 1.0], [13.3, 1.0], [13.4, 1.0], [13.5, 1.0], [13.6, 1.0], [13.7, 1.0], [13.8, 1.0], [13.9, 1.0], [14.0, 1.0], [14.1, 1.0], [14.2, 1.0], [14.3, 1.0], [14.4, 1.0], [14.5, 1.0], [14.6, 1.0], [14.7, 1.0], [14.8, 1.0], [14.9, 1.0], [15.0, 1.0], [15.1, 1.0], [15.2, 1.0], [15.3, 1.0], [15.4, 1.0], [15.5, 1.0], [15.6, 1.0], [15.7, 1.0], [15.8, 1.0], [15.9, 1.0], [16.0, 1.0], [16.1, 1.0], [16.2, 1.0], [16.3, 1.0], [16.4, 1.0], [16.5, 1.0], [16.6, 1.0], [16.7, 1.0], [16.8, 1.0], [16.9, 1.0], [17.0, 1.0], [17.1, 1.0], [17.2, 1.0], [17.3, 1.0], [17.4, 1.0], [17.5, 1.0], [17.6, 1.0], [17.7, 1.0], [17.8, 1.0], [17.9, 1.0], [18.0, 1.0], [18.1, 1.0], [18.2, 1.0], [18.3, 1.0], [18.4, 1.0], [18.5, 1.0], [18.6, 1.0], [18.7, 1.0], [18.8, 1.0], [18.9, 1.0], [19.0, 1.0], [19.1, 1.0], [19.2, 1.0], [19.3, 1.0], [19.4, 1.0], [19.5, 1.0], [19.6, 1.0], [19.7, 1.0], [19.8, 1.0], [19.9, 1.0], [20.0, 1.0], [20.1, 1.0], [20.2, 1.0], [20.3, 1.0], [20.4, 1.0], [20.5, 1.0], [20.6, 1.0], [20.7, 1.0], [20.8, 1.0], [20.9, 1.0], [21.0, 1.0], [21.1, 1.0], [21.2, 1.0], [21.3, 1.0], [21.4, 1.0], [21.5, 1.0], [21.6, 1.0], [21.7, 1.0], [21.8, 1.0], [21.9, 1.0], [22.0, 1.0], [22.1, 1.0], [22.2, 1.0], [22.3, 1.0], [22.4, 1.0], [22.5, 1.0], [22.6, 1.0], [22.7, 1.0], [22.8, 1.0], [22.9, 1.0], [23.0, 1.0], [23.1, 1.0], [23.2, 1.0], [23.3, 1.0], [23.4, 1.0], [23.5, 1.0], [23.6, 1.0], [23.7, 1.0], [23.8, 1.0], [23.9, 1.0], [24.0, 1.0], [24.1, 1.0], [24.2, 1.0], [24.3, 1.0], [24.4, 1.0], [24.5, 1.0], [24.6, 2.0], [24.7, 2.0], [24.8, 2.0], [24.9, 2.0], [25.0, 2.0], [25.1, 2.0], [25.2, 2.0], [25.3, 2.0], [25.4, 2.0], [25.5, 2.0], [25.6, 2.0], [25.7, 2.0], [25.8, 2.0], [25.9, 2.0], [26.0, 2.0], [26.1, 2.0], [26.2, 2.0], [26.3, 2.0], [26.4, 2.0], [26.5, 2.0], [26.6, 2.0], [26.7, 2.0], [26.8, 2.0], [26.9, 2.0], [27.0, 2.0], [27.1, 3.0], [27.2, 3.0], [27.3, 3.0], [27.4, 3.0], [27.5, 3.0], [27.6, 3.0], [27.7, 3.0], [27.8, 3.0], [27.9, 3.0], [28.0, 3.0], [28.1, 3.0], [28.2, 3.0], [28.3, 3.0], [28.4, 3.0], [28.5, 3.0], [28.6, 3.0], [28.7, 4.0], [28.8, 4.0], [28.9, 4.0], [29.0, 4.0], [29.1, 4.0], [29.2, 4.0], [29.3, 4.0], [29.4, 4.0], [29.5, 4.0], [29.6, 4.0], [29.7, 4.0], [29.8, 5.0], [29.9, 5.0], [30.0, 5.0], [30.1, 5.0], [30.2, 5.0], [30.3, 5.0], [30.4, 5.0], [30.5, 6.0], [30.6, 6.0], [30.7, 6.0], [30.8, 8.0], [30.9, 10.0], [31.0, 13.0], [31.1, 14.0], [31.2, 18.0], [31.3, 26.0], [31.4, 33.0], [31.5, 41.0], [31.6, 45.0], [31.7, 58.0], [31.8, 74.0], [31.9, 87.0], [32.0, 94.0], [32.1, 96.0], [32.2, 98.0], [32.3, 104.0], [32.4, 110.0], [32.5, 116.0], [32.6, 121.0], [32.7, 125.0], [32.8, 128.0], [32.9, 131.0], [33.0, 134.0], [33.1, 137.0], [33.2, 141.0], [33.3, 145.0], [33.4, 148.0], [33.5, 153.0], [33.6, 158.0], [33.7, 161.0], [33.8, 166.0], [33.9, 169.0], [34.0, 173.0], [34.1, 177.0], [34.2, 181.0], [34.3, 184.0], [34.4, 189.0], [34.5, 192.0], [34.6, 194.0], [34.7, 198.0], [34.8, 202.0], [34.9, 205.0], [35.0, 208.0], [35.1, 211.0], [35.2, 214.0], [35.3, 217.0], [35.4, 219.0], [35.5, 223.0], [35.6, 225.0], [35.7, 229.0], [35.8, 231.0], [35.9, 233.0], [36.0, 237.0], [36.1, 241.0], [36.2, 244.0], [36.3, 247.0], [36.4, 248.0], [36.5, 251.0], [36.6, 253.0], [36.7, 256.0], [36.8, 258.0], [36.9, 260.0], [37.0, 262.0], [37.1, 264.0], [37.2, 266.0], [37.3, 268.0], [37.4, 270.0], [37.5, 271.0], [37.6, 274.0], [37.7, 275.0], [37.8, 277.0], [37.9, 279.0], [38.0, 281.0], [38.1, 283.0], [38.2, 286.0], [38.3, 288.0], [38.4, 291.0], [38.5, 293.0], [38.6, 295.0], [38.7, 297.0], [38.8, 299.0], [38.9, 302.0], [39.0, 304.0], [39.1, 306.0], [39.2, 308.0], [39.3, 309.0], [39.4, 312.0], [39.5, 313.0], [39.6, 317.0], [39.7, 319.0], [39.8, 321.0], [39.9, 323.0], [40.0, 325.0], [40.1, 328.0], [40.2, 330.0], [40.3, 331.0], [40.4, 333.0], [40.5, 336.0], [40.6, 338.0], [40.7, 341.0], [40.8, 343.0], [40.9, 345.0], [41.0, 346.0], [41.1, 349.0], [41.2, 352.0], [41.3, 353.0], [41.4, 355.0], [41.5, 357.0], [41.6, 359.0], [41.7, 362.0], [41.8, 363.0], [41.9, 364.0], [42.0, 367.0], [42.1, 368.0], [42.2, 370.0], [42.3, 372.0], [42.4, 374.0], [42.5, 375.0], [42.6, 378.0], [42.7, 380.0], [42.8, 382.0], [42.9, 383.0], [43.0, 385.0], [43.1, 388.0], [43.2, 389.0], [43.3, 391.0], [43.4, 393.0], [43.5, 394.0], [43.6, 396.0], [43.7, 397.0], [43.8, 399.0], [43.9, 401.0], [44.0, 402.0], [44.1, 404.0], [44.2, 405.0], [44.3, 406.0], [44.4, 407.0], [44.5, 409.0], [44.6, 411.0], [44.7, 413.0], [44.8, 413.0], [44.9, 415.0], [45.0, 416.0], [45.1, 418.0], [45.2, 419.0], [45.3, 420.0], [45.4, 422.0], [45.5, 423.0], [45.6, 424.0], [45.7, 425.0], [45.8, 427.0], [45.9, 430.0], [46.0, 431.0], [46.1, 433.0], [46.2, 434.0], [46.3, 435.0], [46.4, 437.0], [46.5, 439.0], [46.6, 441.0], [46.7, 443.0], [46.8, 444.0], [46.9, 446.0], [47.0, 447.0], [47.1, 449.0], [47.2, 452.0], [47.3, 453.0], [47.4, 454.0], [47.5, 456.0], [47.6, 458.0], [47.7, 460.0], [47.8, 463.0], [47.9, 464.0], [48.0, 465.0], [48.1, 466.0], [48.2, 469.0], [48.3, 470.0], [48.4, 471.0], [48.5, 473.0], [48.6, 474.0], [48.7, 476.0], [48.8, 477.0], [48.9, 479.0], [49.0, 480.0], [49.1, 483.0], [49.2, 484.0], [49.3, 485.0], [49.4, 487.0], [49.5, 488.0], [49.6, 489.0], [49.7, 491.0], [49.8, 493.0], [49.9, 494.0], [50.0, 495.0], [50.1, 496.0], [50.2, 498.0], [50.3, 500.0], [50.4, 502.0], [50.5, 504.0], [50.6, 506.0], [50.7, 507.0], [50.8, 509.0], [50.9, 511.0], [51.0, 513.0], [51.1, 515.0], [51.2, 516.0], [51.3, 518.0], [51.4, 519.0], [51.5, 521.0], [51.6, 523.0], [51.7, 525.0], [51.8, 527.0], [51.9, 528.0], [52.0, 530.0], [52.1, 531.0], [52.2, 534.0], [52.3, 536.0], [52.4, 538.0], [52.5, 540.0], [52.6, 541.0], [52.7, 543.0], [52.8, 545.0], [52.9, 547.0], [53.0, 548.0], [53.1, 550.0], [53.2, 551.0], [53.3, 552.0], [53.4, 554.0], [53.5, 556.0], [53.6, 557.0], [53.7, 558.0], [53.8, 559.0], [53.9, 560.0], [54.0, 561.0], [54.1, 562.0], [54.2, 563.0], [54.3, 564.0], [54.4, 566.0], [54.5, 567.0], [54.6, 570.0], [54.7, 571.0], [54.8, 573.0], [54.9, 574.0], [55.0, 577.0], [55.1, 578.0], [55.2, 579.0], [55.3, 580.0], [55.4, 581.0], [55.5, 582.0], [55.6, 582.0], [55.7, 582.0], [55.8, 583.0], [55.9, 583.0], [56.0, 584.0], [56.1, 586.0], [56.2, 587.0], [56.3, 589.0], [56.4, 590.0], [56.5, 591.0], [56.6, 593.0], [56.7, 594.0], [56.8, 595.0], [56.9, 596.0], [57.0, 597.0], [57.1, 598.0], [57.2, 599.0], [57.3, 601.0], [57.4, 603.0], [57.5, 605.0], [57.6, 607.0], [57.7, 608.0], [57.8, 609.0], [57.9, 610.0], [58.0, 612.0], [58.1, 613.0], [58.2, 614.0], [58.3, 615.0], [58.4, 616.0], [58.5, 617.0], [58.6, 618.0], [58.7, 618.0], [58.8, 619.0], [58.9, 619.0], [59.0, 620.0], [59.1, 620.0], [59.2, 621.0], [59.3, 622.0], [59.4, 623.0], [59.5, 623.0], [59.6, 624.0], [59.7, 624.0], [59.8, 625.0], [59.9, 626.0], [60.0, 626.0], [60.1, 627.0], [60.2, 628.0], [60.3, 629.0], [60.4, 631.0], [60.5, 632.0], [60.6, 633.0], [60.7, 634.0], [60.8, 636.0], [60.9, 638.0], [61.0, 640.0], [61.1, 641.0], [61.2, 642.0], [61.3, 643.0], [61.4, 645.0], [61.5, 646.0], [61.6, 647.0], [61.7, 649.0], [61.8, 651.0], [61.9, 653.0], [62.0, 654.0], [62.1, 656.0], [62.2, 657.0], [62.3, 660.0], [62.4, 661.0], [62.5, 663.0], [62.6, 665.0], [62.7, 667.0], [62.8, 669.0], [62.9, 670.0], [63.0, 672.0], [63.1, 673.0], [63.2, 675.0], [63.3, 677.0], [63.4, 680.0], [63.5, 682.0], [63.6, 683.0], [63.7, 685.0], [63.8, 687.0], [63.9, 689.0], [64.0, 691.0], [64.1, 693.0], [64.2, 695.0], [64.3, 696.0], [64.4, 698.0], [64.5, 699.0], [64.6, 702.0], [64.7, 705.0], [64.8, 706.0], [64.9, 708.0], [65.0, 710.0], [65.1, 712.0], [65.2, 715.0], [65.3, 716.0], [65.4, 719.0], [65.5, 721.0], [65.6, 723.0], [65.7, 725.0], [65.8, 727.0], [65.9, 729.0], [66.0, 730.0], [66.1, 733.0], [66.2, 735.0], [66.3, 736.0], [66.4, 738.0], [66.5, 740.0], [66.6, 743.0], [66.7, 745.0], [66.8, 747.0], [66.9, 748.0], [67.0, 750.0], [67.1, 752.0], [67.2, 756.0], [67.3, 758.0], [67.4, 759.0], [67.5, 760.0], [67.6, 764.0], [67.7, 766.0], [67.8, 768.0], [67.9, 769.0], [68.0, 771.0], [68.1, 773.0], [68.2, 776.0], [68.3, 778.0], [68.4, 780.0], [68.5, 781.0], [68.6, 783.0], [68.7, 785.0], [68.8, 786.0], [68.9, 789.0], [69.0, 790.0], [69.1, 791.0], [69.2, 793.0], [69.3, 794.0], [69.4, 797.0], [69.5, 798.0], [69.6, 800.0], [69.7, 801.0], [69.8, 804.0], [69.9, 806.0], [70.0, 808.0], [70.1, 810.0], [70.2, 811.0], [70.3, 813.0], [70.4, 814.0], [70.5, 815.0], [70.6, 817.0], [70.7, 818.0], [70.8, 819.0], [70.9, 820.0], [71.0, 822.0], [71.1, 824.0], [71.2, 826.0], [71.3, 827.0], [71.4, 830.0], [71.5, 832.0], [71.6, 834.0], [71.7, 835.0], [71.8, 837.0], [71.9, 838.0], [72.0, 841.0], [72.1, 843.0], [72.2, 844.0], [72.3, 846.0], [72.4, 848.0], [72.5, 850.0], [72.6, 852.0], [72.7, 854.0], [72.8, 856.0], [72.9, 859.0], [73.0, 862.0], [73.1, 864.0], [73.2, 867.0], [73.3, 869.0], [73.4, 872.0], [73.5, 875.0], [73.6, 877.0], [73.7, 879.0], [73.8, 882.0], [73.9, 885.0], [74.0, 886.0], [74.1, 888.0], [74.2, 892.0], [74.3, 894.0], [74.4, 895.0], [74.5, 897.0], [74.6, 899.0], [74.7, 900.0], [74.8, 902.0], [74.9, 904.0], [75.0, 907.0], [75.1, 909.0], [75.2, 911.0], [75.3, 913.0], [75.4, 915.0], [75.5, 917.0], [75.6, 919.0], [75.7, 920.0], [75.8, 922.0], [75.9, 925.0], [76.0, 927.0], [76.1, 928.0], [76.2, 930.0], [76.3, 932.0], [76.4, 934.0], [76.5, 936.0], [76.6, 938.0], [76.7, 940.0], [76.8, 942.0], [76.9, 944.0], [77.0, 946.0], [77.1, 948.0], [77.2, 950.0], [77.3, 953.0], [77.4, 954.0], [77.5, 957.0], [77.6, 958.0], [77.7, 960.0], [77.8, 962.0], [77.9, 965.0], [78.0, 967.0], [78.1, 970.0], [78.2, 972.0], [78.3, 974.0], [78.4, 978.0], [78.5, 981.0], [78.6, 983.0], [78.7, 985.0], [78.8, 990.0], [78.9, 993.0], [79.0, 995.0], [79.1, 996.0], [79.2, 1000.0], [79.3, 1003.0], [79.4, 1005.0], [79.5, 1007.0], [79.6, 1010.0], [79.7, 1012.0], [79.8, 1014.0], [79.9, 1016.0], [80.0, 1017.0], [80.1, 1021.0], [80.2, 1024.0], [80.3, 1026.0], [80.4, 1029.0], [80.5, 1032.0], [80.6, 1035.0], [80.7, 1037.0], [80.8, 1040.0], [80.9, 1042.0], [81.0, 1045.0], [81.1, 1048.0], [81.2, 1050.0], [81.3, 1052.0], [81.4, 1053.0], [81.5, 1055.0], [81.6, 1058.0], [81.7, 1060.0], [81.8, 1062.0], [81.9, 1064.0], [82.0, 1066.0], [82.1, 1069.0], [82.2, 1071.0], [82.3, 1074.0], [82.4, 1076.0], [82.5, 1079.0], [82.6, 1081.0], [82.7, 1084.0], [82.8, 1086.0], [82.9, 1088.0], [83.0, 1092.0], [83.1, 1094.0], [83.2, 1096.0], [83.3, 1099.0], [83.4, 1102.0], [83.5, 1104.0], [83.6, 1107.0], [83.7, 1108.0], [83.8, 1111.0], [83.9, 1113.0], [84.0, 1114.0], [84.1, 1115.0], [84.2, 1117.0], [84.3, 1119.0], [84.4, 1122.0], [84.5, 1123.0], [84.6, 1125.0], [84.7, 1126.0], [84.8, 1129.0], [84.9, 1132.0], [85.0, 1134.0], [85.1, 1137.0], [85.2, 1141.0], [85.3, 1143.0], [85.4, 1145.0], [85.5, 1149.0], [85.6, 1152.0], [85.7, 1154.0], [85.8, 1157.0], [85.9, 1161.0], [86.0, 1163.0], [86.1, 1165.0], [86.2, 1168.0], [86.3, 1172.0], [86.4, 1175.0], [86.5, 1176.0], [86.6, 1179.0], [86.7, 1183.0], [86.8, 1185.0], [86.9, 1187.0], [87.0, 1190.0], [87.1, 1194.0], [87.2, 1198.0], [87.3, 1201.0], [87.4, 1205.0], [87.5, 1209.0], [87.6, 1214.0], [87.7, 1216.0], [87.8, 1220.0], [87.9, 1225.0], [88.0, 1229.0], [88.1, 1233.0], [88.2, 1238.0], [88.3, 1241.0], [88.4, 1247.0], [88.5, 1252.0], [88.6, 1257.0], [88.7, 1263.0], [88.8, 1271.0], [88.9, 1272.0], [89.0, 1275.0], [89.1, 1277.0], [89.2, 1278.0], [89.3, 1281.0], [89.4, 1283.0], [89.5, 1285.0], [89.6, 1287.0], [89.7, 1291.0], [89.8, 1295.0], [89.9, 1303.0], [90.0, 1308.0], [90.1, 1309.0], [90.2, 1309.0], [90.3, 1310.0], [90.4, 1311.0], [90.5, 1312.0], [90.6, 1314.0], [90.7, 1318.0], [90.8, 1325.0], [90.9, 1329.0], [91.0, 1337.0], [91.1, 1341.0], [91.2, 1352.0], [91.3, 1367.0], [91.4, 1373.0], [91.5, 1381.0], [91.6, 1389.0], [91.7, 1399.0], [91.8, 1413.0], [91.9, 1420.0], [92.0, 1427.0], [92.1, 1431.0], [92.2, 1440.0], [92.3, 1449.0], [92.4, 1482.0], [92.5, 1527.0], [92.6, 1567.0], [92.7, 1584.0], [92.8, 1589.0], [92.9, 1609.0], [93.0, 1614.0], [93.1, 1617.0], [93.2, 1626.0], [93.3, 1631.0], [93.4, 1646.0], [93.5, 1651.0], [93.6, 1653.0], [93.7, 1655.0], [93.8, 1658.0], [93.9, 1662.0], [94.0, 1664.0], [94.1, 1666.0], [94.2, 1668.0], [94.3, 1668.0], [94.4, 1669.0], [94.5, 1672.0], [94.6, 1674.0], [94.7, 1676.0], [94.8, 1679.0], [94.9, 1684.0], [95.0, 1686.0], [95.1, 1689.0], [95.2, 1690.0], [95.3, 1694.0], [95.4, 1697.0], [95.5, 1699.0], [95.6, 1702.0], [95.7, 1707.0], [95.8, 1712.0], [95.9, 1719.0], [96.0, 1725.0], [96.1, 1731.0], [96.2, 1740.0], [96.3, 1747.0], [96.4, 1790.0], [96.5, 1820.0], [96.6, 1827.0], [96.7, 1835.0], [96.8, 1847.0], [96.9, 1864.0], [97.0, 1882.0], [97.1, 1889.0], [97.2, 1899.0], [97.3, 1900.0], [97.4, 1904.0], [97.5, 1960.0], [97.6, 1975.0], [97.7, 1988.0], [97.8, 1999.0], [97.9, 2010.0], [98.0, 2028.0], [98.1, 2048.0], [98.2, 2061.0], [98.3, 2109.0], [98.4, 2141.0], [98.5, 2219.0], [98.6, 2261.0], [98.7, 2292.0], [98.8, 2327.0], [98.9, 2362.0], [99.0, 2402.0], [99.1, 2436.0], [99.2, 2470.0], [99.3, 2533.0], [99.4, 2597.0], [99.5, 2641.0], [99.6, 2697.0], [99.7, 2749.0], [99.8, 2855.0], [99.9, 2920.0], [100.0, 3102.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 3223.0, "series": [{"data": [[0.0, 3223.0], [600.0, 729.0], [700.0, 506.0], [800.0, 507.0], [900.0, 456.0], [1000.0, 411.0], [1100.0, 396.0], [1200.0, 258.0], [1300.0, 186.0], [1400.0, 74.0], [1500.0, 37.0], [100.0, 248.0], [1600.0, 269.0], [1700.0, 93.0], [1800.0, 83.0], [1900.0, 55.0], [2000.0, 48.0], [2100.0, 18.0], [2200.0, 26.0], [2300.0, 26.0], [2400.0, 25.0], [2500.0, 16.0], [2600.0, 21.0], [2700.0, 14.0], [2800.0, 12.0], [2900.0, 9.0], [3000.0, 3.0], [3100.0, 1.0], [200.0, 411.0], [300.0, 498.0], [400.0, 648.0], [500.0, 693.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 3100.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 588.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 3842.0, "series": [{"data": [[1.0, 3699.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 3842.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 1871.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 588.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 1833.0165999999995, "minX": 1.52524224E12, "maxY": 1833.0165999999995, "series": [{"data": [[1.52524224E12, 1833.0165999999995]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524224E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 0.0, "minX": 395.0, "maxY": 3020.0, "series": [{"data": [[395.0, 1082.0], [410.0, 1163.0], [403.0, 1170.0], [423.0, 1149.0], [447.0, 1122.0], [437.0, 1039.0], [436.0, 1233.0], [460.0, 1108.5], [468.0, 1005.0], [466.0, 1194.0], [491.0, 1174.0], [486.0, 992.0], [480.0, 1184.0], [511.0, 980.0], [539.0, 1048.5], [521.0, 1151.0], [519.0, 968.0], [514.0, 1162.0], [573.0, 1118.0], [563.0, 945.0], [557.0, 1129.0], [605.0, 921.0], [596.0, 1107.0], [581.0, 932.0], [638.0, 1084.0], [627.0, 911.0], [621.0, 1096.0], [670.0, 1058.0], [668.0, 886.0], [660.0, 984.0], [643.0, 902.0], [698.0, 930.5], [694.0, 855.0], [690.0, 1030.0], [686.0, 865.0], [681.0, 1044.0], [679.0, 876.0], [729.0, 965.0], [728.0, 1014.0], [725.0, 889.5], [724.0, 1241.0], [717.0, 899.5], [715.0, 1251.0], [711.0, 911.0], [707.0, 921.0], [765.0, 1185.0], [766.0, 918.0], [763.0, 756.0], [758.0, 1063.5], [756.0, 768.0], [749.0, 1074.5], [748.0, 778.0], [742.0, 871.0], [741.0, 1219.0], [797.0, 928.0], [796.0, 1165.0], [788.0, 736.0], [779.0, 907.0], [778.0, 1175.0], [774.0, 746.0], [827.0, 716.0], [818.0, 918.0], [816.0, 1154.0], [810.0, 726.0], [861.0, 695.0], [857.0, 1131.0], [853.0, 896.0], [845.0, 705.0], [834.0, 1025.0], [894.0, 865.0], [881.0, 673.0], [877.0, 1108.0], [875.0, 874.0], [870.0, 685.0], [868.0, 1120.0], [867.0, 885.0], [923.0, 963.0], [921.0, 1085.0], [914.0, 855.0], [908.0, 1282.0], [905.0, 881.5], [956.0, 813.0], [959.0, 954.5], [953.0, 930.0], [933.0, 1078.0], [929.0, 845.0], [951.0, 1056.0], [948.0, 825.0], [944.0, 942.0], [943.0, 1067.0], [940.0, 834.0], [936.0, 952.0], [977.0, 595.0], [990.0, 781.0], [988.0, 585.0], [986.0, 1209.0], [967.0, 801.0], [965.0, 608.0], [963.0, 1229.0], [982.0, 1028.0], [979.0, 841.0], [978.0, 790.0], [976.0, 1219.0], [973.0, 1038.0], [971.0, 852.0], [1020.0, 759.0], [1012.0, 175.0], [1015.0, 599.0], [1023.0, 562.0], [1016.0, 1189.0], [998.0, 1016.0], [995.0, 828.0], [1008.0, 819.0], [1004.0, 770.0], [1003.0, 574.0], [1000.0, 1199.0], [1038.0, 797.0], [1076.0, 1149.0], [1086.0, 768.0], [1074.0, 527.0], [1068.0, 1245.0], [1064.0, 729.0], [1050.0, 739.0], [1042.0, 983.0], [1034.0, 750.0], [1030.0, 1180.0], [1028.0, 993.0], [1148.0, 725.0], [1138.0, 924.0], [1132.0, 1203.0], [1124.0, 1119.0], [1120.0, 933.0], [1106.0, 723.5], [1098.0, 708.0], [1208.0, 657.0], [1214.0, 1118.0], [1206.0, 799.8333333333334], [1204.0, 1043.0], [1202.0, 1135.0], [1158.0, 589.5], [1152.0, 884.0], [1194.0, 679.0], [1188.0, 531.5], [1184.0, 969.5], [1182.0, 689.0], [1180.0, 542.5], [1172.0, 887.0], [1170.0, 677.0], [1250.0, 713.5], [1276.0, 946.0], [1272.0, 1047.0], [1270.0, 528.0], [1258.0, 1058.0], [1256.0, 537.0], [1254.0, 967.0], [1248.0, 785.0], [1240.0, 600.5], [1218.0, 1023.0], [1294.0, 919.0], [1334.0, 680.0], [1328.0, 682.0], [1326.0, 690.0], [1322.0, 692.5], [1318.0, 797.0], [1308.0, 535.0], [1304.0, 745.5], [1296.0, 543.0], [1292.0, 663.25], [1288.0, 554.0], [1280.0, 659.8], [1382.0, 708.4], [1406.0, 778.0], [1400.0, 352.0], [1398.0, 260.0], [1394.0, 1205.0], [1370.0, 654.0], [1346.0, 474.3333333333333], [1358.0, 659.0], [1352.0, 660.5], [1368.0, 471.0], [1364.0, 96.0], [1362.0, 1254.0], [1360.0, 464.33333333333337], [1390.0, 415.3333333333333], [1386.0, 613.5], [1384.0, 894.0], [1378.0, 383.0], [1376.0, 291.0], [1456.0, 354.85], [1468.0, 448.8484848484849], [1470.0, 420.9117647058824], [1442.0, 416.56097560975604], [1440.0, 327.60714285714283], [1446.0, 336.25], [1444.0, 544.0666666666667], [1448.0, 409.5], [1450.0, 487.7777777777777], [1466.0, 510.3589743589745], [1458.0, 441.3255813953489], [1460.0, 592.1999999999999], [1462.0, 473.0000000000001], [1464.0, 580.775], [1438.0, 381.59374999999994], [1408.0, 1194.0], [1414.0, 591.0], [1410.0, 1012.0], [1418.0, 281.13333333333327], [1416.0, 296.8888888888889], [1420.0, 466.85714285714283], [1422.0, 467.08333333333326], [1436.0, 472.6842105263158], [1434.0, 439.952380952381], [1432.0, 375.695652173913], [1424.0, 349.877551020408], [1428.0, 324.11111111111103], [1430.0, 441.2], [1426.0, 297.0408163265308], [1454.0, 249.05000000000004], [1452.0, 417.52173913043475], [1480.0, 529.5416666666667], [1530.0, 406.55319148936167], [1534.0, 739.0204081632653], [1532.0, 448.86111111111114], [1528.0, 498.43243243243245], [1526.0, 529.2], [1524.0, 579.5789473684212], [1520.0, 557.7333333333333], [1522.0, 395.85714285714283], [1486.0, 414.71186440677957], [1484.0, 463.3442622950819], [1482.0, 600.8695652173913], [1474.0, 555.0937499999999], [1478.0, 382.448275862069], [1476.0, 659.0400000000001], [1472.0, 556.4814814814816], [1500.0, 375.87179487179503], [1502.0, 476.13888888888874], [1518.0, 445.896551724138], [1516.0, 567.1999999999999], [1512.0, 379.4888888888889], [1514.0, 264.75000000000006], [1510.0, 416.2666666666667], [1508.0, 474.5416666666666], [1506.0, 490.11538461538464], [1504.0, 568.6666666666665], [1498.0, 423.8199999999999], [1496.0, 445.63736263736257], [1494.0, 459.6086956521738], [1492.0, 549.4], [1488.0, 663.4090909090908], [1490.0, 623.5208333333334], [1584.0, 553.1818181818181], [1566.0, 723.9], [1588.0, 449.0], [1548.0, 383.8571428571429], [1550.0, 812.0], [1546.0, 749.3333333333334], [1544.0, 522.1666666666666], [1542.0, 706.6923076923076], [1540.0, 685.1333333333334], [1538.0, 458.95], [1536.0, 706.0454545454546], [1586.0, 467.38095238095246], [1568.0, 530.0], [1594.0, 569.3846153846154], [1590.0, 512.95], [1592.0, 398.6363636363636], [1596.0, 551.0714285714284], [1598.0, 499.6875], [1570.0, 516.8333333333333], [1578.0, 492.9523809523809], [1582.0, 629.8], [1580.0, 624.1818181818182], [1574.0, 442.27027027027026], [1576.0, 559.857142857143], [1572.0, 618.5263157894736], [1560.0, 518.0], [1558.0, 560.7142857142857], [1554.0, 742.8181818181818], [1552.0, 581.2666666666667], [1556.0, 503.83333333333326], [1562.0, 619.3333333333334], [1564.0, 606.5714285714286], [1612.0, 336.20000000000005], [1626.0, 807.0], [1620.0, 432.9166666666667], [1618.0, 344.5714285714286], [1616.0, 569.6666666666666], [1624.0, 544.9230769230769], [1622.0, 253.88888888888889], [1658.0, 1059.2445019404918], [1660.0, 379.9090909090909], [1656.0, 460.2222222222223], [1652.0, 883.0], [1654.0, 516.25], [1648.0, 498.3333333333333], [1650.0, 195.0], [1614.0, 437.1818181818182], [1606.0, 319.95000000000005], [1608.0, 482.1], [1610.0, 284.0], [1602.0, 415.80645161290323], [1600.0, 431.8666666666666], [1628.0, 346.0], [1630.0, 196.03225806451607], [1604.0, 240.12765957446808], [1662.0, 365.5], [1644.0, 559.2], [1646.0, 428.1666666666667], [1642.0, 518.6], [1634.0, 328.3333333333333], [1636.0, 659.1666666666667], [1640.0, 665.8333333333334], [1638.0, 187.4], [1632.0, 229.375], [1716.0, 826.0], [1722.0, 826.0], [1726.0, 1860.0], [1720.0, 1874.0], [1718.0, 1399.0], [1714.0, 715.0], [1678.0, 1206.0], [1676.0, 1076.3333333333333], [1668.0, 397.0], [1666.0, 641.4285714285714], [1704.0, 1181.75], [1700.0, 827.0], [1698.0, 866.3333333333333], [1694.0, 1524.75], [1664.0, 376.5], [1692.0, 0.0], [1690.0, 958.0], [1688.0, 1161.0], [1684.0, 788.0], [1682.0, 825.0], [1680.0, 1679.0], [1778.0, 1790.0], [1782.0, 1241.75], [1776.0, 1880.0], [1734.0, 721.0], [1774.0, 829.0], [1728.0, 396.0], [1756.0, 0.0], [1786.0, 688.0], [1784.0, 609.5], [1772.0, 1467.0], [1766.0, 1.0], [1848.0, 1886.0], [1838.0, 1793.0], [1828.0, 1213.0], [1850.0, 999.0], [1830.0, 356.0], [1824.0, 0.0], [1806.0, 0.0], [1802.0, 767.0], [1876.0, 769.0], [1898.0, 1432.6666666666667], [1872.0, 20.0], [1870.0, 223.0], [1864.0, 627.6666666666667], [1896.0, 1.0], [1890.0, 669.0], [1878.0, 1.0], [1868.0, 1389.0], [1960.0, 972.6666666666666], [1976.0, 827.0], [1938.0, 1582.0], [1980.0, 1204.0], [1978.0, 1037.0], [1966.0, 1454.0], [1936.0, 1159.0], [1928.0, 1.0], [1986.0, 343.25], [2044.0, 1051.0], [2006.0, 1285.25], [2004.0, 848.0], [2000.0, 1276.5], [2002.0, 1.0], [2012.0, 1687.0], [2008.0, 1690.0], [2036.0, 873.8448275862066], [2034.0, 1097.6666666666665], [1996.0, 1690.0], [1994.0, 1738.0], [1990.0, 1.0], [2038.0, 1210.125], [2026.0, 2.0], [2022.0, 1778.0], [2042.0, 963.25], [2068.0, 710.0], [2120.0, 73.0], [2132.0, 3.0], [2128.0, 685.5], [2152.0, 5.0], [2172.0, 1.0], [2160.0, 690.0], [2048.0, 98.0], [2060.0, 0.0], [2052.0, 1.0], [2108.0, 4.0], [2100.0, 2.0], [2104.0, 657.0], [2088.0, 1911.0], [2272.0, 775.0], [2288.0, 311.66666666666663], [2248.0, 2.0], [2300.0, 525.0], [2252.0, 2.0], [2256.0, 448.6], [2276.0, 2.0], [2192.0, 4.0], [2196.0, 1059.5], [2232.0, 2.0], [2228.0, 1.0], [2212.0, 1711.0], [2216.0, 2.0], [2400.0, 547.875], [2376.0, 619.0], [2428.0, 824.3333333333334], [2424.0, 225.5], [2420.0, 347.0], [2416.0, 150.0], [2412.0, 342.3333333333333], [2408.0, 349.27777777777777], [2404.0, 315.2857142857143], [2312.0, 2.0], [2328.0, 1046.0], [2356.0, 4.0], [2360.0, 0.0], [2340.0, 297.8], [2388.0, 618.25], [2396.0, 730.4], [2392.0, 246.75], [2556.0, 1310.0], [2552.0, 386.6666666666667], [2500.0, 543.25], [2496.0, 440.5], [2504.0, 1311.0], [2508.0, 1998.0], [2512.0, 2.0], [2548.0, 838.8571428571428], [2544.0, 741.3478260869565], [2540.0, 908.6666666666667], [2536.0, 612.6], [2532.0, 646.5333333333334], [2528.0, 1314.0], [2432.0, 2.1428571428571432], [2444.0, 3.5], [2452.0, 825.0], [2448.0, 824.0], [2456.0, 941.5], [2460.0, 556.3333333333334], [2472.0, 366.0], [2488.0, 895.0], [2608.0, 944.6666666666666], [2592.0, 1556.6666666666665], [2600.0, 360.0], [2604.0, 505.875], [2612.0, 556.0], [2616.0, 281.8333333333333], [2660.0, 70.75], [2588.0, 723.0], [2584.0, 2035.0], [2664.0, 1985.0], [2668.0, 48.16666666666667], [2676.0, 649.0], [2624.0, 226.0], [2628.0, 395.5], [2632.0, 244.0], [2636.0, 165.0], [2648.0, 1.0], [2580.0, 1.0], [2572.0, 447.99999999999994], [2576.0, 740.0], [2564.0, 120.43478260869564], [2620.0, 621.0], [2560.0, 256.0], [2688.0, 1108.0], [2732.0, 420.0], [2740.0, 518.3333333333334], [2800.0, 426.5], [2804.0, 449.0], [2796.0, 430.5], [2784.0, 266.0], [2764.0, 1350.0], [2928.0, 551.0], [2828.0, 464.0], [2868.0, 1280.75], [2872.0, 1.0], [2864.0, 1.0], [2860.0, 0.0], [2856.0, 1.0], [2820.0, 231.0], [2836.0, 579.0], [2880.0, 506.0], [2936.0, 568.0], [2932.0, 1771.0], [2924.0, 1001.0], [2916.0, 640.0], [2884.0, 756.3333333333333], [2888.0, 1.0], [2892.0, 259.5], [2896.0, 333.5], [2900.0, 356.33333333333337], [2904.0, 176.33333333333331], [2908.0, 0.0], [2848.0, 1.0], [2960.0, 591.0], [3004.0, 235.0], [2992.0, 621.0], [2952.0, 1499.5], [2964.0, 964.5], [2968.0, 2320.0], [2972.0, 1036.6], [3008.0, 633.0], [3060.0, 692.0], [3052.0, 2402.0], [3056.0, 656.0], [3040.0, 2552.0], [3044.0, 466.5], [3012.0, 2393.0], [3020.0, 1598.5], [3024.0, 657.0], [3032.0, 924.6], [3180.0, 1442.0], [3072.0, 704.0], [3132.0, 661.0], [3092.0, 2446.0], [3136.0, 781.0], [3196.0, 547.0], [3184.0, 537.0], [3168.0, 373.0], [3152.0, 504.0], [3160.0, 804.0], [3164.0, 917.0], [3104.0, 997.75], [3128.0, 1.0], [3216.0, 214.0], [3252.0, 0.5], [3256.0, 716.8], [3236.0, 0.5], [3240.0, 0.33333333333333337], [3212.0, 414.0], [3220.0, 739.0], [3228.0, 113.0], [3324.0, 1.0], [3316.0, 278.0], [3312.0, 289.75], [3308.0, 136.0], [3272.0, 247.66666666666666], [3280.0, 257.5], [3284.0, 2799.0], [3288.0, 635.0], [3232.0, 292.0], [3352.0, 0.0], [3344.0, 420.25], [3336.0, 828.1999999999999], [3388.0, 763.0], [3360.0, 277.6666666666667], [3364.0, 808.0], [3332.0, 330.0], [3340.0, 629.1724137931035], [3348.0, 286.0], [3356.0, 0.0], [3424.0, 512.5], [3436.0, 295.0], [3444.0, 774.5], [3392.0, 655.0], [3448.0, 3020.0], [3396.0, 1097.0], [3400.0, 943.5], [3404.0, 898.0], [3408.0, 1108.0], [3412.0, 305.5], [3460.0, 742.0], [3456.0, 529.5], [3464.0, 831.0], [3468.0, 961.5], [3488.0, 875.0], [3492.0, 606.0], [3496.0, 1197.0], [2149.0, 4.0], [2121.0, 3.0], [2133.0, 4.0], [2137.0, 1367.0], [2153.0, 4.5], [2113.0, 0.0], [2109.0, 3.0], [2057.0, 0.0], [2049.0, 1.0], [2073.0, 1.0], [2065.0, 1.0], [2105.0, 3.0], [2089.0, 2.0], [2081.0, 849.2], [2277.0, 2.0], [2273.0, 2017.0], [2285.0, 2.0], [2301.0, 419.0], [2249.0, 384.1666666666667], [2257.0, 3.0], [2261.0, 3.0], [2269.0, 1.0], [2205.0, 4.0], [2185.0, 4.0], [2189.0, 975.0], [2237.0, 1177.5], [2233.0, 2.0], [2229.0, 700.0], [2213.0, 1351.8333333333333], [2401.0, 395.2999999999999], [2405.0, 284.3809523809524], [2413.0, 543.3333333333334], [2409.0, 505.0], [2417.0, 429.27272727272725], [2377.0, 3.0], [2421.0, 351.0], [2381.0, 1664.0], [2313.0, 1.0], [2321.0, 662.0], [2317.0, 0.0], [2365.0, 4.0], [2341.0, 450.4], [2349.0, 676.0], [2389.0, 1.3333333333333335], [2385.0, 414.0], [2393.0, 718.5833333333331], [2397.0, 146.0], [2553.0, 912.4117647058823], [2557.0, 2063.0], [2501.0, 992.5], [2509.0, 1153.1666666666667], [2513.0, 544.5555555555555], [2525.0, 1065.0], [2521.0, 793.0], [2549.0, 338.16666666666663], [2545.0, 495.44444444444446], [2541.0, 852.3076923076922], [2533.0, 1118.8888888888891], [2529.0, 90.24324324324323], [2433.0, 368.0], [2493.0, 804.0], [2441.0, 3.5], [2457.0, 294.0], [2449.0, 189.0], [2445.0, 1106.0], [2461.0, 1219.0], [2485.0, 204.0], [2477.0, 1107.0], [2465.0, 3.4], [2609.0, 458.5], [2613.0, 1.0], [2601.0, 645.75], [2597.0, 1.0], [2605.0, 1.0], [2621.0, 344.83333333333337], [2657.0, 274.0], [2661.0, 1076.0], [2669.0, 1078.0], [2673.0, 294.0], [2681.0, 1154.5], [2625.0, 81.0], [2629.0, 1.0], [2633.0, 125.0], [2637.0, 7.0], [2649.0, 86.0], [2653.0, 1066.0], [2589.0, 630.4444444444445], [2585.0, 161.5], [2581.0, 1010.0], [2577.0, 234.0], [2573.0, 1.0], [2569.0, 100.1875], [2565.0, 1067.3333333333333], [2561.0, 552.0], [2717.0, 1042.0], [2689.0, 934.6666666666667], [2693.0, 1362.0], [2797.0, 2266.0], [2809.0, 441.0], [2813.0, 2244.0], [2737.0, 2292.0], [2733.0, 1071.75], [2725.0, 414.0], [2765.0, 907.5], [2877.0, 1.0], [2869.0, 657.0], [2825.0, 149.66666666666666], [2873.0, 710.5], [2861.0, 1.0], [2857.0, 406.33333333333337], [2853.0, 716.25], [2821.0, 1059.0], [2829.0, 784.6666666666666], [2841.0, 843.1666666666667], [2845.0, 785.0], [2913.0, 757.6], [2925.0, 759.0], [2881.0, 1.0], [2889.0, 525.0], [2885.0, 757.0], [2893.0, 1.0], [2897.0, 446.6666666666667], [2909.0, 1.0], [3045.0, 1042.5], [2969.0, 614.0], [2997.0, 630.0], [2957.0, 602.0], [3069.0, 1141.6666666666667], [3013.0, 157.0], [3065.0, 1413.0], [3057.0, 690.5], [3049.0, 680.0], [3029.0, 252.0], [3021.0, 1325.0], [2977.0, 629.0], [3093.0, 373.0], [3101.0, 1926.0], [3081.0, 866.5], [3129.0, 382.5], [3089.0, 2323.0], [3137.0, 493.0], [3197.0, 1863.3333333333335], [3189.0, 1593.5], [3193.0, 515.0], [3177.0, 1879.6666666666665], [3173.0, 526.0], [3141.0, 1825.6666666666667], [3145.0, 350.0], [3157.0, 159.0], [3113.0, 1567.25], [3109.0, 579.0], [3117.0, 1189.0], [3305.0, 888.3333333333333], [3257.0, 1121.0], [3261.0, 0.3333333333333333], [3249.0, 335.25], [3245.0, 649.75], [3237.0, 600.75], [3217.0, 1655.5], [3221.0, 1496.0], [3297.0, 498.0], [3301.0, 237.25], [3309.0, 664.0], [3317.0, 970.0], [3321.0, 131.5], [3325.0, 1.0], [3265.0, 1341.5], [3269.0, 167.0], [3273.0, 1793.0], [3277.0, 0.5], [3281.0, 0.0], [3289.0, 1031.3333333333333], [3233.0, 465.0], [3333.0, 200.625], [3329.0, 0.5], [3377.0, 1713.0], [3361.0, 395.6666666666667], [3337.0, 860.0], [3341.0, 204.41666666666666], [3345.0, 0.0], [3349.0, 2925.0], [3357.0, 0.5], [3425.0, 1134.0], [3433.0, 751.0], [3437.0, 567.0], [3397.0, 429.0], [3413.0, 1123.0], [3417.0, 549.5], [3497.0, 152.66666666666669], [3457.0, 594.3333333333334], [3489.0, 816.0], [3493.0, 519.0], [3461.0, 409.0], [3477.0, 991.0], [3481.0, 563.0], [1081.0, 719.0], [1083.0, 1234.0], [1075.0, 964.0], [1071.0, 779.0], [1061.0, 1160.0], [1059.0, 972.0], [1055.0, 663.5], [1045.0, 1170.0], [1037.0, 550.0], [1025.0, 807.0], [1143.0, 894.0], [1149.0, 914.0], [1151.0, 473.0], [1145.0, 1191.0], [1141.0, 484.0], [1137.0, 737.0], [1125.0, 689.0], [1123.0, 495.0], [1119.0, 748.0], [1091.0, 1138.0], [1089.0, 734.0], [1101.0, 759.0], [1099.0, 1224.0], [1115.0, 1214.0], [1109.0, 698.0], [1107.0, 1127.0], [1203.0, 854.0], [1211.0, 504.0], [1215.0, 835.0], [1209.0, 600.0], [1201.0, 420.0], [1161.0, 1128.5], [1159.0, 781.5], [1153.0, 1182.0], [1199.0, 622.0], [1191.0, 1020.6666666666666], [1183.0, 1153.0], [1173.0, 1118.0], [1169.0, 451.0], [1275.0, 574.0], [1271.0, 600.0], [1231.0, 850.25], [1229.0, 579.0], [1227.0, 815.6], [1225.0, 590.0], [1221.0, 649.0], [1263.0, 958.0], [1259.0, 584.0], [1257.0, 610.0], [1253.0, 594.0], [1247.0, 794.6666666666666], [1243.0, 1000.0], [1239.0, 480.0], [1235.0, 955.5], [1233.0, 627.0], [1337.0, 671.5], [1335.0, 575.6666666666666], [1327.0, 585.6666666666666], [1321.0, 622.5], [1317.0, 515.6666666666666], [1311.0, 666.5], [1307.0, 909.0], [1303.0, 561.0], [1285.0, 725.6], [1401.0, 872.0], [1405.0, 409.0], [1395.0, 811.0], [1393.0, 603.5], [1391.0, 883.0], [1387.0, 1123.0], [1379.0, 717.3333333333334], [1375.0, 629.0], [1359.0, 556.0], [1347.0, 947.0], [1371.0, 888.5], [1367.0, 1244.0], [1365.0, 643.5], [1363.0, 573.25], [1457.0, 373.66666666666663], [1467.0, 471.22222222222223], [1469.0, 460.3636363636364], [1463.0, 597.8965517241378], [1455.0, 564.4], [1453.0, 433.875], [1451.0, 363.103448275862], [1447.0, 428.9166666666667], [1449.0, 531.0357142857142], [1443.0, 278.63414634146335], [1441.0, 423.12195121951225], [1445.0, 374.8157894736842], [1459.0, 474.1249999999999], [1461.0, 480.16666666666663], [1465.0, 593.2], [1471.0, 582.0312500000001], [1439.0, 454.83333333333337], [1419.0, 751.8571428571429], [1417.0, 285.4117647058824], [1415.0, 900.3333333333334], [1423.0, 469.7777777777777], [1421.0, 346.9285714285714], [1437.0, 339.0], [1435.0, 360.8787878787878], [1431.0, 224.60000000000002], [1433.0, 260.57142857142856], [1429.0, 281.09090909090907], [1425.0, 323.60317460317475], [1427.0, 190.8], [1485.0, 522.047619047619], [1529.0, 462.6451612903225], [1535.0, 544.9333333333335], [1531.0, 445.5], [1533.0, 489.65217391304344], [1527.0, 432.1034482758621], [1525.0, 522.0588235294117], [1523.0, 505.263157894737], [1509.0, 552.3428571428573], [1511.0, 402.22727272727275], [1513.0, 561.8214285714287], [1515.0, 503.1428571428571], [1517.0, 330.0555555555556], [1519.0, 410.2380952380952], [1507.0, 431.1851851851851], [1505.0, 442.29787234042556], [1501.0, 487.97297297297297], [1503.0, 417.89655172413785], [1497.0, 368.61333333333334], [1499.0, 291.62500000000006], [1475.0, 683.7368421052632], [1473.0, 462.65217391304355], [1481.0, 411.3870967741935], [1483.0, 498.78260869565224], [1479.0, 352.6923076923076], [1477.0, 448.51851851851853], [1487.0, 495.3947368421053], [1521.0, 498.83333333333337], [1495.0, 337.6857142857143], [1493.0, 492.11594202898544], [1489.0, 385.63265306122446], [1491.0, 473.3928571428571], [1543.0, 637.3888888888889], [1561.0, 646.5384615384614], [1595.0, 778.8], [1597.0, 467.96000000000026], [1599.0, 393.2941176470589], [1591.0, 487.90909090909093], [1589.0, 342.80952380952385], [1593.0, 567.4999999999999], [1587.0, 284.1052631578947], [1559.0, 500.705882352941], [1553.0, 571.875], [1555.0, 654.0], [1557.0, 637.2222222222223], [1563.0, 510.8], [1565.0, 554.0], [1567.0, 773.9333333333334], [1541.0, 523.6363636363636], [1539.0, 251.8], [1537.0, 434.46666666666664], [1585.0, 287.5833333333333], [1545.0, 795.0], [1547.0, 462.0], [1549.0, 714.75], [1551.0, 797.6923076923077], [1569.0, 614.3181818181819], [1571.0, 530.8076923076924], [1573.0, 407.2432432432432], [1579.0, 548.3235294117646], [1583.0, 553.7567567567567], [1581.0, 667.6818181818184], [1577.0, 690.8181818181819], [1575.0, 329.5079365079365], [1615.0, 609.6666666666666], [1617.0, 349.6538461538462], [1619.0, 566.3636363636364], [1627.0, 553.1333333333333], [1629.0, 536.6], [1631.0, 144.53658536585365], [1621.0, 442.6666666666667], [1623.0, 246.66666666666669], [1625.0, 76.33333333333333], [1603.0, 260.0], [1605.0, 368.44444444444434], [1607.0, 162.66666666666669], [1609.0, 874.0], [1613.0, 576.0], [1611.0, 716.0], [1601.0, 389.89655172413796], [1645.0, 1096.4615384615388], [1647.0, 956.2857142857143], [1653.0, 531.5454545454546], [1649.0, 1384.5], [1651.0, 530.5384615384615], [1633.0, 473.15384615384613], [1635.0, 59.5], [1641.0, 681.5], [1643.0, 555.25], [1639.0, 526.6], [1637.0, 613.375], [1663.0, 517.3333333333334], [1661.0, 478.5833333333333], [1659.0, 560.7692307692308], [1655.0, 330.58333333333337], [1657.0, 231.28571428571428], [1673.0, 824.0], [1677.0, 787.0], [1679.0, 1094.0], [1671.0, 1828.0], [1667.0, 373.16666666666663], [1665.0, 540.625], [1685.0, 1819.0], [1683.0, 1615.5], [1681.0, 463.0], [1717.0, 422.33333333333337], [1713.0, 1.0], [1697.0, 0.0], [1693.0, 367.0], [1687.0, 1.0], [1771.0, 1335.6], [1787.0, 1157.3333333333333], [1775.0, 821.0], [1761.0, 1320.0], [1731.0, 1862.0], [1791.0, 1.0], [1781.0, 1052.0], [1773.0, 1.0], [1765.0, 586.5], [1847.0, 601.0], [1855.0, 477.0], [1837.0, 826.0], [1827.0, 1025.75], [1819.0, 1518.6666666666667], [1815.0, 655.0], [1809.0, 1.0], [1849.0, 1.0], [1845.0, 942.0], [1821.0, 1.0], [1793.0, 1.0], [1895.0, 943.5], [1861.0, 17.0], [1919.0, 708.0], [1889.0, 1.0], [1877.0, 572.0], [1971.0, 889.7142857142857], [1977.0, 814.0], [1983.0, 1368.0], [1979.0, 1117.0], [1941.0, 1.0], [1935.0, 1.0], [1931.0, 1.5], [1923.0, 1.2], [1999.0, 1285.0], [2037.0, 94.0], [1987.0, 1100.4696969696972], [2007.0, 1283.0], [2003.0, 216.57142857142858], [1985.0, 1526.8461538461538], [2035.0, 633.4666666666667], [2033.0, 174.0], [1997.0, 1538.75], [1995.0, 1903.0], [2029.0, 694.8571428571429], [2025.0, 2.285714285714286], [2031.0, 3.0], [2047.0, 96.0], [2023.0, 930.0], [2045.0, 1031.0], [2043.0, 739.2413793103449], [2158.0, 4.0], [2174.0, 3.0], [2126.0, 716.5], [2122.0, 1.0], [2114.0, 0.0], [2142.0, 377.42857142857144], [2134.0, 1.0], [2162.0, 1.3333333333333335], [2154.0, 4.0], [2146.0, 1.0], [2066.0, 986.0], [2106.0, 3.0], [2098.0, 3.0], [2094.0, 3.0], [2090.0, 2.0], [2086.0, 1.0], [2202.0, 2009.0], [2254.0, 866.3333333333333], [2262.0, 311.33333333333337], [2286.0, 2.0], [2206.0, 551.0], [2290.0, 1.0], [2190.0, 4.0], [2186.0, 4.0], [2238.0, 2017.0], [2178.0, 331.0], [2234.0, 2.0], [2230.0, 1.0], [2226.0, 1974.0], [2214.0, 2.0], [2414.0, 88.75], [2402.0, 170.69565217391306], [2410.0, 462.0], [2406.0, 449.66666666666674], [2382.0, 556.6666666666667], [2386.0, 651.75], [2418.0, 729.5], [2422.0, 52.0], [2370.0, 280.57142857142856], [2306.0, 3.0], [2326.0, 124.8], [2334.0, 1661.3333333333333], [2350.0, 77.0], [2398.0, 110.0], [2394.0, 439.9090909090909], [2390.0, 640.6666666666667], [2558.0, 2022.0], [2502.0, 1291.0], [2510.0, 833.9999999999999], [2514.0, 136.14285714285714], [2526.0, 4.0], [2522.0, 506.25], [2554.0, 390.4], [2550.0, 921.75], [2546.0, 853.9166666666665], [2542.0, 620.4545454545455], [2538.0, 1178.888888888889], [2530.0, 5.0], [2434.0, 3.0], [2438.0, 3.5], [2442.0, 3.0], [2450.0, 103.72727272727272], [2446.0, 335.25], [2454.0, 717.5], [2590.0, 827.8947368421053], [2618.0, 2.0], [2606.0, 73.33333333333334], [2598.0, 1.0], [2602.0, 824.8], [2678.0, 1101.0], [2682.0, 289.0], [2670.0, 193.33333333333334], [2666.0, 194.0], [2626.0, 2.0], [2634.0, 348.33333333333337], [2638.0, 2.0], [2642.0, 260.0], [2646.0, 267.0], [2650.0, 2.5], [2654.0, 292.6666666666667], [2582.0, 978.6666666666666], [2586.0, 729.3333333333334], [2574.0, 1009.2307692307692], [2570.0, 1.0], [2566.0, 607.9200000000001], [2562.0, 325.5], [2622.0, 700.0], [2746.0, 418.0], [2702.0, 2219.0], [2734.0, 404.0], [2778.0, 1610.3333333333333], [2806.0, 2144.0], [2814.0, 442.0], [2798.0, 430.0], [2790.0, 1124.4848484848483], [2846.0, 472.0], [2866.0, 1.0], [2818.0, 218.0], [2878.0, 1.0], [2874.0, 488.0], [2862.0, 1.0], [2858.0, 651.5], [2826.0, 0.0], [2834.0, 1.0], [2838.0, 161.33333333333331], [2942.0, 1383.25], [2938.0, 1511.5], [2926.0, 890.5], [2918.0, 0.0], [2922.0, 0.75], [2914.0, 364.33333333333337], [2882.0, 923.0], [2886.0, 442.66666666666663], [2890.0, 131.0], [2894.0, 931.0], [2898.0, 762.0], [2906.0, 1.0], [2910.0, 666.6666666666666], [2854.0, 0.0], [2958.0, 809.0], [2946.0, 580.5], [3006.0, 1585.0], [2998.0, 1375.0], [2990.0, 712.25], [2970.0, 2487.0], [3070.0, 275.0], [3058.0, 1040.3333333333333], [3010.0, 1339.5], [3018.0, 497.5], [3022.0, 649.0], [2978.0, 1196.6666666666667], [2986.0, 2512.0], [3094.0, 726.0], [3102.0, 401.0], [3082.0, 715.0], [3134.0, 361.0], [3090.0, 733.0], [3190.0, 391.0], [3194.0, 2676.0], [3186.0, 2422.0], [3182.0, 826.0], [3170.0, 170.0], [3150.0, 793.0], [3154.0, 1840.6666666666667], [3158.0, 2512.0], [3166.0, 2639.0], [3114.0, 471.0], [3110.0, 703.0], [3126.0, 1422.5], [3230.0, 871.6666666666666], [3206.0, 556.0], [3258.0, 0.5], [3262.0, 904.0], [3254.0, 364.33333333333337], [3250.0, 1385.5], [3242.0, 0.0], [3246.0, 947.25], [3214.0, 860.0], [3226.0, 870.0], [3270.0, 915.0], [3326.0, 512.5], [3322.0, 330.0], [3318.0, 1269.0], [3314.0, 1338.5], [3306.0, 579.0], [3310.0, 767.8571428571429], [3298.0, 0.0], [3302.0, 648.0], [3278.0, 199.5], [3282.0, 1398.0], [3290.0, 468.5], [3294.0, 713.5], [3234.0, 0.0], [3350.0, 529.0], [3330.0, 0.6666666666666667], [3390.0, 1101.0], [3382.0, 357.0], [3386.0, 803.5], [3334.0, 757.0], [3338.0, 1002.0], [3342.0, 612.0833333333333], [3346.0, 1.0], [3354.0, 291.5], [3358.0, 739.4285714285714], [3434.0, 378.0], [3438.0, 813.0], [3442.0, 772.0], [3446.0, 306.0], [3454.0, 820.0], [3394.0, 567.0], [3406.0, 539.5], [3410.0, 409.0], [3414.0, 785.0], [3470.0, 653.25], [3478.0, 1937.5], [3486.0, 548.0], [3490.0, 785.0], [3494.0, 381.66666666666663], [3498.0, 503.0], [2171.0, 3.0], [2115.0, 4.0], [2123.0, 2.0], [2131.0, 4.428571428571429], [2135.0, 837.0], [2139.0, 0.0], [2151.0, 3.0], [2075.0, 561.0], [2107.0, 3.0], [2103.0, 3.0], [2095.0, 3.0], [2091.0, 47.66666666666667], [2287.0, 2.0], [2243.0, 2.0], [2299.0, 1238.5], [2295.0, 1.0], [2259.0, 2.0], [2267.0, 1.6666666666666667], [2263.0, 209.66666666666669], [2279.0, 1173.3333333333333], [2207.0, 4.0], [2187.0, 4.0], [2183.0, 1.0], [2179.0, 3.0], [2231.0, 2.0], [2239.0, 324.0], [2235.0, 0.0], [2227.0, 1.0], [2223.0, 735.5], [2215.0, 866.0], [2211.0, 211.5], [2307.0, 148.0], [2379.0, 3.0], [2375.0, 1087.0], [2415.0, 0.5], [2419.0, 355.2], [2395.0, 447.25], [2399.0, 1.0], [2391.0, 210.625], [2411.0, 274.75], [2407.0, 339.90909090909093], [2403.0, 175.30769230769226], [2367.0, 606.6], [2319.0, 2.0], [2335.0, 581.0], [2351.0, 4.0], [2347.0, 53.66666666666667], [2343.0, 4.0], [2339.0, 1.0], [2555.0, 186.25], [2559.0, 127.75], [2503.0, 1314.5], [2507.0, 1311.0], [2515.0, 3.0], [2527.0, 245.5714285714285], [2547.0, 1347.25], [2543.0, 1.0], [2539.0, 787.6363636363635], [2535.0, 336.6], [2531.0, 636.0], [2491.0, 76.5], [2435.0, 137.8], [2439.0, 455.66666666666663], [2459.0, 427.0], [2463.0, 908.0], [2475.0, 940.3333333333334], [2471.0, 113.0], [2467.0, 814.0], [2551.0, 1.5], [2659.0, 1.6666666666666667], [2599.0, 117.4], [2607.0, 2.0], [2611.0, 1.0], [2623.0, 1374.0], [2615.0, 204.0], [2663.0, 525.2], [2671.0, 1.0], [2683.0, 1165.6666666666667], [2675.0, 283.0], [2687.0, 301.0], [2627.0, 1055.0], [2631.0, 1613.0], [2635.0, 652.0], [2639.0, 844.8333333333333], [2643.0, 425.4], [2651.0, 1261.0], [2583.0, 974.6666666666666], [2591.0, 213.0], [2587.0, 811.0], [2571.0, 1.0], [2567.0, 583.2800000000001], [2563.0, 336.5], [2711.0, 775.0], [2799.0, 1774.5], [2791.0, 1515.25], [2811.0, 1246.0], [2727.0, 1306.7272727272727], [2739.0, 2247.0], [2743.0, 769.0], [2691.0, 612.0], [2759.0, 1798.0], [2831.0, 701.5], [2819.0, 0.0], [2875.0, 204.6], [2867.0, 165.0], [2863.0, 674.6], [2855.0, 953.6666666666666], [2851.0, 639.8571428571428], [2823.0, 428.74999999999994], [2827.0, 940.0], [2835.0, 0.5], [2843.0, 159.33333333333334], [2915.0, 0.0], [2927.0, 683.0], [2935.0, 571.0], [2887.0, 2361.0], [2891.0, 0.0], [2895.0, 1877.0], [2899.0, 808.0], [2903.0, 1.0], [2907.0, 1.0], [2959.0, 426.5], [2955.0, 2463.0], [3023.0, 644.0], [3019.0, 476.0], [3071.0, 692.0], [3067.0, 695.0], [3059.0, 680.0], [3027.0, 2377.0], [3039.0, 669.0], [3035.0, 578.0], [2979.0, 1492.0], [2995.0, 634.0], [3003.0, 2521.0], [3007.0, 638.0], [3179.0, 381.0], [3079.0, 1956.3333333333335], [3091.0, 1464.0], [3199.0, 402.0], [3171.0, 1746.0], [3095.0, 921.0], [3147.0, 1323.0], [3155.0, 361.0], [3167.0, 705.5], [3123.0, 768.0], [3127.0, 1536.5], [3231.0, 432.5], [3207.0, 2728.0], [3203.0, 525.5], [3263.0, 666.8], [3255.0, 1.0], [3247.0, 1.0], [3239.0, 204.5], [3211.0, 1986.6666666666665], [3219.0, 853.0], [3299.0, 1.0], [3303.0, 0.5], [3315.0, 0.5], [3319.0, 1.0], [3327.0, 997.4285714285714], [3267.0, 204.66666666666666], [3271.0, 658.25], [3275.0, 208.0], [3279.0, 463.0], [3283.0, 421.0], [3287.0, 0.75], [3291.0, 1.0], [3295.0, 1034.0], [3235.0, 0.0], [3387.0, 344.5], [3335.0, 142.125], [3379.0, 1090.0], [3383.0, 682.0], [3371.0, 792.5], [3375.0, 602.5], [3367.0, 1817.5], [3331.0, 0.5], [3339.0, 900.5999999999999], [3343.0, 487.0], [3351.0, 731.2857142857143], [3355.0, 1001.5], [3427.0, 808.0], [3447.0, 740.0], [3395.0, 530.5], [3399.0, 448.0], [3419.0, 1119.0], [3423.0, 283.0], [3467.0, 427.0], [3459.0, 1019.0], [3475.0, 549.6666666666666], [3479.0, 763.5], [3487.0, 854.0]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[1833.0179000000041, 572.7065999999961]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 3498.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 929388.35, "minX": 1.52524224E12, "maxY": 1155171.8833333333, "series": [{"data": [[1.52524224E12, 1155171.8833333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52524224E12, 929388.35]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524224E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 572.7065999999961, "minX": 1.52524224E12, "maxY": 572.7065999999961, "series": [{"data": [[1.52524224E12, 572.7065999999961]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524224E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 542.4426000000024, "minX": 1.52524224E12, "maxY": 542.4426000000024, "series": [{"data": [[1.52524224E12, 542.4426000000024]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524224E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 80.73990000000006, "minX": 1.52524224E12, "maxY": 80.73990000000006, "series": [{"data": [[1.52524224E12, 80.73990000000006]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524224E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 16.0, "minX": 1.52524224E12, "maxY": 3102.0, "series": [{"data": [[1.52524224E12, 3102.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52524224E12, 16.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52524224E12, 1434.1000000000004]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52524224E12, 2596.41]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52524224E12, 1835.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524224E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 1.0, "minX": 166.0, "maxY": 725.0, "series": [{"data": [[166.0, 725.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[166.0, 1.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 166.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 1.0, "minX": 166.0, "maxY": 724.5, "series": [{"data": [[166.0, 724.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[166.0, 1.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 166.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 166.66666666666666, "minX": 1.52524224E12, "maxY": 166.66666666666666, "series": [{"data": [[1.52524224E12, 166.66666666666666]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524224E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 3.216666666666667, "minX": 1.52524224E12, "maxY": 102.63333333333334, "series": [{"data": [[1.52524224E12, 102.63333333333334]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52524224E12, 60.81666666666667]], "isOverall": false, "label": "502", "isController": false}, {"data": [[1.52524224E12, 3.216666666666667]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524224E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 64.03333333333333, "minX": 1.52524224E12, "maxY": 102.63333333333334, "series": [{"data": [[1.52524224E12, 102.63333333333334]], "isOverall": false, "label": "inference-success", "isController": false}, {"data": [[1.52524224E12, 64.03333333333333]], "isOverall": false, "label": "inference-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524224E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
