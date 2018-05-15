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
        data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 2470.0, "series": [{"data": [[0.0, 0.0], [0.1, 2.0], [0.2, 11.0], [0.3, 11.0], [0.4, 11.0], [0.5, 11.0], [0.6, 11.0], [0.7, 11.0], [0.8, 11.0], [0.9, 11.0], [1.0, 11.0], [1.1, 11.0], [1.2, 11.0], [1.3, 11.0], [1.4, 11.0], [1.5, 11.0], [1.6, 11.0], [1.7, 11.0], [1.8, 11.0], [1.9, 11.0], [2.0, 11.0], [2.1, 11.0], [2.2, 11.0], [2.3, 11.0], [2.4, 11.0], [2.5, 11.0], [2.6, 11.0], [2.7, 11.0], [2.8, 11.0], [2.9, 11.0], [3.0, 11.0], [3.1, 11.0], [3.2, 11.0], [3.3, 11.0], [3.4, 11.0], [3.5, 11.0], [3.6, 11.0], [3.7, 11.0], [3.8, 11.0], [3.9, 11.0], [4.0, 11.0], [4.1, 11.0], [4.2, 11.0], [4.3, 11.0], [4.4, 11.0], [4.5, 11.0], [4.6, 11.0], [4.7, 11.0], [4.8, 11.0], [4.9, 11.0], [5.0, 11.0], [5.1, 11.0], [5.2, 11.0], [5.3, 11.0], [5.4, 11.0], [5.5, 11.0], [5.6, 11.0], [5.7, 11.0], [5.8, 11.0], [5.9, 11.0], [6.0, 11.0], [6.1, 11.0], [6.2, 11.0], [6.3, 11.0], [6.4, 11.0], [6.5, 11.0], [6.6, 11.0], [6.7, 11.0], [6.8, 11.0], [6.9, 12.0], [7.0, 12.0], [7.1, 12.0], [7.2, 12.0], [7.3, 12.0], [7.4, 12.0], [7.5, 12.0], [7.6, 12.0], [7.7, 12.0], [7.8, 12.0], [7.9, 12.0], [8.0, 12.0], [8.1, 12.0], [8.2, 12.0], [8.3, 12.0], [8.4, 12.0], [8.5, 12.0], [8.6, 12.0], [8.7, 12.0], [8.8, 12.0], [8.9, 12.0], [9.0, 12.0], [9.1, 12.0], [9.2, 12.0], [9.3, 12.0], [9.4, 12.0], [9.5, 12.0], [9.6, 12.0], [9.7, 12.0], [9.8, 12.0], [9.9, 12.0], [10.0, 12.0], [10.1, 12.0], [10.2, 12.0], [10.3, 12.0], [10.4, 12.0], [10.5, 12.0], [10.6, 12.0], [10.7, 12.0], [10.8, 12.0], [10.9, 12.0], [11.0, 12.0], [11.1, 12.0], [11.2, 12.0], [11.3, 12.0], [11.4, 12.0], [11.5, 12.0], [11.6, 12.0], [11.7, 12.0], [11.8, 12.0], [11.9, 12.0], [12.0, 12.0], [12.1, 12.0], [12.2, 12.0], [12.3, 12.0], [12.4, 12.0], [12.5, 12.0], [12.6, 12.0], [12.7, 12.0], [12.8, 12.0], [12.9, 12.0], [13.0, 12.0], [13.1, 12.0], [13.2, 12.0], [13.3, 12.0], [13.4, 12.0], [13.5, 12.0], [13.6, 12.0], [13.7, 12.0], [13.8, 12.0], [13.9, 12.0], [14.0, 12.0], [14.1, 12.0], [14.2, 12.0], [14.3, 12.0], [14.4, 12.0], [14.5, 12.0], [14.6, 12.0], [14.7, 12.0], [14.8, 12.0], [14.9, 12.0], [15.0, 12.0], [15.1, 12.0], [15.2, 12.0], [15.3, 12.0], [15.4, 12.0], [15.5, 12.0], [15.6, 12.0], [15.7, 12.0], [15.8, 12.0], [15.9, 12.0], [16.0, 12.0], [16.1, 12.0], [16.2, 12.0], [16.3, 12.0], [16.4, 12.0], [16.5, 12.0], [16.6, 12.0], [16.7, 12.0], [16.8, 12.0], [16.9, 12.0], [17.0, 12.0], [17.1, 12.0], [17.2, 12.0], [17.3, 12.0], [17.4, 12.0], [17.5, 12.0], [17.6, 12.0], [17.7, 12.0], [17.8, 12.0], [17.9, 12.0], [18.0, 12.0], [18.1, 12.0], [18.2, 12.0], [18.3, 12.0], [18.4, 12.0], [18.5, 12.0], [18.6, 12.0], [18.7, 12.0], [18.8, 12.0], [18.9, 12.0], [19.0, 12.0], [19.1, 12.0], [19.2, 12.0], [19.3, 12.0], [19.4, 12.0], [19.5, 12.0], [19.6, 12.0], [19.7, 12.0], [19.8, 12.0], [19.9, 12.0], [20.0, 12.0], [20.1, 12.0], [20.2, 12.0], [20.3, 12.0], [20.4, 12.0], [20.5, 12.0], [20.6, 12.0], [20.7, 12.0], [20.8, 12.0], [20.9, 12.0], [21.0, 12.0], [21.1, 12.0], [21.2, 12.0], [21.3, 12.0], [21.4, 12.0], [21.5, 12.0], [21.6, 12.0], [21.7, 12.0], [21.8, 12.0], [21.9, 12.0], [22.0, 12.0], [22.1, 12.0], [22.2, 12.0], [22.3, 12.0], [22.4, 12.0], [22.5, 12.0], [22.6, 12.0], [22.7, 12.0], [22.8, 12.0], [22.9, 12.0], [23.0, 12.0], [23.1, 12.0], [23.2, 12.0], [23.3, 12.0], [23.4, 12.0], [23.5, 12.0], [23.6, 12.0], [23.7, 12.0], [23.8, 12.0], [23.9, 12.0], [24.0, 12.0], [24.1, 12.0], [24.2, 12.0], [24.3, 12.0], [24.4, 12.0], [24.5, 12.0], [24.6, 12.0], [24.7, 12.0], [24.8, 12.0], [24.9, 12.0], [25.0, 12.0], [25.1, 12.0], [25.2, 12.0], [25.3, 12.0], [25.4, 12.0], [25.5, 12.0], [25.6, 12.0], [25.7, 12.0], [25.8, 12.0], [25.9, 12.0], [26.0, 12.0], [26.1, 12.0], [26.2, 12.0], [26.3, 12.0], [26.4, 12.0], [26.5, 12.0], [26.6, 12.0], [26.7, 12.0], [26.8, 12.0], [26.9, 12.0], [27.0, 12.0], [27.1, 12.0], [27.2, 12.0], [27.3, 12.0], [27.4, 12.0], [27.5, 12.0], [27.6, 12.0], [27.7, 12.0], [27.8, 12.0], [27.9, 12.0], [28.0, 12.0], [28.1, 12.0], [28.2, 12.0], [28.3, 12.0], [28.4, 12.0], [28.5, 12.0], [28.6, 12.0], [28.7, 12.0], [28.8, 12.0], [28.9, 12.0], [29.0, 12.0], [29.1, 12.0], [29.2, 12.0], [29.3, 12.0], [29.4, 12.0], [29.5, 12.0], [29.6, 12.0], [29.7, 12.0], [29.8, 12.0], [29.9, 12.0], [30.0, 12.0], [30.1, 12.0], [30.2, 12.0], [30.3, 12.0], [30.4, 12.0], [30.5, 12.0], [30.6, 12.0], [30.7, 12.0], [30.8, 12.0], [30.9, 12.0], [31.0, 12.0], [31.1, 12.0], [31.2, 12.0], [31.3, 12.0], [31.4, 12.0], [31.5, 12.0], [31.6, 12.0], [31.7, 12.0], [31.8, 12.0], [31.9, 12.0], [32.0, 12.0], [32.1, 12.0], [32.2, 12.0], [32.3, 12.0], [32.4, 12.0], [32.5, 12.0], [32.6, 12.0], [32.7, 12.0], [32.8, 12.0], [32.9, 12.0], [33.0, 12.0], [33.1, 12.0], [33.2, 12.0], [33.3, 12.0], [33.4, 12.0], [33.5, 12.0], [33.6, 12.0], [33.7, 12.0], [33.8, 12.0], [33.9, 12.0], [34.0, 12.0], [34.1, 12.0], [34.2, 12.0], [34.3, 12.0], [34.4, 12.0], [34.5, 12.0], [34.6, 12.0], [34.7, 13.0], [34.8, 13.0], [34.9, 13.0], [35.0, 13.0], [35.1, 13.0], [35.2, 13.0], [35.3, 13.0], [35.4, 13.0], [35.5, 13.0], [35.6, 13.0], [35.7, 13.0], [35.8, 13.0], [35.9, 13.0], [36.0, 13.0], [36.1, 13.0], [36.2, 13.0], [36.3, 13.0], [36.4, 13.0], [36.5, 13.0], [36.6, 13.0], [36.7, 13.0], [36.8, 13.0], [36.9, 13.0], [37.0, 13.0], [37.1, 13.0], [37.2, 13.0], [37.3, 13.0], [37.4, 13.0], [37.5, 13.0], [37.6, 13.0], [37.7, 13.0], [37.8, 13.0], [37.9, 13.0], [38.0, 13.0], [38.1, 13.0], [38.2, 13.0], [38.3, 13.0], [38.4, 13.0], [38.5, 13.0], [38.6, 13.0], [38.7, 13.0], [38.8, 13.0], [38.9, 13.0], [39.0, 13.0], [39.1, 13.0], [39.2, 13.0], [39.3, 13.0], [39.4, 13.0], [39.5, 13.0], [39.6, 13.0], [39.7, 13.0], [39.8, 13.0], [39.9, 13.0], [40.0, 13.0], [40.1, 13.0], [40.2, 13.0], [40.3, 13.0], [40.4, 13.0], [40.5, 13.0], [40.6, 13.0], [40.7, 13.0], [40.8, 13.0], [40.9, 13.0], [41.0, 13.0], [41.1, 13.0], [41.2, 13.0], [41.3, 13.0], [41.4, 13.0], [41.5, 13.0], [41.6, 13.0], [41.7, 13.0], [41.8, 13.0], [41.9, 13.0], [42.0, 13.0], [42.1, 13.0], [42.2, 13.0], [42.3, 13.0], [42.4, 13.0], [42.5, 13.0], [42.6, 13.0], [42.7, 13.0], [42.8, 13.0], [42.9, 13.0], [43.0, 13.0], [43.1, 13.0], [43.2, 13.0], [43.3, 13.0], [43.4, 13.0], [43.5, 13.0], [43.6, 13.0], [43.7, 13.0], [43.8, 13.0], [43.9, 13.0], [44.0, 13.0], [44.1, 13.0], [44.2, 13.0], [44.3, 13.0], [44.4, 13.0], [44.5, 13.0], [44.6, 13.0], [44.7, 13.0], [44.8, 13.0], [44.9, 13.0], [45.0, 13.0], [45.1, 13.0], [45.2, 13.0], [45.3, 13.0], [45.4, 13.0], [45.5, 13.0], [45.6, 13.0], [45.7, 13.0], [45.8, 13.0], [45.9, 13.0], [46.0, 13.0], [46.1, 13.0], [46.2, 13.0], [46.3, 13.0], [46.4, 13.0], [46.5, 13.0], [46.6, 13.0], [46.7, 13.0], [46.8, 13.0], [46.9, 13.0], [47.0, 13.0], [47.1, 13.0], [47.2, 13.0], [47.3, 13.0], [47.4, 13.0], [47.5, 13.0], [47.6, 13.0], [47.7, 13.0], [47.8, 13.0], [47.9, 13.0], [48.0, 13.0], [48.1, 13.0], [48.2, 13.0], [48.3, 13.0], [48.4, 13.0], [48.5, 13.0], [48.6, 13.0], [48.7, 13.0], [48.8, 13.0], [48.9, 13.0], [49.0, 13.0], [49.1, 13.0], [49.2, 13.0], [49.3, 13.0], [49.4, 13.0], [49.5, 13.0], [49.6, 13.0], [49.7, 13.0], [49.8, 13.0], [49.9, 13.0], [50.0, 13.0], [50.1, 13.0], [50.2, 13.0], [50.3, 13.0], [50.4, 13.0], [50.5, 13.0], [50.6, 13.0], [50.7, 13.0], [50.8, 13.0], [50.9, 13.0], [51.0, 13.0], [51.1, 13.0], [51.2, 13.0], [51.3, 13.0], [51.4, 13.0], [51.5, 13.0], [51.6, 13.0], [51.7, 13.0], [51.8, 13.0], [51.9, 13.0], [52.0, 13.0], [52.1, 14.0], [52.2, 14.0], [52.3, 14.0], [52.4, 14.0], [52.5, 14.0], [52.6, 14.0], [52.7, 14.0], [52.8, 14.0], [52.9, 14.0], [53.0, 14.0], [53.1, 14.0], [53.2, 14.0], [53.3, 14.0], [53.4, 14.0], [53.5, 14.0], [53.6, 14.0], [53.7, 14.0], [53.8, 14.0], [53.9, 14.0], [54.0, 14.0], [54.1, 14.0], [54.2, 14.0], [54.3, 14.0], [54.4, 14.0], [54.5, 14.0], [54.6, 14.0], [54.7, 14.0], [54.8, 14.0], [54.9, 14.0], [55.0, 14.0], [55.1, 14.0], [55.2, 14.0], [55.3, 14.0], [55.4, 14.0], [55.5, 14.0], [55.6, 14.0], [55.7, 14.0], [55.8, 14.0], [55.9, 14.0], [56.0, 14.0], [56.1, 14.0], [56.2, 14.0], [56.3, 14.0], [56.4, 14.0], [56.5, 14.0], [56.6, 14.0], [56.7, 14.0], [56.8, 14.0], [56.9, 14.0], [57.0, 14.0], [57.1, 14.0], [57.2, 14.0], [57.3, 14.0], [57.4, 14.0], [57.5, 14.0], [57.6, 14.0], [57.7, 14.0], [57.8, 14.0], [57.9, 14.0], [58.0, 14.0], [58.1, 14.0], [58.2, 14.0], [58.3, 14.0], [58.4, 14.0], [58.5, 14.0], [58.6, 14.0], [58.7, 14.0], [58.8, 14.0], [58.9, 14.0], [59.0, 14.0], [59.1, 14.0], [59.2, 14.0], [59.3, 14.0], [59.4, 14.0], [59.5, 14.0], [59.6, 14.0], [59.7, 14.0], [59.8, 14.0], [59.9, 14.0], [60.0, 14.0], [60.1, 14.0], [60.2, 14.0], [60.3, 14.0], [60.4, 14.0], [60.5, 14.0], [60.6, 14.0], [60.7, 14.0], [60.8, 14.0], [60.9, 14.0], [61.0, 15.0], [61.1, 15.0], [61.2, 15.0], [61.3, 15.0], [61.4, 15.0], [61.5, 15.0], [61.6, 15.0], [61.7, 15.0], [61.8, 15.0], [61.9, 15.0], [62.0, 15.0], [62.1, 15.0], [62.2, 15.0], [62.3, 15.0], [62.4, 15.0], [62.5, 15.0], [62.6, 15.0], [62.7, 15.0], [62.8, 15.0], [62.9, 15.0], [63.0, 15.0], [63.1, 15.0], [63.2, 15.0], [63.3, 15.0], [63.4, 15.0], [63.5, 15.0], [63.6, 15.0], [63.7, 15.0], [63.8, 15.0], [63.9, 16.0], [64.0, 16.0], [64.1, 16.0], [64.2, 16.0], [64.3, 16.0], [64.4, 16.0], [64.5, 16.0], [64.6, 16.0], [64.7, 16.0], [64.8, 16.0], [64.9, 16.0], [65.0, 16.0], [65.1, 17.0], [65.2, 17.0], [65.3, 17.0], [65.4, 17.0], [65.5, 17.0], [65.6, 17.0], [65.7, 18.0], [65.8, 18.0], [65.9, 18.0], [66.0, 18.0], [66.1, 19.0], [66.2, 19.0], [66.3, 19.0], [66.4, 20.0], [66.5, 20.0], [66.6, 20.0], [66.7, 21.0], [66.8, 22.0], [66.9, 22.0], [67.0, 23.0], [67.1, 23.0], [67.2, 23.0], [67.3, 24.0], [67.4, 24.0], [67.5, 24.0], [67.6, 24.0], [67.7, 25.0], [67.8, 25.0], [67.9, 25.0], [68.0, 25.0], [68.1, 26.0], [68.2, 26.0], [68.3, 26.0], [68.4, 26.0], [68.5, 27.0], [68.6, 27.0], [68.7, 27.0], [68.8, 27.0], [68.9, 28.0], [69.0, 28.0], [69.1, 28.0], [69.2, 29.0], [69.3, 29.0], [69.4, 30.0], [69.5, 30.0], [69.6, 30.0], [69.7, 31.0], [69.8, 31.0], [69.9, 31.0], [70.0, 32.0], [70.1, 32.0], [70.2, 32.0], [70.3, 33.0], [70.4, 33.0], [70.5, 34.0], [70.6, 35.0], [70.7, 35.0], [70.8, 35.0], [70.9, 36.0], [71.0, 36.0], [71.1, 37.0], [71.2, 37.0], [71.3, 37.0], [71.4, 38.0], [71.5, 38.0], [71.6, 38.0], [71.7, 39.0], [71.8, 39.0], [71.9, 40.0], [72.0, 40.0], [72.1, 41.0], [72.2, 41.0], [72.3, 42.0], [72.4, 42.0], [72.5, 43.0], [72.6, 43.0], [72.7, 44.0], [72.8, 44.0], [72.9, 45.0], [73.0, 45.0], [73.1, 46.0], [73.2, 47.0], [73.3, 47.0], [73.4, 47.0], [73.5, 48.0], [73.6, 49.0], [73.7, 49.0], [73.8, 50.0], [73.9, 50.0], [74.0, 51.0], [74.1, 51.0], [74.2, 52.0], [74.3, 52.0], [74.4, 53.0], [74.5, 54.0], [74.6, 54.0], [74.7, 55.0], [74.8, 55.0], [74.9, 56.0], [75.0, 56.0], [75.1, 57.0], [75.2, 57.0], [75.3, 58.0], [75.4, 58.0], [75.5, 59.0], [75.6, 60.0], [75.7, 60.0], [75.8, 61.0], [75.9, 62.0], [76.0, 63.0], [76.1, 63.0], [76.2, 64.0], [76.3, 64.0], [76.4, 65.0], [76.5, 66.0], [76.6, 67.0], [76.7, 67.0], [76.8, 68.0], [76.9, 69.0], [77.0, 69.0], [77.1, 70.0], [77.2, 71.0], [77.3, 72.0], [77.4, 73.0], [77.5, 73.0], [77.6, 74.0], [77.7, 75.0], [77.8, 76.0], [77.9, 77.0], [78.0, 78.0], [78.1, 78.0], [78.2, 79.0], [78.3, 80.0], [78.4, 81.0], [78.5, 82.0], [78.6, 83.0], [78.7, 84.0], [78.8, 85.0], [78.9, 85.0], [79.0, 86.0], [79.1, 88.0], [79.2, 88.0], [79.3, 89.0], [79.4, 91.0], [79.5, 92.0], [79.6, 93.0], [79.7, 94.0], [79.8, 95.0], [79.9, 96.0], [80.0, 96.0], [80.1, 97.0], [80.2, 98.0], [80.3, 99.0], [80.4, 100.0], [80.5, 102.0], [80.6, 103.0], [80.7, 104.0], [80.8, 104.0], [80.9, 106.0], [81.0, 106.0], [81.1, 107.0], [81.2, 108.0], [81.3, 109.0], [81.4, 110.0], [81.5, 112.0], [81.6, 113.0], [81.7, 114.0], [81.8, 115.0], [81.9, 116.0], [82.0, 117.0], [82.1, 118.0], [82.2, 119.0], [82.3, 120.0], [82.4, 122.0], [82.5, 123.0], [82.6, 124.0], [82.7, 126.0], [82.8, 127.0], [82.9, 128.0], [83.0, 129.0], [83.1, 131.0], [83.2, 132.0], [83.3, 133.0], [83.4, 135.0], [83.5, 136.0], [83.6, 138.0], [83.7, 139.0], [83.8, 141.0], [83.9, 141.0], [84.0, 143.0], [84.1, 144.0], [84.2, 146.0], [84.3, 148.0], [84.4, 150.0], [84.5, 151.0], [84.6, 152.0], [84.7, 154.0], [84.8, 155.0], [84.9, 158.0], [85.0, 159.0], [85.1, 161.0], [85.2, 162.0], [85.3, 164.0], [85.4, 165.0], [85.5, 168.0], [85.6, 170.0], [85.7, 172.0], [85.8, 173.0], [85.9, 175.0], [86.0, 177.0], [86.1, 179.0], [86.2, 180.0], [86.3, 182.0], [86.4, 184.0], [86.5, 185.0], [86.6, 187.0], [86.7, 189.0], [86.8, 191.0], [86.9, 193.0], [87.0, 195.0], [87.1, 196.0], [87.2, 198.0], [87.3, 200.0], [87.4, 202.0], [87.5, 205.0], [87.6, 207.0], [87.7, 209.0], [87.8, 211.0], [87.9, 213.0], [88.0, 215.0], [88.1, 217.0], [88.2, 219.0], [88.3, 222.0], [88.4, 224.0], [88.5, 227.0], [88.6, 230.0], [88.7, 233.0], [88.8, 235.0], [88.9, 238.0], [89.0, 241.0], [89.1, 244.0], [89.2, 247.0], [89.3, 251.0], [89.4, 254.0], [89.5, 257.0], [89.6, 261.0], [89.7, 264.0], [89.8, 269.0], [89.9, 272.0], [90.0, 276.0], [90.1, 279.0], [90.2, 283.0], [90.3, 286.0], [90.4, 290.0], [90.5, 293.0], [90.6, 296.0], [90.7, 299.0], [90.8, 302.0], [90.9, 305.0], [91.0, 309.0], [91.1, 312.0], [91.2, 316.0], [91.3, 320.0], [91.4, 325.0], [91.5, 331.0], [91.6, 335.0], [91.7, 341.0], [91.8, 346.0], [91.9, 353.0], [92.0, 358.0], [92.1, 365.0], [92.2, 371.0], [92.3, 377.0], [92.4, 382.0], [92.5, 386.0], [92.6, 393.0], [92.7, 398.0], [92.8, 402.0], [92.9, 409.0], [93.0, 417.0], [93.1, 423.0], [93.2, 430.0], [93.3, 434.0], [93.4, 441.0], [93.5, 447.0], [93.6, 456.0], [93.7, 464.0], [93.8, 470.0], [93.9, 478.0], [94.0, 485.0], [94.1, 490.0], [94.2, 496.0], [94.3, 506.0], [94.4, 514.0], [94.5, 521.0], [94.6, 528.0], [94.7, 534.0], [94.8, 542.0], [94.9, 552.0], [95.0, 560.0], [95.1, 569.0], [95.2, 579.0], [95.3, 589.0], [95.4, 597.0], [95.5, 606.0], [95.6, 611.0], [95.7, 618.0], [95.8, 623.0], [95.9, 634.0], [96.0, 644.0], [96.1, 652.0], [96.2, 657.0], [96.3, 663.0], [96.4, 668.0], [96.5, 675.0], [96.6, 682.0], [96.7, 692.0], [96.8, 702.0], [96.9, 717.0], [97.0, 732.0], [97.1, 747.0], [97.2, 761.0], [97.3, 770.0], [97.4, 785.0], [97.5, 797.0], [97.6, 804.0], [97.7, 815.0], [97.8, 834.0], [97.9, 854.0], [98.0, 874.0], [98.1, 890.0], [98.2, 901.0], [98.3, 908.0], [98.4, 914.0], [98.5, 920.0], [98.6, 924.0], [98.7, 929.0], [98.8, 934.0], [98.9, 940.0], [99.0, 948.0], [99.1, 970.0], [99.2, 1006.0], [99.3, 1030.0], [99.4, 1098.0], [99.5, 1158.0], [99.6, 1250.0], [99.7, 1287.0], [99.8, 1400.0], [99.9, 1675.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 24098.0, "series": [{"data": [[0.0, 24098.0], [600.0, 404.0], [2400.0, 1.0], [700.0, 228.0], [200.0, 1038.0], [800.0, 193.0], [900.0, 301.0], [1000.0, 65.0], [1100.0, 39.0], [300.0, 609.0], [1200.0, 63.0], [1300.0, 17.0], [1400.0, 15.0], [100.0, 2078.0], [400.0, 451.0], [1600.0, 32.0], [1700.0, 10.0], [1900.0, 2.0], [500.0, 356.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 2400.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 41.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 28234.0, "series": [{"data": [[1.0, 1680.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 41.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 28234.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 45.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 45.07014077550008, "minX": 1.52637498E12, "maxY": 549.3197881472018, "series": [{"data": [[1.52637504E12, 45.07014077550008], [1.52637498E12, 549.3197881472018]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52637504E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 11.523076923076921, "minX": 1.0, "maxY": 920.0, "series": [{"data": [[2.0, 14.636363636363637], [3.0, 13.055555555555557], [4.0, 12.833333333333334], [5.0, 11.523076923076921], [6.0, 12.117074701820465], [7.0, 12.845861084681296], [8.0, 15.251572327044029], [9.0, 20.015873015873016], [10.0, 21.272727272727273], [11.0, 28.892857142857142], [12.0, 24.79310344827586], [13.0, 21.871794871794876], [14.0, 42.949999999999996], [15.0, 31.38888888888889], [16.0, 23.75], [17.0, 40.4516129032258], [18.0, 23.363636363636367], [19.0, 20.952380952380953], [20.0, 33.85714285714286], [21.0, 26.937500000000004], [22.0, 38.27586206896552], [23.0, 29.85714285714285], [24.0, 32.35714285714286], [25.0, 31.235294117647054], [26.0, 25.63636363636363], [27.0, 29.142857142857142], [28.0, 15.642857142857142], [29.0, 22.900000000000002], [30.0, 28.09090909090909], [31.0, 22.0], [32.0, 24.166666666666668], [33.0, 15.0], [34.0, 29.666666666666664], [35.0, 17.0], [36.0, 16.333333333333332], [37.0, 18.25], [39.0, 14.75], [38.0, 15.0], [40.0, 14.0], [42.0, 14.75], [43.0, 14.0], [44.0, 14.0], [45.0, 14.0], [46.0, 14.0], [48.0, 18.333333333333332], [49.0, 14.0], [50.0, 20.0], [51.0, 20.5], [52.0, 21.5], [53.0, 26.666666666666668], [54.0, 25.0], [55.0, 25.5], [57.0, 13.5], [59.0, 14.0], [61.0, 13.0], [63.0, 14.833333333333334], [62.0, 15.0], [64.0, 15.333333333333334], [67.0, 16.666666666666668], [65.0, 14.0], [69.0, 22.0], [70.0, 14.333333333333334], [71.0, 17.6], [68.0, 13.0], [73.0, 32.0], [75.0, 14.25], [72.0, 12.0], [74.0, 15.0], [76.0, 12.5], [77.0, 22.666666666666668], [78.0, 27.0], [79.0, 13.0], [81.0, 18.333333333333332], [82.0, 14.0], [83.0, 28.0], [80.0, 13.5], [84.0, 31.5], [85.0, 14.666666666666666], [86.0, 24.0], [87.0, 15.25], [89.0, 26.0], [90.0, 12.5], [95.0, 61.76923076923077], [93.0, 12.0], [92.0, 13.0], [96.0, 35.8], [98.0, 15.4], [99.0, 135.0], [97.0, 13.0], [100.0, 13.75], [101.0, 30.615384615384613], [102.0, 17.250000000000004], [103.0, 14.363636363636365], [104.0, 21.333333333333332], [106.0, 14.0], [107.0, 38.166666666666664], [105.0, 14.111111111111112], [108.0, 17.571428571428573], [110.0, 23.999999999999996], [111.0, 21.25], [109.0, 12.0], [112.0, 13.4], [113.0, 13.4], [114.0, 41.42857142857143], [115.0, 12.666666666666666], [116.0, 30.214285714285708], [117.0, 12.666666666666666], [118.0, 13.333333333333334], [119.0, 13.333333333333334], [120.0, 57.0], [123.0, 21.333333333333332], [121.0, 13.0], [122.0, 12.6], [125.0, 21.8], [126.0, 17.25], [127.0, 70.25], [124.0, 14.0], [129.0, 39.5], [133.0, 14.625], [134.0, 33.333333333333336], [135.0, 43.42857142857143], [128.0, 13.333333333333334], [131.0, 13.25], [132.0, 13.4], [130.0, 13.0], [138.0, 16.5], [139.0, 23.875], [140.0, 21.5], [141.0, 59.6], [136.0, 13.0], [143.0, 13.0], [137.0, 12.666666666666666], [142.0, 14.0], [144.0, 20.0], [145.0, 13.0], [146.0, 21.25], [147.0, 39.111111111111114], [149.0, 24.75], [150.0, 14.0], [151.0, 27.333333333333332], [148.0, 12.5], [152.0, 20.833333333333332], [154.0, 62.2], [155.0, 29.75], [156.0, 19.333333333333332], [157.0, 14.833333333333334], [158.0, 30.333333333333336], [153.0, 13.0], [159.0, 13.0], [160.0, 143.5], [161.0, 24.0], [162.0, 22.0], [163.0, 19.0], [164.0, 13.333333333333334], [166.0, 17.0], [167.0, 149.0], [165.0, 13.0], [168.0, 21.0], [169.0, 13.5], [170.0, 13.666666666666666], [172.0, 13.5], [173.0, 117.33333333333334], [174.0, 23.8], [175.0, 38.0], [171.0, 12.5], [177.0, 20.833333333333332], [179.0, 64.0], [180.0, 17.5], [181.0, 71.5], [183.0, 32.5], [176.0, 12.666666666666666], [182.0, 13.0], [184.0, 16.666666666666668], [186.0, 23.875000000000004], [188.0, 26.5], [187.0, 53.12500000000001], [190.0, 13.75], [185.0, 15.0], [189.0, 14.0], [193.0, 24.25], [192.0, 22.875], [198.0, 74.5], [199.0, 14.4], [196.0, 14.0], [194.0, 13.0], [195.0, 13.333333333333334], [197.0, 19.0], [200.0, 14.333333333333332], [203.0, 108.25], [204.0, 18.0], [205.0, 13.833333333333332], [206.0, 17.666666666666668], [207.0, 13.6], [201.0, 13.0], [202.0, 12.0], [208.0, 22.2], [209.0, 105.5], [210.0, 18.0], [211.0, 18.75], [212.0, 14.0], [213.0, 13.142857142857144], [214.0, 28.0], [215.0, 79.16666666666667], [216.0, 21.166666666666668], [217.0, 25.666666666666668], [218.0, 14.0], [219.0, 37.0], [220.0, 12.6], [221.0, 70.66666666666667], [222.0, 12.666666666666666], [223.0, 13.333333333333334], [224.0, 15.57142857142857], [225.0, 23.625], [226.0, 13.0], [227.0, 73.42857142857143], [229.0, 13.2], [230.0, 42.5], [231.0, 19.333333333333332], [228.0, 13.0], [232.0, 94.66666666666667], [233.0, 26.5], [234.0, 13.0], [236.0, 48.33333333333333], [237.0, 16.75], [238.0, 26.5], [239.0, 85.16666666666667], [235.0, 13.333333333333334], [242.0, 14.0], [243.0, 16.4], [244.0, 15.5], [245.0, 154.0], [246.0, 13.25], [247.0, 37.8], [240.0, 12.5], [241.0, 125.0], [248.0, 19.0], [250.0, 15.5], [251.0, 65.14285714285714], [252.0, 46.25], [253.0, 12.75], [254.0, 12.5], [249.0, 13.0], [255.0, 14.0], [259.0, 12.75], [256.0, 131.0], [263.0, 22.71428571428571], [257.0, 25.166666666666668], [258.0, 61.666666666666664], [264.0, 56.5], [271.0, 13.0], [265.0, 34.0], [267.0, 93.42857142857143], [266.0, 13.0], [269.0, 183.57142857142858], [268.0, 20.0], [270.0, 19.0], [260.0, 41.5], [261.0, 12.333333333333334], [262.0, 14.0], [284.0, 13.5], [274.0, 188.25], [275.0, 22.833333333333332], [276.0, 15.125], [277.0, 13.5], [278.0, 13.8], [279.0, 13.0], [272.0, 13.0], [273.0, 13.2], [280.0, 117.42857142857143], [282.0, 24.2], [281.0, 32.666666666666664], [283.0, 13.75], [285.0, 121.85714285714285], [287.0, 33.0], [286.0, 13.0], [289.0, 18.666666666666668], [288.0, 15.6], [290.0, 14.0], [291.0, 165.4], [292.0, 29.0], [293.0, 20.5], [295.0, 24.90909090909091], [294.0, 21.857142857142858], [297.0, 105.33333333333333], [296.0, 13.142857142857144], [302.0, 14.700000000000001], [303.0, 56.08333333333333], [300.0, 13.040000000000001], [301.0, 14.466666666666669], [298.0, 15.736842105263158], [299.0, 17.166666666666668], [305.0, 20.846153846153847], [304.0, 20.142857142857146], [306.0, 13.416666666666668], [307.0, 14.0], [308.0, 52.933333333333344], [309.0, 14.000000000000002], [310.0, 14.937500000000002], [311.0, 19.0952380952381], [312.0, 14.071428571428571], [318.0, 13.0], [319.0, 44.55], [316.0, 20.684210526315795], [317.0, 13.82608695652174], [313.0, 53.266666666666666], [314.0, 13.882352941176473], [315.0, 13.272727272727273], [323.0, 26.71428571428572], [321.0, 45.83333333333333], [322.0, 13.61904761904762], [324.0, 70.0], [325.0, 13.4], [327.0, 121.36842105263156], [326.0, 13.625], [320.0, 13.777777777777779], [328.0, 41.300000000000004], [329.0, 65.81818181818181], [331.0, 13.285714285714286], [330.0, 12.333333333333334], [333.0, 118.45454545454548], [332.0, 36.0], [335.0, 48.5], [334.0, 20.25], [337.0, 183.09090909090907], [339.0, 41.0], [338.0, 13.0], [340.0, 65.8181818181818], [341.0, 131.0], [342.0, 92.66666666666669], [343.0, 106.2], [336.0, 13.2], [344.0, 18.6], [350.0, 165.57142857142858], [351.0, 12.75], [349.0, 159.5], [348.0, 12.833333333333334], [345.0, 104.6], [346.0, 33.125], [347.0, 13.25], [353.0, 14.166666666666668], [352.0, 19.333333333333336], [355.0, 113.81818181818181], [354.0, 13.2], [364.0, 112.4], [365.0, 18.23076923076923], [366.0, 157.2], [367.0, 57.562499999999986], [357.0, 15.874999999999998], [356.0, 13.5], [358.0, 15.166666666666668], [359.0, 18.166666666666664], [360.0, 13.5], [361.0, 136.87499999999997], [362.0, 167.0], [363.0, 14.444444444444445], [369.0, 15.684210526315791], [368.0, 14.5625], [370.0, 16.117647058823536], [371.0, 13.210526315789473], [372.0, 110.25000000000003], [373.0, 66.0], [375.0, 44.95652173913044], [374.0, 24.875], [377.0, 38.911764705882334], [381.0, 19.703703703703706], [380.0, 33.21621621621622], [382.0, 85.5], [383.0, 30.833333333333336], [376.0, 51.17647058823529], [379.0, 34.36000000000001], [378.0, 28.05882352941176], [385.0, 36.54166666666667], [384.0, 14.64], [386.0, 182.88095238095238], [387.0, 70.45], [388.0, 75.76000000000002], [389.0, 43.28205128205128], [390.0, 66.89655172413795], [391.0, 13.38888888888889], [392.0, 14.2], [398.0, 13.400000000000002], [399.0, 13.805555555555555], [396.0, 27.739130434782606], [397.0, 13.973684210526315], [393.0, 119.0], [394.0, 37.23076923076923], [395.0, 30.95833333333334], [403.0, 14.022727272727275], [401.0, 29.000000000000004], [400.0, 41.90000000000002], [402.0, 21.724999999999998], [405.0, 58.21428571428571], [406.0, 13.433333333333335], [404.0, 30.108108108108116], [407.0, 14.35483870967742], [408.0, 12.771428571428574], [415.0, 82.67857142857142], [413.0, 33.999999999999986], [412.0, 48.599999999999994], [414.0, 85.6785714285714], [409.0, 25.000000000000004], [410.0, 57.02564102564107], [411.0, 44.8095238095238], [429.0, 16.57142857142857], [417.0, 112.54545454545453], [416.0, 33.02777777777777], [419.0, 68.17241379310343], [428.0, 31.1875], [418.0, 33.34374999999999], [430.0, 24.84999999999999], [431.0, 51.622222222222206], [421.0, 30.999999999999996], [422.0, 13.285714285714285], [420.0, 26.28125], [423.0, 28.707317073170728], [424.0, 37.48780487804878], [425.0, 42.93478260869562], [426.0, 34.049180327868854], [427.0, 29.974999999999977], [433.0, 12.75714285714286], [434.0, 14.490566037735848], [435.0, 15.482758620689653], [436.0, 12.666666666666666], [437.0, 30.180000000000007], [438.0, 45.51388888888889], [439.0, 37.98333333333334], [432.0, 21.83870967741934], [442.0, 69.54838709677422], [443.0, 17.21875], [444.0, 26.12676056338029], [446.0, 14.129032258064518], [445.0, 26.249999999999993], [447.0, 27.2528735632184], [440.0, 14.151515151515147], [441.0, 22.47826086956521], [461.0, 24.294117647058826], [463.0, 13.88095238095238], [456.0, 13.192982456140358], [457.0, 12.709090909090907], [462.0, 14.385542168674698], [460.0, 16.010526315789484], [458.0, 17.372549019607856], [452.0, 13.96590909090909], [453.0, 13.122641509433961], [449.0, 15.177215189873417], [448.0, 18.677419354838708], [455.0, 19.628571428571426], [454.0, 14.495049504950495], [451.0, 18.81176470588235], [450.0, 14.784946236559135], [459.0, 27.307692307692317], [476.0, 12.944444444444446], [465.0, 13.568965517241377], [464.0, 16.614035087719298], [466.0, 12.711538461538462], [467.0, 50.13953488372094], [471.0, 14.571428571428571], [469.0, 24.722222222222218], [470.0, 12.210526315789474], [468.0, 17.545454545454547], [473.0, 46.81632653061225], [474.0, 17.107692307692307], [475.0, 15.666666666666664], [477.0, 13.44444444444445], [478.0, 37.65116279069765], [479.0, 17.099999999999994], [472.0, 16.838709677419356], [483.0, 47.333333333333336], [481.0, 17.10714285714285], [480.0, 23.024390243902435], [482.0, 19.83132530120482], [485.0, 27.968750000000007], [484.0, 34.77358490566037], [486.0, 15.946428571428571], [487.0, 21.434210526315802], [488.0, 20.379310344827584], [489.0, 26.634146341463417], [494.0, 38.510869565217405], [495.0, 33.1743119266055], [492.0, 36.2125], [493.0, 21.137931034482758], [490.0, 18.256410256410252], [491.0, 23.784313725490193], [498.0, 40.351851851851855], [497.0, 39.06976744186046], [496.0, 28.292134831460682], [499.0, 53.468468468468494], [508.0, 39.671874999999986], [509.0, 51.09793814432987], [510.0, 51.818181818181806], [511.0, 45.82442748091602], [500.0, 32.24193548387096], [501.0, 30.120967741935484], [502.0, 27.666666666666668], [503.0, 25.237288135593207], [504.0, 30.340136054421794], [505.0, 48.83798882681566], [506.0, 62.582191780821915], [507.0, 49.37096774193549], [517.0, 31.32673267326732], [524.0, 70.52777777777776], [515.0, 39.87313432835823], [513.0, 32.68141592920353], [512.0, 84.8473282442748], [514.0, 25.278571428571443], [526.0, 101.29310344827587], [525.0, 102.05882352941175], [527.0, 56.43333333333334], [516.0, 46.215384615384615], [518.0, 66.65217391304346], [519.0, 59.03174603174604], [536.0, 35.36585365853658], [538.0, 125.80392156862746], [537.0, 35.86842105263158], [539.0, 120.73134328358209], [540.0, 127.6041666666667], [541.0, 92.33333333333333], [542.0, 74.52500000000002], [543.0, 96.53125], [528.0, 48.66176470588235], [529.0, 89.33333333333334], [530.0, 100.9722222222222], [531.0, 90.83636363636361], [532.0, 53.54166666666667], [533.0, 30.649350649350648], [534.0, 59.27777777777778], [535.0, 78.71428571428574], [520.0, 61.45569620253164], [521.0, 65.62499999999997], [522.0, 106.5943396226415], [523.0, 73.99090909090913], [550.0, 144.3], [546.0, 125.22222222222226], [545.0, 141.99999999999997], [544.0, 113.82142857142856], [558.0, 83.73333333333333], [559.0, 89.4782608695652], [547.0, 100.98305084745766], [548.0, 131.73846153846154], [549.0, 112.26229508196724], [561.0, 116.79310344827586], [560.0, 159.12121212121212], [551.0, 101.13333333333335], [568.0, 104.0], [569.0, 98.26923076923079], [570.0, 115.69565217391303], [572.0, 208.03125], [571.0, 155.8684210526316], [574.0, 232.89830508474566], [573.0, 181.34042553191486], [575.0, 179.20000000000007], [562.0, 194.8], [563.0, 211.08333333333331], [565.0, 130.71428571428572], [564.0, 142.28571428571428], [567.0, 80.03030303030303], [566.0, 129.0], [552.0, 66.85999999999999], [553.0, 77.85416666666666], [556.0, 81.02272727272731], [555.0, 98.36170212765958], [554.0, 107.1206896551724], [557.0, 92.83333333333333], [604.0, 350.93181818181824], [599.0, 161.2876712328767], [601.0, 213.31395348837205], [602.0, 241.6805555555556], [603.0, 228.43478260869566], [605.0, 329.49056603773573], [606.0, 256.9130434782609], [607.0, 249.45833333333334], [592.0, 153.57142857142856], [594.0, 222.0526315789474], [595.0, 294.65625000000006], [593.0, 149.1320754716981], [597.0, 185.89473684210526], [596.0, 140.05172413793105], [598.0, 151.37777777777777], [600.0, 188.8421052631579], [589.0, 135.03846153846152], [588.0, 146.64705882352942], [576.0, 197.0196078431372], [590.0, 142.62500000000006], [591.0, 220.26829268292678], [578.0, 132.12195121951223], [577.0, 148.85714285714283], [580.0, 219.3666666666667], [579.0, 266.9577464788732], [582.0, 151.57894736842104], [583.0, 187.27027027027026], [581.0, 140.09459459459458], [587.0, 79.84782608695653], [585.0, 181.02040816326533], [586.0, 114.27777777777777], [584.0, 183.33333333333337], [615.0, 294.4054054054054], [611.0, 178.76315789473685], [608.0, 155.8571428571429], [623.0, 269.0526315789474], [621.0, 237.15384615384602], [622.0, 316.8301886792454], [609.0, 150.64705882352945], [610.0, 237.7894736842105], [612.0, 211.56410256410263], [613.0, 204.7037037037037], [614.0, 276.7407407407407], [624.0, 312.6851851851853], [625.0, 283.25], [637.0, 187.17948717948713], [638.0, 168.48000000000002], [639.0, 173.3076923076923], [635.0, 212.5], [636.0, 112.19444444444443], [633.0, 287.68181818181813], [632.0, 184.78947368421052], [634.0, 272.55172413793105], [626.0, 281.47727272727275], [627.0, 239.3714285714285], [628.0, 171.90322580645162], [629.0, 199.7714285714286], [630.0, 231.61111111111111], [631.0, 136.42857142857144], [617.0, 201.51999999999998], [616.0, 218.85294117647055], [619.0, 370.12903225806446], [618.0, 220.27450980392152], [620.0, 204.06382978723406], [646.0, 208.19354838709677], [642.0, 67.24444444444444], [640.0, 232.46938775510208], [641.0, 123.54761904761908], [655.0, 152.1451612903226], [654.0, 316.68421052631584], [652.0, 529.90625], [653.0, 226.3448275862069], [643.0, 91.36734693877553], [644.0, 108.63888888888889], [645.0, 109.17073170731707], [656.0, 166.62962962962968], [670.0, 150.9056603773585], [669.0, 90.7560975609756], [671.0, 115.82500000000003], [667.0, 121.675], [668.0, 192.9761904761905], [665.0, 189.52631578947373], [647.0, 51.09090909090909], [664.0, 158.14814814814812], [666.0, 185.45945945945945], [657.0, 163.87499999999997], [658.0, 230.8181818181818], [659.0, 207.8974358974359], [662.0, 190.27272727272728], [660.0, 168.09756097560975], [661.0, 139.84210526315795], [663.0, 246.37499999999994], [648.0, 172.71052631578948], [649.0, 161.10256410256412], [650.0, 140.97142857142856], [651.0, 304.42424242424244], [698.0, 203.59374999999994], [673.0, 181.2258064516129], [672.0, 166.64444444444447], [674.0, 171.41379310344826], [675.0, 198.42857142857147], [676.0, 131.3809523809524], [677.0, 167.7619047619048], [678.0, 165.41176470588235], [679.0, 131.74999999999997], [697.0, 214.7692307692308], [696.0, 183.0909090909091], [699.0, 137.22857142857143], [701.0, 183.89189189189196], [700.0, 129.21212121212122], [703.0, 180.7307692307692], [689.0, 174.5], [690.0, 117.18750000000001], [688.0, 114.68571428571428], [702.0, 147.49999999999997], [684.0, 110.04000000000002], [683.0, 199.0], [682.0, 211.62962962962962], [680.0, 137.625], [681.0, 179.63333333333333], [686.0, 133.1388888888889], [685.0, 100.39393939393939], [687.0, 142.2571428571429], [691.0, 179.17777777777783], [693.0, 204.83333333333331], [692.0, 243.83333333333331], [695.0, 150.48648648648654], [694.0, 195.57142857142856], [731.0, 201.95652173913038], [716.0, 307.75757575757575], [715.0, 228.89999999999998], [712.0, 256.4576271186439], [714.0, 142.53061224489792], [713.0, 173.8333333333334], [718.0, 258.7674418604651], [711.0, 210.0392156862745], [709.0, 319.566037735849], [708.0, 286.1449275362319], [706.0, 218.7894736842105], [707.0, 212.05405405405406], [705.0, 148.04545454545453], [704.0, 192.00000000000003], [710.0, 158.44186046511626], [719.0, 383.8541666666669], [717.0, 287.1714285714286], [728.0, 242.99999999999997], [735.0, 530.9651162790697], [720.0, 223.16417910447765], [721.0, 191.25000000000003], [722.0, 247.38709677419357], [723.0, 285.344827586207], [724.0, 346.4565217391305], [725.0, 524.4285714285713], [726.0, 256.75], [727.0, 320.94736842105266], [734.0, 223.70454545454547], [732.0, 219.48780487804876], [730.0, 281.1714285714285], [733.0, 272.2307692307692], [729.0, 304.1272727272727], [765.0, 266.53846153846155], [748.0, 226.25806451612905], [739.0, 294.25373134328345], [743.0, 328.0555555555556], [742.0, 321.2931034482757], [741.0, 378.875], [740.0, 211.48148148148144], [750.0, 314.5652173913044], [751.0, 81.50000000000001], [749.0, 198.36], [737.0, 280.38888888888874], [738.0, 376.975], [736.0, 261.74], [744.0, 247.92500000000007], [745.0, 325.85294117647067], [747.0, 359.7142857142857], [746.0, 547.3000000000001], [753.0, 309.25000000000006], [752.0, 467.5], [766.0, 273.57142857142867], [767.0, 316.7], [756.0, 272.925], [755.0, 243.04255319148933], [754.0, 150.264705882353], [759.0, 246.13793103448276], [758.0, 487.90909090909093], [757.0, 255.49999999999997], [764.0, 293.24], [763.0, 462.5384615384615], [761.0, 710.2307692307693], [762.0, 496.14285714285705], [760.0, 494.68000000000006], [774.0, 358.33333333333337], [778.0, 389.9166666666667], [768.0, 230.41666666666663], [779.0, 494.7058823529413], [780.0, 320.4545454545455], [781.0, 357.75], [782.0, 403.06666666666666], [783.0, 333.7142857142857], [769.0, 295.77777777777777], [777.0, 314.05555555555554], [776.0, 391.8181818181818], [775.0, 300.0], [792.0, 349.25], [793.0, 349.0], [771.0, 368.2222222222223], [773.0, 405.7142857142857], [772.0, 376.16666666666663], [770.0, 272.5], [794.0, 213.0], [796.0, 361.7], [797.0, 286.66666666666663], [798.0, 740.375], [799.0, 204.99999999999994], [795.0, 294.4], [787.0, 115.55555555555556], [788.0, 213.79999999999998], [789.0, 432.28571428571433], [790.0, 258.5333333333333], [791.0, 835.0], [786.0, 659.5], [785.0, 909.0], [784.0, 427.25], [804.0, 523.4285714285714], [800.0, 390.82352941176475], [813.0, 234.80952380952385], [815.0, 213.19999999999996], [814.0, 160.57142857142858], [812.0, 271.11764705882354], [811.0, 411.2105263157896], [808.0, 368.5], [810.0, 316.1428571428571], [809.0, 169.625], [801.0, 273.0], [803.0, 556.1428571428571], [802.0, 232.0], [805.0, 444.75], [806.0, 478.2], [807.0, 399.0], [824.0, 164.22222222222223], [826.0, 337.75], [825.0, 420.75000000000006], [827.0, 164.85714285714286], [828.0, 203.5], [829.0, 240.66666666666666], [830.0, 174.75], [831.0, 236.0], [816.0, 226.72], [817.0, 348.1428571428571], [818.0, 699.0], [821.0, 654.3000000000001], [823.0, 175.0], [822.0, 411.6], [819.0, 541.4761904761906], [820.0, 617.5], [838.0, 130.8181818181818], [833.0, 170.66666666666666], [832.0, 206.2], [847.0, 301.25], [846.0, 229.20000000000002], [845.0, 202.25], [842.0, 120.5], [844.0, 203.8], [834.0, 164.55555555555554], [835.0, 227.5], [837.0, 271.0], [836.0, 119.0], [839.0, 185.71428571428572], [856.0, 196.0], [857.0, 235.5], [858.0, 213.0], [859.0, 463.0], [860.0, 449.0], [861.0, 269.0], [862.0, 370.0], [863.0, 318.0], [848.0, 92.5], [850.0, 214.0], [851.0, 262.375], [852.0, 197.0], [853.0, 207.0], [854.0, 250.0], [855.0, 414.0], [849.0, 176.25], [840.0, 148.5], [841.0, 377.0], [870.0, 333.25], [866.0, 468.0], [865.0, 323.75], [878.0, 408.5], [879.0, 193.0], [876.0, 80.0], [877.0, 255.8], [867.0, 292.0], [868.0, 485.0], [869.0, 173.0], [871.0, 479.0], [888.0, 18.0], [889.0, 383.0], [891.0, 244.8], [893.0, 215.0], [894.0, 541.0], [895.0, 245.0], [880.0, 142.5], [881.0, 259.0], [884.0, 373.0], [886.0, 212.66666666666666], [887.0, 247.33333333333331], [873.0, 398.5], [874.0, 16.0], [875.0, 405.6], [903.0, 76.0], [899.0, 228.0], [897.0, 255.0], [910.0, 415.0], [911.0, 273.0], [908.0, 204.0], [909.0, 143.5], [900.0, 254.0], [901.0, 554.0], [902.0, 296.5], [912.0, 580.0], [927.0, 91.0], [925.0, 328.5], [926.0, 274.0], [922.0, 82.0], [924.0, 438.5], [920.0, 105.5], [921.0, 309.0], [913.0, 571.0], [914.0, 44.0], [915.0, 254.66666666666666], [917.0, 167.0], [918.0, 593.0], [919.0, 317.5], [904.0, 546.0], [905.0, 175.33333333333331], [906.0, 567.0], [907.0, 56.0], [930.0, 329.5], [940.0, 58.0], [929.0, 283.0], [943.0, 672.0], [941.0, 85.0], [942.0, 376.3333333333333], [931.0, 426.3333333333333], [932.0, 181.0], [933.0, 102.0], [953.0, 550.6666666666666], [955.0, 113.0], [956.0, 223.0], [957.0, 660.0], [958.0, 667.0], [959.0, 510.5], [944.0, 633.0], [946.0, 96.0], [947.0, 94.0], [948.0, 385.25], [949.0, 351.75], [950.0, 150.0], [951.0, 648.0], [936.0, 262.5], [937.0, 359.25], [939.0, 92.4], [966.0, 154.0], [961.0, 301.0], [960.0, 140.5], [975.0, 708.5], [972.0, 213.5], [973.0, 691.0], [962.0, 357.3333333333333], [963.0, 146.0], [964.0, 803.6666666666666], [965.0, 228.0], [967.0, 347.0], [984.0, 393.0], [985.0, 730.0], [986.0, 126.0], [987.0, 265.0], [989.0, 629.3333333333334], [988.0, 277.5], [990.0, 687.0], [976.0, 187.16666666666669], [977.0, 387.0], [978.0, 541.0], [981.0, 523.0], [979.0, 14.0], [982.0, 115.0], [983.0, 379.66666666666663], [970.0, 697.5], [971.0, 113.0], [998.0, 769.0], [993.0, 221.5], [992.0, 311.33333333333337], [1006.0, 606.5], [1007.0, 185.0], [1004.0, 774.5], [1005.0, 161.0], [1002.0, 338.0], [1003.0, 86.0], [995.0, 516.75], [996.0, 327.3333333333333], [997.0, 296.0], [999.0, 756.0], [1016.0, 792.0], [1017.0, 180.33333333333331], [1018.0, 71.0], [1019.0, 241.5], [1020.0, 111.0], [1021.0, 141.0], [1022.0, 343.75], [1023.0, 80.0], [1009.0, 444.5], [1010.0, 780.0], [1011.0, 474.5], [1012.0, 282.0], [1014.0, 802.0], [1015.0, 108.0], [1000.0, 294.3333333333333], [1001.0, 364.0], [1028.0, 89.0], [1046.0, 164.0], [1026.0, 20.0], [1052.0, 175.0], [1054.0, 105.5], [1048.0, 107.6], [1050.0, 534.0], [1032.0, 230.4], [1030.0, 12.0], [1034.0, 141.0], [1038.0, 252.0], [1072.0, 907.0], [1074.0, 154.5], [1076.0, 141.0], [1078.0, 920.0], [1082.0, 124.0], [1084.0, 262.0], [1086.0, 136.33333333333334], [1056.0, 545.0], [1058.0, 146.5], [1060.0, 88.0], [1062.0, 557.0], [1064.0, 134.66666666666666], [1068.0, 478.25], [1070.0, 110.5], [1040.0, 452.3333333333333], [1042.0, 57.0], [1044.0, 521.0], [1088.0, 605.0], [1090.0, 148.5], [1092.0, 174.33333333333334], [1094.0, 617.0], [1100.0, 317.0], [1102.0, 163.66666666666666], [1027.0, 273.5], [1025.0, 482.0], [1029.0, 818.0], [1033.0, 98.0], [1035.0, 472.0], [1037.0, 47.0], [1059.0, 511.0], [1085.0, 490.0], [1057.0, 153.0], [1079.0, 163.5], [1081.0, 378.0], [1075.0, 335.3333333333333], [1077.0, 161.0], [1063.0, 158.5], [1065.0, 495.5], [1071.0, 157.0], [1043.0, 109.0], [1041.0, 675.0], [1047.0, 855.0], [1053.0, 241.66666666666669], [1089.0, 300.0], [1091.0, 523.0], [1095.0, 187.0], [1097.0, 334.6], [1101.0, 351.0], [1103.0, 454.0], [1093.0, 144.0], [1.0, 15.031249999999998]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[413.20646666666806, 93.92133333333274]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1103.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 767415.5666666667, "minX": 1.52637498E12, "maxY": 3993878.15, "series": [{"data": [[1.52637504E12, 1479369.6333333333], [1.52637498E12, 3993878.15]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52637504E12, 767415.5666666667], [1.52637498E12, 2075559.7833333334]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52637504E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 13.817115337120281, "minX": 1.52637498E12, "maxY": 123.5389005570262, "series": [{"data": [[1.52637504E12, 13.817115337120281], [1.52637498E12, 123.5389005570262]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52637504E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 13.802914299827114, "minX": 1.52637498E12, "maxY": 123.44580403615986, "series": [{"data": [[1.52637504E12, 13.802914299827114], [1.52637498E12, 123.44580403615986]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52637504E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.2214126944924666, "minX": 1.52637498E12, "maxY": 0.7661857364624246, "series": [{"data": [[1.52637504E12, 0.2214126944924666], [1.52637498E12, 0.7661857364624246]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52637504E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 11.0, "minX": 1.52637498E12, "maxY": 2470.0, "series": [{"data": [[1.52637504E12, 219.0], [1.52637498E12, 2470.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52637504E12, 11.0], [1.52637498E12, 11.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52637504E12, 200.0], [1.52637498E12, 409.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52637504E12, 943.0], [1.52637498E12, 1042.9900000000016]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52637504E12, 530.9500000000007], [1.52637498E12, 680.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52637504E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 1.0, "minX": 134.0, "maxY": 15.0, "series": [{"data": [[134.0, 12.0], [365.0, 15.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[365.0, 1.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 365.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 1.0, "minX": 134.0, "maxY": 15.0, "series": [{"data": [[134.0, 12.0], [365.0, 15.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[365.0, 1.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 365.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 134.96666666666667, "minX": 1.52637498E12, "maxY": 365.03333333333336, "series": [{"data": [[1.52637504E12, 134.96666666666667], [1.52637498E12, 365.03333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52637504E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.6833333333333333, "minX": 1.52637498E12, "maxY": 364.35, "series": [{"data": [[1.52637504E12, 134.96666666666667], [1.52637498E12, 364.35]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52637498E12, 0.6833333333333333]], "isOverall": false, "label": "502", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52637504E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.6833333333333333, "minX": 1.52637498E12, "maxY": 364.35, "series": [{"data": [[1.52637504E12, 134.96666666666667], [1.52637498E12, 364.35]], "isOverall": false, "label": "inference-success", "isController": false}, {"data": [[1.52637498E12, 0.6833333333333333]], "isOverall": false, "label": "inference-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52637504E12, "title": "Transactions Per Second"}},
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
