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
        data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 1897.0, "series": [{"data": [[0.0, 0.0], [0.1, 0.0], [0.2, 1.0], [0.3, 1.0], [0.4, 11.0], [0.5, 11.0], [0.6, 11.0], [0.7, 11.0], [0.8, 11.0], [0.9, 11.0], [1.0, 11.0], [1.1, 11.0], [1.2, 11.0], [1.3, 11.0], [1.4, 11.0], [1.5, 11.0], [1.6, 11.0], [1.7, 11.0], [1.8, 11.0], [1.9, 11.0], [2.0, 11.0], [2.1, 11.0], [2.2, 11.0], [2.3, 11.0], [2.4, 11.0], [2.5, 11.0], [2.6, 11.0], [2.7, 11.0], [2.8, 11.0], [2.9, 11.0], [3.0, 11.0], [3.1, 11.0], [3.2, 11.0], [3.3, 11.0], [3.4, 11.0], [3.5, 11.0], [3.6, 11.0], [3.7, 11.0], [3.8, 11.0], [3.9, 11.0], [4.0, 11.0], [4.1, 11.0], [4.2, 11.0], [4.3, 11.0], [4.4, 11.0], [4.5, 11.0], [4.6, 11.0], [4.7, 11.0], [4.8, 11.0], [4.9, 11.0], [5.0, 11.0], [5.1, 11.0], [5.2, 11.0], [5.3, 11.0], [5.4, 11.0], [5.5, 11.0], [5.6, 11.0], [5.7, 11.0], [5.8, 11.0], [5.9, 11.0], [6.0, 11.0], [6.1, 11.0], [6.2, 11.0], [6.3, 11.0], [6.4, 11.0], [6.5, 11.0], [6.6, 11.0], [6.7, 11.0], [6.8, 11.0], [6.9, 12.0], [7.0, 12.0], [7.1, 12.0], [7.2, 12.0], [7.3, 12.0], [7.4, 12.0], [7.5, 12.0], [7.6, 12.0], [7.7, 12.0], [7.8, 12.0], [7.9, 12.0], [8.0, 12.0], [8.1, 12.0], [8.2, 12.0], [8.3, 12.0], [8.4, 12.0], [8.5, 12.0], [8.6, 12.0], [8.7, 12.0], [8.8, 12.0], [8.9, 12.0], [9.0, 12.0], [9.1, 12.0], [9.2, 12.0], [9.3, 12.0], [9.4, 12.0], [9.5, 12.0], [9.6, 12.0], [9.7, 12.0], [9.8, 12.0], [9.9, 12.0], [10.0, 12.0], [10.1, 12.0], [10.2, 12.0], [10.3, 12.0], [10.4, 12.0], [10.5, 12.0], [10.6, 12.0], [10.7, 12.0], [10.8, 12.0], [10.9, 12.0], [11.0, 12.0], [11.1, 12.0], [11.2, 12.0], [11.3, 12.0], [11.4, 12.0], [11.5, 12.0], [11.6, 12.0], [11.7, 12.0], [11.8, 12.0], [11.9, 12.0], [12.0, 12.0], [12.1, 12.0], [12.2, 12.0], [12.3, 12.0], [12.4, 12.0], [12.5, 12.0], [12.6, 12.0], [12.7, 12.0], [12.8, 12.0], [12.9, 12.0], [13.0, 12.0], [13.1, 12.0], [13.2, 12.0], [13.3, 12.0], [13.4, 12.0], [13.5, 12.0], [13.6, 12.0], [13.7, 12.0], [13.8, 12.0], [13.9, 12.0], [14.0, 12.0], [14.1, 12.0], [14.2, 12.0], [14.3, 12.0], [14.4, 12.0], [14.5, 12.0], [14.6, 12.0], [14.7, 12.0], [14.8, 12.0], [14.9, 12.0], [15.0, 12.0], [15.1, 12.0], [15.2, 12.0], [15.3, 12.0], [15.4, 12.0], [15.5, 12.0], [15.6, 12.0], [15.7, 12.0], [15.8, 12.0], [15.9, 12.0], [16.0, 12.0], [16.1, 12.0], [16.2, 12.0], [16.3, 12.0], [16.4, 12.0], [16.5, 12.0], [16.6, 12.0], [16.7, 12.0], [16.8, 12.0], [16.9, 12.0], [17.0, 12.0], [17.1, 12.0], [17.2, 12.0], [17.3, 12.0], [17.4, 12.0], [17.5, 12.0], [17.6, 12.0], [17.7, 12.0], [17.8, 12.0], [17.9, 12.0], [18.0, 12.0], [18.1, 12.0], [18.2, 12.0], [18.3, 12.0], [18.4, 12.0], [18.5, 12.0], [18.6, 12.0], [18.7, 12.0], [18.8, 12.0], [18.9, 12.0], [19.0, 12.0], [19.1, 12.0], [19.2, 12.0], [19.3, 12.0], [19.4, 12.0], [19.5, 12.0], [19.6, 12.0], [19.7, 12.0], [19.8, 12.0], [19.9, 12.0], [20.0, 12.0], [20.1, 12.0], [20.2, 12.0], [20.3, 12.0], [20.4, 12.0], [20.5, 12.0], [20.6, 12.0], [20.7, 12.0], [20.8, 12.0], [20.9, 12.0], [21.0, 12.0], [21.1, 12.0], [21.2, 12.0], [21.3, 12.0], [21.4, 12.0], [21.5, 12.0], [21.6, 12.0], [21.7, 12.0], [21.8, 12.0], [21.9, 12.0], [22.0, 12.0], [22.1, 12.0], [22.2, 12.0], [22.3, 12.0], [22.4, 12.0], [22.5, 12.0], [22.6, 12.0], [22.7, 12.0], [22.8, 12.0], [22.9, 12.0], [23.0, 12.0], [23.1, 12.0], [23.2, 12.0], [23.3, 12.0], [23.4, 12.0], [23.5, 12.0], [23.6, 12.0], [23.7, 12.0], [23.8, 12.0], [23.9, 12.0], [24.0, 12.0], [24.1, 12.0], [24.2, 12.0], [24.3, 12.0], [24.4, 12.0], [24.5, 12.0], [24.6, 12.0], [24.7, 12.0], [24.8, 12.0], [24.9, 12.0], [25.0, 12.0], [25.1, 12.0], [25.2, 12.0], [25.3, 12.0], [25.4, 12.0], [25.5, 12.0], [25.6, 12.0], [25.7, 12.0], [25.8, 12.0], [25.9, 12.0], [26.0, 12.0], [26.1, 12.0], [26.2, 12.0], [26.3, 12.0], [26.4, 12.0], [26.5, 12.0], [26.6, 12.0], [26.7, 12.0], [26.8, 12.0], [26.9, 12.0], [27.0, 12.0], [27.1, 12.0], [27.2, 12.0], [27.3, 12.0], [27.4, 12.0], [27.5, 12.0], [27.6, 12.0], [27.7, 12.0], [27.8, 12.0], [27.9, 12.0], [28.0, 12.0], [28.1, 12.0], [28.2, 12.0], [28.3, 12.0], [28.4, 12.0], [28.5, 12.0], [28.6, 12.0], [28.7, 12.0], [28.8, 12.0], [28.9, 12.0], [29.0, 12.0], [29.1, 12.0], [29.2, 12.0], [29.3, 12.0], [29.4, 12.0], [29.5, 12.0], [29.6, 12.0], [29.7, 12.0], [29.8, 12.0], [29.9, 12.0], [30.0, 12.0], [30.1, 12.0], [30.2, 12.0], [30.3, 12.0], [30.4, 12.0], [30.5, 12.0], [30.6, 12.0], [30.7, 12.0], [30.8, 12.0], [30.9, 12.0], [31.0, 12.0], [31.1, 12.0], [31.2, 12.0], [31.3, 12.0], [31.4, 12.0], [31.5, 12.0], [31.6, 12.0], [31.7, 12.0], [31.8, 12.0], [31.9, 12.0], [32.0, 12.0], [32.1, 12.0], [32.2, 12.0], [32.3, 12.0], [32.4, 12.0], [32.5, 12.0], [32.6, 12.0], [32.7, 12.0], [32.8, 12.0], [32.9, 12.0], [33.0, 12.0], [33.1, 12.0], [33.2, 12.0], [33.3, 12.0], [33.4, 12.0], [33.5, 12.0], [33.6, 12.0], [33.7, 12.0], [33.8, 12.0], [33.9, 12.0], [34.0, 12.0], [34.1, 12.0], [34.2, 12.0], [34.3, 12.0], [34.4, 12.0], [34.5, 12.0], [34.6, 12.0], [34.7, 12.0], [34.8, 12.0], [34.9, 12.0], [35.0, 12.0], [35.1, 12.0], [35.2, 12.0], [35.3, 12.0], [35.4, 12.0], [35.5, 12.0], [35.6, 12.0], [35.7, 12.0], [35.8, 12.0], [35.9, 12.0], [36.0, 12.0], [36.1, 12.0], [36.2, 12.0], [36.3, 12.0], [36.4, 12.0], [36.5, 12.0], [36.6, 12.0], [36.7, 12.0], [36.8, 12.0], [36.9, 12.0], [37.0, 12.0], [37.1, 12.0], [37.2, 12.0], [37.3, 12.0], [37.4, 12.0], [37.5, 12.0], [37.6, 12.0], [37.7, 12.0], [37.8, 12.0], [37.9, 12.0], [38.0, 12.0], [38.1, 12.0], [38.2, 12.0], [38.3, 12.0], [38.4, 12.0], [38.5, 12.0], [38.6, 12.0], [38.7, 12.0], [38.8, 12.0], [38.9, 12.0], [39.0, 12.0], [39.1, 12.0], [39.2, 12.0], [39.3, 12.0], [39.4, 12.0], [39.5, 12.0], [39.6, 12.0], [39.7, 12.0], [39.8, 12.0], [39.9, 12.0], [40.0, 12.0], [40.1, 12.0], [40.2, 12.0], [40.3, 12.0], [40.4, 12.0], [40.5, 12.0], [40.6, 12.0], [40.7, 12.0], [40.8, 12.0], [40.9, 12.0], [41.0, 12.0], [41.1, 12.0], [41.2, 12.0], [41.3, 12.0], [41.4, 12.0], [41.5, 13.0], [41.6, 13.0], [41.7, 13.0], [41.8, 13.0], [41.9, 13.0], [42.0, 13.0], [42.1, 13.0], [42.2, 13.0], [42.3, 13.0], [42.4, 13.0], [42.5, 13.0], [42.6, 13.0], [42.7, 13.0], [42.8, 13.0], [42.9, 13.0], [43.0, 13.0], [43.1, 13.0], [43.2, 13.0], [43.3, 13.0], [43.4, 13.0], [43.5, 13.0], [43.6, 13.0], [43.7, 13.0], [43.8, 13.0], [43.9, 13.0], [44.0, 13.0], [44.1, 13.0], [44.2, 13.0], [44.3, 13.0], [44.4, 13.0], [44.5, 13.0], [44.6, 13.0], [44.7, 13.0], [44.8, 13.0], [44.9, 13.0], [45.0, 13.0], [45.1, 13.0], [45.2, 13.0], [45.3, 13.0], [45.4, 13.0], [45.5, 13.0], [45.6, 13.0], [45.7, 13.0], [45.8, 13.0], [45.9, 13.0], [46.0, 13.0], [46.1, 13.0], [46.2, 13.0], [46.3, 13.0], [46.4, 13.0], [46.5, 13.0], [46.6, 13.0], [46.7, 13.0], [46.8, 13.0], [46.9, 13.0], [47.0, 13.0], [47.1, 13.0], [47.2, 13.0], [47.3, 13.0], [47.4, 13.0], [47.5, 13.0], [47.6, 13.0], [47.7, 13.0], [47.8, 13.0], [47.9, 13.0], [48.0, 13.0], [48.1, 13.0], [48.2, 13.0], [48.3, 13.0], [48.4, 13.0], [48.5, 13.0], [48.6, 13.0], [48.7, 13.0], [48.8, 13.0], [48.9, 13.0], [49.0, 13.0], [49.1, 13.0], [49.2, 13.0], [49.3, 13.0], [49.4, 13.0], [49.5, 13.0], [49.6, 13.0], [49.7, 13.0], [49.8, 13.0], [49.9, 13.0], [50.0, 13.0], [50.1, 13.0], [50.2, 13.0], [50.3, 13.0], [50.4, 13.0], [50.5, 13.0], [50.6, 13.0], [50.7, 13.0], [50.8, 13.0], [50.9, 13.0], [51.0, 13.0], [51.1, 13.0], [51.2, 13.0], [51.3, 13.0], [51.4, 13.0], [51.5, 13.0], [51.6, 13.0], [51.7, 13.0], [51.8, 13.0], [51.9, 13.0], [52.0, 13.0], [52.1, 13.0], [52.2, 13.0], [52.3, 13.0], [52.4, 13.0], [52.5, 13.0], [52.6, 13.0], [52.7, 13.0], [52.8, 13.0], [52.9, 13.0], [53.0, 13.0], [53.1, 13.0], [53.2, 13.0], [53.3, 13.0], [53.4, 13.0], [53.5, 13.0], [53.6, 13.0], [53.7, 13.0], [53.8, 13.0], [53.9, 13.0], [54.0, 13.0], [54.1, 13.0], [54.2, 13.0], [54.3, 13.0], [54.4, 13.0], [54.5, 13.0], [54.6, 13.0], [54.7, 13.0], [54.8, 13.0], [54.9, 13.0], [55.0, 13.0], [55.1, 13.0], [55.2, 13.0], [55.3, 13.0], [55.4, 13.0], [55.5, 13.0], [55.6, 13.0], [55.7, 13.0], [55.8, 13.0], [55.9, 13.0], [56.0, 13.0], [56.1, 13.0], [56.2, 13.0], [56.3, 13.0], [56.4, 13.0], [56.5, 13.0], [56.6, 13.0], [56.7, 13.0], [56.8, 13.0], [56.9, 13.0], [57.0, 13.0], [57.1, 13.0], [57.2, 13.0], [57.3, 13.0], [57.4, 13.0], [57.5, 13.0], [57.6, 13.0], [57.7, 13.0], [57.8, 13.0], [57.9, 13.0], [58.0, 13.0], [58.1, 13.0], [58.2, 13.0], [58.3, 13.0], [58.4, 13.0], [58.5, 13.0], [58.6, 13.0], [58.7, 13.0], [58.8, 13.0], [58.9, 13.0], [59.0, 13.0], [59.1, 13.0], [59.2, 13.0], [59.3, 13.0], [59.4, 13.0], [59.5, 13.0], [59.6, 13.0], [59.7, 13.0], [59.8, 13.0], [59.9, 13.0], [60.0, 13.0], [60.1, 13.0], [60.2, 13.0], [60.3, 13.0], [60.4, 13.0], [60.5, 13.0], [60.6, 13.0], [60.7, 13.0], [60.8, 13.0], [60.9, 13.0], [61.0, 13.0], [61.1, 13.0], [61.2, 13.0], [61.3, 13.0], [61.4, 13.0], [61.5, 13.0], [61.6, 13.0], [61.7, 13.0], [61.8, 13.0], [61.9, 13.0], [62.0, 13.0], [62.1, 13.0], [62.2, 13.0], [62.3, 13.0], [62.4, 13.0], [62.5, 13.0], [62.6, 13.0], [62.7, 13.0], [62.8, 13.0], [62.9, 13.0], [63.0, 13.0], [63.1, 13.0], [63.2, 13.0], [63.3, 13.0], [63.4, 13.0], [63.5, 13.0], [63.6, 13.0], [63.7, 13.0], [63.8, 13.0], [63.9, 13.0], [64.0, 13.0], [64.1, 13.0], [64.2, 13.0], [64.3, 14.0], [64.4, 14.0], [64.5, 14.0], [64.6, 14.0], [64.7, 14.0], [64.8, 14.0], [64.9, 14.0], [65.0, 14.0], [65.1, 14.0], [65.2, 14.0], [65.3, 14.0], [65.4, 14.0], [65.5, 14.0], [65.6, 14.0], [65.7, 14.0], [65.8, 14.0], [65.9, 14.0], [66.0, 14.0], [66.1, 14.0], [66.2, 14.0], [66.3, 14.0], [66.4, 14.0], [66.5, 14.0], [66.6, 14.0], [66.7, 14.0], [66.8, 14.0], [66.9, 14.0], [67.0, 14.0], [67.1, 14.0], [67.2, 14.0], [67.3, 14.0], [67.4, 14.0], [67.5, 14.0], [67.6, 14.0], [67.7, 14.0], [67.8, 14.0], [67.9, 14.0], [68.0, 14.0], [68.1, 14.0], [68.2, 14.0], [68.3, 14.0], [68.4, 14.0], [68.5, 14.0], [68.6, 14.0], [68.7, 14.0], [68.8, 14.0], [68.9, 14.0], [69.0, 14.0], [69.1, 14.0], [69.2, 14.0], [69.3, 14.0], [69.4, 14.0], [69.5, 14.0], [69.6, 14.0], [69.7, 14.0], [69.8, 14.0], [69.9, 14.0], [70.0, 14.0], [70.1, 14.0], [70.2, 14.0], [70.3, 14.0], [70.4, 14.0], [70.5, 14.0], [70.6, 14.0], [70.7, 14.0], [70.8, 14.0], [70.9, 14.0], [71.0, 14.0], [71.1, 14.0], [71.2, 14.0], [71.3, 14.0], [71.4, 14.0], [71.5, 14.0], [71.6, 14.0], [71.7, 14.0], [71.8, 14.0], [71.9, 14.0], [72.0, 14.0], [72.1, 14.0], [72.2, 14.0], [72.3, 14.0], [72.4, 14.0], [72.5, 14.0], [72.6, 14.0], [72.7, 14.0], [72.8, 14.0], [72.9, 14.0], [73.0, 14.0], [73.1, 14.0], [73.2, 14.0], [73.3, 14.0], [73.4, 14.0], [73.5, 14.0], [73.6, 14.0], [73.7, 14.0], [73.8, 14.0], [73.9, 14.0], [74.0, 14.0], [74.1, 14.0], [74.2, 14.0], [74.3, 14.0], [74.4, 14.0], [74.5, 14.0], [74.6, 14.0], [74.7, 14.0], [74.8, 14.0], [74.9, 14.0], [75.0, 15.0], [75.1, 15.0], [75.2, 15.0], [75.3, 15.0], [75.4, 15.0], [75.5, 15.0], [75.6, 15.0], [75.7, 15.0], [75.8, 15.0], [75.9, 15.0], [76.0, 15.0], [76.1, 15.0], [76.2, 15.0], [76.3, 15.0], [76.4, 15.0], [76.5, 15.0], [76.6, 15.0], [76.7, 15.0], [76.8, 15.0], [76.9, 15.0], [77.0, 15.0], [77.1, 15.0], [77.2, 15.0], [77.3, 15.0], [77.4, 15.0], [77.5, 15.0], [77.6, 15.0], [77.7, 15.0], [77.8, 15.0], [77.9, 15.0], [78.0, 15.0], [78.1, 15.0], [78.2, 15.0], [78.3, 15.0], [78.4, 15.0], [78.5, 15.0], [78.6, 15.0], [78.7, 15.0], [78.8, 15.0], [78.9, 15.0], [79.0, 15.0], [79.1, 15.0], [79.2, 15.0], [79.3, 15.0], [79.4, 15.0], [79.5, 15.0], [79.6, 15.0], [79.7, 15.0], [79.8, 15.0], [79.9, 16.0], [80.0, 16.0], [80.1, 16.0], [80.2, 16.0], [80.3, 16.0], [80.4, 16.0], [80.5, 16.0], [80.6, 16.0], [80.7, 16.0], [80.8, 16.0], [80.9, 16.0], [81.0, 16.0], [81.1, 16.0], [81.2, 16.0], [81.3, 16.0], [81.4, 16.0], [81.5, 16.0], [81.6, 16.0], [81.7, 17.0], [81.8, 17.0], [81.9, 17.0], [82.0, 17.0], [82.1, 17.0], [82.2, 17.0], [82.3, 17.0], [82.4, 18.0], [82.5, 18.0], [82.6, 18.0], [82.7, 18.0], [82.8, 19.0], [82.9, 19.0], [83.0, 20.0], [83.1, 20.0], [83.2, 21.0], [83.3, 22.0], [83.4, 23.0], [83.5, 23.0], [83.6, 23.0], [83.7, 24.0], [83.8, 24.0], [83.9, 24.0], [84.0, 25.0], [84.1, 25.0], [84.2, 25.0], [84.3, 25.0], [84.4, 26.0], [84.5, 26.0], [84.6, 26.0], [84.7, 27.0], [84.8, 27.0], [84.9, 27.0], [85.0, 28.0], [85.1, 28.0], [85.2, 29.0], [85.3, 29.0], [85.4, 30.0], [85.5, 30.0], [85.6, 31.0], [85.7, 32.0], [85.8, 33.0], [85.9, 34.0], [86.0, 34.0], [86.1, 35.0], [86.2, 36.0], [86.3, 36.0], [86.4, 37.0], [86.5, 37.0], [86.6, 37.0], [86.7, 38.0], [86.8, 38.0], [86.9, 39.0], [87.0, 40.0], [87.1, 41.0], [87.2, 41.0], [87.3, 42.0], [87.4, 43.0], [87.5, 44.0], [87.6, 45.0], [87.7, 46.0], [87.8, 47.0], [87.9, 47.0], [88.0, 48.0], [88.1, 49.0], [88.2, 50.0], [88.3, 51.0], [88.4, 51.0], [88.5, 52.0], [88.6, 54.0], [88.7, 55.0], [88.8, 56.0], [88.9, 57.0], [89.0, 58.0], [89.1, 59.0], [89.2, 60.0], [89.3, 61.0], [89.4, 62.0], [89.5, 63.0], [89.6, 64.0], [89.7, 66.0], [89.8, 67.0], [89.9, 69.0], [90.0, 70.0], [90.1, 71.0], [90.2, 72.0], [90.3, 73.0], [90.4, 75.0], [90.5, 77.0], [90.6, 79.0], [90.7, 80.0], [90.8, 81.0], [90.9, 83.0], [91.0, 84.0], [91.1, 86.0], [91.2, 88.0], [91.3, 89.0], [91.4, 91.0], [91.5, 93.0], [91.6, 95.0], [91.7, 98.0], [91.8, 100.0], [91.9, 102.0], [92.0, 105.0], [92.1, 107.0], [92.2, 109.0], [92.3, 112.0], [92.4, 114.0], [92.5, 116.0], [92.6, 119.0], [92.7, 122.0], [92.8, 124.0], [92.9, 127.0], [93.0, 130.0], [93.1, 133.0], [93.2, 136.0], [93.3, 140.0], [93.4, 144.0], [93.5, 147.0], [93.6, 150.0], [93.7, 155.0], [93.8, 159.0], [93.9, 163.0], [94.0, 167.0], [94.1, 173.0], [94.2, 176.0], [94.3, 181.0], [94.4, 187.0], [94.5, 189.0], [94.6, 195.0], [94.7, 201.0], [94.8, 208.0], [94.9, 213.0], [95.0, 220.0], [95.1, 229.0], [95.2, 237.0], [95.3, 245.0], [95.4, 251.0], [95.5, 256.0], [95.6, 264.0], [95.7, 273.0], [95.8, 283.0], [95.9, 289.0], [96.0, 299.0], [96.1, 311.0], [96.2, 321.0], [96.3, 329.0], [96.4, 341.0], [96.5, 351.0], [96.6, 363.0], [96.7, 375.0], [96.8, 390.0], [96.9, 401.0], [97.0, 412.0], [97.1, 429.0], [97.2, 445.0], [97.3, 457.0], [97.4, 472.0], [97.5, 487.0], [97.6, 504.0], [97.7, 522.0], [97.8, 546.0], [97.9, 569.0], [98.0, 595.0], [98.1, 624.0], [98.2, 652.0], [98.3, 675.0], [98.4, 700.0], [98.5, 732.0], [98.6, 760.0], [98.7, 786.0], [98.8, 818.0], [98.9, 858.0], [99.0, 901.0], [99.1, 942.0], [99.2, 985.0], [99.3, 1047.0], [99.4, 1079.0], [99.5, 1209.0], [99.6, 1302.0], [99.7, 1615.0], [99.8, 1699.0], [99.9, 1776.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 27534.0, "series": [{"data": [[0.0, 27534.0], [600.0, 116.0], [700.0, 105.0], [200.0, 399.0], [800.0, 71.0], [900.0, 68.0], [1000.0, 63.0], [1100.0, 20.0], [300.0, 266.0], [1200.0, 30.0], [1300.0, 18.0], [1400.0, 1.0], [1500.0, 12.0], [100.0, 868.0], [400.0, 206.0], [1600.0, 33.0], [1700.0, 40.0], [1800.0, 19.0], [500.0, 131.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1800.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 104.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 29155.0, "series": [{"data": [[1.0, 622.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 119.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 29155.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 104.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 108.10647976234749, "minX": 1.52644176E12, "maxY": 512.153942167674, "series": [{"data": [[1.52644182E12, 108.10647976234749], [1.52644176E12, 512.153942167674]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52644182E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 0.5, "minX": 1.0, "maxY": 1642.0, "series": [{"data": [[2.0, 17.7948717948718], [3.0, 15.460869565217399], [4.0, 14.12422360248447], [5.0, 13.40637450199203], [6.0, 12.641129032258092], [7.0, 13.330931104064529], [8.0, 15.248506571087225], [9.0, 17.459016393442624], [10.0, 31.648648648648646], [11.0, 20.64705882352941], [12.0, 39.16666666666668], [13.0, 21.333333333333336], [14.0, 26.064516129032253], [15.0, 28.058823529411764], [16.0, 28.588235294117645], [17.0, 29.27272727272727], [18.0, 24.44444444444444], [19.0, 19.333333333333332], [20.0, 23.61538461538462], [21.0, 23.166666666666668], [22.0, 22.500000000000004], [23.0, 24.450000000000003], [24.0, 26.0], [25.0, 19.823529411764703], [26.0, 29.0], [27.0, 35.142857142857146], [28.0, 39.30769230769231], [29.0, 36.6], [30.0, 14.5], [31.0, 14.5], [32.0, 14.5], [33.0, 15.333333333333334], [34.0, 16.666666666666668], [35.0, 14.0], [36.0, 15.0], [37.0, 15.0], [38.0, 14.75], [39.0, 14.5], [41.0, 14.5], [40.0, 15.0], [42.0, 14.0], [43.0, 14.666666666666666], [44.0, 15.0], [45.0, 15.0], [46.0, 15.0], [47.0, 13.5], [48.0, 13.666666666666668], [49.0, 14.2], [51.0, 14.0], [50.0, 13.0], [52.0, 14.333333333333334], [55.0, 15.0], [54.0, 15.0], [57.0, 14.666666666666666], [56.0, 15.0], [58.0, 15.333333333333334], [59.0, 14.0], [61.0, 14.0], [60.0, 15.0], [62.0, 16.666666666666668], [63.0, 14.333333333333334], [64.0, 17.5], [66.0, 32.4], [67.0, 44.66666666666667], [65.0, 14.5], [69.0, 46.666666666666664], [70.0, 39.25], [71.0, 14.0], [68.0, 16.0], [72.0, 38.5], [73.0, 66.75], [74.0, 14.333333333333334], [75.0, 29.5], [76.0, 14.2], [77.0, 14.666666666666666], [78.0, 18.4], [79.0, 13.0], [80.0, 15.333333333333334], [81.0, 18.666666666666668], [82.0, 19.0], [83.0, 23.2], [86.0, 21.0], [84.0, 13.0], [87.0, 13.0], [85.0, 13.0], [88.0, 25.333333333333332], [89.0, 33.666666666666664], [90.0, 17.285714285714285], [91.0, 12.0], [92.0, 25.0], [95.0, 28.0], [93.0, 12.0], [94.0, 14.0], [99.0, 53.75], [98.0, 94.18749999999999], [96.0, 32.0], [97.0, 17.5], [100.0, 28.0], [103.0, 44.875], [101.0, 18.0], [102.0, 13.0], [104.0, 14.0], [105.0, 54.0], [106.0, 40.8], [107.0, 20.0], [109.0, 18.333333333333332], [110.0, 44.714285714285715], [111.0, 13.5], [108.0, 26.0], [113.0, 35.875], [115.0, 25.77777777777778], [112.0, 36.333333333333336], [114.0, 12.0], [116.0, 43.6], [117.0, 14.5], [118.0, 39.666666666666664], [119.0, 17.8], [120.0, 13.0], [121.0, 31.8], [122.0, 121.0], [123.0, 13.666666666666666], [124.0, 68.42857142857143], [127.0, 61.333333333333336], [125.0, 27.666666666666668], [126.0, 12.666666666666666], [129.0, 19.25], [130.0, 45.0], [132.0, 39.375], [135.0, 44.92307692307692], [128.0, 53.75], [131.0, 35.0], [134.0, 13.249999999999998], [139.0, 52.5], [140.0, 16.5], [141.0, 23.5], [136.0, 27.13333333333333], [138.0, 136.0277777777778], [142.0, 13.125], [143.0, 13.0], [137.0, 13.411764705882353], [144.0, 68.0], [146.0, 16.0], [147.0, 38.111111111111114], [148.0, 13.0], [149.0, 39.111111111111114], [150.0, 13.090909090909092], [151.0, 16.0], [145.0, 12.875], [152.0, 37.1], [154.0, 13.5], [155.0, 33.25], [157.0, 14.0], [158.0, 21.4], [159.0, 55.25], [156.0, 14.333333333333334], [153.0, 12.571428571428571], [160.0, 58.0], [161.0, 13.666666666666668], [163.0, 13.75], [164.0, 26.5], [165.0, 57.6], [166.0, 80.5], [167.0, 13.333333333333332], [162.0, 13.0], [168.0, 14.333333333333334], [170.0, 44.5], [171.0, 50.875], [172.0, 60.4], [174.0, 14.700000000000003], [169.0, 12.75], [173.0, 13.8], [175.0, 12.5], [176.0, 31.833333333333332], [177.0, 99.42857142857143], [180.0, 14.8], [181.0, 54.33333333333333], [182.0, 45.5], [183.0, 93.75], [178.0, 14.0], [179.0, 16.0], [185.0, 18.0], [186.0, 15.333333333333334], [187.0, 35.6], [188.0, 96.99999999999999], [191.0, 19.333333333333332], [184.0, 13.333333333333334], [189.0, 14.0], [190.0, 13.0], [192.0, 33.0], [194.0, 101.625], [197.0, 21.8], [198.0, 28.000000000000007], [199.0, 60.4], [195.0, 40.888888888888886], [193.0, 14.333333333333332], [196.0, 14.285714285714286], [200.0, 80.4], [203.0, 36.875], [205.0, 102.87500000000001], [206.0, 13.8], [201.0, 65.4], [204.0, 19.57142857142857], [202.0, 15.5], [207.0, 14.0], [208.0, 16.6], [209.0, 72.66666666666667], [211.0, 143.33333333333331], [213.0, 15.333333333333334], [214.0, 16.333333333333332], [215.0, 60.5], [210.0, 22.333333333333332], [212.0, 13.25], [216.0, 35.8], [217.0, 74.61538461538463], [219.0, 17.363636363636363], [220.0, 19.071428571428573], [221.0, 41.66666666666667], [222.0, 57.333333333333336], [223.0, 37.285714285714285], [218.0, 14.428571428571427], [225.0, 16.470588235294116], [226.0, 17.315789473684216], [227.0, 26.812499999999996], [228.0, 45.91999999999998], [230.0, 22.454545454545457], [229.0, 13.644444444444446], [231.0, 23.192307692307693], [224.0, 13.333333333333332], [232.0, 26.058823529411764], [237.0, 63.16666666666666], [238.0, 45.75], [239.0, 235.0652173913043], [234.0, 18.55], [236.0, 13.714285714285714], [233.0, 32.333333333333336], [235.0, 41.18181818181819], [247.0, 35.46153846153846], [240.0, 52.41935483870968], [241.0, 99.26923076923077], [242.0, 42.77272727272726], [243.0, 116.0], [244.0, 34.81818181818181], [245.0, 20.846153846153843], [246.0, 18.4], [248.0, 110.8181818181818], [252.0, 123.26315789473686], [249.0, 21.916666666666668], [251.0, 83.73333333333333], [253.0, 14.823529411764708], [254.0, 66.75], [255.0, 21.769230769230774], [250.0, 73.21428571428571], [257.0, 63.82857142857142], [256.0, 13.130434782608695], [258.0, 15.692307692307692], [259.0, 13.285714285714286], [261.0, 77.53333333333333], [260.0, 13.714285714285715], [262.0, 140.54166666666663], [263.0, 33.249999999999986], [266.0, 149.41666666666669], [267.0, 32.142857142857146], [268.0, 38.70833333333333], [269.0, 16.423076923076923], [270.0, 110.17647058823529], [271.0, 13.142857142857142], [264.0, 14.4375], [265.0, 12.727272727272728], [273.0, 47.84999999999998], [272.0, 129.9090909090909], [274.0, 185.39999999999995], [275.0, 19.199999999999996], [276.0, 106.19999999999999], [277.0, 16.142857142857142], [278.0, 70.5], [279.0, 180.44444444444446], [280.0, 17.333333333333336], [281.0, 111.37499999999999], [287.0, 72.71428571428572], [284.0, 69.4], [285.0, 34.375], [286.0, 27.0], [282.0, 138.0], [283.0, 77.375], [289.0, 63.85], [288.0, 14.0], [291.0, 35.833333333333336], [290.0, 13.25], [300.0, 80.57894736842104], [301.0, 60.187500000000014], [302.0, 29.842105263157894], [303.0, 66.59999999999998], [296.0, 41.42857142857143], [292.0, 13.333333333333334], [293.0, 130.14285714285714], [294.0, 187.0], [295.0, 182.33333333333331], [297.0, 21.083333333333336], [298.0, 14.833333333333332], [299.0, 15.285714285714288], [317.0, 82.54545454545453], [305.0, 51.04545454545455], [304.0, 16.449999999999996], [306.0, 80.71428571428572], [307.0, 200.0], [316.0, 13.266666666666666], [311.0, 51.46153846153846], [308.0, 33.27272727272727], [309.0, 13.0], [310.0, 12.8125], [312.0, 28.333333333333332], [314.0, 53.40000000000001], [313.0, 37.14285714285713], [315.0, 16.666666666666668], [319.0, 14.96774193548387], [318.0, 13.409090909090908], [332.0, 61.19047619047617], [320.0, 23.300000000000004], [322.0, 31.87804878048779], [321.0, 12.818181818181818], [323.0, 12.870967741935482], [324.0, 16.090909090909086], [325.0, 53.05263157894735], [327.0, 75.5], [326.0, 12.75], [328.0, 176.33333333333334], [329.0, 13.1875], [330.0, 17.318181818181817], [331.0, 11.833333333333334], [333.0, 113.33333333333336], [334.0, 75.75], [335.0, 12.923076923076923], [337.0, 85.39999999999999], [336.0, 13.88888888888889], [338.0, 47.0], [339.0, 144.36363636363635], [340.0, 13.0], [341.0, 13.0], [342.0, 12.777777777777779], [343.0, 20.125000000000004], [344.0, 130.22222222222223], [350.0, 43.99999999999999], [351.0, 25.400000000000002], [348.0, 19.0], [349.0, 17.499999999999996], [345.0, 218.85714285714283], [346.0, 14.5], [347.0, 12.777777777777779], [353.0, 208.4545454545455], [352.0, 93.44444444444444], [354.0, 12.75], [355.0, 57.71428571428571], [356.0, 21.000000000000004], [357.0, 90.19999999999999], [358.0, 13.333333333333334], [359.0, 12.444444444444445], [360.0, 164.71428571428572], [366.0, 18.142857142857142], [367.0, 360.6], [364.0, 12.714285714285715], [365.0, 12.2], [361.0, 173.8181818181818], [363.0, 19.666666666666668], [362.0, 12.8], [369.0, 15.4], [368.0, 13.700000000000001], [370.0, 13.125], [371.0, 13.0], [372.0, 17.874999999999996], [373.0, 184.33333333333334], [374.0, 98.625], [375.0, 12.5], [377.0, 182.0], [383.0, 12.25], [376.0, 13.0], [381.0, 97.375], [380.0, 12.333333333333334], [382.0, 95.375], [378.0, 57.75000000000001], [379.0, 12.0], [387.0, 13.117647058823529], [385.0, 12.625], [384.0, 66.42857142857143], [390.0, 12.97142857142857], [391.0, 13.210526315789474], [388.0, 42.217391304347835], [389.0, 24.787878787878782], [399.0, 57.53333333333334], [398.0, 12.545454545454545], [396.0, 50.657142857142865], [397.0, 12.46153846153846], [386.0, 12.75], [392.0, 36.714285714285715], [393.0, 12.750000000000002], [395.0, 62.057142857142885], [394.0, 13.200000000000001], [412.0, 28.90243902439024], [400.0, 15.705882352941174], [404.0, 15.6], [405.0, 12.874999999999998], [406.0, 13.277777777777777], [407.0, 61.77272727272725], [401.0, 78.17647058823528], [403.0, 12.6], [402.0, 12.714285714285715], [411.0, 13.407407407407408], [414.0, 12.88], [415.0, 12.76], [413.0, 35.604166666666664], [410.0, 32.44117647058823], [409.0, 13.483870967741936], [408.0, 13.379310344827587], [417.0, 50.97142857142857], [416.0, 14.000000000000002], [418.0, 13.20689655172414], [419.0, 34.285714285714285], [420.0, 12.521739130434783], [421.0, 12.333333333333334], [422.0, 15.777777777777775], [423.0, 12.833333333333334], [424.0, 12.842105263157894], [425.0, 36.52631578947368], [430.0, 18.750000000000007], [431.0, 59.099999999999994], [428.0, 14.782608695652174], [429.0, 12.538461538461538], [426.0, 12.966666666666667], [427.0, 83.32142857142857], [433.0, 15.769230769230772], [432.0, 12.5], [435.0, 13.066666666666666], [434.0, 12.5], [444.0, 19.06666666666667], [445.0, 30.692307692307693], [447.0, 34.71428571428571], [446.0, 36.625], [436.0, 46.14285714285714], [437.0, 48.73684210526316], [438.0, 17.9375], [439.0, 23.0], [440.0, 25.407407407407405], [441.0, 21.466666666666658], [442.0, 71.4054054054054], [443.0, 30.24], [450.0, 15.475], [448.0, 34.29268292682927], [449.0, 28.344827586206897], [451.0, 18.53846153846154], [460.0, 14.39830508474577], [462.0, 12.409523809523812], [461.0, 12.64102564102564], [463.0, 14.516949152542379], [456.0, 14.510948905109496], [452.0, 13.517857142857146], [453.0, 26.612244897959187], [454.0, 36.99999999999999], [455.0, 19.21739130434782], [457.0, 15.251655629139073], [458.0, 14.313253012048193], [459.0, 15.839080459770102], [476.0, 17.35460992907801], [464.0, 13.356589147286824], [466.0, 14.32], [465.0, 12.403361344537814], [467.0, 13.598591549295772], [468.0, 14.318965517241377], [469.0, 14.859154929577475], [470.0, 14.012903225806449], [471.0, 14.038961038961045], [472.0, 17.034013605442173], [474.0, 12.826086956521737], [473.0, 18.79230769230768], [475.0, 17.275641025641026], [477.0, 14.478991596638656], [478.0, 16.372670807453424], [479.0, 16.83333333333333], [494.0, 16.03658536585366], [480.0, 14.549707602339188], [487.0, 16.0506329113924], [485.0, 13.219251336898393], [486.0, 14.804166666666667], [484.0, 13.835227272727272], [481.0, 16.857142857142854], [495.0, 16.969072164948457], [483.0, 15.052380952380954], [482.0, 16.217391304347824], [493.0, 16.263803680981592], [492.0, 18.21379310344827], [490.0, 16.89302325581396], [491.0, 17.635944700460815], [489.0, 15.263374485596705], [488.0, 16.117870722433462], [510.0, 27.301176470588217], [497.0, 18.52247191011235], [498.0, 16.910179640718553], [503.0, 21.1], [496.0, 16.474747474747474], [502.0, 21.621621621621617], [501.0, 39.1404109589041], [500.0, 29.44871794871793], [499.0, 18.675675675675674], [505.0, 17.111455108359124], [506.0, 17.422499999999996], [507.0, 20.440265486725647], [511.0, 24.651933701657445], [509.0, 25.76645435244161], [508.0, 29.63052208835341], [504.0, 17.08026755852842], [519.0, 47.7049180327869], [524.0, 24.578947368421055], [513.0, 43.60555555555556], [512.0, 30.628676470588232], [515.0, 48.938596491228054], [514.0, 62.83076923076923], [516.0, 68.97656249999999], [517.0, 55.074766355140184], [518.0, 56.48809523809523], [528.0, 34.254237288135585], [543.0, 78.3970588235294], [541.0, 101.18867924528303], [542.0, 104.64444444444446], [539.0, 59.852941176470594], [538.0, 73.23913043478261], [540.0, 86.86363636363637], [536.0, 38.65625000000001], [537.0, 74.0769230769231], [529.0, 30.69444444444444], [530.0, 52.722222222222236], [531.0, 54.63636363636365], [532.0, 22.62962962962963], [533.0, 42.04878048780488], [534.0, 33.28125], [535.0, 51.463414634146346], [520.0, 49.18867924528301], [521.0, 46.03448275862068], [522.0, 48.85454545454546], [523.0, 36.641025641025664], [526.0, 50.58333333333335], [525.0, 59.2625], [527.0, 30.631578947368425], [550.0, 69.16666666666667], [545.0, 70.83333333333331], [544.0, 45.77777777777777], [558.0, 31.77777777777778], [559.0, 21.874999999999996], [556.0, 31.615384615384617], [557.0, 25.083333333333336], [554.0, 36.48], [555.0, 41.74999999999999], [546.0, 72.54545454545456], [547.0, 41.099999999999994], [548.0, 67.26086956521739], [549.0, 56.80952380952381], [551.0, 60.8695652173913], [568.0, 29.55555555555555], [569.0, 21.272727272727273], [574.0, 70.875], [575.0, 24.0], [573.0, 58.38461538461539], [571.0, 69.0], [572.0, 24.444444444444443], [570.0, 64.0], [560.0, 20.61538461538461], [561.0, 39.42857142857143], [562.0, 32.6], [563.0, 17.77777777777778], [564.0, 40.2], [565.0, 28.099999999999998], [566.0, 24.368421052631575], [567.0, 32.82758620689655], [552.0, 61.625], [553.0, 75.6875], [600.0, 21.099999999999998], [577.0, 27.600000000000005], [583.0, 23.53846153846154], [582.0, 13.0], [581.0, 27.6], [580.0, 12.0], [579.0, 12.0], [578.0, 44.416666666666664], [576.0, 22.5], [591.0, 13.666666666666666], [590.0, 11.5], [586.0, 29.461538461538456], [588.0, 37.142857142857146], [587.0, 45.0], [584.0, 20.444444444444443], [585.0, 45.23076923076924], [589.0, 37.42857142857142], [593.0, 28.166666666666664], [595.0, 23.75], [594.0, 11.8], [597.0, 6.42857142857143], [596.0, 33.0], [599.0, 18.0], [598.0, 32.6], [605.0, 28.78787878787879], [604.0, 41.6969696969697], [602.0, 36.0], [601.0, 13.0], [603.0, 33.35], [607.0, 35.0], [592.0, 31.444444444444443], [606.0, 14.833333333333332], [633.0, 96.0], [621.0, 55.25], [614.0, 21.285714285714285], [613.0, 12.0], [612.0, 14.0], [611.0, 18.25], [610.0, 67.33333333333333], [608.0, 20.0], [622.0, 55.83333333333333], [623.0, 31.333333333333336], [609.0, 20.0], [632.0, 11.75], [615.0, 43.44444444444444], [618.0, 119.33333333333334], [619.0, 64.77777777777777], [620.0, 73.88888888888889], [616.0, 83.54545454545453], [617.0, 48.14285714285714], [624.0, 38.333333333333336], [627.0, 26.25], [625.0, 16.333333333333332], [629.0, 47.42857142857142], [628.0, 60.74999999999999], [630.0, 29.3], [631.0, 15.222222222222225], [636.0, 34.8125], [635.0, 23.0], [634.0, 22.555555555555557], [637.0, 68.22222222222223], [638.0, 25.66666666666667], [639.0, 17.900000000000002], [646.0, 66.00000000000001], [653.0, 35.285714285714285], [640.0, 75.90909090909092], [641.0, 43.666666666666664], [643.0, 100.4], [645.0, 42.8], [644.0, 12.333333333333334], [656.0, 41.86666666666667], [657.0, 23.5], [670.0, 92.5], [668.0, 178.0], [647.0, 19.5], [665.0, 99.25], [664.0, 34.5], [671.0, 74.75], [658.0, 94.33333333333334], [661.0, 65.0], [659.0, 67.83333333333333], [663.0, 100.25], [662.0, 71.28571428571428], [648.0, 19.916666666666668], [649.0, 41.5], [651.0, 80.33333333333334], [652.0, 54.5], [650.0, 36.63636363636364], [655.0, 67.41176470588235], [654.0, 23.5], [675.0, 132.0], [702.0, 29.666666666666668], [699.0, 12.0], [698.0, 12.0], [691.0, 74.0], [683.0, 82.0], [672.0, 174.0], [734.0, 12.0], [717.0, 824.0], [713.0, 15.666666666666666], [712.0, 12.666666666666666], [714.0, 28.0], [715.0, 18.0], [716.0, 26.428571428571427], [719.0, 14.0], [704.0, 11.0], [706.0, 11.0], [705.0, 11.0], [709.0, 11.0], [707.0, 23.25], [720.0, 45.66666666666667], [721.0, 23.25], [724.0, 232.0], [725.0, 1634.0], [726.0, 227.0], [728.0, 930.0], [732.0, 1636.0], [735.0, 12.0], [733.0, 116.0], [760.0, 28.6], [740.0, 1637.0], [742.0, 553.3333333333333], [741.0, 12.0], [743.0, 12.25], [748.0, 825.5], [747.0, 12.0], [744.0, 12.0], [750.0, 11.0], [736.0, 12.0], [737.0, 12.0], [739.0, 12.0], [738.0, 12.0], [749.0, 12.0], [755.0, 1642.0], [757.0, 105.75], [758.0, 11.333333333333334], [759.0, 12.0], [756.0, 337.99999999999994], [762.0, 377.19999999999993], [765.0, 420.99999999999994], [764.0, 19.333333333333332], [763.0, 12.0], [766.0, 57.2], [767.0, 27.272727272727273], [753.0, 12.5], [761.0, 56.75], [775.0, 316.87500000000006], [771.0, 415.8], [768.0, 519.9999999999999], [783.0, 374.0], [778.0, 256.75], [779.0, 142.0], [780.0, 12.0], [781.0, 1182.0], [769.0, 83.9090909090909], [770.0, 31.77777777777778], [772.0, 422.75], [773.0, 0.5], [774.0, 98.88888888888889], [784.0, 345.0], [798.0, 285.57142857142856], [799.0, 701.8333333333333], [796.0, 531.1818181818181], [795.0, 714.5454545454546], [797.0, 755.6153846153846], [794.0, 659.3333333333334], [792.0, 632.5714285714286], [793.0, 202.0], [785.0, 165.0], [788.0, 130.0], [787.0, 12.5], [789.0, 306.6666666666667], [790.0, 959.0], [791.0, 151.0], [777.0, 142.0], [776.0, 57.5], [806.0, 476.8], [801.0, 520.6363636363636], [800.0, 267.22222222222223], [815.0, 40.0], [811.0, 457.6], [813.0, 281.625], [812.0, 37.5], [814.0, 355.44444444444446], [803.0, 656.6666666666667], [802.0, 193.33333333333334], [804.0, 508.55555555555566], [805.0, 459.50000000000006], [807.0, 153.0], [824.0, 351.9090909090909], [825.0, 88.81818181818183], [826.0, 205.24999999999997], [827.0, 565.5833333333333], [828.0, 551.0], [829.0, 159.0], [830.0, 110.5], [831.0, 460.74999999999994], [816.0, 18.0], [817.0, 554.2857142857142], [819.0, 378.59999999999997], [820.0, 11.0], [818.0, 11.0], [821.0, 384.7142857142857], [823.0, 742.5714285714284], [822.0, 29.0], [810.0, 338.125], [809.0, 145.4], [808.0, 31.333333333333336], [837.0, 354.2631578947369], [833.0, 659.0], [832.0, 434.59999999999997], [847.0, 277.0], [846.0, 38.0], [844.0, 1261.7142857142856], [845.0, 921.6666666666665], [842.0, 867.4444444444445], [843.0, 364.45454545454544], [834.0, 114.16666666666667], [835.0, 0.6666666666666667], [836.0, 526.3846153846154], [839.0, 920.3749999999999], [856.0, 358.14285714285717], [858.0, 431.1666666666667], [857.0, 226.14285714285714], [859.0, 247.8], [860.0, 332.3333333333333], [861.0, 304.49999999999994], [862.0, 187.09999999999997], [863.0, 133.0], [848.0, 523.3571428571429], [850.0, 449.90476190476187], [853.0, 237.2], [852.0, 295.0], [851.0, 243.57142857142858], [854.0, 295.0], [855.0, 101.5], [849.0, 234.66666666666666], [840.0, 514.125], [841.0, 243.83333333333331], [870.0, 272.4], [865.0, 435.2857142857143], [864.0, 259.5], [878.0, 364.33333333333337], [879.0, 498.0], [876.0, 290.3333333333333], [877.0, 528.5], [866.0, 307.0], [867.0, 278.375], [869.0, 233.66666666666669], [868.0, 487.6666666666667], [871.0, 309.8571428571429], [888.0, 249.5], [889.0, 457.3333333333333], [890.0, 323.0], [891.0, 327.0], [892.0, 327.2], [893.0, 354.0], [894.0, 518.3333333333334], [895.0, 438.25], [880.0, 571.0], [881.0, 366.83333333333337], [882.0, 369.0], [883.0, 269.5], [885.0, 429.3333333333333], [884.0, 151.25], [886.0, 268.375], [887.0, 126.5], [872.0, 303.25], [874.0, 295.2], [873.0, 381.5], [875.0, 191.0], [901.0, 394.25], [897.0, 277.0], [896.0, 341.5], [910.0, 599.6], [909.0, 140.0], [911.0, 319.3333333333333], [907.0, 288.6666666666667], [906.0, 395.5], [908.0, 406.0], [898.0, 516.0], [899.0, 402.3333333333333], [900.0, 161.85714285714286], [903.0, 185.28571428571428], [902.0, 409.6666666666667], [920.0, 369.5], [921.0, 349.5714285714286], [922.0, 252.10000000000002], [923.0, 227.45454545454544], [924.0, 496.5], [925.0, 329.8571428571429], [926.0, 266.0], [927.0, 729.0], [912.0, 176.66666666666666], [913.0, 362.0], [914.0, 356.1428571428571], [915.0, 374.0], [916.0, 286.57142857142856], [917.0, 508.4166666666667], [918.0, 275.25], [919.0, 206.66666666666666], [904.0, 396.5], [905.0, 365.77777777777777], [934.0, 167.16666666666666], [930.0, 194.3], [929.0, 325.7], [943.0, 254.83333333333331], [928.0, 229.08333333333331], [941.0, 412.00000000000006], [940.0, 405.304347826087], [942.0, 288.5], [938.0, 380.6875], [939.0, 360.3928571428572], [931.0, 324.9285714285714], [932.0, 283.4242424242425], [933.0, 271.3333333333333], [935.0, 227.21428571428572], [953.0, 449.0], [954.0, 472.0], [955.0, 357.00000000000006], [957.0, 875.3333333333334], [956.0, 957.0], [959.0, 536.1666666666666], [958.0, 12.0], [944.0, 489.3333333333333], [946.0, 305.0], [947.0, 421.5], [948.0, 728.25], [949.0, 349.5], [951.0, 316.0], [950.0, 754.0], [936.0, 172.85185185185185], [937.0, 297.20000000000005], [967.0, 429.44444444444446], [963.0, 442.0], [960.0, 939.3333333333334], [973.0, 533.625], [974.0, 492.1111111111111], [971.0, 431.0], [972.0, 538.3333333333333], [961.0, 501.0], [962.0, 260.0], [964.0, 452.0], [965.0, 576.0], [966.0, 403.8333333333333], [976.0, 676.0999999999999], [989.0, 429.75], [990.0, 465.0], [986.0, 401.0], [987.0, 407.0], [984.0, 477.0], [985.0, 454.0], [977.0, 576.0], [978.0, 351.3333333333333], [979.0, 684.0], [980.0, 790.5882352941178], [982.0, 396.3333333333333], [983.0, 626.5], [968.0, 417.2857142857143], [969.0, 455.6], [998.0, 457.8], [993.0, 701.3333333333334], [992.0, 342.5], [1005.0, 472.5], [1006.0, 377.0], [1003.0, 535.25], [1004.0, 377.0], [994.0, 321.5], [995.0, 731.75], [996.0, 717.0], [999.0, 632.0], [1016.0, 658.6], [1017.0, 688.8333333333334], [1018.0, 618.4285714285713], [1019.0, 598.0], [1020.0, 662.375], [1021.0, 654.8846153846152], [1008.0, 335.3333333333333], [1009.0, 731.0], [1010.0, 736.6666666666666], [1012.0, 418.5], [1014.0, 517.8], [1015.0, 753.5], [1000.0, 600.75], [1001.0, 677.6666666666666], [1062.0, 638.0], [1030.0, 803.0], [1072.0, 575.5], [1060.0, 452.25], [1064.0, 673.4], [1068.0, 1304.0], [1070.0, 756.5454545454545], [1066.0, 527.6666666666666], [1086.0, 1007.6], [1084.0, 777.6500000000001], [1082.0, 386.33333333333337], [1080.0, 612.5], [1078.0, 625.0], [1074.0, 474.0], [1092.0, 856.5], [1088.0, 913.8], [1104.0, 898.5], [1090.0, 791.3333333333333], [1094.0, 741.0], [1098.0, 842.25], [1100.0, 108.0], [1102.0, 567.5714285714286], [1063.0, 643.5], [1057.0, 13.0], [1059.0, 123.0], [1061.0, 831.8571428571429], [1065.0, 923.0], [1067.0, 234.33333333333334], [1069.0, 837.5294117647059], [1071.0, 818.0], [1073.0, 496.0], [1079.0, 505.25], [1085.0, 878.8], [1083.0, 353.49999999999994], [1087.0, 701.3333333333334], [1077.0, 692.0], [1075.0, 104.0], [1095.0, 1061.5], [1091.0, 807.4761904761906], [1089.0, 299.33333333333326], [1093.0, 605.0], [1097.0, 738.1428571428572], [1099.0, 103.0], [1101.0, 815.0], [1103.0, 806.0], [1.0, 14.351648351648352]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[367.0739999999977, 51.03993333333346]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1104.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 1020872.1833333333, "minX": 1.52644176E12, "maxY": 3491586.0166666666, "series": [{"data": [[1.52644182E12, 1967864.8666666667], [1.52644176E12, 3491586.0166666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52644182E12, 1020872.1833333333], [1.52644176E12, 1822176.0666666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52644182E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 14.384793910137427, "minX": 1.52644176E12, "maxY": 71.57504680674018, "series": [{"data": [[1.52644182E12, 14.384793910137427], [1.52644176E12, 71.57504680674018]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52644182E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 14.369290753806123, "minX": 1.52644176E12, "maxY": 71.53307676305376, "series": [{"data": [[1.52644182E12, 14.369290753806123], [1.52644176E12, 71.53307676305376]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52644182E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.21890085406609738, "minX": 1.52644176E12, "maxY": 0.7200956937799035, "series": [{"data": [[1.52644182E12, 0.21890085406609738], [1.52644176E12, 0.7200956937799035]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52644182E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 11.0, "minX": 1.52644176E12, "maxY": 1897.0, "series": [{"data": [[1.52644182E12, 212.0], [1.52644176E12, 1897.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52644182E12, 11.0], [1.52644176E12, 11.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52644182E12, 15.0], [1.52644176E12, 149.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52644182E12, 188.0], [1.52644176E12, 1069.7000000000044]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52644182E12, 28.0], [1.52644176E12, 390.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52644182E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 1.0, "minX": 179.0, "maxY": 13.0, "series": [{"data": [[320.0, 13.0], [179.0, 13.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[320.0, 1.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 320.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 1.0, "minX": 179.0, "maxY": 13.0, "series": [{"data": [[320.0, 13.0], [179.0, 13.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[320.0, 1.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 320.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 179.51666666666668, "minX": 1.52644176E12, "maxY": 320.48333333333335, "series": [{"data": [[1.52644182E12, 179.51666666666668], [1.52644176E12, 320.48333333333335]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52644182E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 1.9833333333333334, "minX": 1.52644176E12, "maxY": 318.48333333333335, "series": [{"data": [[1.52644182E12, 179.53333333333333], [1.52644176E12, 318.48333333333335]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52644176E12, 1.9833333333333334]], "isOverall": false, "label": "502", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52644182E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 1.9833333333333334, "minX": 1.52644176E12, "maxY": 318.48333333333335, "series": [{"data": [[1.52644182E12, 179.53333333333333], [1.52644176E12, 318.48333333333335]], "isOverall": false, "label": "inference-success", "isController": false}, {"data": [[1.52644176E12, 1.9833333333333334]], "isOverall": false, "label": "inference-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52644182E12, "title": "Transactions Per Second"}},
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
