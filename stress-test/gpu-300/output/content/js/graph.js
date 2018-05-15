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
        data: {"result": {"minY": 11.0, "minX": 0.0, "maxY": 612.0, "series": [{"data": [[0.0, 11.0], [0.1, 11.0], [0.2, 11.0], [0.3, 11.0], [0.4, 11.0], [0.5, 11.0], [0.6, 11.0], [0.7, 12.0], [0.8, 12.0], [0.9, 12.0], [1.0, 12.0], [1.1, 12.0], [1.2, 12.0], [1.3, 12.0], [1.4, 12.0], [1.5, 12.0], [1.6, 12.0], [1.7, 12.0], [1.8, 12.0], [1.9, 12.0], [2.0, 12.0], [2.1, 12.0], [2.2, 12.0], [2.3, 12.0], [2.4, 12.0], [2.5, 12.0], [2.6, 12.0], [2.7, 12.0], [2.8, 12.0], [2.9, 12.0], [3.0, 12.0], [3.1, 12.0], [3.2, 12.0], [3.3, 12.0], [3.4, 12.0], [3.5, 12.0], [3.6, 12.0], [3.7, 12.0], [3.8, 12.0], [3.9, 12.0], [4.0, 12.0], [4.1, 12.0], [4.2, 12.0], [4.3, 12.0], [4.4, 12.0], [4.5, 12.0], [4.6, 12.0], [4.7, 12.0], [4.8, 12.0], [4.9, 12.0], [5.0, 12.0], [5.1, 12.0], [5.2, 12.0], [5.3, 12.0], [5.4, 12.0], [5.5, 12.0], [5.6, 12.0], [5.7, 12.0], [5.8, 12.0], [5.9, 12.0], [6.0, 12.0], [6.1, 12.0], [6.2, 12.0], [6.3, 12.0], [6.4, 12.0], [6.5, 12.0], [6.6, 12.0], [6.7, 12.0], [6.8, 12.0], [6.9, 12.0], [7.0, 12.0], [7.1, 12.0], [7.2, 12.0], [7.3, 12.0], [7.4, 12.0], [7.5, 12.0], [7.6, 12.0], [7.7, 12.0], [7.8, 12.0], [7.9, 12.0], [8.0, 12.0], [8.1, 12.0], [8.2, 12.0], [8.3, 12.0], [8.4, 12.0], [8.5, 12.0], [8.6, 12.0], [8.7, 12.0], [8.8, 12.0], [8.9, 12.0], [9.0, 12.0], [9.1, 12.0], [9.2, 12.0], [9.3, 12.0], [9.4, 12.0], [9.5, 12.0], [9.6, 12.0], [9.7, 12.0], [9.8, 12.0], [9.9, 12.0], [10.0, 12.0], [10.1, 12.0], [10.2, 12.0], [10.3, 12.0], [10.4, 12.0], [10.5, 12.0], [10.6, 12.0], [10.7, 12.0], [10.8, 12.0], [10.9, 12.0], [11.0, 12.0], [11.1, 12.0], [11.2, 12.0], [11.3, 12.0], [11.4, 12.0], [11.5, 12.0], [11.6, 12.0], [11.7, 12.0], [11.8, 12.0], [11.9, 12.0], [12.0, 12.0], [12.1, 12.0], [12.2, 12.0], [12.3, 12.0], [12.4, 12.0], [12.5, 12.0], [12.6, 12.0], [12.7, 12.0], [12.8, 12.0], [12.9, 12.0], [13.0, 12.0], [13.1, 12.0], [13.2, 12.0], [13.3, 12.0], [13.4, 12.0], [13.5, 12.0], [13.6, 12.0], [13.7, 12.0], [13.8, 12.0], [13.9, 12.0], [14.0, 12.0], [14.1, 12.0], [14.2, 12.0], [14.3, 12.0], [14.4, 12.0], [14.5, 12.0], [14.6, 12.0], [14.7, 12.0], [14.8, 12.0], [14.9, 12.0], [15.0, 12.0], [15.1, 12.0], [15.2, 12.0], [15.3, 12.0], [15.4, 12.0], [15.5, 12.0], [15.6, 12.0], [15.7, 12.0], [15.8, 12.0], [15.9, 12.0], [16.0, 12.0], [16.1, 12.0], [16.2, 12.0], [16.3, 12.0], [16.4, 12.0], [16.5, 12.0], [16.6, 12.0], [16.7, 12.0], [16.8, 12.0], [16.9, 12.0], [17.0, 12.0], [17.1, 12.0], [17.2, 12.0], [17.3, 12.0], [17.4, 12.0], [17.5, 12.0], [17.6, 12.0], [17.7, 12.0], [17.8, 12.0], [17.9, 12.0], [18.0, 12.0], [18.1, 12.0], [18.2, 12.0], [18.3, 12.0], [18.4, 12.0], [18.5, 12.0], [18.6, 12.0], [18.7, 12.0], [18.8, 12.0], [18.9, 12.0], [19.0, 13.0], [19.1, 13.0], [19.2, 13.0], [19.3, 13.0], [19.4, 13.0], [19.5, 13.0], [19.6, 13.0], [19.7, 13.0], [19.8, 13.0], [19.9, 13.0], [20.0, 13.0], [20.1, 13.0], [20.2, 13.0], [20.3, 13.0], [20.4, 13.0], [20.5, 13.0], [20.6, 13.0], [20.7, 13.0], [20.8, 13.0], [20.9, 13.0], [21.0, 13.0], [21.1, 13.0], [21.2, 13.0], [21.3, 13.0], [21.4, 13.0], [21.5, 13.0], [21.6, 13.0], [21.7, 13.0], [21.8, 13.0], [21.9, 13.0], [22.0, 13.0], [22.1, 13.0], [22.2, 13.0], [22.3, 13.0], [22.4, 13.0], [22.5, 13.0], [22.6, 13.0], [22.7, 13.0], [22.8, 13.0], [22.9, 13.0], [23.0, 13.0], [23.1, 13.0], [23.2, 13.0], [23.3, 13.0], [23.4, 13.0], [23.5, 13.0], [23.6, 13.0], [23.7, 13.0], [23.8, 13.0], [23.9, 13.0], [24.0, 13.0], [24.1, 13.0], [24.2, 13.0], [24.3, 13.0], [24.4, 13.0], [24.5, 13.0], [24.6, 13.0], [24.7, 13.0], [24.8, 13.0], [24.9, 13.0], [25.0, 13.0], [25.1, 13.0], [25.2, 13.0], [25.3, 13.0], [25.4, 13.0], [25.5, 13.0], [25.6, 13.0], [25.7, 13.0], [25.8, 13.0], [25.9, 13.0], [26.0, 13.0], [26.1, 13.0], [26.2, 13.0], [26.3, 13.0], [26.4, 13.0], [26.5, 13.0], [26.6, 13.0], [26.7, 13.0], [26.8, 13.0], [26.9, 13.0], [27.0, 13.0], [27.1, 13.0], [27.2, 13.0], [27.3, 13.0], [27.4, 13.0], [27.5, 13.0], [27.6, 13.0], [27.7, 13.0], [27.8, 13.0], [27.9, 13.0], [28.0, 13.0], [28.1, 13.0], [28.2, 13.0], [28.3, 13.0], [28.4, 13.0], [28.5, 13.0], [28.6, 13.0], [28.7, 13.0], [28.8, 13.0], [28.9, 13.0], [29.0, 13.0], [29.1, 13.0], [29.2, 13.0], [29.3, 13.0], [29.4, 13.0], [29.5, 13.0], [29.6, 13.0], [29.7, 13.0], [29.8, 13.0], [29.9, 13.0], [30.0, 13.0], [30.1, 13.0], [30.2, 13.0], [30.3, 13.0], [30.4, 13.0], [30.5, 13.0], [30.6, 13.0], [30.7, 13.0], [30.8, 13.0], [30.9, 13.0], [31.0, 13.0], [31.1, 13.0], [31.2, 13.0], [31.3, 13.0], [31.4, 13.0], [31.5, 13.0], [31.6, 13.0], [31.7, 13.0], [31.8, 13.0], [31.9, 13.0], [32.0, 13.0], [32.1, 13.0], [32.2, 13.0], [32.3, 13.0], [32.4, 13.0], [32.5, 13.0], [32.6, 13.0], [32.7, 13.0], [32.8, 13.0], [32.9, 13.0], [33.0, 13.0], [33.1, 13.0], [33.2, 13.0], [33.3, 13.0], [33.4, 13.0], [33.5, 13.0], [33.6, 13.0], [33.7, 13.0], [33.8, 13.0], [33.9, 13.0], [34.0, 13.0], [34.1, 13.0], [34.2, 13.0], [34.3, 13.0], [34.4, 13.0], [34.5, 13.0], [34.6, 13.0], [34.7, 13.0], [34.8, 13.0], [34.9, 13.0], [35.0, 13.0], [35.1, 13.0], [35.2, 13.0], [35.3, 13.0], [35.4, 13.0], [35.5, 13.0], [35.6, 13.0], [35.7, 13.0], [35.8, 13.0], [35.9, 13.0], [36.0, 13.0], [36.1, 13.0], [36.2, 13.0], [36.3, 13.0], [36.4, 13.0], [36.5, 13.0], [36.6, 13.0], [36.7, 13.0], [36.8, 13.0], [36.9, 13.0], [37.0, 13.0], [37.1, 13.0], [37.2, 13.0], [37.3, 13.0], [37.4, 13.0], [37.5, 13.0], [37.6, 13.0], [37.7, 13.0], [37.8, 13.0], [37.9, 13.0], [38.0, 13.0], [38.1, 13.0], [38.2, 13.0], [38.3, 13.0], [38.4, 13.0], [38.5, 13.0], [38.6, 13.0], [38.7, 13.0], [38.8, 13.0], [38.9, 13.0], [39.0, 13.0], [39.1, 13.0], [39.2, 13.0], [39.3, 13.0], [39.4, 13.0], [39.5, 13.0], [39.6, 13.0], [39.7, 13.0], [39.8, 13.0], [39.9, 13.0], [40.0, 13.0], [40.1, 13.0], [40.2, 13.0], [40.3, 13.0], [40.4, 13.0], [40.5, 13.0], [40.6, 13.0], [40.7, 13.0], [40.8, 13.0], [40.9, 13.0], [41.0, 13.0], [41.1, 13.0], [41.2, 13.0], [41.3, 13.0], [41.4, 13.0], [41.5, 13.0], [41.6, 13.0], [41.7, 13.0], [41.8, 13.0], [41.9, 13.0], [42.0, 13.0], [42.1, 13.0], [42.2, 13.0], [42.3, 13.0], [42.4, 13.0], [42.5, 13.0], [42.6, 13.0], [42.7, 13.0], [42.8, 13.0], [42.9, 13.0], [43.0, 13.0], [43.1, 13.0], [43.2, 13.0], [43.3, 13.0], [43.4, 13.0], [43.5, 13.0], [43.6, 13.0], [43.7, 13.0], [43.8, 13.0], [43.9, 13.0], [44.0, 13.0], [44.1, 13.0], [44.2, 13.0], [44.3, 13.0], [44.4, 13.0], [44.5, 13.0], [44.6, 13.0], [44.7, 13.0], [44.8, 13.0], [44.9, 13.0], [45.0, 13.0], [45.1, 13.0], [45.2, 13.0], [45.3, 13.0], [45.4, 13.0], [45.5, 13.0], [45.6, 13.0], [45.7, 13.0], [45.8, 13.0], [45.9, 13.0], [46.0, 13.0], [46.1, 13.0], [46.2, 13.0], [46.3, 13.0], [46.4, 13.0], [46.5, 13.0], [46.6, 13.0], [46.7, 13.0], [46.8, 13.0], [46.9, 13.0], [47.0, 13.0], [47.1, 13.0], [47.2, 13.0], [47.3, 13.0], [47.4, 13.0], [47.5, 13.0], [47.6, 13.0], [47.7, 13.0], [47.8, 13.0], [47.9, 13.0], [48.0, 13.0], [48.1, 13.0], [48.2, 13.0], [48.3, 13.0], [48.4, 13.0], [48.5, 13.0], [48.6, 13.0], [48.7, 13.0], [48.8, 13.0], [48.9, 13.0], [49.0, 13.0], [49.1, 13.0], [49.2, 13.0], [49.3, 13.0], [49.4, 13.0], [49.5, 13.0], [49.6, 13.0], [49.7, 13.0], [49.8, 13.0], [49.9, 13.0], [50.0, 13.0], [50.1, 13.0], [50.2, 13.0], [50.3, 13.0], [50.4, 13.0], [50.5, 13.0], [50.6, 13.0], [50.7, 13.0], [50.8, 13.0], [50.9, 13.0], [51.0, 13.0], [51.1, 13.0], [51.2, 13.0], [51.3, 13.0], [51.4, 13.0], [51.5, 13.0], [51.6, 13.0], [51.7, 13.0], [51.8, 13.0], [51.9, 13.0], [52.0, 13.0], [52.1, 14.0], [52.2, 14.0], [52.3, 14.0], [52.4, 14.0], [52.5, 14.0], [52.6, 14.0], [52.7, 14.0], [52.8, 14.0], [52.9, 14.0], [53.0, 14.0], [53.1, 14.0], [53.2, 14.0], [53.3, 14.0], [53.4, 14.0], [53.5, 14.0], [53.6, 14.0], [53.7, 14.0], [53.8, 14.0], [53.9, 14.0], [54.0, 14.0], [54.1, 14.0], [54.2, 14.0], [54.3, 14.0], [54.4, 14.0], [54.5, 14.0], [54.6, 14.0], [54.7, 14.0], [54.8, 14.0], [54.9, 14.0], [55.0, 14.0], [55.1, 14.0], [55.2, 14.0], [55.3, 14.0], [55.4, 14.0], [55.5, 14.0], [55.6, 14.0], [55.7, 14.0], [55.8, 14.0], [55.9, 14.0], [56.0, 14.0], [56.1, 14.0], [56.2, 14.0], [56.3, 14.0], [56.4, 14.0], [56.5, 14.0], [56.6, 14.0], [56.7, 14.0], [56.8, 14.0], [56.9, 14.0], [57.0, 14.0], [57.1, 14.0], [57.2, 14.0], [57.3, 14.0], [57.4, 14.0], [57.5, 14.0], [57.6, 14.0], [57.7, 14.0], [57.8, 14.0], [57.9, 14.0], [58.0, 14.0], [58.1, 14.0], [58.2, 14.0], [58.3, 14.0], [58.4, 14.0], [58.5, 14.0], [58.6, 14.0], [58.7, 14.0], [58.8, 14.0], [58.9, 14.0], [59.0, 14.0], [59.1, 14.0], [59.2, 14.0], [59.3, 14.0], [59.4, 14.0], [59.5, 14.0], [59.6, 14.0], [59.7, 14.0], [59.8, 14.0], [59.9, 14.0], [60.0, 14.0], [60.1, 14.0], [60.2, 14.0], [60.3, 14.0], [60.4, 14.0], [60.5, 14.0], [60.6, 14.0], [60.7, 14.0], [60.8, 14.0], [60.9, 14.0], [61.0, 14.0], [61.1, 14.0], [61.2, 14.0], [61.3, 14.0], [61.4, 14.0], [61.5, 14.0], [61.6, 14.0], [61.7, 14.0], [61.8, 14.0], [61.9, 14.0], [62.0, 14.0], [62.1, 14.0], [62.2, 14.0], [62.3, 14.0], [62.4, 14.0], [62.5, 14.0], [62.6, 14.0], [62.7, 14.0], [62.8, 14.0], [62.9, 14.0], [63.0, 14.0], [63.1, 14.0], [63.2, 14.0], [63.3, 14.0], [63.4, 14.0], [63.5, 14.0], [63.6, 14.0], [63.7, 14.0], [63.8, 14.0], [63.9, 14.0], [64.0, 14.0], [64.1, 14.0], [64.2, 14.0], [64.3, 14.0], [64.4, 14.0], [64.5, 14.0], [64.6, 14.0], [64.7, 14.0], [64.8, 14.0], [64.9, 14.0], [65.0, 14.0], [65.1, 14.0], [65.2, 14.0], [65.3, 14.0], [65.4, 14.0], [65.5, 14.0], [65.6, 14.0], [65.7, 14.0], [65.8, 14.0], [65.9, 14.0], [66.0, 14.0], [66.1, 14.0], [66.2, 14.0], [66.3, 14.0], [66.4, 14.0], [66.5, 14.0], [66.6, 14.0], [66.7, 14.0], [66.8, 14.0], [66.9, 14.0], [67.0, 14.0], [67.1, 14.0], [67.2, 14.0], [67.3, 14.0], [67.4, 14.0], [67.5, 14.0], [67.6, 14.0], [67.7, 14.0], [67.8, 14.0], [67.9, 14.0], [68.0, 14.0], [68.1, 14.0], [68.2, 14.0], [68.3, 14.0], [68.4, 14.0], [68.5, 14.0], [68.6, 14.0], [68.7, 14.0], [68.8, 14.0], [68.9, 14.0], [69.0, 14.0], [69.1, 14.0], [69.2, 14.0], [69.3, 14.0], [69.4, 14.0], [69.5, 14.0], [69.6, 14.0], [69.7, 14.0], [69.8, 14.0], [69.9, 14.0], [70.0, 14.0], [70.1, 14.0], [70.2, 14.0], [70.3, 14.0], [70.4, 14.0], [70.5, 14.0], [70.6, 14.0], [70.7, 14.0], [70.8, 14.0], [70.9, 14.0], [71.0, 14.0], [71.1, 14.0], [71.2, 14.0], [71.3, 14.0], [71.4, 14.0], [71.5, 14.0], [71.6, 14.0], [71.7, 14.0], [71.8, 14.0], [71.9, 14.0], [72.0, 14.0], [72.1, 15.0], [72.2, 15.0], [72.3, 15.0], [72.4, 15.0], [72.5, 15.0], [72.6, 15.0], [72.7, 15.0], [72.8, 15.0], [72.9, 15.0], [73.0, 15.0], [73.1, 15.0], [73.2, 15.0], [73.3, 15.0], [73.4, 15.0], [73.5, 15.0], [73.6, 15.0], [73.7, 15.0], [73.8, 15.0], [73.9, 15.0], [74.0, 15.0], [74.1, 15.0], [74.2, 15.0], [74.3, 15.0], [74.4, 15.0], [74.5, 15.0], [74.6, 15.0], [74.7, 15.0], [74.8, 15.0], [74.9, 15.0], [75.0, 15.0], [75.1, 15.0], [75.2, 15.0], [75.3, 15.0], [75.4, 15.0], [75.5, 15.0], [75.6, 15.0], [75.7, 15.0], [75.8, 15.0], [75.9, 15.0], [76.0, 15.0], [76.1, 15.0], [76.2, 15.0], [76.3, 15.0], [76.4, 15.0], [76.5, 15.0], [76.6, 15.0], [76.7, 15.0], [76.8, 15.0], [76.9, 15.0], [77.0, 15.0], [77.1, 15.0], [77.2, 15.0], [77.3, 15.0], [77.4, 15.0], [77.5, 15.0], [77.6, 15.0], [77.7, 15.0], [77.8, 15.0], [77.9, 15.0], [78.0, 15.0], [78.1, 15.0], [78.2, 15.0], [78.3, 15.0], [78.4, 15.0], [78.5, 15.0], [78.6, 15.0], [78.7, 15.0], [78.8, 15.0], [78.9, 15.0], [79.0, 15.0], [79.1, 15.0], [79.2, 15.0], [79.3, 15.0], [79.4, 15.0], [79.5, 15.0], [79.6, 15.0], [79.7, 15.0], [79.8, 15.0], [79.9, 15.0], [80.0, 15.0], [80.1, 15.0], [80.2, 15.0], [80.3, 15.0], [80.4, 15.0], [80.5, 15.0], [80.6, 15.0], [80.7, 15.0], [80.8, 15.0], [80.9, 15.0], [81.0, 15.0], [81.1, 15.0], [81.2, 15.0], [81.3, 15.0], [81.4, 15.0], [81.5, 15.0], [81.6, 15.0], [81.7, 15.0], [81.8, 15.0], [81.9, 15.0], [82.0, 15.0], [82.1, 15.0], [82.2, 15.0], [82.3, 15.0], [82.4, 15.0], [82.5, 15.0], [82.6, 15.0], [82.7, 15.0], [82.8, 15.0], [82.9, 15.0], [83.0, 15.0], [83.1, 15.0], [83.2, 15.0], [83.3, 15.0], [83.4, 15.0], [83.5, 15.0], [83.6, 15.0], [83.7, 15.0], [83.8, 15.0], [83.9, 15.0], [84.0, 15.0], [84.1, 15.0], [84.2, 15.0], [84.3, 15.0], [84.4, 15.0], [84.5, 15.0], [84.6, 15.0], [84.7, 15.0], [84.8, 15.0], [84.9, 15.0], [85.0, 15.0], [85.1, 15.0], [85.2, 15.0], [85.3, 15.0], [85.4, 15.0], [85.5, 15.0], [85.6, 15.0], [85.7, 16.0], [85.8, 16.0], [85.9, 16.0], [86.0, 16.0], [86.1, 16.0], [86.2, 16.0], [86.3, 16.0], [86.4, 16.0], [86.5, 16.0], [86.6, 16.0], [86.7, 16.0], [86.8, 16.0], [86.9, 16.0], [87.0, 16.0], [87.1, 16.0], [87.2, 16.0], [87.3, 16.0], [87.4, 16.0], [87.5, 16.0], [87.6, 16.0], [87.7, 16.0], [87.8, 16.0], [87.9, 16.0], [88.0, 16.0], [88.1, 16.0], [88.2, 16.0], [88.3, 16.0], [88.4, 16.0], [88.5, 16.0], [88.6, 16.0], [88.7, 16.0], [88.8, 16.0], [88.9, 16.0], [89.0, 16.0], [89.1, 16.0], [89.2, 16.0], [89.3, 16.0], [89.4, 16.0], [89.5, 16.0], [89.6, 16.0], [89.7, 16.0], [89.8, 16.0], [89.9, 16.0], [90.0, 16.0], [90.1, 16.0], [90.2, 16.0], [90.3, 16.0], [90.4, 16.0], [90.5, 16.0], [90.6, 16.0], [90.7, 17.0], [90.8, 17.0], [90.9, 17.0], [91.0, 17.0], [91.1, 17.0], [91.2, 17.0], [91.3, 17.0], [91.4, 17.0], [91.5, 17.0], [91.6, 17.0], [91.7, 17.0], [91.8, 17.0], [91.9, 17.0], [92.0, 18.0], [92.1, 18.0], [92.2, 18.0], [92.3, 18.0], [92.4, 18.0], [92.5, 19.0], [92.6, 19.0], [92.7, 20.0], [92.8, 20.0], [92.9, 21.0], [93.0, 22.0], [93.1, 23.0], [93.2, 24.0], [93.3, 25.0], [93.4, 26.0], [93.5, 26.0], [93.6, 27.0], [93.7, 27.0], [93.8, 28.0], [93.9, 29.0], [94.0, 30.0], [94.1, 31.0], [94.2, 32.0], [94.3, 32.0], [94.4, 34.0], [94.5, 35.0], [94.6, 37.0], [94.7, 38.0], [94.8, 39.0], [94.9, 40.0], [95.0, 41.0], [95.1, 42.0], [95.2, 44.0], [95.3, 45.0], [95.4, 47.0], [95.5, 49.0], [95.6, 51.0], [95.7, 53.0], [95.8, 54.0], [95.9, 56.0], [96.0, 58.0], [96.1, 60.0], [96.2, 62.0], [96.3, 64.0], [96.4, 66.0], [96.5, 69.0], [96.6, 72.0], [96.7, 74.0], [96.8, 77.0], [96.9, 81.0], [97.0, 84.0], [97.1, 87.0], [97.2, 91.0], [97.3, 96.0], [97.4, 99.0], [97.5, 104.0], [97.6, 109.0], [97.7, 115.0], [97.8, 119.0], [97.9, 124.0], [98.0, 129.0], [98.1, 135.0], [98.2, 142.0], [98.3, 152.0], [98.4, 163.0], [98.5, 176.0], [98.6, 192.0], [98.7, 203.0], [98.8, 215.0], [98.9, 223.0], [99.0, 234.0], [99.1, 244.0], [99.2, 259.0], [99.3, 271.0], [99.4, 290.0], [99.5, 320.0], [99.6, 353.0], [99.7, 377.0], [99.8, 422.0], [99.9, 485.0], [100.0, 612.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 17533.0, "series": [{"data": [[0.0, 17533.0], [300.0, 55.0], [600.0, 1.0], [100.0, 229.0], [200.0, 136.0], [400.0, 30.0], [500.0, 16.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 600.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 17.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 17983.0, "series": [{"data": [[1.0, 17.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 17983.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 1.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 258.4528003375165, "minX": 1.52637324E12, "maxY": 313.9457682826608, "series": [{"data": [[1.52637324E12, 313.9457682826608], [1.5263733E12, 258.4528003375165]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5263733E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 11.0, "minX": 1.0, "maxY": 514.0, "series": [{"data": [[2.0, 14.296296296296296], [3.0, 14.105263157894738], [4.0, 13.201465201465203], [5.0, 14.48888888888888], [6.0, 17.23404255319149], [7.0, 20.25], [8.0, 15.666666666666666], [16.0, 16.0], [18.0, 16.0], [59.0, 102.5], [60.0, 40.75], [62.0, 76.0], [63.0, 49.75], [64.0, 137.0], [66.0, 31.75], [67.0, 98.5], [68.0, 15.0], [69.0, 61.66666666666667], [70.0, 66.5], [71.0, 117.0], [74.0, 29.0], [75.0, 36.0], [76.0, 194.0], [77.0, 113.0], [79.0, 130.0], [82.0, 75.5], [83.0, 48.666666666666664], [86.0, 120.5], [87.0, 20.5], [89.0, 74.66666666666667], [90.0, 14.0], [92.0, 13.0], [93.0, 96.0], [95.0, 14.0], [96.0, 82.33333333333334], [98.0, 13.5], [99.0, 128.0], [100.0, 13.0], [102.0, 14.0], [103.0, 132.0], [104.0, 13.0], [105.0, 14.0], [106.0, 236.0], [107.0, 13.5], [108.0, 13.0], [109.0, 158.5], [110.0, 13.0], [111.0, 14.0], [112.0, 13.0], [113.0, 124.0], [114.0, 13.0], [115.0, 13.0], [116.0, 308.0], [117.0, 13.5], [118.0, 13.0], [120.0, 122.33333333333334], [121.0, 14.0], [122.0, 13.0], [123.0, 143.0], [125.0, 13.5], [126.0, 188.5], [128.0, 14.5], [129.0, 183.5], [131.0, 15.0], [133.0, 130.0], [137.0, 153.66666666666666], [141.0, 417.0], [144.0, 414.0], [145.0, 21.0], [146.0, 18.0], [147.0, 438.0], [148.0, 23.5], [149.0, 28.0], [150.0, 158.66666666666666], [152.0, 20.333333333333332], [153.0, 194.0], [154.0, 13.0], [155.0, 26.5], [156.0, 242.0], [158.0, 25.666666666666668], [159.0, 247.5], [161.0, 14.0], [162.0, 14.0], [163.0, 253.0], [165.0, 13.5], [166.0, 444.0], [167.0, 14.0], [168.0, 14.0], [169.0, 514.0], [170.0, 13.5], [171.0, 14.0], [172.0, 221.0], [174.0, 15.0], [175.0, 15.0], [176.0, 14.0], [177.0, 13.5], [179.0, 15.0], [185.0, 40.333333333333336], [188.0, 33.0], [192.0, 15.0], [193.0, 17.6], [194.0, 14.0], [195.0, 18.0], [196.0, 20.5], [198.0, 14.0], [199.0, 23.5], [201.0, 14.5], [202.0, 12.0], [203.0, 52.0], [204.0, 14.0], [205.0, 13.0], [207.0, 15.0], [208.0, 66.33333333333333], [209.0, 13.5], [210.0, 13.0], [211.0, 13.0], [212.0, 13.0], [214.0, 14.0], [215.0, 14.0], [216.0, 13.0], [217.0, 13.0], [219.0, 14.0], [221.0, 14.0], [223.0, 14.5], [225.0, 13.5], [226.0, 13.0], [228.0, 15.0], [230.0, 14.0], [232.0, 51.0], [234.0, 14.5], [236.0, 14.0], [245.0, 44.0], [247.0, 13.0], [250.0, 13.5], [251.0, 17.166666666666668], [252.0, 28.666666666666668], [254.0, 16.200000000000003], [255.0, 16.833333333333332], [253.0, 14.5], [257.0, 14.727272727272728], [256.0, 13.578947368421053], [258.0, 14.054054054054058], [268.0, 26.419354838709673], [259.0, 18.303030303030305], [269.0, 22.73170731707317], [271.0, 27.295454545454536], [270.0, 28.815789473684212], [260.0, 13.76923076923077], [261.0, 15.428571428571429], [262.0, 14.666666666666666], [263.0, 14.105263157894736], [264.0, 25.166666666666664], [265.0, 13.857142857142858], [267.0, 23.90909090909091], [266.0, 20.588235294117645], [273.0, 33.81481481481482], [272.0, 25.644067796610177], [274.0, 35.52083333333334], [275.0, 19.359999999999996], [284.0, 15.820512820512823], [285.0, 15.23076923076923], [287.0, 13.575757575757576], [286.0, 26.666666666666668], [276.0, 40.29999999999999], [277.0, 46.702702702702695], [279.0, 15.579710144927528], [278.0, 20.23684210526315], [280.0, 23.313432835820894], [281.0, 15.740000000000004], [282.0, 13.6], [283.0, 16.4], [300.0, 16.125628140703512], [289.0, 13.82352941176471], [288.0, 15.425], [294.0, 15.647058823529411], [295.0, 15.061403508771928], [290.0, 17.230769230769234], [291.0, 16.244897959183668], [292.0, 14.48888888888889], [293.0, 21.72340425531915], [302.0, 14.848066298342536], [303.0, 14.471604938271605], [297.0, 16.04477611940299], [296.0, 15.134615384615389], [298.0, 17.572490706319726], [299.0, 16.02499999999999], [301.0, 15.232911392405063], [318.0, 26.786516853932593], [310.0, 19.582078853046568], [309.0, 16.803054662379434], [308.0, 17.050892857142863], [311.0, 16.59936406995232], [312.0, 18.718693284936464], [313.0, 20.7405329593268], [314.0, 20.85497835497838], [315.0, 17.26978417266187], [317.0, 31.15999999999999], [316.0, 16.53293413173652], [307.0, 16.8289156626506], [306.0, 18.42198100407056], [305.0, 16.289090909090916], [304.0, 16.79439252336448], [319.0, 22.836363636363625], [321.0, 25.986301369863007], [320.0, 24.444444444444446], [323.0, 30.464285714285722], [332.0, 24.25641025641026], [322.0, 23.378787878787875], [333.0, 47.13333333333334], [334.0, 19.19230769230769], [335.0, 33.5], [324.0, 26.810344827586214], [325.0, 49.25], [327.0, 50.17948717948718], [326.0, 36.46153846153845], [328.0, 39.529411764705884], [329.0, 22.52173913043478], [330.0, 48.78571428571429], [331.0, 26.79999999999999], [337.0, 22.38461538461539], [336.0, 61.66666666666667], [339.0, 85.80000000000001], [344.0, 97.46666666666668], [350.0, 61.25], [351.0, 77.625], [348.0, 89.76923076923077], [349.0, 12.636363636363637], [338.0, 29.071428571428566], [340.0, 38.68181818181818], [341.0, 34.0], [342.0, 21.76923076923077], [343.0, 88.14285714285714], [345.0, 14.266666666666666], [347.0, 94.0], [346.0, 104.39999999999999], [354.0, 12.833333333333334], [352.0, 17.142857142857142], [353.0, 127.4], [355.0, 68.0], [364.0, 27.75], [366.0, 68.33333333333334], [365.0, 104.0], [356.0, 30.454545454545457], [357.0, 36.77777777777778], [358.0, 57.56521739130435], [359.0, 77.27272727272727], [361.0, 60.099999999999994], [360.0, 12.285714285714286], [363.0, 68.55555555555556], [362.0, 56.333333333333336], [367.0, 93.9090909090909], [369.0, 99.15384615384615], [368.0, 92.9], [371.0, 17.6], [370.0, 31.000000000000004], [380.0, 33.0], [381.0, 62.0], [382.0, 12.6], [383.0, 12.0], [373.0, 29.09090909090909], [374.0, 16.2], [375.0, 49.285714285714285], [372.0, 111.85714285714286], [376.0, 33.411764705882355], [378.0, 42.111111111111114], [379.0, 23.8], [377.0, 27.76470588235294], [385.0, 141.0], [384.0, 12.333333333333334], [386.0, 12.8], [387.0, 12.666666666666666], [397.0, 12.333333333333334], [396.0, 12.5], [398.0, 84.33333333333331], [399.0, 152.33333333333331], [388.0, 57.666666666666664], [389.0, 12.666666666666666], [390.0, 13.5], [391.0, 13.0], [392.0, 82.5], [393.0, 12.666666666666666], [395.0, 12.833333333333334], [394.0, 12.0], [412.0, 166.25], [404.0, 89.0], [411.0, 112.18181818181819], [410.0, 12.5], [414.0, 12.333333333333334], [415.0, 85.4], [413.0, 85.71428571428571], [409.0, 12.5], [408.0, 11.0], [405.0, 217.5], [403.0, 12.0], [402.0, 12.0], [400.0, 13.0], [406.0, 12.0], [407.0, 13.0], [401.0, 12.0], [431.0, 13.0], [419.0, 274.0], [423.0, 81.4], [418.0, 84.4], [417.0, 12.0], [416.0, 12.0], [420.0, 13.333333333333334], [421.0, 12.5], [422.0, 13.0], [424.0, 209.0], [430.0, 12.0], [429.0, 64.16666666666666], [428.0, 108.0], [427.0, 70.1], [426.0, 156.16666666666666], [425.0, 39.2], [447.0, 90.8], [443.0, 32.75], [445.0, 13.5], [446.0, 13.25], [444.0, 63.49999999999999], [442.0, 54.8], [441.0, 85.5], [440.0, 14.0], [439.0, 13.0], [432.0, 93.33333333333334], [435.0, 13.142857142857142], [434.0, 12.5], [433.0, 131.0], [438.0, 69.5], [436.0, 90.33333333333334], [437.0, 13.5], [460.0, 141.33333333333334], [448.0, 48.0], [454.0, 67.2], [455.0, 14.0], [459.0, 51.75], [458.0, 12.5], [457.0, 91.0], [456.0, 94.0], [461.0, 13.0], [462.0, 13.0], [463.0, 13.0], [453.0, 48.0], [452.0, 14.0], [451.0, 13.25], [450.0, 102.5], [449.0, 75.0], [476.0, 18.68421052631579], [466.0, 102.0], [467.0, 28.3], [477.0, 32.375], [478.0, 21.210526315789473], [479.0, 25.0], [469.0, 24.0], [468.0, 30.666666666666664], [470.0, 27.0], [471.0, 46.5], [472.0, 20.0], [473.0, 17.0], [474.0, 16.928571428571427], [475.0, 29.88888888888889], [480.0, 31.0], [481.0, 13.0], [1.0, 13.904761904761907]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[284.71638888888896, 20.707277777777918]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 481.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 807313.8833333333, "minX": 1.52637324E12, "maxY": 1732020.6833333333, "series": [{"data": [[1.52637324E12, 1556279.3166666667], [1.5263733E12, 1732020.6833333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52637324E12, 807313.8833333333], [1.5263733E12, 898467.1666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5263733E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 14.142495517350484, "minX": 1.52637324E12, "maxY": 28.013381852330102, "series": [{"data": [[1.52637324E12, 28.013381852330102], [1.5263733E12, 14.142495517350484]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5263733E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 14.127412720177203, "minX": 1.52637324E12, "maxY": 27.969832139922683, "series": [{"data": [[1.52637324E12, 27.969832139922683], [1.5263733E12, 14.127412720177203]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5263733E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.22655837991773, "minX": 1.52637324E12, "maxY": 0.8106585279962423, "series": [{"data": [[1.52637324E12, 0.8106585279962423], [1.5263733E12, 0.22655837991773]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5263733E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 11.0, "minX": 1.52637324E12, "maxY": 612.0, "series": [{"data": [[1.52637324E12, 612.0], [1.5263733E12, 140.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52637324E12, 11.0], [1.5263733E12, 11.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52637324E12, 40.0], [1.5263733E12, 16.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52637324E12, 331.1999999999971], [1.5263733E12, 234.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52637324E12, 108.0], [1.5263733E12, 41.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5263733E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 13.0, "minX": 141.0, "maxY": 13.0, "series": [{"data": [[141.0, 13.0], [158.0, 13.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 158.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 13.0, "minX": 141.0, "maxY": 13.0, "series": [{"data": [[141.0, 13.0], [158.0, 13.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 158.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 142.05, "minX": 1.52637324E12, "maxY": 157.95, "series": [{"data": [[1.52637324E12, 142.05], [1.5263733E12, 157.95]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5263733E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 141.98333333333332, "minX": 1.52637324E12, "maxY": 158.01666666666668, "series": [{"data": [[1.52637324E12, 141.98333333333332], [1.5263733E12, 158.01666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5263733E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 141.98333333333332, "minX": 1.52637324E12, "maxY": 158.01666666666668, "series": [{"data": [[1.52637324E12, 141.98333333333332], [1.5263733E12, 158.01666666666668]], "isOverall": false, "label": "inference-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5263733E12, "title": "Transactions Per Second"}},
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
