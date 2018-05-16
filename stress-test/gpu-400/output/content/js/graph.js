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
        data: {"result": {"minY": 11.0, "minX": 0.0, "maxY": 864.0, "series": [{"data": [[0.0, 11.0], [0.1, 11.0], [0.2, 11.0], [0.3, 11.0], [0.4, 11.0], [0.5, 11.0], [0.6, 11.0], [0.7, 11.0], [0.8, 11.0], [0.9, 11.0], [1.0, 11.0], [1.1, 11.0], [1.2, 11.0], [1.3, 11.0], [1.4, 11.0], [1.5, 11.0], [1.6, 11.0], [1.7, 11.0], [1.8, 11.0], [1.9, 11.0], [2.0, 11.0], [2.1, 11.0], [2.2, 11.0], [2.3, 11.0], [2.4, 11.0], [2.5, 11.0], [2.6, 11.0], [2.7, 11.0], [2.8, 11.0], [2.9, 11.0], [3.0, 11.0], [3.1, 11.0], [3.2, 11.0], [3.3, 11.0], [3.4, 11.0], [3.5, 11.0], [3.6, 11.0], [3.7, 11.0], [3.8, 11.0], [3.9, 11.0], [4.0, 11.0], [4.1, 12.0], [4.2, 12.0], [4.3, 12.0], [4.4, 12.0], [4.5, 12.0], [4.6, 12.0], [4.7, 12.0], [4.8, 12.0], [4.9, 12.0], [5.0, 12.0], [5.1, 12.0], [5.2, 12.0], [5.3, 12.0], [5.4, 12.0], [5.5, 12.0], [5.6, 12.0], [5.7, 12.0], [5.8, 12.0], [5.9, 12.0], [6.0, 12.0], [6.1, 12.0], [6.2, 12.0], [6.3, 12.0], [6.4, 12.0], [6.5, 12.0], [6.6, 12.0], [6.7, 12.0], [6.8, 12.0], [6.9, 12.0], [7.0, 12.0], [7.1, 12.0], [7.2, 12.0], [7.3, 12.0], [7.4, 12.0], [7.5, 12.0], [7.6, 12.0], [7.7, 12.0], [7.8, 12.0], [7.9, 12.0], [8.0, 12.0], [8.1, 12.0], [8.2, 12.0], [8.3, 12.0], [8.4, 12.0], [8.5, 12.0], [8.6, 12.0], [8.7, 12.0], [8.8, 12.0], [8.9, 12.0], [9.0, 12.0], [9.1, 12.0], [9.2, 12.0], [9.3, 12.0], [9.4, 12.0], [9.5, 12.0], [9.6, 12.0], [9.7, 12.0], [9.8, 12.0], [9.9, 12.0], [10.0, 12.0], [10.1, 12.0], [10.2, 12.0], [10.3, 12.0], [10.4, 12.0], [10.5, 12.0], [10.6, 12.0], [10.7, 12.0], [10.8, 12.0], [10.9, 12.0], [11.0, 12.0], [11.1, 12.0], [11.2, 12.0], [11.3, 12.0], [11.4, 12.0], [11.5, 12.0], [11.6, 12.0], [11.7, 12.0], [11.8, 12.0], [11.9, 12.0], [12.0, 12.0], [12.1, 12.0], [12.2, 12.0], [12.3, 12.0], [12.4, 12.0], [12.5, 12.0], [12.6, 12.0], [12.7, 12.0], [12.8, 12.0], [12.9, 12.0], [13.0, 12.0], [13.1, 12.0], [13.2, 12.0], [13.3, 12.0], [13.4, 12.0], [13.5, 12.0], [13.6, 12.0], [13.7, 12.0], [13.8, 12.0], [13.9, 12.0], [14.0, 12.0], [14.1, 12.0], [14.2, 12.0], [14.3, 12.0], [14.4, 12.0], [14.5, 12.0], [14.6, 12.0], [14.7, 12.0], [14.8, 12.0], [14.9, 12.0], [15.0, 12.0], [15.1, 12.0], [15.2, 12.0], [15.3, 12.0], [15.4, 12.0], [15.5, 12.0], [15.6, 12.0], [15.7, 12.0], [15.8, 12.0], [15.9, 12.0], [16.0, 12.0], [16.1, 12.0], [16.2, 12.0], [16.3, 12.0], [16.4, 12.0], [16.5, 12.0], [16.6, 12.0], [16.7, 12.0], [16.8, 12.0], [16.9, 12.0], [17.0, 12.0], [17.1, 12.0], [17.2, 12.0], [17.3, 12.0], [17.4, 12.0], [17.5, 12.0], [17.6, 12.0], [17.7, 12.0], [17.8, 12.0], [17.9, 12.0], [18.0, 12.0], [18.1, 12.0], [18.2, 12.0], [18.3, 12.0], [18.4, 12.0], [18.5, 12.0], [18.6, 12.0], [18.7, 12.0], [18.8, 12.0], [18.9, 12.0], [19.0, 12.0], [19.1, 12.0], [19.2, 12.0], [19.3, 12.0], [19.4, 12.0], [19.5, 12.0], [19.6, 12.0], [19.7, 12.0], [19.8, 12.0], [19.9, 12.0], [20.0, 12.0], [20.1, 12.0], [20.2, 12.0], [20.3, 12.0], [20.4, 12.0], [20.5, 12.0], [20.6, 12.0], [20.7, 12.0], [20.8, 12.0], [20.9, 12.0], [21.0, 12.0], [21.1, 12.0], [21.2, 12.0], [21.3, 12.0], [21.4, 12.0], [21.5, 12.0], [21.6, 12.0], [21.7, 12.0], [21.8, 12.0], [21.9, 12.0], [22.0, 12.0], [22.1, 12.0], [22.2, 12.0], [22.3, 12.0], [22.4, 12.0], [22.5, 12.0], [22.6, 12.0], [22.7, 12.0], [22.8, 12.0], [22.9, 12.0], [23.0, 12.0], [23.1, 12.0], [23.2, 12.0], [23.3, 12.0], [23.4, 12.0], [23.5, 12.0], [23.6, 12.0], [23.7, 12.0], [23.8, 12.0], [23.9, 12.0], [24.0, 12.0], [24.1, 12.0], [24.2, 12.0], [24.3, 12.0], [24.4, 12.0], [24.5, 12.0], [24.6, 12.0], [24.7, 12.0], [24.8, 12.0], [24.9, 12.0], [25.0, 12.0], [25.1, 12.0], [25.2, 12.0], [25.3, 12.0], [25.4, 12.0], [25.5, 12.0], [25.6, 12.0], [25.7, 12.0], [25.8, 12.0], [25.9, 12.0], [26.0, 12.0], [26.1, 12.0], [26.2, 12.0], [26.3, 12.0], [26.4, 12.0], [26.5, 12.0], [26.6, 12.0], [26.7, 12.0], [26.8, 12.0], [26.9, 12.0], [27.0, 12.0], [27.1, 12.0], [27.2, 12.0], [27.3, 12.0], [27.4, 12.0], [27.5, 12.0], [27.6, 12.0], [27.7, 12.0], [27.8, 12.0], [27.9, 12.0], [28.0, 12.0], [28.1, 12.0], [28.2, 12.0], [28.3, 12.0], [28.4, 12.0], [28.5, 12.0], [28.6, 12.0], [28.7, 12.0], [28.8, 12.0], [28.9, 12.0], [29.0, 12.0], [29.1, 12.0], [29.2, 12.0], [29.3, 12.0], [29.4, 12.0], [29.5, 12.0], [29.6, 12.0], [29.7, 12.0], [29.8, 12.0], [29.9, 12.0], [30.0, 12.0], [30.1, 12.0], [30.2, 12.0], [30.3, 12.0], [30.4, 12.0], [30.5, 12.0], [30.6, 12.0], [30.7, 12.0], [30.8, 12.0], [30.9, 12.0], [31.0, 12.0], [31.1, 12.0], [31.2, 12.0], [31.3, 12.0], [31.4, 12.0], [31.5, 12.0], [31.6, 12.0], [31.7, 12.0], [31.8, 12.0], [31.9, 12.0], [32.0, 12.0], [32.1, 12.0], [32.2, 12.0], [32.3, 12.0], [32.4, 12.0], [32.5, 12.0], [32.6, 12.0], [32.7, 12.0], [32.8, 12.0], [32.9, 12.0], [33.0, 12.0], [33.1, 12.0], [33.2, 12.0], [33.3, 12.0], [33.4, 12.0], [33.5, 12.0], [33.6, 12.0], [33.7, 12.0], [33.8, 12.0], [33.9, 13.0], [34.0, 13.0], [34.1, 13.0], [34.2, 13.0], [34.3, 13.0], [34.4, 13.0], [34.5, 13.0], [34.6, 13.0], [34.7, 13.0], [34.8, 13.0], [34.9, 13.0], [35.0, 13.0], [35.1, 13.0], [35.2, 13.0], [35.3, 13.0], [35.4, 13.0], [35.5, 13.0], [35.6, 13.0], [35.7, 13.0], [35.8, 13.0], [35.9, 13.0], [36.0, 13.0], [36.1, 13.0], [36.2, 13.0], [36.3, 13.0], [36.4, 13.0], [36.5, 13.0], [36.6, 13.0], [36.7, 13.0], [36.8, 13.0], [36.9, 13.0], [37.0, 13.0], [37.1, 13.0], [37.2, 13.0], [37.3, 13.0], [37.4, 13.0], [37.5, 13.0], [37.6, 13.0], [37.7, 13.0], [37.8, 13.0], [37.9, 13.0], [38.0, 13.0], [38.1, 13.0], [38.2, 13.0], [38.3, 13.0], [38.4, 13.0], [38.5, 13.0], [38.6, 13.0], [38.7, 13.0], [38.8, 13.0], [38.9, 13.0], [39.0, 13.0], [39.1, 13.0], [39.2, 13.0], [39.3, 13.0], [39.4, 13.0], [39.5, 13.0], [39.6, 13.0], [39.7, 13.0], [39.8, 13.0], [39.9, 13.0], [40.0, 13.0], [40.1, 13.0], [40.2, 13.0], [40.3, 13.0], [40.4, 13.0], [40.5, 13.0], [40.6, 13.0], [40.7, 13.0], [40.8, 13.0], [40.9, 13.0], [41.0, 13.0], [41.1, 13.0], [41.2, 13.0], [41.3, 13.0], [41.4, 13.0], [41.5, 13.0], [41.6, 13.0], [41.7, 13.0], [41.8, 13.0], [41.9, 13.0], [42.0, 13.0], [42.1, 13.0], [42.2, 13.0], [42.3, 13.0], [42.4, 13.0], [42.5, 13.0], [42.6, 13.0], [42.7, 13.0], [42.8, 13.0], [42.9, 13.0], [43.0, 13.0], [43.1, 13.0], [43.2, 13.0], [43.3, 13.0], [43.4, 13.0], [43.5, 13.0], [43.6, 13.0], [43.7, 13.0], [43.8, 13.0], [43.9, 13.0], [44.0, 13.0], [44.1, 13.0], [44.2, 13.0], [44.3, 13.0], [44.4, 13.0], [44.5, 13.0], [44.6, 13.0], [44.7, 13.0], [44.8, 13.0], [44.9, 13.0], [45.0, 13.0], [45.1, 13.0], [45.2, 13.0], [45.3, 13.0], [45.4, 13.0], [45.5, 13.0], [45.6, 13.0], [45.7, 13.0], [45.8, 13.0], [45.9, 13.0], [46.0, 13.0], [46.1, 13.0], [46.2, 13.0], [46.3, 13.0], [46.4, 13.0], [46.5, 13.0], [46.6, 13.0], [46.7, 13.0], [46.8, 13.0], [46.9, 13.0], [47.0, 13.0], [47.1, 13.0], [47.2, 13.0], [47.3, 13.0], [47.4, 13.0], [47.5, 13.0], [47.6, 13.0], [47.7, 13.0], [47.8, 13.0], [47.9, 13.0], [48.0, 13.0], [48.1, 13.0], [48.2, 13.0], [48.3, 13.0], [48.4, 13.0], [48.5, 13.0], [48.6, 13.0], [48.7, 13.0], [48.8, 13.0], [48.9, 13.0], [49.0, 13.0], [49.1, 13.0], [49.2, 13.0], [49.3, 13.0], [49.4, 13.0], [49.5, 13.0], [49.6, 13.0], [49.7, 13.0], [49.8, 13.0], [49.9, 13.0], [50.0, 13.0], [50.1, 13.0], [50.2, 13.0], [50.3, 13.0], [50.4, 13.0], [50.5, 13.0], [50.6, 13.0], [50.7, 13.0], [50.8, 13.0], [50.9, 13.0], [51.0, 13.0], [51.1, 13.0], [51.2, 13.0], [51.3, 13.0], [51.4, 13.0], [51.5, 13.0], [51.6, 13.0], [51.7, 13.0], [51.8, 13.0], [51.9, 13.0], [52.0, 13.0], [52.1, 13.0], [52.2, 13.0], [52.3, 13.0], [52.4, 13.0], [52.5, 13.0], [52.6, 13.0], [52.7, 13.0], [52.8, 13.0], [52.9, 13.0], [53.0, 13.0], [53.1, 13.0], [53.2, 13.0], [53.3, 13.0], [53.4, 13.0], [53.5, 13.0], [53.6, 13.0], [53.7, 13.0], [53.8, 13.0], [53.9, 13.0], [54.0, 13.0], [54.1, 13.0], [54.2, 13.0], [54.3, 13.0], [54.4, 13.0], [54.5, 13.0], [54.6, 13.0], [54.7, 13.0], [54.8, 13.0], [54.9, 13.0], [55.0, 13.0], [55.1, 13.0], [55.2, 13.0], [55.3, 13.0], [55.4, 13.0], [55.5, 13.0], [55.6, 13.0], [55.7, 13.0], [55.8, 13.0], [55.9, 13.0], [56.0, 13.0], [56.1, 13.0], [56.2, 13.0], [56.3, 13.0], [56.4, 13.0], [56.5, 13.0], [56.6, 13.0], [56.7, 13.0], [56.8, 13.0], [56.9, 13.0], [57.0, 13.0], [57.1, 13.0], [57.2, 13.0], [57.3, 13.0], [57.4, 13.0], [57.5, 13.0], [57.6, 13.0], [57.7, 13.0], [57.8, 13.0], [57.9, 13.0], [58.0, 13.0], [58.1, 13.0], [58.2, 13.0], [58.3, 13.0], [58.4, 13.0], [58.5, 13.0], [58.6, 13.0], [58.7, 13.0], [58.8, 13.0], [58.9, 13.0], [59.0, 13.0], [59.1, 13.0], [59.2, 13.0], [59.3, 13.0], [59.4, 13.0], [59.5, 13.0], [59.6, 13.0], [59.7, 13.0], [59.8, 13.0], [59.9, 13.0], [60.0, 13.0], [60.1, 13.0], [60.2, 13.0], [60.3, 13.0], [60.4, 13.0], [60.5, 13.0], [60.6, 13.0], [60.7, 13.0], [60.8, 13.0], [60.9, 13.0], [61.0, 13.0], [61.1, 13.0], [61.2, 13.0], [61.3, 13.0], [61.4, 13.0], [61.5, 13.0], [61.6, 13.0], [61.7, 13.0], [61.8, 13.0], [61.9, 13.0], [62.0, 13.0], [62.1, 13.0], [62.2, 13.0], [62.3, 14.0], [62.4, 14.0], [62.5, 14.0], [62.6, 14.0], [62.7, 14.0], [62.8, 14.0], [62.9, 14.0], [63.0, 14.0], [63.1, 14.0], [63.2, 14.0], [63.3, 14.0], [63.4, 14.0], [63.5, 14.0], [63.6, 14.0], [63.7, 14.0], [63.8, 14.0], [63.9, 14.0], [64.0, 14.0], [64.1, 14.0], [64.2, 14.0], [64.3, 14.0], [64.4, 14.0], [64.5, 14.0], [64.6, 14.0], [64.7, 14.0], [64.8, 14.0], [64.9, 14.0], [65.0, 14.0], [65.1, 14.0], [65.2, 14.0], [65.3, 14.0], [65.4, 14.0], [65.5, 14.0], [65.6, 14.0], [65.7, 14.0], [65.8, 14.0], [65.9, 14.0], [66.0, 14.0], [66.1, 14.0], [66.2, 14.0], [66.3, 14.0], [66.4, 14.0], [66.5, 14.0], [66.6, 14.0], [66.7, 14.0], [66.8, 14.0], [66.9, 14.0], [67.0, 14.0], [67.1, 14.0], [67.2, 14.0], [67.3, 14.0], [67.4, 14.0], [67.5, 14.0], [67.6, 14.0], [67.7, 14.0], [67.8, 14.0], [67.9, 14.0], [68.0, 14.0], [68.1, 14.0], [68.2, 14.0], [68.3, 14.0], [68.4, 14.0], [68.5, 14.0], [68.6, 14.0], [68.7, 14.0], [68.8, 14.0], [68.9, 14.0], [69.0, 14.0], [69.1, 14.0], [69.2, 14.0], [69.3, 14.0], [69.4, 14.0], [69.5, 14.0], [69.6, 14.0], [69.7, 14.0], [69.8, 14.0], [69.9, 14.0], [70.0, 14.0], [70.1, 14.0], [70.2, 14.0], [70.3, 14.0], [70.4, 14.0], [70.5, 14.0], [70.6, 14.0], [70.7, 14.0], [70.8, 14.0], [70.9, 14.0], [71.0, 14.0], [71.1, 14.0], [71.2, 14.0], [71.3, 14.0], [71.4, 14.0], [71.5, 14.0], [71.6, 14.0], [71.7, 14.0], [71.8, 14.0], [71.9, 14.0], [72.0, 14.0], [72.1, 14.0], [72.2, 14.0], [72.3, 14.0], [72.4, 14.0], [72.5, 14.0], [72.6, 14.0], [72.7, 14.0], [72.8, 14.0], [72.9, 14.0], [73.0, 14.0], [73.1, 14.0], [73.2, 14.0], [73.3, 14.0], [73.4, 14.0], [73.5, 14.0], [73.6, 14.0], [73.7, 14.0], [73.8, 14.0], [73.9, 14.0], [74.0, 14.0], [74.1, 14.0], [74.2, 14.0], [74.3, 14.0], [74.4, 14.0], [74.5, 14.0], [74.6, 14.0], [74.7, 14.0], [74.8, 14.0], [74.9, 14.0], [75.0, 14.0], [75.1, 14.0], [75.2, 14.0], [75.3, 14.0], [75.4, 14.0], [75.5, 14.0], [75.6, 14.0], [75.7, 14.0], [75.8, 14.0], [75.9, 14.0], [76.0, 14.0], [76.1, 14.0], [76.2, 14.0], [76.3, 14.0], [76.4, 14.0], [76.5, 14.0], [76.6, 14.0], [76.7, 14.0], [76.8, 14.0], [76.9, 14.0], [77.0, 14.0], [77.1, 14.0], [77.2, 14.0], [77.3, 14.0], [77.4, 14.0], [77.5, 14.0], [77.6, 14.0], [77.7, 15.0], [77.8, 15.0], [77.9, 15.0], [78.0, 15.0], [78.1, 15.0], [78.2, 15.0], [78.3, 15.0], [78.4, 15.0], [78.5, 15.0], [78.6, 15.0], [78.7, 15.0], [78.8, 15.0], [78.9, 15.0], [79.0, 15.0], [79.1, 15.0], [79.2, 15.0], [79.3, 15.0], [79.4, 15.0], [79.5, 15.0], [79.6, 15.0], [79.7, 15.0], [79.8, 15.0], [79.9, 15.0], [80.0, 15.0], [80.1, 15.0], [80.2, 15.0], [80.3, 15.0], [80.4, 15.0], [80.5, 15.0], [80.6, 15.0], [80.7, 15.0], [80.8, 15.0], [80.9, 15.0], [81.0, 15.0], [81.1, 15.0], [81.2, 15.0], [81.3, 15.0], [81.4, 15.0], [81.5, 15.0], [81.6, 15.0], [81.7, 15.0], [81.8, 15.0], [81.9, 15.0], [82.0, 15.0], [82.1, 15.0], [82.2, 15.0], [82.3, 15.0], [82.4, 15.0], [82.5, 15.0], [82.6, 15.0], [82.7, 15.0], [82.8, 15.0], [82.9, 15.0], [83.0, 15.0], [83.1, 15.0], [83.2, 15.0], [83.3, 15.0], [83.4, 15.0], [83.5, 15.0], [83.6, 15.0], [83.7, 15.0], [83.8, 15.0], [83.9, 15.0], [84.0, 15.0], [84.1, 15.0], [84.2, 15.0], [84.3, 15.0], [84.4, 15.0], [84.5, 15.0], [84.6, 15.0], [84.7, 15.0], [84.8, 15.0], [84.9, 15.0], [85.0, 15.0], [85.1, 15.0], [85.2, 15.0], [85.3, 15.0], [85.4, 15.0], [85.5, 15.0], [85.6, 15.0], [85.7, 16.0], [85.8, 16.0], [85.9, 16.0], [86.0, 16.0], [86.1, 16.0], [86.2, 16.0], [86.3, 16.0], [86.4, 16.0], [86.5, 16.0], [86.6, 16.0], [86.7, 16.0], [86.8, 16.0], [86.9, 16.0], [87.0, 16.0], [87.1, 16.0], [87.2, 16.0], [87.3, 16.0], [87.4, 16.0], [87.5, 16.0], [87.6, 16.0], [87.7, 16.0], [87.8, 16.0], [87.9, 16.0], [88.0, 16.0], [88.1, 16.0], [88.2, 16.0], [88.3, 16.0], [88.4, 17.0], [88.5, 17.0], [88.6, 17.0], [88.7, 17.0], [88.8, 17.0], [88.9, 17.0], [89.0, 17.0], [89.1, 17.0], [89.2, 17.0], [89.3, 18.0], [89.4, 18.0], [89.5, 18.0], [89.6, 18.0], [89.7, 19.0], [89.8, 19.0], [89.9, 19.0], [90.0, 20.0], [90.1, 21.0], [90.2, 21.0], [90.3, 22.0], [90.4, 23.0], [90.5, 24.0], [90.6, 24.0], [90.7, 24.0], [90.8, 25.0], [90.9, 25.0], [91.0, 25.0], [91.1, 26.0], [91.2, 26.0], [91.3, 26.0], [91.4, 27.0], [91.5, 27.0], [91.6, 28.0], [91.7, 28.0], [91.8, 28.0], [91.9, 29.0], [92.0, 29.0], [92.1, 30.0], [92.2, 30.0], [92.3, 31.0], [92.4, 32.0], [92.5, 33.0], [92.6, 34.0], [92.7, 35.0], [92.8, 36.0], [92.9, 36.0], [93.0, 37.0], [93.1, 38.0], [93.2, 39.0], [93.3, 39.0], [93.4, 41.0], [93.5, 41.0], [93.6, 42.0], [93.7, 43.0], [93.8, 44.0], [93.9, 46.0], [94.0, 47.0], [94.1, 48.0], [94.2, 49.0], [94.3, 50.0], [94.4, 51.0], [94.5, 52.0], [94.6, 53.0], [94.7, 54.0], [94.8, 56.0], [94.9, 57.0], [95.0, 59.0], [95.1, 60.0], [95.2, 61.0], [95.3, 63.0], [95.4, 65.0], [95.5, 67.0], [95.6, 68.0], [95.7, 70.0], [95.8, 72.0], [95.9, 73.0], [96.0, 75.0], [96.1, 78.0], [96.2, 81.0], [96.3, 83.0], [96.4, 85.0], [96.5, 88.0], [96.6, 91.0], [96.7, 94.0], [96.8, 97.0], [96.9, 102.0], [97.0, 105.0], [97.1, 110.0], [97.2, 115.0], [97.3, 120.0], [97.4, 125.0], [97.5, 129.0], [97.6, 134.0], [97.7, 140.0], [97.8, 146.0], [97.9, 155.0], [98.0, 162.0], [98.1, 170.0], [98.2, 176.0], [98.3, 183.0], [98.4, 191.0], [98.5, 201.0], [98.6, 214.0], [98.7, 226.0], [98.8, 241.0], [98.9, 257.0], [99.0, 270.0], [99.1, 282.0], [99.2, 299.0], [99.3, 312.0], [99.4, 327.0], [99.5, 347.0], [99.6, 394.0], [99.7, 426.0], [99.8, 472.0], [99.9, 625.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 6.0, "minX": 0.0, "maxY": 23244.0, "series": [{"data": [[0.0, 23244.0], [300.0, 99.0], [600.0, 12.0], [700.0, 7.0], [100.0, 392.0], [200.0, 172.0], [400.0, 51.0], [800.0, 6.0], [500.0, 17.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 800.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 42.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 23958.0, "series": [{"data": [[1.0, 42.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 23958.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 1.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.526447521E12, "maxY": 454.23809523809547, "series": [{"data": [[1.526447571E12, 105.5], [1.52644753E12, 421.5582655826558], [1.526447573E12, 2.5], [1.526447526E12, 430.0095057034222], [1.526447569E12, 411.52331606217604], [1.526447528E12, 432.93315508021396], [1.526447524E12, 413.2407407407406], [1.526447567E12, 323.0852713178297], [1.526447563E12, 380.59796437659037], [1.526447522E12, 412.46537396121886], [1.526447565E12, 30.0], [1.526447561E12, 304.41935483870947], [1.526447559E12, 384.31707317073193], [1.526447555E12, 390.42424242424255], [1.526447598E12, 7.217665615141956], [1.526447557E12, 395.2453333333333], [1.5264476E12, 5.573529411764706], [1.526447553E12, 380.9492537313434], [1.526447596E12, 5.76923076923077], [1.526447551E12, 402.39678284182327], [1.526447594E12, 5.466666666666667], [1.526447547E12, 401.6315789473686], [1.52644759E12, 5.4838709677419395], [1.526447549E12, 383.90374331550794], [1.526447592E12, 1.0], [1.526447545E12, 411.562176165803], [1.526447588E12, 5.710937499999998], [1.526447543E12, 393.78201634877394], [1.526447586E12, 1.0], [1.526447539E12, 417.20155038759674], [1.526447582E12, 5.23701298701299], [1.526447541E12, 412.7571059431528], [1.526447584E12, 5.204761904761904], [1.526447537E12, 440.69531249999994], [1.52644758E12, 396.39612188365675], [1.526447535E12, 404.5306666666667], [1.526447578E12, 399.639896373057], [1.526447531E12, 417.49999999999994], [1.526447574E12, 102.76923076923077], [1.526447533E12, 412.1379310344827], [1.526447576E12, 385.3381502890173], [1.526447529E12, 452.89486552567246], [1.526447572E12, 2.0], [1.526447527E12, 454.23809523809547], [1.52644757E12, 369.2924901185772], [1.526447523E12, 407.12612612612605], [1.526447566E12, 78.91034482758619], [1.526447525E12, 434.10931174089114], [1.526447568E12, 412.0103359173128], [1.526447521E12, 190.91245791245794], [1.526447564E12, 415.97910447761205], [1.526447562E12, 145.29310344827584], [1.526447558E12, 399.1010928961748], [1.52644756E12, 336.6586206896552], [1.526447556E12, 386.17886178861784], [1.526447599E12, 5.603174603174609], [1.526447595E12, 3.142857142857143], [1.526447554E12, 377.8373983739836], [1.526447597E12, 5.287958115183244], [1.52644755E12, 398.8408488063661], [1.526447593E12, 5.974358974358973], [1.526447552E12, 395.18351063829755], [1.526447548E12, 392.0901162790698], [1.526447591E12, 1.0], [1.526447587E12, 5.77], [1.526447546E12, 407.39210526315816], [1.526447589E12, 5.604166666666666], [1.526447542E12, 411.8989637305701], [1.526447585E12, 5.383458646616547], [1.526447544E12, 410.737113402062], [1.52644754E12, 416.4793814432991], [1.526447583E12, 5.342342342342345], [1.526447579E12, 412.5077720207255], [1.526447538E12, 410.0871934604905], [1.526447581E12, 32.42708333333334], [1.526447534E12, 424.970430107527], [1.526447577E12, 334.2738461538461], [1.526447536E12, 438.40920716112487], [1.526447532E12, 410.77506775067764], [1.526447575E12, 348.1167108753319]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 1.5264476E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 11.0, "minX": 1.0, "maxY": 321.0, "series": [{"data": [[2.0, 13.840579710144922], [3.0, 13.65753424657534], [4.0, 14.760683760683758], [5.0, 12.976131687242773], [6.0, 13.762244412743712], [7.0, 15.975683890577509], [8.0, 21.173913043478265], [9.0, 17.714285714285715], [10.0, 32.0], [11.0, 16.272727272727273], [12.0, 29.333333333333332], [13.0, 19.444444444444443], [14.0, 18.0], [15.0, 27.0], [16.0, 25.5], [17.0, 27.11111111111111], [18.0, 22.25], [19.0, 27.375], [20.0, 17.75], [21.0, 30.75], [22.0, 35.6], [23.0, 15.5], [24.0, 16.5], [25.0, 15.0], [26.0, 14.2], [27.0, 28.25], [28.0, 14.0], [29.0, 15.0], [30.0, 14.5], [32.0, 15.0], [33.0, 15.25], [34.0, 14.5], [35.0, 14.0], [36.0, 14.333333333333334], [38.0, 15.666666666666666], [39.0, 13.0], [41.0, 15.333333333333334], [40.0, 14.0], [42.0, 14.0], [43.0, 13.5], [44.0, 14.0], [45.0, 15.0], [46.0, 15.75], [47.0, 15.666666666666666], [48.0, 18.0], [49.0, 13.333333333333334], [51.0, 15.0], [50.0, 14.0], [52.0, 14.5], [53.0, 14.75], [54.0, 13.5], [55.0, 14.0], [57.0, 15.0], [56.0, 14.0], [59.0, 14.666666666666666], [58.0, 15.0], [60.0, 22.2], [61.0, 18.444444444444443], [63.0, 14.2], [62.0, 17.5], [64.0, 19.333333333333332], [65.0, 28.8], [66.0, 35.0], [67.0, 26.571428571428573], [69.0, 28.75], [70.0, 14.0], [71.0, 13.0], [68.0, 13.0], [72.0, 55.285714285714285], [73.0, 28.8], [75.0, 104.99999999999999], [76.0, 15.0], [78.0, 13.75], [77.0, 15.0], [79.0, 14.0], [82.0, 51.5], [81.0, 93.99999999999999], [83.0, 14.4], [80.0, 14.5], [86.0, 69.57142857142857], [85.0, 13.0], [87.0, 14.0], [90.0, 44.333333333333336], [91.0, 14.25], [88.0, 14.5], [89.0, 13.0], [92.0, 14.0], [94.0, 15.0], [95.0, 54.2], [93.0, 15.0], [96.0, 51.75], [99.0, 18.5], [97.0, 13.333333333333334], [98.0, 15.0], [100.0, 14.0], [101.0, 55.25], [102.0, 14.0], [103.0, 13.5], [104.0, 21.0], [106.0, 74.66666666666667], [105.0, 14.5], [107.0, 13.8], [109.0, 41.400000000000006], [110.0, 21.0], [108.0, 15.0], [111.0, 14.0], [115.0, 51.25], [112.0, 14.5], [113.0, 29.2], [114.0, 15.666666666666666], [117.0, 15.333333333333334], [118.0, 15.666666666666666], [119.0, 23.0], [116.0, 13.0], [122.0, 42.285714285714285], [123.0, 18.666666666666668], [121.0, 15.0], [120.0, 13.5], [124.0, 20.6], [126.0, 19.75], [127.0, 77.25], [125.0, 12.333333333333334], [128.0, 19.5], [130.0, 16.833333333333336], [131.0, 76.0], [132.0, 28.0], [134.0, 22.857142857142858], [135.0, 19.333333333333336], [129.0, 25.0], [133.0, 25.0], [136.0, 56.2], [137.0, 13.5], [138.0, 13.8], [140.0, 58.57142857142857], [142.0, 13.571428571428571], [139.0, 37.0], [141.0, 13.0], [143.0, 12.666666666666666], [144.0, 55.75], [146.0, 13.2], [147.0, 12.75], [148.0, 32.0], [149.0, 73.25], [150.0, 13.2], [145.0, 13.666666666666666], [151.0, 13.5], [152.0, 13.0], [153.0, 34.4], [154.0, 41.625], [156.0, 13.0], [158.0, 64.66666666666666], [159.0, 13.666666666666666], [157.0, 52.33333333333333], [155.0, 13.0], [160.0, 13.0], [162.0, 29.5], [163.0, 74.75], [164.0, 13.25], [166.0, 13.5], [167.0, 65.5], [165.0, 14.0], [161.0, 12.0], [168.0, 37.0], [169.0, 13.25], [170.0, 12.666666666666666], [172.0, 88.0], [173.0, 66.0], [174.0, 13.333333333333334], [175.0, 13.5], [171.0, 13.666666666666666], [176.0, 88.2], [178.0, 37.857142857142854], [180.0, 13.4], [181.0, 78.5], [182.0, 13.0], [177.0, 13.6], [183.0, 74.66666666666667], [179.0, 14.0], [184.0, 14.0], [185.0, 13.6], [186.0, 79.66666666666666], [187.0, 13.4], [188.0, 62.75], [189.0, 14.333333333333334], [190.0, 65.28571428571429], [191.0, 13.5], [192.0, 14.0], [196.0, 20.8], [197.0, 132.0], [195.0, 144.2], [193.0, 48.833333333333336], [198.0, 19.75], [194.0, 13.0], [199.0, 13.5], [201.0, 104.0], [206.0, 20.75], [202.0, 91.33333333333334], [203.0, 12.75], [204.0, 15.999999999999998], [207.0, 63.4], [200.0, 12.5], [205.0, 14.0], [209.0, 123.25000000000001], [211.0, 41.0], [212.0, 20.0], [213.0, 171.0], [208.0, 12.666666666666666], [214.0, 13.0], [215.0, 12.5], [210.0, 13.0], [216.0, 54.875], [217.0, 14.0], [218.0, 94.0], [219.0, 15.0], [220.0, 15.625], [221.0, 74.8], [222.0, 80.16666666666667], [223.0, 13.0], [224.0, 14.0], [225.0, 19.0], [226.0, 140.33333333333334], [228.0, 13.0], [229.0, 20.0], [230.0, 64.5], [227.0, 12.666666666666666], [231.0, 13.0], [232.0, 88.14285714285714], [234.0, 20.57142857142857], [236.0, 13.75], [237.0, 84.0], [238.0, 34.666666666666664], [239.0, 13.75], [233.0, 13.0], [235.0, 119.66666666666666], [240.0, 13.0], [241.0, 69.16666666666666], [242.0, 104.83333333333333], [243.0, 13.5], [244.0, 13.25], [245.0, 82.2], [246.0, 14.0], [247.0, 106.5], [248.0, 13.5], [250.0, 73.66666666666667], [251.0, 13.4], [252.0, 116.0], [253.0, 119.83333333333333], [254.0, 86.99999999999999], [249.0, 13.0], [255.0, 136.66666666666666], [257.0, 14.333333333333334], [256.0, 20.0], [266.0, 220.0], [267.0, 12.0], [270.0, 62.58333333333334], [259.0, 13.75], [258.0, 13.666666666666666], [268.0, 14.0], [269.0, 114.5], [260.0, 108.49999999999999], [261.0, 13.0], [263.0, 14.25], [262.0, 14.0], [264.0, 112.00000000000001], [271.0, 13.0], [265.0, 13.6], [279.0, 18.90909090909091], [275.0, 89.99999999999999], [274.0, 14.0], [272.0, 13.0], [273.0, 13.666666666666666], [276.0, 13.0], [277.0, 13.666666666666666], [278.0, 176.75], [280.0, 321.0], [281.0, 20.5], [282.0, 13.25], [283.0, 12.0], [284.0, 98.57142857142858], [285.0, 22.166666666666668], [286.0, 15.000000000000002], [287.0, 14.75], [288.0, 14.3], [290.0, 117.14285714285714], [291.0, 13.0], [289.0, 13.625], [300.0, 26.57142857142857], [301.0, 204.5], [302.0, 13.571428571428573], [303.0, 14.333333333333334], [292.0, 14.0], [293.0, 14.25], [294.0, 13.25], [295.0, 99.625], [296.0, 13.0], [297.0, 13.0], [298.0, 13.0], [299.0, 13.428571428571429], [317.0, 34.270270270270274], [306.0, 105.49999999999999], [304.0, 31.699999999999996], [305.0, 15.0], [311.0, 13.799999999999999], [307.0, 12.666666666666666], [316.0, 13.718749999999998], [318.0, 14.031250000000002], [319.0, 13.933333333333334], [308.0, 13.285714285714286], [309.0, 13.8], [310.0, 13.166666666666666], [312.0, 31.10869565217392], [313.0, 14.285714285714283], [314.0, 13.642857142857142], [315.0, 13.612903225806452], [321.0, 14.17391304347826], [320.0, 13.74193548387097], [322.0, 60.866666666666674], [324.0, 82.58333333333334], [323.0, 114.5], [331.0, 22.31818181818182], [330.0, 29.28571428571429], [333.0, 79.80000000000001], [332.0, 25.391304347826086], [328.0, 18.47826086956522], [335.0, 48.333333333333336], [334.0, 21.461538461538463], [329.0, 15.000000000000004], [325.0, 13.555555555555554], [326.0, 14.5], [327.0, 13.333333333333334], [348.0, 14.454545454545453], [336.0, 19.214285714285715], [343.0, 13.4], [338.0, 13.419354838709678], [339.0, 15.900000000000002], [337.0, 13.071428571428571], [341.0, 56.8421052631579], [340.0, 13.192307692307693], [342.0, 14.071428571428573], [345.0, 105.75], [346.0, 15.09090909090909], [347.0, 12.75], [349.0, 14.882352941176473], [350.0, 44.26923076923076], [351.0, 15.333333333333332], [344.0, 12.714285714285715], [354.0, 14.222222222222223], [353.0, 25.0], [355.0, 17.099999999999998], [364.0, 18.26666666666666], [365.0, 16.850000000000005], [367.0, 13.918367346938778], [366.0, 13.611111111111114], [356.0, 16.85], [357.0, 16.26666666666666], [358.0, 14.021739130434785], [359.0, 15.23684210526316], [352.0, 12.846153846153845], [360.0, 18.967213114754102], [361.0, 17.22448979591837], [362.0, 16.34426229508197], [363.0, 23.962264150943398], [370.0, 18.512195121951226], [368.0, 20.18965517241379], [369.0, 16.523809523809526], [371.0, 19.583333333333336], [380.0, 13.411764705882357], [382.0, 16.80833333333333], [381.0, 15.12048192771084], [383.0, 13.126984126984127], [372.0, 15.581395348837209], [373.0, 13.11904761904762], [374.0, 17.391304347826082], [375.0, 28.89473684210527], [376.0, 14.937499999999996], [378.0, 20.62222222222223], [377.0, 29.458333333333332], [379.0, 15.895522388059705], [384.0, 14.190476190476192], [386.0, 15.237179487179485], [385.0, 14.320512820512816], [387.0, 15.84659090909091], [388.0, 14.726744186046513], [389.0, 14.679558011049734], [390.0, 12.894495412844032], [391.0, 16.72030651340997], [392.0, 17.290849673202604], [394.0, 15.014981273408234], [393.0, 16.59121621621621], [395.0, 16.317460317460323], [396.0, 18.596825396825373], [399.0, 16.433734939759034], [398.0, 20.091383812010452], [397.0, 18.66204986149585], [415.0, 23.231557377049175], [400.0, 19.547904191616762], [407.0, 18.397959183673475], [406.0, 28.8385269121813], [404.0, 24.498470948012212], [405.0, 19.016181229773476], [401.0, 21.473389355742295], [408.0, 19.459047619047613], [409.0, 22.945537065052957], [410.0, 24.051317614424406], [411.0, 20.4682741116751], [414.0, 23.667247386759588], [413.0, 21.10407876230661], [412.0, 19.60645161290321], [402.0, 19.831908831908834], [403.0, 24.446629213483135], [428.0, 22.505154639175252], [416.0, 26.553191489361698], [419.0, 22.535433070866137], [418.0, 30.782894736842113], [417.0, 31.40277777777776], [422.0, 71.40277777777779], [420.0, 21.753086419753085], [421.0, 26.597014925373145], [423.0, 19.48], [424.0, 23.500000000000004], [425.0, 16.328947368421048], [427.0, 26.79310344827587], [426.0, 32.516129032258064], [429.0, 18.743589743589737], [431.0, 39.28888888888889], [430.0, 24.56382978723404], [435.0, 27.869047619047628], [433.0, 25.32432432432433], [432.0, 23.662650602409634], [439.0, 31.892307692307693], [434.0, 18.695238095238096], [436.0, 35.30434782608694], [437.0, 26.028169014084504], [438.0, 40.044444444444444], [440.0, 48.22950819672131], [446.0, 34.04166666666666], [447.0, 29.890909090909087], [444.0, 30.265306122448973], [445.0, 29.215686274509814], [441.0, 27.741379310344836], [442.0, 25.583333333333332], [443.0, 22.716666666666672], [455.0, 75.88636363636363], [448.0, 41.097560975609746], [450.0, 43.84745762711865], [451.0, 25.181818181818183], [460.0, 25.851851851851848], [461.0, 40.39130434782609], [462.0, 27.000000000000004], [463.0, 37.476190476190474], [456.0, 80.81481481481482], [452.0, 35.192982456140356], [453.0, 46.918032786885256], [454.0, 39.243902439024374], [449.0, 52.807692307692314], [457.0, 29.888888888888896], [459.0, 59.70000000000001], [458.0, 63.00000000000001], [466.0, 109.07407407407408], [467.0, 51.73913043478261], [476.0, 82.7142857142857], [477.0, 55.266666666666666], [478.0, 53.68], [479.0, 81.22222222222221], [472.0, 71.42857142857142], [468.0, 72.57142857142858], [469.0, 80.0344827586207], [465.0, 29.9047619047619], [464.0, 76.84375], [470.0, 60.58823529411766], [471.0, 89.53333333333332], [473.0, 125.37499999999999], [475.0, 86.66666666666667], [474.0, 28.631578947368425], [481.0, 74.25], [480.0, 65.2962962962963], [482.0, 48.633333333333326], [483.0, 44.03846153846155], [484.0, 23.352941176470587], [485.0, 28.692307692307697], [486.0, 58.6923076923077], [487.0, 15.0], [488.0, 14.777777777777779], [492.0, 13.5], [493.0, 11.0], [494.0, 12.5], [495.0, 12.0], [490.0, 111.57142857142857], [491.0, 20.75], [489.0, 18.0], [497.0, 13.0], [496.0, 13.0], [498.0, 12.5], [499.0, 12.5], [500.0, 14.0], [501.0, 12.0], [502.0, 12.0], [503.0, 12.0], [504.0, 13.0], [510.0, 12.0], [511.0, 12.0], [508.0, 11.0], [509.0, 13.0], [505.0, 13.0], [506.0, 15.0], [507.0, 12.0], [518.0, 11.0], [514.0, 12.0], [513.0, 13.0], [526.0, 12.5], [525.0, 13.0], [523.0, 12.0], [524.0, 12.0], [515.0, 11.0], [516.0, 12.0], [517.0, 13.0], [519.0, 12.0], [536.0, 13.0], [537.0, 23.333333333333332], [538.0, 12.5], [539.0, 11.8], [540.0, 11.444444444444445], [543.0, 12.285714285714286], [541.0, 25.0], [528.0, 12.0], [529.0, 15.0], [530.0, 12.0], [531.0, 12.0], [532.0, 15.5], [534.0, 12.0], [535.0, 12.0], [521.0, 14.0], [522.0, 13.5], [556.0, 13.272727272727273], [544.0, 12.285714285714285], [545.0, 12.75], [559.0, 15.6], [546.0, 12.4], [547.0, 12.8], [549.0, 15.0], [550.0, 26.0], [560.0, 18.833333333333332], [551.0, 13.0], [561.0, 18.5], [562.0, 12.0], [553.0, 24.0], [552.0, 13.0], [554.0, 18.5], [555.0, 15.777777777777775], [557.0, 12.8], [558.0, 21.5], [1.0, 15.945054945054947]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[325.04350000000164, 22.54212500000008]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 562.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 5686.0, "minX": 1.526447521E12, "maxY": 5765486.0, "series": [{"data": [[1.526447571E12, 21922.0], [1.52644753E12, 4044609.0], [1.526447573E12, 21922.0], [1.526447526E12, 5765486.0], [1.526447569E12, 4230946.0], [1.526447528E12, 4099414.0], [1.526447524E12, 4735152.0], [1.526447567E12, 4241907.0], [1.526447563E12, 4307673.0], [1.526447522E12, 3956921.0], [1.526447565E12, 10961.0], [1.526447561E12, 1019373.0], [1.526447559E12, 4044609.0], [1.526447555E12, 3978843.0], [1.526447598E12, 3474637.0], [1.526447557E12, 4110375.0], [1.5264476E12, 745348.0], [1.526447553E12, 3671935.0], [1.526447596E12, 1994902.0], [1.526447551E12, 4088453.0], [1.526447594E12, 2301810.0], [1.526447547E12, 4165180.0], [1.52644759E12, 2378537.0], [1.526447549E12, 4099414.0], [1.526447592E12, 54805.0], [1.526447545E12, 4230946.0], [1.526447588E12, 4209024.0], [1.526447543E12, 4022687.0], [1.526447586E12, 43844.0], [1.526447539E12, 4241907.0], [1.526447582E12, 3375988.0], [1.526447541E12, 4241907.0], [1.526447584E12, 2301810.0], [1.526447537E12, 4209024.0], [1.52644758E12, 3956921.0], [1.526447535E12, 4110375.0], [1.526447578E12, 4230946.0], [1.526447531E12, 4230946.0], [1.526447574E12, 2137395.0], [1.526447533E12, 4450166.0], [1.526447576E12, 3792506.0], [1.526447529E12, 4483049.0], [1.526447572E12, 10961.0], [1.526447527E12, 3913077.0], [1.52644757E12, 2773133.0], [1.526447523E12, 3650013.0], [1.526447566E12, 1589345.0], [1.526447525E12, 2707367.0], [1.526447568E12, 4241907.0], [1.526447521E12, 3255417.0], [1.526447564E12, 3671935.0], [1.526447562E12, 2542952.0], [1.526447558E12, 4011726.0], [1.52644756E12, 3178690.0], [1.526447556E12, 4044609.0], [1.526447599E12, 4143258.0], [1.526447595E12, 153454.0], [1.526447554E12, 4044609.0], [1.526447597E12, 2093551.0], [1.52644755E12, 4132297.0], [1.526447593E12, 1709916.0], [1.526447552E12, 4121336.0], [1.526447548E12, 3770584.0], [1.526447591E12, 43844.0], [1.526447587E12, 3288300.0], [1.526447546E12, 4165180.0], [1.526447589E12, 4209024.0], [1.526447542E12, 4230946.0], [1.526447585E12, 2915626.0], [1.526447544E12, 4252868.0], [1.52644754E12, 4252868.0], [1.526447583E12, 3650013.0], [1.526447579E12, 4230946.0], [1.526447538E12, 4022687.0], [1.526447581E12, 2104512.0], [1.526447534E12, 4077492.0], [1.526447577E12, 3562325.0], [1.526447536E12, 4285751.0], [1.526447532E12, 4044609.0], [1.526447575E12, 4132297.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.526447571E12, 11402.0], [1.52644753E12, 2098056.0], [1.526447573E12, 11369.0], [1.526447526E12, 2991112.0], [1.526447569E12, 2195180.0], [1.526447528E12, 2126399.0], [1.526447524E12, 2456388.0], [1.526447567E12, 2200842.0], [1.526447563E12, 2234460.0], [1.526447522E12, 2052946.0], [1.526447565E12, 5692.0], [1.526447561E12, 528780.0], [1.526447559E12, 2097906.0], [1.526447555E12, 2063781.0], [1.526447598E12, 1802732.0], [1.526447557E12, 2132595.0], [1.5264476E12, 386717.0], [1.526447553E12, 1905059.0], [1.526447596E12, 1034858.0], [1.526447551E12, 2120701.0], [1.526447594E12, 1194168.0], [1.526447547E12, 2160701.0], [1.52644759E12, 1233826.0], [1.526447549E12, 2126621.0], [1.526447592E12, 28418.0], [1.526447545E12, 2194865.0], [1.526447588E12, 2183364.0], [1.526447543E12, 2086516.0], [1.526447586E12, 22774.0], [1.526447539E12, 2200425.0], [1.526447582E12, 1751465.0], [1.526447541E12, 2200497.0], [1.526447584E12, 1193958.0], [1.526447537E12, 2183388.0], [1.52644758E12, 2052397.0], [1.526447535E12, 2132112.0], [1.526447578E12, 2195090.0], [1.526447531E12, 2194745.0], [1.526447574E12, 1108698.0], [1.526447533E12, 2308546.0], [1.526447576E12, 1967497.0], [1.526447529E12, 2325751.0], [1.526447572E12, 5686.0], [1.526447527E12, 2029971.0], [1.52644757E12, 1438864.0], [1.526447523E12, 1893174.0], [1.526447566E12, 824530.0], [1.526447525E12, 1404337.0], [1.526447568E12, 2200443.0], [1.526447521E12, 1688907.0], [1.526447564E12, 1904747.0], [1.526447562E12, 1319128.0], [1.526447558E12, 2081040.0], [1.52644756E12, 1648979.0], [1.526447556E12, 2098227.0], [1.526447599E12, 2149404.0], [1.526447595E12, 79535.0], [1.526447554E12, 2097981.0], [1.526447597E12, 1085702.0], [1.52644755E12, 2143751.0], [1.526447593E12, 886971.0], [1.526447552E12, 2138125.0], [1.526447548E12, 1955870.0], [1.526447591E12, 22750.0], [1.526447587E12, 1705779.0], [1.526447546E12, 2160872.0], [1.526447589E12, 2183550.0], [1.526447542E12, 2195057.0], [1.526447585E12, 1512620.0], [1.526447544E12, 2205955.0], [1.52644754E12, 2206195.0], [1.526447583E12, 1893603.0], [1.526447579E12, 2194703.0], [1.526447538E12, 2086735.0], [1.526447581E12, 1091628.0], [1.526447534E12, 2115051.0], [1.526447577E12, 1847770.0], [1.526447536E12, 2223472.0], [1.526447532E12, 2097963.0], [1.526447575E12, 2143685.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 1.5264476E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 12.502590673575131, "minX": 1.526447521E12, "maxY": 89.32659932659932, "series": [{"data": [[1.526447571E12, 16.0], [1.52644753E12, 26.092140921409214], [1.526447573E12, 19.5], [1.526447526E12, 63.45627376425862], [1.526447569E12, 20.730569948186524], [1.526447528E12, 45.7727272727273], [1.526447524E12, 57.64583333333334], [1.526447567E12, 13.217054263565887], [1.526447563E12, 24.83460559796438], [1.526447522E12, 40.9196675900277], [1.526447565E12, 17.0], [1.526447561E12, 17.494623655913976], [1.526447559E12, 13.121951219512205], [1.526447555E12, 12.741046831955934], [1.526447598E12, 17.488958990536283], [1.526447557E12, 13.007999999999997], [1.5264476E12, 13.5], [1.526447553E12, 16.617910447761197], [1.526447596E12, 14.192307692307688], [1.526447551E12, 16.254691689008034], [1.526447594E12, 13.528571428571428], [1.526447547E12, 27.144736842105253], [1.52644759E12, 13.09677419354839], [1.526447549E12, 12.778074866310174], [1.526447592E12, 16.6], [1.526447545E12, 12.502590673575131], [1.526447588E12, 13.408854166666677], [1.526447543E12, 15.648501362397829], [1.526447586E12, 16.25], [1.526447539E12, 17.167958656330743], [1.526447582E12, 13.659090909090905], [1.526447541E12, 13.299741602067188], [1.526447584E12, 13.790476190476184], [1.526447537E12, 30.734374999999996], [1.52644758E12, 13.689750692520775], [1.526447535E12, 35.568], [1.526447578E12, 14.40155440414508], [1.526447531E12, 12.717616580310882], [1.526447574E12, 13.810256410256411], [1.526447533E12, 45.642857142857146], [1.526447576E12, 13.427745664739886], [1.526447529E12, 39.84596577017112], [1.526447572E12, 17.0], [1.526447527E12, 77.03641456582633], [1.52644757E12, 13.351778656126488], [1.526447523E12, 25.468468468468465], [1.526447566E12, 14.76551724137931], [1.526447525E12, 66.33198380566807], [1.526447568E12, 13.299741602067183], [1.526447521E12, 89.32659932659932], [1.526447564E12, 13.283582089552246], [1.526447562E12, 46.71120689655171], [1.526447558E12, 12.789617486338795], [1.52644756E12, 13.57241379310344], [1.526447556E12, 12.932249322493234], [1.526447599E12, 13.243386243386244], [1.526447595E12, 15.714285714285714], [1.526447554E12, 16.192411924119238], [1.526447597E12, 14.193717277486913], [1.52644755E12, 14.777188328912468], [1.526447593E12, 14.641025641025642], [1.526447552E12, 15.843085106382986], [1.526447548E12, 12.659883720930237], [1.526447591E12, 16.25], [1.526447587E12, 14.293333333333331], [1.526447546E12, 12.681578947368438], [1.526447589E12, 13.15104166666666], [1.526447542E12, 13.155440414507773], [1.526447585E12, 13.796992481203004], [1.526447544E12, 12.631443298969078], [1.52644754E12, 13.391752577319592], [1.526447583E12, 13.381381381381381], [1.526447579E12, 14.873056994818647], [1.526447538E12, 20.5858310626703], [1.526447581E12, 16.958333333333336], [1.526447534E12, 13.645161290322594], [1.526447577E12, 17.83076923076924], [1.526447536E12, 46.347826086956516], [1.526447532E12, 13.39024390243902], [1.526447575E12, 13.265251989389915]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 1000, "maxX": 1.5264476E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 12.497409326424869, "minX": 1.526447521E12, "maxY": 89.24579124579124, "series": [{"data": [[1.526447571E12, 16.0], [1.52644753E12, 26.084010840108416], [1.526447573E12, 19.5], [1.526447526E12, 63.44106463878325], [1.526447569E12, 20.717616580310892], [1.526447528E12, 45.75668449197859], [1.526447524E12, 57.62499999999997], [1.526447567E12, 13.206718346253234], [1.526447563E12, 24.720101781170502], [1.526447522E12, 40.883656509695264], [1.526447565E12, 17.0], [1.526447561E12, 16.838709677419363], [1.526447559E12, 13.102981029810298], [1.526447555E12, 12.732782369146014], [1.526447598E12, 17.479495268138802], [1.526447557E12, 12.994666666666665], [1.5264476E12, 13.48529411764706], [1.526447553E12, 16.60597014925373], [1.526447596E12, 14.18681318681319], [1.526447551E12, 16.23860589812335], [1.526447594E12, 13.514285714285716], [1.526447547E12, 26.800000000000004], [1.52644759E12, 13.082949308755758], [1.526447549E12, 12.764705882352938], [1.526447592E12, 16.6], [1.526447545E12, 12.497409326424869], [1.526447588E12, 13.39583333333334], [1.526447543E12, 15.634877384196184], [1.526447586E12, 16.25], [1.526447539E12, 17.15762273901808], [1.526447582E12, 13.639610389610393], [1.526447541E12, 13.289405684754517], [1.526447584E12, 13.78095238095238], [1.526447537E12, 30.721354166666657], [1.52644758E12, 13.66759002770083], [1.526447535E12, 35.096000000000004], [1.526447578E12, 14.391191709844572], [1.526447531E12, 12.699481865284978], [1.526447574E12, 13.80512820512821], [1.526447533E12, 45.62315270935959], [1.526447576E12, 13.419075144508666], [1.526447529E12, 39.826405867970664], [1.526447572E12, 17.0], [1.526447527E12, 77.02240896358546], [1.52644757E12, 13.347826086956525], [1.526447523E12, 25.44744744744746], [1.526447566E12, 14.744827586206894], [1.526447525E12, 66.31174089068826], [1.526447568E12, 13.273901808785531], [1.526447521E12, 89.24579124579124], [1.526447564E12, 13.274626865671644], [1.526447562E12, 46.39655172413792], [1.526447558E12, 12.784153005464466], [1.52644756E12, 13.548275862068964], [1.526447556E12, 12.918699186991866], [1.526447599E12, 13.232804232804243], [1.526447595E12, 15.714285714285714], [1.526447554E12, 16.18699186991869], [1.526447597E12, 14.183246073298431], [1.52644755E12, 14.76923076923077], [1.526447593E12, 14.628205128205131], [1.526447552E12, 15.82446808510637], [1.526447548E12, 12.642441860465125], [1.526447591E12, 16.0], [1.526447587E12, 14.26666666666667], [1.526447546E12, 12.673684210526305], [1.526447589E12, 13.145833333333332], [1.526447542E12, 13.152849740932643], [1.526447585E12, 13.789473684210531], [1.526447544E12, 12.610824742268042], [1.52644754E12, 13.378865979381436], [1.526447583E12, 13.357357357357348], [1.526447579E12, 14.862694300518141], [1.526447538E12, 20.56948228882833], [1.526447581E12, 16.953125], [1.526447534E12, 13.63978494623656], [1.526447577E12, 17.82153846153847], [1.526447536E12, 46.33248081841432], [1.526447532E12, 13.373983739837389], [1.526447575E12, 13.251989389920418]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 1000, "maxX": 1.5264476E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.0, "minX": 1.526447521E12, "maxY": 14.713804713804723, "series": [{"data": [[1.526447571E12, 0.0], [1.52644753E12, 0.7208672086720868], [1.526447573E12, 0.0], [1.526447526E12, 0.22813688212927752], [1.526447569E12, 0.2124352331606218], [1.526447528E12, 0.26470588235294124], [1.526447524E12, 0.3009259259259259], [1.526447567E12, 0.1989664082687337], [1.526447563E12, 0.3104325699745547], [1.526447522E12, 2.14404432132964], [1.526447565E12, 0.0], [1.526447561E12, 0.1612903225806453], [1.526447559E12, 0.09485094850948513], [1.526447555E12, 0.14325068870523416], [1.526447598E12, 0.23343848580441637], [1.526447557E12, 0.16533333333333322], [1.5264476E12, 0.08823529411764704], [1.526447553E12, 0.2208955223880598], [1.526447596E12, 0.18681318681318684], [1.526447551E12, 0.2975871313672922], [1.526447594E12, 0.17619047619047618], [1.526447547E12, 0.6263157894736832], [1.52644759E12, 0.11981566820276496], [1.526447549E12, 0.1443850267379679], [1.526447592E12, 0.4], [1.526447545E12, 0.12176165803108797], [1.526447588E12, 0.2005208333333335], [1.526447543E12, 0.2997275204359675], [1.526447586E12, 0.25], [1.526447539E12, 0.20413436692506456], [1.526447582E12, 0.2207792207792209], [1.526447541E12, 0.12403100775193804], [1.526447584E12, 0.18095238095238098], [1.526447537E12, 0.6223958333333334], [1.52644758E12, 0.27423822714681434], [1.526447535E12, 0.6826666666666666], [1.526447578E12, 0.28497409326424883], [1.526447531E12, 0.23834196891191703], [1.526447574E12, 0.21025641025641026], [1.526447533E12, 0.37192118226601], [1.526447576E12, 0.19942196531791898], [1.526447529E12, 0.19070904645476766], [1.526447572E12, 0.0], [1.526447527E12, 0.4089635854341737], [1.52644757E12, 0.33201581027667987], [1.526447523E12, 0.9459459459459463], [1.526447566E12, 0.22758620689655185], [1.526447525E12, 0.2591093117408907], [1.526447568E12, 0.21963824289405687], [1.526447521E12, 14.713804713804723], [1.526447564E12, 0.2567164179104481], [1.526447562E12, 0.9913793103448278], [1.526447558E12, 0.20765027322404384], [1.52644756E12, 0.2724137931034482], [1.526447556E12, 0.20867208672086726], [1.526447599E12, 0.20634920634920617], [1.526447595E12, 0.0], [1.526447554E12, 0.15718157181571807], [1.526447597E12, 0.3089005235602093], [1.52644755E12, 0.1750663129973475], [1.526447593E12, 0.4038461538461539], [1.526447552E12, 0.24202127659574474], [1.526447548E12, 0.16279069767441862], [1.526447591E12, 0.0], [1.526447587E12, 0.20999999999999971], [1.526447546E12, 0.1605263157894737], [1.526447589E12, 0.12500000000000006], [1.526447542E12, 0.22797927461139905], [1.526447585E12, 0.28571428571428586], [1.526447544E12, 0.24999999999999986], [1.52644754E12, 0.1804123711340209], [1.526447583E12, 0.22222222222222232], [1.526447579E12, 0.2746113989637301], [1.526447538E12, 0.13079019073569506], [1.526447581E12, 0.09375], [1.526447534E12, 0.3333333333333335], [1.526447577E12, 0.40615384615384625], [1.526447536E12, 0.24808184143222523], [1.526447532E12, 0.2682926829268292], [1.526447575E12, 0.18832891246684363]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 1000, "maxX": 1.5264476E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 11.0, "minX": 1.526447521E12, "maxY": 864.0, "series": [{"data": [[1.526447571E12, 16.0], [1.52644753E12, 216.0], [1.526447573E12, 20.0], [1.526447526E12, 336.0], [1.526447569E12, 173.0], [1.526447528E12, 864.0], [1.526447524E12, 323.0], [1.526447567E12, 21.0], [1.526447563E12, 419.0], [1.526447522E12, 843.0], [1.526447565E12, 17.0], [1.526447561E12, 79.0], [1.526447559E12, 16.0], [1.526447555E12, 17.0], [1.526447598E12, 121.0], [1.526447557E12, 59.0], [1.5264476E12, 17.0], [1.526447553E12, 144.0], [1.526447596E12, 20.0], [1.526447551E12, 157.0], [1.526447594E12, 17.0], [1.526447547E12, 308.0], [1.52644759E12, 17.0], [1.526447549E12, 17.0], [1.526447592E12, 18.0], [1.526447545E12, 15.0], [1.526447588E12, 55.0], [1.526447543E12, 142.0], [1.526447586E12, 18.0], [1.526447539E12, 107.0], [1.526447582E12, 19.0], [1.526447541E12, 73.0], [1.526447584E12, 20.0], [1.526447537E12, 265.0], [1.52644758E12, 54.0], [1.526447535E12, 352.0], [1.526447578E12, 96.0], [1.526447531E12, 46.0], [1.526447574E12, 23.0], [1.526447533E12, 371.0], [1.526447576E12, 18.0], [1.526447529E12, 592.0], [1.526447572E12, 17.0], [1.526447527E12, 477.0], [1.52644757E12, 21.0], [1.526447523E12, 255.0], [1.526447566E12, 27.0], [1.526447525E12, 496.0], [1.526447568E12, 16.0], [1.526447521E12, 753.0], [1.526447564E12, 18.0], [1.526447562E12, 347.0], [1.526447558E12, 16.0], [1.52644756E12, 17.0], [1.526447556E12, 48.0], [1.526447599E12, 17.0], [1.526447595E12, 17.0], [1.526447554E12, 162.0], [1.526447597E12, 18.0], [1.52644755E12, 95.0], [1.526447593E12, 31.0], [1.526447552E12, 140.0], [1.526447548E12, 16.0], [1.526447591E12, 17.0], [1.526447587E12, 27.0], [1.526447546E12, 17.0], [1.526447589E12, 17.0], [1.526447542E12, 80.0], [1.526447585E12, 19.0], [1.526447544E12, 55.0], [1.52644754E12, 68.0], [1.526447583E12, 18.0], [1.526447579E12, 113.0], [1.526447538E12, 338.0], [1.526447581E12, 92.0], [1.526447534E12, 68.0], [1.526447577E12, 169.0], [1.526447536E12, 480.0], [1.526447532E12, 67.0], [1.526447575E12, 17.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.526447571E12, 16.0], [1.52644753E12, 11.0], [1.526447573E12, 19.0], [1.526447526E12, 11.0], [1.526447569E12, 11.0], [1.526447528E12, 11.0], [1.526447524E12, 11.0], [1.526447567E12, 11.0], [1.526447563E12, 11.0], [1.526447522E12, 11.0], [1.526447565E12, 17.0], [1.526447561E12, 12.0], [1.526447559E12, 11.0], [1.526447555E12, 11.0], [1.526447598E12, 12.0], [1.526447557E12, 11.0], [1.5264476E12, 12.0], [1.526447553E12, 11.0], [1.526447596E12, 11.0], [1.526447551E12, 11.0], [1.526447594E12, 12.0], [1.526447547E12, 11.0], [1.52644759E12, 11.0], [1.526447549E12, 11.0], [1.526447592E12, 15.0], [1.526447545E12, 11.0], [1.526447588E12, 11.0], [1.526447543E12, 11.0], [1.526447586E12, 15.0], [1.526447539E12, 11.0], [1.526447582E12, 11.0], [1.526447541E12, 11.0], [1.526447584E12, 11.0], [1.526447537E12, 11.0], [1.52644758E12, 11.0], [1.526447535E12, 11.0], [1.526447578E12, 11.0], [1.526447531E12, 11.0], [1.526447574E12, 11.0], [1.526447533E12, 11.0], [1.526447576E12, 11.0], [1.526447529E12, 11.0], [1.526447572E12, 17.0], [1.526447527E12, 11.0], [1.52644757E12, 11.0], [1.526447523E12, 11.0], [1.526447566E12, 12.0], [1.526447525E12, 11.0], [1.526447568E12, 11.0], [1.526447521E12, 12.0], [1.526447564E12, 11.0], [1.526447562E12, 12.0], [1.526447558E12, 11.0], [1.52644756E12, 11.0], [1.526447556E12, 11.0], [1.526447599E12, 11.0], [1.526447595E12, 14.0], [1.526447554E12, 11.0], [1.526447597E12, 12.0], [1.52644755E12, 11.0], [1.526447593E12, 12.0], [1.526447552E12, 11.0], [1.526447548E12, 11.0], [1.526447591E12, 16.0], [1.526447587E12, 12.0], [1.526447546E12, 11.0], [1.526447589E12, 11.0], [1.526447542E12, 11.0], [1.526447585E12, 11.0], [1.526447544E12, 11.0], [1.52644754E12, 11.0], [1.526447583E12, 11.0], [1.526447579E12, 11.0], [1.526447538E12, 11.0], [1.526447581E12, 11.0], [1.526447534E12, 11.0], [1.526447577E12, 11.0], [1.526447536E12, 11.0], [1.526447532E12, 11.0], [1.526447575E12, 11.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.526447571E12, 32.0], [1.52644753E12, 140.80000000000018], [1.526447573E12, 32.0], [1.526447526E12, 148.5999999999999], [1.526447569E12, 33.0], [1.526447528E12, 162.0], [1.526447524E12, 125.60000000000014], [1.526447567E12, 34.0], [1.526447563E12, 37.0], [1.526447522E12, 127.0], [1.526447565E12, 36.0], [1.526447561E12, 36.0], [1.526447559E12, 37.0], [1.526447555E12, 44.0], [1.526447598E12, 15.0], [1.526447557E12, 40.0], [1.5264476E12, 15.0], [1.526447553E12, 47.0], [1.526447596E12, 16.0], [1.526447551E12, 49.0], [1.526447594E12, 16.0], [1.526447547E12, 57.0], [1.52644759E12, 16.0], [1.526447549E12, 52.0], [1.526447592E12, 16.0], [1.526447545E12, 60.0], [1.526447588E12, 16.0], [1.526447543E12, 67.90000000000055], [1.526447586E12, 20.0], [1.526447539E12, 85.0], [1.526447582E12, 25.0], [1.526447541E12, 75.0], [1.526447584E12, 24.0], [1.526447537E12, 98.0], [1.52644758E12, 27.0], [1.526447535E12, 99.60000000000036], [1.526447578E12, 28.0], [1.526447531E12, 125.0], [1.526447574E12, 31.0], [1.526447533E12, 115.30000000000018], [1.526447576E12, 29.0], [1.526447529E12, 154.30000000000018], [1.526447572E12, 32.0], [1.526447527E12, 172.5999999999999], [1.52644757E12, 32.0], [1.526447523E12, 91.80000000000007], [1.526447566E12, 36.0], [1.526447525E12, 127.0], [1.526447568E12, 32.0], [1.526447521E12, 334.5999999999994], [1.526447564E12, 36.0], [1.526447562E12, 37.0], [1.526447558E12, 38.0], [1.52644756E12, 36.0], [1.526447556E12, 42.0], [1.526447599E12, 15.0], [1.526447595E12, 16.0], [1.526447554E12, 46.0], [1.526447597E12, 16.0], [1.52644755E12, 50.0], [1.526447593E12, 16.0], [1.526447552E12, 48.0], [1.526447548E12, 54.0], [1.526447591E12, 16.0], [1.526447587E12, 17.0], [1.526447546E12, 57.0], [1.526447589E12, 16.0], [1.526447542E12, 71.0], [1.526447585E12, 20.0], [1.526447544E12, 64.0], [1.52644754E12, 80.0], [1.526447583E12, 25.0], [1.526447579E12, 28.0], [1.526447538E12, 91.40000000000055], [1.526447581E12, 27.0], [1.526447534E12, 101.10000000000036], [1.526447577E12, 29.0], [1.526447536E12, 101.0], [1.526447532E12, 113.90000000000009], [1.526447575E12, 30.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.526447571E12, 310.0], [1.52644753E12, 539.7600000000002], [1.526447573E12, 309.97999999999956], [1.526447526E12, 563.3900000000026], [1.526447569E12, 310.0], [1.526447528E12, 572.3599999999974], [1.526447524E12, 651.9599999999998], [1.526447567E12, 314.0], [1.526447563E12, 320.0], [1.526447522E12, 766.2299999999999], [1.526447565E12, 318.0], [1.526447561E12, 318.21999999999935], [1.526447559E12, 321.0499999999993], [1.526447555E12, 334.84000000000015], [1.526447598E12, 131.0], [1.526447557E12, 325.0], [1.5264476E12, 131.0], [1.526447553E12, 338.15999999999985], [1.526447596E12, 148.0], [1.526447551E12, 346.0], [1.526447594E12, 155.9900000000016], [1.526447547E12, 371.0], [1.52644759E12, 181.9900000000016], [1.526447549E12, 357.39000000000306], [1.526447592E12, 179.9900000000016], [1.526447545E12, 393.5499999999993], [1.526447588E12, 229.9900000000016], [1.526447543E12, 407.86999999999716], [1.526447586E12, 262.0], [1.526447539E12, 436.5699999999997], [1.526447582E12, 269.9800000000032], [1.526447541E12, 415.0], [1.526447584E12, 269.9800000000032], [1.526447537E12, 455.0], [1.52644758E12, 293.22000000000116], [1.526447535E12, 458.71999999999935], [1.526447578E12, 300.6899999999987], [1.526447531E12, 519.3199999999997], [1.526447574E12, 309.0], [1.526447533E12, 471.3299999999999], [1.526447576E12, 306.0], [1.526447529E12, 578.5200000000004], [1.526447572E12, 310.0], [1.526447527E12, 516.2800000000007], [1.52644757E12, 310.0], [1.526447523E12, 722.6400000000014], [1.526447566E12, 316.3199999999997], [1.526447525E12, 630.1599999999999], [1.526447568E12, 312.41999999999825], [1.526447521E12, 677.4799999999996], [1.526447564E12, 318.0], [1.526447562E12, 318.89999999999964], [1.526447558E12, 323.0], [1.52644756E12, 319.14999999999964], [1.526447556E12, 328.14999999999964], [1.526447599E12, 131.0], [1.526447595E12, 155.9900000000016], [1.526447554E12, 336.0], [1.526447597E12, 142.9900000000016], [1.52644755E12, 349.0], [1.526447593E12, 165.9600000000064], [1.526447552E12, 340.5100000000002], [1.526447548E12, 362.5100000000002], [1.526447591E12, 180.9900000000016], [1.526447587E12, 243.9900000000016], [1.526447546E12, 383.0], [1.526447589E12, 209.9900000000016], [1.526447542E12, 412.0], [1.526447585E12, 262.0], [1.526447544E12, 400.40999999999985], [1.52644754E12, 420.449999999998], [1.526447583E12, 269.9800000000032], [1.526447579E12, 297.8299999999981], [1.526447538E12, 449.3199999999988], [1.526447581E12, 292.0], [1.526447534E12, 464.21999999999935], [1.526447577E12, 304.09999999999854], [1.526447536E12, 457.0], [1.526447532E12, 492.95000000000164], [1.526447575E12, 308.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.526447571E12, 82.0], [1.52644753E12, 263.09999999999945], [1.526447573E12, 82.0], [1.526447526E12, 255.1500000000001], [1.526447569E12, 83.0], [1.526447528E12, 282.0], [1.526447524E12, 236.1999999999996], [1.526447567E12, 86.0], [1.526447563E12, 92.0], [1.526447522E12, 422.69999999999936], [1.526447565E12, 90.0], [1.526447561E12, 90.0], [1.526447559E12, 93.0], [1.526447555E12, 106.0], [1.526447598E12, 26.0], [1.526447557E12, 100.0], [1.5264476E12, 26.0], [1.526447553E12, 114.79999999999927], [1.526447596E12, 28.0], [1.526447551E12, 121.35000000000036], [1.526447594E12, 29.0], [1.526447547E12, 140.0], [1.52644759E12, 32.95000000000073], [1.526447549E12, 129.0], [1.526447592E12, 32.0], [1.526447545E12, 150.0], [1.526447588E12, 46.0], [1.526447543E12, 167.0], [1.526447586E12, 58.0], [1.526447539E12, 194.0], [1.526447582E12, 66.0], [1.526447541E12, 179.0], [1.526447584E12, 62.0], [1.526447537E12, 213.0], [1.52644758E12, 72.0], [1.526447535E12, 215.30000000000018], [1.526447578E12, 75.0], [1.526447531E12, 244.39999999999964], [1.526447574E12, 81.14999999999782], [1.526447533E12, 229.64999999999964], [1.526447576E12, 77.0], [1.526447529E12, 277.14999999999964], [1.526447572E12, 82.0], [1.526447527E12, 282.8999999999992], [1.52644757E12, 82.0], [1.526447523E12, 239.5999999999999], [1.526447566E12, 89.0], [1.526447525E12, 262.34999999999945], [1.526447568E12, 84.0], [1.526447521E12, 537.4999999999995], [1.526447564E12, 90.0], [1.526447562E12, 94.0], [1.526447558E12, 96.0], [1.52644756E12, 91.0], [1.526447556E12, 102.75], [1.526447599E12, 26.0], [1.526447595E12, 29.0], [1.526447554E12, 111.0], [1.526447597E12, 27.0], [1.52644755E12, 125.0], [1.526447593E12, 30.0], [1.526447552E12, 117.0], [1.526447548E12, 135.0], [1.526447591E12, 32.0], [1.526447587E12, 52.0], [1.526447546E12, 143.75], [1.526447589E12, 38.0], [1.526447542E12, 173.0], [1.526447585E12, 58.0], [1.526447544E12, 158.04999999999927], [1.52644754E12, 185.0], [1.526447583E12, 64.0], [1.526447579E12, 73.14999999999782], [1.526447538E12, 203.0], [1.526447581E12, 70.0], [1.526447534E12, 218.0], [1.526447577E12, 76.0], [1.526447536E12, 218.0], [1.526447532E12, 227.0], [1.526447575E12, 79.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 1.5264476E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 12.0, "minX": 1.0, "maxY": 28.5, "series": [{"data": [[526.0, 28.5], [2.0, 17.5], [4.0, 16.0], [5.0, 17.0], [14.0, 16.0], [68.0, 13.0], [93.0, 14.0], [145.0, 14.0], [156.0, 14.0], [182.0, 14.0], [191.0, 14.0], [195.0, 14.0], [192.0, 14.0], [210.0, 13.0], [217.0, 13.0], [232.0, 15.0], [247.0, 14.0], [253.0, 13.0], [1.0, 17.0], [266.0, 14.0], [297.0, 15.0], [290.0, 14.0], [300.0, 14.0], [308.0, 14.0], [317.0, 14.0], [333.0, 13.0], [335.0, 13.0], [325.0, 13.0], [344.0, 12.0], [346.0, 13.0], [361.0, 13.0], [357.0, 14.0], [367.0, 12.0], [363.0, 13.0], [366.0, 13.0], [369.0, 13.0], [374.0, 13.0], [372.0, 13.0], [375.0, 13.0], [380.0, 13.0], [377.0, 13.0], [373.0, 12.0], [376.0, 13.0], [378.0, 13.0], [386.0, 13.0], [391.0, 13.0], [384.0, 13.0], [387.0, 13.0], [388.0, 12.0], [393.0, 13.0], [409.0, 13.0], [406.0, 14.0], [432.0, 26.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 526.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 12.0, "minX": 1.0, "maxY": 28.5, "series": [{"data": [[526.0, 28.5], [2.0, 17.5], [4.0, 16.0], [5.0, 17.0], [14.0, 16.0], [68.0, 13.0], [93.0, 14.0], [145.0, 14.0], [156.0, 14.0], [182.0, 14.0], [191.0, 14.0], [195.0, 14.0], [192.0, 14.0], [210.0, 13.0], [217.0, 13.0], [232.0, 15.0], [247.0, 14.0], [253.0, 13.0], [1.0, 17.0], [266.0, 14.0], [297.0, 15.0], [290.0, 14.0], [300.0, 14.0], [308.0, 14.0], [317.0, 14.0], [333.0, 13.0], [335.0, 13.0], [325.0, 13.0], [344.0, 12.0], [346.0, 13.0], [361.0, 13.0], [357.0, 14.0], [367.0, 12.0], [363.0, 13.0], [366.0, 13.0], [369.0, 13.0], [374.0, 13.0], [372.0, 13.0], [375.0, 13.0], [380.0, 13.0], [377.0, 13.0], [373.0, 12.0], [376.0, 13.0], [378.0, 13.0], [386.0, 13.0], [391.0, 13.0], [384.0, 13.0], [387.0, 13.0], [388.0, 12.0], [393.0, 13.0], [409.0, 13.0], [406.0, 14.0], [432.0, 25.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 526.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.526447521E12, "maxY": 508.0, "series": [{"data": [[1.526447571E12, 2.0], [1.52644753E12, 369.0], [1.526447573E12, 2.0], [1.526447526E12, 508.0], [1.526447569E12, 386.0], [1.526447528E12, 368.0], [1.526447524E12, 444.0], [1.526447567E12, 387.0], [1.526447563E12, 386.0], [1.526447522E12, 374.0], [1.526447565E12, 1.0], [1.526447561E12, 88.0], [1.526447559E12, 368.0], [1.526447555E12, 362.0], [1.526447598E12, 316.0], [1.526447557E12, 375.0], [1.5264476E12, 64.0], [1.526447553E12, 335.0], [1.526447596E12, 187.0], [1.526447551E12, 373.0], [1.526447594E12, 205.0], [1.526447547E12, 381.0], [1.52644759E12, 212.0], [1.526447549E12, 374.0], [1.526447592E12, 5.0], [1.526447545E12, 387.0], [1.526447588E12, 384.0], [1.526447543E12, 368.0], [1.526447586E12, 4.0], [1.526447539E12, 387.0], [1.526447582E12, 306.0], [1.526447541E12, 388.0], [1.526447584E12, 209.0], [1.526447537E12, 384.0], [1.52644758E12, 360.0], [1.526447535E12, 383.0], [1.526447578E12, 387.0], [1.526447531E12, 387.0], [1.526447574E12, 201.0], [1.526447533E12, 406.0], [1.526447576E12, 346.0], [1.526447529E12, 402.0], [1.526447572E12, 1.0], [1.526447527E12, 370.0], [1.52644757E12, 248.0], [1.526447523E12, 317.0], [1.526447566E12, 150.0], [1.526447525E12, 245.0], [1.526447568E12, 387.0], [1.526447521E12, 312.0], [1.526447564E12, 331.0], [1.526447562E12, 243.0], [1.526447558E12, 366.0], [1.52644756E12, 291.0], [1.526447556E12, 369.0], [1.526447599E12, 378.0], [1.526447595E12, 14.0], [1.526447554E12, 371.0], [1.526447597E12, 191.0], [1.52644755E12, 377.0], [1.526447593E12, 161.0], [1.526447552E12, 375.0], [1.526447548E12, 344.0], [1.526447591E12, 4.0], [1.526447587E12, 305.0], [1.526447546E12, 379.0], [1.526447589E12, 384.0], [1.526447542E12, 386.0], [1.526447585E12, 263.0], [1.526447544E12, 386.0], [1.52644754E12, 388.0], [1.526447583E12, 333.0], [1.526447579E12, 386.0], [1.526447538E12, 367.0], [1.526447581E12, 193.0], [1.526447534E12, 373.0], [1.526447577E12, 324.0], [1.526447536E12, 382.0], [1.526447532E12, 368.0], [1.526447575E12, 377.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 1.5264476E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.526447521E12, "maxY": 526.0, "series": [{"data": [[1.526447571E12, 2.0], [1.52644753E12, 369.0], [1.526447573E12, 2.0], [1.526447526E12, 526.0], [1.526447569E12, 386.0], [1.526447528E12, 374.0], [1.526447524E12, 432.0], [1.526447567E12, 387.0], [1.526447563E12, 393.0], [1.526447522E12, 361.0], [1.526447565E12, 1.0], [1.526447561E12, 93.0], [1.526447559E12, 369.0], [1.526447555E12, 363.0], [1.526447598E12, 317.0], [1.526447557E12, 375.0], [1.5264476E12, 68.0], [1.526447553E12, 335.0], [1.526447596E12, 182.0], [1.526447551E12, 373.0], [1.526447594E12, 210.0], [1.526447547E12, 380.0], [1.52644759E12, 217.0], [1.526447549E12, 374.0], [1.526447592E12, 5.0], [1.526447545E12, 386.0], [1.526447588E12, 384.0], [1.526447543E12, 367.0], [1.526447586E12, 4.0], [1.526447539E12, 387.0], [1.526447582E12, 308.0], [1.526447541E12, 387.0], [1.526447584E12, 210.0], [1.526447537E12, 384.0], [1.52644758E12, 361.0], [1.526447535E12, 375.0], [1.526447578E12, 386.0], [1.526447531E12, 386.0], [1.526447574E12, 195.0], [1.526447533E12, 406.0], [1.526447576E12, 346.0], [1.526447529E12, 409.0], [1.526447572E12, 1.0], [1.526447527E12, 357.0], [1.52644757E12, 253.0], [1.526447523E12, 333.0], [1.526447566E12, 145.0], [1.526447525E12, 247.0], [1.526447568E12, 387.0], [1.526447521E12, 297.0], [1.526447564E12, 335.0], [1.526447562E12, 232.0], [1.526447558E12, 366.0], [1.52644756E12, 290.0], [1.526447556E12, 369.0], [1.526447599E12, 378.0], [1.526447595E12, 14.0], [1.526447554E12, 369.0], [1.526447597E12, 191.0], [1.52644755E12, 377.0], [1.526447593E12, 156.0], [1.526447552E12, 376.0], [1.526447548E12, 344.0], [1.526447591E12, 4.0], [1.526447587E12, 300.0], [1.526447546E12, 380.0], [1.526447589E12, 384.0], [1.526447542E12, 386.0], [1.526447585E12, 266.0], [1.526447544E12, 388.0], [1.52644754E12, 388.0], [1.526447583E12, 333.0], [1.526447579E12, 386.0], [1.526447538E12, 367.0], [1.526447581E12, 192.0], [1.526447534E12, 372.0], [1.526447577E12, 325.0], [1.526447536E12, 391.0], [1.526447532E12, 369.0], [1.526447575E12, 377.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 1.5264476E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.526447521E12, "maxY": 526.0, "series": [{"data": [[1.526447571E12, 2.0], [1.52644753E12, 369.0], [1.526447573E12, 2.0], [1.526447526E12, 526.0], [1.526447569E12, 386.0], [1.526447528E12, 374.0], [1.526447524E12, 432.0], [1.526447567E12, 387.0], [1.526447563E12, 393.0], [1.526447522E12, 361.0], [1.526447565E12, 1.0], [1.526447561E12, 93.0], [1.526447559E12, 369.0], [1.526447555E12, 363.0], [1.526447598E12, 317.0], [1.526447557E12, 375.0], [1.5264476E12, 68.0], [1.526447553E12, 335.0], [1.526447596E12, 182.0], [1.526447551E12, 373.0], [1.526447594E12, 210.0], [1.526447547E12, 380.0], [1.52644759E12, 217.0], [1.526447549E12, 374.0], [1.526447592E12, 5.0], [1.526447545E12, 386.0], [1.526447588E12, 384.0], [1.526447543E12, 367.0], [1.526447586E12, 4.0], [1.526447539E12, 387.0], [1.526447582E12, 308.0], [1.526447541E12, 387.0], [1.526447584E12, 210.0], [1.526447537E12, 384.0], [1.52644758E12, 361.0], [1.526447535E12, 375.0], [1.526447578E12, 386.0], [1.526447531E12, 386.0], [1.526447574E12, 195.0], [1.526447533E12, 406.0], [1.526447576E12, 346.0], [1.526447529E12, 409.0], [1.526447572E12, 1.0], [1.526447527E12, 357.0], [1.52644757E12, 253.0], [1.526447523E12, 333.0], [1.526447566E12, 145.0], [1.526447525E12, 247.0], [1.526447568E12, 387.0], [1.526447521E12, 297.0], [1.526447564E12, 335.0], [1.526447562E12, 232.0], [1.526447558E12, 366.0], [1.52644756E12, 290.0], [1.526447556E12, 369.0], [1.526447599E12, 378.0], [1.526447595E12, 14.0], [1.526447554E12, 369.0], [1.526447597E12, 191.0], [1.52644755E12, 377.0], [1.526447593E12, 156.0], [1.526447552E12, 376.0], [1.526447548E12, 344.0], [1.526447591E12, 4.0], [1.526447587E12, 300.0], [1.526447546E12, 380.0], [1.526447589E12, 384.0], [1.526447542E12, 386.0], [1.526447585E12, 266.0], [1.526447544E12, 388.0], [1.52644754E12, 388.0], [1.526447583E12, 333.0], [1.526447579E12, 386.0], [1.526447538E12, 367.0], [1.526447581E12, 192.0], [1.526447534E12, 372.0], [1.526447577E12, 325.0], [1.526447536E12, 391.0], [1.526447532E12, 369.0], [1.526447575E12, 377.0]], "isOverall": false, "label": "inference-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 1000, "maxX": 1.5264476E12, "title": "Transactions Per Second"}},
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
