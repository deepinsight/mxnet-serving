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
        data: {"result": {"minY": 11.0, "minX": 0.0, "maxY": 989.0, "series": [{"data": [[0.0, 11.0], [0.1, 11.0], [0.2, 11.0], [0.3, 11.0], [0.4, 11.0], [0.5, 11.0], [0.6, 11.0], [0.7, 11.0], [0.8, 11.0], [0.9, 11.0], [1.0, 11.0], [1.1, 11.0], [1.2, 11.0], [1.3, 11.0], [1.4, 11.0], [1.5, 11.0], [1.6, 11.0], [1.7, 11.0], [1.8, 11.0], [1.9, 11.0], [2.0, 11.0], [2.1, 11.0], [2.2, 11.0], [2.3, 11.0], [2.4, 11.0], [2.5, 11.0], [2.6, 11.0], [2.7, 11.0], [2.8, 11.0], [2.9, 11.0], [3.0, 11.0], [3.1, 11.0], [3.2, 11.0], [3.3, 11.0], [3.4, 11.0], [3.5, 11.0], [3.6, 11.0], [3.7, 11.0], [3.8, 11.0], [3.9, 11.0], [4.0, 11.0], [4.1, 11.0], [4.2, 11.0], [4.3, 11.0], [4.4, 11.0], [4.5, 11.0], [4.6, 11.0], [4.7, 11.0], [4.8, 11.0], [4.9, 11.0], [5.0, 11.0], [5.1, 11.0], [5.2, 11.0], [5.3, 11.0], [5.4, 11.0], [5.5, 11.0], [5.6, 11.0], [5.7, 11.0], [5.8, 11.0], [5.9, 11.0], [6.0, 11.0], [6.1, 11.0], [6.2, 11.0], [6.3, 11.0], [6.4, 11.0], [6.5, 11.0], [6.6, 11.0], [6.7, 11.0], [6.8, 11.0], [6.9, 11.0], [7.0, 11.0], [7.1, 11.0], [7.2, 11.0], [7.3, 12.0], [7.4, 12.0], [7.5, 12.0], [7.6, 12.0], [7.7, 12.0], [7.8, 12.0], [7.9, 12.0], [8.0, 12.0], [8.1, 12.0], [8.2, 12.0], [8.3, 12.0], [8.4, 12.0], [8.5, 12.0], [8.6, 12.0], [8.7, 12.0], [8.8, 12.0], [8.9, 12.0], [9.0, 12.0], [9.1, 12.0], [9.2, 12.0], [9.3, 12.0], [9.4, 12.0], [9.5, 12.0], [9.6, 12.0], [9.7, 12.0], [9.8, 12.0], [9.9, 12.0], [10.0, 12.0], [10.1, 12.0], [10.2, 12.0], [10.3, 12.0], [10.4, 12.0], [10.5, 12.0], [10.6, 12.0], [10.7, 12.0], [10.8, 12.0], [10.9, 12.0], [11.0, 12.0], [11.1, 12.0], [11.2, 12.0], [11.3, 12.0], [11.4, 12.0], [11.5, 12.0], [11.6, 12.0], [11.7, 12.0], [11.8, 12.0], [11.9, 12.0], [12.0, 12.0], [12.1, 12.0], [12.2, 12.0], [12.3, 12.0], [12.4, 12.0], [12.5, 12.0], [12.6, 12.0], [12.7, 12.0], [12.8, 12.0], [12.9, 12.0], [13.0, 12.0], [13.1, 12.0], [13.2, 12.0], [13.3, 12.0], [13.4, 12.0], [13.5, 12.0], [13.6, 12.0], [13.7, 12.0], [13.8, 12.0], [13.9, 12.0], [14.0, 12.0], [14.1, 12.0], [14.2, 12.0], [14.3, 12.0], [14.4, 12.0], [14.5, 12.0], [14.6, 12.0], [14.7, 12.0], [14.8, 12.0], [14.9, 12.0], [15.0, 12.0], [15.1, 12.0], [15.2, 12.0], [15.3, 12.0], [15.4, 12.0], [15.5, 12.0], [15.6, 12.0], [15.7, 12.0], [15.8, 12.0], [15.9, 12.0], [16.0, 12.0], [16.1, 12.0], [16.2, 12.0], [16.3, 12.0], [16.4, 12.0], [16.5, 12.0], [16.6, 12.0], [16.7, 12.0], [16.8, 12.0], [16.9, 12.0], [17.0, 12.0], [17.1, 12.0], [17.2, 12.0], [17.3, 12.0], [17.4, 12.0], [17.5, 12.0], [17.6, 12.0], [17.7, 12.0], [17.8, 12.0], [17.9, 12.0], [18.0, 12.0], [18.1, 12.0], [18.2, 12.0], [18.3, 12.0], [18.4, 12.0], [18.5, 12.0], [18.6, 12.0], [18.7, 12.0], [18.8, 12.0], [18.9, 12.0], [19.0, 12.0], [19.1, 12.0], [19.2, 12.0], [19.3, 12.0], [19.4, 12.0], [19.5, 12.0], [19.6, 12.0], [19.7, 12.0], [19.8, 12.0], [19.9, 12.0], [20.0, 12.0], [20.1, 12.0], [20.2, 12.0], [20.3, 12.0], [20.4, 12.0], [20.5, 12.0], [20.6, 12.0], [20.7, 12.0], [20.8, 12.0], [20.9, 12.0], [21.0, 12.0], [21.1, 12.0], [21.2, 12.0], [21.3, 12.0], [21.4, 12.0], [21.5, 12.0], [21.6, 12.0], [21.7, 12.0], [21.8, 12.0], [21.9, 12.0], [22.0, 12.0], [22.1, 12.0], [22.2, 12.0], [22.3, 12.0], [22.4, 12.0], [22.5, 12.0], [22.6, 12.0], [22.7, 12.0], [22.8, 12.0], [22.9, 12.0], [23.0, 12.0], [23.1, 12.0], [23.2, 12.0], [23.3, 12.0], [23.4, 12.0], [23.5, 12.0], [23.6, 12.0], [23.7, 12.0], [23.8, 12.0], [23.9, 12.0], [24.0, 12.0], [24.1, 12.0], [24.2, 12.0], [24.3, 12.0], [24.4, 12.0], [24.5, 12.0], [24.6, 12.0], [24.7, 12.0], [24.8, 12.0], [24.9, 12.0], [25.0, 12.0], [25.1, 12.0], [25.2, 12.0], [25.3, 12.0], [25.4, 12.0], [25.5, 12.0], [25.6, 12.0], [25.7, 12.0], [25.8, 12.0], [25.9, 12.0], [26.0, 12.0], [26.1, 12.0], [26.2, 12.0], [26.3, 12.0], [26.4, 12.0], [26.5, 12.0], [26.6, 12.0], [26.7, 12.0], [26.8, 12.0], [26.9, 12.0], [27.0, 12.0], [27.1, 12.0], [27.2, 12.0], [27.3, 12.0], [27.4, 12.0], [27.5, 12.0], [27.6, 12.0], [27.7, 12.0], [27.8, 12.0], [27.9, 12.0], [28.0, 12.0], [28.1, 12.0], [28.2, 12.0], [28.3, 12.0], [28.4, 12.0], [28.5, 12.0], [28.6, 12.0], [28.7, 12.0], [28.8, 12.0], [28.9, 12.0], [29.0, 12.0], [29.1, 12.0], [29.2, 12.0], [29.3, 12.0], [29.4, 12.0], [29.5, 12.0], [29.6, 12.0], [29.7, 12.0], [29.8, 12.0], [29.9, 12.0], [30.0, 12.0], [30.1, 12.0], [30.2, 12.0], [30.3, 12.0], [30.4, 12.0], [30.5, 12.0], [30.6, 12.0], [30.7, 12.0], [30.8, 12.0], [30.9, 12.0], [31.0, 12.0], [31.1, 12.0], [31.2, 12.0], [31.3, 12.0], [31.4, 12.0], [31.5, 12.0], [31.6, 12.0], [31.7, 12.0], [31.8, 12.0], [31.9, 12.0], [32.0, 12.0], [32.1, 12.0], [32.2, 12.0], [32.3, 12.0], [32.4, 12.0], [32.5, 12.0], [32.6, 12.0], [32.7, 12.0], [32.8, 12.0], [32.9, 12.0], [33.0, 12.0], [33.1, 12.0], [33.2, 12.0], [33.3, 12.0], [33.4, 12.0], [33.5, 12.0], [33.6, 12.0], [33.7, 12.0], [33.8, 12.0], [33.9, 12.0], [34.0, 12.0], [34.1, 12.0], [34.2, 12.0], [34.3, 12.0], [34.4, 12.0], [34.5, 12.0], [34.6, 12.0], [34.7, 12.0], [34.8, 12.0], [34.9, 12.0], [35.0, 12.0], [35.1, 12.0], [35.2, 12.0], [35.3, 12.0], [35.4, 12.0], [35.5, 12.0], [35.6, 12.0], [35.7, 12.0], [35.8, 12.0], [35.9, 12.0], [36.0, 12.0], [36.1, 12.0], [36.2, 12.0], [36.3, 12.0], [36.4, 12.0], [36.5, 12.0], [36.6, 12.0], [36.7, 12.0], [36.8, 12.0], [36.9, 12.0], [37.0, 12.0], [37.1, 12.0], [37.2, 12.0], [37.3, 12.0], [37.4, 12.0], [37.5, 12.0], [37.6, 12.0], [37.7, 12.0], [37.8, 12.0], [37.9, 12.0], [38.0, 12.0], [38.1, 12.0], [38.2, 12.0], [38.3, 12.0], [38.4, 12.0], [38.5, 12.0], [38.6, 12.0], [38.7, 12.0], [38.8, 12.0], [38.9, 12.0], [39.0, 12.0], [39.1, 12.0], [39.2, 12.0], [39.3, 12.0], [39.4, 12.0], [39.5, 12.0], [39.6, 12.0], [39.7, 12.0], [39.8, 12.0], [39.9, 12.0], [40.0, 12.0], [40.1, 12.0], [40.2, 12.0], [40.3, 12.0], [40.4, 12.0], [40.5, 12.0], [40.6, 12.0], [40.7, 12.0], [40.8, 12.0], [40.9, 12.0], [41.0, 12.0], [41.1, 13.0], [41.2, 13.0], [41.3, 13.0], [41.4, 13.0], [41.5, 13.0], [41.6, 13.0], [41.7, 13.0], [41.8, 13.0], [41.9, 13.0], [42.0, 13.0], [42.1, 13.0], [42.2, 13.0], [42.3, 13.0], [42.4, 13.0], [42.5, 13.0], [42.6, 13.0], [42.7, 13.0], [42.8, 13.0], [42.9, 13.0], [43.0, 13.0], [43.1, 13.0], [43.2, 13.0], [43.3, 13.0], [43.4, 13.0], [43.5, 13.0], [43.6, 13.0], [43.7, 13.0], [43.8, 13.0], [43.9, 13.0], [44.0, 13.0], [44.1, 13.0], [44.2, 13.0], [44.3, 13.0], [44.4, 13.0], [44.5, 13.0], [44.6, 13.0], [44.7, 13.0], [44.8, 13.0], [44.9, 13.0], [45.0, 13.0], [45.1, 13.0], [45.2, 13.0], [45.3, 13.0], [45.4, 13.0], [45.5, 13.0], [45.6, 13.0], [45.7, 13.0], [45.8, 13.0], [45.9, 13.0], [46.0, 13.0], [46.1, 13.0], [46.2, 13.0], [46.3, 13.0], [46.4, 13.0], [46.5, 13.0], [46.6, 13.0], [46.7, 13.0], [46.8, 13.0], [46.9, 13.0], [47.0, 13.0], [47.1, 13.0], [47.2, 13.0], [47.3, 13.0], [47.4, 13.0], [47.5, 13.0], [47.6, 13.0], [47.7, 13.0], [47.8, 13.0], [47.9, 13.0], [48.0, 13.0], [48.1, 13.0], [48.2, 13.0], [48.3, 13.0], [48.4, 13.0], [48.5, 13.0], [48.6, 13.0], [48.7, 13.0], [48.8, 13.0], [48.9, 13.0], [49.0, 13.0], [49.1, 13.0], [49.2, 13.0], [49.3, 13.0], [49.4, 13.0], [49.5, 13.0], [49.6, 13.0], [49.7, 13.0], [49.8, 13.0], [49.9, 13.0], [50.0, 13.0], [50.1, 13.0], [50.2, 13.0], [50.3, 13.0], [50.4, 13.0], [50.5, 13.0], [50.6, 13.0], [50.7, 13.0], [50.8, 13.0], [50.9, 13.0], [51.0, 13.0], [51.1, 13.0], [51.2, 13.0], [51.3, 13.0], [51.4, 13.0], [51.5, 13.0], [51.6, 13.0], [51.7, 13.0], [51.8, 13.0], [51.9, 13.0], [52.0, 13.0], [52.1, 13.0], [52.2, 13.0], [52.3, 13.0], [52.4, 13.0], [52.5, 13.0], [52.6, 13.0], [52.7, 13.0], [52.8, 13.0], [52.9, 13.0], [53.0, 13.0], [53.1, 13.0], [53.2, 13.0], [53.3, 13.0], [53.4, 13.0], [53.5, 13.0], [53.6, 13.0], [53.7, 13.0], [53.8, 13.0], [53.9, 13.0], [54.0, 13.0], [54.1, 13.0], [54.2, 13.0], [54.3, 13.0], [54.4, 13.0], [54.5, 13.0], [54.6, 13.0], [54.7, 13.0], [54.8, 13.0], [54.9, 13.0], [55.0, 13.0], [55.1, 13.0], [55.2, 13.0], [55.3, 13.0], [55.4, 13.0], [55.5, 13.0], [55.6, 13.0], [55.7, 13.0], [55.8, 13.0], [55.9, 13.0], [56.0, 13.0], [56.1, 13.0], [56.2, 13.0], [56.3, 13.0], [56.4, 13.0], [56.5, 13.0], [56.6, 13.0], [56.7, 13.0], [56.8, 13.0], [56.9, 13.0], [57.0, 13.0], [57.1, 13.0], [57.2, 13.0], [57.3, 13.0], [57.4, 13.0], [57.5, 13.0], [57.6, 13.0], [57.7, 13.0], [57.8, 13.0], [57.9, 13.0], [58.0, 13.0], [58.1, 13.0], [58.2, 13.0], [58.3, 13.0], [58.4, 13.0], [58.5, 13.0], [58.6, 13.0], [58.7, 13.0], [58.8, 13.0], [58.9, 13.0], [59.0, 13.0], [59.1, 13.0], [59.2, 13.0], [59.3, 13.0], [59.4, 13.0], [59.5, 13.0], [59.6, 13.0], [59.7, 13.0], [59.8, 13.0], [59.9, 13.0], [60.0, 13.0], [60.1, 13.0], [60.2, 13.0], [60.3, 13.0], [60.4, 13.0], [60.5, 13.0], [60.6, 13.0], [60.7, 13.0], [60.8, 13.0], [60.9, 13.0], [61.0, 13.0], [61.1, 13.0], [61.2, 13.0], [61.3, 13.0], [61.4, 13.0], [61.5, 13.0], [61.6, 13.0], [61.7, 13.0], [61.8, 13.0], [61.9, 13.0], [62.0, 13.0], [62.1, 13.0], [62.2, 13.0], [62.3, 13.0], [62.4, 13.0], [62.5, 13.0], [62.6, 13.0], [62.7, 13.0], [62.8, 13.0], [62.9, 13.0], [63.0, 13.0], [63.1, 13.0], [63.2, 13.0], [63.3, 13.0], [63.4, 14.0], [63.5, 14.0], [63.6, 14.0], [63.7, 14.0], [63.8, 14.0], [63.9, 14.0], [64.0, 14.0], [64.1, 14.0], [64.2, 14.0], [64.3, 14.0], [64.4, 14.0], [64.5, 14.0], [64.6, 14.0], [64.7, 14.0], [64.8, 14.0], [64.9, 14.0], [65.0, 14.0], [65.1, 14.0], [65.2, 14.0], [65.3, 14.0], [65.4, 14.0], [65.5, 14.0], [65.6, 14.0], [65.7, 14.0], [65.8, 14.0], [65.9, 14.0], [66.0, 14.0], [66.1, 14.0], [66.2, 14.0], [66.3, 14.0], [66.4, 14.0], [66.5, 14.0], [66.6, 14.0], [66.7, 14.0], [66.8, 14.0], [66.9, 14.0], [67.0, 14.0], [67.1, 14.0], [67.2, 14.0], [67.3, 14.0], [67.4, 14.0], [67.5, 14.0], [67.6, 14.0], [67.7, 14.0], [67.8, 14.0], [67.9, 14.0], [68.0, 14.0], [68.1, 14.0], [68.2, 14.0], [68.3, 14.0], [68.4, 14.0], [68.5, 14.0], [68.6, 14.0], [68.7, 14.0], [68.8, 14.0], [68.9, 14.0], [69.0, 14.0], [69.1, 14.0], [69.2, 14.0], [69.3, 14.0], [69.4, 14.0], [69.5, 14.0], [69.6, 14.0], [69.7, 14.0], [69.8, 14.0], [69.9, 14.0], [70.0, 14.0], [70.1, 14.0], [70.2, 14.0], [70.3, 14.0], [70.4, 14.0], [70.5, 14.0], [70.6, 14.0], [70.7, 14.0], [70.8, 14.0], [70.9, 14.0], [71.0, 14.0], [71.1, 14.0], [71.2, 14.0], [71.3, 14.0], [71.4, 14.0], [71.5, 14.0], [71.6, 14.0], [71.7, 14.0], [71.8, 14.0], [71.9, 14.0], [72.0, 14.0], [72.1, 14.0], [72.2, 14.0], [72.3, 14.0], [72.4, 14.0], [72.5, 14.0], [72.6, 14.0], [72.7, 14.0], [72.8, 14.0], [72.9, 14.0], [73.0, 14.0], [73.1, 14.0], [73.2, 14.0], [73.3, 14.0], [73.4, 14.0], [73.5, 14.0], [73.6, 14.0], [73.7, 14.0], [73.8, 14.0], [73.9, 14.0], [74.0, 14.0], [74.1, 14.0], [74.2, 15.0], [74.3, 15.0], [74.4, 15.0], [74.5, 15.0], [74.6, 15.0], [74.7, 15.0], [74.8, 15.0], [74.9, 15.0], [75.0, 15.0], [75.1, 15.0], [75.2, 15.0], [75.3, 15.0], [75.4, 15.0], [75.5, 15.0], [75.6, 15.0], [75.7, 15.0], [75.8, 15.0], [75.9, 15.0], [76.0, 15.0], [76.1, 15.0], [76.2, 15.0], [76.3, 15.0], [76.4, 15.0], [76.5, 15.0], [76.6, 15.0], [76.7, 15.0], [76.8, 15.0], [76.9, 15.0], [77.0, 15.0], [77.1, 15.0], [77.2, 15.0], [77.3, 15.0], [77.4, 15.0], [77.5, 15.0], [77.6, 15.0], [77.7, 15.0], [77.8, 15.0], [77.9, 15.0], [78.0, 15.0], [78.1, 15.0], [78.2, 15.0], [78.3, 15.0], [78.4, 15.0], [78.5, 15.0], [78.6, 15.0], [78.7, 15.0], [78.8, 15.0], [78.9, 16.0], [79.0, 16.0], [79.1, 16.0], [79.2, 16.0], [79.3, 16.0], [79.4, 16.0], [79.5, 16.0], [79.6, 16.0], [79.7, 16.0], [79.8, 16.0], [79.9, 16.0], [80.0, 16.0], [80.1, 16.0], [80.2, 16.0], [80.3, 16.0], [80.4, 16.0], [80.5, 16.0], [80.6, 16.0], [80.7, 17.0], [80.8, 17.0], [80.9, 17.0], [81.0, 17.0], [81.1, 17.0], [81.2, 17.0], [81.3, 17.0], [81.4, 17.0], [81.5, 18.0], [81.6, 18.0], [81.7, 18.0], [81.8, 18.0], [81.9, 19.0], [82.0, 19.0], [82.1, 19.0], [82.2, 20.0], [82.3, 20.0], [82.4, 21.0], [82.5, 21.0], [82.6, 22.0], [82.7, 23.0], [82.8, 23.0], [82.9, 23.0], [83.0, 23.0], [83.1, 24.0], [83.2, 24.0], [83.3, 24.0], [83.4, 24.0], [83.5, 24.0], [83.6, 25.0], [83.7, 25.0], [83.8, 25.0], [83.9, 26.0], [84.0, 26.0], [84.1, 26.0], [84.2, 27.0], [84.3, 27.0], [84.4, 27.0], [84.5, 27.0], [84.6, 28.0], [84.7, 28.0], [84.8, 28.0], [84.9, 29.0], [85.0, 29.0], [85.1, 30.0], [85.2, 30.0], [85.3, 31.0], [85.4, 31.0], [85.5, 32.0], [85.6, 32.0], [85.7, 33.0], [85.8, 34.0], [85.9, 34.0], [86.0, 35.0], [86.1, 35.0], [86.2, 36.0], [86.3, 36.0], [86.4, 37.0], [86.5, 37.0], [86.6, 37.0], [86.7, 38.0], [86.8, 38.0], [86.9, 39.0], [87.0, 39.0], [87.1, 40.0], [87.2, 40.0], [87.3, 41.0], [87.4, 42.0], [87.5, 42.0], [87.6, 43.0], [87.7, 44.0], [87.8, 44.0], [87.9, 45.0], [88.0, 46.0], [88.1, 46.0], [88.2, 47.0], [88.3, 47.0], [88.4, 48.0], [88.5, 49.0], [88.6, 49.0], [88.7, 50.0], [88.8, 50.0], [88.9, 51.0], [89.0, 52.0], [89.1, 53.0], [89.2, 54.0], [89.3, 55.0], [89.4, 56.0], [89.5, 57.0], [89.6, 58.0], [89.7, 58.0], [89.8, 59.0], [89.9, 60.0], [90.0, 61.0], [90.1, 62.0], [90.2, 63.0], [90.3, 64.0], [90.4, 65.0], [90.5, 66.0], [90.6, 68.0], [90.7, 68.0], [90.8, 70.0], [90.9, 71.0], [91.0, 72.0], [91.1, 73.0], [91.2, 74.0], [91.3, 75.0], [91.4, 77.0], [91.5, 78.0], [91.6, 79.0], [91.7, 81.0], [91.8, 82.0], [91.9, 83.0], [92.0, 85.0], [92.1, 86.0], [92.2, 88.0], [92.3, 89.0], [92.4, 90.0], [92.5, 91.0], [92.6, 93.0], [92.7, 95.0], [92.8, 97.0], [92.9, 99.0], [93.0, 100.0], [93.1, 102.0], [93.2, 104.0], [93.3, 107.0], [93.4, 108.0], [93.5, 110.0], [93.6, 112.0], [93.7, 115.0], [93.8, 118.0], [93.9, 119.0], [94.0, 121.0], [94.1, 124.0], [94.2, 126.0], [94.3, 128.0], [94.4, 130.0], [94.5, 133.0], [94.6, 136.0], [94.7, 138.0], [94.8, 140.0], [94.9, 144.0], [95.0, 147.0], [95.1, 149.0], [95.2, 152.0], [95.3, 155.0], [95.4, 158.0], [95.5, 160.0], [95.6, 163.0], [95.7, 166.0], [95.8, 170.0], [95.9, 174.0], [96.0, 178.0], [96.1, 181.0], [96.2, 186.0], [96.3, 190.0], [96.4, 194.0], [96.5, 198.0], [96.6, 203.0], [96.7, 208.0], [96.8, 213.0], [96.9, 217.0], [97.0, 223.0], [97.1, 227.0], [97.2, 233.0], [97.3, 241.0], [97.4, 250.0], [97.5, 264.0], [97.6, 273.0], [97.7, 283.0], [97.8, 293.0], [97.9, 304.0], [98.0, 314.0], [98.1, 326.0], [98.2, 338.0], [98.3, 349.0], [98.4, 359.0], [98.5, 371.0], [98.6, 385.0], [98.7, 393.0], [98.8, 403.0], [98.9, 416.0], [99.0, 433.0], [99.1, 445.0], [99.2, 466.0], [99.3, 485.0], [99.4, 505.0], [99.5, 532.0], [99.6, 571.0], [99.7, 615.0], [99.8, 684.0], [99.9, 777.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 7.0, "minX": 0.0, "maxY": 27891.0, "series": [{"data": [[0.0, 27891.0], [300.0, 274.0], [600.0, 45.0], [700.0, 30.0], [100.0, 1070.0], [200.0, 394.0], [400.0, 182.0], [800.0, 17.0], [900.0, 7.0], [500.0, 90.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 900.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 188.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 29812.0, "series": [{"data": [[1.0, 188.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 29812.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 1.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 6.403017241379303, "minX": 1.52644152E12, "maxY": 523.0486170761018, "series": [{"data": [[1.52644164E12, 6.403017241379303], [1.52644158E12, 258.35683130967726], [1.52644152E12, 523.0486170761018]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52644164E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 11.0, "minX": 1.0, "maxY": 307.17647058823536, "series": [{"data": [[2.0, 13.19047619047619], [3.0, 13.748201438848923], [4.0, 14.32547169811321], [5.0, 13.844086021505376], [6.0, 12.638651471984819], [7.0, 13.372361384745293], [8.0, 14.76309794988612], [9.0, 19.819672131147538], [10.0, 27.51219512195122], [11.0, 21.64], [12.0, 30.48387096774194], [13.0, 26.928571428571427], [14.0, 22.523809523809522], [15.0, 28.72], [16.0, 29.827586206896548], [17.0, 31.157894736842106], [18.0, 18.956521739130434], [19.0, 37.05263157894736], [20.0, 29.351351351351358], [21.0, 28.157894736842103], [22.0, 29.266666666666666], [23.0, 28.878787878787882], [24.0, 23.740740740740744], [25.0, 26.199999999999996], [26.0, 23.214285714285715], [27.0, 27.636363636363637], [28.0, 23.76923076923077], [29.0, 21.75], [30.0, 21.615384615384617], [31.0, 15.666666666666668], [32.0, 16.615384615384617], [33.0, 15.166666666666666], [35.0, 15.25], [34.0, 16.25], [37.0, 19.714285714285715], [36.0, 14.333333333333334], [39.0, 21.4], [38.0, 13.5], [40.0, 14.999999999999998], [41.0, 18.25], [42.0, 14.6], [43.0, 14.142857142857142], [44.0, 24.5], [45.0, 24.42857142857143], [47.0, 15.0], [46.0, 14.6], [48.0, 14.4], [49.0, 14.5], [50.0, 39.67857142857142], [51.0, 14.8], [52.0, 16.8], [53.0, 14.666666666666666], [55.0, 14.333333333333334], [54.0, 14.5], [56.0, 14.333333333333334], [57.0, 14.75], [59.0, 14.75], [58.0, 14.0], [60.0, 15.0], [61.0, 14.333333333333334], [63.0, 15.0], [62.0, 14.666666666666666], [65.0, 15.0], [64.0, 14.0], [67.0, 15.333333333333334], [66.0, 14.0], [68.0, 15.571428571428571], [69.0, 14.25], [70.0, 14.6], [71.0, 14.5], [74.0, 14.0], [72.0, 14.2], [73.0, 15.0], [75.0, 14.5], [78.0, 13.714285714285715], [79.0, 14.0], [76.0, 14.0], [77.0, 13.5], [80.0, 15.25], [82.0, 20.5], [83.0, 17.25], [81.0, 13.333333333333334], [86.0, 13.4], [85.0, 14.333333333333334], [84.0, 15.666666666666666], [87.0, 13.5], [88.0, 13.666666666666666], [89.0, 13.0], [90.0, 13.333333333333334], [91.0, 14.5], [92.0, 13.2], [94.0, 12.333333333333334], [95.0, 13.0], [93.0, 12.0], [99.0, 75.8125], [98.0, 15.285714285714285], [96.0, 13.666666666666666], [97.0, 14.0], [100.0, 44.0], [103.0, 100.33333333333334], [101.0, 13.5], [102.0, 13.0], [104.0, 33.8], [105.0, 33.0], [106.0, 56.5], [107.0, 48.0], [109.0, 50.0], [110.0, 42.0], [111.0, 78.2], [108.0, 14.0], [112.0, 14.0], [113.0, 56.857142857142854], [115.0, 76.4], [114.0, 13.0], [117.0, 43.714285714285715], [118.0, 46.0], [119.0, 15.0], [116.0, 13.6], [120.0, 67.66666666666667], [123.0, 37.333333333333336], [121.0, 13.25], [122.0, 13.4], [124.0, 45.57142857142857], [126.0, 13.75], [127.0, 13.0], [125.0, 13.0], [129.0, 59.85714285714287], [131.0, 37.0], [132.0, 40.42857142857142], [133.0, 100.0], [134.0, 29.4], [135.0, 73.0], [128.0, 13.666666666666666], [130.0, 13.333333333333334], [138.0, 16.142857142857146], [139.0, 68.25], [140.0, 32.0], [141.0, 96.8], [142.0, 28.166666666666664], [137.0, 12.666666666666666], [136.0, 13.0], [143.0, 12.0], [144.0, 16.5], [145.0, 92.66666666666666], [146.0, 46.285714285714285], [147.0, 102.25], [148.0, 30.666666666666668], [149.0, 17.8], [150.0, 54.5], [151.0, 47.0], [152.0, 81.66666666666666], [153.0, 99.64179104477613], [154.0, 32.0], [155.0, 49.4], [156.0, 139.0], [157.0, 20.8], [158.0, 71.5], [159.0, 12.5], [160.0, 24.333333333333332], [161.0, 106.5], [162.0, 21.166666666666664], [163.0, 65.0], [165.0, 14.4], [166.0, 83.0], [167.0, 40.6], [164.0, 13.0], [168.0, 69.66666666666666], [170.0, 15.0], [171.0, 22.333333333333332], [172.0, 33.05263157894736], [173.0, 21.53846153846154], [174.0, 20.297297297297302], [175.0, 13.266666666666667], [169.0, 13.0], [176.0, 19.593750000000004], [177.0, 16.428571428571427], [178.0, 37.72727272727273], [179.0, 51.749999999999986], [182.0, 13.125], [183.0, 30.958333333333336], [181.0, 18.937500000000004], [180.0, 13.4], [184.0, 16.449999999999996], [185.0, 31.352941176470587], [187.0, 14.52173913043478], [188.0, 19.772727272727273], [189.0, 32.3125], [190.0, 15.840000000000005], [191.0, 19.666666666666668], [186.0, 14.071428571428573], [192.0, 13.739130434782611], [194.0, 21.157894736842106], [195.0, 30.250000000000007], [196.0, 13.333333333333332], [197.0, 21.46666666666667], [198.0, 18.375], [199.0, 18.923076923076923], [193.0, 12.708333333333334], [201.0, 23.099999999999998], [202.0, 43.36363636363636], [203.0, 24.5], [204.0, 14.999999999999998], [205.0, 19.615384615384617], [206.0, 15.0], [207.0, 62.0], [200.0, 12.714285714285715], [208.0, 34.285714285714285], [209.0, 22.11111111111111], [210.0, 15.285714285714286], [212.0, 24.75], [213.0, 67.28571428571428], [214.0, 99.47058823529407], [215.0, 43.42857142857142], [211.0, 13.5], [217.0, 20.88888888888889], [218.0, 25.0], [223.0, 19.857142857142858], [216.0, 28.0], [220.0, 60.8], [221.0, 31.428571428571434], [222.0, 13.428571428571429], [219.0, 13.624999999999998], [230.0, 41.333333333333336], [224.0, 17.75], [225.0, 28.11111111111111], [226.0, 27.545454545454547], [227.0, 30.875000000000004], [229.0, 13.222222222222221], [228.0, 13.6], [231.0, 12.333333333333332], [237.0, 63.22222222222222], [232.0, 49.4], [233.0, 40.666666666666664], [235.0, 14.5], [236.0, 17.875], [238.0, 47.66666666666667], [239.0, 17.714285714285715], [234.0, 14.166666666666666], [241.0, 19.3], [242.0, 38.36363636363637], [243.0, 86.50000000000001], [246.0, 22.9], [247.0, 25.0], [240.0, 44.57142857142858], [244.0, 15.25], [245.0, 37.333333333333336], [248.0, 94.33333333333333], [249.0, 37.54545454545455], [251.0, 24.88888888888889], [252.0, 22.0], [253.0, 87.0], [254.0, 17.714285714285715], [250.0, 21.833333333333332], [255.0, 39.55555555555556], [257.0, 19.714285714285715], [256.0, 19.4], [258.0, 116.75], [259.0, 151.87804878048777], [260.0, 16.71428571428571], [261.0, 16.5], [262.0, 24.250000000000004], [263.0, 16.857142857142858], [264.0, 76.46153846153847], [271.0, 23.5], [268.0, 27.599999999999994], [269.0, 12.333333333333334], [270.0, 126.42857142857142], [265.0, 165.5], [266.0, 19.363636363636363], [267.0, 21.25], [273.0, 22.875000000000004], [272.0, 29.0], [275.0, 96.71428571428572], [284.0, 12.666666666666666], [274.0, 12.8], [285.0, 112.33333333333334], [286.0, 13.166666666666666], [287.0, 24.0], [276.0, 26.22222222222222], [277.0, 24.42857142857143], [278.0, 31.625000000000004], [279.0, 16.4], [280.0, 51.416666666666664], [281.0, 14.142857142857142], [282.0, 29.333333333333332], [283.0, 33.2], [300.0, 125.6], [296.0, 20.333333333333332], [290.0, 104.44444444444444], [291.0, 12.0], [297.0, 36.833333333333336], [301.0, 34.75], [302.0, 106.625], [303.0, 38.0], [299.0, 48.166666666666664], [298.0, 13.0], [288.0, 13.0], [294.0, 12.0], [295.0, 13.0], [292.0, 13.5], [293.0, 12.714285714285714], [289.0, 12.0], [316.0, 306.5], [304.0, 19.75], [307.0, 14.166666666666666], [305.0, 12.333333333333334], [306.0, 12.5], [308.0, 70.25], [309.0, 124.8], [310.0, 13.0], [311.0, 14.0], [313.0, 16.5], [314.0, 14.25], [315.0, 15.833333333333332], [317.0, 13.5], [318.0, 17.0], [319.0, 12.75], [312.0, 12.0], [322.0, 13.666666666666668], [320.0, 22.0], [321.0, 86.0], [323.0, 15.11111111111111], [332.0, 12.666666666666666], [333.0, 12.75], [334.0, 22.437500000000004], [335.0, 16.533333333333335], [324.0, 20.25], [325.0, 18.22222222222222], [326.0, 19.2], [327.0, 77.0], [328.0, 20.333333333333332], [329.0, 18.666666666666668], [330.0, 17.21428571428571], [331.0, 16.166666666666668], [337.0, 18.999999999999996], [336.0, 56.111111111111114], [339.0, 17.2], [338.0, 16.8], [348.0, 12.333333333333334], [349.0, 85.57142857142856], [350.0, 15.5], [351.0, 80.81250000000001], [345.0, 21.714285714285715], [344.0, 20.636363636363633], [340.0, 18.27272727272727], [341.0, 44.14285714285714], [342.0, 78.28571428571428], [343.0, 12.333333333333334], [346.0, 21.09090909090909], [347.0, 39.9375], [353.0, 25.062499999999996], [352.0, 36.93333333333333], [354.0, 19.75], [355.0, 12.555555555555554], [356.0, 12.230769230769232], [357.0, 12.058823529411766], [358.0, 44.5], [359.0, 21.749999999999996], [360.0, 12.299999999999999], [366.0, 12.6], [367.0, 52.90909090909091], [364.0, 12.8], [365.0, 16.666666666666668], [361.0, 22.11111111111111], [362.0, 12.444444444444445], [363.0, 58.90909090909092], [371.0, 14.043478260869566], [368.0, 19.470588235294116], [374.0, 54.222222222222214], [375.0, 14.8], [369.0, 27.708333333333336], [370.0, 18.92857142857143], [381.0, 62.55555555555554], [382.0, 19.000000000000004], [383.0, 43.4], [376.0, 12.428571428571429], [380.0, 16.428571428571427], [377.0, 34.714285714285715], [378.0, 14.666666666666666], [379.0, 33.833333333333336], [372.0, 12.928571428571429], [373.0, 25.88888888888889], [396.0, 20.181818181818183], [391.0, 18.900000000000002], [390.0, 13.777777777777779], [385.0, 34.0], [384.0, 12.75], [387.0, 60.75], [386.0, 17.42857142857143], [398.0, 15.4], [399.0, 39.45161290322581], [392.0, 13.833333333333332], [393.0, 57.33333333333332], [397.0, 61.411764705882355], [395.0, 28.100000000000005], [394.0, 42.166666666666664], [388.0, 13.0], [389.0, 52.87499999999999], [400.0, 42.3], [402.0, 15.365853658536588], [401.0, 16.05263157894737], [403.0, 63.825], [412.0, 16.925925925925927], [413.0, 25.76470588235294], [414.0, 14.375], [415.0, 20.82142857142857], [404.0, 20.030303030303028], [405.0, 13.925], [406.0, 14.928571428571432], [407.0, 20.846153846153847], [408.0, 37.095238095238095], [409.0, 20.275862068965516], [410.0, 13.541666666666668], [411.0, 12.785714285714286], [417.0, 17.952380952380953], [416.0, 13.827586206896552], [418.0, 14.19047619047619], [419.0, 25.85714285714286], [420.0, 28.210526315789476], [421.0, 13.12], [422.0, 19.047619047619047], [423.0, 13.241379310344827], [424.0, 40.470588235294116], [431.0, 13.75], [428.0, 42.7], [429.0, 12.285714285714288], [430.0, 41.666666666666664], [425.0, 21.466666666666665], [426.0, 12.357142857142858], [427.0, 13.857142857142858], [433.0, 21.933333333333334], [432.0, 12.166666666666668], [435.0, 12.842105263157894], [434.0, 40.00000000000001], [436.0, 22.20689655172414], [437.0, 12.935483870967742], [438.0, 16.133333333333326], [439.0, 12.639344262295081], [440.0, 22.38461538461539], [443.0, 15.310344827586212], [442.0, 12.687499999999998], [441.0, 20.857142857142854], [444.0, 12.761904761904761], [445.0, 31.39285714285714], [447.0, 59.56666666666668], [446.0, 13.363636363636363], [449.0, 28.81818181818182], [450.0, 44.666666666666664], [451.0, 15.933333333333334], [452.0, 12.68421052631579], [453.0, 43.125], [455.0, 18.384615384615383], [448.0, 19.299999999999997], [454.0, 21.529411764705884], [456.0, 51.285714285714285], [457.0, 12.624999999999998], [458.0, 12.583333333333332], [459.0, 66.2], [462.0, 32.64285714285714], [463.0, 15.655172413793105], [461.0, 21.828571428571422], [460.0, 14.785714285714288], [479.0, 19.322580645161295], [475.0, 18.97183098591549], [474.0, 24.749999999999996], [477.0, 22.471698113207545], [476.0, 13.327586206896553], [467.0, 25.021276595744677], [478.0, 26.140624999999996], [472.0, 23.86585365853658], [471.0, 13.602409638554217], [470.0, 19.171717171717173], [469.0, 13.585365853658532], [468.0, 18.354838709677423], [464.0, 15.269230769230772], [465.0, 31.48571428571428], [466.0, 20.606060606060606], [473.0, 26.40000000000001], [492.0, 33.87878787878788], [490.0, 37.15151515151515], [485.0, 14.908256880733948], [491.0, 26.77900552486188], [493.0, 30.615384615384617], [495.0, 38.040935672514635], [488.0, 30.514999999999976], [489.0, 35.98584905660378], [494.0, 25.267175572519093], [484.0, 13.1375], [482.0, 18.410958904109588], [483.0, 20.389610389610393], [480.0, 12.186440677966106], [481.0, 12.612903225806447], [487.0, 26.039215686274527], [486.0, 15.401459854014602], [499.0, 29.571428571428562], [497.0, 40.47682119205297], [496.0, 23.86046511627907], [503.0, 24.870000000000005], [498.0, 36.61783439490447], [501.0, 27.19607843137254], [500.0, 36.327868852459005], [502.0, 34.51677852348993], [504.0, 25.098039215686274], [511.0, 41.47092198581553], [510.0, 24.29829984544049], [508.0, 33.22736842105264], [509.0, 22.328440366972472], [505.0, 23.051051051051044], [507.0, 27.183529411764706], [506.0, 22.575418994413404], [519.0, 73.43030303030305], [513.0, 32.18454258675077], [512.0, 37.51862464183388], [525.0, 27.778761061946902], [526.0, 29.444444444444432], [527.0, 28.978947368421064], [515.0, 43.75104602510458], [514.0, 33.26381461675579], [516.0, 65.08163265306129], [518.0, 107.20940170940172], [517.0, 49.48986486486483], [528.0, 29.000000000000004], [543.0, 40.58], [541.0, 59.17741935483871], [542.0, 35.23880597014926], [538.0, 51.45], [539.0, 73.6486486486486], [540.0, 63.0], [536.0, 61.621848739495796], [537.0, 82.27118644067794], [529.0, 34.32432432432434], [530.0, 35.999999999999986], [531.0, 32.720000000000006], [532.0, 33.28723404255318], [533.0, 45.96250000000001], [534.0, 93.91452991452995], [535.0, 63.49523809523809], [520.0, 36.23008849557521], [521.0, 59.8653846153846], [522.0, 46.49494949494949], [523.0, 33.35643564356437], [524.0, 25.07228915662651], [547.0, 35.152173913043484], [544.0, 64.42105263157895], [559.0, 58.703703703703724], [557.0, 175.75000000000003], [558.0, 58.59999999999999], [554.0, 62.673469387755105], [555.0, 66.43589743589742], [556.0, 54.7837837837838], [545.0, 51.83673469387755], [546.0, 92.7906976744186], [548.0, 72.45762711864403], [549.0, 57.48101265822785], [550.0, 56.40677966101696], [551.0, 79.5434782608696], [560.0, 79.77586206896551], [575.0, 154.12307692307687], [569.0, 51.49999999999998], [568.0, 122.39999999999998], [573.0, 87.69696969696969], [572.0, 88.85000000000001], [571.0, 56.05263157894737], [570.0, 50.869565217391305], [574.0, 118.59574468085106], [561.0, 45.324324324324316], [562.0, 105.10526315789475], [565.0, 68.59183673469384], [564.0, 35.7608695652174], [567.0, 88.15151515151516], [566.0, 74.58974358974358], [563.0, 44.444444444444436], [552.0, 71.66], [553.0, 35.645833333333336], [579.0, 138.0357142857143], [576.0, 93.5681818181818], [590.0, 99.12121212121211], [591.0, 63.825], [588.0, 137.7234042553191], [589.0, 307.17647058823536], [586.0, 117.54347826086956], [587.0, 110.75000000000003], [577.0, 108.44444444444447], [578.0, 146.17391304347828], [580.0, 118.55882352941181], [581.0, 86.20000000000002], [582.0, 66.53125], [583.0, 66.26666666666667], [592.0, 52.97297297297297], [604.0, 93.87500000000001], [606.0, 60.824999999999996], [605.0, 91.48387096774194], [607.0, 101.25], [601.0, 42.17142857142857], [600.0, 56.96969696969697], [602.0, 74.96874999999997], [603.0, 86.72222222222223], [593.0, 68.00000000000001], [594.0, 117.23684210526316], [595.0, 64.30769230769229], [596.0, 85.4375], [597.0, 83.33333333333333], [599.0, 110.49999999999999], [598.0, 26.09090909090909], [584.0, 139.8863636363636], [585.0, 78.40540540540543], [614.0, 159.70588235294116], [620.0, 94.41666666666669], [611.0, 51.78571428571429], [610.0, 79.52173913043478], [608.0, 46.821428571428584], [609.0, 85.56756756756756], [612.0, 64.26666666666668], [613.0, 101.15789473684211], [625.0, 76.7857142857143], [624.0, 66.8], [639.0, 61.25], [638.0, 29.916666666666664], [636.0, 41.68421052631579], [637.0, 66.86666666666667], [634.0, 72.125], [635.0, 79.875], [632.0, 25.727272727272727], [615.0, 124.49999999999999], [633.0, 45.466666666666676], [626.0, 21.249999999999996], [627.0, 40.083333333333336], [628.0, 94.16666666666666], [631.0, 16.666666666666668], [629.0, 78.0909090909091], [630.0, 159.0], [617.0, 87.57142857142857], [616.0, 18.333333333333336], [618.0, 82.80000000000001], [619.0, 125.9090909090909], [622.0, 77.85714285714286], [621.0, 141.125], [623.0, 65.18181818181819], [643.0, 70.3888888888889], [640.0, 59.52941176470588], [655.0, 40.76923076923077], [653.0, 17.90909090909091], [654.0, 20.333333333333336], [650.0, 71.6], [651.0, 28.625], [652.0, 15.5], [641.0, 36.00000000000001], [642.0, 57.857142857142854], [644.0, 88.13333333333334], [645.0, 55.68421052631579], [646.0, 29.0], [647.0, 61.727272727272734], [656.0, 19.125000000000004], [671.0, 26.333333333333332], [669.0, 28.210526315789473], [670.0, 31.699999999999992], [666.0, 53.54545454545455], [667.0, 26.42105263157895], [668.0, 27.733333333333334], [665.0, 55.7], [664.0, 29.42105263157895], [657.0, 21.166666666666668], [661.0, 35.60000000000001], [660.0, 18.166666666666664], [659.0, 27.999999999999996], [658.0, 23.583333333333332], [663.0, 92.6], [662.0, 19.4], [648.0, 32.30769230769231], [649.0, 30.999999999999993], [678.0, 79.66666666666666], [684.0, 82.75], [675.0, 77.22222222222221], [672.0, 12.222222222222221], [674.0, 25.90909090909091], [673.0, 12.333333333333334], [685.0, 27.333333333333332], [686.0, 12.0], [676.0, 16.0], [677.0, 11.0], [681.0, 58.23076923076923], [680.0, 70.9090909090909], [682.0, 35.16666666666667], [683.0, 21.333333333333332], [679.0, 54.0], [695.0, 47.5], [693.0, 14.0], [691.0, 14.0], [689.0, 12.666666666666666], [688.0, 17.0], [690.0, 26.0], [694.0, 14.0], [697.0, 87.0], [698.0, 14.0], [699.0, 71.75], [696.0, 48.75], [1.0, 13.897435897435892]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[349.384066666669, 33.881866666666475]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 699.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 131912.55, "minX": 1.52644152E12, "maxY": 3099405.433333333, "series": [{"data": [[1.52644164E12, 254295.2], [1.52644158E12, 3099405.433333333], [1.52644152E12, 2126799.3666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52644164E12, 131912.55], [1.52644158E12, 1607856.7166666666], [1.52644152E12, 1103272.5833333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52644164E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 13.464080459770154, "minX": 1.52644152E12, "maxY": 58.801838172134914, "series": [{"data": [[1.52644164E12, 13.464080459770154], [1.52644158E12, 18.457090651892077], [1.52644152E12, 58.801838172134914]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52644164E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 13.45186781609196, "minX": 1.52644152E12, "maxY": 58.7793334478613, "series": [{"data": [[1.52644164E12, 13.45186781609196], [1.52644158E12, 18.4374631616174], [1.52644152E12, 58.7793334478613]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52644164E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.24731816574325075, "minX": 1.52644152E12, "maxY": 0.9713107713451251, "series": [{"data": [[1.52644164E12, 0.2564655172413794], [1.52644158E12, 0.24731816574325075], [1.52644152E12, 0.9713107713451251]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52644164E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 11.0, "minX": 1.52644152E12, "maxY": 989.0, "series": [{"data": [[1.52644164E12, 18.0], [1.52644158E12, 906.0], [1.52644152E12, 989.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52644164E12, 11.0], [1.52644158E12, 11.0], [1.52644152E12, 11.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52644164E12, 16.0], [1.52644158E12, 24.0], [1.52644152E12, 162.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52644164E12, 307.950000000008], [1.52644158E12, 389.0], [1.52644152E12, 538.1399999999994]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52644164E12, 50.0], [1.52644158E12, 83.0], [1.52644152E12, 288.85000000000036]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52644164E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 13.0, "minX": 23.0, "maxY": 13.0, "series": [{"data": [[282.0, 13.0], [23.0, 13.0], [194.0, 13.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 282.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 13.0, "minX": 23.0, "maxY": 13.0, "series": [{"data": [[282.0, 13.0], [23.0, 13.0], [194.0, 13.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 282.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 23.183333333333334, "minX": 1.52644152E12, "maxY": 282.56666666666666, "series": [{"data": [[1.52644164E12, 23.183333333333334], [1.52644158E12, 282.56666666666666], [1.52644152E12, 194.25]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52644164E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 23.2, "minX": 1.52644152E12, "maxY": 282.76666666666665, "series": [{"data": [[1.52644164E12, 23.2], [1.52644158E12, 282.76666666666665], [1.52644152E12, 194.03333333333333]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52644164E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 23.2, "minX": 1.52644152E12, "maxY": 282.76666666666665, "series": [{"data": [[1.52644164E12, 23.2], [1.52644158E12, 282.76666666666665], [1.52644152E12, 194.03333333333333]], "isOverall": false, "label": "inference-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52644164E12, "title": "Transactions Per Second"}},
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
