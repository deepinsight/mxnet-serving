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
        data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 4209.0, "series": [{"data": [[0.0, 0.0], [0.1, 0.0], [0.2, 0.0], [0.3, 0.0], [0.4, 0.0], [0.5, 0.0], [0.6, 0.0], [0.7, 0.0], [0.8, 0.0], [0.9, 0.0], [1.0, 0.0], [1.1, 0.0], [1.2, 0.0], [1.3, 0.0], [1.4, 0.0], [1.5, 0.0], [1.6, 0.0], [1.7, 0.0], [1.8, 0.0], [1.9, 0.0], [2.0, 0.0], [2.1, 0.0], [2.2, 0.0], [2.3, 0.0], [2.4, 0.0], [2.5, 0.0], [2.6, 0.0], [2.7, 0.0], [2.8, 0.0], [2.9, 0.0], [3.0, 0.0], [3.1, 0.0], [3.2, 0.0], [3.3, 0.0], [3.4, 0.0], [3.5, 0.0], [3.6, 0.0], [3.7, 0.0], [3.8, 0.0], [3.9, 0.0], [4.0, 0.0], [4.1, 0.0], [4.2, 0.0], [4.3, 0.0], [4.4, 0.0], [4.5, 0.0], [4.6, 0.0], [4.7, 0.0], [4.8, 0.0], [4.9, 0.0], [5.0, 0.0], [5.1, 0.0], [5.2, 0.0], [5.3, 0.0], [5.4, 0.0], [5.5, 0.0], [5.6, 0.0], [5.7, 0.0], [5.8, 0.0], [5.9, 0.0], [6.0, 0.0], [6.1, 0.0], [6.2, 0.0], [6.3, 0.0], [6.4, 0.0], [6.5, 0.0], [6.6, 0.0], [6.7, 0.0], [6.8, 0.0], [6.9, 0.0], [7.0, 0.0], [7.1, 0.0], [7.2, 0.0], [7.3, 0.0], [7.4, 0.0], [7.5, 0.0], [7.6, 0.0], [7.7, 0.0], [7.8, 0.0], [7.9, 0.0], [8.0, 0.0], [8.1, 1.0], [8.2, 1.0], [8.3, 1.0], [8.4, 1.0], [8.5, 1.0], [8.6, 1.0], [8.7, 1.0], [8.8, 1.0], [8.9, 1.0], [9.0, 1.0], [9.1, 1.0], [9.2, 1.0], [9.3, 1.0], [9.4, 1.0], [9.5, 1.0], [9.6, 1.0], [9.7, 1.0], [9.8, 1.0], [9.9, 1.0], [10.0, 1.0], [10.1, 1.0], [10.2, 1.0], [10.3, 1.0], [10.4, 1.0], [10.5, 1.0], [10.6, 1.0], [10.7, 1.0], [10.8, 1.0], [10.9, 1.0], [11.0, 1.0], [11.1, 1.0], [11.2, 1.0], [11.3, 1.0], [11.4, 1.0], [11.5, 1.0], [11.6, 1.0], [11.7, 1.0], [11.8, 1.0], [11.9, 1.0], [12.0, 1.0], [12.1, 1.0], [12.2, 1.0], [12.3, 1.0], [12.4, 1.0], [12.5, 1.0], [12.6, 1.0], [12.7, 1.0], [12.8, 1.0], [12.9, 1.0], [13.0, 1.0], [13.1, 1.0], [13.2, 1.0], [13.3, 1.0], [13.4, 1.0], [13.5, 1.0], [13.6, 1.0], [13.7, 1.0], [13.8, 1.0], [13.9, 1.0], [14.0, 1.0], [14.1, 1.0], [14.2, 1.0], [14.3, 1.0], [14.4, 1.0], [14.5, 1.0], [14.6, 1.0], [14.7, 1.0], [14.8, 1.0], [14.9, 1.0], [15.0, 1.0], [15.1, 1.0], [15.2, 1.0], [15.3, 1.0], [15.4, 1.0], [15.5, 1.0], [15.6, 1.0], [15.7, 1.0], [15.8, 1.0], [15.9, 1.0], [16.0, 1.0], [16.1, 1.0], [16.2, 1.0], [16.3, 1.0], [16.4, 1.0], [16.5, 1.0], [16.6, 1.0], [16.7, 1.0], [16.8, 1.0], [16.9, 1.0], [17.0, 1.0], [17.1, 1.0], [17.2, 1.0], [17.3, 1.0], [17.4, 1.0], [17.5, 1.0], [17.6, 1.0], [17.7, 1.0], [17.8, 1.0], [17.9, 1.0], [18.0, 1.0], [18.1, 1.0], [18.2, 1.0], [18.3, 1.0], [18.4, 1.0], [18.5, 1.0], [18.6, 1.0], [18.7, 1.0], [18.8, 1.0], [18.9, 1.0], [19.0, 1.0], [19.1, 1.0], [19.2, 1.0], [19.3, 1.0], [19.4, 1.0], [19.5, 1.0], [19.6, 1.0], [19.7, 1.0], [19.8, 1.0], [19.9, 1.0], [20.0, 1.0], [20.1, 1.0], [20.2, 1.0], [20.3, 1.0], [20.4, 1.0], [20.5, 1.0], [20.6, 1.0], [20.7, 1.0], [20.8, 1.0], [20.9, 1.0], [21.0, 1.0], [21.1, 1.0], [21.2, 1.0], [21.3, 1.0], [21.4, 1.0], [21.5, 1.0], [21.6, 1.0], [21.7, 1.0], [21.8, 1.0], [21.9, 1.0], [22.0, 2.0], [22.1, 2.0], [22.2, 2.0], [22.3, 2.0], [22.4, 2.0], [22.5, 2.0], [22.6, 2.0], [22.7, 2.0], [22.8, 2.0], [22.9, 2.0], [23.0, 2.0], [23.1, 2.0], [23.2, 2.0], [23.3, 2.0], [23.4, 2.0], [23.5, 2.0], [23.6, 2.0], [23.7, 2.0], [23.8, 2.0], [23.9, 2.0], [24.0, 2.0], [24.1, 2.0], [24.2, 2.0], [24.3, 2.0], [24.4, 2.0], [24.5, 3.0], [24.6, 3.0], [24.7, 3.0], [24.8, 3.0], [24.9, 3.0], [25.0, 3.0], [25.1, 3.0], [25.2, 3.0], [25.3, 3.0], [25.4, 3.0], [25.5, 3.0], [25.6, 3.0], [25.7, 3.0], [25.8, 3.0], [25.9, 4.0], [26.0, 4.0], [26.1, 4.0], [26.2, 4.0], [26.3, 4.0], [26.4, 4.0], [26.5, 4.0], [26.6, 4.0], [26.7, 4.0], [26.8, 5.0], [26.9, 5.0], [27.0, 5.0], [27.1, 5.0], [27.2, 5.0], [27.3, 5.0], [27.4, 5.0], [27.5, 6.0], [27.6, 6.0], [27.7, 6.0], [27.8, 6.0], [27.9, 6.0], [28.0, 6.0], [28.1, 6.0], [28.2, 7.0], [28.3, 7.0], [28.4, 7.0], [28.5, 7.0], [28.6, 7.0], [28.7, 7.0], [28.8, 7.0], [28.9, 8.0], [29.0, 8.0], [29.1, 8.0], [29.2, 8.0], [29.3, 8.0], [29.4, 8.0], [29.5, 8.0], [29.6, 9.0], [29.7, 9.0], [29.8, 9.0], [29.9, 9.0], [30.0, 9.0], [30.1, 9.0], [30.2, 9.0], [30.3, 9.0], [30.4, 10.0], [30.5, 10.0], [30.6, 10.0], [30.7, 11.0], [30.8, 12.0], [30.9, 14.0], [31.0, 17.0], [31.1, 20.0], [31.2, 25.0], [31.3, 26.0], [31.4, 28.0], [31.5, 29.0], [31.6, 30.0], [31.7, 34.0], [31.8, 36.0], [31.9, 38.0], [32.0, 41.0], [32.1, 45.0], [32.2, 49.0], [32.3, 51.0], [32.4, 67.0], [32.5, 79.0], [32.6, 86.0], [32.7, 91.0], [32.8, 97.0], [32.9, 102.0], [33.0, 106.0], [33.1, 110.0], [33.2, 113.0], [33.3, 113.0], [33.4, 116.0], [33.5, 123.0], [33.6, 126.0], [33.7, 133.0], [33.8, 136.0], [33.9, 143.0], [34.0, 146.0], [34.1, 151.0], [34.2, 156.0], [34.3, 158.0], [34.4, 162.0], [34.5, 163.0], [34.6, 164.0], [34.7, 165.0], [34.8, 166.0], [34.9, 168.0], [35.0, 170.0], [35.1, 173.0], [35.2, 176.0], [35.3, 178.0], [35.4, 182.0], [35.5, 184.0], [35.6, 186.0], [35.7, 189.0], [35.8, 192.0], [35.9, 195.0], [36.0, 197.0], [36.1, 200.0], [36.2, 204.0], [36.3, 207.0], [36.4, 210.0], [36.5, 212.0], [36.6, 216.0], [36.7, 218.0], [36.8, 220.0], [36.9, 222.0], [37.0, 225.0], [37.1, 228.0], [37.2, 231.0], [37.3, 235.0], [37.4, 239.0], [37.5, 241.0], [37.6, 243.0], [37.7, 247.0], [37.8, 249.0], [37.9, 251.0], [38.0, 252.0], [38.1, 252.0], [38.2, 256.0], [38.3, 260.0], [38.4, 262.0], [38.5, 266.0], [38.6, 269.0], [38.7, 272.0], [38.8, 275.0], [38.9, 278.0], [39.0, 281.0], [39.1, 283.0], [39.2, 285.0], [39.3, 289.0], [39.4, 291.0], [39.5, 293.0], [39.6, 295.0], [39.7, 298.0], [39.8, 301.0], [39.9, 303.0], [40.0, 305.0], [40.1, 308.0], [40.2, 312.0], [40.3, 313.0], [40.4, 316.0], [40.5, 317.0], [40.6, 320.0], [40.7, 322.0], [40.8, 324.0], [40.9, 326.0], [41.0, 328.0], [41.1, 330.0], [41.2, 332.0], [41.3, 335.0], [41.4, 337.0], [41.5, 339.0], [41.6, 341.0], [41.7, 343.0], [41.8, 346.0], [41.9, 347.0], [42.0, 349.0], [42.1, 352.0], [42.2, 354.0], [42.3, 356.0], [42.4, 358.0], [42.5, 359.0], [42.6, 361.0], [42.7, 363.0], [42.8, 366.0], [42.9, 368.0], [43.0, 370.0], [43.1, 372.0], [43.2, 373.0], [43.3, 376.0], [43.4, 378.0], [43.5, 379.0], [43.6, 382.0], [43.7, 383.0], [43.8, 385.0], [43.9, 387.0], [44.0, 389.0], [44.1, 391.0], [44.2, 392.0], [44.3, 394.0], [44.4, 395.0], [44.5, 397.0], [44.6, 399.0], [44.7, 402.0], [44.8, 404.0], [44.9, 406.0], [45.0, 408.0], [45.1, 410.0], [45.2, 412.0], [45.3, 414.0], [45.4, 416.0], [45.5, 418.0], [45.6, 419.0], [45.7, 422.0], [45.8, 424.0], [45.9, 427.0], [46.0, 429.0], [46.1, 431.0], [46.2, 433.0], [46.3, 435.0], [46.4, 437.0], [46.5, 439.0], [46.6, 441.0], [46.7, 442.0], [46.8, 443.0], [46.9, 445.0], [47.0, 447.0], [47.1, 449.0], [47.2, 450.0], [47.3, 452.0], [47.4, 454.0], [47.5, 456.0], [47.6, 457.0], [47.7, 460.0], [47.8, 461.0], [47.9, 463.0], [48.0, 465.0], [48.1, 468.0], [48.2, 469.0], [48.3, 472.0], [48.4, 474.0], [48.5, 476.0], [48.6, 479.0], [48.7, 481.0], [48.8, 483.0], [48.9, 484.0], [49.0, 487.0], [49.1, 490.0], [49.2, 493.0], [49.3, 495.0], [49.4, 496.0], [49.5, 498.0], [49.6, 500.0], [49.7, 503.0], [49.8, 504.0], [49.9, 505.0], [50.0, 507.0], [50.1, 509.0], [50.2, 510.0], [50.3, 512.0], [50.4, 514.0], [50.5, 516.0], [50.6, 517.0], [50.7, 519.0], [50.8, 520.0], [50.9, 522.0], [51.0, 523.0], [51.1, 525.0], [51.2, 527.0], [51.3, 528.0], [51.4, 529.0], [51.5, 530.0], [51.6, 532.0], [51.7, 534.0], [51.8, 536.0], [51.9, 538.0], [52.0, 539.0], [52.1, 541.0], [52.2, 542.0], [52.3, 545.0], [52.4, 547.0], [52.5, 548.0], [52.6, 549.0], [52.7, 551.0], [52.8, 553.0], [52.9, 555.0], [53.0, 556.0], [53.1, 558.0], [53.2, 559.0], [53.3, 561.0], [53.4, 564.0], [53.5, 565.0], [53.6, 566.0], [53.7, 568.0], [53.8, 570.0], [53.9, 571.0], [54.0, 573.0], [54.1, 575.0], [54.2, 576.0], [54.3, 577.0], [54.4, 580.0], [54.5, 581.0], [54.6, 584.0], [54.7, 585.0], [54.8, 587.0], [54.9, 588.0], [55.0, 590.0], [55.1, 593.0], [55.2, 595.0], [55.3, 596.0], [55.4, 599.0], [55.5, 600.0], [55.6, 602.0], [55.7, 604.0], [55.8, 607.0], [55.9, 608.0], [56.0, 610.0], [56.1, 613.0], [56.2, 615.0], [56.3, 617.0], [56.4, 619.0], [56.5, 621.0], [56.6, 623.0], [56.7, 627.0], [56.8, 629.0], [56.9, 630.0], [57.0, 633.0], [57.1, 635.0], [57.2, 638.0], [57.3, 640.0], [57.4, 640.0], [57.5, 643.0], [57.6, 644.0], [57.7, 646.0], [57.8, 649.0], [57.9, 650.0], [58.0, 652.0], [58.1, 654.0], [58.2, 657.0], [58.3, 659.0], [58.4, 661.0], [58.5, 663.0], [58.6, 665.0], [58.7, 669.0], [58.8, 672.0], [58.9, 673.0], [59.0, 674.0], [59.1, 677.0], [59.2, 679.0], [59.3, 681.0], [59.4, 683.0], [59.5, 685.0], [59.6, 687.0], [59.7, 691.0], [59.8, 693.0], [59.9, 696.0], [60.0, 698.0], [60.1, 701.0], [60.2, 703.0], [60.3, 706.0], [60.4, 708.0], [60.5, 711.0], [60.6, 714.0], [60.7, 717.0], [60.8, 720.0], [60.9, 723.0], [61.0, 726.0], [61.1, 729.0], [61.2, 732.0], [61.3, 735.0], [61.4, 738.0], [61.5, 741.0], [61.6, 743.0], [61.7, 747.0], [61.8, 750.0], [61.9, 753.0], [62.0, 756.0], [62.1, 759.0], [62.2, 762.0], [62.3, 764.0], [62.4, 767.0], [62.5, 768.0], [62.6, 772.0], [62.7, 774.0], [62.8, 776.0], [62.9, 779.0], [63.0, 780.0], [63.1, 782.0], [63.2, 784.0], [63.3, 787.0], [63.4, 788.0], [63.5, 792.0], [63.6, 794.0], [63.7, 796.0], [63.8, 798.0], [63.9, 801.0], [64.0, 804.0], [64.1, 806.0], [64.2, 808.0], [64.3, 810.0], [64.4, 814.0], [64.5, 817.0], [64.6, 821.0], [64.7, 822.0], [64.8, 827.0], [64.9, 829.0], [65.0, 832.0], [65.1, 834.0], [65.2, 838.0], [65.3, 840.0], [65.4, 842.0], [65.5, 843.0], [65.6, 845.0], [65.7, 847.0], [65.8, 849.0], [65.9, 851.0], [66.0, 853.0], [66.1, 855.0], [66.2, 857.0], [66.3, 860.0], [66.4, 862.0], [66.5, 864.0], [66.6, 866.0], [66.7, 867.0], [66.8, 869.0], [66.9, 871.0], [67.0, 873.0], [67.1, 876.0], [67.2, 878.0], [67.3, 880.0], [67.4, 883.0], [67.5, 885.0], [67.6, 887.0], [67.7, 888.0], [67.8, 890.0], [67.9, 891.0], [68.0, 894.0], [68.1, 896.0], [68.2, 898.0], [68.3, 900.0], [68.4, 902.0], [68.5, 904.0], [68.6, 905.0], [68.7, 907.0], [68.8, 909.0], [68.9, 911.0], [69.0, 913.0], [69.1, 914.0], [69.2, 915.0], [69.3, 917.0], [69.4, 918.0], [69.5, 920.0], [69.6, 923.0], [69.7, 924.0], [69.8, 926.0], [69.9, 928.0], [70.0, 929.0], [70.1, 930.0], [70.2, 931.0], [70.3, 934.0], [70.4, 937.0], [70.5, 938.0], [70.6, 939.0], [70.7, 939.0], [70.8, 940.0], [70.9, 942.0], [71.0, 943.0], [71.1, 945.0], [71.2, 947.0], [71.3, 950.0], [71.4, 952.0], [71.5, 954.0], [71.6, 956.0], [71.7, 959.0], [71.8, 962.0], [71.9, 964.0], [72.0, 966.0], [72.1, 969.0], [72.2, 973.0], [72.3, 975.0], [72.4, 978.0], [72.5, 979.0], [72.6, 982.0], [72.7, 985.0], [72.8, 986.0], [72.9, 988.0], [73.0, 990.0], [73.1, 992.0], [73.2, 994.0], [73.3, 996.0], [73.4, 998.0], [73.5, 1001.0], [73.6, 1002.0], [73.7, 1004.0], [73.8, 1004.0], [73.9, 1006.0], [74.0, 1009.0], [74.1, 1011.0], [74.2, 1014.0], [74.3, 1015.0], [74.4, 1015.0], [74.5, 1019.0], [74.6, 1021.0], [74.7, 1023.0], [74.8, 1026.0], [74.9, 1027.0], [75.0, 1028.0], [75.1, 1029.0], [75.2, 1030.0], [75.3, 1033.0], [75.4, 1035.0], [75.5, 1037.0], [75.6, 1039.0], [75.7, 1042.0], [75.8, 1044.0], [75.9, 1046.0], [76.0, 1047.0], [76.1, 1048.0], [76.2, 1050.0], [76.3, 1051.0], [76.4, 1053.0], [76.5, 1055.0], [76.6, 1057.0], [76.7, 1058.0], [76.8, 1060.0], [76.9, 1061.0], [77.0, 1063.0], [77.1, 1065.0], [77.2, 1067.0], [77.3, 1068.0], [77.4, 1070.0], [77.5, 1071.0], [77.6, 1073.0], [77.7, 1075.0], [77.8, 1076.0], [77.9, 1078.0], [78.0, 1080.0], [78.1, 1081.0], [78.2, 1083.0], [78.3, 1084.0], [78.4, 1086.0], [78.5, 1088.0], [78.6, 1089.0], [78.7, 1090.0], [78.8, 1091.0], [78.9, 1093.0], [79.0, 1096.0], [79.1, 1098.0], [79.2, 1099.0], [79.3, 1100.0], [79.4, 1103.0], [79.5, 1104.0], [79.6, 1106.0], [79.7, 1108.0], [79.8, 1110.0], [79.9, 1111.0], [80.0, 1112.0], [80.1, 1114.0], [80.2, 1116.0], [80.3, 1118.0], [80.4, 1120.0], [80.5, 1122.0], [80.6, 1124.0], [80.7, 1127.0], [80.8, 1129.0], [80.9, 1131.0], [81.0, 1132.0], [81.1, 1134.0], [81.2, 1137.0], [81.3, 1139.0], [81.4, 1141.0], [81.5, 1142.0], [81.6, 1144.0], [81.7, 1147.0], [81.8, 1149.0], [81.9, 1152.0], [82.0, 1155.0], [82.1, 1157.0], [82.2, 1159.0], [82.3, 1160.0], [82.4, 1162.0], [82.5, 1164.0], [82.6, 1166.0], [82.7, 1168.0], [82.8, 1170.0], [82.9, 1171.0], [83.0, 1173.0], [83.1, 1176.0], [83.2, 1179.0], [83.3, 1180.0], [83.4, 1183.0], [83.5, 1185.0], [83.6, 1188.0], [83.7, 1191.0], [83.8, 1192.0], [83.9, 1195.0], [84.0, 1196.0], [84.1, 1196.0], [84.2, 1199.0], [84.3, 1204.0], [84.4, 1206.0], [84.5, 1211.0], [84.6, 1214.0], [84.7, 1217.0], [84.8, 1220.0], [84.9, 1224.0], [85.0, 1227.0], [85.1, 1230.0], [85.2, 1235.0], [85.3, 1237.0], [85.4, 1243.0], [85.5, 1246.0], [85.6, 1250.0], [85.7, 1256.0], [85.8, 1261.0], [85.9, 1267.0], [86.0, 1272.0], [86.1, 1280.0], [86.2, 1289.0], [86.3, 1296.0], [86.4, 1306.0], [86.5, 1317.0], [86.6, 1326.0], [86.7, 1332.0], [86.8, 1343.0], [86.9, 1355.0], [87.0, 1363.0], [87.1, 1385.0], [87.2, 1456.0], [87.3, 1693.0], [87.4, 1763.0], [87.5, 1793.0], [87.6, 1799.0], [87.7, 1820.0], [87.8, 1828.0], [87.9, 1854.0], [88.0, 1874.0], [88.1, 1909.0], [88.2, 1922.0], [88.3, 1932.0], [88.4, 1941.0], [88.5, 1959.0], [88.6, 1969.0], [88.7, 1973.0], [88.8, 1976.0], [88.9, 1980.0], [89.0, 1992.0], [89.1, 1998.0], [89.2, 2017.0], [89.3, 2023.0], [89.4, 2026.0], [89.5, 2028.0], [89.6, 2031.0], [89.7, 2033.0], [89.8, 2037.0], [89.9, 2040.0], [90.0, 2042.0], [90.1, 2043.0], [90.2, 2046.0], [90.3, 2048.0], [90.4, 2051.0], [90.5, 2053.0], [90.6, 2057.0], [90.7, 2061.0], [90.8, 2066.0], [90.9, 2070.0], [91.0, 2075.0], [91.1, 2077.0], [91.2, 2079.0], [91.3, 2082.0], [91.4, 2084.0], [91.5, 2089.0], [91.6, 2092.0], [91.7, 2098.0], [91.8, 2105.0], [91.9, 2120.0], [92.0, 2138.0], [92.1, 2175.0], [92.2, 2184.0], [92.3, 2190.0], [92.4, 2197.0], [92.5, 2204.0], [92.6, 2210.0], [92.7, 2213.0], [92.8, 2218.0], [92.9, 2221.0], [93.0, 2225.0], [93.1, 2234.0], [93.2, 2247.0], [93.3, 2304.0], [93.4, 2375.0], [93.5, 2422.0], [93.6, 2453.0], [93.7, 2469.0], [93.8, 2538.0], [93.9, 2567.0], [94.0, 2579.0], [94.1, 2602.0], [94.2, 2623.0], [94.3, 2644.0], [94.4, 2661.0], [94.5, 2682.0], [94.6, 2694.0], [94.7, 2701.0], [94.8, 2711.0], [94.9, 2734.0], [95.0, 2762.0], [95.1, 2770.0], [95.2, 2793.0], [95.3, 2803.0], [95.4, 2809.0], [95.5, 2811.0], [95.6, 2815.0], [95.7, 2819.0], [95.8, 2821.0], [95.9, 2824.0], [96.0, 2830.0], [96.1, 2834.0], [96.2, 2845.0], [96.3, 2858.0], [96.4, 2887.0], [96.5, 2908.0], [96.6, 2914.0], [96.7, 2918.0], [96.8, 2923.0], [96.9, 2928.0], [97.0, 2931.0], [97.1, 2934.0], [97.2, 2936.0], [97.3, 2939.0], [97.4, 2943.0], [97.5, 2945.0], [97.6, 2947.0], [97.7, 2948.0], [97.8, 2951.0], [97.9, 2956.0], [98.0, 2965.0], [98.1, 2971.0], [98.2, 2975.0], [98.3, 2977.0], [98.4, 2984.0], [98.5, 2989.0], [98.6, 2992.0], [98.7, 2998.0], [98.8, 3022.0], [98.9, 3035.0], [99.0, 3082.0], [99.1, 3127.0], [99.2, 3139.0], [99.3, 3152.0], [99.4, 3166.0], [99.5, 3185.0], [99.6, 3209.0], [99.7, 3306.0], [99.8, 3395.0], [99.9, 3763.0], [100.0, 4209.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 3282.0, "series": [{"data": [[0.0, 3282.0], [600.0, 463.0], [700.0, 380.0], [800.0, 440.0], [900.0, 521.0], [1000.0, 578.0], [1100.0, 495.0], [1200.0, 213.0], [1300.0, 79.0], [1400.0, 8.0], [100.0, 327.0], [1600.0, 11.0], [1700.0, 29.0], [1800.0, 47.0], [1900.0, 103.0], [2000.0, 262.0], [2100.0, 73.0], [2200.0, 81.0], [2300.0, 20.0], [2400.0, 29.0], [2500.0, 32.0], [2600.0, 62.0], [2700.0, 56.0], [2800.0, 120.0], [2900.0, 225.0], [3000.0, 32.0], [3100.0, 54.0], [200.0, 365.0], [3200.0, 13.0], [3300.0, 12.0], [3400.0, 3.0], [3500.0, 4.0], [3600.0, 1.0], [3700.0, 3.0], [3800.0, 4.0], [4000.0, 1.0], [4100.0, 1.0], [4200.0, 2.0], [300.0, 486.0], [400.0, 494.0], [500.0, 589.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 4200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 446.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 4229.0, "series": [{"data": [[1.0, 3653.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 4229.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 1672.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 446.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 1250.5269286754003, "minX": 1.5252405E12, "maxY": 2080.588639536132, "series": [{"data": [[1.5252405E12, 2080.588639536132], [1.52524056E12, 1250.5269286754003]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524056E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 0.0, "minX": 457.0, "maxY": 4015.0, "series": [{"data": [[457.0, 1198.0], [473.0, 1178.0], [468.0, 1188.0], [494.0, 1155.0], [481.0, 1166.0], [510.0, 1131.0], [503.0, 1143.0], [530.0, 1104.0], [520.0, 1117.0], [569.0, 1070.0], [559.0, 1084.0], [546.0, 1096.0], [601.0, 1093.0], [596.0, 1158.0], [595.0, 1048.0], [587.0, 1169.0], [585.0, 1058.0], [639.0, 994.0], [638.0, 1113.0], [631.0, 1064.0], [626.0, 1133.0], [625.0, 1015.0], [612.0, 1141.0], [610.0, 1026.0], [671.0, 1021.5], [665.0, 1363.0], [663.0, 973.0], [662.0, 1091.0], [655.0, 1042.5], [699.0, 1052.0], [695.0, 1338.0], [693.0, 945.0], [692.0, 1062.0], [689.0, 1349.0], [687.0, 955.0], [686.0, 1071.0], [678.0, 1355.0], [735.0, 1294.0], [731.0, 903.0], [727.0, 1024.0], [722.0, 1303.0], [720.0, 914.0], [719.0, 1034.0], [713.0, 1315.0], [712.0, 984.0], [707.0, 1326.0], [704.0, 934.0], [762.0, 991.0], [759.0, 1269.0], [754.0, 881.0], [750.0, 1002.0], [746.0, 1281.0], [743.0, 891.0], [739.0, 1013.0], [792.0, 793.5], [790.0, 1108.5], [784.0, 860.0], [783.0, 981.0], [781.0, 1258.0], [768.0, 870.0], [831.0, 716.0], [829.0, 1229.0], [806.0, 843.0], [805.0, 975.3333333333334], [856.0, 600.0], [849.0, 938.0], [847.0, 914.6666666666666], [832.0, 891.0], [895.0, 681.0], [893.0, 801.0], [876.0, 589.0], [873.0, 926.0], [872.0, 1205.0], [871.0, 693.0], [870.0, 813.0], [902.0, 576.0], [925.0, 778.0], [927.0, 665.0], [920.0, 567.0], [916.0, 903.0], [912.0, 1179.0], [907.0, 674.0], [906.0, 789.0], [900.0, 916.0], [897.0, 1192.0], [957.0, 758.0], [956.0, 546.0], [952.0, 1153.0], [949.0, 881.0], [942.0, 654.0], [940.0, 663.0], [938.0, 1166.0], [937.0, 892.0], [988.0, 632.0], [986.0, 640.5], [985.0, 1142.0], [974.0, 869.0], [962.0, 644.0], [1021.0, 816.5], [1015.0, 849.0], [1012.0, 621.0], [1010.0, 738.0], [1009.0, 827.5], [996.0, 859.0], [1076.0, 476.0], [1084.0, 535.5], [1086.0, 1237.0], [1082.0, 1075.0], [1074.0, 1247.0], [1030.0, 608.0], [1060.0, 586.0], [1056.0, 495.0], [1048.0, 714.0], [1044.0, 1109.0], [1042.0, 502.0], [1124.0, 827.5], [1144.0, 720.0], [1148.0, 569.75], [1122.0, 423.0], [1142.0, 580.75], [1140.0, 615.0], [1136.0, 442.0], [1102.0, 772.0], [1094.0, 1226.0], [1090.0, 844.6666666666666], [1114.0, 665.5], [1112.0, 762.0], [1110.0, 434.0], [1108.0, 1207.0], [1104.0, 473.0], [1134.0, 758.0], [1132.0, 410.0], [1130.0, 963.0], [1208.0, 938.0], [1212.0, 1098.0], [1200.0, 522.6666666666666], [1166.0, 1141.0], [1154.0, 1152.0], [1152.0, 709.0], [1196.0, 948.0], [1194.0, 413.5], [1186.0, 1120.0], [1184.0, 622.5], [1172.0, 580.0], [1168.0, 611.3333333333334], [1272.0, 873.0], [1276.0, 760.5], [1266.0, 602.5], [1264.0, 384.0], [1260.0, 290.0], [1258.0, 895.0], [1256.0, 330.0], [1250.0, 1068.0], [1244.0, 406.0], [1224.0, 647.0], [1222.0, 645.0], [1230.0, 351.0], [1226.0, 646.6666666666666], [1240.0, 1076.0], [1238.0, 311.0], [1236.0, 636.0], [1318.0, 975.0], [1340.0, 1205.0], [1342.0, 444.5], [1314.0, 209.0], [1338.0, 504.3333333333333], [1330.0, 227.0], [1328.0, 310.0], [1292.0, 244.0], [1288.0, 739.5], [1286.0, 750.0], [1280.0, 726.5], [1308.0, 560.6666666666666], [1304.0, 601.6666666666666], [1326.0, 437.0], [1324.0, 197.0], [1320.0, 550.0], [1380.0, 739.0], [1404.0, 697.0], [1402.0, 926.0], [1392.0, 471.0], [1356.0, 539.0], [1350.0, 281.0], [1348.0, 764.6666666666666], [1386.0, 177.5], [1384.0, 1152.0], [1382.0, 167.0], [1378.0, 725.5], [1372.0, 749.0], [1370.0, 333.0], [1368.0, 914.0], [1360.0, 503.0], [1458.0, 894.5], [1442.0, 613.9333333333333], [1468.0, 624.3333333333333], [1454.0, 341.15384615384613], [1452.0, 270.00000000000006], [1450.0, 386.22222222222223], [1448.0, 494.13043478260863], [1444.0, 521.25], [1446.0, 809.25], [1440.0, 522.235294117647], [1470.0, 456.3125], [1434.0, 653.4444444444445], [1430.0, 666.3333333333334], [1432.0, 601.5555555555555], [1428.0, 812.3333333333334], [1424.0, 757.6], [1426.0, 259.2], [1436.0, 445.87500000000006], [1438.0, 503.972972972973], [1456.0, 705.0], [1420.0, 188.0], [1418.0, 1103.0], [1410.0, 714.6], [1408.0, 124.0], [1460.0, 435.87500000000006], [1462.0, 293.0], [1464.0, 531.0555555555555], [1466.0, 441.75], [1482.0, 279.1666666666667], [1534.0, 577.0], [1520.0, 515.9107142857142], [1522.0, 541.8644067796611], [1526.0, 585.9333333333334], [1524.0, 353.5652173913043], [1532.0, 625.7499999999999], [1528.0, 732.9130434782609], [1530.0, 720.8275862068966], [1484.0, 443.55319148936167], [1476.0, 387.7826086956522], [1478.0, 436.3333333333334], [1480.0, 433.6874999999999], [1474.0, 411.40625], [1472.0, 313.80769230769226], [1502.0, 501.8095238095238], [1500.0, 595.1428571428571], [1486.0, 526.5882352941177], [1516.0, 393.438596491228], [1518.0, 368.1346153846156], [1514.0, 426.5384615384616], [1512.0, 457.5806451612903], [1510.0, 385.76543209876553], [1508.0, 500.0714285714286], [1504.0, 457.2916666666667], [1506.0, 544.2307692307692], [1498.0, 570.6666666666667], [1496.0, 335.21739130434776], [1494.0, 408.15686274509795], [1488.0, 553.2051282051283], [1490.0, 362.24999999999994], [1492.0, 417.3243243243242], [1550.0, 755.4210526315788], [1576.0, 519.4666666666666], [1590.0, 493.8636363636364], [1584.0, 200.75], [1588.0, 625.6249999999999], [1586.0, 680.75], [1572.0, 336.4137931034483], [1574.0, 467.7916666666667], [1570.0, 386.8181818181818], [1568.0, 426.25], [1596.0, 372.2105263157895], [1592.0, 368.8378378378378], [1594.0, 231.94444444444446], [1598.0, 465.33333333333326], [1546.0, 576.7352941176471], [1548.0, 660.0000000000001], [1582.0, 479.25000000000006], [1580.0, 503.93333333333334], [1578.0, 514.7142857142858], [1558.0, 587.8333333333333], [1554.0, 688.3333333333333], [1556.0, 608.5000000000001], [1552.0, 784.6153846153846], [1544.0, 649.4444444444443], [1542.0, 491.8070175438597], [1538.0, 468.5526315789474], [1540.0, 416.87499999999994], [1536.0, 623.0540540540542], [1562.0, 480.33333333333337], [1560.0, 455.2285714285715], [1566.0, 548.6666666666666], [1564.0, 643.7894736842105], [1656.0, 993.5], [1646.0, 859.0], [1644.0, 359.5], [1632.0, 442.5], [1634.0, 587.3333333333333], [1636.0, 635.0], [1662.0, 600.0], [1658.0, 604.2], [1660.0, 515.875], [1638.0, 618.6666666666667], [1640.0, 483.12500000000006], [1642.0, 191.66666666666669], [1614.0, 749.0833333333334], [1650.0, 518.0], [1652.0, 562.2], [1654.0, 438.0], [1610.0, 644.6999999999999], [1612.0, 476.5], [1600.0, 437.3], [1602.0, 357.9230769230769], [1622.0, 348.75], [1624.0, 1.0], [1626.0, 157.5], [1628.0, 864.4], [1630.0, 478.2], [1620.0, 795.5], [1618.0, 604.0], [1616.0, 709.75], [1604.0, 771.3], [1606.0, 585.5], [1608.0, 481.0], [1714.0, 592.3333333333333], [1696.0, 379.33333333333337], [1692.0, 563.1818181818182], [1694.0, 1.0], [1690.0, 224.33333333333331], [1686.0, 206.0], [1688.0, 197.5], [1682.0, 233.28571428571428], [1684.0, 1.0], [1664.0, 611.4285714285714], [1666.0, 820.0], [1668.0, 1004.5], [1676.0, 189.40000000000003], [1712.0, 807.0], [1724.0, 863.0], [1720.0, 1756.0], [1716.0, 364.0], [1718.0, 586.0], [1722.0, 930.3333333333333], [1726.0, 1449.5], [1698.0, 396.9032258064517], [1700.0, 932.8], [1702.0, 144.4736842105263], [1704.0, 573.8], [1708.0, 269.0], [1706.0, 1215.0], [1710.0, 519.0], [1740.0, 693.8], [1728.0, 632.3333333333334], [1734.0, 1072.5], [1730.0, 331.5], [1744.0, 772.8888888888889], [1746.0, 681.2], [1778.0, 986.0], [1776.0, 1028.0], [1780.0, 1067.6666666666667], [1790.0, 1053.0], [1762.0, 200.8], [1760.0, 4.0], [1786.0, 346.0], [1764.0, 1039.4], [1770.0, 413.07692307692304], [1766.0, 286.3333333333333], [1768.0, 394.0], [1772.0, 263.0], [1774.0, 7.2], [1750.0, 816.0], [1748.0, 267.0], [1752.0, 795.0], [1758.0, 333.1666666666667], [1756.0, 877.0], [1804.0, 1052.0], [1800.0, 1987.0], [1816.0, 1363.0], [1802.0, 999.0], [1846.0, 1776.0], [1848.0, 1192.0], [1824.0, 1023.0], [1826.0, 1060.0], [1810.0, 993.0], [1814.0, 1056.0], [1912.0, 1.0], [1870.0, 1060.0], [1884.0, 1017.0], [1908.0, 1709.6666666666667], [1902.0, 1087.0], [1916.0, 0.0], [1914.0, 796.0], [1910.0, 0.0], [1886.0, 0.0], [1856.0, 807.5], [1982.0, 1145.0], [1924.0, 1317.6666666666667], [1930.0, 2024.0], [1940.0, 963.0], [1946.0, 899.6666666666667], [1944.0, 325.0], [1956.0, 30.0], [1958.0, 1158.0], [1976.0, 997.0], [1966.0, 1557.5], [1964.0, 1045.5], [2036.0, 2061.0], [1990.0, 919.0], [1996.0, 1796.0], [2032.0, 1175.6], [2038.0, 876.5], [2044.0, 1440.5], [2016.0, 790.0], [2022.0, 2030.6666666666667], [2024.0, 1406.0666666666666], [2026.0, 1.0], [2028.0, 1715.857142857143], [2030.0, 1568.111111111111], [2000.0, 1762.75], [2002.0, 1482.0], [2014.0, 1305.6666666666667], [2144.0, 1477.0], [2076.0, 1403.2], [2108.0, 599.6666666666666], [2092.0, 1053.0], [2104.0, 1192.0], [2100.0, 758.0], [2152.0, 1.0], [2156.0, 491.8333333333333], [2164.0, 1045.5], [2160.0, 282.0], [2112.0, 590.5], [2124.0, 134.5], [2128.0, 424.5], [2132.0, 1037.0], [2136.0, 2.0], [2140.0, 531.8333333333333], [2088.0, 622.4000000000001], [2176.0, 316.0], [2184.0, 161.71428571428572], [2236.0, 95.6923076923077], [2224.0, 472.6666666666667], [2216.0, 2.0], [2208.0, 873.3333333333335], [2180.0, 1.0], [2200.0, 242.24999999999997], [2192.0, 545.0], [2280.0, 1.5], [2292.0, 933.75], [2296.0, 192.33333333333331], [2240.0, 518.4], [2244.0, 1.0], [2248.0, 455.14285714285717], [2260.0, 1.2], [2264.0, 1.0], [2332.0, 264.4], [2316.0, 720.4285714285714], [2312.0, 491.0], [2304.0, 521.5], [2360.0, 400.1666666666667], [2356.0, 1.090909090909091], [2352.0, 771.75], [2344.0, 1504.0], [2340.0, 1.0], [2308.0, 3.0], [2320.0, 346.0], [2328.0, 749.6666666666667], [2324.0, 1047.0], [2404.0, 1.0], [2408.0, 187.0], [2412.0, 1.0], [2416.0, 546.75], [2420.0, 1.0], [2424.0, 0.6], [2428.0, 1049.0], [2368.0, 0.0], [2376.0, 31.4], [2380.0, 1.0], [2388.0, 1.0], [2396.0, 1.0], [2392.0, 0.0], [2456.0, 1121.3333333333333], [2452.0, 685.5], [2448.0, 0.0], [2444.0, 1.0], [2480.0, 196.0], [2488.0, 494.0], [2432.0, 1.0], [2472.0, 1146.0], [2464.0, 1095.0], [2528.0, 1413.3333333333335], [2460.0, 1.0], [2532.0, 968.0], [2536.0, 296.0], [2548.0, 94.0], [2544.0, 361.0], [2552.0, 1806.5], [2556.0, 2111.0], [2496.0, 1942.0], [2508.0, 1194.75], [2512.0, 1264.6666666666667], [2516.0, 188.5], [2520.0, 1282.0], [2572.0, 628.4516129032256], [2576.0, 1194.625], [2600.0, 1249.0], [2592.0, 448.0], [2596.0, 1.0], [2620.0, 678.0], [2564.0, 380.5], [2612.0, 827.3333333333334], [2616.0, 1002.0], [2580.0, 650.4545454545454], [2588.0, 2239.0], [2660.0, 2139.0], [2668.0, 1530.25], [2664.0, 978.0], [2672.0, 1860.0666666666666], [2676.0, 2234.7058823529414], [2680.0, 2568.56], [2684.0, 2810.0], [2628.0, 0.0], [2624.0, 1065.0], [2640.0, 1241.5], [2648.0, 2074.5], [2652.0, 629.0], [2644.0, 498.0], [2584.0, 1040.3333333333333], [2788.0, 829.125], [2700.0, 2388.6086956521735], [2692.0, 2408.705882352941], [2748.0, 1514.8], [2688.0, 512.0], [2724.0, 1641.6666666666665], [2720.0, 479.0], [2736.0, 483.0], [2740.0, 593.0], [2696.0, 2188.714285714286], [2704.0, 1919.4285714285718], [2708.0, 1717.7500000000002], [2712.0, 2097.0], [2784.0, 1.0], [2800.0, 972.1111111111111], [2792.0, 319.5], [2752.0, 285.5], [2756.0, 726.0], [2812.0, 0.5], [2804.0, 344.0], [2808.0, 429.00000000000006], [2760.0, 902.6666666666667], [2768.0, 804.0], [2772.0, 900.9999999999999], [2776.0, 1790.1538461538462], [2780.0, 334.0], [2912.0, 268.5], [2836.0, 436.9999999999999], [2840.0, 301.2], [2844.0, 761.2], [2868.0, 293.0], [2872.0, 5.91304347826087], [2816.0, 102.62500000000003], [2832.0, 1849.2916666666667], [2824.0, 609.4000000000001], [2828.0, 201.55555555555554], [2820.0, 312.0], [2916.0, 895.2692307692307], [2924.0, 2064.2], [2932.0, 137.0], [2928.0, 3766.0], [2888.0, 656.0], [2896.0, 2769.0], [2904.0, 2666.0], [2908.0, 399.0], [2852.0, 2130.0], [2856.0, 1718.0], [2960.0, 2961.0], [2956.0, 1188.0], [2968.0, 267.5], [3056.0, 1424.75], [3052.0, 115.52941176470591], [3060.0, 34.0], [3064.0, 33.4], [2976.0, 2177.0], [2984.0, 915.5], [2992.0, 911.0], [3068.0, 639.6666666666666], [3028.0, 0.0], [3036.0, 824.0], [3032.0, 1171.0], [3176.0, 2334.7500000000005], [3088.0, 124.0], [3096.0, 3010.0], [3092.0, 3179.0], [3172.0, 48.8], [3184.0, 5.0], [3188.0, 5.0], [3196.0, 190.66666666666666], [3156.0, 3163.0], [3152.0, 195.33333333333331], [3116.0, 2377.75], [3128.0, 2970.0], [3132.0, 9.0], [3164.0, 2973.0], [3216.0, 2091.25], [3248.0, 503.00000000000006], [3240.0, 1041.6666666666667], [3224.0, 3142.0], [3260.0, 1052.0000000000002], [3256.0, 2094.5], [3252.0, 722.7142857142858], [3228.0, 1119.0], [3296.0, 1257.0], [3264.0, 828.6666666666667], [3272.0, 2027.0], [3276.0, 609.7777777777778], [3280.0, 389.83333333333337], [3284.0, 897.1666666666667], [3288.0, 211.36363636363637], [3292.0, 1285.6], [3268.0, 1078.0], [3232.0, 3083.0], [3236.0, 1329.3333333333333], [3244.0, 676.0555555555555], [2145.0, 1430.0], [2101.0, 1.0], [2105.0, 684.3333333333334], [2057.0, 1153.0], [2065.0, 290.0], [2061.0, 627.0], [2093.0, 2.0], [2097.0, 966.0], [2089.0, 544.375], [2085.0, 1125.0], [2081.0, 279.0], [2165.0, 1.0], [2161.0, 1145.0], [2169.0, 528.875], [2113.0, 485.5714285714285], [2117.0, 901.3333333333334], [2173.0, 646.0], [2133.0, 287.0], [2141.0, 299.0], [2201.0, 441.2], [2233.0, 785.7500000000001], [2221.0, 1.3333333333333333], [2229.0, 1.0], [2217.0, 232.66666666666669], [2193.0, 385.3333333333333], [2189.0, 0.0], [2185.0, 1.0], [2181.0, 0.0], [2205.0, 539.0], [2277.0, 1.0], [2281.0, 126.2], [2293.0, 1.0], [2301.0, 2.0], [2249.0, 1.0], [2245.0, 0.0], [2269.0, 1.0], [2325.0, 622.909090909091], [2365.0, 1.0], [2361.0, 704.0], [2357.0, 529.75], [2353.0, 1.0], [2341.0, 389.33333333333337], [2337.0, 1188.5], [2313.0, 1.75], [2317.0, 263.25], [2329.0, 1125.5], [2333.0, 88.5], [2401.0, 636.75], [2405.0, 1020.0], [2409.0, 232.89999999999998], [2417.0, 1228.0], [2421.0, 1.0], [2425.0, 1.5], [2429.0, 816.0], [2369.0, 1.0], [2373.0, 244.4], [2377.0, 2.0], [2381.0, 1.0], [2393.0, 1.5], [2389.0, 1.0], [2397.0, 2195.0], [2461.0, 1006.0], [2457.0, 568.3], [2453.0, 1025.0], [2489.0, 916.0], [2493.0, 1917.0], [2485.0, 1919.0], [2477.0, 2216.0], [2481.0, 771.0], [2473.0, 431.375], [2469.0, 1066.0], [2437.0, 2197.0], [2441.0, 2.0], [2529.0, 1364.0], [2533.0, 1103.6666666666665], [2537.0, 707.75], [2541.0, 1077.0], [2545.0, 1813.0], [2549.0, 1155.0], [2553.0, 463.0], [2557.0, 932.3333333333333], [2497.0, 1079.0], [2505.0, 5.0], [2509.0, 1088.3333333333335], [2513.0, 2217.0], [2521.0, 690.0], [2517.0, 276.25], [2581.0, 653.8837209302326], [2565.0, 1709.0], [2613.0, 548.0], [2605.0, 289.0], [2601.0, 867.0], [2597.0, 279.0], [2569.0, 2218.0], [2573.0, 669.4901960784312], [2577.0, 2257.0], [2585.0, 1109.5625], [2589.0, 1852.75], [2657.0, 1279.0], [2661.0, 0.0], [2669.0, 2071.1111111111113], [2673.0, 2301.0], [2677.0, 1656.6], [2681.0, 1237.0], [2685.0, 611.0], [2633.0, 528.0], [2637.0, 1681.75], [2641.0, 2436.6666666666665], [2649.0, 795.5], [2709.0, 1006.6666666666667], [2697.0, 1923.3333333333333], [2689.0, 2429.8], [2749.0, 1057.5714285714287], [2729.0, 188.5], [2733.0, 280.5], [2741.0, 1293.0], [2737.0, 363.0], [2721.0, 2133.0], [2725.0, 1101.0], [2693.0, 1970.708333333333], [2705.0, 2774.5], [2713.0, 1513.0], [2717.0, 1479.3333333333333], [2793.0, 2936.0], [2789.0, 1.0], [2785.0, 221.5], [2797.0, 818.75], [2801.0, 2362.999999999999], [2805.0, 243.0], [2809.0, 1197.5], [2761.0, 1012.2000000000002], [2813.0, 559.6666666666666], [2757.0, 0.0], [2765.0, 1.0], [2769.0, 2463.285714285714], [2773.0, 1972.0], [2777.0, 1662.0], [2781.0, 2175.0526315789475], [2833.0, 305.8571428571429], [2821.0, 1719.111111111111], [2817.0, 2181.684931506848], [2873.0, 191.77272727272734], [2861.0, 727.5], [2865.0, 624.0], [2837.0, 1190.0], [2841.0, 373.4], [2845.0, 288.33333333333337], [2825.0, 546.25], [2829.0, 341.6666666666667], [2857.0, 1139.8], [2849.0, 379.0], [2913.0, 5.0], [2917.0, 1093.205882352941], [2921.0, 598.5], [2925.0, 2186.0], [2933.0, 944.0], [2901.0, 571.5], [2889.0, 650.0], [2893.0, 643.0], [2885.0, 529.0], [2957.0, 1174.0], [3057.0, 273.4], [2981.0, 946.0], [2985.0, 1603.6666666666667], [2989.0, 934.0], [2997.0, 1754.5], [3017.0, 940.0], [3021.0, 1.0], [3033.0, 578.5], [3029.0, 1.0], [3061.0, 28.200000000000003], [3053.0, 1.0], [3049.0, 3194.0], [3045.0, 213.33333333333331], [3065.0, 27.333333333333332], [3013.0, 3089.0], [3069.0, 39.0], [3181.0, 2518.5], [3081.0, 1715.6666666666665], [3073.0, 36.0], [3097.0, 240.0], [3109.0, 722.0], [3113.0, 1197.3333333333335], [3157.0, 422.75], [3153.0, 938.6666666666667], [3149.0, 886.3333333333334], [3161.0, 2571.577777777778], [3165.0, 2554.0], [3169.0, 2700.444444444445], [3173.0, 4.0], [3177.0, 905.25], [3193.0, 1363.5], [3137.0, 779.0], [3197.0, 1062.3333333333333], [3209.0, 980.0], [3253.0, 2.0], [3201.0, 768.3333333333333], [3261.0, 576.6521739130434], [3257.0, 464.08333333333326], [3249.0, 12.0], [3245.0, 2063.0], [3241.0, 1013.0], [3233.0, 2079.0], [3237.0, 1.5], [3213.0, 84.66666666666667], [3217.0, 944.0], [3221.0, 3026.0], [3225.0, 3008.0], [3229.0, 192.0], [3297.0, 1095.0], [3273.0, 189.33333333333334], [3277.0, 943.3571428571428], [3281.0, 440.22222222222223], [3285.0, 1405.3333333333335], [3289.0, 803.1176470588236], [3293.0, 1103.6666666666667], [3269.0, 133.66666666666666], [3265.0, 456.6818181818181], [1059.0, 819.0], [1087.0, 468.0], [1083.0, 800.0], [1081.0, 686.0], [1073.0, 575.0], [1045.0, 717.0], [1033.0, 839.0], [1025.0, 727.0], [1071.0, 809.0], [1069.0, 891.0], [1065.0, 485.0], [1057.0, 901.5], [1145.0, 1162.0], [1147.0, 604.0], [1137.0, 952.5], [1133.0, 622.0], [1125.0, 484.0], [1123.0, 751.0], [1121.0, 1196.0], [1103.0, 744.6666666666666], [1101.0, 715.6666666666666], [1097.0, 762.25], [1095.0, 457.0], [1093.0, 494.0], [1091.0, 559.0], [1201.0, 1109.0], [1211.0, 438.0], [1209.0, 655.0], [1207.0, 404.5], [1183.0, 539.25], [1181.0, 1129.0], [1177.0, 688.0], [1169.0, 365.0], [1161.0, 698.0], [1159.0, 566.2], [1273.0, 269.0], [1279.0, 342.5], [1271.0, 428.3333333333333], [1269.0, 771.5], [1267.0, 279.0], [1231.0, 917.0], [1227.0, 416.0], [1217.0, 426.0], [1245.0, 624.0], [1241.0, 521.0], [1261.0, 725.3333333333334], [1255.0, 395.0], [1251.0, 510.0], [1249.0, 463.0], [1337.0, 467.25], [1341.0, 512.0], [1329.0, 657.0], [1295.0, 729.0], [1291.0, 514.25], [1287.0, 468.8], [1281.0, 259.0], [1327.0, 966.0], [1321.0, 238.0], [1317.0, 448.0], [1309.0, 248.0], [1307.0, 721.5], [1305.0, 463.25], [1299.0, 474.25], [1297.0, 353.0], [1403.0, 732.25], [1407.0, 207.0], [1399.0, 174.5], [1397.0, 708.0], [1395.0, 781.2], [1393.0, 146.0], [1375.0, 177.0], [1349.0, 407.0], [1353.0, 195.0], [1351.0, 630.5], [1357.0, 396.0], [1355.0, 1183.0], [1373.0, 258.0], [1367.0, 1174.0], [1365.0, 185.0], [1391.0, 752.25], [1387.0, 155.0], [1385.0, 609.5], [1381.0, 188.5], [1465.0, 556.5882352941176], [1467.0, 527.2857142857143], [1471.0, 374.4166666666667], [1469.0, 418.75], [1459.0, 351.3333333333333], [1461.0, 544.2857142857142], [1463.0, 788.3333333333333], [1439.0, 436.8235294117647], [1413.0, 155.0], [1409.0, 915.0], [1417.0, 588.0], [1415.0, 905.0], [1423.0, 104.0], [1419.0, 610.6666666666666], [1457.0, 459.0], [1455.0, 772.25], [1453.0, 381.85714285714283], [1441.0, 558.1052631578947], [1443.0, 485.6363636363636], [1447.0, 328.93749999999994], [1449.0, 306.5], [1451.0, 400.5], [1445.0, 631.1111111111111], [1437.0, 460.5652173913043], [1435.0, 449.7142857142856], [1433.0, 368.7857142857143], [1427.0, 502.4285714285714], [1431.0, 225.33333333333331], [1429.0, 469.50000000000006], [1485.0, 327.0], [1533.0, 619.4166666666666], [1535.0, 600.4166666666667], [1531.0, 532.5333333333333], [1527.0, 546.1739130434783], [1529.0, 603.2], [1523.0, 385.5507246376811], [1525.0, 396.9600000000001], [1521.0, 365.4117647058823], [1517.0, 397.07692307692315], [1519.0, 558.9761904761906], [1513.0, 495.6440677966101], [1515.0, 516.7288135593221], [1511.0, 441.88607594936707], [1509.0, 370.4054054054055], [1507.0, 429.01694915254245], [1505.0, 376.3714285714286], [1493.0, 381.63888888888897], [1491.0, 361.4090909090909], [1489.0, 307.1111111111112], [1495.0, 367.125], [1473.0, 416.04761904761904], [1499.0, 347.28571428571433], [1501.0, 582.1562499999999], [1503.0, 608.1621621621621], [1497.0, 527.8571428571429], [1477.0, 479.45], [1479.0, 519.2941176470588], [1475.0, 353.18518518518505], [1483.0, 526.3076923076924], [1481.0, 421.1000000000001], [1487.0, 327.84782608695656], [1551.0, 645.6315789473684], [1599.0, 635.4285714285714], [1571.0, 432.2727272727273], [1573.0, 295.4444444444444], [1569.0, 465.5714285714285], [1597.0, 510.14285714285705], [1595.0, 386.74999999999994], [1585.0, 552.4375], [1587.0, 446.7407407407406], [1589.0, 277.4054054054055], [1591.0, 304.32142857142856], [1593.0, 523.0714285714286], [1581.0, 386.3809523809524], [1583.0, 450.66666666666663], [1577.0, 402.0952380952382], [1579.0, 314.3076923076923], [1575.0, 705.0], [1567.0, 589.32], [1561.0, 482.46153846153845], [1565.0, 593.9374999999999], [1563.0, 563.2580645161291], [1557.0, 378.1333333333333], [1559.0, 450.2631578947369], [1553.0, 614.9583333333333], [1555.0, 739.4], [1549.0, 605.2222222222223], [1547.0, 709.0769230769232], [1545.0, 620.1052631578947], [1537.0, 498.8620689655172], [1539.0, 375.38095238095235], [1541.0, 505.96428571428567], [1543.0, 567.076923076923], [1651.0, 719.6666666666666], [1609.0, 702.0], [1641.0, 431.58333333333337], [1639.0, 499.33333333333337], [1655.0, 777.5], [1657.0, 536.3636363636365], [1661.0, 832.75], [1659.0, 414.6666666666667], [1663.0, 286.0], [1633.0, 469.75], [1637.0, 171.75], [1635.0, 150.5], [1649.0, 334.5], [1643.0, 486.3125], [1645.0, 788.5], [1647.0, 724.1428571428571], [1605.0, 676.0], [1601.0, 508.99999999999994], [1603.0, 583.8], [1627.0, 453.4], [1629.0, 522.0], [1625.0, 459.5], [1631.0, 465.4], [1621.0, 113.0], [1623.0, 221.0], [1607.0, 658.25], [1613.0, 594.875], [1611.0, 699.8], [1615.0, 739.1538461538461], [1617.0, 429.5], [1619.0, 649.0], [1715.0, 770.0], [1693.0, 815.0], [1685.0, 180.66666666666666], [1689.0, 1.0], [1681.0, 401.57142857142856], [1683.0, 354.5], [1695.0, 108.0], [1713.0, 1096.3333333333333], [1677.0, 502.3333333333333], [1679.0, 162.5], [1669.0, 548.0], [1673.0, 330.0], [1665.0, 695.5294117647059], [1667.0, 491.0], [1727.0, 1047.0], [1723.0, 1134.090909090909], [1719.0, 1016.5], [1721.0, 419.0], [1725.0, 1045.0], [1697.0, 494.0], [1699.0, 576.1111111111111], [1701.0, 355.0], [1703.0, 422.8333333333333], [1705.0, 569.875], [1709.0, 365.4], [1711.0, 313.2], [1707.0, 480.0], [1785.0, 1167.5], [1747.0, 312.81818181818187], [1745.0, 290.14285714285717], [1781.0, 889.0], [1757.0, 784.0], [1729.0, 39.66666666666667], [1759.0, 3.5], [1735.0, 1.0], [1731.0, 678.0], [1739.0, 445.3333333333333], [1741.0, 1042.0], [1737.0, 1025.0], [1743.0, 674.5], [1763.0, 620.5], [1761.0, 104.8], [1767.0, 85.83333333333333], [1765.0, 59.333333333333336], [1769.0, 1456.6666666666667], [1771.0, 274.45454545454544], [1773.0, 410.00000000000006], [1775.0, 673.0], [1753.0, 422.33333333333337], [1755.0, 465.0], [1843.0, 997.0], [1815.0, 1158.0], [1799.0, 1210.0], [1801.0, 942.0], [1807.0, 952.0], [1841.0, 1182.0], [1849.0, 1388.0], [1855.0, 1051.0], [1825.0, 2011.0], [1829.0, 1068.0], [1835.0, 1544.5], [1811.0, 989.0], [1909.0, 1015.0], [1863.0, 1057.0], [1875.0, 1058.0], [1865.0, 1974.0], [1879.0, 2021.0], [1883.0, 2113.333333333333], [1861.0, 1199.0], [1893.0, 1745.0], [1891.0, 337.0], [1919.0, 0.0], [1915.0, 593.5], [1907.0, 823.0], [1871.0, 820.0], [1899.0, 1041.0], [1903.0, 730.3333333333334], [1901.0, 0.0], [1929.0, 1066.0], [1931.0, 1072.0], [1933.0, 1249.0], [1947.0, 1076.0], [1971.0, 1169.0], [1957.0, 1461.0], [1977.0, 1237.0], [1963.0, 655.0], [1951.0, 1.0], [1921.0, 810.0], [1941.0, 1.0], [2037.0, 1665.0], [1985.0, 968.5], [1987.0, 314.0], [1991.0, 1563.0], [1995.0, 1007.0], [2041.0, 1044.0], [2047.0, 1607.6666666666667], [2021.0, 925.0], [2019.0, 641.0], [2023.0, 1618.25], [2025.0, 24.0], [2027.0, 1611.952380952381], [2011.0, 1518.0], [2003.0, 1152.5], [2062.0, 2061.0], [2058.0, 1199.8333333333333], [2110.0, 1060.25], [2106.0, 1.0], [2102.0, 1.25], [2098.0, 1.0], [2078.0, 2597.0], [2070.0, 1129.5], [2146.0, 1.6], [2150.0, 16.5], [2154.0, 456.7142857142858], [2162.0, 562.0], [2166.0, 357.33333333333337], [2170.0, 1.0], [2114.0, 1.5], [2118.0, 1258.75], [2122.0, 1013.4], [2130.0, 1090.0], [2126.0, 1169.0], [2134.0, 565.8571428571429], [2138.0, 797.5], [2142.0, 1072.5], [2082.0, 338.0], [2086.0, 1111.0], [2198.0, 1365.5], [2190.0, 564.5], [2214.0, 703.3333333333333], [2178.0, 0.0], [2210.0, 813.0], [2182.0, 900.8571428571428], [2290.0, 72.0], [2278.0, 856.0], [2206.0, 1.0], [2202.0, 1055.0], [2298.0, 1.0], [2302.0, 2.0], [2250.0, 422.8], [2258.0, 1706.0], [2266.0, 1.5], [2270.0, 116.00000000000001], [2314.0, 2.0], [2366.0, 757.0], [2362.0, 1072.5], [2358.0, 1.0], [2354.0, 610.0], [2338.0, 770.2857142857142], [2318.0, 535.8333333333333], [2334.0, 1.0], [2406.0, 680.0], [2410.0, 0.8571428571428572], [2422.0, 445.4], [2430.0, 536.5], [2378.0, 1.0], [2390.0, 2.0], [2394.0, 756.3333333333333], [2398.0, 1.0], [2434.0, 1.0], [2482.0, 2202.0], [2486.0, 1078.0], [2490.0, 454.0], [2474.0, 3.3333333333333335], [2530.0, 1111.5], [2462.0, 1.0], [2534.0, 5.0], [2542.0, 7.0], [2546.0, 357.0], [2554.0, 932.5], [2558.0, 1820.0], [2506.0, 1381.3333333333333], [2502.0, 0.0], [2522.0, 1449.0], [2526.0, 296.25], [2510.0, 343.25], [2586.0, 1859.5], [2566.0, 144.0], [2570.0, 356.0], [2594.0, 685.75], [2598.0, 0.0], [2562.0, 244.0], [2614.0, 516.0], [2618.0, 1.0], [2602.0, 410.0], [2574.0, 602.6666666666666], [2578.0, 575.0], [2582.0, 1150.3611111111106], [2658.0, 3268.0], [2642.0, 1153.6666666666667], [2662.0, 222.0], [2670.0, 2378.0], [2674.0, 1494.0], [2678.0, 2788.5], [2682.0, 2459.0], [2686.0, 1663.9230769230771], [2634.0, 249.5], [2638.0, 368.0], [2646.0, 530.0], [2650.0, 3227.0], [2654.0, 408.57142857142856], [2786.0, 0.3333333333333333], [2702.0, 490.5], [2710.0, 1930.0000000000002], [2726.0, 345.0], [2730.0, 2178.0], [2722.0, 74.39999999999999], [2698.0, 1394.0], [2694.0, 0.6666666666666666], [2742.0, 290.5], [2746.0, 0.6666666666666666], [2734.0, 1.0], [2738.0, 0.75], [2706.0, 1438.5], [2718.0, 2091.5], [2790.0, 403.8333333333333], [2794.0, 238.66666666666666], [2798.0, 382.125], [2802.0, 650.0], [2754.0, 1796.0], [2758.0, 1027.3333333333335], [2762.0, 146.0], [2810.0, 463.4166666666667], [2814.0, 2879.0], [2766.0, 1672.3333333333335], [2770.0, 1648.0], [2774.0, 2253.5555555555557], [2778.0, 326.5], [2782.0, 313.0], [2834.0, 1848.8518518518517], [2826.0, 413.0666666666666], [2822.0, 205.3076923076923], [2818.0, 0.0], [2830.0, 474.0], [2870.0, 905.0], [2866.0, 487.66666666666663], [2874.0, 101.7222222222222], [2838.0, 2213.0], [2846.0, 541.0], [2918.0, 578.5], [2926.0, 945.3], [2930.0, 273.0], [2934.0, 9.0], [2942.0, 3221.0], [2882.0, 1064.4], [2886.0, 712.6666666666666], [2890.0, 753.6666666666666], [2894.0, 905.0], [2902.0, 1063.1666666666665], [2906.0, 2359.5], [2910.0, 1720.0], [2898.0, 645.5], [2850.0, 825.0], [2854.0, 261.0], [2858.0, 908.888888888889], [3046.0, 1.0], [2958.0, 928.0], [2970.0, 930.0], [3042.0, 0.0], [3050.0, 1009.3333333333334], [3062.0, 297.3333333333333], [3066.0, 193.15], [2982.0, 951.0], [3070.0, 36.0], [3022.0, 854.25], [3174.0, 2577.25], [3082.0, 994.0], [3090.0, 3159.0], [3170.0, 2995.0], [3186.0, 88.0], [3190.0, 92.5], [3198.0, 5.0], [3150.0, 1516.0], [3194.0, 4.5], [3110.0, 2039.6], [3106.0, 3173.0], [3074.0, 37.0], [3158.0, 648.1176470588235], [3162.0, 2710.0], [3166.0, 2863.0], [3226.0, 3026.0], [3262.0, 584.7647058823529], [3202.0, 31.0], [3258.0, 421.20000000000005], [3254.0, 98.11428571428574], [3246.0, 4.0], [3230.0, 2887.0], [3266.0, 827.2307692307694], [3270.0, 8.666666666666666], [3274.0, 115.33333333333334], [3278.0, 843.8235294117648], [3282.0, 393.0], [3290.0, 955.2777777777778], [3286.0, 449.0], [3294.0, 1633.5714285714284], [3238.0, 505.3749999999999], [3242.0, 608.3333333333334], [2071.0, 1268.6666666666667], [2051.0, 1211.0], [2107.0, 559.5], [2099.0, 1129.0], [2087.0, 878.0], [2067.0, 1385.3333333333333], [2063.0, 4015.0], [2167.0, 1.0], [2163.0, 1083.0], [2147.0, 137.9], [2075.0, 1015.0], [2171.0, 614.0], [2131.0, 486.875], [2127.0, 660.5], [2119.0, 585.0], [2143.0, 1.0], [2191.0, 520.0], [2199.0, 1.3333333333333335], [2231.0, 1815.0], [2219.0, 583.4000000000001], [2215.0, 786.0], [2187.0, 1047.0], [2203.0, 1847.0], [2207.0, 538.5], [2275.0, 263.33333333333337], [2295.0, 2089.0], [2299.0, 608.8571428571429], [2243.0, 1048.0], [2247.0, 678.6666666666666], [2255.0, 516.0], [2251.0, 1044.0], [2267.0, 2.0], [2263.0, 1.0], [2335.0, 1.0], [2331.0, 344.77777777777777], [2327.0, 0.0], [2363.0, 61.0], [2359.0, 2.0], [2351.0, 1068.5], [2343.0, 1059.0], [2307.0, 1231.3333333333335], [2315.0, 2.0], [2319.0, 1.0], [2323.0, 1.0], [2403.0, 1067.0], [2407.0, 1.0], [2423.0, 186.0], [2419.0, 564.0], [2427.0, 1.0], [2431.0, 1.0], [2371.0, 1.5], [2375.0, 1169.0], [2383.0, 325.0], [2387.0, 442.2], [2399.0, 226.0], [2543.0, 6.0], [2439.0, 908.1428571428571], [2475.0, 22.799999999999997], [2471.0, 1.0], [2491.0, 503.0], [2539.0, 567.5], [2555.0, 1368.4], [2559.0, 831.6666666666667], [2531.0, 1185.0], [2463.0, 1088.0], [2503.0, 6.0], [2507.0, 0.0], [2511.0, 833.3333333333334], [2527.0, 1246.0], [2571.0, 552.6923076923076], [2567.0, 3397.0], [2563.0, 1283.0], [2615.0, 216.0], [2623.0, 502.0], [2611.0, 552.5], [2607.0, 1438.5], [2603.0, 1453.5], [2599.0, 65.5], [2595.0, 1583.75], [2575.0, 1551.0], [2579.0, 156.66666666666666], [2583.0, 1061.081081081081], [2587.0, 1447.8214285714287], [2659.0, 552.0], [2663.0, 1303.0], [2667.0, 1663.7777777777778], [2671.0, 2257.9375], [2675.0, 2682.0], [2679.0, 1360.25], [2683.0, 2069.7142857142853], [2687.0, 1972.0], [2627.0, 1451.0], [2635.0, 602.0], [2639.0, 1680.0], [2651.0, 1992.0], [2655.0, 484.5], [2647.0, 603.0], [2707.0, 1928.8333333333333], [2691.0, 2089.0], [2743.0, 437.4], [2747.0, 156.16666666666666], [2751.0, 346.66666666666663], [2735.0, 1.0], [2739.0, 432.0], [2731.0, 128.0], [2727.0, 1.0], [2723.0, 1369.3333333333333], [2695.0, 311.5], [2703.0, 2444.222222222222], [2699.0, 523.0], [2711.0, 1897.0000000000005], [2719.0, 265.0], [2787.0, 450.1428571428571], [2791.0, 0.0], [2795.0, 102.66666666666666], [2799.0, 0.0], [2803.0, 1.0], [2715.0, 571.0], [2807.0, 3256.0], [2815.0, 1969.135135135136], [2811.0, 392.2], [2755.0, 1836.3], [2767.0, 2258.222222222222], [2759.0, 302.5], [2771.0, 588.1666666666666], [2775.0, 1754.0], [2779.0, 1.0], [2827.0, 451.49999999999994], [2859.0, 663.1666666666666], [2863.0, 844.0], [2855.0, 857.0], [2867.0, 1034.1666666666667], [2875.0, 329.4], [2871.0, 89.0], [2819.0, 305.1666666666667], [2823.0, 1326.25], [2883.0, 723.0], [2887.0, 1792.6], [2891.0, 3359.0], [2923.0, 695.5000000000001], [2931.0, 848.0], [2915.0, 2023.0], [2831.0, 558.4], [2835.0, 196.6], [2839.0, 649.0], [2843.0, 853.0], [2847.0, 883.0], [2903.0, 268.5], [2911.0, 650.0], [2895.0, 907.5], [2975.0, 2602.0], [2995.0, 927.5], [2999.0, 2958.0], [2951.0, 220.0], [3015.0, 942.0], [3023.0, 3212.0], [3063.0, 48.49999999999999], [3051.0, 31.428571428571427], [3047.0, 1.0], [3071.0, 11.5], [3067.0, 17.666666666666668], [3099.0, 1910.5], [3139.0, 2913.0], [3115.0, 2962.0], [3119.0, 87.0], [3123.0, 2895.5], [3127.0, 1686.3333333333335], [3155.0, 1971.5], [3151.0, 1597.5], [3159.0, 2310.333333333333], [3163.0, 2977.0], [3167.0, 2653.3], [3171.0, 564.8181818181819], [3175.0, 2113.8750000000005], [3179.0, 810.0], [3183.0, 3006.0], [3191.0, 3007.0], [3199.0, 21.0], [3195.0, 48.374999999999986], [3263.0, 425.4], [3215.0, 950.0], [3259.0, 286.55555555555554], [3255.0, 592.7857142857143], [3251.0, 2.0], [3247.0, 78.45454545454544], [3239.0, 2.0], [3207.0, 191.0], [3211.0, 20.0], [3223.0, 640.5], [3271.0, 1833.6], [3279.0, 579.1818181818181], [3283.0, 1020.125], [3287.0, 1378.4], [3291.0, 819.3], [3295.0, 1105.0], [3275.0, 100.5], [3267.0, 1062.5]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[2023.5628999999865, 706.0777000000029]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 3297.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 65102.55, "minX": 1.5252405E12, "maxY": 989945.9833333333, "series": [{"data": [[1.5252405E12, 989945.9833333333], [1.52524056E12, 117529.83333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5252405E12, 817358.5], [1.52524056E12, 65102.55]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524056E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 648.2299854439589, "minX": 1.5252405E12, "maxY": 710.345001610655, "series": [{"data": [[1.5252405E12, 710.345001610655], [1.52524056E12, 648.2299854439589]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524056E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 524.7245785461181, "minX": 1.5252405E12, "maxY": 648.2227074235805, "series": [{"data": [[1.5252405E12, 524.7245785461181], [1.52524056E12, 648.2227074235805]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524056E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.16302765647743805, "minX": 1.5252405E12, "maxY": 289.27091162890645, "series": [{"data": [[1.5252405E12, 289.27091162890645], [1.52524056E12, 0.16302765647743805]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524056E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 16.0, "minX": 1.5252405E12, "maxY": 4209.0, "series": [{"data": [[1.5252405E12, 4209.0], [1.52524056E12, 1363.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5252405E12, 16.0], [1.52524056E12, 56.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5252405E12, 1306.0], [1.52524056E12, 1261.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5252405E12, 3183.199999999999], [1.52524056E12, 3167.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5252405E12, 2184.5], [1.52524056E12, 2077.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524056E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 1.0, "minX": 11.0, "maxY": 768.0, "series": [{"data": [[155.0, 768.0], [11.0, 682.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[155.0, 1.0], [11.0, 1.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 155.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 1.0, "minX": 11.0, "maxY": 768.0, "series": [{"data": [[155.0, 768.0], [11.0, 682.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[155.0, 1.0], [11.0, 1.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 155.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 4.85, "minX": 1.5252405E12, "maxY": 161.81666666666666, "series": [{"data": [[1.5252405E12, 161.81666666666666], [1.52524056E12, 4.85]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524056E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.5252405E12, "maxY": 85.48333333333333, "series": [{"data": [[1.5252405E12, 85.48333333333333], [1.52524056E12, 10.7]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.5252405E12, 58.266666666666666], [1.52524056E12, 0.75]], "isOverall": false, "label": "502", "isController": false}, {"data": [[1.5252405E12, 0.016666666666666666]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.NoHttpResponseException", "isController": false}, {"data": [[1.5252405E12, 11.45]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524056E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.75, "minX": 1.5252405E12, "maxY": 85.48333333333333, "series": [{"data": [[1.5252405E12, 85.48333333333333], [1.52524056E12, 10.7]], "isOverall": false, "label": "inference-success", "isController": false}, {"data": [[1.5252405E12, 69.73333333333333], [1.52524056E12, 0.75]], "isOverall": false, "label": "inference-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524056E12, "title": "Transactions Per Second"}},
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
