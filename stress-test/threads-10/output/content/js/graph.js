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
        data: {"result": {"minY": 108.0, "minX": 0.0, "maxY": 30012.0, "series": [{"data": [[0.0, 108.0], [0.1, 108.0], [0.2, 110.0], [0.3, 110.0], [0.4, 423.0], [0.5, 468.0], [0.6, 468.0], [0.7, 568.0], [0.8, 568.0], [0.9, 893.0], [1.0, 904.0], [1.1, 904.0], [1.2, 1043.0], [1.3, 1043.0], [1.4, 1144.0], [1.5, 1151.0], [1.6, 1151.0], [1.7, 1161.0], [1.8, 1161.0], [1.9, 1274.0], [2.0, 1395.0], [2.1, 1395.0], [2.2, 1515.0], [2.3, 1515.0], [2.4, 1631.0], [2.5, 1750.0], [2.6, 1750.0], [2.7, 1906.0], [2.8, 1906.0], [2.9, 2047.0], [3.0, 2180.0], [3.1, 2180.0], [3.2, 2306.0], [3.3, 2306.0], [3.4, 2457.0], [3.5, 2582.0], [3.6, 2582.0], [3.7, 2699.0], [3.8, 2699.0], [3.9, 2813.0], [4.0, 2925.0], [4.1, 2925.0], [4.2, 3033.0], [4.3, 3033.0], [4.4, 3153.0], [4.5, 3269.0], [4.6, 3269.0], [4.7, 3375.0], [4.8, 3375.0], [4.9, 3483.0], [5.0, 3602.0], [5.1, 3602.0], [5.2, 3733.0], [5.3, 3733.0], [5.4, 3838.0], [5.5, 3838.0], [5.6, 3952.0], [5.7, 4123.0], [5.8, 4123.0], [5.9, 4341.0], [6.0, 4341.0], [6.1, 4461.0], [6.2, 4583.0], [6.3, 4583.0], [6.4, 4702.0], [6.5, 4702.0], [6.6, 4820.0], [6.7, 4939.0], [6.8, 4939.0], [6.9, 5059.0], [7.0, 5059.0], [7.1, 5172.0], [7.2, 5317.0], [7.3, 5317.0], [7.4, 5455.0], [7.5, 5455.0], [7.6, 5570.0], [7.7, 5685.0], [7.8, 5685.0], [7.9, 5809.0], [8.0, 5809.0], [8.1, 5951.0], [8.2, 6067.0], [8.3, 6067.0], [8.4, 6182.0], [8.5, 6182.0], [8.6, 6303.0], [8.7, 6446.0], [8.8, 6446.0], [8.9, 6584.0], [9.0, 6584.0], [9.1, 6692.0], [9.2, 6840.0], [9.3, 6840.0], [9.4, 6964.0], [9.5, 7099.0], [9.6, 7099.0], [9.7, 7252.0], [9.8, 7252.0], [9.9, 7376.0], [10.0, 7495.0], [10.1, 7495.0], [10.2, 7610.0], [10.3, 7610.0], [10.4, 7719.0], [10.5, 7840.0], [10.6, 7840.0], [10.7, 7973.0], [10.8, 7973.0], [10.9, 8098.0], [11.0, 8214.0], [11.1, 8214.0], [11.2, 8329.0], [11.3, 8329.0], [11.4, 8461.0], [11.5, 8580.0], [11.6, 8580.0], [11.7, 8703.0], [11.8, 8703.0], [11.9, 8825.0], [12.0, 8955.0], [12.1, 8955.0], [12.2, 9087.0], [12.3, 9087.0], [12.4, 9201.0], [12.5, 9326.0], [12.6, 9326.0], [12.7, 9460.0], [12.8, 9460.0], [12.9, 9587.0], [13.0, 9701.0], [13.1, 9701.0], [13.2, 9829.0], [13.3, 9829.0], [13.4, 9953.0], [13.5, 10076.0], [13.6, 10076.0], [13.7, 10199.0], [13.8, 10199.0], [13.9, 10320.0], [14.0, 10452.0], [14.1, 10452.0], [14.2, 10573.0], [14.3, 10573.0], [14.4, 10689.0], [14.5, 10814.0], [14.6, 10814.0], [14.7, 10937.0], [14.8, 10937.0], [14.9, 11072.0], [15.0, 11183.0], [15.1, 11183.0], [15.2, 11312.0], [15.3, 11312.0], [15.4, 11442.0], [15.5, 11593.0], [15.6, 11593.0], [15.7, 11705.0], [15.8, 11705.0], [15.9, 11830.0], [16.0, 12049.0], [16.1, 12049.0], [16.2, 12211.0], [16.3, 12211.0], [16.4, 12362.0], [16.5, 12517.0], [16.6, 12517.0], [16.7, 12648.0], [16.8, 12648.0], [16.9, 12776.0], [17.0, 12916.0], [17.1, 12916.0], [17.2, 13042.0], [17.3, 13042.0], [17.4, 13178.0], [17.5, 13295.0], [17.6, 13295.0], [17.7, 13420.0], [17.8, 13420.0], [17.9, 13549.0], [18.0, 13679.0], [18.1, 13679.0], [18.2, 13800.0], [18.3, 13800.0], [18.4, 13933.0], [18.5, 14059.0], [18.6, 14059.0], [18.7, 14186.0], [18.8, 14186.0], [18.9, 14321.0], [19.0, 14435.0], [19.1, 14435.0], [19.2, 14574.0], [19.3, 14574.0], [19.4, 14741.0], [19.5, 14878.0], [19.6, 14878.0], [19.7, 15020.0], [19.8, 15020.0], [19.9, 15142.0], [20.0, 15142.0], [20.1, 15273.0], [20.2, 15409.0], [20.3, 15409.0], [20.4, 15539.0], [20.5, 15539.0], [20.6, 15654.0], [20.7, 15783.0], [20.8, 15783.0], [20.9, 15926.0], [21.0, 15926.0], [21.1, 16056.0], [21.2, 16175.0], [21.3, 16175.0], [21.4, 16305.0], [21.5, 16305.0], [21.6, 16434.0], [21.7, 16569.0], [21.8, 16569.0], [21.9, 16690.0], [22.0, 16690.0], [22.1, 16802.0], [22.2, 16935.0], [22.3, 16935.0], [22.4, 17072.0], [22.5, 17072.0], [22.6, 17190.0], [22.7, 17303.0], [22.8, 17303.0], [22.9, 17428.0], [23.0, 17428.0], [23.1, 17552.0], [23.2, 17671.0], [23.3, 17671.0], [23.4, 17796.0], [23.5, 17796.0], [23.6, 17930.0], [23.7, 18076.0], [23.8, 18076.0], [23.9, 18208.0], [24.0, 18208.0], [24.1, 18323.0], [24.2, 18441.0], [24.3, 18441.0], [24.4, 18565.0], [24.5, 18565.0], [24.6, 18685.0], [24.7, 18800.0], [24.8, 18800.0], [24.9, 18922.0], [25.0, 18922.0], [25.1, 19038.0], [25.2, 19156.0], [25.3, 19156.0], [25.4, 19281.0], [25.5, 19281.0], [25.6, 19411.0], [25.7, 19531.0], [25.8, 19531.0], [25.9, 19643.0], [26.0, 19643.0], [26.1, 19768.0], [26.2, 19891.0], [26.3, 19891.0], [26.4, 20014.0], [26.5, 20014.0], [26.6, 20123.0], [26.7, 20252.0], [26.8, 20252.0], [26.9, 20403.0], [27.0, 20403.0], [27.1, 20529.0], [27.2, 20642.0], [27.3, 20642.0], [27.4, 20768.0], [27.5, 20768.0], [27.6, 20901.0], [27.7, 21072.0], [27.8, 21072.0], [27.9, 21196.0], [28.0, 21196.0], [28.1, 21309.0], [28.2, 21431.0], [28.3, 21431.0], [28.4, 21563.0], [28.5, 21563.0], [28.6, 21689.0], [28.7, 21871.0], [28.8, 21871.0], [28.9, 22026.0], [29.0, 22026.0], [29.1, 22179.0], [29.2, 22306.0], [29.3, 22306.0], [29.4, 22444.0], [29.5, 22444.0], [29.6, 22623.0], [29.7, 22758.0], [29.8, 22758.0], [29.9, 22938.0], [30.0, 22938.0], [30.1, 23326.0], [30.2, 23567.0], [30.3, 23567.0], [30.4, 23729.0], [30.5, 23729.0], [30.6, 23913.0], [30.7, 24106.0], [30.8, 24106.0], [30.9, 24278.0], [31.0, 24278.0], [31.1, 24411.0], [31.2, 24531.0], [31.3, 24531.0], [31.4, 24661.0], [31.5, 24661.0], [31.6, 24791.0], [31.7, 24927.0], [31.8, 24927.0], [31.9, 25039.0], [32.0, 25039.0], [32.1, 25208.0], [32.2, 25330.0], [32.3, 25330.0], [32.4, 25459.0], [32.5, 25459.0], [32.6, 25586.0], [32.7, 25701.0], [32.8, 25701.0], [32.9, 25852.0], [33.0, 25852.0], [33.1, 26055.0], [33.2, 26273.0], [33.3, 26273.0], [33.4, 26470.0], [33.5, 26470.0], [33.6, 26605.0], [33.7, 26630.0], [33.8, 26630.0], [33.9, 26639.0], [34.0, 26639.0], [34.1, 26652.0], [34.2, 26671.0], [34.3, 26671.0], [34.4, 26734.0], [34.5, 26734.0], [34.6, 26741.0], [34.7, 26743.0], [34.8, 26743.0], [34.9, 26744.0], [35.0, 26744.0], [35.1, 26748.0], [35.2, 26754.0], [35.3, 26754.0], [35.4, 26761.0], [35.5, 26761.0], [35.6, 26763.0], [35.7, 26767.0], [35.8, 26767.0], [35.9, 26780.0], [36.0, 26780.0], [36.1, 26794.0], [36.2, 26803.0], [36.3, 26803.0], [36.4, 26813.0], [36.5, 26813.0], [36.6, 26822.0], [36.7, 26832.0], [36.8, 26832.0], [36.9, 26849.0], [37.0, 26849.0], [37.1, 26857.0], [37.2, 26877.0], [37.3, 26877.0], [37.4, 26884.0], [37.5, 26884.0], [37.6, 26900.0], [37.7, 26902.0], [37.8, 26902.0], [37.9, 26916.0], [38.0, 26925.0], [38.1, 26925.0], [38.2, 26930.0], [38.3, 26930.0], [38.4, 26932.0], [38.5, 26935.0], [38.6, 26935.0], [38.7, 26935.0], [38.8, 26935.0], [38.9, 26937.0], [39.0, 26939.0], [39.1, 26939.0], [39.2, 26940.0], [39.3, 26940.0], [39.4, 26945.0], [39.5, 26952.0], [39.6, 26952.0], [39.7, 26960.0], [39.8, 26960.0], [39.9, 26960.0], [40.0, 26963.0], [40.1, 26963.0], [40.2, 26963.0], [40.3, 26963.0], [40.4, 26969.0], [40.5, 26973.0], [40.6, 26973.0], [40.7, 26978.0], [40.8, 26978.0], [40.9, 26986.0], [41.0, 26999.0], [41.1, 26999.0], [41.2, 27003.0], [41.3, 27003.0], [41.4, 27003.0], [41.5, 27003.0], [41.6, 27003.0], [41.7, 27004.0], [41.8, 27004.0], [41.9, 27022.0], [42.0, 27029.0], [42.1, 27029.0], [42.2, 27030.0], [42.3, 27030.0], [42.4, 27034.0], [42.5, 27034.0], [42.6, 27034.0], [42.7, 27034.0], [42.8, 27034.0], [42.9, 27036.0], [43.0, 27037.0], [43.1, 27037.0], [43.2, 27042.0], [43.3, 27042.0], [43.4, 27043.0], [43.5, 27044.0], [43.6, 27044.0], [43.7, 27051.0], [43.8, 27051.0], [43.9, 27052.0], [44.0, 27056.0], [44.1, 27056.0], [44.2, 27064.0], [44.3, 27064.0], [44.4, 27065.0], [44.5, 27072.0], [44.6, 27072.0], [44.7, 27075.0], [44.8, 27075.0], [44.9, 27076.0], [45.0, 27076.0], [45.1, 27076.0], [45.2, 27080.0], [45.3, 27080.0], [45.4, 27083.0], [45.5, 27087.0], [45.6, 27087.0], [45.7, 27095.0], [45.8, 27095.0], [45.9, 27096.0], [46.0, 27096.0], [46.1, 27096.0], [46.2, 27097.0], [46.3, 27097.0], [46.4, 27098.0], [46.5, 27099.0], [46.6, 27099.0], [46.7, 27101.0], [46.8, 27101.0], [46.9, 27105.0], [47.0, 27109.0], [47.1, 27109.0], [47.2, 27113.0], [47.3, 27113.0], [47.4, 27114.0], [47.5, 27117.0], [47.6, 27117.0], [47.7, 27117.0], [47.8, 27117.0], [47.9, 27120.0], [48.0, 27120.0], [48.1, 27120.0], [48.2, 27125.0], [48.3, 27125.0], [48.4, 27126.0], [48.5, 27128.0], [48.6, 27128.0], [48.7, 27129.0], [48.8, 27129.0], [48.9, 27132.0], [49.0, 27135.0], [49.1, 27135.0], [49.2, 27137.0], [49.3, 27137.0], [49.4, 27141.0], [49.5, 27144.0], [49.6, 27144.0], [49.7, 27144.0], [49.8, 27144.0], [49.9, 27145.0], [50.0, 27147.0], [50.1, 27147.0], [50.2, 27147.0], [50.3, 27147.0], [50.4, 27148.0], [50.5, 27149.0], [50.6, 27149.0], [50.7, 27154.0], [50.8, 27154.0], [50.9, 27156.0], [51.0, 27156.0], [51.1, 27156.0], [51.2, 27160.0], [51.3, 27160.0], [51.4, 27163.0], [51.5, 27165.0], [51.6, 27165.0], [51.7, 27167.0], [51.8, 27167.0], [51.9, 27168.0], [52.0, 27168.0], [52.1, 27168.0], [52.2, 27169.0], [52.3, 27169.0], [52.4, 27171.0], [52.5, 27171.0], [52.6, 27171.0], [52.7, 27174.0], [52.8, 27174.0], [52.9, 27174.0], [53.0, 27177.0], [53.1, 27177.0], [53.2, 27181.0], [53.3, 27181.0], [53.4, 27183.0], [53.5, 27184.0], [53.6, 27184.0], [53.7, 27185.0], [53.8, 27185.0], [53.9, 27187.0], [54.0, 27189.0], [54.1, 27189.0], [54.2, 27190.0], [54.3, 27190.0], [54.4, 27192.0], [54.5, 27195.0], [54.6, 27195.0], [54.7, 27199.0], [54.8, 27199.0], [54.9, 27200.0], [55.0, 27201.0], [55.1, 27201.0], [55.2, 27201.0], [55.3, 27201.0], [55.4, 27202.0], [55.5, 27203.0], [55.6, 27203.0], [55.7, 27204.0], [55.8, 27204.0], [55.9, 27205.0], [56.0, 27206.0], [56.1, 27206.0], [56.2, 27208.0], [56.3, 27208.0], [56.4, 27209.0], [56.5, 27213.0], [56.6, 27213.0], [56.7, 27216.0], [56.8, 27216.0], [56.9, 27216.0], [57.0, 27220.0], [57.1, 27220.0], [57.2, 27222.0], [57.3, 27222.0], [57.4, 27223.0], [57.5, 27224.0], [57.6, 27224.0], [57.7, 27224.0], [57.8, 27224.0], [57.9, 27312.0], [58.0, 27456.0], [58.1, 27456.0], [58.2, 27596.0], [58.3, 27596.0], [58.4, 27723.0], [58.5, 27860.0], [58.6, 27860.0], [58.7, 27992.0], [58.8, 27992.0], [58.9, 28149.0], [59.0, 28286.0], [59.1, 28286.0], [59.2, 28404.0], [59.3, 28404.0], [59.4, 28555.0], [59.5, 28702.0], [59.6, 28702.0], [59.7, 28844.0], [59.8, 28844.0], [59.9, 28984.0], [60.0, 29100.0], [60.1, 29100.0], [60.2, 29243.0], [60.3, 29243.0], [60.4, 29442.0], [60.5, 29644.0], [60.6, 29644.0], [60.7, 29805.0], [60.8, 29805.0], [60.9, 29940.0], [61.0, 30001.0], [61.1, 30001.0], [61.2, 30002.0], [61.3, 30002.0], [61.4, 30002.0], [61.5, 30002.0], [61.6, 30002.0], [61.7, 30002.0], [61.8, 30002.0], [61.9, 30002.0], [62.0, 30002.0], [62.1, 30002.0], [62.2, 30002.0], [62.3, 30002.0], [62.4, 30002.0], [62.5, 30002.0], [62.6, 30002.0], [62.7, 30002.0], [62.8, 30002.0], [62.9, 30002.0], [63.0, 30002.0], [63.1, 30002.0], [63.2, 30003.0], [63.3, 30003.0], [63.4, 30003.0], [63.5, 30003.0], [63.6, 30003.0], [63.7, 30003.0], [63.8, 30003.0], [63.9, 30003.0], [64.0, 30003.0], [64.1, 30003.0], [64.2, 30003.0], [64.3, 30003.0], [64.4, 30003.0], [64.5, 30003.0], [64.6, 30003.0], [64.7, 30003.0], [64.8, 30003.0], [64.9, 30003.0], [65.0, 30003.0], [65.1, 30003.0], [65.2, 30003.0], [65.3, 30003.0], [65.4, 30003.0], [65.5, 30003.0], [65.6, 30003.0], [65.7, 30003.0], [65.8, 30003.0], [65.9, 30003.0], [66.0, 30003.0], [66.1, 30003.0], [66.2, 30003.0], [66.3, 30003.0], [66.4, 30003.0], [66.5, 30003.0], [66.6, 30003.0], [66.7, 30003.0], [66.8, 30003.0], [66.9, 30003.0], [67.0, 30003.0], [67.1, 30003.0], [67.2, 30003.0], [67.3, 30003.0], [67.4, 30003.0], [67.5, 30003.0], [67.6, 30003.0], [67.7, 30003.0], [67.8, 30003.0], [67.9, 30003.0], [68.0, 30003.0], [68.1, 30003.0], [68.2, 30004.0], [68.3, 30004.0], [68.4, 30004.0], [68.5, 30004.0], [68.6, 30004.0], [68.7, 30004.0], [68.8, 30004.0], [68.9, 30004.0], [69.0, 30004.0], [69.1, 30004.0], [69.2, 30004.0], [69.3, 30004.0], [69.4, 30004.0], [69.5, 30004.0], [69.6, 30004.0], [69.7, 30004.0], [69.8, 30004.0], [69.9, 30004.0], [70.0, 30004.0], [70.1, 30004.0], [70.2, 30004.0], [70.3, 30004.0], [70.4, 30004.0], [70.5, 30004.0], [70.6, 30004.0], [70.7, 30004.0], [70.8, 30004.0], [70.9, 30004.0], [71.0, 30004.0], [71.1, 30004.0], [71.2, 30004.0], [71.3, 30004.0], [71.4, 30004.0], [71.5, 30004.0], [71.6, 30004.0], [71.7, 30004.0], [71.8, 30004.0], [71.9, 30004.0], [72.0, 30004.0], [72.1, 30004.0], [72.2, 30004.0], [72.3, 30004.0], [72.4, 30004.0], [72.5, 30004.0], [72.6, 30004.0], [72.7, 30004.0], [72.8, 30004.0], [72.9, 30004.0], [73.0, 30004.0], [73.1, 30004.0], [73.2, 30004.0], [73.3, 30004.0], [73.4, 30004.0], [73.5, 30004.0], [73.6, 30004.0], [73.7, 30004.0], [73.8, 30004.0], [73.9, 30004.0], [74.0, 30004.0], [74.1, 30004.0], [74.2, 30004.0], [74.3, 30004.0], [74.4, 30004.0], [74.5, 30004.0], [74.6, 30004.0], [74.7, 30004.0], [74.8, 30004.0], [74.9, 30005.0], [75.0, 30005.0], [75.1, 30005.0], [75.2, 30005.0], [75.3, 30005.0], [75.4, 30005.0], [75.5, 30005.0], [75.6, 30005.0], [75.7, 30005.0], [75.8, 30005.0], [75.9, 30005.0], [76.0, 30005.0], [76.1, 30005.0], [76.2, 30005.0], [76.3, 30005.0], [76.4, 30005.0], [76.5, 30005.0], [76.6, 30005.0], [76.7, 30005.0], [76.8, 30005.0], [76.9, 30005.0], [77.0, 30005.0], [77.1, 30005.0], [77.2, 30005.0], [77.3, 30005.0], [77.4, 30005.0], [77.5, 30005.0], [77.6, 30005.0], [77.7, 30005.0], [77.8, 30005.0], [77.9, 30005.0], [78.0, 30005.0], [78.1, 30005.0], [78.2, 30005.0], [78.3, 30005.0], [78.4, 30005.0], [78.5, 30005.0], [78.6, 30005.0], [78.7, 30005.0], [78.8, 30005.0], [78.9, 30005.0], [79.0, 30005.0], [79.1, 30005.0], [79.2, 30005.0], [79.3, 30005.0], [79.4, 30005.0], [79.5, 30005.0], [79.6, 30005.0], [79.7, 30005.0], [79.8, 30005.0], [79.9, 30005.0], [80.0, 30005.0], [80.1, 30005.0], [80.2, 30005.0], [80.3, 30005.0], [80.4, 30005.0], [80.5, 30005.0], [80.6, 30005.0], [80.7, 30005.0], [80.8, 30005.0], [80.9, 30005.0], [81.0, 30005.0], [81.1, 30005.0], [81.2, 30005.0], [81.3, 30005.0], [81.4, 30005.0], [81.5, 30005.0], [81.6, 30005.0], [81.7, 30005.0], [81.8, 30005.0], [81.9, 30005.0], [82.0, 30005.0], [82.1, 30005.0], [82.2, 30005.0], [82.3, 30005.0], [82.4, 30005.0], [82.5, 30005.0], [82.6, 30005.0], [82.7, 30005.0], [82.8, 30005.0], [82.9, 30005.0], [83.0, 30005.0], [83.1, 30005.0], [83.2, 30005.0], [83.3, 30005.0], [83.4, 30005.0], [83.5, 30005.0], [83.6, 30005.0], [83.7, 30005.0], [83.8, 30005.0], [83.9, 30005.0], [84.0, 30005.0], [84.1, 30005.0], [84.2, 30005.0], [84.3, 30005.0], [84.4, 30005.0], [84.5, 30005.0], [84.6, 30005.0], [84.7, 30005.0], [84.8, 30005.0], [84.9, 30005.0], [85.0, 30006.0], [85.1, 30006.0], [85.2, 30006.0], [85.3, 30006.0], [85.4, 30006.0], [85.5, 30006.0], [85.6, 30006.0], [85.7, 30006.0], [85.8, 30006.0], [85.9, 30006.0], [86.0, 30006.0], [86.1, 30006.0], [86.2, 30006.0], [86.3, 30006.0], [86.4, 30006.0], [86.5, 30006.0], [86.6, 30006.0], [86.7, 30006.0], [86.8, 30006.0], [86.9, 30006.0], [87.0, 30006.0], [87.1, 30006.0], [87.2, 30006.0], [87.3, 30006.0], [87.4, 30006.0], [87.5, 30006.0], [87.6, 30006.0], [87.7, 30006.0], [87.8, 30006.0], [87.9, 30006.0], [88.0, 30006.0], [88.1, 30006.0], [88.2, 30006.0], [88.3, 30006.0], [88.4, 30006.0], [88.5, 30006.0], [88.6, 30006.0], [88.7, 30006.0], [88.8, 30006.0], [88.9, 30006.0], [89.0, 30006.0], [89.1, 30006.0], [89.2, 30006.0], [89.3, 30006.0], [89.4, 30006.0], [89.5, 30006.0], [89.6, 30006.0], [89.7, 30006.0], [89.8, 30006.0], [89.9, 30006.0], [90.0, 30006.0], [90.1, 30006.0], [90.2, 30006.0], [90.3, 30006.0], [90.4, 30006.0], [90.5, 30006.0], [90.6, 30006.0], [90.7, 30006.0], [90.8, 30006.0], [90.9, 30006.0], [91.0, 30006.0], [91.1, 30006.0], [91.2, 30006.0], [91.3, 30006.0], [91.4, 30006.0], [91.5, 30006.0], [91.6, 30006.0], [91.7, 30006.0], [91.8, 30006.0], [91.9, 30006.0], [92.0, 30006.0], [92.1, 30006.0], [92.2, 30006.0], [92.3, 30006.0], [92.4, 30006.0], [92.5, 30006.0], [92.6, 30006.0], [92.7, 30006.0], [92.8, 30006.0], [92.9, 30006.0], [93.0, 30006.0], [93.1, 30006.0], [93.2, 30006.0], [93.3, 30006.0], [93.4, 30006.0], [93.5, 30006.0], [93.6, 30006.0], [93.7, 30006.0], [93.8, 30006.0], [93.9, 30006.0], [94.0, 30007.0], [94.1, 30007.0], [94.2, 30007.0], [94.3, 30007.0], [94.4, 30007.0], [94.5, 30007.0], [94.6, 30007.0], [94.7, 30007.0], [94.8, 30007.0], [94.9, 30007.0], [95.0, 30007.0], [95.1, 30007.0], [95.2, 30007.0], [95.3, 30007.0], [95.4, 30007.0], [95.5, 30007.0], [95.6, 30007.0], [95.7, 30007.0], [95.8, 30007.0], [95.9, 30007.0], [96.0, 30007.0], [96.1, 30007.0], [96.2, 30007.0], [96.3, 30007.0], [96.4, 30007.0], [96.5, 30007.0], [96.6, 30007.0], [96.7, 30007.0], [96.8, 30007.0], [96.9, 30007.0], [97.0, 30007.0], [97.1, 30007.0], [97.2, 30007.0], [97.3, 30007.0], [97.4, 30007.0], [97.5, 30007.0], [97.6, 30007.0], [97.7, 30007.0], [97.8, 30007.0], [97.9, 30007.0], [98.0, 30007.0], [98.1, 30007.0], [98.2, 30007.0], [98.3, 30007.0], [98.4, 30007.0], [98.5, 30007.0], [98.6, 30007.0], [98.7, 30007.0], [98.8, 30007.0], [98.9, 30007.0], [99.0, 30008.0], [99.1, 30008.0], [99.2, 30008.0], [99.3, 30008.0], [99.4, 30008.0], [99.5, 30008.0], [99.6, 30008.0], [99.7, 30010.0], [99.8, 30010.0], [99.9, 30012.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 234.0, "series": [{"data": [[100.0, 2.0], [400.0, 2.0], [500.0, 1.0], [800.0, 1.0], [900.0, 1.0], [1000.0, 1.0], [1100.0, 3.0], [1200.0, 1.0], [1300.0, 1.0], [1500.0, 1.0], [1600.0, 1.0], [1700.0, 1.0], [1900.0, 1.0], [2000.0, 1.0], [2100.0, 1.0], [2300.0, 1.0], [2400.0, 1.0], [2500.0, 1.0], [2600.0, 1.0], [2800.0, 1.0], [2900.0, 1.0], [3000.0, 1.0], [3100.0, 1.0], [3200.0, 1.0], [3300.0, 1.0], [3400.0, 1.0], [3600.0, 1.0], [3700.0, 1.0], [3800.0, 1.0], [3900.0, 1.0], [4100.0, 1.0], [4300.0, 1.0], [4400.0, 1.0], [4500.0, 1.0], [4700.0, 1.0], [4800.0, 1.0], [4900.0, 1.0], [5000.0, 1.0], [5100.0, 1.0], [5300.0, 1.0], [5400.0, 1.0], [5500.0, 1.0], [5600.0, 1.0], [5800.0, 1.0], [5900.0, 1.0], [6000.0, 1.0], [6100.0, 1.0], [6300.0, 1.0], [6400.0, 1.0], [6500.0, 1.0], [6600.0, 1.0], [6800.0, 1.0], [6900.0, 1.0], [7000.0, 1.0], [7200.0, 1.0], [7300.0, 1.0], [7400.0, 1.0], [7600.0, 1.0], [7700.0, 1.0], [7800.0, 1.0], [7900.0, 1.0], [8000.0, 1.0], [8200.0, 1.0], [8300.0, 1.0], [8400.0, 1.0], [8500.0, 1.0], [8700.0, 1.0], [8800.0, 1.0], [8900.0, 1.0], [9000.0, 1.0], [9200.0, 1.0], [9300.0, 1.0], [9400.0, 1.0], [9500.0, 1.0], [9700.0, 1.0], [9800.0, 1.0], [9900.0, 1.0], [10000.0, 1.0], [10100.0, 1.0], [10300.0, 1.0], [10400.0, 1.0], [10500.0, 1.0], [10600.0, 1.0], [10800.0, 1.0], [10900.0, 1.0], [11000.0, 1.0], [11100.0, 1.0], [11300.0, 1.0], [11400.0, 1.0], [11500.0, 1.0], [11700.0, 1.0], [11800.0, 1.0], [12000.0, 1.0], [12200.0, 1.0], [12300.0, 1.0], [12500.0, 1.0], [12600.0, 1.0], [12700.0, 1.0], [12900.0, 1.0], [13000.0, 1.0], [13100.0, 1.0], [13200.0, 1.0], [13400.0, 1.0], [13500.0, 1.0], [13600.0, 1.0], [13800.0, 1.0], [13900.0, 1.0], [14000.0, 1.0], [14100.0, 1.0], [14300.0, 1.0], [14400.0, 1.0], [14500.0, 1.0], [14700.0, 1.0], [14800.0, 1.0], [15000.0, 1.0], [15100.0, 1.0], [15200.0, 1.0], [15400.0, 1.0], [15500.0, 1.0], [15600.0, 1.0], [15700.0, 1.0], [15900.0, 1.0], [16000.0, 1.0], [16100.0, 1.0], [16300.0, 1.0], [16400.0, 1.0], [16600.0, 1.0], [16800.0, 1.0], [17000.0, 1.0], [17400.0, 1.0], [17600.0, 1.0], [18000.0, 1.0], [18200.0, 1.0], [18400.0, 1.0], [18600.0, 1.0], [18800.0, 1.0], [19000.0, 1.0], [19200.0, 1.0], [19400.0, 1.0], [19600.0, 1.0], [19800.0, 1.0], [20000.0, 1.0], [20200.0, 1.0], [20400.0, 1.0], [20600.0, 1.0], [21000.0, 1.0], [21400.0, 1.0], [21600.0, 1.0], [21800.0, 1.0], [22000.0, 1.0], [22400.0, 1.0], [22600.0, 1.0], [24200.0, 1.0], [24400.0, 1.0], [24600.0, 1.0], [25000.0, 1.0], [25200.0, 1.0], [25400.0, 1.0], [25800.0, 1.0], [26000.0, 1.0], [26200.0, 1.0], [26400.0, 1.0], [26600.0, 5.0], [27000.0, 33.0], [27400.0, 1.0], [27200.0, 18.0], [26800.0, 8.0], [27800.0, 1.0], [28200.0, 1.0], [28400.0, 1.0], [28800.0, 1.0], [29200.0, 1.0], [29400.0, 1.0], [29600.0, 1.0], [29800.0, 1.0], [30000.0, 234.0], [16500.0, 1.0], [16900.0, 1.0], [17100.0, 1.0], [17300.0, 1.0], [17500.0, 1.0], [17700.0, 1.0], [17900.0, 1.0], [18300.0, 1.0], [18500.0, 1.0], [18900.0, 1.0], [19100.0, 1.0], [19500.0, 1.0], [19700.0, 1.0], [20100.0, 1.0], [21300.0, 1.0], [20500.0, 1.0], [20700.0, 1.0], [20900.0, 1.0], [21100.0, 1.0], [21500.0, 1.0], [22100.0, 1.0], [22300.0, 1.0], [22700.0, 1.0], [22900.0, 1.0], [23300.0, 1.0], [23500.0, 1.0], [23700.0, 1.0], [23900.0, 1.0], [24100.0, 1.0], [24500.0, 1.0], [24700.0, 1.0], [24900.0, 1.0], [25300.0, 1.0], [25500.0, 1.0], [25700.0, 1.0], [26700.0, 11.0], [26900.0, 22.0], [27100.0, 49.0], [27300.0, 1.0], [27500.0, 1.0], [27700.0, 1.0], [27900.0, 1.0], [28100.0, 1.0], [28500.0, 1.0], [28700.0, 1.0], [28900.0, 1.0], [29100.0, 1.0], [29900.0, 1.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 30000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 4.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 353.0, "series": [{"data": [[1.0, 9.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 234.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 4.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 353.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 45.0, "minX": 1.52637198E12, "maxY": 216.83962264150944, "series": [{"data": [[1.5263721E12, 45.0], [1.52637198E12, 63.20689655172412], [1.52637204E12, 216.83962264150944]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5263721E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 12446.333333333334, "minX": 1.0, "maxY": 30008.0, "series": [{"data": [[2.0, 30008.0], [3.0, 30005.0], [4.0, 30007.0], [5.0, 30008.0], [6.0, 15236.5], [7.0, 30004.0], [8.0, 15285.0], [9.0, 30003.0], [10.0, 15450.0], [11.0, 30004.0], [12.0, 15453.5], [13.0, 30006.0], [14.0, 30006.0], [15.0, 15523.5], [16.0, 15583.5], [17.0, 15639.0], [18.0, 15701.0], [19.0, 15760.0], [20.0, 15819.0], [21.0, 30007.0], [22.0, 15876.5], [23.0, 15955.0], [24.0, 30006.0], [25.0, 16026.5], [26.0, 16092.5], [27.0, 16156.0], [28.0, 30005.0], [29.0, 16231.0], [30.0, 16294.5], [31.0, 16352.5], [32.0, 16409.0], [33.0, 16464.5], [34.0, 16520.0], [35.0, 30002.0], [36.0, 16579.5], [37.0, 16637.5], [38.0, 16691.0], [39.0, 30004.0], [40.0, 16743.5], [41.0, 12446.333333333334], [42.0, 16922.0], [43.0, 30006.0], [44.0, 16979.0], [45.0, 17064.0], [47.0, 17173.5], [46.0, 30003.0], [49.0, 17232.0], [48.0, 30005.0], [50.0, 17293.0], [51.0, 17354.0], [52.0, 17411.5], [53.0, 17471.0], [54.0, 17532.5], [55.0, 30003.0], [56.0, 17588.0], [57.0, 17661.5], [58.0, 17728.5], [59.0, 30005.0], [60.0, 17786.5], [61.0, 17845.0], [62.0, 17905.5], [63.0, 17978.0], [65.0, 18035.0], [66.0, 18094.5], [67.0, 18154.0], [64.0, 30004.0], [68.0, 18226.0], [70.0, 18295.0], [71.0, 18348.5], [69.0, 30003.0], [72.0, 18423.0], [73.0, 18484.0], [75.0, 18552.0], [74.0, 30004.0], [76.0, 18628.5], [77.0, 18691.0], [79.0, 18750.0], [78.0, 30005.0], [80.0, 18807.5], [81.0, 18863.0], [82.0, 18923.0], [83.0, 18991.5], [85.0, 19052.5], [86.0, 19110.5], [87.0, 19168.0], [84.0, 30005.0], [88.0, 19233.5], [90.0, 17605.0], [91.0, 19355.0], [89.0, 30007.0], [92.0, 17732.0], [93.0, 19479.5], [95.0, 19546.0], [94.0, 30006.0], [96.0, 17926.5], [97.0, 19665.0], [98.0, 19733.0], [99.0, 30002.0], [100.0, 18129.0], [101.0, 19853.0], [102.0, 19917.5], [103.0, 19980.0], [105.0, 20039.0], [106.0, 20100.5], [107.0, 20161.5], [104.0, 30005.0], [108.0, 20228.5], [110.0, 20289.0], [111.0, 18716.0], [109.0, 26741.0], [112.0, 20407.5], [113.0, 18840.5], [115.0, 18910.0], [114.0, 30004.0], [116.0, 20593.0], [117.0, 19033.0], [118.0, 20724.0], [119.0, 26761.0], [120.0, 20800.5], [121.0, 19234.0], [122.0, 20917.5], [123.0, 30007.0], [124.0, 19408.0], [126.0, 21107.0], [127.0, 21182.5], [125.0, 26780.0], [128.0, 19655.5], [130.0, 21327.0], [132.0, 21391.5], [133.0, 19864.5], [134.0, 19932.0], [135.0, 26832.0], [131.0, 26803.0], [129.0, 30005.0], [136.0, 21592.0], [137.0, 21649.5], [138.0, 20134.5], [139.0, 20203.0], [141.0, 20278.0], [142.0, 21902.5], [143.0, 20408.5], [140.0, 30003.0], [145.0, 22031.0], [146.0, 20543.0], [147.0, 22162.0], [148.0, 20668.5], [150.0, 20749.5], [151.0, 20835.5], [149.0, 30005.0], [144.0, 30006.0], [153.0, 20905.0], [154.0, 22511.5], [155.0, 21038.5], [157.0, 21104.0], [158.0, 21174.0], [159.0, 22772.0], [156.0, 30005.0], [152.0, 30003.0], [160.0, 21295.5], [162.0, 21361.5], [163.0, 21435.5], [164.0, 21504.0], [166.0, 21567.5], [167.0, 21632.5], [165.0, 30005.0], [161.0, 30007.0], [168.0, 23218.5], [170.0, 23286.5], [171.0, 21826.5], [172.0, 21885.5], [173.0, 23470.0], [175.0, 23538.0], [174.0, 26973.0], [169.0, 26963.0], [176.0, 23601.0], [177.0, 22140.5], [178.0, 22207.0], [179.0, 23778.5], [181.0, 22335.0], [182.0, 23899.5], [183.0, 22466.5], [180.0, 30002.0], [185.0, 24041.0], [186.0, 22605.5], [187.0, 22663.5], [188.0, 22731.5], [190.0, 24286.0], [191.0, 22857.0], [189.0, 30007.0], [184.0, 27003.0], [192.0, 22915.0], [193.0, 22978.0], [194.0, 24522.0], [195.0, 24580.5], [197.0, 23161.5], [198.0, 24708.0], [199.0, 24767.5], [196.0, 27043.0], [200.0, 23347.0], [202.0, 23412.0], [203.0, 24947.5], [204.0, 25009.0], [205.0, 23597.5], [206.0, 25127.0], [207.0, 27075.0], [201.0, 30006.0], [208.0, 23741.5], [209.0, 25266.0], [210.0, 23862.5], [212.0, 15987.666666666668], [213.0, 23998.5], [215.0, 25539.0], [214.0, 27095.0], [211.0, 30007.0], [216.0, 24146.5], [217.0, 23279.333333333332], [218.0, 25785.0], [220.0, 16408.666666666668], [221.0, 24492.0], [223.0, 24571.5], [222.0, 30006.0], [219.0, 27101.0], [225.0, 26093.0], [226.0, 24918.333333333332], [228.0, 24876.0], [229.0, 26381.0], [230.0, 26472.0], [231.0, 30005.0], [227.0, 27120.0], [224.0, 30004.0], [234.0, 26665.5], [235.0, 25357.0], [237.0, 26868.0], [239.0, 30006.0], [238.0, 27156.0], [236.0, 27154.0], [233.0, 30002.0], [232.0, 27144.0], [240.0, 26958.5], [242.0, 25633.0], [243.0, 27141.0], [245.0, 27208.0], [247.0, 25849.5], [246.0, 30005.0], [244.0, 27156.0], [241.0, 27148.0], [248.0, 27333.0], [249.0, 25980.0], [251.0, 26047.5], [252.0, 27522.0], [254.0, 27607.0], [255.0, 17888.0], [253.0, 27174.0], [250.0, 30002.0], [257.0, 26386.5], [256.0, 27732.0], [259.0, 26443.0], [258.0, 30004.0], [269.0, 30006.0], [268.0, 27209.0], [270.0, 27060.5], [271.0, 14089.0], [260.0, 27928.5], [261.0, 26622.5], [263.0, 26732.5], [262.0, 30004.0], [264.0, 28237.5], [265.0, 28305.5], [267.0, 28370.0], [266.0, 27200.0], [274.0, 28658.5], [272.0, 27191.5], [273.0, 27220.0], [275.0, 28730.0], [284.0, 28404.0], [286.0, 28555.0], [287.0, 28702.0], [276.0, 28800.5], [277.0, 27222.0], [278.0, 27473.5], [279.0, 28933.0], [280.0, 27608.0], [282.0, 28149.0], [281.0, 28614.0], [283.0, 28286.0], [290.0, 28606.571428571428], [289.0, 27896.333333333336], [288.0, 30006.0], [291.0, 28891.166666666668], [293.0, 28603.294117647056], [292.0, 29067.333333333332], [295.0, 28759.14285714286], [294.0, 28555.958333333336], [296.0, 25542.375], [297.0, 28556.5], [298.0, 27118.5], [1.0, 30006.0]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[169.07333333333347, 23447.38166666668]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 298.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 0.0, "minX": 1.52637198E12, "maxY": 59989.36666666667, "series": [{"data": [[1.5263721E12, 3990.1666666666665], [1.52637198E12, 20392.8], [1.52637204E12, 59989.36666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5263721E12, 0.0], [1.52637198E12, 8326.4], [1.52637204E12, 26700.15]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5263721E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 5934.712643678159, "minX": 1.52637198E12, "maxY": 30005.14606741574, "series": [{"data": [[1.5263721E12, 30005.14606741574], [1.52637198E12, 5934.712643678159], [1.52637204E12, 25664.271226415098]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5263721E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 0.0, "minX": 1.52637198E12, "maxY": 15403.082547169797, "series": [{"data": [[1.5263721E12, 0.0], [1.52637198E12, 5934.597701149423], [1.52637204E12, 15403.082547169797]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5263721E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 1.2247191011235965, "minX": 1.52637198E12, "maxY": 3.5057471264367828, "series": [{"data": [[1.5263721E12, 1.2247191011235965], [1.52637198E12, 3.5057471264367828], [1.52637204E12, 1.2287735849056598]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5263721E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 108.0, "minX": 1.52637198E12, "maxY": 29940.0, "series": [{"data": [[1.52637198E12, 11312.0], [1.52637204E12, 29940.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52637198E12, 468.0], [1.52637204E12, 108.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52637198E12, 10346.4], [1.52637204E12, 27200.3]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52637198E12, 11312.0], [1.52637204E12, 29508.659999999996]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52637198E12, 10887.8], [1.52637204E12, 27405.6]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52637204E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 5951.0, "minX": 1.0, "maxY": 30005.0, "series": [{"data": [[1.0, 5951.0], [7.0, 26902.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[1.0, 30005.0], [7.0, 30005.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 7.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 0.0, "minX": 1.0, "maxY": 26902.0, "series": [{"data": [[1.0, 5951.0], [7.0, 26902.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[1.0, 0.0], [7.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 7.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.52637198E12, "maxY": 6.666666666666667, "series": [{"data": [[1.52637198E12, 3.3333333333333335], [1.52637204E12, 6.666666666666667]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52637204E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 1.45, "minX": 1.52637198E12, "maxY": 4.65, "series": [{"data": [[1.52637198E12, 1.45], [1.52637204E12, 4.65]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.5263721E12, 1.4833333333333334], [1.52637204E12, 2.4166666666666665]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketTimeoutException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5263721E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 1.45, "minX": 1.52637198E12, "maxY": 4.65, "series": [{"data": [[1.52637198E12, 1.45], [1.52637204E12, 4.65]], "isOverall": false, "label": "inference-success", "isController": false}, {"data": [[1.5263721E12, 1.4833333333333334], [1.52637204E12, 2.4166666666666665]], "isOverall": false, "label": "inference-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5263721E12, "title": "Transactions Per Second"}},
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
