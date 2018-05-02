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
        data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 3047.0, "series": [{"data": [[0.0, 0.0], [0.1, 0.0], [0.2, 0.0], [0.3, 0.0], [0.4, 0.0], [0.5, 0.0], [0.6, 0.0], [0.7, 0.0], [0.8, 0.0], [0.9, 0.0], [1.0, 0.0], [1.1, 0.0], [1.2, 0.0], [1.3, 0.0], [1.4, 0.0], [1.5, 0.0], [1.6, 0.0], [1.7, 0.0], [1.8, 0.0], [1.9, 0.0], [2.0, 0.0], [2.1, 0.0], [2.2, 0.0], [2.3, 0.0], [2.4, 0.0], [2.5, 0.0], [2.6, 0.0], [2.7, 0.0], [2.8, 0.0], [2.9, 0.0], [3.0, 0.0], [3.1, 0.0], [3.2, 0.0], [3.3, 0.0], [3.4, 0.0], [3.5, 0.0], [3.6, 0.0], [3.7, 0.0], [3.8, 0.0], [3.9, 0.0], [4.0, 0.0], [4.1, 0.0], [4.2, 0.0], [4.3, 0.0], [4.4, 0.0], [4.5, 0.0], [4.6, 0.0], [4.7, 0.0], [4.8, 0.0], [4.9, 0.0], [5.0, 0.0], [5.1, 0.0], [5.2, 0.0], [5.3, 0.0], [5.4, 0.0], [5.5, 0.0], [5.6, 0.0], [5.7, 0.0], [5.8, 0.0], [5.9, 0.0], [6.0, 0.0], [6.1, 0.0], [6.2, 0.0], [6.3, 0.0], [6.4, 0.0], [6.5, 0.0], [6.6, 0.0], [6.7, 0.0], [6.8, 0.0], [6.9, 0.0], [7.0, 0.0], [7.1, 0.0], [7.2, 0.0], [7.3, 0.0], [7.4, 0.0], [7.5, 0.0], [7.6, 0.0], [7.7, 0.0], [7.8, 0.0], [7.9, 0.0], [8.0, 0.0], [8.1, 0.0], [8.2, 0.0], [8.3, 0.0], [8.4, 0.0], [8.5, 0.0], [8.6, 0.0], [8.7, 0.0], [8.8, 0.0], [8.9, 0.0], [9.0, 0.0], [9.1, 0.0], [9.2, 0.0], [9.3, 0.0], [9.4, 1.0], [9.5, 1.0], [9.6, 1.0], [9.7, 1.0], [9.8, 1.0], [9.9, 1.0], [10.0, 1.0], [10.1, 1.0], [10.2, 1.0], [10.3, 1.0], [10.4, 1.0], [10.5, 1.0], [10.6, 1.0], [10.7, 1.0], [10.8, 1.0], [10.9, 1.0], [11.0, 1.0], [11.1, 1.0], [11.2, 1.0], [11.3, 1.0], [11.4, 1.0], [11.5, 1.0], [11.6, 1.0], [11.7, 1.0], [11.8, 1.0], [11.9, 1.0], [12.0, 1.0], [12.1, 1.0], [12.2, 1.0], [12.3, 1.0], [12.4, 1.0], [12.5, 1.0], [12.6, 1.0], [12.7, 1.0], [12.8, 1.0], [12.9, 1.0], [13.0, 1.0], [13.1, 1.0], [13.2, 1.0], [13.3, 1.0], [13.4, 1.0], [13.5, 1.0], [13.6, 1.0], [13.7, 1.0], [13.8, 1.0], [13.9, 1.0], [14.0, 1.0], [14.1, 1.0], [14.2, 1.0], [14.3, 1.0], [14.4, 1.0], [14.5, 1.0], [14.6, 1.0], [14.7, 1.0], [14.8, 1.0], [14.9, 1.0], [15.0, 1.0], [15.1, 1.0], [15.2, 1.0], [15.3, 1.0], [15.4, 1.0], [15.5, 1.0], [15.6, 1.0], [15.7, 1.0], [15.8, 1.0], [15.9, 1.0], [16.0, 1.0], [16.1, 1.0], [16.2, 1.0], [16.3, 1.0], [16.4, 1.0], [16.5, 1.0], [16.6, 1.0], [16.7, 1.0], [16.8, 1.0], [16.9, 1.0], [17.0, 1.0], [17.1, 1.0], [17.2, 1.0], [17.3, 1.0], [17.4, 1.0], [17.5, 1.0], [17.6, 1.0], [17.7, 1.0], [17.8, 1.0], [17.9, 1.0], [18.0, 1.0], [18.1, 1.0], [18.2, 1.0], [18.3, 1.0], [18.4, 1.0], [18.5, 1.0], [18.6, 1.0], [18.7, 1.0], [18.8, 1.0], [18.9, 1.0], [19.0, 1.0], [19.1, 1.0], [19.2, 1.0], [19.3, 1.0], [19.4, 1.0], [19.5, 1.0], [19.6, 1.0], [19.7, 1.0], [19.8, 1.0], [19.9, 1.0], [20.0, 1.0], [20.1, 1.0], [20.2, 1.0], [20.3, 1.0], [20.4, 1.0], [20.5, 1.0], [20.6, 1.0], [20.7, 1.0], [20.8, 1.0], [20.9, 1.0], [21.0, 1.0], [21.1, 1.0], [21.2, 1.0], [21.3, 1.0], [21.4, 1.0], [21.5, 1.0], [21.6, 1.0], [21.7, 1.0], [21.8, 1.0], [21.9, 1.0], [22.0, 1.0], [22.1, 1.0], [22.2, 1.0], [22.3, 1.0], [22.4, 2.0], [22.5, 2.0], [22.6, 2.0], [22.7, 2.0], [22.8, 2.0], [22.9, 2.0], [23.0, 2.0], [23.1, 2.0], [23.2, 2.0], [23.3, 2.0], [23.4, 3.0], [23.5, 3.0], [23.6, 3.0], [23.7, 3.0], [23.8, 4.0], [23.9, 5.0], [24.0, 5.0], [24.1, 6.0], [24.2, 6.0], [24.3, 9.0], [24.4, 9.0], [24.5, 11.0], [24.6, 11.0], [24.7, 13.0], [24.8, 15.0], [24.9, 16.0], [25.0, 16.0], [25.1, 24.0], [25.2, 29.0], [25.3, 31.0], [25.4, 39.0], [25.5, 42.0], [25.6, 48.0], [25.7, 57.0], [25.8, 69.0], [25.9, 73.0], [26.0, 77.0], [26.1, 82.0], [26.2, 88.0], [26.3, 95.0], [26.4, 102.0], [26.5, 104.0], [26.6, 109.0], [26.7, 113.0], [26.8, 117.0], [26.9, 122.0], [27.0, 126.0], [27.1, 129.0], [27.2, 132.0], [27.3, 134.0], [27.4, 135.0], [27.5, 138.0], [27.6, 141.0], [27.7, 142.0], [27.8, 143.0], [27.9, 145.0], [28.0, 148.0], [28.1, 149.0], [28.2, 151.0], [28.3, 152.0], [28.4, 153.0], [28.5, 154.0], [28.6, 155.0], [28.7, 157.0], [28.8, 161.0], [28.9, 164.0], [29.0, 165.0], [29.1, 168.0], [29.2, 172.0], [29.3, 175.0], [29.4, 178.0], [29.5, 182.0], [29.6, 185.0], [29.7, 188.0], [29.8, 192.0], [29.9, 194.0], [30.0, 197.0], [30.1, 202.0], [30.2, 203.0], [30.3, 205.0], [30.4, 207.0], [30.5, 210.0], [30.6, 212.0], [30.7, 215.0], [30.8, 218.0], [30.9, 222.0], [31.0, 224.0], [31.1, 228.0], [31.2, 231.0], [31.3, 234.0], [31.4, 237.0], [31.5, 242.0], [31.6, 244.0], [31.7, 246.0], [31.8, 249.0], [31.9, 253.0], [32.0, 255.0], [32.1, 257.0], [32.2, 259.0], [32.3, 263.0], [32.4, 265.0], [32.5, 267.0], [32.6, 269.0], [32.7, 272.0], [32.8, 275.0], [32.9, 277.0], [33.0, 279.0], [33.1, 283.0], [33.2, 285.0], [33.3, 287.0], [33.4, 289.0], [33.5, 291.0], [33.6, 294.0], [33.7, 296.0], [33.8, 299.0], [33.9, 301.0], [34.0, 304.0], [34.1, 305.0], [34.2, 307.0], [34.3, 309.0], [34.4, 311.0], [34.5, 314.0], [34.6, 316.0], [34.7, 318.0], [34.8, 320.0], [34.9, 323.0], [35.0, 325.0], [35.1, 326.0], [35.2, 328.0], [35.3, 329.0], [35.4, 330.0], [35.5, 331.0], [35.6, 332.0], [35.7, 333.0], [35.8, 334.0], [35.9, 336.0], [36.0, 337.0], [36.1, 338.0], [36.2, 339.0], [36.3, 340.0], [36.4, 341.0], [36.5, 342.0], [36.6, 343.0], [36.7, 344.0], [36.8, 344.0], [36.9, 346.0], [37.0, 347.0], [37.1, 349.0], [37.2, 349.0], [37.3, 350.0], [37.4, 351.0], [37.5, 352.0], [37.6, 354.0], [37.7, 355.0], [37.8, 357.0], [37.9, 358.0], [38.0, 360.0], [38.1, 362.0], [38.2, 363.0], [38.3, 364.0], [38.4, 366.0], [38.5, 368.0], [38.6, 370.0], [38.7, 371.0], [38.8, 373.0], [38.9, 374.0], [39.0, 376.0], [39.1, 379.0], [39.2, 381.0], [39.3, 382.0], [39.4, 384.0], [39.5, 386.0], [39.6, 387.0], [39.7, 390.0], [39.8, 391.0], [39.9, 393.0], [40.0, 395.0], [40.1, 396.0], [40.2, 397.0], [40.3, 398.0], [40.4, 400.0], [40.5, 402.0], [40.6, 404.0], [40.7, 406.0], [40.8, 407.0], [40.9, 409.0], [41.0, 411.0], [41.1, 412.0], [41.2, 415.0], [41.3, 417.0], [41.4, 418.0], [41.5, 419.0], [41.6, 421.0], [41.7, 423.0], [41.8, 426.0], [41.9, 428.0], [42.0, 430.0], [42.1, 432.0], [42.2, 433.0], [42.3, 435.0], [42.4, 437.0], [42.5, 438.0], [42.6, 440.0], [42.7, 440.0], [42.8, 442.0], [42.9, 444.0], [43.0, 445.0], [43.1, 448.0], [43.2, 449.0], [43.3, 451.0], [43.4, 452.0], [43.5, 454.0], [43.6, 456.0], [43.7, 459.0], [43.8, 461.0], [43.9, 462.0], [44.0, 463.0], [44.1, 464.0], [44.2, 467.0], [44.3, 469.0], [44.4, 472.0], [44.5, 474.0], [44.6, 475.0], [44.7, 476.0], [44.8, 477.0], [44.9, 479.0], [45.0, 481.0], [45.1, 483.0], [45.2, 484.0], [45.3, 486.0], [45.4, 488.0], [45.5, 490.0], [45.6, 491.0], [45.7, 493.0], [45.8, 496.0], [45.9, 497.0], [46.0, 499.0], [46.1, 501.0], [46.2, 502.0], [46.3, 504.0], [46.4, 506.0], [46.5, 508.0], [46.6, 509.0], [46.7, 511.0], [46.8, 513.0], [46.9, 515.0], [47.0, 516.0], [47.1, 519.0], [47.2, 521.0], [47.3, 523.0], [47.4, 525.0], [47.5, 527.0], [47.6, 528.0], [47.7, 531.0], [47.8, 533.0], [47.9, 535.0], [48.0, 537.0], [48.1, 538.0], [48.2, 540.0], [48.3, 542.0], [48.4, 543.0], [48.5, 545.0], [48.6, 546.0], [48.7, 548.0], [48.8, 550.0], [48.9, 552.0], [49.0, 554.0], [49.1, 557.0], [49.2, 558.0], [49.3, 560.0], [49.4, 562.0], [49.5, 563.0], [49.6, 565.0], [49.7, 567.0], [49.8, 568.0], [49.9, 571.0], [50.0, 572.0], [50.1, 574.0], [50.2, 577.0], [50.3, 579.0], [50.4, 580.0], [50.5, 582.0], [50.6, 584.0], [50.7, 586.0], [50.8, 588.0], [50.9, 590.0], [51.0, 592.0], [51.1, 594.0], [51.2, 595.0], [51.3, 598.0], [51.4, 601.0], [51.5, 603.0], [51.6, 604.0], [51.7, 605.0], [51.8, 607.0], [51.9, 609.0], [52.0, 611.0], [52.1, 613.0], [52.2, 614.0], [52.3, 615.0], [52.4, 617.0], [52.5, 620.0], [52.6, 622.0], [52.7, 625.0], [52.8, 626.0], [52.9, 628.0], [53.0, 631.0], [53.1, 633.0], [53.2, 636.0], [53.3, 637.0], [53.4, 639.0], [53.5, 641.0], [53.6, 645.0], [53.7, 647.0], [53.8, 649.0], [53.9, 650.0], [54.0, 652.0], [54.1, 654.0], [54.2, 657.0], [54.3, 659.0], [54.4, 660.0], [54.5, 662.0], [54.6, 664.0], [54.7, 667.0], [54.8, 670.0], [54.9, 672.0], [55.0, 674.0], [55.1, 676.0], [55.2, 678.0], [55.3, 680.0], [55.4, 682.0], [55.5, 685.0], [55.6, 686.0], [55.7, 689.0], [55.8, 692.0], [55.9, 693.0], [56.0, 695.0], [56.1, 697.0], [56.2, 700.0], [56.3, 702.0], [56.4, 705.0], [56.5, 707.0], [56.6, 709.0], [56.7, 711.0], [56.8, 714.0], [56.9, 716.0], [57.0, 718.0], [57.1, 721.0], [57.2, 723.0], [57.3, 727.0], [57.4, 729.0], [57.5, 731.0], [57.6, 733.0], [57.7, 736.0], [57.8, 738.0], [57.9, 740.0], [58.0, 741.0], [58.1, 743.0], [58.2, 745.0], [58.3, 748.0], [58.4, 750.0], [58.5, 751.0], [58.6, 755.0], [58.7, 757.0], [58.8, 759.0], [58.9, 761.0], [59.0, 763.0], [59.1, 767.0], [59.2, 769.0], [59.3, 771.0], [59.4, 773.0], [59.5, 775.0], [59.6, 778.0], [59.7, 781.0], [59.8, 783.0], [59.9, 785.0], [60.0, 788.0], [60.1, 791.0], [60.2, 793.0], [60.3, 795.0], [60.4, 797.0], [60.5, 800.0], [60.6, 802.0], [60.7, 806.0], [60.8, 806.0], [60.9, 809.0], [61.0, 812.0], [61.1, 814.0], [61.2, 817.0], [61.3, 818.0], [61.4, 822.0], [61.5, 824.0], [61.6, 826.0], [61.7, 828.0], [61.8, 831.0], [61.9, 834.0], [62.0, 836.0], [62.1, 839.0], [62.2, 842.0], [62.3, 845.0], [62.4, 847.0], [62.5, 849.0], [62.6, 851.0], [62.7, 853.0], [62.8, 856.0], [62.9, 859.0], [63.0, 861.0], [63.1, 866.0], [63.2, 869.0], [63.3, 871.0], [63.4, 873.0], [63.5, 876.0], [63.6, 878.0], [63.7, 880.0], [63.8, 881.0], [63.9, 883.0], [64.0, 886.0], [64.1, 888.0], [64.2, 889.0], [64.3, 891.0], [64.4, 893.0], [64.5, 894.0], [64.6, 896.0], [64.7, 898.0], [64.8, 900.0], [64.9, 901.0], [65.0, 904.0], [65.1, 906.0], [65.2, 909.0], [65.3, 910.0], [65.4, 912.0], [65.5, 915.0], [65.6, 917.0], [65.7, 918.0], [65.8, 921.0], [65.9, 922.0], [66.0, 923.0], [66.1, 925.0], [66.2, 926.0], [66.3, 927.0], [66.4, 928.0], [66.5, 931.0], [66.6, 932.0], [66.7, 934.0], [66.8, 936.0], [66.9, 937.0], [67.0, 938.0], [67.1, 939.0], [67.2, 941.0], [67.3, 943.0], [67.4, 945.0], [67.5, 947.0], [67.6, 948.0], [67.7, 949.0], [67.8, 952.0], [67.9, 954.0], [68.0, 956.0], [68.1, 958.0], [68.2, 959.0], [68.3, 962.0], [68.4, 965.0], [68.5, 969.0], [68.6, 972.0], [68.7, 974.0], [68.8, 978.0], [68.9, 979.0], [69.0, 981.0], [69.1, 982.0], [69.2, 984.0], [69.3, 986.0], [69.4, 989.0], [69.5, 991.0], [69.6, 993.0], [69.7, 994.0], [69.8, 999.0], [69.9, 1001.0], [70.0, 1003.0], [70.1, 1007.0], [70.2, 1010.0], [70.3, 1012.0], [70.4, 1014.0], [70.5, 1015.0], [70.6, 1017.0], [70.7, 1019.0], [70.8, 1021.0], [70.9, 1022.0], [71.0, 1025.0], [71.1, 1027.0], [71.2, 1028.0], [71.3, 1029.0], [71.4, 1031.0], [71.5, 1033.0], [71.6, 1036.0], [71.7, 1037.0], [71.8, 1039.0], [71.9, 1040.0], [72.0, 1041.0], [72.1, 1043.0], [72.2, 1045.0], [72.3, 1047.0], [72.4, 1049.0], [72.5, 1050.0], [72.6, 1051.0], [72.7, 1053.0], [72.8, 1054.0], [72.9, 1055.0], [73.0, 1056.0], [73.1, 1058.0], [73.2, 1059.0], [73.3, 1061.0], [73.4, 1062.0], [73.5, 1063.0], [73.6, 1064.0], [73.7, 1065.0], [73.8, 1066.0], [73.9, 1068.0], [74.0, 1070.0], [74.1, 1071.0], [74.2, 1072.0], [74.3, 1072.0], [74.4, 1074.0], [74.5, 1075.0], [74.6, 1076.0], [74.7, 1078.0], [74.8, 1080.0], [74.9, 1081.0], [75.0, 1083.0], [75.1, 1084.0], [75.2, 1086.0], [75.3, 1088.0], [75.4, 1089.0], [75.5, 1090.0], [75.6, 1092.0], [75.7, 1093.0], [75.8, 1094.0], [75.9, 1094.0], [76.0, 1096.0], [76.1, 1097.0], [76.2, 1098.0], [76.3, 1099.0], [76.4, 1102.0], [76.5, 1103.0], [76.6, 1104.0], [76.7, 1105.0], [76.8, 1107.0], [76.9, 1109.0], [77.0, 1110.0], [77.1, 1112.0], [77.2, 1114.0], [77.3, 1115.0], [77.4, 1116.0], [77.5, 1117.0], [77.6, 1119.0], [77.7, 1121.0], [77.8, 1125.0], [77.9, 1126.0], [78.0, 1129.0], [78.1, 1132.0], [78.2, 1134.0], [78.3, 1135.0], [78.4, 1137.0], [78.5, 1138.0], [78.6, 1139.0], [78.7, 1140.0], [78.8, 1142.0], [78.9, 1144.0], [79.0, 1145.0], [79.1, 1146.0], [79.2, 1148.0], [79.3, 1148.0], [79.4, 1149.0], [79.5, 1152.0], [79.6, 1153.0], [79.7, 1154.0], [79.8, 1156.0], [79.9, 1158.0], [80.0, 1159.0], [80.1, 1161.0], [80.2, 1163.0], [80.3, 1163.0], [80.4, 1164.0], [80.5, 1166.0], [80.6, 1168.0], [80.7, 1169.0], [80.8, 1171.0], [80.9, 1173.0], [81.0, 1176.0], [81.1, 1177.0], [81.2, 1178.0], [81.3, 1179.0], [81.4, 1180.0], [81.5, 1182.0], [81.6, 1184.0], [81.7, 1186.0], [81.8, 1188.0], [81.9, 1190.0], [82.0, 1193.0], [82.1, 1195.0], [82.2, 1199.0], [82.3, 1202.0], [82.4, 1204.0], [82.5, 1207.0], [82.6, 1212.0], [82.7, 1215.0], [82.8, 1218.0], [82.9, 1223.0], [83.0, 1227.0], [83.1, 1232.0], [83.2, 1235.0], [83.3, 1239.0], [83.4, 1243.0], [83.5, 1246.0], [83.6, 1249.0], [83.7, 1254.0], [83.8, 1259.0], [83.9, 1264.0], [84.0, 1273.0], [84.1, 1278.0], [84.2, 1284.0], [84.3, 1288.0], [84.4, 1294.0], [84.5, 1296.0], [84.6, 1300.0], [84.7, 1304.0], [84.8, 1306.0], [84.9, 1311.0], [85.0, 1315.0], [85.1, 1323.0], [85.2, 1329.0], [85.3, 1335.0], [85.4, 1338.0], [85.5, 1346.0], [85.6, 1352.0], [85.7, 1358.0], [85.8, 1365.0], [85.9, 1373.0], [86.0, 1380.0], [86.1, 1396.0], [86.2, 1410.0], [86.3, 1422.0], [86.4, 1438.0], [86.5, 1453.0], [86.6, 1494.0], [86.7, 1515.0], [86.8, 1559.0], [86.9, 1578.0], [87.0, 1615.0], [87.1, 1641.0], [87.2, 1658.0], [87.3, 1670.0], [87.4, 1679.0], [87.5, 1688.0], [87.6, 1694.0], [87.7, 1703.0], [87.8, 1715.0], [87.9, 1728.0], [88.0, 1759.0], [88.1, 1764.0], [88.2, 1769.0], [88.3, 1774.0], [88.4, 1788.0], [88.5, 1813.0], [88.6, 1820.0], [88.7, 1838.0], [88.8, 1840.0], [88.9, 1843.0], [89.0, 1844.0], [89.1, 1847.0], [89.2, 1851.0], [89.3, 1856.0], [89.4, 1861.0], [89.5, 1865.0], [89.6, 1872.0], [89.7, 1879.0], [89.8, 1887.0], [89.9, 1911.0], [90.0, 1919.0], [90.1, 1935.0], [90.2, 1947.0], [90.3, 1954.0], [90.4, 1967.0], [90.5, 1980.0], [90.6, 1996.0], [90.7, 2002.0], [90.8, 2006.0], [90.9, 2017.0], [91.0, 2028.0], [91.1, 2033.0], [91.2, 2039.0], [91.3, 2046.0], [91.4, 2052.0], [91.5, 2071.0], [91.6, 2095.0], [91.7, 2148.0], [91.8, 2162.0], [91.9, 2198.0], [92.0, 2212.0], [92.1, 2219.0], [92.2, 2250.0], [92.3, 2264.0], [92.4, 2279.0], [92.5, 2292.0], [92.6, 2302.0], [92.7, 2309.0], [92.8, 2316.0], [92.9, 2327.0], [93.0, 2344.0], [93.1, 2360.0], [93.2, 2383.0], [93.3, 2396.0], [93.4, 2405.0], [93.5, 2435.0], [93.6, 2454.0], [93.7, 2470.0], [93.8, 2477.0], [93.9, 2483.0], [94.0, 2489.0], [94.1, 2501.0], [94.2, 2510.0], [94.3, 2525.0], [94.4, 2535.0], [94.5, 2539.0], [94.6, 2543.0], [94.7, 2546.0], [94.8, 2551.0], [94.9, 2562.0], [95.0, 2576.0], [95.1, 2589.0], [95.2, 2608.0], [95.3, 2625.0], [95.4, 2636.0], [95.5, 2649.0], [95.6, 2654.0], [95.7, 2659.0], [95.8, 2664.0], [95.9, 2673.0], [96.0, 2683.0], [96.1, 2692.0], [96.2, 2695.0], [96.3, 2696.0], [96.4, 2700.0], [96.5, 2705.0], [96.6, 2712.0], [96.7, 2716.0], [96.8, 2725.0], [96.9, 2729.0], [97.0, 2734.0], [97.1, 2738.0], [97.2, 2741.0], [97.3, 2743.0], [97.4, 2747.0], [97.5, 2754.0], [97.6, 2756.0], [97.7, 2763.0], [97.8, 2768.0], [97.9, 2771.0], [98.0, 2773.0], [98.1, 2775.0], [98.2, 2776.0], [98.3, 2779.0], [98.4, 2784.0], [98.5, 2785.0], [98.6, 2791.0], [98.7, 2799.0], [98.8, 2810.0], [98.9, 2814.0], [99.0, 2816.0], [99.1, 2818.0], [99.2, 2820.0], [99.3, 2823.0], [99.4, 2825.0], [99.5, 2828.0], [99.6, 2834.0], [99.7, 2845.0], [99.8, 2853.0], [99.9, 2864.0], [100.0, 3047.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 2636.0, "series": [{"data": [[0.0, 2636.0], [600.0, 481.0], [700.0, 430.0], [800.0, 431.0], [900.0, 504.0], [1000.0, 649.0], [1100.0, 591.0], [1200.0, 238.0], [1300.0, 154.0], [1400.0, 49.0], [1500.0, 34.0], [1600.0, 70.0], [100.0, 371.0], [1700.0, 76.0], [1800.0, 144.0], [1900.0, 78.0], [2000.0, 97.0], [2100.0, 30.0], [2300.0, 78.0], [2200.0, 64.0], [2400.0, 75.0], [2500.0, 105.0], [2600.0, 126.0], [2700.0, 231.0], [2800.0, 124.0], [2900.0, 5.0], [3000.0, 1.0], [200.0, 376.0], [300.0, 654.0], [400.0, 565.0], [500.0, 533.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 3000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 710.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 3933.0, "series": [{"data": [[1.0, 3592.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 3933.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 1765.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 710.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 2185.980900000005, "minX": 1.52523018E12, "maxY": 2185.980900000005, "series": [{"data": [[1.52523018E12, 2185.980900000005]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52523018E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 0.0, "minX": 362.0, "maxY": 2855.0, "series": [{"data": [[362.0, 1249.0], [373.0, 1238.0], [395.0, 1213.0], [389.0, 1227.0], [413.0, 1186.0], [406.0, 1199.0], [428.0, 1175.0], [450.0, 1162.0], [478.0, 1135.0], [464.0, 1148.0], [499.0, 1123.0], [529.0, 1104.0], [512.0, 1113.0], [570.0, 1059.0], [562.0, 1070.0], [550.0, 1081.0], [545.0, 1093.0], [607.0, 1158.0], [598.0, 1029.0], [597.0, 1169.0], [588.0, 1039.0], [586.0, 1180.0], [578.0, 1119.0], [638.0, 998.0], [633.0, 1138.0], [619.0, 1009.0], [617.0, 1148.0], [609.0, 1018.0], [669.0, 974.0], [661.0, 1115.0], [649.0, 986.0], [646.0, 1127.0], [700.0, 1092.0], [691.0, 961.0], [682.0, 1103.0], [730.0, 1070.0], [726.0, 937.0], [712.0, 1081.0], [708.0, 948.0], [760.0, 1038.0], [764.0, 900.0], [767.0, 1028.0], [763.0, 1184.0], [759.0, 910.0], [757.0, 1194.0], [747.0, 1051.0], [738.0, 1067.0], [745.0, 919.0], [744.0, 1204.0], [794.0, 857.0], [798.0, 1063.0], [792.0, 1145.0], [772.0, 889.0], [771.0, 1173.0], [790.0, 1003.0], [787.0, 868.0], [784.0, 1155.0], [782.0, 1009.0], [781.0, 878.0], [779.0, 1163.0], [777.0, 1019.0], [807.0, 982.0], [823.0, 817.0], [820.0, 1109.0], [817.0, 964.0], [813.0, 827.0], [811.0, 1115.0], [808.0, 974.0], [805.0, 985.0], [803.0, 847.0], [839.0, 806.0], [862.0, 1061.0], [860.0, 950.6666666666666], [854.0, 930.5], [852.0, 1048.0], [848.0, 795.0], [847.0, 1086.0], [844.0, 1057.5], [834.0, 1097.0], [832.0, 1065.5], [889.0, 1115.0], [892.0, 1333.0], [895.0, 739.0], [890.0, 954.0], [887.0, 749.0], [880.0, 964.5], [877.0, 942.5], [870.0, 1138.0], [868.0, 913.0], [875.0, 976.5], [872.0, 768.0], [922.0, 914.0], [923.0, 700.0], [921.0, 1071.0], [901.0, 943.5], [897.0, 1103.0], [917.0, 1302.0], [916.0, 708.0], [914.0, 975.0], [911.0, 1313.0], [910.0, 718.0], [906.0, 985.3333333333334], [904.0, 1025.5], [953.0, 800.0], [959.0, 940.0], [952.0, 1030.0], [933.0, 691.0], [932.0, 974.0], [931.0, 833.0], [928.0, 1175.5], [951.0, 963.0], [950.0, 948.0], [946.0, 811.0], [942.0, 1041.0], [940.0, 1269.0], [938.0, 680.0], [937.0, 944.6666666666666], [936.0, 1279.0], [964.0, 789.0], [988.0, 996.0], [989.0, 995.5], [984.0, 637.0], [981.0, 920.0], [976.0, 778.0], [974.0, 1234.0], [972.0, 1007.0], [970.0, 788.0], [963.0, 1246.0], [962.0, 1019.0], [961.0, 658.0], [1014.0, 890.0], [1012.0, 883.75], [1003.0, 901.0], [998.0, 1211.0], [997.0, 691.0], [996.0, 986.0], [992.0, 910.0], [1070.0, 575.0], [1066.0, 637.0], [1062.0, 717.0], [1050.0, 730.0], [1044.0, 840.5], [1034.0, 879.0], [1030.0, 895.5], [1148.0, 853.3333333333334], [1144.0, 597.0], [1140.0, 547.0], [1136.0, 912.0], [1116.0, 557.0], [1110.0, 924.0], [1096.0, 565.0], [1210.0, 624.0], [1202.0, 781.0], [1198.0, 634.0], [1190.0, 792.0], [1188.0, 344.0], [1174.0, 578.5], [1170.0, 654.0], [1276.0, 697.0], [1278.0, 473.0], [1274.0, 669.5], [1216.0, 393.0], [1258.0, 718.0], [1256.0, 571.0], [1252.0, 539.0], [1250.0, 700.5], [1244.0, 1045.0], [1242.0, 592.0], [1238.0, 370.0], [1234.0, 758.0], [1232.0, 382.0], [1332.0, 247.0], [1340.0, 707.0], [1342.0, 237.0], [1338.0, 129.0], [1330.0, 719.0], [1294.0, 639.0], [1292.0, 477.3333333333333], [1290.0, 462.5], [1288.0, 612.0], [1320.0, 675.3333333333334], [1312.0, 962.0], [1308.0, 468.5], [1306.0, 750.0], [1302.0, 442.0], [1398.0, 449.5], [1350.0, 745.6], [1354.0, 480.6], [1348.0, 674.5], [1370.0, 850.0], [1346.0, 486.5], [1368.0, 646.5], [1366.0, 729.25], [1364.0, 197.0], [1360.0, 473.0], [1406.0, 364.0], [1394.0, 637.0], [1358.0, 441.0], [1380.0, 867.0], [1378.0, 452.0], [1376.0, 657.0], [1462.0, 268.1666666666667], [1446.0, 345.2], [1448.0, 386.55555555555543], [1450.0, 310.50000000000006], [1470.0, 531.0416666666667], [1442.0, 318.7142857142857], [1444.0, 450.6666666666667], [1440.0, 512.7777777777778], [1468.0, 596.84375], [1460.0, 328.3863636363636], [1458.0, 322.73170731707324], [1456.0, 349.7058823529411], [1422.0, 794.0], [1420.0, 594.4], [1418.0, 581.1818181818184], [1416.0, 534.6666666666666], [1412.0, 764.5], [1410.0, 415.18181818181813], [1408.0, 41.0], [1414.0, 492.3333333333333], [1436.0, 469.33333333333337], [1434.0, 196.1], [1432.0, 349.59999999999997], [1430.0, 185.23809523809524], [1428.0, 329.2352941176471], [1426.0, 469.5], [1424.0, 566.25], [1438.0, 306.7], [1464.0, 455.4999999999999], [1466.0, 495.2352941176471], [1454.0, 304.27906976744185], [1452.0, 415.9767441860465], [1520.0, 367.51428571428585], [1530.0, 485.96296296296293], [1510.0, 611.7199999999999], [1492.0, 395.6938775510204], [1512.0, 654.2857142857144], [1514.0, 571.2121212121212], [1516.0, 542.421052631579], [1490.0, 513.35], [1488.0, 312.47368421052636], [1528.0, 475.54166666666674], [1526.0, 429.36842105263156], [1522.0, 358.1363636363636], [1524.0, 431.1153846153846], [1500.0, 492.5365853658537], [1498.0, 495.0740740740742], [1494.0, 559.7346938775512], [1496.0, 605.7714285714285], [1502.0, 532.5641025641025], [1472.0, 361.2558139534883], [1476.0, 331.70833333333337], [1474.0, 351.30303030303025], [1480.0, 390.9411764705883], [1478.0, 499.67647058823536], [1482.0, 505.452380952381], [1484.0, 501.48571428571427], [1486.0, 459.1578947368421], [1506.0, 677.9756097560976], [1508.0, 683.24], [1504.0, 605.1538461538461], [1534.0, 536.7105263157895], [1532.0, 484.94444444444434], [1518.0, 378.1224489795918], [1584.0, 432.6315789473684], [1560.0, 365.6052631578947], [1574.0, 383.0588235294117], [1576.0, 374.35483870967744], [1578.0, 432.25], [1580.0, 423.88235294117646], [1582.0, 667.4705882352941], [1570.0, 229.59999999999997], [1572.0, 498.93749999999994], [1566.0, 386.0882352941176], [1556.0, 437.4324324324324], [1562.0, 362.93333333333334], [1564.0, 581.4736842105264], [1558.0, 263.4166666666667], [1554.0, 337.66666666666663], [1552.0, 466.0], [1550.0, 459.90000000000003], [1548.0, 507.6153846153846], [1546.0, 420.51515151515156], [1544.0, 338.89473684210515], [1542.0, 462.5348837209302], [1540.0, 496.57142857142867], [1536.0, 471.1428571428572], [1538.0, 440.8125], [1586.0, 637.0], [1588.0, 388.9375], [1592.0, 288.75000000000006], [1594.0, 419.13043478260863], [1596.0, 373.32], [1598.0, 361.0], [1590.0, 449.6451612903226], [1568.0, 431.2307692307692], [1608.0, 689.1153846153846], [1650.0, 246.12499999999997], [1632.0, 406.25], [1652.0, 147.85714285714283], [1634.0, 3.0], [1636.0, 437.2], [1640.0, 1.0], [1646.0, 1070.6666666666667], [1626.0, 826.2083333333335], [1628.0, 0.5], [1630.0, 249.5], [1624.0, 531.0], [1622.0, 596.2222222222222], [1620.0, 370.83333333333337], [1602.0, 416.58333333333326], [1600.0, 496.0], [1604.0, 523.0666666666667], [1606.0, 537.5555555555557], [1610.0, 668.4615384615385], [1612.0, 462.3157894736842], [1614.0, 447.77777777777777], [1648.0, 579.5], [1618.0, 711.0833333333333], [1616.0, 439.66666666666663], [1718.0, 440.0], [1700.0, 1165.0], [1684.0, 663.5], [1670.0, 94.4], [1676.0, 1.6], [1782.0, 572.0], [1750.0, 1345.0], [1846.0, 1565.0], [1844.0, 62.0], [1842.0, 1155.0], [1832.0, 1152.0], [1806.0, 591.0], [1792.0, 517.0], [1878.0, 967.0], [1860.0, 429.0], [1970.0, 331.0], [1966.0, 701.0], [1934.0, 1332.0], [1994.0, 435.0], [1986.0, 1139.0], [2152.0, 40.0], [2104.0, 568.0], [2156.0, 1688.5], [2164.0, 1438.3333333333333], [2172.0, 1306.4285714285716], [2112.0, 1032.0], [2200.0, 1008.0], [2292.0, 308.0], [2268.0, 1304.0], [2176.0, 1021.2727272727273], [2360.0, 408.0], [2508.0, 1261.0], [2496.0, 382.0], [2440.0, 664.0], [2640.0, 898.0], [2620.0, 286.0], [2768.0, 528.0], [2704.0, 1090.0], [2916.0, 2654.0], [2928.0, 1778.853658536585], [2848.0, 1813.0], [2844.0, 1819.0], [2912.0, 1801.6666666666667], [2920.0, 1729.8333333333333], [2924.0, 1511.5], [2884.0, 550.3333333333334], [2888.0, 851.7333333333332], [2896.0, 181.25], [2900.0, 737.6666666666666], [2904.0, 294.0], [2852.0, 1378.5], [2840.0, 2127.071428571429], [2872.0, 759.25], [2876.0, 594.1428571428571], [2828.0, 2542.0], [2868.0, 778.5], [2864.0, 2167.5], [2860.0, 2547.0], [2964.0, 2079.0], [2952.0, 2491.0], [2944.0, 2649.0], [2956.0, 1042.0], [3060.0, 1064.0], [3016.0, 331.0], [3020.0, 1652.7857142857138], [3024.0, 2416.0], [3028.0, 2494.0], [3032.0, 2692.0], [2980.0, 1043.0], [3168.0, 339.0], [3128.0, 602.6666666666666], [3116.0, 825.3333333333334], [3112.0, 1061.0], [3136.0, 754.2578124999998], [3192.0, 444.0], [3196.0, 2583.0], [3184.0, 483.0], [3176.0, 1091.0], [3172.0, 1102.0], [3180.0, 340.0], [3144.0, 778.25], [3164.0, 945.875], [3100.0, 1073.2], [3084.0, 1063.3333333333333], [3224.0, 1291.4], [3216.0, 2513.8888888888887], [3208.0, 1697.4166666666665], [3200.0, 1855.1666666666667], [3260.0, 1374.5555555555557], [3256.0, 1453.230769230769], [3252.0, 1134.0909090909092], [3248.0, 1645.125], [3244.0, 1010.0], [3240.0, 1667.6000000000001], [3236.0, 1244.7222222222222], [3232.0, 1563.2857142857142], [3228.0, 2055.396226415095], [3264.0, 1635.8823529411766], [3304.0, 415.625], [3308.0, 713.5], [3316.0, 614.0], [3324.0, 856.5], [3300.0, 153.0], [3268.0, 1390.695652173913], [3272.0, 1365.8], [3284.0, 393.0], [3288.0, 117.0], [3344.0, 399.0], [3436.0, 632.0], [3432.0, 405.0], [3356.0, 2048.5], [3340.0, 155.0], [3336.0, 615.0], [3332.0, 0.0], [3328.0, 1.0], [3364.0, 1340.0], [3360.0, 0.0], [3444.0, 559.0], [3448.0, 54.55813953488371], [3452.0, 572.5], [3420.0, 544.0], [3408.0, 507.5], [3396.0, 2620.0], [3392.0, 1284.0], [3476.0, 73.66666666666667], [3460.0, 2810.0], [3468.0, 0.0], [3456.0, 2.0], [3516.0, 131.2], [3504.0, 380.0], [3500.0, 341.3333333333333], [3492.0, 478.3333333333333], [3496.0, 535.0], [3480.0, 1.0], [3484.0, 125.0], [3520.0, 466.0], [3564.0, 690.0], [3572.0, 719.5], [3560.0, 476.3333333333333], [3552.0, 246.66666666666669], [3524.0, 337.4], [3528.0, 698.5], [3532.0, 487.5], [3536.0, 298.0], [3540.0, 249.75], [3544.0, 1.0], [3604.0, 521.0], [3608.0, 552.0], [3584.0, 679.3333333333333], [3640.0, 493.0], [3600.0, 278.0], [3692.0, 866.5], [3696.0, 1559.0], [3700.0, 878.5], [3708.0, 355.5], [3652.0, 666.5], [3656.0, 225.0], [3664.0, 1092.5], [3668.0, 238.0], [3676.0, 1105.5], [3624.0, 461.25], [3808.0, 731.5], [3728.0, 147.0], [3716.0, 768.3333333333333], [3772.0, 382.4], [3768.0, 0.33333333333333337], [3756.0, 112.33333333333334], [3748.0, 116.75], [3744.0, 711.3333333333334], [3732.0, 916.0], [3740.0, 1.0], [3812.0, 0.5], [3816.0, 876.0], [3820.0, 438.0], [3836.0, 1013.0], [3776.0, 1.0], [3784.0, 554.2857142857143], [3788.0, 198.75], [3796.0, 202.0], [3800.0, 0.0], [3804.0, 1.0], [3944.0, 1242.0], [3860.0, 660.0], [3892.0, 928.5], [3840.0, 586.25], [3896.0, 540.5], [3900.0, 433.5], [3856.0, 681.0], [3848.0, 876.0], [3852.0, 484.5], [3868.0, 519.1428571428572], [3936.0, 670.9999999999999], [3948.0, 645.0], [3952.0, 628.0], [3956.0, 1.0], [3960.0, 758.6], [3964.0, 531.5], [3904.0, 815.3333333333334], [3908.0, 436.6666666666667], [3916.0, 461.0], [3920.0, 385.8], [3924.0, 418.3333333333333], [3928.0, 573.0], [3932.0, 1257.0], [3876.0, 736.25], [3888.0, 775.8333333333334], [3884.0, 582.25], [3880.0, 605.6250000000001], [3976.0, 290.5], [3972.0, 743.5], [3980.0, 1235.0], [3988.0, 622.0], [4000.0, 610.0], [4004.0, 1171.0], [4012.0, 708.2], [2161.0, 816.3333333333334], [2165.0, 1234.1000000000004], [2109.0, 320.0], [2105.0, 1133.0], [2101.0, 1546.0], [2093.0, 936.0], [2177.0, 1185.2727272727275], [2277.0, 676.0], [2269.0, 604.5], [2537.0, 1515.0], [2453.0, 296.0], [2445.0, 1108.0], [2437.0, 548.0], [2801.0, 2530.0], [2773.0, 1317.25], [2813.0, 2273.6666666666665], [2805.0, 639.0], [2797.0, 2496.0], [2737.0, 937.0], [2925.0, 2061.5], [2913.0, 1814.7142857142858], [2917.0, 2105.809523809524], [2921.0, 1260.0], [2929.0, 812.0], [2937.0, 1890.5], [2885.0, 1548.0], [2889.0, 807.375], [2893.0, 1601.0], [2897.0, 772.0], [2901.0, 1363.8571428571427], [2909.0, 714.2], [2841.0, 2536.0], [2873.0, 1379.1379310344826], [2877.0, 143.0], [2825.0, 2016.0], [2869.0, 682.8333333333334], [2865.0, 1153.4782608695655], [2861.0, 1367.3269230769229], [2973.0, 432.0], [2965.0, 1042.0], [2953.0, 314.0], [3001.0, 361.0], [3049.0, 347.0], [3013.0, 1054.0], [3017.0, 1043.0], [3025.0, 2699.0], [3033.0, 2658.0], [3185.0, 593.2727272727273], [3129.0, 1066.0], [3125.0, 1080.6666666666665], [3197.0, 1074.0], [3193.0, 818.9714285714286], [3189.0, 1202.4], [3169.0, 1898.0], [3181.0, 339.0], [3137.0, 816.2222222222222], [3157.0, 336.0], [3101.0, 2251.0], [3085.0, 329.0], [3205.0, 2741.0], [3249.0, 2388.6666666666665], [3221.0, 1334.0], [3217.0, 2057.6302521008397], [3213.0, 2172.3157894736846], [3209.0, 1885.6999999999996], [3201.0, 2141.28125], [3261.0, 1167.0], [3257.0, 1347.5294117647056], [3253.0, 1546.4], [3245.0, 2223.25], [3241.0, 1750.428571428571], [3237.0, 1496.0], [3233.0, 1688.0], [3225.0, 1811.2222222222226], [3229.0, 1880.1000000000001], [3305.0, 613.0], [3317.0, 571.0], [3321.0, 1.0], [3325.0, 398.0], [3297.0, 1627.5], [3273.0, 254.0], [3277.0, 568.0], [3281.0, 2317.0], [3285.0, 154.0], [3433.0, 1654.0], [3449.0, 360.0], [3445.0, 118.33333333333333], [3441.0, 668.5], [3421.0, 1332.4999999999998], [3357.0, 323.0], [3353.0, 2791.0], [3349.0, 2826.0], [3337.0, 1315.5], [3333.0, 1202.0], [3365.0, 842.0], [3361.0, 593.0], [3385.0, 384.0], [3405.0, 1713.5], [3401.0, 2695.0], [3481.0, 165.0], [3513.0, 687.0], [3509.0, 688.0], [3505.0, 322.0], [3497.0, 237.66666666666669], [3489.0, 214.0], [3457.0, 1.0], [3461.0, 171.66666666666666], [3469.0, 156.42857142857142], [3477.0, 907.0], [3485.0, 1.0], [3557.0, 349.0], [3565.0, 322.0], [3569.0, 355.0], [3573.0, 1.0], [3577.0, 367.1428571428571], [3581.0, 64.75], [3525.0, 698.0], [3529.0, 1.0], [3537.0, 703.5], [3545.0, 349.0], [3593.0, 709.5], [3585.0, 0.0], [3625.0, 763.0], [3589.0, 254.66666666666669], [3597.0, 1.0], [3605.0, 282.0], [3609.0, 567.0], [3653.0, 1511.0], [3697.0, 559.6666666666666], [3701.0, 558.0], [3685.0, 798.75], [3693.0, 545.5], [3681.0, 654.6666666666666], [3661.0, 835.0], [3673.0, 845.0], [3677.0, 551.0], [3725.0, 245.0], [3765.0, 169.66666666666666], [3721.0, 440.0], [3713.0, 405.2], [3773.0, 866.0], [3769.0, 172.5], [3757.0, 1139.0], [3761.0, 168.66666666666666], [3753.0, 234.50000000000003], [3745.0, 1.0], [3749.0, 1.0], [3729.0, 690.0], [3733.0, 1.0], [3737.0, 445.75], [3809.0, 838.0], [3829.0, 579.0], [3781.0, 71.8], [3785.0, 241.0], [3793.0, 1.0], [3797.0, 731.0], [3801.0, 0.0], [3805.0, 675.0], [3869.0, 218.5], [3945.0, 419.4], [3861.0, 528.0], [3849.0, 521.0], [3865.0, 1147.0], [3937.0, 830.0], [3953.0, 386.3333333333333], [3957.0, 258.0], [3965.0, 533.0], [3877.0, 310.3333333333333], [3885.0, 265.2727272727273], [3881.0, 373.91666666666663], [3889.0, 871.5], [3893.0, 537.6666666666666], [3897.0, 854.0], [3901.0, 366.3333333333333], [3909.0, 465.0], [3913.0, 653.0], [3917.0, 263.75], [3921.0, 627.4285714285713], [3929.0, 133.66666666666666], [3973.0, 579.3333333333334], [3969.0, 598.0], [4013.0, 669.0], [4005.0, 1002.0], [3977.0, 0.0], [3981.0, 0.5], [3985.0, 879.5], [3989.0, 820.75], [3993.0, 743.0], [3997.0, 795.3333333333334], [1087.0, 933.0], [1085.0, 1157.0], [1083.0, 707.0], [1063.0, 1055.5], [1045.0, 1178.0], [1029.0, 738.0], [1025.0, 964.0], [1151.0, 665.0], [1141.0, 675.0], [1139.0, 1134.0], [1135.0, 606.0], [1129.0, 686.0], [1111.0, 792.6666666666666], [1103.0, 696.0], [1089.0, 627.0], [1207.0, 498.0], [1209.0, 862.0], [1203.0, 1085.0], [1201.0, 404.0], [1197.0, 869.0], [1193.0, 507.0], [1185.0, 869.5], [1183.0, 879.0], [1155.0, 587.0], [1167.0, 888.0], [1163.0, 529.0], [1179.0, 518.0], [1169.0, 1109.0], [1255.0, 504.0], [1277.0, 321.0], [1279.0, 1000.0], [1253.0, 1031.0], [1271.0, 746.5], [1269.0, 519.5], [1265.0, 680.0], [1227.0, 732.0], [1223.0, 1072.0], [1221.0, 542.0], [1217.0, 769.0], [1247.0, 510.0], [1245.0, 360.0], [1243.0, 786.0], [1241.0, 521.0], [1237.0, 834.3333333333334], [1235.0, 531.0], [1263.0, 756.5], [1259.0, 339.0], [1257.0, 810.0], [1331.0, 116.0], [1341.0, 106.0], [1343.0, 644.3333333333334], [1313.0, 498.0], [1319.0, 267.0], [1315.0, 437.0], [1323.0, 332.33333333333337], [1321.0, 487.0], [1337.0, 465.0], [1335.0, 933.0], [1333.0, 515.0], [1329.0, 135.0], [1295.0, 148.0], [1293.0, 980.0], [1289.0, 529.0], [1283.0, 781.0], [1281.0, 539.0], [1309.0, 432.0], [1307.0, 142.0], [1305.0, 508.0], [1303.0, 971.0], [1301.0, 479.5], [1327.0, 617.75], [1325.0, 257.0], [1381.0, 72.0], [1349.0, 515.4], [1375.0, 188.0], [1345.0, 287.0], [1371.0, 82.0], [1361.0, 468.66666666666663], [1407.0, 728.6666666666666], [1395.0, 634.25], [1393.0, 167.0], [1359.0, 79.0], [1351.0, 329.6666666666667], [1387.0, 653.75], [1385.0, 510.6666666666667], [1383.0, 177.0], [1379.0, 858.5], [1457.0, 355.9782608695653], [1465.0, 546.2608695652175], [1471.0, 549.09756097561], [1441.0, 398.22222222222223], [1443.0, 246.375], [1445.0, 347.40000000000003], [1451.0, 394.6862745098038], [1449.0, 310.34883720930225], [1447.0, 308.4999999999999], [1469.0, 506.4516129032257], [1467.0, 418.6666666666667], [1463.0, 279.1111111111111], [1461.0, 372.1999999999999], [1459.0, 334.38636363636357], [1437.0, 504.375], [1433.0, 433.0], [1435.0, 357.33333333333337], [1431.0, 302.8888888888889], [1429.0, 320.3076923076923], [1425.0, 907.3333333333334], [1427.0, 557.5], [1439.0, 229.6], [1409.0, 808.5], [1413.0, 715.5], [1411.0, 756.25], [1417.0, 509.9230769230769], [1415.0, 850.4], [1423.0, 483.0], [1421.0, 679.5], [1419.0, 589.6666666666666], [1455.0, 275.9782608695652], [1453.0, 452.8888888888889], [1487.0, 315.20930232558135], [1533.0, 356.8181818181817], [1515.0, 673.4166666666669], [1489.0, 439.4], [1491.0, 536.3863636363636], [1499.0, 582.5952380952381], [1493.0, 491.4642857142857], [1497.0, 451.55172413793105], [1495.0, 577.0243902439024], [1509.0, 672.8823529411766], [1505.0, 679.0789473684208], [1535.0, 555.2666666666665], [1507.0, 765.1250000000001], [1513.0, 637.8095238095236], [1511.0, 743.1], [1517.0, 563.6341463414636], [1519.0, 534.2352941176471], [1529.0, 414.60714285714283], [1531.0, 482.1724137931034], [1527.0, 498.35], [1521.0, 346.52941176470597], [1525.0, 508.46153846153845], [1523.0, 462.5416666666667], [1483.0, 319.52941176470586], [1481.0, 529.478260869565], [1479.0, 350.2857142857142], [1477.0, 380.9189189189188], [1473.0, 396.7142857142857], [1475.0, 389.36666666666673], [1485.0, 589.0000000000001], [1503.0, 606.1304347826089], [1501.0, 466.7142857142857], [1591.0, 441.34999999999997], [1567.0, 515.7307692307692], [1595.0, 358.15000000000003], [1597.0, 496.12500000000006], [1599.0, 435.75], [1593.0, 288.11764705882354], [1589.0, 526.1304347826087], [1587.0, 368.45454545454544], [1571.0, 506.23333333333335], [1575.0, 426.7142857142858], [1577.0, 497.57894736842104], [1579.0, 500.06250000000006], [1581.0, 504.2105263157895], [1583.0, 366.8333333333333], [1573.0, 450.5], [1569.0, 394.0], [1559.0, 596.9000000000001], [1561.0, 306.73529411764713], [1563.0, 433.79999999999995], [1565.0, 404.32352941176464], [1555.0, 390.030303030303], [1557.0, 253.39999999999992], [1553.0, 343.35294117647055], [1551.0, 812.8], [1549.0, 291.2903225806452], [1547.0, 322.4375], [1545.0, 298.40000000000003], [1543.0, 386.5483870967742], [1541.0, 470.925925925926], [1537.0, 459.6363636363637], [1539.0, 604.2608695652175], [1585.0, 152.1111111111111], [1605.0, 609.9583333333333], [1625.0, 628.3333333333333], [1627.0, 621.0], [1631.0, 1103.5], [1629.0, 649.0], [1621.0, 409.55555555555554], [1623.0, 1.0], [1617.0, 658.25], [1619.0, 457.0], [1603.0, 420.3529411764706], [1601.0, 442.49999999999994], [1609.0, 611.6052631578948], [1607.0, 504.5], [1611.0, 683.2941176470588], [1613.0, 363.06666666666666], [1615.0, 535.2307692307693], [1649.0, 442.71428571428567], [1651.0, 215.60000000000002], [1655.0, 1.0], [1663.0, 1.0], [1633.0, 3.0], [1635.0, 639.0], [1637.0, 2.0], [1641.0, 111.5], [1639.0, 917.0], [1643.0, 442.0], [1645.0, 96.42857142857142], [1647.0, 1.0], [1699.0, 1168.0], [1725.0, 981.0], [1711.0, 153.0], [1703.0, 213.0], [1701.0, 1580.0], [1681.0, 969.0], [1665.0, 1.0], [1675.0, 54.2], [1669.0, 142.2], [1671.0, 1.0], [1759.0, 718.0], [1843.0, 141.0], [1819.0, 342.0], [1807.0, 712.0], [1793.0, 958.0], [1979.0, 131.0], [1973.0, 675.0], [1969.0, 701.0], [1967.0, 579.0], [1961.0, 947.0], [1995.0, 500.0], [1993.0, 51.0], [1989.0, 419.0], [2154.0, 1248.75], [2162.0, 1364.8], [2106.0, 688.0], [2158.0, 1511.0], [2170.0, 1399.7272727272725], [2174.0, 1087.6], [2126.0, 120.0], [2182.0, 1241.2142857142853], [2206.0, 2182.0], [2262.0, 925.0], [2178.0, 1162.657894736842], [2198.0, 1028.0], [2202.0, 1221.0], [2362.0, 1273.0], [2342.0, 475.0], [2330.0, 753.5], [2490.0, 96.0], [2814.0, 2435.0], [2738.0, 2145.0], [2798.0, 2035.0], [2790.0, 396.0], [2702.0, 1251.0], [2926.0, 2319.3333333333335], [2918.0, 2632.0], [2930.0, 1810.4], [2938.0, 2198.0], [2890.0, 491.2307692307693], [2894.0, 821.7333333333333], [2898.0, 1877.0], [2854.0, 2537.0], [2870.0, 331.77777777777777], [2878.0, 860.1428571428571], [2830.0, 2316.0], [2826.0, 1907.0], [2818.0, 2084.0], [2862.0, 702.2], [2858.0, 1333.1666666666667], [3070.0, 816.3333333333334], [3010.0, 1778.0], [3062.0, 1245.0], [3046.0, 288.0], [2974.0, 627.0], [3050.0, 1227.0], [3026.0, 2654.0], [3034.0, 2695.0], [3038.0, 1497.25], [3186.0, 944.619047619048], [3190.0, 1813.0357142857138], [3114.0, 528.0], [3198.0, 879.3076923076924], [3194.0, 2018.0], [3170.0, 340.0], [3162.0, 1117.5], [3158.0, 583.1666666666666], [3090.0, 297.0], [3098.0, 868.0], [3130.0, 617.0], [3222.0, 1088.4], [3218.0, 1966.4545454545453], [3214.0, 2282.0], [3210.0, 1215.5], [3262.0, 1682.95652173913], [3258.0, 1927.888888888889], [3254.0, 2066.0], [3250.0, 1741.470588235294], [3246.0, 2008.333333333334], [3238.0, 1574.583333333333], [3234.0, 1580.3749999999998], [3226.0, 1931.884057971015], [3230.0, 1716.7903225806447], [3306.0, 950.0], [3314.0, 294.5], [3310.0, 434.0], [3322.0, 669.5], [3326.0, 2799.0], [3298.0, 1316.0], [3266.0, 1711.9230769230771], [3274.0, 674.0], [3270.0, 2589.0], [3278.0, 432.0], [3282.0, 2822.0], [3430.0, 721.75], [3434.0, 1995.4999999999998], [3354.0, 2767.0], [3334.0, 1369.0], [3390.0, 573.0], [3366.0, 546.5], [3362.0, 1307.0], [3442.0, 1064.2], [3438.0, 1016.0], [3446.0, 775.4], [3414.0, 850.0], [3422.0, 830.0], [3406.0, 1880.8333333333333], [3402.0, 1027.0], [3394.0, 2771.0], [3474.0, 1.0], [3518.0, 0.5], [3514.0, 1.0], [3510.0, 64.66666666666666], [3502.0, 683.0], [3498.0, 1.0], [3490.0, 0.6666666666666667], [3458.0, 1.0], [3462.0, 462.6], [3478.0, 220.0], [3482.0, 1348.0], [3582.0, 719.0], [3574.0, 0.0], [3578.0, 374.5], [3562.0, 1.0], [3558.0, 188.33333333333331], [3526.0, 0.5], [3534.0, 249.8], [3538.0, 1.0], [3542.0, 1.0], [3546.0, 1.0], [3550.0, 71.5], [3594.0, 412.8], [3590.0, 0.0], [3646.0, 522.0], [3638.0, 984.3333333333333], [3602.0, 259.0], [3610.0, 782.0], [3706.0, 298.6666666666667], [3710.0, 0.5], [3654.0, 785.0], [3662.0, 538.0], [3622.0, 972.6666666666666], [3722.0, 150.5], [3762.0, 836.0], [3754.0, 1.0], [3750.0, 704.0], [3746.0, 0.0], [3726.0, 0.0], [3730.0, 735.0], [3734.0, 0.5], [3738.0, 0.5], [3814.0, 303.25], [3822.0, 1048.0], [3838.0, 836.5], [3782.0, 1.0], [3790.0, 0.5], [3794.0, 1.0], [3802.0, 416.75], [3806.0, 95.25], [3866.0, 181.0], [3846.0, 1035.5], [3898.0, 744.375], [3894.0, 558.5714285714286], [3858.0, 783.8333333333333], [3850.0, 1294.0], [3854.0, 787.25], [3870.0, 1.0], [3862.0, 682.75], [3942.0, 1.0], [3950.0, 368.0], [3954.0, 261.0], [3958.0, 840.0], [3966.0, 0.5], [3910.0, 1041.0], [3914.0, 996.5], [3918.0, 0.0], [3922.0, 1.0], [3926.0, 1.0], [3934.0, 0.0], [3930.0, 641.0], [3874.0, 537.6666666666666], [3886.0, 368.0], [3890.0, 921.0], [3878.0, 263.5], [3882.0, 224.35000000000002], [3978.0, 1.0], [3970.0, 594.5], [3982.0, 617.3333333333334], [3986.0, 359.0], [3994.0, 1223.0], [4002.0, 813.0], [4006.0, 767.0], [4010.0, 1212.0], [4014.0, 352.0], [2159.0, 1633.6666666666667], [2163.0, 1370.25], [2111.0, 613.0], [2167.0, 1296.2857142857142], [2155.0, 406.0], [2195.0, 1249.5], [2179.0, 1153.2222222222222], [2287.0, 676.0], [2187.0, 942.0], [2307.0, 109.0], [2503.0, 1102.0], [2439.0, 912.0], [2687.0, 370.0], [2611.0, 653.0], [2579.0, 536.0], [2775.0, 1552.4], [2799.0, 2363.5], [2735.0, 1015.0], [2695.0, 905.0], [2915.0, 2665.0], [2839.0, 1829.8333333333333], [2863.0, 1150.8], [2855.0, 2150.833333333333], [2923.0, 1995.142857142857], [2931.0, 2322.0], [2935.0, 2194.0], [2883.0, 666.409090909091], [2887.0, 1861.6666666666667], [2891.0, 1011.8571428571429], [2895.0, 1408.0], [2899.0, 1889.0], [2903.0, 171.0], [2907.0, 2036.75], [2871.0, 394.66666666666663], [2875.0, 237.75], [2827.0, 2031.0], [2879.0, 147.0], [2867.0, 2142.5], [2859.0, 538.5], [3051.0, 843.0], [3011.0, 1043.0], [2951.0, 516.0], [3015.0, 708.5], [3035.0, 1057.0], [3039.0, 260.0], [2987.0, 2395.0], [2995.0, 801.3333333333334], [3195.0, 1083.0], [3191.0, 1392.2876712328764], [3135.0, 361.7083333333333], [3127.0, 338.0], [3123.0, 723.5], [3115.0, 508.0], [3199.0, 1697.6153846153848], [3187.0, 973.5], [3183.0, 293.2857142857143], [3143.0, 1461.5], [3151.0, 248.5], [3167.0, 339.0], [3207.0, 1424.3], [3215.0, 2733.0], [3211.0, 2377.0625000000005], [3219.0, 1237.0714285714284], [3263.0, 2108.8], [3259.0, 1453.0], [3255.0, 2004.75], [3251.0, 1794.5384615384614], [3247.0, 1536.8666666666666], [3243.0, 1955.142857142857], [3239.0, 2104.272727272727], [3223.0, 2755.0], [3227.0, 2345.2777777777783], [3231.0, 1359.1999999999998], [3319.0, 783.0], [3323.0, 2855.0], [3327.0, 621.0], [3267.0, 590.0], [3287.0, 950.5], [3439.0, 1422.0], [3435.0, 2062.0], [3443.0, 897.4], [3423.0, 737.0], [3355.0, 722.0], [3347.0, 1039.0], [3335.0, 2825.0], [3367.0, 1319.0], [3447.0, 92.25], [3455.0, 203.0], [3407.0, 1618.0], [3415.0, 581.0], [3399.0, 1591.0], [3559.0, 327.0], [3459.0, 161.5], [3511.0, 994.25], [3507.0, 167.66666666666666], [3503.0, 56.75000000000001], [3491.0, 332.0], [3475.0, 1.5], [3479.0, 285.33333333333337], [3487.0, 321.6], [3555.0, 183.5], [3563.0, 174.0], [3567.0, 248.0], [3571.0, 144.25], [3583.0, 86.33333333333333], [3523.0, 0.3333333333333333], [3527.0, 332.5], [3531.0, 164.66666666666666], [3535.0, 1.0], [3543.0, 720.0], [3547.0, 550.0], [3603.0, 371.0], [3591.0, 402.66666666666663], [3639.0, 584.0], [3587.0, 272.0], [3599.0, 1.0], [3607.0, 492.0], [3615.0, 621.5], [3707.0, 664.0], [3711.0, 447.5], [3691.0, 1368.0], [3683.0, 818.0], [3663.0, 591.0], [3675.0, 596.5], [3715.0, 223.75], [3775.0, 1.0], [3771.0, 1.0], [3763.0, 0.0], [3759.0, 385.16666666666663], [3751.0, 757.0], [3719.0, 372.4], [3727.0, 1.0], [3731.0, 0.5], [3739.0, 156.0], [3743.0, 526.875], [3811.0, 1.0], [3815.0, 667.5833333333334], [3779.0, 0.0], [3787.0, 1652.0], [3803.0, 808.0], [3807.0, 354.66666666666663], [3943.0, 1.0], [3843.0, 1049.0], [3855.0, 854.5], [3851.0, 546.0], [3867.0, 420.75], [3863.0, 878.25], [3871.0, 131.33333333333334], [3939.0, 336.5], [3947.0, 0.0], [3951.0, 1115.0], [3955.0, 1.0], [3963.0, 420.3333333333333], [3967.0, 1.0], [3875.0, 562.6666666666667], [3883.0, 488.1111111111111], [3879.0, 482.0], [3887.0, 539.0], [3891.0, 796.5], [3895.0, 678.8888888888889], [3899.0, 432.3], [3907.0, 562.0], [3915.0, 548.25], [3923.0, 373.33333333333337], [3927.0, 313.33333333333337], [3931.0, 355.0], [3935.0, 1.0], [3975.0, 1.0], [4015.0, 839.3333333333334], [4011.0, 1183.4], [3971.0, 494.25], [3979.0, 579.0], [3987.0, 1065.5], [3991.0, 849.75], [3995.0, 890.0], [3999.0, 364.0]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[2185.9807999999884, 745.1676000000033]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 4015.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 879444.1166666667, "minX": 1.52523018E12, "maxY": 1161188.25, "series": [{"data": [[1.52523018E12, 1161188.25]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52523018E12, 879444.1166666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52523018E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 745.1676000000033, "minX": 1.52523018E12, "maxY": 745.1676000000033, "series": [{"data": [[1.52523018E12, 745.1676000000033]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52523018E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 607.0441000000017, "minX": 1.52523018E12, "maxY": 607.0441000000017, "series": [{"data": [[1.52523018E12, 607.0441000000017]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52523018E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 174.0430000000002, "minX": 1.52523018E12, "maxY": 174.0430000000002, "series": [{"data": [[1.52523018E12, 174.0430000000002]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52523018E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 12.0, "minX": 1.52523018E12, "maxY": 3047.0, "series": [{"data": [[1.52523018E12, 3047.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52523018E12, 12.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52523018E12, 1778.999999999999]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52523018E12, 2823.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52523018E12, 2601.199999999996]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52523018E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 1.0, "minX": 166.0, "maxY": 762.0, "series": [{"data": [[166.0, 762.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[166.0, 1.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 166.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 1.0, "minX": 166.0, "maxY": 762.0, "series": [{"data": [[166.0, 762.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[166.0, 1.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 166.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 166.66666666666666, "minX": 1.52523018E12, "maxY": 166.66666666666666, "series": [{"data": [[1.52523018E12, 166.66666666666666]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52523018E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52523018E12, "maxY": 101.11666666666666, "series": [{"data": [[1.52523018E12, 101.11666666666666]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52523018E12, 53.55]], "isOverall": false, "label": "502", "isController": false}, {"data": [[1.52523018E12, 0.016666666666666666]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.NoHttpResponseException", "isController": false}, {"data": [[1.52523018E12, 11.983333333333333]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52523018E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 65.55, "minX": 1.52523018E12, "maxY": 101.11666666666666, "series": [{"data": [[1.52523018E12, 101.11666666666666]], "isOverall": false, "label": "inference-success", "isController": false}, {"data": [[1.52523018E12, 65.55]], "isOverall": false, "label": "inference-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52523018E12, "title": "Transactions Per Second"}},
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
