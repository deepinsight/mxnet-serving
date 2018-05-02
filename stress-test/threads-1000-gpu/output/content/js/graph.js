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
        data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 4208.0, "series": [{"data": [[0.0, 0.0], [0.1, 0.0], [0.2, 0.0], [0.3, 0.0], [0.4, 0.0], [0.5, 0.0], [0.6, 0.0], [0.7, 0.0], [0.8, 0.0], [0.9, 0.0], [1.0, 0.0], [1.1, 0.0], [1.2, 0.0], [1.3, 0.0], [1.4, 0.0], [1.5, 0.0], [1.6, 0.0], [1.7, 0.0], [1.8, 0.0], [1.9, 0.0], [2.0, 0.0], [2.1, 0.0], [2.2, 0.0], [2.3, 0.0], [2.4, 0.0], [2.5, 0.0], [2.6, 0.0], [2.7, 0.0], [2.8, 0.0], [2.9, 0.0], [3.0, 0.0], [3.1, 0.0], [3.2, 0.0], [3.3, 0.0], [3.4, 0.0], [3.5, 0.0], [3.6, 0.0], [3.7, 0.0], [3.8, 0.0], [3.9, 0.0], [4.0, 0.0], [4.1, 0.0], [4.2, 0.0], [4.3, 0.0], [4.4, 0.0], [4.5, 0.0], [4.6, 0.0], [4.7, 0.0], [4.8, 0.0], [4.9, 0.0], [5.0, 0.0], [5.1, 0.0], [5.2, 0.0], [5.3, 0.0], [5.4, 0.0], [5.5, 0.0], [5.6, 0.0], [5.7, 0.0], [5.8, 0.0], [5.9, 0.0], [6.0, 0.0], [6.1, 0.0], [6.2, 0.0], [6.3, 0.0], [6.4, 0.0], [6.5, 0.0], [6.6, 0.0], [6.7, 0.0], [6.8, 0.0], [6.9, 0.0], [7.0, 0.0], [7.1, 0.0], [7.2, 0.0], [7.3, 0.0], [7.4, 0.0], [7.5, 0.0], [7.6, 0.0], [7.7, 0.0], [7.8, 1.0], [7.9, 1.0], [8.0, 1.0], [8.1, 1.0], [8.2, 1.0], [8.3, 1.0], [8.4, 1.0], [8.5, 1.0], [8.6, 1.0], [8.7, 1.0], [8.8, 1.0], [8.9, 1.0], [9.0, 1.0], [9.1, 1.0], [9.2, 1.0], [9.3, 1.0], [9.4, 1.0], [9.5, 1.0], [9.6, 1.0], [9.7, 1.0], [9.8, 1.0], [9.9, 1.0], [10.0, 1.0], [10.1, 1.0], [10.2, 1.0], [10.3, 1.0], [10.4, 1.0], [10.5, 1.0], [10.6, 1.0], [10.7, 1.0], [10.8, 1.0], [10.9, 1.0], [11.0, 1.0], [11.1, 1.0], [11.2, 1.0], [11.3, 1.0], [11.4, 1.0], [11.5, 1.0], [11.6, 1.0], [11.7, 1.0], [11.8, 1.0], [11.9, 1.0], [12.0, 1.0], [12.1, 1.0], [12.2, 1.0], [12.3, 1.0], [12.4, 1.0], [12.5, 1.0], [12.6, 1.0], [12.7, 1.0], [12.8, 1.0], [12.9, 1.0], [13.0, 1.0], [13.1, 1.0], [13.2, 1.0], [13.3, 1.0], [13.4, 1.0], [13.5, 1.0], [13.6, 1.0], [13.7, 1.0], [13.8, 1.0], [13.9, 1.0], [14.0, 1.0], [14.1, 1.0], [14.2, 1.0], [14.3, 1.0], [14.4, 1.0], [14.5, 1.0], [14.6, 1.0], [14.7, 1.0], [14.8, 1.0], [14.9, 1.0], [15.0, 1.0], [15.1, 1.0], [15.2, 1.0], [15.3, 1.0], [15.4, 1.0], [15.5, 1.0], [15.6, 1.0], [15.7, 1.0], [15.8, 1.0], [15.9, 1.0], [16.0, 1.0], [16.1, 1.0], [16.2, 1.0], [16.3, 1.0], [16.4, 1.0], [16.5, 1.0], [16.6, 1.0], [16.7, 1.0], [16.8, 1.0], [16.9, 1.0], [17.0, 1.0], [17.1, 1.0], [17.2, 1.0], [17.3, 1.0], [17.4, 1.0], [17.5, 1.0], [17.6, 1.0], [17.7, 1.0], [17.8, 1.0], [17.9, 1.0], [18.0, 1.0], [18.1, 1.0], [18.2, 1.0], [18.3, 1.0], [18.4, 1.0], [18.5, 1.0], [18.6, 1.0], [18.7, 1.0], [18.8, 1.0], [18.9, 1.0], [19.0, 1.0], [19.1, 1.0], [19.2, 1.0], [19.3, 1.0], [19.4, 1.0], [19.5, 1.0], [19.6, 1.0], [19.7, 1.0], [19.8, 1.0], [19.9, 1.0], [20.0, 1.0], [20.1, 1.0], [20.2, 1.0], [20.3, 1.0], [20.4, 1.0], [20.5, 1.0], [20.6, 1.0], [20.7, 1.0], [20.8, 1.0], [20.9, 1.0], [21.0, 1.0], [21.1, 1.0], [21.2, 1.0], [21.3, 1.0], [21.4, 1.0], [21.5, 1.0], [21.6, 1.0], [21.7, 1.0], [21.8, 1.0], [21.9, 1.0], [22.0, 1.0], [22.1, 1.0], [22.2, 1.0], [22.3, 1.0], [22.4, 1.0], [22.5, 1.0], [22.6, 1.0], [22.7, 1.0], [22.8, 1.0], [22.9, 1.0], [23.0, 1.0], [23.1, 1.0], [23.2, 1.0], [23.3, 1.0], [23.4, 1.0], [23.5, 1.0], [23.6, 1.0], [23.7, 2.0], [23.8, 2.0], [23.9, 2.0], [24.0, 2.0], [24.1, 2.0], [24.2, 2.0], [24.3, 2.0], [24.4, 2.0], [24.5, 2.0], [24.6, 2.0], [24.7, 2.0], [24.8, 2.0], [24.9, 2.0], [25.0, 2.0], [25.1, 2.0], [25.2, 2.0], [25.3, 2.0], [25.4, 2.0], [25.5, 3.0], [25.6, 3.0], [25.7, 3.0], [25.8, 3.0], [25.9, 3.0], [26.0, 3.0], [26.1, 3.0], [26.2, 4.0], [26.3, 4.0], [26.4, 4.0], [26.5, 4.0], [26.6, 5.0], [26.7, 5.0], [26.8, 6.0], [26.9, 19.0], [27.0, 32.0], [27.1, 44.0], [27.2, 52.0], [27.3, 60.0], [27.4, 67.0], [27.5, 73.0], [27.6, 79.0], [27.7, 86.0], [27.8, 90.0], [27.9, 95.0], [28.0, 102.0], [28.1, 106.0], [28.2, 114.0], [28.3, 119.0], [28.4, 123.0], [28.5, 129.0], [28.6, 133.0], [28.7, 137.0], [28.8, 143.0], [28.9, 146.0], [29.0, 153.0], [29.1, 156.0], [29.2, 163.0], [29.3, 166.0], [29.4, 172.0], [29.5, 176.0], [29.6, 180.0], [29.7, 185.0], [29.8, 187.0], [29.9, 190.0], [30.0, 193.0], [30.1, 197.0], [30.2, 199.0], [30.3, 201.0], [30.4, 203.0], [30.5, 209.0], [30.6, 210.0], [30.7, 213.0], [30.8, 218.0], [30.9, 220.0], [31.0, 222.0], [31.1, 225.0], [31.2, 229.0], [31.3, 232.0], [31.4, 233.0], [31.5, 237.0], [31.6, 240.0], [31.7, 242.0], [31.8, 245.0], [31.9, 248.0], [32.0, 251.0], [32.1, 253.0], [32.2, 255.0], [32.3, 257.0], [32.4, 260.0], [32.5, 262.0], [32.6, 264.0], [32.7, 267.0], [32.8, 269.0], [32.9, 272.0], [33.0, 274.0], [33.1, 276.0], [33.2, 279.0], [33.3, 282.0], [33.4, 284.0], [33.5, 286.0], [33.6, 288.0], [33.7, 290.0], [33.8, 294.0], [33.9, 297.0], [34.0, 298.0], [34.1, 301.0], [34.2, 303.0], [34.3, 306.0], [34.4, 310.0], [34.5, 312.0], [34.6, 314.0], [34.7, 316.0], [34.8, 319.0], [34.9, 321.0], [35.0, 323.0], [35.1, 326.0], [35.2, 330.0], [35.3, 332.0], [35.4, 333.0], [35.5, 335.0], [35.6, 339.0], [35.7, 341.0], [35.8, 344.0], [35.9, 347.0], [36.0, 351.0], [36.1, 352.0], [36.2, 354.0], [36.3, 355.0], [36.4, 359.0], [36.5, 362.0], [36.6, 364.0], [36.7, 366.0], [36.8, 370.0], [36.9, 373.0], [37.0, 375.0], [37.1, 376.0], [37.2, 378.0], [37.3, 380.0], [37.4, 382.0], [37.5, 384.0], [37.6, 385.0], [37.7, 386.0], [37.8, 388.0], [37.9, 390.0], [38.0, 391.0], [38.1, 393.0], [38.2, 396.0], [38.3, 396.0], [38.4, 398.0], [38.5, 399.0], [38.6, 400.0], [38.7, 402.0], [38.8, 403.0], [38.9, 404.0], [39.0, 406.0], [39.1, 407.0], [39.2, 409.0], [39.3, 410.0], [39.4, 412.0], [39.5, 413.0], [39.6, 414.0], [39.7, 415.0], [39.8, 416.0], [39.9, 417.0], [40.0, 418.0], [40.1, 419.0], [40.2, 422.0], [40.3, 423.0], [40.4, 424.0], [40.5, 425.0], [40.6, 426.0], [40.7, 428.0], [40.8, 429.0], [40.9, 430.0], [41.0, 433.0], [41.1, 434.0], [41.2, 435.0], [41.3, 436.0], [41.4, 437.0], [41.5, 438.0], [41.6, 439.0], [41.7, 440.0], [41.8, 441.0], [41.9, 443.0], [42.0, 446.0], [42.1, 448.0], [42.2, 449.0], [42.3, 451.0], [42.4, 454.0], [42.5, 455.0], [42.6, 458.0], [42.7, 459.0], [42.8, 460.0], [42.9, 461.0], [43.0, 464.0], [43.1, 467.0], [43.2, 469.0], [43.3, 469.0], [43.4, 471.0], [43.5, 473.0], [43.6, 476.0], [43.7, 478.0], [43.8, 479.0], [43.9, 481.0], [44.0, 483.0], [44.1, 485.0], [44.2, 487.0], [44.3, 489.0], [44.4, 492.0], [44.5, 493.0], [44.6, 495.0], [44.7, 497.0], [44.8, 498.0], [44.9, 500.0], [45.0, 501.0], [45.1, 501.0], [45.2, 502.0], [45.3, 503.0], [45.4, 504.0], [45.5, 506.0], [45.6, 507.0], [45.7, 508.0], [45.8, 509.0], [45.9, 510.0], [46.0, 511.0], [46.1, 512.0], [46.2, 513.0], [46.3, 514.0], [46.4, 514.0], [46.5, 516.0], [46.6, 518.0], [46.7, 519.0], [46.8, 520.0], [46.9, 522.0], [47.0, 522.0], [47.1, 523.0], [47.2, 524.0], [47.3, 525.0], [47.4, 525.0], [47.5, 527.0], [47.6, 528.0], [47.7, 529.0], [47.8, 530.0], [47.9, 531.0], [48.0, 533.0], [48.1, 533.0], [48.2, 534.0], [48.3, 534.0], [48.4, 534.0], [48.5, 535.0], [48.6, 535.0], [48.7, 536.0], [48.8, 536.0], [48.9, 537.0], [49.0, 538.0], [49.1, 539.0], [49.2, 539.0], [49.3, 540.0], [49.4, 541.0], [49.5, 542.0], [49.6, 543.0], [49.7, 544.0], [49.8, 545.0], [49.9, 546.0], [50.0, 547.0], [50.1, 548.0], [50.2, 549.0], [50.3, 549.0], [50.4, 550.0], [50.5, 551.0], [50.6, 551.0], [50.7, 552.0], [50.8, 553.0], [50.9, 553.0], [51.0, 553.0], [51.1, 554.0], [51.2, 555.0], [51.3, 556.0], [51.4, 557.0], [51.5, 559.0], [51.6, 560.0], [51.7, 561.0], [51.8, 562.0], [51.9, 564.0], [52.0, 565.0], [52.1, 567.0], [52.2, 568.0], [52.3, 569.0], [52.4, 571.0], [52.5, 571.0], [52.6, 573.0], [52.7, 573.0], [52.8, 575.0], [52.9, 577.0], [53.0, 578.0], [53.1, 579.0], [53.2, 580.0], [53.3, 581.0], [53.4, 583.0], [53.5, 584.0], [53.6, 585.0], [53.7, 586.0], [53.8, 587.0], [53.9, 588.0], [54.0, 589.0], [54.1, 590.0], [54.2, 590.0], [54.3, 592.0], [54.4, 593.0], [54.5, 594.0], [54.6, 595.0], [54.7, 597.0], [54.8, 599.0], [54.9, 600.0], [55.0, 601.0], [55.1, 602.0], [55.2, 604.0], [55.3, 606.0], [55.4, 606.0], [55.5, 608.0], [55.6, 610.0], [55.7, 612.0], [55.8, 612.0], [55.9, 614.0], [56.0, 615.0], [56.1, 617.0], [56.2, 618.0], [56.3, 620.0], [56.4, 621.0], [56.5, 623.0], [56.6, 625.0], [56.7, 626.0], [56.8, 629.0], [56.9, 630.0], [57.0, 632.0], [57.1, 634.0], [57.2, 636.0], [57.3, 640.0], [57.4, 642.0], [57.5, 644.0], [57.6, 648.0], [57.7, 654.0], [57.8, 655.0], [57.9, 657.0], [58.0, 661.0], [58.1, 664.0], [58.2, 666.0], [58.3, 669.0], [58.4, 674.0], [58.5, 676.0], [58.6, 677.0], [58.7, 680.0], [58.8, 683.0], [58.9, 686.0], [59.0, 688.0], [59.1, 691.0], [59.2, 694.0], [59.3, 696.0], [59.4, 698.0], [59.5, 701.0], [59.6, 705.0], [59.7, 707.0], [59.8, 708.0], [59.9, 710.0], [60.0, 713.0], [60.1, 715.0], [60.2, 717.0], [60.3, 718.0], [60.4, 720.0], [60.5, 723.0], [60.6, 726.0], [60.7, 727.0], [60.8, 728.0], [60.9, 730.0], [61.0, 733.0], [61.1, 735.0], [61.2, 737.0], [61.3, 739.0], [61.4, 741.0], [61.5, 743.0], [61.6, 746.0], [61.7, 749.0], [61.8, 751.0], [61.9, 753.0], [62.0, 755.0], [62.1, 757.0], [62.2, 761.0], [62.3, 762.0], [62.4, 764.0], [62.5, 767.0], [62.6, 769.0], [62.7, 772.0], [62.8, 774.0], [62.9, 778.0], [63.0, 780.0], [63.1, 783.0], [63.2, 784.0], [63.3, 786.0], [63.4, 789.0], [63.5, 793.0], [63.6, 794.0], [63.7, 796.0], [63.8, 798.0], [63.9, 802.0], [64.0, 804.0], [64.1, 806.0], [64.2, 809.0], [64.3, 811.0], [64.4, 813.0], [64.5, 816.0], [64.6, 819.0], [64.7, 821.0], [64.8, 823.0], [64.9, 825.0], [65.0, 828.0], [65.1, 831.0], [65.2, 833.0], [65.3, 837.0], [65.4, 841.0], [65.5, 843.0], [65.6, 845.0], [65.7, 850.0], [65.8, 853.0], [65.9, 855.0], [66.0, 856.0], [66.1, 859.0], [66.2, 862.0], [66.3, 864.0], [66.4, 865.0], [66.5, 868.0], [66.6, 874.0], [66.7, 875.0], [66.8, 878.0], [66.9, 881.0], [67.0, 883.0], [67.1, 885.0], [67.2, 887.0], [67.3, 889.0], [67.4, 892.0], [67.5, 894.0], [67.6, 896.0], [67.7, 899.0], [67.8, 901.0], [67.9, 903.0], [68.0, 906.0], [68.1, 909.0], [68.2, 911.0], [68.3, 913.0], [68.4, 917.0], [68.5, 920.0], [68.6, 922.0], [68.7, 924.0], [68.8, 927.0], [68.9, 931.0], [69.0, 932.0], [69.1, 935.0], [69.2, 938.0], [69.3, 940.0], [69.4, 943.0], [69.5, 948.0], [69.6, 950.0], [69.7, 953.0], [69.8, 957.0], [69.9, 960.0], [70.0, 963.0], [70.1, 964.0], [70.2, 968.0], [70.3, 971.0], [70.4, 974.0], [70.5, 978.0], [70.6, 981.0], [70.7, 984.0], [70.8, 987.0], [70.9, 990.0], [71.0, 992.0], [71.1, 997.0], [71.2, 1000.0], [71.3, 1003.0], [71.4, 1007.0], [71.5, 1010.0], [71.6, 1013.0], [71.7, 1016.0], [71.8, 1019.0], [71.9, 1022.0], [72.0, 1027.0], [72.1, 1030.0], [72.2, 1033.0], [72.3, 1040.0], [72.4, 1042.0], [72.5, 1045.0], [72.6, 1051.0], [72.7, 1053.0], [72.8, 1055.0], [72.9, 1058.0], [73.0, 1062.0], [73.1, 1064.0], [73.2, 1067.0], [73.3, 1070.0], [73.4, 1074.0], [73.5, 1075.0], [73.6, 1078.0], [73.7, 1081.0], [73.8, 1085.0], [73.9, 1089.0], [74.0, 1092.0], [74.1, 1096.0], [74.2, 1100.0], [74.3, 1104.0], [74.4, 1107.0], [74.5, 1111.0], [74.6, 1113.0], [74.7, 1115.0], [74.8, 1117.0], [74.9, 1120.0], [75.0, 1122.0], [75.1, 1123.0], [75.2, 1125.0], [75.3, 1129.0], [75.4, 1131.0], [75.5, 1132.0], [75.6, 1134.0], [75.7, 1136.0], [75.8, 1139.0], [75.9, 1142.0], [76.0, 1142.0], [76.1, 1145.0], [76.2, 1146.0], [76.3, 1149.0], [76.4, 1152.0], [76.5, 1155.0], [76.6, 1158.0], [76.7, 1160.0], [76.8, 1161.0], [76.9, 1162.0], [77.0, 1163.0], [77.1, 1164.0], [77.2, 1165.0], [77.3, 1165.0], [77.4, 1167.0], [77.5, 1168.0], [77.6, 1168.0], [77.7, 1169.0], [77.8, 1171.0], [77.9, 1172.0], [78.0, 1173.0], [78.1, 1175.0], [78.2, 1177.0], [78.3, 1178.0], [78.4, 1178.0], [78.5, 1179.0], [78.6, 1180.0], [78.7, 1181.0], [78.8, 1182.0], [78.9, 1184.0], [79.0, 1185.0], [79.1, 1185.0], [79.2, 1187.0], [79.3, 1189.0], [79.4, 1190.0], [79.5, 1191.0], [79.6, 1193.0], [79.7, 1196.0], [79.8, 1199.0], [79.9, 1200.0], [80.0, 1203.0], [80.1, 1205.0], [80.2, 1209.0], [80.3, 1210.0], [80.4, 1211.0], [80.5, 1213.0], [80.6, 1217.0], [80.7, 1219.0], [80.8, 1222.0], [80.9, 1226.0], [81.0, 1233.0], [81.1, 1237.0], [81.2, 1242.0], [81.3, 1245.0], [81.4, 1250.0], [81.5, 1252.0], [81.6, 1257.0], [81.7, 1264.0], [81.8, 1269.0], [81.9, 1275.0], [82.0, 1283.0], [82.1, 1292.0], [82.2, 1304.0], [82.3, 1318.0], [82.4, 1328.0], [82.5, 1338.0], [82.6, 1347.0], [82.7, 1358.0], [82.8, 1368.0], [82.9, 1373.0], [83.0, 1395.0], [83.1, 1412.0], [83.2, 1417.0], [83.3, 1422.0], [83.4, 1434.0], [83.5, 1447.0], [83.6, 1456.0], [83.7, 1483.0], [83.8, 1505.0], [83.9, 1522.0], [84.0, 1536.0], [84.1, 1563.0], [84.2, 1610.0], [84.3, 1636.0], [84.4, 1656.0], [84.5, 1693.0], [84.6, 1734.0], [84.7, 1747.0], [84.8, 1755.0], [84.9, 1762.0], [85.0, 1767.0], [85.1, 1772.0], [85.2, 1775.0], [85.3, 1779.0], [85.4, 1793.0], [85.5, 1803.0], [85.6, 1809.0], [85.7, 1829.0], [85.8, 1835.0], [85.9, 1839.0], [86.0, 1842.0], [86.1, 1847.0], [86.2, 1866.0], [86.3, 1877.0], [86.4, 1879.0], [86.5, 1879.0], [86.6, 1881.0], [86.7, 1884.0], [86.8, 1889.0], [86.9, 1892.0], [87.0, 1894.0], [87.1, 1898.0], [87.2, 1899.0], [87.3, 1901.0], [87.4, 1902.0], [87.5, 1903.0], [87.6, 1905.0], [87.7, 1910.0], [87.8, 1912.0], [87.9, 1914.0], [88.0, 1917.0], [88.1, 1920.0], [88.2, 1925.0], [88.3, 1959.0], [88.4, 1969.0], [88.5, 1984.0], [88.6, 2001.0], [88.7, 2007.0], [88.8, 2014.0], [88.9, 2016.0], [89.0, 2017.0], [89.1, 2018.0], [89.2, 2019.0], [89.3, 2020.0], [89.4, 2021.0], [89.5, 2023.0], [89.6, 2024.0], [89.7, 2028.0], [89.8, 2032.0], [89.9, 2037.0], [90.0, 2044.0], [90.1, 2116.0], [90.2, 2123.0], [90.3, 2130.0], [90.4, 2134.0], [90.5, 2146.0], [90.6, 2185.0], [90.7, 2194.0], [90.8, 2222.0], [90.9, 2237.0], [91.0, 2241.0], [91.1, 2245.0], [91.2, 2253.0], [91.3, 2257.0], [91.4, 2276.0], [91.5, 2295.0], [91.6, 2317.0], [91.7, 2325.0], [91.8, 2346.0], [91.9, 2375.0], [92.0, 2402.0], [92.1, 2410.0], [92.2, 2413.0], [92.3, 2418.0], [92.4, 2421.0], [92.5, 2424.0], [92.6, 2426.0], [92.7, 2429.0], [92.8, 2432.0], [92.9, 2434.0], [93.0, 2436.0], [93.1, 2439.0], [93.2, 2443.0], [93.3, 2446.0], [93.4, 2450.0], [93.5, 2451.0], [93.6, 2456.0], [93.7, 2473.0], [93.8, 2538.0], [93.9, 2543.0], [94.0, 2558.0], [94.1, 2564.0], [94.2, 2564.0], [94.3, 2569.0], [94.4, 2598.0], [94.5, 2608.0], [94.6, 2614.0], [94.7, 2625.0], [94.8, 2631.0], [94.9, 2640.0], [95.0, 2652.0], [95.1, 2656.0], [95.2, 2662.0], [95.3, 2667.0], [95.4, 2676.0], [95.5, 2683.0], [95.6, 2685.0], [95.7, 2697.0], [95.8, 2725.0], [95.9, 2745.0], [96.0, 2748.0], [96.1, 2752.0], [96.2, 2777.0], [96.3, 2797.0], [96.4, 2801.0], [96.5, 2839.0], [96.6, 2856.0], [96.7, 2867.0], [96.8, 2897.0], [96.9, 2932.0], [97.0, 2947.0], [97.1, 3002.0], [97.2, 3050.0], [97.3, 3072.0], [97.4, 3084.0], [97.5, 3096.0], [97.6, 3122.0], [97.7, 3127.0], [97.8, 3131.0], [97.9, 3134.0], [98.0, 3136.0], [98.1, 3139.0], [98.2, 3143.0], [98.3, 3150.0], [98.4, 3155.0], [98.5, 3161.0], [98.6, 3165.0], [98.7, 3172.0], [98.8, 3180.0], [98.9, 3184.0], [99.0, 3187.0], [99.1, 3191.0], [99.2, 3195.0], [99.3, 3198.0], [99.4, 3201.0], [99.5, 3207.0], [99.6, 3211.0], [99.7, 3214.0], [99.8, 3230.0], [99.9, 3291.0], [100.0, 4208.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 2798.0, "series": [{"data": [[0.0, 2798.0], [600.0, 458.0], [700.0, 438.0], [800.0, 389.0], [900.0, 345.0], [1000.0, 301.0], [1100.0, 565.0], [1200.0, 233.0], [1300.0, 84.0], [1400.0, 78.0], [1500.0, 38.0], [1600.0, 34.0], [100.0, 224.0], [1700.0, 94.0], [1800.0, 175.0], [1900.0, 135.0], [2000.0, 150.0], [2100.0, 67.0], [2300.0, 45.0], [2200.0, 81.0], [2400.0, 173.0], [2500.0, 69.0], [2600.0, 130.0], [2700.0, 63.0], [2800.0, 49.0], [2900.0, 27.0], [3000.0, 41.0], [3100.0, 185.0], [200.0, 384.0], [3300.0, 6.0], [3200.0, 55.0], [3500.0, 1.0], [3900.0, 2.0], [4200.0, 1.0], [300.0, 450.0], [400.0, 632.0], [500.0, 1000.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 4200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 620.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 4533.0, "series": [{"data": [[1.0, 3239.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 4533.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 1608.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 620.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 2418.4938999999963, "minX": 1.52524278E12, "maxY": 2418.4938999999963, "series": [{"data": [[1.52524278E12, 2418.4938999999963]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524278E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 0.0, "minX": 463.0, "maxY": 3989.0, "series": [{"data": [[463.0, 1128.0], [479.0, 1105.0], [472.0, 1117.0], [495.0, 1083.0], [485.0, 1095.0], [509.0, 1064.0], [503.0, 1075.0], [562.0, 1000.0], [600.0, 950.0], [634.0, 899.0], [622.0, 1021.0], [616.0, 1142.0], [614.0, 928.0], [670.0, 860.0], [664.0, 1160.5], [658.0, 870.0], [656.0, 1170.5], [652.0, 880.0], [648.0, 888.0], [694.0, 1051.0], [688.0, 841.0], [734.0, 1003.0], [724.0, 966.0], [714.0, 810.0], [712.0, 1187.0], [710.0, 935.0], [704.0, 820.0], [754.0, 989.0], [748.0, 1025.5], [740.0, 778.0], [792.0, 1117.0], [790.0, 968.0], [782.0, 877.0], [778.0, 1129.0], [830.0, 841.0], [824.0, 723.0], [820.0, 943.0], [806.0, 956.0], [802.0, 864.0], [800.0, 740.0], [856.0, 871.0], [846.0, 830.0], [842.0, 910.3333333333334], [884.0, 908.0], [870.0, 683.0], [926.0, 826.0], [924.0, 735.0], [920.0, 895.0], [918.0, 626.0], [916.0, 999.0], [914.0, 981.0], [910.0, 635.0], [898.0, 773.0], [954.0, 1226.5], [952.0, 707.0], [950.0, 772.5], [948.0, 1401.0], [946.0, 717.0], [938.0, 1104.0], [936.0, 725.0], [928.0, 1422.0], [990.0, 1350.0], [988.0, 585.0], [984.0, 458.0], [980.0, 978.75], [972.0, 964.0], [970.0, 689.0], [964.0, 819.3333333333334], [960.0, 944.0], [1016.0, 429.0], [1014.0, 912.0], [1012.0, 565.0], [1010.0, 735.0], [1002.0, 946.25], [996.0, 699.5], [1060.0, 659.5], [1052.0, 638.5], [1040.0, 671.0], [1148.0, 493.0], [1136.0, 862.0], [1132.0, 504.0], [1092.0, 641.0], [1088.0, 615.0], [1200.0, 461.5], [1196.0, 829.5], [1176.0, 755.2], [1160.0, 545.0], [1156.0, 467.0], [1152.0, 425.0], [1276.0, 731.0], [1264.0, 281.0], [1260.0, 491.0], [1252.0, 414.0], [1240.0, 501.0], [1220.0, 511.0], [1328.0, 815.0], [1324.0, 378.0], [1312.0, 825.0], [1300.0, 471.0], [1284.0, 698.3333333333334], [1280.0, 482.0], [1404.0, 406.235294117647], [1400.0, 325.0], [1396.0, 1171.0], [1356.0, 233.0], [1460.0, 483.05714285714276], [1468.0, 419.60714285714283], [1440.0, 397.45454545454544], [1464.0, 460.73333333333346], [1456.0, 596.4736842105262], [1420.0, 326.4], [1416.0, 586.6666666666666], [1412.0, 575.6666666666666], [1408.0, 618.1538461538462], [1436.0, 385.20000000000005], [1444.0, 410.6315789473684], [1448.0, 463.6808510638297], [1452.0, 369.6956521739131], [1432.0, 309.84615384615387], [1428.0, 156.0], [1424.0, 310.4666666666667], [1520.0, 442.18181818181824], [1524.0, 414.7142857142858], [1532.0, 278.2857142857143], [1528.0, 539.9285714285714], [1484.0, 514.7142857142858], [1480.0, 565.1666666666665], [1476.0, 379.65882352941196], [1472.0, 310.08641975308643], [1512.0, 565.7647058823529], [1516.0, 514.4285714285716], [1508.0, 469.73333333333335], [1504.0, 433.3333333333334], [1492.0, 531.64], [1488.0, 559.4444444444445], [1496.0, 322.6538461538461], [1500.0, 332.3181818181818], [1592.0, 570.6666666666666], [1596.0, 677.8666666666667], [1568.0, 114.3], [1572.0, 582.625], [1588.0, 912.0], [1584.0, 646.7777777777778], [1544.0, 183.0], [1548.0, 539.2727272727273], [1536.0, 702.0], [1540.0, 527.8387096774194], [1564.0, 123.94117647058823], [1560.0, 320.0], [1556.0, 311.7272727272727], [1552.0, 322.8666666666667], [1576.0, 954.4146341463417], [1580.0, 355.5], [1648.0, 102.25000000000001], [1600.0, 649.625], [1660.0, 579.25], [1656.0, 713.3333333333334], [1652.0, 402.1666666666667], [1608.0, 286.5499999999999], [1612.0, 649.5], [1604.0, 259.875], [1644.0, 176.77777777777777], [1632.0, 561.8823529411766], [1636.0, 406.0], [1640.0, 307.4545454545455], [1624.0, 451.12499999999994], [1628.0, 275.3636363636363], [1616.0, 67.0], [1620.0, 352.7692307692308], [1676.0, 290.25], [1704.0, 249.74999999999997], [1712.0, 230.33333333333331], [1696.0, 331.0], [1684.0, 733.0], [1680.0, 675.8571428571429], [1668.0, 784.3333333333334], [1664.0, 127.6], [1688.0, 1.8], [1692.0, 1.0], [1732.0, 529.0], [1788.0, 1183.0], [1744.0, 1897.0], [1772.0, 1282.0], [1780.0, 411.0], [1748.0, 330.0], [1752.0, 685.6666666666666], [1844.0, 1155.0], [1828.0, 1389.6666666666667], [1824.0, 1102.4], [1852.0, 340.0], [1836.0, 1375.5], [1832.0, 1111.0], [1840.0, 467.0], [1804.0, 737.8], [1796.0, 435.0], [1820.0, 455.0], [1812.0, 607.3333333333334], [1916.0, 948.6666666666666], [1856.0, 1456.0], [1888.0, 1452.3333333333333], [1908.0, 167.0], [1904.0, 670.0], [1900.0, 1215.0], [1896.0, 525.25], [1892.0, 1094.0], [1868.0, 1100.0], [1876.0, 433.5], [1880.0, 648.0], [1884.0, 507.6666666666667], [1980.0, 730.8333333333333], [1952.0, 0.5], [1932.0, 429.33333333333337], [1968.0, 249.0], [1972.0, 901.0], [1940.0, 0.0], [1948.0, 487.6666666666667], [1956.0, 820.1818181818182], [1964.0, 0.0], [1960.0, 260.0], [1928.0, 0.6666666666666666], [1920.0, 499.0], [2016.0, 298.33333333333337], [2028.0, 698.0], [2024.0, 1.0], [2020.0, 350.75], [1984.0, 35.0], [2012.0, 422.6666666666667], [2008.0, 951.0], [1988.0, 278.5], [1992.0, 286.85714285714283], [1996.0, 0.5], [2000.0, 1.0], [2004.0, 332.1428571428571], [2072.0, 1215.0], [2296.0, 1068.0], [2208.0, 1203.0], [2352.0, 1191.0], [2304.0, 1252.0], [2440.0, 1744.0], [2544.0, 2336.3333333333335], [2496.0, 1179.0], [2512.0, 2480.0], [2432.0, 2214.0], [2488.0, 2133.6666666666665], [2480.0, 2650.0], [2464.0, 1812.0], [2656.0, 1778.5], [2632.0, 883.0], [2584.0, 2160.75], [2576.0, 2211.0], [2560.0, 2496.0], [2616.0, 2190.0], [2592.0, 2140.5], [2760.0, 2151.0], [2800.0, 0.0], [2768.0, 2381.230769230769], [2712.0, 2081.5], [2696.0, 1231.0], [2720.0, 2305.6], [2880.0, 1708.8], [2888.0, 1.0], [2872.0, 535.0], [2864.0, 180.8], [2856.0, 313.5], [2848.0, 0.0], [2960.0, 2288.75], [2976.0, 2394.2857142857147], [3064.0, 583.0], [2968.0, 594.0], [3160.0, 2034.2], [3144.0, 1136.0], [3192.0, 0.0], [3312.0, 1110.0], [3240.0, 765.0], [3256.0, 2371.3333333333335], [3208.0, 1077.0], [3320.0, 1365.0], [3264.0, 2315.571428571429], [3272.0, 2258.5714285714284], [3280.0, 2169.1666666666665], [3336.0, 1.0], [3328.0, 0.0], [3376.0, 1541.0], [3368.0, 0.0], [3360.0, 1.0], [3352.0, 1066.0], [3432.0, 1.0], [3400.0, 1.0], [3392.0, 1131.0], [3424.0, 997.5], [3408.0, 571.0], [3480.0, 259.66666666666663], [3552.0, 1.0], [3504.0, 547.3333333333334], [3496.0, 1.0], [3576.0, 160.57142857142858], [3520.0, 1.0], [3632.0, 2.0], [3624.0, 1.0], [3600.0, 1.0], [3664.0, 3.0], [3776.0, 1.0], [3808.0, 1.0], [3864.0, 0.6666666666666666], [3848.0, 50.8], [3896.0, 1.0], [3856.0, 378.5], [3904.0, 392.3333333333333], [3960.0, 896.0], [3936.0, 482.0], [3912.0, 581.4999999999999], [3920.0, 110.85714285714288], [3928.0, 948.0], [3872.0, 164.0], [3880.0, 154.0], [3888.0, 264.7142857142857], [4072.0, 508.50000000000006], [4016.0, 105.33333333333334], [4008.0, 1002.0], [3992.0, 1043.0], [4088.0, 648.6666666666666], [4064.0, 1191.0], [4040.0, 518.0], [4048.0, 463.0], [4056.0, 537.3333333333333], [4000.0, 327.0], [4208.0, 588.0], [4112.0, 212.99999999999994], [4160.0, 239.5], [4144.0, 256.0], [4304.0, 369.0], [4224.0, 575.6666666666666], [4240.0, 143.0], [4384.0, 292.5], [4448.0, 351.125], [4496.0, 459.0], [4480.0, 387.0], [4416.0, 425.0], [4464.0, 603.0], [4432.0, 727.3333333333333], [4113.0, 107.26470588235291], [4209.0, 1259.0], [4129.0, 185.0], [4193.0, 1273.0], [4177.0, 1.0], [4161.0, 1.0], [4145.0, 627.5], [4337.0, 712.0], [4321.0, 252.5], [4289.0, 668.0], [4257.0, 622.0], [4449.0, 760.6666666666666], [4465.0, 825.5], [4433.0, 0.6666666666666666], [4417.0, 498.3333333333333], [4369.0, 685.0], [4385.0, 1.0], [4401.0, 396.4], [4497.0, 863.5], [2425.0, 1055.0], [2537.0, 2654.0], [2513.0, 2390.0], [2433.0, 2498.0], [2441.0, 1745.0], [2489.0, 2507.0], [2481.0, 2207.75], [2633.0, 1620.0], [2657.0, 1787.0], [2577.0, 1667.3333333333333], [2753.0, 1899.0], [2769.0, 2396.7857142857147], [2705.0, 2439.3333333333335], [2793.0, 1.0], [2737.0, 1.0], [2777.0, 2451.0], [2913.0, 1.0], [2873.0, 1166.0], [2865.0, 1.0], [3057.0, 1393.0], [2961.0, 2268.5], [2985.0, 2169.3333333333335], [3017.0, 1161.0], [2969.0, 1.0], [3161.0, 2135.6666666666665], [3153.0, 2539.0], [3177.0, 493.0], [3089.0, 480.5], [3257.0, 1906.0], [3249.0, 2146.75], [3297.0, 1054.0], [3313.0, 0.0], [3321.0, 372.0], [3265.0, 2242.5454545454545], [3273.0, 1873.5], [3393.0, 765.0], [3337.0, 1.0], [3401.0, 950.3333333333334], [3409.0, 1.0], [3465.0, 578.0], [3457.0, 597.5], [3497.0, 0.0], [3489.0, 0.0], [3553.0, 1.0], [3569.0, 1.0], [3529.0, 1.0], [3545.0, 1.0], [3633.0, 1.0], [3585.0, 0.0], [3649.0, 0.0], [3665.0, 4.0], [3833.0, 151.6], [3817.0, 0.3333333333333333], [3777.0, 1.0], [3809.0, 1.0], [3785.0, 0.0], [3793.0, 45.0], [3801.0, 1.0], [3769.0, 1.0], [3953.0, 924.6666666666666], [3849.0, 1.0], [3865.0, 38.66666666666667], [3905.0, 116.0], [3945.0, 852.5], [3937.0, 426.0], [3913.0, 276.33333333333337], [3921.0, 1014.0], [3929.0, 1.0], [3889.0, 1.0], [3897.0, 908.4], [4025.0, 1.0], [3969.0, 1052.0], [4009.0, 322.0], [4033.0, 146.57142857142858], [4073.0, 266.61111111111114], [4049.0, 318.4], [4057.0, 284.75], [4001.0, 296.5], [4017.0, 1015.0], [4306.0, 247.0], [4114.0, 5.0], [4210.0, 525.0], [4194.0, 682.25], [4178.0, 451.5], [4226.0, 585.5], [4338.0, 529.0], [4322.0, 650.0], [4290.0, 1069.0], [4258.0, 572.0], [4450.0, 981.0], [4354.0, 3989.0], [4434.0, 404.5], [4418.0, 318.2857142857143], [4386.0, 683.0], [4402.0, 766.0], [4482.0, 926.0], [4498.0, 863.0], [4131.0, 1209.0], [4115.0, 494.42857142857144], [4179.0, 645.0], [4163.0, 0.33333333333333337], [4147.0, 0.6666666666666667], [4339.0, 664.0], [4291.0, 679.0], [4307.0, 1.0], [4275.0, 1355.0], [4467.0, 880.0], [4451.0, 162.6], [4371.0, 437.33333333333337], [4355.0, 0.0], [4435.0, 387.375], [4419.0, 401.7], [4499.0, 663.0], [4403.0, 1.0], [1065.0, 752.5], [1049.0, 930.6666666666666], [1029.0, 751.0], [1141.0, 735.0], [1129.0, 815.0], [1173.0, 482.5], [1157.0, 795.0], [1257.0, 1181.0], [1253.0, 743.0], [1241.0, 441.0], [1233.0, 808.0], [1221.0, 600.0], [1341.0, 368.3333333333333], [1305.0, 560.0], [1285.0, 271.0], [1401.0, 1315.0], [1405.0, 414.1333333333334], [1397.0, 1099.0], [1389.0, 664.0], [1369.0, 516.0], [1353.0, 687.0], [1361.0, 1119.0], [1465.0, 267.44444444444446], [1461.0, 592.1304347826087], [1469.0, 456.48484848484844], [1453.0, 358.6111111111111], [1457.0, 374.4285714285714], [1441.0, 308.72222222222223], [1445.0, 507.0], [1449.0, 603.9545454545454], [1437.0, 451.8372093023255], [1433.0, 209.75000000000003], [1429.0, 0.0], [1425.0, 165.6], [1413.0, 488.0], [1417.0, 412.5], [1421.0, 451.22222222222223], [1409.0, 428.1538461538462], [1529.0, 321.53846153846155], [1477.0, 179.65625000000003], [1533.0, 302.2857142857143], [1485.0, 497.9090909090909], [1521.0, 525.6363636363636], [1525.0, 374.65217391304344], [1481.0, 521.5454545454545], [1517.0, 185.0], [1513.0, 500.75], [1509.0, 600.8], [1505.0, 430.9230769230769], [1493.0, 421.12000000000006], [1489.0, 594.7045454545453], [1497.0, 266.1153846153846], [1501.0, 456.55555555555554], [1473.0, 417.0571428571428], [1593.0, 802.75], [1585.0, 328.8], [1569.0, 444.3333333333333], [1573.0, 410.5], [1577.0, 588.125], [1597.0, 677.0], [1589.0, 1419.0], [1541.0, 423.3809523809524], [1537.0, 284.15384615384613], [1565.0, 235.9375], [1561.0, 378.42857142857144], [1557.0, 418.4545454545454], [1545.0, 676.5], [1549.0, 423.8571428571429], [1553.0, 587.9090909090909], [1581.0, 498.0], [1657.0, 731.5625], [1613.0, 779.2857142857142], [1661.0, 669.3333333333334], [1653.0, 197.0], [1633.0, 230.0], [1637.0, 1233.8], [1641.0, 477.41666666666663], [1645.0, 1.0], [1629.0, 632.8750000000001], [1601.0, 229.7], [1625.0, 931.3749999999999], [1609.0, 289.70000000000005], [1605.0, 572.75], [1649.0, 83.0], [1621.0, 12.5], [1617.0, 285.9], [1713.0, 330.5], [1725.0, 1553.0056818181822], [1705.0, 1.0], [1717.0, 653.0], [1701.0, 580.0], [1697.0, 1269.0], [1689.0, 448.5], [1693.0, 2.0], [1681.0, 920.0], [1669.0, 354.0], [1673.0, 384.0], [1665.0, 509.5714285714286], [1677.0, 486.0], [1729.0, 481.75], [1745.0, 1846.0], [1749.0, 954.3333333333333], [1753.0, 552.0], [1741.0, 730.0], [1733.0, 444.0], [1737.0, 343.0], [1761.0, 339.0], [1781.0, 523.8333333333334], [1777.0, 1184.0], [1785.0, 555.0], [1789.0, 363.0], [1849.0, 1120.0], [1793.0, 584.0], [1809.0, 384.0], [1813.0, 687.0], [1841.0, 405.0], [1861.0, 811.0], [1881.0, 811.5], [1857.0, 709.0], [1885.0, 727.0], [1913.0, 576.5], [1905.0, 720.0], [1909.0, 750.4444444444445], [1869.0, 750.0], [1873.0, 610.5], [1889.0, 1322.4285714285713], [1893.0, 791.0], [1901.0, 1968.0], [1897.0, 743.0], [1929.0, 240.5], [1921.0, 633.0], [1969.0, 538.25], [1933.0, 313.0], [1973.0, 505.8333333333333], [1941.0, 879.2857142857143], [1945.0, 65.0], [1949.0, 604.6666666666666], [1937.0, 349.0], [1953.0, 1.0], [1981.0, 389.5], [1957.0, 915.0000000000001], [1961.0, 431.5], [1965.0, 1.0], [1985.0, 457.0], [2021.0, 251.0], [2017.0, 218.8], [2009.0, 104.5], [2013.0, 0.75], [2005.0, 412.5], [2001.0, 0.33333333333333337], [1989.0, 1.0], [1993.0, 405.1666666666667], [1997.0, 408.5], [2138.0, 1080.0], [2330.0, 816.0], [2530.0, 2350.0], [2442.0, 1238.0], [2506.0, 2179.8], [2514.0, 2143.0], [2474.0, 2481.0], [2522.0, 1988.0], [2666.0, 1772.0], [2634.0, 2667.0], [2642.0, 2225.0], [2570.0, 1610.0], [2610.0, 2164.0], [2594.0, 2612.25], [2810.0, 1.0], [2770.0, 2246.5], [2786.0, 0.0], [2746.0, 0.0], [2778.0, 1809.0], [2930.0, 1.0], [2938.0, 1.0], [2914.0, 840.0], [2898.0, 0.0], [2882.0, 1.0], [2818.0, 1218.0], [2842.0, 1.0], [2834.0, 1203.0], [2970.0, 2025.5], [3058.0, 1369.5], [2962.0, 1725.0], [2986.0, 2780.0], [2978.0, 1878.0], [3162.0, 1957.6666666666665], [3146.0, 1701.0], [3186.0, 0.0], [3122.0, 1.0], [3218.0, 848.0], [3322.0, 0.6666666666666666], [3250.0, 2389.5], [3258.0, 2562.0], [3202.0, 1.0], [3306.0, 242.5], [3298.0, 280.0], [3266.0, 2272.5], [3274.0, 2140.75], [3282.0, 2747.0], [3330.0, 1.0], [3338.0, 215.28571428571428], [3378.0, 470.8], [3346.0, 1.0], [3354.0, 236.66666666666669], [3450.0, 730.0], [3426.0, 720.0], [3554.0, 0.0], [3474.0, 1.0], [3506.0, 1.0], [3466.0, 548.0], [3490.0, 0.8571428571428572], [3562.0, 1.0], [3578.0, 1.0], [3530.0, 1.0], [3538.0, 1.0], [3546.0, 744.0], [3610.0, 0.5714285714285714], [3586.0, 0.0], [3642.0, 1.0], [3626.0, 1.0], [3682.0, 764.0], [3706.0, 809.0], [3666.0, 329.0], [3650.0, 546.0], [3794.0, 1.0], [3802.0, 1.0], [3754.0, 1.0], [3762.0, 1390.0], [3770.0, 0.0], [3818.0, 1.0], [3834.0, 1.0], [3858.0, 364.0], [3842.0, 0.0], [3898.0, 307.66666666666663], [3850.0, 40.1], [3866.0, 1.0], [3962.0, 644.5], [3938.0, 266.0], [3914.0, 336.6666666666667], [3922.0, 460.75], [3930.0, 1009.0], [3874.0, 0.75], [3882.0, 321.0], [3890.0, 121.5], [3994.0, 290.0], [4026.0, 163.0], [4042.0, 538.0], [4090.0, 5.0], [4074.0, 4.5], [4082.0, 0.0], [4066.0, 180.42857142857144], [4050.0, 1.0], [4002.0, 1025.0], [4116.0, 440.2], [4212.0, 591.0], [4196.0, 1064.0], [4180.0, 1232.0], [4164.0, 623.5], [4132.0, 0.6666666666666666], [4148.0, 252.5], [4292.0, 569.5], [4308.0, 1.0], [4260.0, 781.3333333333334], [4276.0, 661.0], [4452.0, 656.1999999999999], [4356.0, 540.0], [4436.0, 703.7142857142857], [4420.0, 109.49999999999999], [4133.0, 591.0], [4117.0, 385.66666666666663], [4197.0, 552.0], [4181.0, 537.0], [4165.0, 1.0], [4229.0, 418.0], [4341.0, 403.0], [4309.0, 1288.0], [4293.0, 490.0], [4261.0, 3042.0], [4469.0, 914.75], [4357.0, 717.6666666666666], [4453.0, 195.33333333333331], [4421.0, 509.57142857142856], [4437.0, 619.0], [4389.0, 1.0], [4405.0, 198.16666666666666], [4501.0, 930.0], [4485.0, 1033.0], [2147.0, 1263.0], [2131.0, 612.0], [2179.0, 268.0], [2531.0, 2164.5], [2483.0, 2069.5], [2467.0, 2593.0], [2667.0, 1770.0], [2627.0, 2315.0], [2683.0, 2288.0], [2587.0, 2411.25], [2579.0, 2398.6666666666665], [2619.0, 1765.0], [2771.0, 1872.3333333333333], [2739.0, 1214.0], [2731.0, 1030.0], [2923.0, 1183.0], [2939.0, 1110.0], [2915.0, 986.0], [2843.0, 0.0], [2875.0, 333.0], [2971.0, 2550.0], [2979.0, 2727.0], [3019.0, 1099.0], [3163.0, 1836.0], [3147.0, 2023.0], [3179.0, 1.0], [3123.0, 571.0], [3083.0, 1132.0], [3211.0, 0.0], [3259.0, 1965.5], [3251.0, 2686.0], [3243.0, 1901.0], [3315.0, 715.0], [3323.0, 202.0], [3267.0, 2188.111111111111], [3275.0, 2799.0], [3371.0, 0.0], [3347.0, 1.0], [3363.0, 1.0], [3331.0, 0.0], [3355.0, 1.0], [3395.0, 362.0], [3403.0, 611.0], [3515.0, 1.0], [3467.0, 0.5], [3507.0, 270.0], [3499.0, 1.0], [3579.0, 1.0], [3523.0, 0.8], [3539.0, 147.75], [3619.0, 1.0], [3707.0, 77.0], [3835.0, 1.0], [3787.0, 1.0], [3803.0, 0.0], [3747.0, 2.0], [3763.0, 815.0], [3939.0, 899.0], [3859.0, 454.3333333333333], [3851.0, 194.0], [3867.0, 544.5], [3907.0, 671.0], [3955.0, 279.0], [3963.0, 1010.0], [3915.0, 1.0], [3923.0, 139.5], [3931.0, 257.0], [3891.0, 252.0], [3899.0, 104.875], [3979.0, 1.0], [4067.0, 625.5], [4027.0, 1.0], [4075.0, 1020.0], [4035.0, 537.75], [4043.0, 89.75], [4051.0, 296.25], [4003.0, 1055.0], [4118.0, 73.66666666666667], [4214.0, 1.0], [4150.0, 156.0], [4230.0, 437.5], [4342.0, 1034.0], [4326.0, 655.0], [4246.0, 617.0], [4262.0, 1.0], [4166.0, 610.0], [4438.0, 563.0], [4454.0, 235.85714285714286], [4422.0, 341.0], [4390.0, 1.0], [4406.0, 0.0], [4486.0, 357.0], [4502.0, 1006.0], [4151.0, 771.6666666666666], [4183.0, 1.0], [4119.0, 142.42857142857144], [4135.0, 255.5], [4343.0, 267.5], [4311.0, 1.0], [4263.0, 160.75], [4279.0, 558.0], [4359.0, 276.5], [4375.0, 1353.0], [4455.0, 295.5], [4439.0, 851.0], [4391.0, 450.6666666666667], [4407.0, 1.0], [4503.0, 379.0], [4423.0, 370.25], [541.0, 1032.0], [527.0, 1043.0], [519.0, 1054.0], [575.0, 978.0], [567.0, 990.0], [557.0, 1012.0], [549.0, 1021.0], [603.0, 939.0], [587.0, 957.0], [579.0, 967.0], [631.0, 1122.0], [619.0, 919.0], [609.0, 1151.0], [651.0, 1104.0], [641.0, 1113.0], [703.0, 1072.0], [697.0, 830.0], [693.0, 1083.0], [687.0, 1141.5], [681.0, 849.0], [677.0, 1151.5], [731.0, 907.0], [729.0, 975.5], [723.0, 987.5], [719.0, 924.0], [715.0, 1028.0], [705.0, 1040.0], [765.0, 889.0], [763.0, 1141.0], [755.0, 769.0], [783.0, 748.0], [769.0, 868.5], [819.0, 1097.0], [811.0, 852.0], [807.0, 919.5], [863.0, 861.0], [861.0, 879.0], [849.0, 889.5], [895.0, 655.0], [891.0, 898.3333333333334], [887.0, 665.0], [881.0, 674.0], [875.0, 850.5], [871.0, 1054.0], [925.0, 1094.0], [921.0, 802.5], [911.0, 753.0], [909.0, 933.0], [907.0, 943.5], [905.0, 645.0], [899.0, 945.0], [957.0, 579.0], [953.0, 712.5], [947.0, 940.0], [941.0, 782.0], [931.0, 606.0], [929.0, 978.0], [967.0, 568.0], [989.0, 911.0], [991.0, 671.0], [987.0, 710.0], [983.0, 548.0], [979.0, 721.0], [971.0, 1045.0], [969.0, 931.0], [965.0, 1382.0], [963.0, 696.0], [1023.0, 681.0], [1013.0, 1005.0], [1011.0, 644.0], [1003.0, 439.0], [997.0, 575.0], [1086.0, 811.5], [1074.0, 651.5], [1066.0, 893.5], [1046.0, 543.0], [1026.0, 553.0], [1130.0, 745.5], [1126.0, 488.0], [1122.0, 447.0], [1110.0, 795.8], [1102.0, 598.3333333333334], [1194.0, 687.6666666666666], [1154.0, 1235.0], [1234.0, 379.0], [1222.0, 301.0], [1334.0, 450.0], [1318.0, 584.5], [1314.0, 382.0], [1306.0, 303.5], [1402.0, 247.57142857142858], [1406.0, 387.54545454545456], [1398.0, 408.0], [1366.0, 675.0], [1390.0, 399.5], [1386.0, 1108.0], [1378.0, 983.0], [1462.0, 529.0], [1458.0, 446.68], [1470.0, 389.12499999999994], [1442.0, 249.0769230769231], [1466.0, 403.89473684210526], [1422.0, 325.46666666666664], [1418.0, 775.625], [1414.0, 484.3333333333333], [1434.0, 469.15789473684214], [1438.0, 558.5625], [1410.0, 733.8571428571428], [1446.0, 587.1904761904763], [1450.0, 469.44444444444446], [1454.0, 435.5217391304348], [1430.0, 426.6], [1426.0, 470.7692307692308], [1522.0, 472.53846153846155], [1530.0, 456.5294117647059], [1534.0, 591.2631578947368], [1526.0, 389.625], [1486.0, 426.5757575757575], [1482.0, 640.578947368421], [1478.0, 375.70370370370387], [1474.0, 393.344827586207], [1502.0, 331.3888888888888], [1518.0, 245.36842105263165], [1514.0, 585.4444444444445], [1510.0, 593.3846153846154], [1506.0, 395.1538461538462], [1490.0, 462.33333333333337], [1494.0, 336.8285714285714], [1498.0, 422.52380952380946], [1586.0, 653.4117647058824], [1594.0, 1057.111111111111], [1598.0, 289.33333333333337], [1570.0, 489.5625], [1590.0, 661.5], [1550.0, 556.1764705882354], [1546.0, 802.0], [1542.0, 1.0], [1538.0, 521.761904761905], [1562.0, 349.73333333333335], [1558.0, 455.37499999999994], [1566.0, 141.8888888888889], [1554.0, 725.608695652174], [1578.0, 421.5], [1582.0, 360.0], [1574.0, 1029.8947368421052], [1658.0, 598.6999999999999], [1654.0, 291.5652173913043], [1662.0, 864.0], [1614.0, 225.40000000000003], [1606.0, 548.0333333333333], [1610.0, 632.5], [1602.0, 415.4], [1646.0, 1.0], [1642.0, 149.5], [1638.0, 1.6], [1634.0, 1.0], [1630.0, 341.28571428571433], [1626.0, 2.5], [1622.0, 7.666666666666667], [1618.0, 786.1578947368421], [1726.0, 242.0], [1678.0, 773.7142857142856], [1706.0, 225.00000000000003], [1710.0, 0.0], [1702.0, 35.416666666666664], [1714.0, 1.0], [1698.0, 682.0], [1682.0, 664.6666666666666], [1674.0, 173.0], [1670.0, 391.0], [1690.0, 1.0], [1666.0, 410.0], [1786.0, 568.0], [1746.0, 1140.0], [1770.0, 666.5], [1762.0, 274.0], [1790.0, 970.0], [1742.0, 416.0], [1738.0, 793.0], [1750.0, 722.0], [1758.0, 429.0], [1842.0, 1288.0], [1846.0, 1951.0], [1838.0, 1570.2], [1826.0, 104.0], [1834.0, 774.0], [1830.0, 472.5], [1806.0, 267.0], [1802.0, 308.0], [1822.0, 395.0], [1814.0, 786.0], [1798.0, 548.0], [1906.0, 864.0], [1870.0, 1125.5], [1918.0, 797.2857142857142], [1914.0, 902.0], [1910.0, 777.0], [1874.0, 1614.3333333333333], [1890.0, 1364.25], [1898.0, 832.5], [1862.0, 535.0], [1878.0, 780.0], [1882.0, 556.0], [1978.0, 113.33333333333334], [1926.0, 1013.0], [1982.0, 349.75], [1970.0, 590.3333333333334], [1974.0, 437.5], [1938.0, 781.1666666666667], [1946.0, 419.0], [1966.0, 451.33333333333337], [1962.0, 514.0], [1958.0, 879.0], [1930.0, 1226.0], [1950.0, 886.3333333333334], [1922.0, 843.0], [1990.0, 474.5], [1986.0, 1.0], [2018.0, 1.0], [2022.0, 198.0], [2014.0, 269.6666666666667], [2010.0, 495.25], [1994.0, 494.6666666666667], [1998.0, 190.33333333333334], [2002.0, 76.5], [2548.0, 2170.875], [2500.0, 2446.0], [2444.0, 1597.0], [2452.0, 2125.6666666666665], [2468.0, 1646.5], [2524.0, 1773.0], [2676.0, 1761.0], [2588.0, 2634.0], [2636.0, 2063.0], [2652.0, 1.0], [2644.0, 1167.0], [2684.0, 2391.0], [2668.0, 1.0], [2572.0, 1775.5], [2564.0, 2608.0], [2620.0, 2032.3333333333333], [2612.0, 1911.0], [2604.0, 2502.0], [2796.0, 637.0], [2788.0, 2113.0], [2764.0, 2311.5555555555557], [2700.0, 2649.5], [2740.0, 1797.0], [2732.0, 2429.75], [2724.0, 0.0], [2932.0, 1167.0], [2876.0, 1862.5], [2820.0, 1188.0], [2972.0, 2142.0], [3308.0, 706.0], [3252.0, 2159.4], [3300.0, 690.3333333333334], [3236.0, 1799.0], [3244.0, 1914.0], [3324.0, 708.0], [3268.0, 2101.125], [3276.0, 2483.833333333333], [3292.0, 1468.549338758899], [3332.0, 0.0], [3380.0, 1.0], [3388.0, 609.0], [3372.0, 711.0], [3348.0, 313.0], [3356.0, 1369.0], [3428.0, 749.5], [3404.0, 753.0], [3468.0, 1.0], [3484.0, 1.0], [3516.0, 1.0], [3476.0, 0.0], [3572.0, 1.2], [3532.0, 1.2], [3540.0, 0.0], [3644.0, 1.5], [3596.0, 0.9999999999999999], [3628.0, 1.0], [3612.0, 1.0], [3692.0, 1083.0], [3820.0, 1.0], [3772.0, 1.0], [3788.0, 1.0], [3756.0, 775.0], [3780.0, 1.0], [3796.0, 83.0], [3804.0, 1.0], [3764.0, 1.0], [3836.0, 1.0], [3852.0, 142.33333333333331], [3900.0, 51.6], [3868.0, 70.33333333333334], [3908.0, 323.16666666666663], [3948.0, 524.0], [3916.0, 1.0], [3924.0, 491.5], [3884.0, 0.5], [3892.0, 1.0], [3980.0, 1041.0], [4028.0, 513.0], [3972.0, 982.0], [4020.0, 334.0], [4012.0, 317.6666666666667], [3988.0, 1094.0], [4036.0, 1.0], [4092.0, 5.0], [4068.0, 438.0], [4060.0, 0.0], [4052.0, 208.7], [4136.0, 454.2], [4120.0, 565.3333333333333], [4184.0, 577.0], [4168.0, 472.4], [4152.0, 1.0], [4296.0, 879.5], [4344.0, 1319.0], [4264.0, 327.5], [4280.0, 609.0], [4360.0, 737.0], [4408.0, 347.3333333333333], [4424.0, 478.09090909090907], [4456.0, 241.88888888888889], [4440.0, 761.0], [4201.0, 568.0], [4217.0, 517.6666666666666], [4169.0, 1.0], [4137.0, 123.5], [4153.0, 605.0], [4329.0, 392.0], [4249.0, 952.5], [4457.0, 441.47058823529414], [4441.0, 0.4], [4473.0, 347.0], [4361.0, 0.5], [4425.0, 326.49999999999994], [4377.0, 437.0], [4409.0, 1.0], [2357.0, 1259.0], [2549.0, 1882.0], [2509.0, 2538.0], [2445.0, 1743.0], [2685.0, 1898.0], [2677.0, 1771.0], [2629.0, 2670.0], [2645.0, 1.0], [2565.0, 2237.8], [2621.0, 934.0], [2605.0, 2667.0], [2597.0, 2219.6666666666665], [2757.0, 2587.5], [2765.0, 2686.0], [2701.0, 2307.8], [2693.0, 2547.0], [2717.0, 284.5], [2805.0, 1.0], [2733.0, 2444.0], [2773.0, 2298.0], [2933.0, 879.0], [2861.0, 431.00000000000006], [2821.0, 0.0], [2957.0, 2241.714285714286], [2989.0, 1881.0], [2973.0, 2152.3333333333335], [2981.0, 514.0], [3157.0, 2450.0], [3189.0, 1.0], [3181.0, 0.0], [3085.0, 1.0], [3261.0, 1910.0], [3245.0, 1909.0], [3277.0, 1801.0], [3341.0, 0.0], [3357.0, 1.0], [3453.0, 1112.0], [3405.0, 766.0], [3421.0, 754.0], [3509.0, 1.0], [3477.0, 0.0], [3501.0, 1.0], [3493.0, 925.0], [3469.0, 0.8333333333333334], [3573.0, 1.5], [3525.0, 1.0], [3549.0, 1132.3333333333333], [3597.0, 2.0], [3629.0, 57.0], [3605.0, 265.33333333333337], [3613.0, 300.0], [3685.0, 791.0], [3701.0, 1052.0], [3653.0, 231.5], [3725.0, 1.0], [3765.0, 1.0], [3821.0, 1.0], [3837.0, 1.0], [3789.0, 1.2727272727272727], [3805.0, 1.0], [3749.0, 1.0], [3773.0, 0.6666666666666666], [3861.0, 0.5], [3901.0, 132.5], [3845.0, 0.0], [3853.0, 0.0], [3869.0, 317.0], [3965.0, 420.33333333333337], [3957.0, 1.0], [3941.0, 913.5], [3909.0, 231.6], [3925.0, 410.25], [3917.0, 0.6666666666666666], [3933.0, 1070.0], [3885.0, 0.0], [3893.0, 90.2], [4069.0, 357.25], [4029.0, 0.0], [3981.0, 1053.0], [3997.0, 991.0], [4085.0, 296.0], [4037.0, 336.0], [4045.0, 360.0], [4061.0, 1.0], [4053.0, 369.3333333333333], [4005.0, 301.0], [4013.0, 1853.0], [4138.0, 453.0], [4218.0, 406.0], [4186.0, 503.0], [4122.0, 472.0], [4346.0, 677.2], [4330.0, 550.0], [4314.0, 689.6666666666666], [4298.0, 691.0], [4234.0, 958.2], [4266.0, 2.0], [4170.0, 526.0], [4362.0, 1.0], [4378.0, 555.0], [4458.0, 479.5], [4442.0, 420.375], [4426.0, 241.55555555555554], [4394.0, 233.0], [4410.0, 450.2], [4490.0, 840.75], [4139.0, 0.6666666666666666], [4123.0, 487.0], [4203.0, 505.0], [4171.0, 188.0], [4155.0, 388.0], [4251.0, 356.33333333333337], [4347.0, 772.0], [4299.0, 548.5], [4331.0, 1.0], [4443.0, 1.0], [4379.0, 567.0], [4427.0, 515.7333333333333], [4491.0, 963.0], [1071.0, 627.0], [1031.0, 871.6666666666666], [1139.0, 806.0], [1135.0, 436.0], [1123.0, 1257.0], [1115.0, 514.5], [1111.0, 576.0], [1103.0, 674.0], [1099.0, 799.5], [1215.0, 733.2], [1199.0, 524.0], [1183.0, 472.0], [1179.0, 534.0], [1159.0, 906.0], [1275.0, 624.0], [1263.0, 580.0], [1259.0, 367.0], [1251.0, 855.0], [1335.0, 918.5], [1331.0, 370.0], [1319.0, 1149.0], [1303.0, 1157.0], [1299.0, 720.0], [1295.0, 614.5], [1403.0, 250.08333333333334], [1407.0, 525.7272727272727], [1395.0, 773.0], [1387.0, 378.0], [1347.0, 805.0], [1351.0, 642.0], [1359.0, 795.0], [1355.0, 421.0], [1367.0, 303.0], [1363.0, 387.5], [1471.0, 402.47916666666663], [1459.0, 591.64], [1463.0, 316.27272727272714], [1467.0, 296.8333333333333], [1455.0, 448.0526315789474], [1451.0, 379.87499999999994], [1443.0, 370.82142857142856], [1447.0, 490.235294117647], [1439.0, 345.0952380952381], [1431.0, 591.5], [1427.0, 272.61538461538464], [1435.0, 374.88888888888886], [1419.0, 641.0], [1411.0, 548.1111111111111], [1423.0, 290.1333333333333], [1531.0, 233.42857142857142], [1535.0, 564.0], [1487.0, 751.6923076923076], [1523.0, 401.33333333333337], [1527.0, 356.4285714285714], [1479.0, 500.3333333333333], [1483.0, 489.05882352941177], [1519.0, 385.4814814814815], [1507.0, 604.2307692307693], [1511.0, 603.7499999999999], [1515.0, 593.2727272727274], [1491.0, 485.9600000000001], [1499.0, 315.40000000000003], [1503.0, 263.16666666666663], [1475.0, 454.4146341463414], [1495.0, 315.1333333333333], [1595.0, 637.6666666666666], [1599.0, 632.0434782608695], [1575.0, 998.6], [1571.0, 997.0], [1591.0, 395.0], [1587.0, 562.4117647058823], [1555.0, 420.03030303030306], [1543.0, 339.3636363636363], [1539.0, 525.9000000000001], [1567.0, 202.1], [1563.0, 211.15789473684208], [1559.0, 270.30769230769226], [1547.0, 829.0000000000001], [1551.0, 376.1176470588235], [1583.0, 592.3076923076923], [1579.0, 441.12499999999994], [1659.0, 232.8], [1663.0, 234.81818181818176], [1655.0, 201.69565217391306], [1635.0, 401.5714285714286], [1643.0, 1.4], [1647.0, 20.75], [1639.0, 380.0], [1631.0, 947.1428571428572], [1623.0, 3.0], [1627.0, 221.0], [1607.0, 93.33333333333334], [1611.0, 1188.5], [1603.0, 523.0], [1615.0, 414.33333333333337], [1619.0, 195.26315789473682], [1723.0, 472.5], [1679.0, 535.3333333333333], [1707.0, 972.4000000000001], [1711.0, 332.0], [1703.0, 0.0], [1719.0, 392.0], [1715.0, 211.375], [1727.0, 1192.0], [1699.0, 1.0], [1695.0, 519.6666666666667], [1687.0, 706.0], [1691.0, 1.0], [1675.0, 487.0], [1671.0, 56.83333333333333], [1667.0, 870.25], [1743.0, 465.0], [1739.0, 755.8333333333334], [1747.0, 1903.0], [1731.0, 1114.0], [1779.0, 465.0], [1787.0, 759.6666666666666], [1791.0, 563.0], [1767.0, 738.0], [1855.0, 1103.0], [1831.0, 1113.0], [1811.0, 316.0], [1835.0, 798.0], [1839.0, 696.0], [1803.0, 455.0], [1851.0, 371.5], [1867.0, 1637.5], [1887.0, 547.3333333333334], [1883.0, 1032.0], [1859.0, 643.5], [1919.0, 722.0], [1907.0, 422.5], [1871.0, 242.0], [1875.0, 1827.5], [1879.0, 1261.0], [1891.0, 1135.0], [1895.0, 1701.6666666666667], [1899.0, 1120.0], [1903.0, 635.0], [1927.0, 2021.0], [1931.0, 552.0], [1923.0, 689.3333333333334], [1971.0, 1106.6], [1935.0, 422.5], [1943.0, 0.5], [1947.0, 297.66666666666663], [1939.0, 0.0], [1951.0, 1146.0], [1955.0, 760.3333333333333], [1983.0, 0.5], [1979.0, 555.6666666666666], [1959.0, 0.0], [1963.0, 0.5], [1967.0, 450.66666666666663], [2023.0, 262.3333333333333], [1987.0, 182.0], [2031.0, 277.0], [2019.0, 474.50000000000006], [2015.0, 440.3333333333333], [2011.0, 193.66666666666666], [2003.0, 272.2857142857143], [1991.0, 386.66666666666663], [1995.0, 1.0], [2294.0, 601.0], [2534.0, 2652.0], [2494.0, 954.5], [2510.0, 2471.0], [2558.0, 1769.0], [2486.0, 1749.0], [2470.0, 1921.6], [2686.0, 0.0], [2646.0, 2160.8333333333335], [2574.0, 1211.0], [2614.0, 1731.6666666666667], [2598.0, 1225.0], [2606.0, 0.0], [2798.0, 2757.0], [2790.0, 2759.0], [2766.0, 1861.3333333333333], [2758.0, 0.0], [2742.0, 2683.0], [2694.0, 1.0], [2726.0, 1972.2], [2894.0, 1.0], [2942.0, 1.0], [2902.0, 606.0], [2878.0, 1.0], [2830.0, 1020.0], [2862.0, 464.8], [2854.0, 0.5], [3014.0, 870.0], [2990.0, 1511.5], [2974.0, 2228.6315789473683], [3006.0, 971.0], [3118.0, 1155.0], [3110.0, 974.0], [3254.0, 2219.6], [3262.0, 1.0], [3214.0, 1.0], [3326.0, 738.5], [3270.0, 2292.5454545454545], [3334.0, 0.0], [3342.0, 1.0], [3390.0, 1043.0], [3382.0, 30.0], [3374.0, 1.0], [3358.0, 1.0], [3438.0, 617.0], [3422.0, 755.0], [3454.0, 0.0], [3510.0, 1.0], [3574.0, 1.0], [3534.0, 184.25], [3542.0, 1.0], [3550.0, 138.33333333333334], [3646.0, 1.0], [3630.0, 1.5], [3766.0, 1.1428571428571428], [3790.0, 1.0], [3750.0, 9.571428571428571], [3726.0, 1.0], [3838.0, 1.0], [3958.0, 297.0], [3950.0, 261.5], [3870.0, 454.5], [3902.0, 61.5], [3894.0, 122.5], [3862.0, 418.5], [3966.0, 939.5], [3910.0, 967.0], [3942.0, 473.3333333333333], [3918.0, 118.49999999999999], [3926.0, 698.25], [3934.0, 198.5], [3878.0, 162.0], [3886.0, 461.75], [3982.0, 599.5], [4030.0, 173.5], [4022.0, 519.5], [3974.0, 1040.0], [3990.0, 315.0], [3998.0, 311.0], [4094.0, 5.0], [4078.0, 5.0], [4046.0, 1071.0], [4054.0, 329.25], [4124.0, 265.77777777777777], [4140.0, 611.0], [4204.0, 533.0], [4188.0, 557.0], [4220.0, 785.0], [4108.0, 793.0], [4156.0, 550.0], [4316.0, 574.0], [4332.0, 768.0], [4236.0, 614.0], [4252.0, 642.0], [4268.0, 633.0], [4284.0, 472.0], [4364.0, 423.0], [4460.0, 820.2], [4380.0, 816.0], [4396.0, 1.0], [4492.0, 914.0], [4428.0, 232.33333333333331], [4444.0, 851.6666666666666], [4141.0, 1.0], [4125.0, 86.50000000000001], [4157.0, 1.0], [4317.0, 478.0], [4301.0, 666.0], [4269.0, 531.0], [4285.0, 1264.0], [4381.0, 1.0], [4461.0, 1028.0], [4445.0, 326.4], [4429.0, 208.49999999999997], [4397.0, 0.0], [4413.0, 1.0], [2175.0, 688.0], [2063.0, 977.0], [2199.0, 967.0], [2415.0, 590.0], [2559.0, 1850.5], [2495.0, 2417.0], [2487.0, 2129.0], [2479.0, 2644.0], [2663.0, 1210.0], [2679.0, 2671.0], [2631.0, 2037.3333333333333], [2591.0, 2003.75], [2575.0, 1777.0], [2615.0, 2613.0], [2711.0, 2202.0], [2791.0, 2706.0], [2767.0, 2136.333333333333], [2799.0, 1803.0], [2815.0, 558.0], [2695.0, 2357.0], [2703.0, 2173.5], [2743.0, 2628.0], [2751.0, 923.0], [2871.0, 2091.0], [2863.0, 472.0], [2847.0, 573.0], [2839.0, 456.5], [2911.0, 1.0], [2895.0, 1.0], [2887.0, 1122.0], [2879.0, 446.0], [2959.0, 2388.0], [2983.0, 2530.0], [3071.0, 253.0], [3055.0, 1.0], [3143.0, 1558.3333333333333], [3159.0, 2725.0], [3183.0, 949.0], [3175.0, 1120.0], [3151.0, 1.0], [3247.0, 2023.0], [3255.0, 1822.0], [3263.0, 2214.3333333333335], [3231.0, 1143.0], [3327.0, 0.0], [3271.0, 2271.25], [3335.0, 1.0], [3383.0, 419.5], [3343.0, 0.0], [3351.0, 1.0], [3359.0, 1.0], [3455.0, 183.33333333333334], [3423.0, 0.0], [3479.0, 0.6], [3511.0, 1.0], [3503.0, 1.0], [3527.0, 1.0], [3535.0, 1.0], [3591.0, 1.0], [3623.0, 1.0], [3631.0, 1.3333333333333333], [3599.0, 130.5], [3679.0, 2641.0], [3711.0, 913.0], [3743.0, 743.0], [3823.0, 1.25], [3719.0, 36.0], [3815.0, 275.3333333333333], [3839.0, 0.0], [3791.0, 1106.0], [3807.0, 1.0], [3759.0, 0.5], [3775.0, 1.0], [3863.0, 921.0], [3871.0, 1.0], [3903.0, 139.2], [3847.0, 901.0], [3855.0, 0.5], [3967.0, 0.0], [3951.0, 655.5], [3943.0, 595.0], [3911.0, 344.0], [3919.0, 123.0], [3927.0, 2.0], [3935.0, 1.0], [3879.0, 102.0], [4023.0, 1.0], [3991.0, 527.6666666666666], [4031.0, 440.0], [4071.0, 438.0], [4039.0, 1.0], [4055.0, 1.0], [4158.0, 515.0], [4142.0, 398.33333333333337], [4126.0, 166.0], [4174.0, 107.75], [4206.0, 1.0], [4350.0, 412.0], [4334.0, 0.0], [4302.0, 496.0], [4238.0, 597.5], [4254.0, 1.0], [4446.0, 0.8], [4382.0, 1.0], [4430.0, 208.28571428571428], [4366.0, 1342.0], [4478.0, 674.5], [4398.0, 257.66666666666663], [4494.0, 918.5], [4127.0, 206.5], [4143.0, 354.0], [4207.0, 561.3333333333333], [4223.0, 2611.0], [4175.0, 163.33333333333331], [4191.0, 1.0], [4159.0, 0.5], [4303.0, 630.0], [4335.0, 288.33333333333337], [4271.0, 890.5], [4447.0, 468.8571428571429], [4479.0, 964.0], [4431.0, 261.0], [4383.0, 0.0], [4399.0, 689.0], [4415.0, 363.375], [4495.0, 369.0]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[2418.4958999999994, 775.0959999999995]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 4503.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 850820.7333333333, "minX": 1.52524278E12, "maxY": 1067706.15, "series": [{"data": [[1.52524278E12, 1067706.15]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52524278E12, 850820.7333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524278E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 775.0959999999995, "minX": 1.52524278E12, "maxY": 775.0959999999995, "series": [{"data": [[1.52524278E12, 775.0959999999995]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524278E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 565.2494000000005, "minX": 1.52524278E12, "maxY": 565.2494000000005, "series": [{"data": [[1.52524278E12, 565.2494000000005]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524278E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 238.10500000000008, "minX": 1.52524278E12, "maxY": 238.10500000000008, "series": [{"data": [[1.52524278E12, 238.10500000000008]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524278E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 14.0, "minX": 1.52524278E12, "maxY": 4208.0, "series": [{"data": [[1.52524278E12, 4208.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52524278E12, 14.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52524278E12, 2014.1999999999998]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52524278E12, 3197.3199999999997]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52524278E12, 2458.5999999999995]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524278E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 1.0, "minX": 166.0, "maxY": 708.0, "series": [{"data": [[166.0, 708.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[166.0, 1.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 166.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 1.0, "minX": 166.0, "maxY": 708.0, "series": [{"data": [[166.0, 708.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[166.0, 1.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 166.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 166.66666666666666, "minX": 1.52524278E12, "maxY": 166.66666666666666, "series": [{"data": [[1.52524278E12, 166.66666666666666]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524278E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.05, "minX": 1.52524278E12, "maxY": 91.11666666666666, "series": [{"data": [[1.52524278E12, 91.11666666666666]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52524278E12, 58.516666666666666]], "isOverall": false, "label": "502", "isController": false}, {"data": [[1.52524278E12, 0.05]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.NoHttpResponseException", "isController": false}, {"data": [[1.52524278E12, 16.983333333333334]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524278E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 75.55, "minX": 1.52524278E12, "maxY": 91.11666666666666, "series": [{"data": [[1.52524278E12, 91.11666666666666]], "isOverall": false, "label": "inference-success", "isController": false}, {"data": [[1.52524278E12, 75.55]], "isOverall": false, "label": "inference-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524278E12, "title": "Transactions Per Second"}},
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
