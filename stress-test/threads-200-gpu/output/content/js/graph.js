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
        data: {"result": {"minY": 12.0, "minX": 0.0, "maxY": 1348.0, "series": [{"data": [[0.0, 12.0], [0.1, 12.0], [0.2, 12.0], [0.3, 12.0], [0.4, 12.0], [0.5, 12.0], [0.6, 12.0], [0.7, 12.0], [0.8, 12.0], [0.9, 12.0], [1.0, 12.0], [1.1, 12.0], [1.2, 12.0], [1.3, 12.0], [1.4, 12.0], [1.5, 12.0], [1.6, 12.0], [1.7, 12.0], [1.8, 12.0], [1.9, 12.0], [2.0, 12.0], [2.1, 12.0], [2.2, 12.0], [2.3, 13.0], [2.4, 13.0], [2.5, 13.0], [2.6, 13.0], [2.7, 13.0], [2.8, 13.0], [2.9, 13.0], [3.0, 13.0], [3.1, 13.0], [3.2, 13.0], [3.3, 13.0], [3.4, 13.0], [3.5, 13.0], [3.6, 13.0], [3.7, 13.0], [3.8, 13.0], [3.9, 13.0], [4.0, 13.0], [4.1, 13.0], [4.2, 13.0], [4.3, 13.0], [4.4, 13.0], [4.5, 13.0], [4.6, 13.0], [4.7, 13.0], [4.8, 13.0], [4.9, 13.0], [5.0, 13.0], [5.1, 13.0], [5.2, 13.0], [5.3, 13.0], [5.4, 13.0], [5.5, 13.0], [5.6, 13.0], [5.7, 13.0], [5.8, 13.0], [5.9, 13.0], [6.0, 13.0], [6.1, 13.0], [6.2, 13.0], [6.3, 13.0], [6.4, 13.0], [6.5, 13.0], [6.6, 13.0], [6.7, 13.0], [6.8, 13.0], [6.9, 13.0], [7.0, 13.0], [7.1, 13.0], [7.2, 13.0], [7.3, 13.0], [7.4, 13.0], [7.5, 13.0], [7.6, 13.0], [7.7, 13.0], [7.8, 13.0], [7.9, 13.0], [8.0, 13.0], [8.1, 13.0], [8.2, 13.0], [8.3, 13.0], [8.4, 13.0], [8.5, 13.0], [8.6, 13.0], [8.7, 13.0], [8.8, 13.0], [8.9, 13.0], [9.0, 13.0], [9.1, 13.0], [9.2, 13.0], [9.3, 13.0], [9.4, 13.0], [9.5, 13.0], [9.6, 13.0], [9.7, 13.0], [9.8, 13.0], [9.9, 13.0], [10.0, 13.0], [10.1, 13.0], [10.2, 13.0], [10.3, 13.0], [10.4, 13.0], [10.5, 13.0], [10.6, 13.0], [10.7, 13.0], [10.8, 13.0], [10.9, 13.0], [11.0, 13.0], [11.1, 13.0], [11.2, 13.0], [11.3, 13.0], [11.4, 13.0], [11.5, 13.0], [11.6, 13.0], [11.7, 13.0], [11.8, 13.0], [11.9, 13.0], [12.0, 13.0], [12.1, 13.0], [12.2, 13.0], [12.3, 13.0], [12.4, 13.0], [12.5, 13.0], [12.6, 13.0], [12.7, 13.0], [12.8, 13.0], [12.9, 13.0], [13.0, 13.0], [13.1, 13.0], [13.2, 13.0], [13.3, 13.0], [13.4, 13.0], [13.5, 13.0], [13.6, 13.0], [13.7, 13.0], [13.8, 13.0], [13.9, 13.0], [14.0, 13.0], [14.1, 13.0], [14.2, 13.0], [14.3, 13.0], [14.4, 13.0], [14.5, 13.0], [14.6, 13.0], [14.7, 13.0], [14.8, 13.0], [14.9, 13.0], [15.0, 13.0], [15.1, 13.0], [15.2, 13.0], [15.3, 13.0], [15.4, 13.0], [15.5, 13.0], [15.6, 13.0], [15.7, 13.0], [15.8, 13.0], [15.9, 13.0], [16.0, 13.0], [16.1, 13.0], [16.2, 13.0], [16.3, 13.0], [16.4, 13.0], [16.5, 13.0], [16.6, 13.0], [16.7, 13.0], [16.8, 13.0], [16.9, 13.0], [17.0, 13.0], [17.1, 13.0], [17.2, 13.0], [17.3, 13.0], [17.4, 13.0], [17.5, 13.0], [17.6, 13.0], [17.7, 13.0], [17.8, 13.0], [17.9, 13.0], [18.0, 13.0], [18.1, 13.0], [18.2, 13.0], [18.3, 13.0], [18.4, 13.0], [18.5, 13.0], [18.6, 13.0], [18.7, 13.0], [18.8, 13.0], [18.9, 13.0], [19.0, 13.0], [19.1, 13.0], [19.2, 13.0], [19.3, 13.0], [19.4, 13.0], [19.5, 13.0], [19.6, 13.0], [19.7, 13.0], [19.8, 13.0], [19.9, 13.0], [20.0, 13.0], [20.1, 13.0], [20.2, 13.0], [20.3, 13.0], [20.4, 13.0], [20.5, 13.0], [20.6, 13.0], [20.7, 13.0], [20.8, 13.0], [20.9, 13.0], [21.0, 13.0], [21.1, 13.0], [21.2, 13.0], [21.3, 13.0], [21.4, 13.0], [21.5, 13.0], [21.6, 13.0], [21.7, 13.0], [21.8, 13.0], [21.9, 13.0], [22.0, 13.0], [22.1, 13.0], [22.2, 13.0], [22.3, 13.0], [22.4, 13.0], [22.5, 13.0], [22.6, 13.0], [22.7, 13.0], [22.8, 13.0], [22.9, 13.0], [23.0, 13.0], [23.1, 13.0], [23.2, 13.0], [23.3, 13.0], [23.4, 13.0], [23.5, 13.0], [23.6, 13.0], [23.7, 13.0], [23.8, 13.0], [23.9, 13.0], [24.0, 13.0], [24.1, 13.0], [24.2, 13.0], [24.3, 13.0], [24.4, 13.0], [24.5, 14.0], [24.6, 14.0], [24.7, 14.0], [24.8, 14.0], [24.9, 14.0], [25.0, 14.0], [25.1, 14.0], [25.2, 14.0], [25.3, 14.0], [25.4, 14.0], [25.5, 14.0], [25.6, 14.0], [25.7, 14.0], [25.8, 14.0], [25.9, 14.0], [26.0, 14.0], [26.1, 14.0], [26.2, 14.0], [26.3, 14.0], [26.4, 14.0], [26.5, 14.0], [26.6, 14.0], [26.7, 14.0], [26.8, 14.0], [26.9, 14.0], [27.0, 14.0], [27.1, 14.0], [27.2, 14.0], [27.3, 14.0], [27.4, 14.0], [27.5, 14.0], [27.6, 14.0], [27.7, 14.0], [27.8, 14.0], [27.9, 14.0], [28.0, 14.0], [28.1, 14.0], [28.2, 14.0], [28.3, 14.0], [28.4, 14.0], [28.5, 14.0], [28.6, 14.0], [28.7, 14.0], [28.8, 14.0], [28.9, 14.0], [29.0, 14.0], [29.1, 14.0], [29.2, 14.0], [29.3, 14.0], [29.4, 14.0], [29.5, 14.0], [29.6, 14.0], [29.7, 14.0], [29.8, 14.0], [29.9, 14.0], [30.0, 14.0], [30.1, 14.0], [30.2, 14.0], [30.3, 14.0], [30.4, 14.0], [30.5, 14.0], [30.6, 14.0], [30.7, 14.0], [30.8, 14.0], [30.9, 14.0], [31.0, 14.0], [31.1, 14.0], [31.2, 14.0], [31.3, 14.0], [31.4, 14.0], [31.5, 14.0], [31.6, 14.0], [31.7, 14.0], [31.8, 14.0], [31.9, 14.0], [32.0, 14.0], [32.1, 14.0], [32.2, 14.0], [32.3, 14.0], [32.4, 14.0], [32.5, 14.0], [32.6, 14.0], [32.7, 14.0], [32.8, 14.0], [32.9, 14.0], [33.0, 14.0], [33.1, 14.0], [33.2, 14.0], [33.3, 14.0], [33.4, 14.0], [33.5, 14.0], [33.6, 14.0], [33.7, 14.0], [33.8, 14.0], [33.9, 14.0], [34.0, 14.0], [34.1, 14.0], [34.2, 14.0], [34.3, 14.0], [34.4, 14.0], [34.5, 14.0], [34.6, 14.0], [34.7, 14.0], [34.8, 14.0], [34.9, 14.0], [35.0, 14.0], [35.1, 14.0], [35.2, 14.0], [35.3, 14.0], [35.4, 14.0], [35.5, 14.0], [35.6, 14.0], [35.7, 14.0], [35.8, 14.0], [35.9, 14.0], [36.0, 14.0], [36.1, 14.0], [36.2, 14.0], [36.3, 14.0], [36.4, 14.0], [36.5, 14.0], [36.6, 14.0], [36.7, 14.0], [36.8, 14.0], [36.9, 14.0], [37.0, 14.0], [37.1, 14.0], [37.2, 14.0], [37.3, 14.0], [37.4, 14.0], [37.5, 14.0], [37.6, 14.0], [37.7, 14.0], [37.8, 14.0], [37.9, 14.0], [38.0, 14.0], [38.1, 14.0], [38.2, 14.0], [38.3, 14.0], [38.4, 14.0], [38.5, 14.0], [38.6, 14.0], [38.7, 14.0], [38.8, 14.0], [38.9, 14.0], [39.0, 14.0], [39.1, 14.0], [39.2, 14.0], [39.3, 14.0], [39.4, 14.0], [39.5, 14.0], [39.6, 14.0], [39.7, 14.0], [39.8, 14.0], [39.9, 14.0], [40.0, 14.0], [40.1, 14.0], [40.2, 14.0], [40.3, 14.0], [40.4, 14.0], [40.5, 14.0], [40.6, 14.0], [40.7, 14.0], [40.8, 14.0], [40.9, 14.0], [41.0, 14.0], [41.1, 14.0], [41.2, 14.0], [41.3, 14.0], [41.4, 14.0], [41.5, 14.0], [41.6, 14.0], [41.7, 14.0], [41.8, 14.0], [41.9, 14.0], [42.0, 14.0], [42.1, 14.0], [42.2, 14.0], [42.3, 14.0], [42.4, 14.0], [42.5, 14.0], [42.6, 14.0], [42.7, 14.0], [42.8, 14.0], [42.9, 14.0], [43.0, 14.0], [43.1, 14.0], [43.2, 14.0], [43.3, 14.0], [43.4, 14.0], [43.5, 14.0], [43.6, 14.0], [43.7, 14.0], [43.8, 14.0], [43.9, 14.0], [44.0, 14.0], [44.1, 14.0], [44.2, 14.0], [44.3, 14.0], [44.4, 14.0], [44.5, 14.0], [44.6, 14.0], [44.7, 14.0], [44.8, 14.0], [44.9, 14.0], [45.0, 14.0], [45.1, 14.0], [45.2, 14.0], [45.3, 14.0], [45.4, 14.0], [45.5, 14.0], [45.6, 14.0], [45.7, 14.0], [45.8, 14.0], [45.9, 14.0], [46.0, 14.0], [46.1, 14.0], [46.2, 14.0], [46.3, 14.0], [46.4, 14.0], [46.5, 14.0], [46.6, 14.0], [46.7, 14.0], [46.8, 14.0], [46.9, 14.0], [47.0, 14.0], [47.1, 14.0], [47.2, 14.0], [47.3, 14.0], [47.4, 14.0], [47.5, 14.0], [47.6, 14.0], [47.7, 14.0], [47.8, 14.0], [47.9, 15.0], [48.0, 15.0], [48.1, 15.0], [48.2, 15.0], [48.3, 15.0], [48.4, 15.0], [48.5, 15.0], [48.6, 15.0], [48.7, 15.0], [48.8, 15.0], [48.9, 15.0], [49.0, 15.0], [49.1, 15.0], [49.2, 15.0], [49.3, 15.0], [49.4, 15.0], [49.5, 15.0], [49.6, 15.0], [49.7, 15.0], [49.8, 15.0], [49.9, 15.0], [50.0, 15.0], [50.1, 15.0], [50.2, 15.0], [50.3, 15.0], [50.4, 15.0], [50.5, 15.0], [50.6, 15.0], [50.7, 15.0], [50.8, 15.0], [50.9, 15.0], [51.0, 15.0], [51.1, 15.0], [51.2, 15.0], [51.3, 15.0], [51.4, 15.0], [51.5, 15.0], [51.6, 15.0], [51.7, 15.0], [51.8, 15.0], [51.9, 15.0], [52.0, 15.0], [52.1, 15.0], [52.2, 15.0], [52.3, 15.0], [52.4, 15.0], [52.5, 15.0], [52.6, 15.0], [52.7, 15.0], [52.8, 15.0], [52.9, 15.0], [53.0, 15.0], [53.1, 15.0], [53.2, 15.0], [53.3, 15.0], [53.4, 15.0], [53.5, 15.0], [53.6, 15.0], [53.7, 15.0], [53.8, 15.0], [53.9, 15.0], [54.0, 15.0], [54.1, 15.0], [54.2, 15.0], [54.3, 15.0], [54.4, 15.0], [54.5, 15.0], [54.6, 15.0], [54.7, 15.0], [54.8, 15.0], [54.9, 15.0], [55.0, 15.0], [55.1, 15.0], [55.2, 15.0], [55.3, 15.0], [55.4, 15.0], [55.5, 15.0], [55.6, 15.0], [55.7, 15.0], [55.8, 15.0], [55.9, 15.0], [56.0, 15.0], [56.1, 15.0], [56.2, 15.0], [56.3, 15.0], [56.4, 15.0], [56.5, 15.0], [56.6, 15.0], [56.7, 15.0], [56.8, 15.0], [56.9, 15.0], [57.0, 15.0], [57.1, 15.0], [57.2, 15.0], [57.3, 15.0], [57.4, 15.0], [57.5, 15.0], [57.6, 15.0], [57.7, 15.0], [57.8, 15.0], [57.9, 15.0], [58.0, 15.0], [58.1, 15.0], [58.2, 15.0], [58.3, 15.0], [58.4, 15.0], [58.5, 15.0], [58.6, 15.0], [58.7, 15.0], [58.8, 15.0], [58.9, 15.0], [59.0, 15.0], [59.1, 15.0], [59.2, 15.0], [59.3, 15.0], [59.4, 15.0], [59.5, 15.0], [59.6, 15.0], [59.7, 15.0], [59.8, 15.0], [59.9, 15.0], [60.0, 15.0], [60.1, 15.0], [60.2, 15.0], [60.3, 15.0], [60.4, 15.0], [60.5, 15.0], [60.6, 15.0], [60.7, 15.0], [60.8, 15.0], [60.9, 15.0], [61.0, 15.0], [61.1, 15.0], [61.2, 15.0], [61.3, 15.0], [61.4, 15.0], [61.5, 15.0], [61.6, 15.0], [61.7, 15.0], [61.8, 15.0], [61.9, 15.0], [62.0, 15.0], [62.1, 15.0], [62.2, 15.0], [62.3, 15.0], [62.4, 15.0], [62.5, 15.0], [62.6, 15.0], [62.7, 15.0], [62.8, 15.0], [62.9, 15.0], [63.0, 15.0], [63.1, 15.0], [63.2, 15.0], [63.3, 15.0], [63.4, 15.0], [63.5, 15.0], [63.6, 15.0], [63.7, 15.0], [63.8, 15.0], [63.9, 15.0], [64.0, 15.0], [64.1, 15.0], [64.2, 15.0], [64.3, 15.0], [64.4, 15.0], [64.5, 15.0], [64.6, 15.0], [64.7, 15.0], [64.8, 15.0], [64.9, 15.0], [65.0, 15.0], [65.1, 15.0], [65.2, 15.0], [65.3, 15.0], [65.4, 15.0], [65.5, 15.0], [65.6, 15.0], [65.7, 15.0], [65.8, 15.0], [65.9, 15.0], [66.0, 15.0], [66.1, 15.0], [66.2, 15.0], [66.3, 15.0], [66.4, 15.0], [66.5, 15.0], [66.6, 15.0], [66.7, 15.0], [66.8, 15.0], [66.9, 15.0], [67.0, 15.0], [67.1, 15.0], [67.2, 15.0], [67.3, 15.0], [67.4, 15.0], [67.5, 15.0], [67.6, 15.0], [67.7, 15.0], [67.8, 15.0], [67.9, 15.0], [68.0, 15.0], [68.1, 15.0], [68.2, 15.0], [68.3, 15.0], [68.4, 15.0], [68.5, 15.0], [68.6, 15.0], [68.7, 15.0], [68.8, 15.0], [68.9, 15.0], [69.0, 15.0], [69.1, 15.0], [69.2, 15.0], [69.3, 15.0], [69.4, 15.0], [69.5, 15.0], [69.6, 15.0], [69.7, 15.0], [69.8, 15.0], [69.9, 15.0], [70.0, 15.0], [70.1, 15.0], [70.2, 16.0], [70.3, 16.0], [70.4, 16.0], [70.5, 16.0], [70.6, 16.0], [70.7, 16.0], [70.8, 16.0], [70.9, 16.0], [71.0, 16.0], [71.1, 16.0], [71.2, 16.0], [71.3, 16.0], [71.4, 16.0], [71.5, 16.0], [71.6, 16.0], [71.7, 16.0], [71.8, 16.0], [71.9, 16.0], [72.0, 16.0], [72.1, 16.0], [72.2, 16.0], [72.3, 16.0], [72.4, 16.0], [72.5, 16.0], [72.6, 16.0], [72.7, 16.0], [72.8, 16.0], [72.9, 16.0], [73.0, 16.0], [73.1, 16.0], [73.2, 16.0], [73.3, 16.0], [73.4, 16.0], [73.5, 16.0], [73.6, 16.0], [73.7, 16.0], [73.8, 16.0], [73.9, 16.0], [74.0, 16.0], [74.1, 16.0], [74.2, 16.0], [74.3, 16.0], [74.4, 16.0], [74.5, 16.0], [74.6, 16.0], [74.7, 16.0], [74.8, 16.0], [74.9, 16.0], [75.0, 16.0], [75.1, 16.0], [75.2, 16.0], [75.3, 16.0], [75.4, 16.0], [75.5, 16.0], [75.6, 16.0], [75.7, 16.0], [75.8, 16.0], [75.9, 16.0], [76.0, 16.0], [76.1, 16.0], [76.2, 16.0], [76.3, 16.0], [76.4, 16.0], [76.5, 16.0], [76.6, 16.0], [76.7, 16.0], [76.8, 16.0], [76.9, 16.0], [77.0, 16.0], [77.1, 16.0], [77.2, 16.0], [77.3, 16.0], [77.4, 16.0], [77.5, 16.0], [77.6, 16.0], [77.7, 16.0], [77.8, 16.0], [77.9, 16.0], [78.0, 16.0], [78.1, 16.0], [78.2, 16.0], [78.3, 16.0], [78.4, 16.0], [78.5, 16.0], [78.6, 16.0], [78.7, 16.0], [78.8, 16.0], [78.9, 16.0], [79.0, 16.0], [79.1, 16.0], [79.2, 16.0], [79.3, 16.0], [79.4, 16.0], [79.5, 16.0], [79.6, 16.0], [79.7, 16.0], [79.8, 16.0], [79.9, 16.0], [80.0, 16.0], [80.1, 16.0], [80.2, 16.0], [80.3, 16.0], [80.4, 16.0], [80.5, 16.0], [80.6, 16.0], [80.7, 16.0], [80.8, 16.0], [80.9, 16.0], [81.0, 16.0], [81.1, 16.0], [81.2, 16.0], [81.3, 16.0], [81.4, 16.0], [81.5, 16.0], [81.6, 16.0], [81.7, 16.0], [81.8, 16.0], [81.9, 16.0], [82.0, 16.0], [82.1, 16.0], [82.2, 16.0], [82.3, 16.0], [82.4, 16.0], [82.5, 16.0], [82.6, 16.0], [82.7, 16.0], [82.8, 16.0], [82.9, 16.0], [83.0, 16.0], [83.1, 16.0], [83.2, 16.0], [83.3, 16.0], [83.4, 16.0], [83.5, 16.0], [83.6, 16.0], [83.7, 16.0], [83.8, 16.0], [83.9, 16.0], [84.0, 16.0], [84.1, 16.0], [84.2, 16.0], [84.3, 16.0], [84.4, 16.0], [84.5, 16.0], [84.6, 16.0], [84.7, 16.0], [84.8, 16.0], [84.9, 16.0], [85.0, 16.0], [85.1, 16.0], [85.2, 16.0], [85.3, 16.0], [85.4, 16.0], [85.5, 16.0], [85.6, 16.0], [85.7, 16.0], [85.8, 16.0], [85.9, 16.0], [86.0, 16.0], [86.1, 16.0], [86.2, 16.0], [86.3, 16.0], [86.4, 16.0], [86.5, 16.0], [86.6, 16.0], [86.7, 16.0], [86.8, 16.0], [86.9, 16.0], [87.0, 16.0], [87.1, 17.0], [87.2, 17.0], [87.3, 17.0], [87.4, 17.0], [87.5, 17.0], [87.6, 17.0], [87.7, 17.0], [87.8, 17.0], [87.9, 17.0], [88.0, 17.0], [88.1, 17.0], [88.2, 17.0], [88.3, 17.0], [88.4, 17.0], [88.5, 17.0], [88.6, 17.0], [88.7, 17.0], [88.8, 17.0], [88.9, 17.0], [89.0, 17.0], [89.1, 17.0], [89.2, 17.0], [89.3, 17.0], [89.4, 17.0], [89.5, 17.0], [89.6, 17.0], [89.7, 17.0], [89.8, 17.0], [89.9, 17.0], [90.0, 17.0], [90.1, 17.0], [90.2, 17.0], [90.3, 17.0], [90.4, 17.0], [90.5, 17.0], [90.6, 17.0], [90.7, 17.0], [90.8, 17.0], [90.9, 17.0], [91.0, 17.0], [91.1, 17.0], [91.2, 17.0], [91.3, 17.0], [91.4, 17.0], [91.5, 17.0], [91.6, 17.0], [91.7, 17.0], [91.8, 17.0], [91.9, 17.0], [92.0, 17.0], [92.1, 17.0], [92.2, 18.0], [92.3, 18.0], [92.4, 18.0], [92.5, 18.0], [92.6, 18.0], [92.7, 18.0], [92.8, 18.0], [92.9, 18.0], [93.0, 18.0], [93.1, 18.0], [93.2, 18.0], [93.3, 18.0], [93.4, 19.0], [93.5, 19.0], [93.6, 19.0], [93.7, 19.0], [93.8, 19.0], [93.9, 19.0], [94.0, 20.0], [94.1, 20.0], [94.2, 20.0], [94.3, 22.0], [94.4, 22.0], [94.5, 24.0], [94.6, 25.0], [94.7, 26.0], [94.8, 26.0], [94.9, 27.0], [95.0, 28.0], [95.1, 29.0], [95.2, 30.0], [95.3, 30.0], [95.4, 31.0], [95.5, 33.0], [95.6, 34.0], [95.7, 36.0], [95.8, 37.0], [95.9, 39.0], [96.0, 42.0], [96.1, 45.0], [96.2, 49.0], [96.3, 53.0], [96.4, 56.0], [96.5, 62.0], [96.6, 68.0], [96.7, 71.0], [96.8, 80.0], [96.9, 83.0], [97.0, 87.0], [97.1, 93.0], [97.2, 101.0], [97.3, 104.0], [97.4, 111.0], [97.5, 120.0], [97.6, 129.0], [97.7, 142.0], [97.8, 147.0], [97.9, 161.0], [98.0, 176.0], [98.1, 194.0], [98.2, 205.0], [98.3, 219.0], [98.4, 234.0], [98.5, 279.0], [98.6, 322.0], [98.7, 339.0], [98.8, 385.0], [98.9, 387.0], [99.0, 413.0], [99.1, 451.0], [99.2, 487.0], [99.3, 521.0], [99.4, 597.0], [99.5, 655.0], [99.6, 735.0], [99.7, 813.0], [99.8, 981.0], [99.9, 1152.0], [100.0, 1348.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 3.0, "minX": 0.0, "maxY": 11660.0, "series": [{"data": [[0.0, 11660.0], [600.0, 18.0], [700.0, 14.0], [200.0, 50.0], [800.0, 7.0], [900.0, 10.0], [1000.0, 8.0], [1100.0, 5.0], [300.0, 49.0], [1200.0, 6.0], [1300.0, 3.0], [100.0, 116.0], [400.0, 32.0], [500.0, 22.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 45.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 11864.0, "series": [{"data": [[1.0, 91.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 45.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 11864.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 213.40689886135334, "minX": 1.52524698E12, "maxY": 218.24151320168698, "series": [{"data": [[1.52524698E12, 218.24151320168698], [1.52524704E12, 213.40689886135334]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524704E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 13.0, "minX": 191.0, "maxY": 1264.0, "series": [{"data": [[191.0, 283.6333333333334], [192.0, 273.2916666666667], [193.0, 406.1111111111111], [195.0, 219.66666666666666], [196.0, 341.0], [194.0, 456.0], [198.0, 68.0], [200.0, 74.0], [201.0, 452.0], [202.0, 143.4], [203.0, 43.49999999999999], [205.0, 29.38000000000001], [207.0, 23.745762711864415], [206.0, 16.727272727272734], [204.0, 29.055555555555554], [208.0, 23.94756554307114], [209.0, 19.657754010695175], [211.0, 18.131652661064432], [212.0, 17.40675580577056], [213.0, 16.98274717982749], [214.0, 17.946384039900256], [215.0, 15.850926672038643], [210.0, 20.621233859397414], [216.0, 17.06564551422315], [217.0, 18.833333333333343], [218.0, 16.5855421686747], [219.0, 22.4646840148699], [220.0, 16.25], [221.0, 21.930434782608696], [222.0, 26.4225352112676], [223.0, 25.960000000000008], [224.0, 47.80645161290324], [225.0, 45.970588235294116], [226.0, 19.238095238095237], [227.0, 40.99999999999999], [228.0, 86.42857142857143], [229.0, 70.07692307692308], [230.0, 109.37500000000001], [231.0, 14.5], [232.0, 69.71428571428572], [233.0, 100.0], [234.0, 40.54545454545455], [236.0, 131.55555555555554], [237.0, 60.07692307692307], [238.0, 134.8], [239.0, 64.66666666666666], [235.0, 14.11111111111111], [240.0, 65.75], [241.0, 49.63636363636363], [243.0, 76.69999999999999], [244.0, 68.08333333333331], [245.0, 173.0], [246.0, 94.0], [247.0, 74.75], [242.0, 14.571428571428571], [249.0, 15.2], [250.0, 179.25000000000003], [251.0, 14.25], [252.0, 688.0], [253.0, 13.2], [254.0, 14.0], [255.0, 189.6], [248.0, 13.75], [257.0, 15.100000000000001], [256.0, 483.0], [259.0, 194.49999999999997], [258.0, 44.8], [268.0, 94.08333333333333], [269.0, 15.375], [270.0, 125.18181818181817], [271.0, 98.66666666666667], [260.0, 158.82608695652178], [261.0, 14.0], [262.0, 194.75], [263.0, 184.55555555555554], [264.0, 149.5], [265.0, 14.666666666666666], [266.0, 157.36363636363637], [267.0, 13.6], [275.0, 212.75], [273.0, 13.0], [272.0, 228.0], [279.0, 14.0], [274.0, 137.25], [277.0, 208.8], [276.0, 36.75], [278.0, 228.37500000000003], [280.0, 75.5], [281.0, 15.333333333333334], [286.0, 229.49999999999997], [284.0, 13.8], [285.0, 298.66666666666663], [282.0, 15.0], [283.0, 182.59999999999997], [290.0, 160.6], [292.0, 213.66666666666666], [293.0, 15.0], [295.0, 14.6], [289.0, 14.0], [294.0, 15.166666666666666], [296.0, 238.0], [297.0, 24.0], [298.0, 139.33333333333334], [301.0, 45.0], [300.0, 13.0], [291.0, 20.875], [302.0, 13.0], [303.0, 672.0], [305.0, 36.0], [304.0, 499.0], [306.0, 956.0], [316.0, 347.6666666666667], [318.0, 15.0], [317.0, 14.0], [319.0, 13.0], [308.0, 179.0], [309.0, 15.0], [310.0, 498.0], [311.0, 29.0], [312.0, 14.0], [313.0, 262.75], [315.0, 212.6], [321.0, 14.0], [320.0, 413.5], [322.0, 258.75], [332.0, 14.0], [333.0, 393.0], [334.0, 13.5], [324.0, 360.0], [325.0, 14.0], [327.0, 908.0], [328.0, 14.0], [329.0, 380.0], [330.0, 552.0], [338.0, 1078.0], [337.0, 201.40000000000003], [339.0, 15.0], [341.0, 389.0], [342.0, 16.0], [345.0, 299.0], [347.0, 397.0], [349.0, 246.8], [350.0, 351.0], [365.0, 1264.0], [353.0, 458.6], [354.0, 17.0], [358.0, 1224.0], [360.0, 251.11111111111114], [366.0, 186.85714285714286], [364.0, 13.0], [363.0, 15.0], [361.0, 14.0], [380.0, 672.5], [370.0, 1000.0], [371.0, 14.0], [373.0, 198.0], [374.0, 14.0], [375.0, 587.5], [368.0, 14.0], [376.0, 450.0], [382.0, 237.33333333333334], [381.0, 16.0], [383.0, 15.0], [396.0, 14.0], [386.0, 17.0], [385.0, 13.5], [388.0, 16.0], [389.0, 15.5], [393.0, 15.0], [394.0, 15.0], [395.0, 15.6], [398.0, 16.0], [392.0, 15.0], [400.0, 16.0], [401.0, 15.333333333333334], [402.0, 19.0]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[217.03850000000045, 26.26533333333324]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 402.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 282974.86666666664, "minX": 1.52524698E12, "maxY": 1638521.6166666667, "series": [{"data": [[1.52524698E12, 1638521.6166666667], [1.52524704E12, 545419.4166666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52524698E12, 854241.6333333333], [1.52524704E12, 282974.86666666664]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524704E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 15.066644340254525, "minX": 1.52524698E12, "maxY": 29.975038828489005, "series": [{"data": [[1.52524698E12, 29.975038828489005], [1.52524704E12, 15.066644340254525]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524704E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 15.054922973878133, "minX": 1.52524698E12, "maxY": 29.799977812292102, "series": [{"data": [[1.52524698E12, 29.799977812292102], [1.52524704E12, 15.054922973878133]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524704E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.2582049564634956, "minX": 1.52524698E12, "maxY": 6.028844020412669, "series": [{"data": [[1.52524698E12, 6.028844020412669], [1.52524704E12, 0.2582049564634956]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524704E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 12.0, "minX": 1.52524698E12, "maxY": 1348.0, "series": [{"data": [[1.52524698E12, 1348.0], [1.52524704E12, 85.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52524698E12, 12.0], [1.52524704E12, 12.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52524698E12, 17.0], [1.52524704E12, 17.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52524698E12, 501.8999999999978], [1.52524704E12, 414.4400000000005]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52524698E12, 36.0], [1.52524704E12, 25.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524704E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 15.0, "minX": 49.0, "maxY": 338.0, "series": [{"data": [[150.0, 15.0], [49.0, 15.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[150.0, 338.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 150.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 15.0, "minX": 49.0, "maxY": 338.0, "series": [{"data": [[150.0, 15.0], [49.0, 15.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[150.0, 338.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 150.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 49.7, "minX": 1.52524698E12, "maxY": 150.3, "series": [{"data": [[1.52524698E12, 150.3], [1.52524704E12, 49.7]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524704E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.75, "minX": 1.52524698E12, "maxY": 149.48333333333332, "series": [{"data": [[1.52524698E12, 149.48333333333332], [1.52524704E12, 49.766666666666666]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52524698E12, 0.75]], "isOverall": false, "label": "502", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524704E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.75, "minX": 1.52524698E12, "maxY": 149.48333333333332, "series": [{"data": [[1.52524698E12, 149.48333333333332], [1.52524704E12, 49.766666666666666]], "isOverall": false, "label": "inference-success", "isController": false}, {"data": [[1.52524698E12, 0.75]], "isOverall": false, "label": "inference-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52524704E12, "title": "Transactions Per Second"}},
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
