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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 28487.0, "series": [{"data": [[0.0, 1.0], [0.1, 119.0], [0.2, 122.0], [0.3, 122.0], [0.4, 234.0], [0.5, 238.0], [0.6, 241.0], [0.7, 368.0], [0.8, 476.0], [0.9, 480.0], [1.0, 546.0], [1.1, 599.0], [1.2, 604.0], [1.3, 849.0], [1.4, 849.0], [1.5, 890.0], [1.6, 1184.0], [1.7, 1321.0], [1.8, 1426.0], [1.9, 1502.0], [2.0, 1835.0], [2.1, 1951.0], [2.2, 2201.0], [2.3, 2298.0], [2.4, 2457.0], [2.5, 2730.0], [2.6, 2819.0], [2.7, 3192.0], [2.8, 3251.0], [2.9, 3511.0], [3.0, 3783.0], [3.1, 3881.0], [3.2, 3937.0], [3.3, 4025.0], [3.4, 4138.0], [3.5, 4234.0], [3.6, 4555.0], [3.7, 4757.0], [3.8, 4914.0], [3.9, 5000.0], [4.0, 5000.0], [4.1, 5000.0], [4.2, 5000.0], [4.3, 5000.0], [4.4, 5000.0], [4.5, 5000.0], [4.6, 5000.0], [4.7, 5000.0], [4.8, 5001.0], [4.9, 5001.0], [5.0, 5001.0], [5.1, 5001.0], [5.2, 5001.0], [5.3, 5001.0], [5.4, 5001.0], [5.5, 5001.0], [5.6, 5001.0], [5.7, 5001.0], [5.8, 5001.0], [5.9, 5001.0], [6.0, 5001.0], [6.1, 5001.0], [6.2, 5001.0], [6.3, 5001.0], [6.4, 5001.0], [6.5, 5001.0], [6.6, 5001.0], [6.7, 5001.0], [6.8, 5001.0], [6.9, 5001.0], [7.0, 5001.0], [7.1, 5001.0], [7.2, 5001.0], [7.3, 5001.0], [7.4, 5001.0], [7.5, 5001.0], [7.6, 5001.0], [7.7, 5001.0], [7.8, 5001.0], [7.9, 5001.0], [8.0, 5001.0], [8.1, 5001.0], [8.2, 5001.0], [8.3, 5001.0], [8.4, 5001.0], [8.5, 5001.0], [8.6, 5001.0], [8.7, 5001.0], [8.8, 5001.0], [8.9, 5001.0], [9.0, 5001.0], [9.1, 5001.0], [9.2, 5001.0], [9.3, 5001.0], [9.4, 5001.0], [9.5, 5001.0], [9.6, 5001.0], [9.7, 5001.0], [9.8, 5001.0], [9.9, 5001.0], [10.0, 5001.0], [10.1, 5001.0], [10.2, 5001.0], [10.3, 5001.0], [10.4, 5001.0], [10.5, 5001.0], [10.6, 5001.0], [10.7, 5001.0], [10.8, 5001.0], [10.9, 5001.0], [11.0, 5001.0], [11.1, 5001.0], [11.2, 5001.0], [11.3, 5001.0], [11.4, 5001.0], [11.5, 5001.0], [11.6, 5001.0], [11.7, 5001.0], [11.8, 5001.0], [11.9, 5001.0], [12.0, 5001.0], [12.1, 5001.0], [12.2, 5001.0], [12.3, 5001.0], [12.4, 5001.0], [12.5, 5001.0], [12.6, 5001.0], [12.7, 5001.0], [12.8, 5001.0], [12.9, 5001.0], [13.0, 5001.0], [13.1, 5001.0], [13.2, 5001.0], [13.3, 5001.0], [13.4, 5001.0], [13.5, 5001.0], [13.6, 5001.0], [13.7, 5001.0], [13.8, 5001.0], [13.9, 5001.0], [14.0, 5001.0], [14.1, 5001.0], [14.2, 5001.0], [14.3, 5001.0], [14.4, 5001.0], [14.5, 5001.0], [14.6, 5001.0], [14.7, 5001.0], [14.8, 5001.0], [14.9, 5001.0], [15.0, 5001.0], [15.1, 5001.0], [15.2, 5001.0], [15.3, 5001.0], [15.4, 5001.0], [15.5, 5001.0], [15.6, 5001.0], [15.7, 5001.0], [15.8, 5001.0], [15.9, 5001.0], [16.0, 5001.0], [16.1, 5001.0], [16.2, 5001.0], [16.3, 5001.0], [16.4, 5001.0], [16.5, 5001.0], [16.6, 5001.0], [16.7, 5001.0], [16.8, 5001.0], [16.9, 5001.0], [17.0, 5001.0], [17.1, 5001.0], [17.2, 5001.0], [17.3, 5001.0], [17.4, 5001.0], [17.5, 5001.0], [17.6, 5001.0], [17.7, 5001.0], [17.8, 5001.0], [17.9, 5001.0], [18.0, 5001.0], [18.1, 5001.0], [18.2, 5001.0], [18.3, 5001.0], [18.4, 5001.0], [18.5, 5001.0], [18.6, 5001.0], [18.7, 5001.0], [18.8, 5001.0], [18.9, 5001.0], [19.0, 5001.0], [19.1, 5001.0], [19.2, 5001.0], [19.3, 5001.0], [19.4, 5001.0], [19.5, 5001.0], [19.6, 5002.0], [19.7, 5002.0], [19.8, 5002.0], [19.9, 5002.0], [20.0, 5002.0], [20.1, 5002.0], [20.2, 5002.0], [20.3, 5002.0], [20.4, 5002.0], [20.5, 5002.0], [20.6, 5002.0], [20.7, 5002.0], [20.8, 5002.0], [20.9, 5002.0], [21.0, 5002.0], [21.1, 5002.0], [21.2, 5002.0], [21.3, 5002.0], [21.4, 5002.0], [21.5, 5002.0], [21.6, 5002.0], [21.7, 5002.0], [21.8, 5002.0], [21.9, 5002.0], [22.0, 5002.0], [22.1, 5002.0], [22.2, 5002.0], [22.3, 5002.0], [22.4, 5002.0], [22.5, 5002.0], [22.6, 5002.0], [22.7, 5002.0], [22.8, 5002.0], [22.9, 5002.0], [23.0, 5002.0], [23.1, 5002.0], [23.2, 5002.0], [23.3, 5002.0], [23.4, 5002.0], [23.5, 5002.0], [23.6, 5002.0], [23.7, 5002.0], [23.8, 5002.0], [23.9, 5002.0], [24.0, 5002.0], [24.1, 5002.0], [24.2, 5002.0], [24.3, 5002.0], [24.4, 5002.0], [24.5, 5002.0], [24.6, 5002.0], [24.7, 5002.0], [24.8, 5002.0], [24.9, 5002.0], [25.0, 5002.0], [25.1, 5002.0], [25.2, 5002.0], [25.3, 5002.0], [25.4, 5002.0], [25.5, 5002.0], [25.6, 5002.0], [25.7, 5002.0], [25.8, 5002.0], [25.9, 5002.0], [26.0, 5002.0], [26.1, 5002.0], [26.2, 5002.0], [26.3, 5002.0], [26.4, 5002.0], [26.5, 5002.0], [26.6, 5002.0], [26.7, 5002.0], [26.8, 5002.0], [26.9, 5002.0], [27.0, 5002.0], [27.1, 5002.0], [27.2, 5002.0], [27.3, 5002.0], [27.4, 5002.0], [27.5, 5002.0], [27.6, 5002.0], [27.7, 5002.0], [27.8, 5002.0], [27.9, 5002.0], [28.0, 5002.0], [28.1, 5002.0], [28.2, 5002.0], [28.3, 5002.0], [28.4, 5002.0], [28.5, 5002.0], [28.6, 5002.0], [28.7, 5002.0], [28.8, 5002.0], [28.9, 5002.0], [29.0, 5002.0], [29.1, 5002.0], [29.2, 5002.0], [29.3, 5002.0], [29.4, 5002.0], [29.5, 5002.0], [29.6, 5002.0], [29.7, 5002.0], [29.8, 5002.0], [29.9, 5002.0], [30.0, 5002.0], [30.1, 5002.0], [30.2, 5002.0], [30.3, 5002.0], [30.4, 5002.0], [30.5, 5002.0], [30.6, 5002.0], [30.7, 5002.0], [30.8, 5002.0], [30.9, 5002.0], [31.0, 5002.0], [31.1, 5002.0], [31.2, 5002.0], [31.3, 5002.0], [31.4, 5002.0], [31.5, 5002.0], [31.6, 5002.0], [31.7, 5002.0], [31.8, 5002.0], [31.9, 5002.0], [32.0, 5002.0], [32.1, 5002.0], [32.2, 5002.0], [32.3, 5002.0], [32.4, 5002.0], [32.5, 5002.0], [32.6, 5002.0], [32.7, 5002.0], [32.8, 5002.0], [32.9, 5002.0], [33.0, 5002.0], [33.1, 5002.0], [33.2, 5002.0], [33.3, 5002.0], [33.4, 5002.0], [33.5, 5002.0], [33.6, 5002.0], [33.7, 5002.0], [33.8, 5002.0], [33.9, 5002.0], [34.0, 5002.0], [34.1, 5002.0], [34.2, 5002.0], [34.3, 5002.0], [34.4, 5002.0], [34.5, 5002.0], [34.6, 5002.0], [34.7, 5002.0], [34.8, 5002.0], [34.9, 5002.0], [35.0, 5002.0], [35.1, 5002.0], [35.2, 5002.0], [35.3, 5002.0], [35.4, 5002.0], [35.5, 5002.0], [35.6, 5002.0], [35.7, 5002.0], [35.8, 5002.0], [35.9, 5002.0], [36.0, 5002.0], [36.1, 5002.0], [36.2, 5002.0], [36.3, 5002.0], [36.4, 5002.0], [36.5, 5002.0], [36.6, 5002.0], [36.7, 5002.0], [36.8, 5002.0], [36.9, 5002.0], [37.0, 5002.0], [37.1, 5002.0], [37.2, 5002.0], [37.3, 5002.0], [37.4, 5002.0], [37.5, 5002.0], [37.6, 5002.0], [37.7, 5002.0], [37.8, 5002.0], [37.9, 5002.0], [38.0, 5002.0], [38.1, 5002.0], [38.2, 5003.0], [38.3, 5003.0], [38.4, 5003.0], [38.5, 5003.0], [38.6, 5003.0], [38.7, 5003.0], [38.8, 5003.0], [38.9, 5003.0], [39.0, 5003.0], [39.1, 5003.0], [39.2, 5003.0], [39.3, 5003.0], [39.4, 5003.0], [39.5, 5003.0], [39.6, 5003.0], [39.7, 5003.0], [39.8, 5003.0], [39.9, 5003.0], [40.0, 5003.0], [40.1, 5003.0], [40.2, 5003.0], [40.3, 5003.0], [40.4, 5003.0], [40.5, 5003.0], [40.6, 5003.0], [40.7, 5003.0], [40.8, 5003.0], [40.9, 5003.0], [41.0, 5003.0], [41.1, 5003.0], [41.2, 5003.0], [41.3, 5003.0], [41.4, 5003.0], [41.5, 5003.0], [41.6, 5003.0], [41.7, 5003.0], [41.8, 5003.0], [41.9, 5003.0], [42.0, 5003.0], [42.1, 5003.0], [42.2, 5003.0], [42.3, 5003.0], [42.4, 5003.0], [42.5, 5003.0], [42.6, 5003.0], [42.7, 5003.0], [42.8, 5003.0], [42.9, 5003.0], [43.0, 5003.0], [43.1, 5003.0], [43.2, 5003.0], [43.3, 5003.0], [43.4, 5003.0], [43.5, 5003.0], [43.6, 5003.0], [43.7, 5003.0], [43.8, 5003.0], [43.9, 5003.0], [44.0, 5003.0], [44.1, 5003.0], [44.2, 5003.0], [44.3, 5003.0], [44.4, 5003.0], [44.5, 5003.0], [44.6, 5003.0], [44.7, 5003.0], [44.8, 5003.0], [44.9, 5003.0], [45.0, 5003.0], [45.1, 5003.0], [45.2, 5003.0], [45.3, 5003.0], [45.4, 5003.0], [45.5, 5003.0], [45.6, 5003.0], [45.7, 5003.0], [45.8, 5003.0], [45.9, 5003.0], [46.0, 5003.0], [46.1, 5003.0], [46.2, 5003.0], [46.3, 5003.0], [46.4, 5003.0], [46.5, 5003.0], [46.6, 5003.0], [46.7, 5003.0], [46.8, 5003.0], [46.9, 5003.0], [47.0, 5003.0], [47.1, 5003.0], [47.2, 5003.0], [47.3, 5003.0], [47.4, 5003.0], [47.5, 5003.0], [47.6, 5003.0], [47.7, 5003.0], [47.8, 5003.0], [47.9, 5003.0], [48.0, 5003.0], [48.1, 5003.0], [48.2, 5003.0], [48.3, 5003.0], [48.4, 5003.0], [48.5, 5003.0], [48.6, 5003.0], [48.7, 5003.0], [48.8, 5003.0], [48.9, 5003.0], [49.0, 5003.0], [49.1, 5003.0], [49.2, 5003.0], [49.3, 5003.0], [49.4, 5003.0], [49.5, 5003.0], [49.6, 5003.0], [49.7, 5003.0], [49.8, 5003.0], [49.9, 5003.0], [50.0, 5003.0], [50.1, 5003.0], [50.2, 5003.0], [50.3, 5003.0], [50.4, 5003.0], [50.5, 5003.0], [50.6, 5003.0], [50.7, 5003.0], [50.8, 5003.0], [50.9, 5003.0], [51.0, 5003.0], [51.1, 5003.0], [51.2, 5003.0], [51.3, 5003.0], [51.4, 5003.0], [51.5, 5003.0], [51.6, 5003.0], [51.7, 5003.0], [51.8, 5003.0], [51.9, 5003.0], [52.0, 5004.0], [52.1, 5004.0], [52.2, 5004.0], [52.3, 5004.0], [52.4, 5004.0], [52.5, 5004.0], [52.6, 5004.0], [52.7, 5004.0], [52.8, 5004.0], [52.9, 5004.0], [53.0, 5004.0], [53.1, 5004.0], [53.2, 5004.0], [53.3, 5004.0], [53.4, 5004.0], [53.5, 5004.0], [53.6, 5004.0], [53.7, 5004.0], [53.8, 5004.0], [53.9, 5004.0], [54.0, 5004.0], [54.1, 5004.0], [54.2, 5004.0], [54.3, 5004.0], [54.4, 5004.0], [54.5, 5004.0], [54.6, 5004.0], [54.7, 5004.0], [54.8, 5004.0], [54.9, 5004.0], [55.0, 5004.0], [55.1, 5004.0], [55.2, 5004.0], [55.3, 5004.0], [55.4, 5004.0], [55.5, 5004.0], [55.6, 5004.0], [55.7, 5004.0], [55.8, 5004.0], [55.9, 5004.0], [56.0, 5004.0], [56.1, 5004.0], [56.2, 5004.0], [56.3, 5004.0], [56.4, 5004.0], [56.5, 5004.0], [56.6, 5004.0], [56.7, 5004.0], [56.8, 5004.0], [56.9, 5004.0], [57.0, 5004.0], [57.1, 5004.0], [57.2, 5004.0], [57.3, 5004.0], [57.4, 5004.0], [57.5, 5004.0], [57.6, 5004.0], [57.7, 5004.0], [57.8, 5004.0], [57.9, 5004.0], [58.0, 5004.0], [58.1, 5004.0], [58.2, 5004.0], [58.3, 5004.0], [58.4, 5004.0], [58.5, 5004.0], [58.6, 5004.0], [58.7, 5004.0], [58.8, 5004.0], [58.9, 5004.0], [59.0, 5004.0], [59.1, 5004.0], [59.2, 5004.0], [59.3, 5004.0], [59.4, 5004.0], [59.5, 5004.0], [59.6, 5004.0], [59.7, 5004.0], [59.8, 5004.0], [59.9, 5004.0], [60.0, 5004.0], [60.1, 5004.0], [60.2, 5004.0], [60.3, 5004.0], [60.4, 5004.0], [60.5, 5004.0], [60.6, 5004.0], [60.7, 5004.0], [60.8, 5004.0], [60.9, 5004.0], [61.0, 5004.0], [61.1, 5004.0], [61.2, 5004.0], [61.3, 5004.0], [61.4, 5004.0], [61.5, 5004.0], [61.6, 5004.0], [61.7, 5004.0], [61.8, 5004.0], [61.9, 5004.0], [62.0, 5004.0], [62.1, 5004.0], [62.2, 5004.0], [62.3, 5004.0], [62.4, 5004.0], [62.5, 5004.0], [62.6, 5004.0], [62.7, 5004.0], [62.8, 5004.0], [62.9, 5005.0], [63.0, 5005.0], [63.1, 5005.0], [63.2, 5005.0], [63.3, 5005.0], [63.4, 5005.0], [63.5, 5005.0], [63.6, 5005.0], [63.7, 5005.0], [63.8, 5005.0], [63.9, 5005.0], [64.0, 5005.0], [64.1, 5005.0], [64.2, 5005.0], [64.3, 5005.0], [64.4, 5005.0], [64.5, 5005.0], [64.6, 5005.0], [64.7, 5005.0], [64.8, 5005.0], [64.9, 5005.0], [65.0, 5005.0], [65.1, 5005.0], [65.2, 5005.0], [65.3, 5005.0], [65.4, 5005.0], [65.5, 5005.0], [65.6, 5005.0], [65.7, 5005.0], [65.8, 5005.0], [65.9, 5005.0], [66.0, 5005.0], [66.1, 5005.0], [66.2, 5005.0], [66.3, 5005.0], [66.4, 5005.0], [66.5, 5005.0], [66.6, 5005.0], [66.7, 5005.0], [66.8, 5005.0], [66.9, 5005.0], [67.0, 5005.0], [67.1, 5005.0], [67.2, 5005.0], [67.3, 5005.0], [67.4, 5005.0], [67.5, 5005.0], [67.6, 5005.0], [67.7, 5005.0], [67.8, 5005.0], [67.9, 5005.0], [68.0, 5005.0], [68.1, 5005.0], [68.2, 5005.0], [68.3, 5005.0], [68.4, 5005.0], [68.5, 5005.0], [68.6, 5005.0], [68.7, 5005.0], [68.8, 5005.0], [68.9, 5005.0], [69.0, 5005.0], [69.1, 5005.0], [69.2, 5005.0], [69.3, 5005.0], [69.4, 5005.0], [69.5, 5005.0], [69.6, 5005.0], [69.7, 5005.0], [69.8, 5005.0], [69.9, 5005.0], [70.0, 5005.0], [70.1, 5005.0], [70.2, 5005.0], [70.3, 5005.0], [70.4, 5005.0], [70.5, 5005.0], [70.6, 5005.0], [70.7, 5005.0], [70.8, 5005.0], [70.9, 5005.0], [71.0, 5005.0], [71.1, 5005.0], [71.2, 5005.0], [71.3, 5005.0], [71.4, 5005.0], [71.5, 5005.0], [71.6, 5005.0], [71.7, 5005.0], [71.8, 5005.0], [71.9, 5005.0], [72.0, 5005.0], [72.1, 5005.0], [72.2, 5005.0], [72.3, 5005.0], [72.4, 5005.0], [72.5, 5005.0], [72.6, 5005.0], [72.7, 5005.0], [72.8, 5005.0], [72.9, 5005.0], [73.0, 5005.0], [73.1, 5005.0], [73.2, 5005.0], [73.3, 5005.0], [73.4, 5005.0], [73.5, 5006.0], [73.6, 5006.0], [73.7, 5006.0], [73.8, 5006.0], [73.9, 5006.0], [74.0, 5006.0], [74.1, 5006.0], [74.2, 5006.0], [74.3, 5006.0], [74.4, 5006.0], [74.5, 5006.0], [74.6, 5006.0], [74.7, 5006.0], [74.8, 5006.0], [74.9, 5006.0], [75.0, 5006.0], [75.1, 5006.0], [75.2, 5006.0], [75.3, 5006.0], [75.4, 5006.0], [75.5, 5006.0], [75.6, 5006.0], [75.7, 5006.0], [75.8, 5006.0], [75.9, 5006.0], [76.0, 5006.0], [76.1, 5006.0], [76.2, 5006.0], [76.3, 5006.0], [76.4, 5006.0], [76.5, 5006.0], [76.6, 5006.0], [76.7, 5006.0], [76.8, 5006.0], [76.9, 5006.0], [77.0, 5006.0], [77.1, 5006.0], [77.2, 5006.0], [77.3, 5006.0], [77.4, 5006.0], [77.5, 5006.0], [77.6, 5006.0], [77.7, 5006.0], [77.8, 5006.0], [77.9, 5006.0], [78.0, 5006.0], [78.1, 5006.0], [78.2, 5006.0], [78.3, 5006.0], [78.4, 5006.0], [78.5, 5006.0], [78.6, 5006.0], [78.7, 5006.0], [78.8, 5006.0], [78.9, 5006.0], [79.0, 5006.0], [79.1, 5006.0], [79.2, 5006.0], [79.3, 5006.0], [79.4, 5006.0], [79.5, 5006.0], [79.6, 5006.0], [79.7, 5006.0], [79.8, 5006.0], [79.9, 5006.0], [80.0, 5006.0], [80.1, 5006.0], [80.2, 5007.0], [80.3, 5007.0], [80.4, 5007.0], [80.5, 5007.0], [80.6, 5007.0], [80.7, 5007.0], [80.8, 5007.0], [80.9, 5007.0], [81.0, 5007.0], [81.1, 5007.0], [81.2, 5007.0], [81.3, 5007.0], [81.4, 5007.0], [81.5, 5007.0], [81.6, 5007.0], [81.7, 5009.0], [81.8, 5009.0], [81.9, 5009.0], [82.0, 5011.0], [82.1, 5014.0], [82.2, 5026.0], [82.3, 5026.0], [82.4, 5040.0], [82.5, 5043.0], [82.6, 5047.0], [82.7, 5150.0], [82.8, 5216.0], [82.9, 5511.0], [83.0, 5601.0], [83.1, 5886.0], [83.2, 6164.0], [83.3, 6379.0], [83.4, 6549.0], [83.5, 6607.0], [83.6, 6802.0], [83.7, 6992.0], [83.8, 7181.0], [83.9, 7393.0], [84.0, 7607.0], [84.1, 7817.0], [84.2, 8022.0], [84.3, 8261.0], [84.4, 8482.0], [84.5, 8683.0], [84.6, 8887.0], [84.7, 9068.0], [84.8, 9275.0], [84.9, 9475.0], [85.0, 9657.0], [85.1, 9828.0], [85.2, 10007.0], [85.3, 10175.0], [85.4, 10351.0], [85.5, 10524.0], [85.6, 10707.0], [85.7, 10862.0], [85.8, 11034.0], [85.9, 11201.0], [86.0, 11365.0], [86.1, 11535.0], [86.2, 11708.0], [86.3, 11873.0], [86.4, 12050.0], [86.5, 12210.0], [86.6, 12380.0], [86.7, 12558.0], [86.8, 12712.0], [86.9, 12920.0], [87.0, 13141.0], [87.1, 13299.0], [87.2, 13488.0], [87.3, 13646.0], [87.4, 13814.0], [87.5, 13977.0], [87.6, 14150.0], [87.7, 14342.0], [87.8, 14526.0], [87.9, 14799.0], [88.0, 15034.0], [88.1, 15248.0], [88.2, 15420.0], [88.3, 15610.0], [88.4, 15783.0], [88.5, 15958.0], [88.6, 16128.0], [88.7, 16287.0], [88.8, 16447.0], [88.9, 16571.0], [89.0, 16745.0], [89.1, 16909.0], [89.2, 17095.0], [89.3, 17271.0], [89.4, 17423.0], [89.5, 17600.0], [89.6, 17764.0], [89.7, 17921.0], [89.8, 18138.0], [89.9, 18310.0], [90.0, 18450.0], [90.1, 18626.0], [90.2, 18801.0], [90.3, 18976.0], [90.4, 19140.0], [90.5, 19296.0], [90.6, 19460.0], [90.7, 19628.0], [90.8, 19837.0], [90.9, 20004.0], [91.0, 20167.0], [91.1, 20338.0], [91.2, 20510.0], [91.3, 20700.0], [91.4, 20853.0], [91.5, 21024.0], [91.6, 21188.0], [91.7, 21355.0], [91.8, 21532.0], [91.9, 21691.0], [92.0, 21855.0], [92.1, 22033.0], [92.2, 22203.0], [92.3, 22429.0], [92.4, 22618.0], [92.5, 22895.0], [92.6, 23046.0], [92.7, 23221.0], [92.8, 23398.0], [92.9, 23545.0], [93.0, 23709.0], [93.1, 23877.0], [93.2, 24039.0], [93.3, 24171.0], [93.4, 24204.0], [93.5, 24214.0], [93.6, 24259.0], [93.7, 24283.0], [93.8, 24308.0], [93.9, 24341.0], [94.0, 24344.0], [94.1, 24382.0], [94.2, 24428.0], [94.3, 24464.0], [94.4, 24483.0], [94.5, 24496.0], [94.6, 24516.0], [94.7, 24581.0], [94.8, 24648.0], [94.9, 24686.0], [95.0, 24708.0], [95.1, 24714.0], [95.2, 24716.0], [95.3, 24745.0], [95.4, 24760.0], [95.5, 24806.0], [95.6, 24826.0], [95.7, 24850.0], [95.8, 24864.0], [95.9, 24885.0], [96.0, 24913.0], [96.1, 24947.0], [96.2, 25041.0], [96.3, 25078.0], [96.4, 25097.0], [96.5, 25106.0], [96.6, 25197.0], [96.7, 25270.0], [96.8, 25275.0], [96.9, 25289.0], [97.0, 25323.0], [97.1, 25352.0], [97.2, 25481.0], [97.3, 25484.0], [97.4, 25518.0], [97.5, 25569.0], [97.6, 25766.0], [97.7, 25793.0], [97.8, 25925.0], [97.9, 26039.0], [98.0, 26059.0], [98.1, 26105.0], [98.2, 26134.0], [98.3, 26202.0], [98.4, 27733.0], [98.5, 27814.0], [98.6, 27877.0], [98.7, 27881.0], [98.8, 27907.0], [98.9, 27917.0], [99.0, 27938.0], [99.1, 27946.0], [99.2, 27957.0], [99.3, 27968.0], [99.4, 27980.0], [99.5, 28009.0], [99.6, 28051.0], [99.7, 28075.0], [99.8, 28123.0], [99.9, 28487.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 789.0, "series": [{"data": [[0.0, 1.0], [100.0, 3.0], [200.0, 3.0], [300.0, 1.0], [400.0, 2.0], [500.0, 2.0], [600.0, 1.0], [800.0, 2.0], [1100.0, 1.0], [1300.0, 1.0], [1400.0, 1.0], [1500.0, 1.0], [1800.0, 1.0], [1900.0, 1.0], [2200.0, 2.0], [2400.0, 1.0], [2700.0, 1.0], [2800.0, 1.0], [3100.0, 1.0], [3200.0, 1.0], [3500.0, 1.0], [3700.0, 1.0], [3800.0, 1.0], [3900.0, 1.0], [4000.0, 1.0], [4100.0, 1.0], [4200.0, 1.0], [4500.0, 1.0], [4700.0, 1.0], [4900.0, 1.0], [5100.0, 1.0], [5000.0, 789.0], [5200.0, 1.0], [5500.0, 1.0], [5600.0, 1.0], [5800.0, 1.0], [6100.0, 1.0], [6300.0, 1.0], [6500.0, 1.0], [6600.0, 1.0], [6800.0, 1.0], [6900.0, 1.0], [7100.0, 1.0], [7300.0, 1.0], [7600.0, 1.0], [7800.0, 1.0], [8000.0, 1.0], [8200.0, 1.0], [8400.0, 1.0], [8600.0, 1.0], [8800.0, 1.0], [9000.0, 1.0], [9200.0, 1.0], [9400.0, 1.0], [9600.0, 1.0], [9800.0, 1.0], [10000.0, 1.0], [10100.0, 1.0], [10300.0, 1.0], [10500.0, 1.0], [10700.0, 1.0], [10800.0, 1.0], [11000.0, 1.0], [11200.0, 1.0], [11300.0, 1.0], [11500.0, 1.0], [11700.0, 1.0], [11800.0, 1.0], [12000.0, 1.0], [12200.0, 1.0], [12300.0, 1.0], [12500.0, 1.0], [12700.0, 1.0], [12900.0, 1.0], [13100.0, 1.0], [13200.0, 1.0], [13400.0, 1.0], [13600.0, 1.0], [13800.0, 1.0], [13900.0, 1.0], [14100.0, 1.0], [14300.0, 1.0], [14500.0, 1.0], [14700.0, 1.0], [15000.0, 1.0], [15200.0, 1.0], [15400.0, 1.0], [15600.0, 1.0], [15700.0, 1.0], [15900.0, 1.0], [16100.0, 1.0], [16200.0, 1.0], [16400.0, 1.0], [16500.0, 1.0], [16700.0, 1.0], [16900.0, 1.0], [17000.0, 1.0], [17200.0, 1.0], [17400.0, 1.0], [17600.0, 1.0], [17700.0, 1.0], [17900.0, 1.0], [18100.0, 1.0], [18300.0, 1.0], [18400.0, 1.0], [18600.0, 1.0], [18800.0, 1.0], [18900.0, 1.0], [19100.0, 1.0], [19200.0, 1.0], [19400.0, 1.0], [19600.0, 1.0], [19800.0, 1.0], [20000.0, 1.0], [20100.0, 1.0], [20300.0, 1.0], [20500.0, 1.0], [20700.0, 1.0], [20800.0, 1.0], [21000.0, 1.0], [21100.0, 1.0], [21300.0, 1.0], [21500.0, 1.0], [21600.0, 1.0], [21800.0, 1.0], [22000.0, 1.0], [22200.0, 1.0], [22400.0, 1.0], [22600.0, 1.0], [22800.0, 1.0], [23000.0, 1.0], [23200.0, 1.0], [23300.0, 1.0], [23500.0, 1.0], [23700.0, 1.0], [23800.0, 1.0], [24000.0, 1.0], [24200.0, 4.0], [24300.0, 4.0], [24500.0, 2.0], [24400.0, 4.0], [24100.0, 1.0], [25400.0, 2.0], [24700.0, 5.0], [24900.0, 2.0], [24800.0, 5.0], [25500.0, 2.0], [25100.0, 2.0], [24600.0, 2.0], [25000.0, 3.0], [25300.0, 2.0], [25200.0, 3.0], [25900.0, 1.0], [25700.0, 2.0], [26200.0, 1.0], [26100.0, 2.0], [26000.0, 2.0], [28400.0, 1.0], [28000.0, 3.0], [28100.0, 1.0], [27900.0, 7.0], [27800.0, 3.0], [27700.0, 1.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 28400.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 4.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 806.0, "series": [{"data": [[1.0, 4.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 806.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[2.0, 190.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 495.2399999999996, "minX": 1.5249093E12, "maxY": 495.2399999999996, "series": [{"data": [[1.5249093E12, 495.2399999999996]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5249093E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 176.5, "minX": 6.0, "maxY": 28123.0, "series": [{"data": [[6.0, 27733.0], [7.0, 27814.0], [8.0, 27881.0], [9.0, 27917.0], [10.0, 27946.0], [11.0, 27968.0], [13.0, 27892.0], [15.0, 27947.5], [16.0, 26039.0], [17.0, 27980.0], [18.0, 26059.0], [20.0, 28009.0], [21.0, 26119.5], [22.0, 28075.0], [23.0, 25197.0], [24.0, 24483.0], [25.0, 28123.0], [26.0, 26202.0], [28.0, 28051.0], [29.0, 24464.0], [30.0, 24465.5], [33.0, 24554.5], [32.0, 25270.0], [35.0, 25481.0], [34.0, 24708.0], [37.0, 25106.0], [36.0, 24204.0], [39.0, 24344.0], [38.0, 24308.0], [41.0, 24259.0], [40.0, 25078.0], [42.0, 24885.0], [45.0, 24714.0], [44.0, 26414.0], [47.0, 24428.0], [46.0, 24864.0], [49.0, 25766.0], [48.0, 25041.0], [51.0, 25289.0], [50.0, 25275.0], [53.0, 25793.0], [52.0, 24716.0], [55.0, 24496.0], [54.0, 25323.0], [57.0, 25097.0], [56.0, 25352.0], [59.0, 24648.0], [58.0, 24516.0], [61.0, 25925.0], [60.0, 24686.0], [62.0, 25484.0], [67.0, 12698.0], [66.0, 24947.0], [65.0, 25187.5], [64.0, 25518.0], [70.0, 24663.0], [68.0, 24913.0], [75.0, 23709.0], [74.0, 23877.0], [73.0, 24039.0], [72.0, 24298.0], [79.0, 22895.0], [78.0, 23133.5], [77.0, 23398.0], [76.0, 23545.0], [83.0, 22203.0], [82.0, 22429.0], [81.0, 22618.0], [87.0, 21611.5], [85.0, 21855.0], [84.0, 22033.0], [91.0, 20853.0], [90.0, 21024.0], [89.0, 21188.0], [88.0, 21355.0], [94.0, 20338.0], [93.0, 20510.0], [92.0, 20700.0], [99.0, 19544.0], [97.0, 19837.0], [96.0, 20085.5], [101.0, 890.0], [103.0, 18801.0], [102.0, 19058.0], [100.0, 19296.0], [107.0, 18138.0], [106.0, 18310.0], [105.0, 18450.0], [104.0, 18626.0], [111.0, 17511.5], [109.0, 17842.5], [114.0, 17002.0], [113.0, 17271.0], [119.0, 16128.0], [118.0, 16287.0], [117.0, 16447.0], [116.0, 16658.0], [122.0, 15420.0], [121.0, 15696.5], [120.0, 15958.0], [131.0, 1184.0], [128.0, 15248.0], [148.0, 15034.0], [153.0, 1426.0], [174.0, 1502.0], [170.0, 14799.0], [195.0, 1835.0], [196.0, 14526.0], [215.0, 1951.0], [213.0, 14342.0], [222.0, 5001.0], [220.0, 5003.5], [218.0, 5005.0], [231.0, 7289.25], [229.0, 5003.5], [225.0, 5004.0], [224.0, 5003.333333333333], [239.0, 4102.0], [237.0, 5001.0], [235.0, 5002.0], [234.0, 5006.0], [233.0, 5003.5], [240.0, 176.5], [246.0, 5004.0], [245.0, 5003.0], [244.0, 5007.0], [243.0, 5002.0], [241.0, 5002.0], [255.0, 5002.5], [253.0, 5004.0], [252.0, 5004.0], [251.0, 5003.0], [249.0, 5002.5], [248.0, 13977.0], [261.0, 2457.0], [268.0, 5001.5], [267.0, 5002.0], [264.0, 13814.0], [263.0, 5002.857142857143], [259.0, 5004.0], [257.0, 5001.5], [279.0, 3867.0], [286.0, 5002.5], [284.0, 5002.0], [283.0, 5002.333333333333], [280.0, 13646.0], [274.0, 5005.0], [273.0, 5003.5], [272.0, 5003.0], [301.0, 5001.0], [303.0, 2819.0], [300.0, 5001.0], [299.0, 7831.666666666667], [297.0, 5003.0], [296.0, 5002.0], [292.0, 5002.5], [291.0, 5004.0], [288.0, 5005.0], [307.0, 5001.0], [317.0, 5005.0], [315.0, 5002.0], [314.0, 6661.4], [310.0, 5001.5], [309.0, 5005.0], [308.0, 5004.0], [306.0, 5003.0], [305.0, 5004.0], [304.0, 5002.5], [333.0, 5005.0], [324.0, 4096.5], [335.0, 5002.0], [332.0, 6756.5], [330.0, 5002.0], [329.0, 5002.5], [327.0, 5002.0], [325.0, 5001.0], [320.0, 5003.0], [349.0, 5002.0], [342.0, 3251.0], [347.0, 5005.0], [346.0, 5001.0], [344.0, 5001.5], [343.0, 5002.0], [341.0, 5001.0], [339.0, 5001.5], [338.0, 5005.0], [365.0, 5006.0], [361.0, 4257.0], [367.0, 5003.0], [366.0, 5005.0], [360.0, 5004.0], [359.0, 5002.666666666667], [357.0, 5002.0], [355.0, 5001.0], [353.0, 6982.5], [380.0, 3783.0], [381.0, 4169.0], [379.0, 5003.0], [376.0, 12712.0], [375.0, 5006.0], [373.0, 5004.0], [372.0, 5004.0], [398.0, 5001.5], [397.0, 5002.5], [395.0, 5003.0], [394.0, 5001.0], [392.0, 5001.0], [391.0, 8779.5], [390.0, 5003.0], [387.0, 5002.5], [384.0, 5004.0], [413.0, 5001.5], [401.0, 3937.0], [415.0, 5003.0], [410.0, 6848.0], [407.0, 5004.0], [406.0, 5004.0], [405.0, 5002.0], [404.0, 5003.0], [400.0, 5005.0], [428.0, 5002.0], [418.0, 2309.0], [416.0, 5006.0], [429.0, 5002.333333333333], [427.0, 5004.0], [423.0, 12210.0], [422.0, 4807.4], [421.0, 5001.0], [420.0, 5002.0], [419.0, 5003.0], [445.0, 5002.0], [435.0, 4234.0], [442.0, 7352.333333333333], [441.0, 5006.0], [440.0, 5002.666666666667], [439.0, 5006.0], [437.0, 5002.5], [436.0, 5004.0], [434.0, 5005.0], [461.0, 11873.0], [451.0, 4555.0], [462.0, 5005.0], [460.0, 5002.0], [457.0, 5003.333333333333], [456.0, 5004.333333333333], [454.0, 5001.5], [453.0, 5002.333333333333], [448.0, 5001.5], [477.0, 5003.5], [472.0, 4757.0], [476.0, 5002.0], [474.0, 5002.666666666667], [473.0, 5002.0], [470.0, 5005.0], [469.0, 5005.0], [467.0, 5006.0], [465.0, 5005.0], [494.0, 5003.0], [489.0, 1918.0], [492.0, 5002.0], [482.0, 6679.5], [491.0, 5002.0], [490.0, 5005.666666666667], [488.0, 5002.5], [487.0, 5004.0], [485.0, 5003.0], [484.0, 5005.0], [509.0, 5002.0], [508.0, 5052.666666666667], [511.0, 5001.0], [506.0, 5001.0], [504.0, 5001.0], [502.0, 5001.5], [501.0, 5002.0], [500.0, 5001.0], [498.0, 7181.0], [496.0, 5003.0], [541.0, 5005.0], [525.0, 2727.0], [524.0, 5002.5], [523.0, 5003.0], [526.0, 5003.0], [513.0, 5003.0], [512.0, 5006.0], [517.0, 7124.333333333334], [514.0, 5004.5], [543.0, 5511.0], [539.0, 5001.0], [536.0, 5002.0], [535.0, 6036.166666666666], [534.0, 5002.5], [533.0, 2201.0], [530.0, 5002.0], [573.0, 5002.666666666667], [566.0, 5204.0], [572.0, 5003.0], [571.0, 5002.0], [570.0, 5001.0], [568.0, 7932.5], [556.0, 5003.0], [551.0, 5006.0], [549.0, 5865.428571428572], [548.0, 5003.5], [547.0, 5001.0], [545.0, 5001.0], [552.0, 5003.0], [563.0, 5002.0], [562.0, 5003.0], [561.0, 5002.666666666667], [560.0, 5003.0], [602.0, 5582.5], [584.0, 8296.5], [589.0, 5004.0], [585.0, 5001.0], [606.0, 5003.333333333333], [604.0, 5003.5], [600.0, 5002.0], [582.0, 5004.666666666667], [580.0, 5003.0], [578.0, 5001.0], [577.0, 5005.0], [599.0, 5003.0], [596.0, 5001.5], [595.0, 5004.666666666667], [590.0, 5001.0], [614.0, 5003.0], [619.0, 5003.0], [611.0, 5002.0], [608.0, 5003.5], [610.0, 5001.5], [609.0, 6107.4], [623.0, 6343.0], [622.0, 5004.0], [621.0, 5003.0], [620.0, 5691.0], [613.0, 5003.0], [612.0, 5002.5], [615.0, 5005.25], [632.0, 5005.0], [633.0, 5002.0], [636.0, 5003.666666666667], [634.0, 5003.5], [637.0, 5004.0], [638.0, 5004.0], [624.0, 5024.5], [626.0, 5002.0], [628.0, 5001.333333333333], [629.0, 5002.0], [630.0, 5001.0], [631.0, 5003.0], [616.0, 5014.0], [617.0, 5003.0], [618.0, 5009.0], [642.0, 5251.333333333333], [640.0, 5313.0], [654.0, 5003.4], [644.0, 5002.0], [643.0, 5004.0], [645.0, 5002.0], [647.0, 5002.5], [648.0, 5006.0], [649.0, 5003.0], [652.0, 5006.0], [653.0, 5002.666666666667], [656.0, 5002.5], [670.0, 5004.0], [667.0, 5004.0], [669.0, 5003.75], [664.0, 5002.0], [666.0, 5002.0], [658.0, 5003.25], [659.0, 5002.333333333333], [660.0, 10007.0], [661.0, 5232.714285714286], [663.0, 5002.5], [679.0, 5969.2], [673.0, 5001.5], [672.0, 5004.0], [687.0, 5003.5], [685.0, 5005.0], [674.0, 5005.0], [675.0, 5001.0], [676.0, 5002.8], [677.0, 5004.5], [689.0, 5003.2], [688.0, 5003.5], [690.0, 5006.0], [702.0, 5003.333333333333], [701.0, 5005.5], [703.0, 5002.777777777777], [697.0, 3557.0], [696.0, 5001.0], [699.0, 5004.0], [698.0, 5001.0], [700.0, 5667.714285714286], [691.0, 5003.0], [692.0, 5004.0], [695.0, 5003.0], [693.0, 5003.0], [680.0, 5901.5], [681.0, 5002.0], [683.0, 5004.0], [684.0, 5002.333333333333], [704.0, 5012.0294117647045], [706.0, 5014.233766233763], [705.0, 5148.666666666666], [707.0, 5132.63829787234], [708.0, 5132.333333333332], [709.0, 5003.052631578948], [710.0, 5002.5]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[495.2399999999996, 7311.697999999999]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 710.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 18402.55, "minX": 1.5249093E12, "maxY": 67787.68333333333, "series": [{"data": [[1.5249093E12, 67787.68333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5249093E12, 18402.55]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5249093E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 7311.697999999999, "minX": 1.5249093E12, "maxY": 7311.697999999999, "series": [{"data": [[1.5249093E12, 7311.697999999999]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5249093E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3348.152000000002, "minX": 1.5249093E12, "maxY": 3348.152000000002, "series": [{"data": [[1.5249093E12, 3348.152000000002]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5249093E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 4066.814000000001, "minX": 1.5249093E12, "maxY": 4066.814000000001, "series": [{"data": [[1.5249093E12, 4066.814000000001]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5249093E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 546.0, "minX": 1.5249093E12, "maxY": 28487.0, "series": [{"data": [[1.5249093E12, 28487.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5249093E12, 546.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5249093E12, 26082.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5249093E12, 28141.200000000004]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5249093E12, 27940.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5249093E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 5003.0, "minX": 16.0, "maxY": 18888.5, "series": [{"data": [[16.0, 18888.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[16.0, 5003.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 0.0, "minX": 16.0, "maxY": 18888.5, "series": [{"data": [[16.0, 18888.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[16.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.5249093E12, "maxY": 16.666666666666668, "series": [{"data": [[1.5249093E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5249093E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.2833333333333333, "minX": 1.5249093E12, "maxY": 13.15, "series": [{"data": [[1.5249093E12, 3.2333333333333334]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.5249093E12, 13.15]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.conn.ConnectTimeoutException", "isController": false}, {"data": [[1.5249093E12, 0.2833333333333333]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5249093E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 3.2333333333333334, "minX": 1.5249093E12, "maxY": 13.433333333333334, "series": [{"data": [[1.5249093E12, 3.2333333333333334]], "isOverall": false, "label": "inference-success", "isController": false}, {"data": [[1.5249093E12, 13.433333333333334]], "isOverall": false, "label": "inference-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5249093E12, "title": "Transactions Per Second"}},
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
