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
        data: {"result": {"minY": 408.0, "minX": 0.0, "maxY": 29268.0, "series": [{"data": [[0.0, 408.0], [0.1, 409.0], [0.2, 412.0], [0.3, 412.0], [0.4, 494.0], [0.5, 494.0], [0.6, 494.0], [0.7, 537.0], [0.8, 907.0], [0.9, 942.0], [1.0, 968.0], [1.1, 1005.0], [1.2, 1005.0], [1.3, 1007.0], [1.4, 1008.0], [1.5, 1091.0], [1.6, 1180.0], [1.7, 1266.0], [1.8, 1372.0], [1.9, 1381.0], [2.0, 1432.0], [2.1, 1439.0], [2.2, 1472.0], [2.3, 1600.0], [2.4, 1663.0], [2.5, 1783.0], [2.6, 2017.0], [2.7, 2105.0], [2.8, 2266.0], [2.9, 2283.0], [3.0, 2285.0], [3.1, 2406.0], [3.2, 2437.0], [3.3, 2610.0], [3.4, 2948.0], [3.5, 3010.0], [3.6, 3112.0], [3.7, 3192.0], [3.8, 3274.0], [3.9, 3602.0], [4.0, 3785.0], [4.1, 3919.0], [4.2, 3928.0], [4.3, 3994.0], [4.4, 4093.0], [4.5, 4296.0], [4.6, 4434.0], [4.7, 4610.0], [4.8, 4610.0], [4.9, 4847.0], [5.0, 4931.0], [5.1, 5000.0], [5.2, 5000.0], [5.3, 5001.0], [5.4, 5001.0], [5.5, 5001.0], [5.6, 5001.0], [5.7, 5001.0], [5.8, 5001.0], [5.9, 5001.0], [6.0, 5001.0], [6.1, 5001.0], [6.2, 5001.0], [6.3, 5001.0], [6.4, 5001.0], [6.5, 5001.0], [6.6, 5001.0], [6.7, 5001.0], [6.8, 5001.0], [6.9, 5001.0], [7.0, 5001.0], [7.1, 5001.0], [7.2, 5002.0], [7.3, 5002.0], [7.4, 5002.0], [7.5, 5002.0], [7.6, 5002.0], [7.7, 5002.0], [7.8, 5002.0], [7.9, 5002.0], [8.0, 5002.0], [8.1, 5002.0], [8.2, 5002.0], [8.3, 5002.0], [8.4, 5002.0], [8.5, 5002.0], [8.6, 5002.0], [8.7, 5002.0], [8.8, 5002.0], [8.9, 5002.0], [9.0, 5002.0], [9.1, 5002.0], [9.2, 5002.0], [9.3, 5002.0], [9.4, 5002.0], [9.5, 5002.0], [9.6, 5002.0], [9.7, 5002.0], [9.8, 5002.0], [9.9, 5002.0], [10.0, 5002.0], [10.1, 5002.0], [10.2, 5002.0], [10.3, 5002.0], [10.4, 5002.0], [10.5, 5002.0], [10.6, 5002.0], [10.7, 5002.0], [10.8, 5002.0], [10.9, 5002.0], [11.0, 5002.0], [11.1, 5002.0], [11.2, 5002.0], [11.3, 5002.0], [11.4, 5002.0], [11.5, 5002.0], [11.6, 5002.0], [11.7, 5002.0], [11.8, 5002.0], [11.9, 5002.0], [12.0, 5002.0], [12.1, 5002.0], [12.2, 5002.0], [12.3, 5002.0], [12.4, 5002.0], [12.5, 5002.0], [12.6, 5002.0], [12.7, 5002.0], [12.8, 5002.0], [12.9, 5002.0], [13.0, 5002.0], [13.1, 5002.0], [13.2, 5002.0], [13.3, 5002.0], [13.4, 5002.0], [13.5, 5002.0], [13.6, 5002.0], [13.7, 5002.0], [13.8, 5002.0], [13.9, 5002.0], [14.0, 5002.0], [14.1, 5002.0], [14.2, 5002.0], [14.3, 5002.0], [14.4, 5002.0], [14.5, 5002.0], [14.6, 5002.0], [14.7, 5002.0], [14.8, 5002.0], [14.9, 5003.0], [15.0, 5003.0], [15.1, 5003.0], [15.2, 5003.0], [15.3, 5003.0], [15.4, 5003.0], [15.5, 5003.0], [15.6, 5003.0], [15.7, 5003.0], [15.8, 5003.0], [15.9, 5003.0], [16.0, 5003.0], [16.1, 5003.0], [16.2, 5003.0], [16.3, 5003.0], [16.4, 5003.0], [16.5, 5003.0], [16.6, 5003.0], [16.7, 5003.0], [16.8, 5003.0], [16.9, 5003.0], [17.0, 5003.0], [17.1, 5003.0], [17.2, 5003.0], [17.3, 5003.0], [17.4, 5003.0], [17.5, 5003.0], [17.6, 5003.0], [17.7, 5003.0], [17.8, 5003.0], [17.9, 5003.0], [18.0, 5003.0], [18.1, 5003.0], [18.2, 5003.0], [18.3, 5003.0], [18.4, 5003.0], [18.5, 5003.0], [18.6, 5003.0], [18.7, 5003.0], [18.8, 5003.0], [18.9, 5003.0], [19.0, 5003.0], [19.1, 5003.0], [19.2, 5003.0], [19.3, 5003.0], [19.4, 5003.0], [19.5, 5003.0], [19.6, 5003.0], [19.7, 5003.0], [19.8, 5003.0], [19.9, 5003.0], [20.0, 5003.0], [20.1, 5003.0], [20.2, 5003.0], [20.3, 5004.0], [20.4, 5004.0], [20.5, 5004.0], [20.6, 5004.0], [20.7, 5004.0], [20.8, 5004.0], [20.9, 5004.0], [21.0, 5004.0], [21.1, 5004.0], [21.2, 5004.0], [21.3, 5004.0], [21.4, 5004.0], [21.5, 5004.0], [21.6, 5004.0], [21.7, 5004.0], [21.8, 5004.0], [21.9, 5004.0], [22.0, 5004.0], [22.1, 5004.0], [22.2, 5004.0], [22.3, 5004.0], [22.4, 5004.0], [22.5, 5004.0], [22.6, 5004.0], [22.7, 5004.0], [22.8, 5004.0], [22.9, 5004.0], [23.0, 5004.0], [23.1, 5004.0], [23.2, 5004.0], [23.3, 5004.0], [23.4, 5004.0], [23.5, 5004.0], [23.6, 5004.0], [23.7, 5004.0], [23.8, 5004.0], [23.9, 5004.0], [24.0, 5004.0], [24.1, 5004.0], [24.2, 5004.0], [24.3, 5004.0], [24.4, 5004.0], [24.5, 5004.0], [24.6, 5004.0], [24.7, 5004.0], [24.8, 5004.0], [24.9, 5004.0], [25.0, 5004.0], [25.1, 5004.0], [25.2, 5004.0], [25.3, 5004.0], [25.4, 5004.0], [25.5, 5004.0], [25.6, 5004.0], [25.7, 5004.0], [25.8, 5004.0], [25.9, 5004.0], [26.0, 5004.0], [26.1, 5004.0], [26.2, 5004.0], [26.3, 5005.0], [26.4, 5005.0], [26.5, 5005.0], [26.6, 5005.0], [26.7, 5005.0], [26.8, 5005.0], [26.9, 5005.0], [27.0, 5005.0], [27.1, 5005.0], [27.2, 5005.0], [27.3, 5005.0], [27.4, 5005.0], [27.5, 5005.0], [27.6, 5005.0], [27.7, 5005.0], [27.8, 5005.0], [27.9, 5005.0], [28.0, 5005.0], [28.1, 5005.0], [28.2, 5005.0], [28.3, 5005.0], [28.4, 5005.0], [28.5, 5005.0], [28.6, 5005.0], [28.7, 5005.0], [28.8, 5005.0], [28.9, 5005.0], [29.0, 5005.0], [29.1, 5005.0], [29.2, 5005.0], [29.3, 5005.0], [29.4, 5005.0], [29.5, 5005.0], [29.6, 5005.0], [29.7, 5005.0], [29.8, 5005.0], [29.9, 5005.0], [30.0, 5005.0], [30.1, 5005.0], [30.2, 5005.0], [30.3, 5005.0], [30.4, 5005.0], [30.5, 5005.0], [30.6, 5005.0], [30.7, 5005.0], [30.8, 5005.0], [30.9, 5006.0], [31.0, 5006.0], [31.1, 5006.0], [31.2, 5006.0], [31.3, 5006.0], [31.4, 5006.0], [31.5, 5006.0], [31.6, 5006.0], [31.7, 5006.0], [31.8, 5006.0], [31.9, 5006.0], [32.0, 5006.0], [32.1, 5006.0], [32.2, 5006.0], [32.3, 5006.0], [32.4, 5006.0], [32.5, 5006.0], [32.6, 5006.0], [32.7, 5006.0], [32.8, 5006.0], [32.9, 5006.0], [33.0, 5006.0], [33.1, 5006.0], [33.2, 5006.0], [33.3, 5006.0], [33.4, 5006.0], [33.5, 5006.0], [33.6, 5006.0], [33.7, 5006.0], [33.8, 5006.0], [33.9, 5006.0], [34.0, 5006.0], [34.1, 5007.0], [34.2, 5007.0], [34.3, 5007.0], [34.4, 5007.0], [34.5, 5007.0], [34.6, 5007.0], [34.7, 5007.0], [34.8, 5007.0], [34.9, 5007.0], [35.0, 5007.0], [35.1, 5007.0], [35.2, 5007.0], [35.3, 5007.0], [35.4, 5007.0], [35.5, 5007.0], [35.6, 5007.0], [35.7, 5007.0], [35.8, 5007.0], [35.9, 5008.0], [36.0, 5008.0], [36.1, 5010.0], [36.2, 5010.0], [36.3, 5010.0], [36.4, 5010.0], [36.5, 5011.0], [36.6, 5011.0], [36.7, 5012.0], [36.8, 5012.0], [36.9, 5012.0], [37.0, 5012.0], [37.1, 5012.0], [37.2, 5013.0], [37.3, 5013.0], [37.4, 5013.0], [37.5, 5014.0], [37.6, 5014.0], [37.7, 5014.0], [37.8, 5015.0], [37.9, 5016.0], [38.0, 5017.0], [38.1, 5018.0], [38.2, 5018.0], [38.3, 5018.0], [38.4, 5019.0], [38.5, 5019.0], [38.6, 5020.0], [38.7, 5020.0], [38.8, 5020.0], [38.9, 5021.0], [39.0, 5021.0], [39.1, 5022.0], [39.2, 5027.0], [39.3, 5027.0], [39.4, 5027.0], [39.5, 5036.0], [39.6, 5090.0], [39.7, 5093.0], [39.8, 5098.0], [39.9, 5098.0], [40.0, 5099.0], [40.1, 5100.0], [40.2, 5101.0], [40.3, 5102.0], [40.4, 5108.0], [40.5, 5108.0], [40.6, 5109.0], [40.7, 5109.0], [40.8, 5109.0], [40.9, 5114.0], [41.0, 5138.0], [41.1, 5281.0], [41.2, 5282.0], [41.3, 5282.0], [41.4, 5282.0], [41.5, 5284.0], [41.6, 5285.0], [41.7, 5286.0], [41.8, 5288.0], [41.9, 5293.0], [42.0, 5293.0], [42.1, 5297.0], [42.2, 5300.0], [42.3, 5313.0], [42.4, 5313.0], [42.5, 5315.0], [42.6, 5317.0], [42.7, 5317.0], [42.8, 5318.0], [42.9, 5318.0], [43.0, 5320.0], [43.1, 5321.0], [43.2, 5322.0], [43.3, 5323.0], [43.4, 5328.0], [43.5, 5329.0], [43.6, 5330.0], [43.7, 5357.0], [43.8, 5357.0], [43.9, 5361.0], [44.0, 5374.0], [44.1, 5376.0], [44.2, 5383.0], [44.3, 5384.0], [44.4, 5384.0], [44.5, 5385.0], [44.6, 5387.0], [44.7, 5393.0], [44.8, 5394.0], [44.9, 5395.0], [45.0, 5400.0], [45.1, 5403.0], [45.2, 5409.0], [45.3, 5409.0], [45.4, 5410.0], [45.5, 5412.0], [45.6, 5413.0], [45.7, 5413.0], [45.8, 5413.0], [45.9, 5417.0], [46.0, 5418.0], [46.1, 5419.0], [46.2, 5419.0], [46.3, 5419.0], [46.4, 5422.0], [46.5, 5424.0], [46.6, 5425.0], [46.7, 5427.0], [46.8, 5429.0], [46.9, 5432.0], [47.0, 5432.0], [47.1, 5438.0], [47.2, 5438.0], [47.3, 5440.0], [47.4, 5442.0], [47.5, 5443.0], [47.6, 5445.0], [47.7, 5445.0], [47.8, 5452.0], [47.9, 5452.0], [48.0, 5456.0], [48.1, 5456.0], [48.2, 5457.0], [48.3, 5459.0], [48.4, 5459.0], [48.5, 5461.0], [48.6, 5462.0], [48.7, 5464.0], [48.8, 5469.0], [48.9, 5470.0], [49.0, 5472.0], [49.1, 5473.0], [49.2, 5475.0], [49.3, 5476.0], [49.4, 5477.0], [49.5, 5479.0], [49.6, 5483.0], [49.7, 5485.0], [49.8, 5485.0], [49.9, 5486.0], [50.0, 5486.0], [50.1, 5488.0], [50.2, 5489.0], [50.3, 5489.0], [50.4, 5492.0], [50.5, 5494.0], [50.6, 5498.0], [50.7, 5499.0], [50.8, 5500.0], [50.9, 5500.0], [51.0, 5501.0], [51.1, 5501.0], [51.2, 5503.0], [51.3, 5508.0], [51.4, 5510.0], [51.5, 5510.0], [51.6, 5510.0], [51.7, 5512.0], [51.8, 5517.0], [51.9, 5517.0], [52.0, 5519.0], [52.1, 5520.0], [52.2, 5522.0], [52.3, 5523.0], [52.4, 5526.0], [52.5, 5529.0], [52.6, 5530.0], [52.7, 5530.0], [52.8, 5530.0], [52.9, 5531.0], [53.0, 5532.0], [53.1, 5532.0], [53.2, 5532.0], [53.3, 5533.0], [53.4, 5536.0], [53.5, 5541.0], [53.6, 5542.0], [53.7, 5543.0], [53.8, 5543.0], [53.9, 5545.0], [54.0, 5546.0], [54.1, 5546.0], [54.2, 5546.0], [54.3, 5547.0], [54.4, 5547.0], [54.5, 5550.0], [54.6, 5551.0], [54.7, 5551.0], [54.8, 5551.0], [54.9, 5556.0], [55.0, 5557.0], [55.1, 5557.0], [55.2, 5558.0], [55.3, 5558.0], [55.4, 5564.0], [55.5, 5564.0], [55.6, 5565.0], [55.7, 5566.0], [55.8, 5569.0], [55.9, 5570.0], [56.0, 5573.0], [56.1, 5574.0], [56.2, 5575.0], [56.3, 5575.0], [56.4, 5576.0], [56.5, 5577.0], [56.6, 5591.0], [56.7, 5600.0], [56.8, 5628.0], [56.9, 5636.0], [57.0, 5639.0], [57.1, 5643.0], [57.2, 5645.0], [57.3, 5645.0], [57.4, 5645.0], [57.5, 5647.0], [57.6, 5657.0], [57.7, 5687.0], [57.8, 5690.0], [57.9, 5698.0], [58.0, 5700.0], [58.1, 5702.0], [58.2, 5709.0], [58.3, 5709.0], [58.4, 5709.0], [58.5, 5711.0], [58.6, 5715.0], [58.7, 5715.0], [58.8, 5715.0], [58.9, 5715.0], [59.0, 5715.0], [59.1, 5716.0], [59.2, 5716.0], [59.3, 5717.0], [59.4, 5717.0], [59.5, 5718.0], [59.6, 5718.0], [59.7, 5719.0], [59.8, 5719.0], [59.9, 5724.0], [60.0, 5725.0], [60.1, 5725.0], [60.2, 5726.0], [60.3, 5727.0], [60.4, 5733.0], [60.5, 5733.0], [60.6, 5740.0], [60.7, 5741.0], [60.8, 5743.0], [60.9, 5745.0], [61.0, 5749.0], [61.1, 5771.0], [61.2, 5775.0], [61.3, 5775.0], [61.4, 5775.0], [61.5, 5775.0], [61.6, 5776.0], [61.7, 5778.0], [61.8, 5779.0], [61.9, 5788.0], [62.0, 5790.0], [62.1, 5790.0], [62.2, 5791.0], [62.3, 5791.0], [62.4, 5792.0], [62.5, 5792.0], [62.6, 5793.0], [62.7, 5793.0], [62.8, 5793.0], [62.9, 5800.0], [63.0, 5800.0], [63.1, 5800.0], [63.2, 5801.0], [63.3, 5801.0], [63.4, 5801.0], [63.5, 5802.0], [63.6, 5806.0], [63.7, 5806.0], [63.8, 5808.0], [63.9, 5808.0], [64.0, 5810.0], [64.1, 5810.0], [64.2, 5810.0], [64.3, 5810.0], [64.4, 5811.0], [64.5, 5811.0], [64.6, 5813.0], [64.7, 5813.0], [64.8, 5816.0], [64.9, 5818.0], [65.0, 5819.0], [65.1, 5819.0], [65.2, 5820.0], [65.3, 5824.0], [65.4, 5825.0], [65.5, 5827.0], [65.6, 5830.0], [65.7, 5831.0], [65.8, 5831.0], [65.9, 5831.0], [66.0, 5831.0], [66.1, 5831.0], [66.2, 5833.0], [66.3, 5837.0], [66.4, 5837.0], [66.5, 5837.0], [66.6, 5840.0], [66.7, 5841.0], [66.8, 5844.0], [66.9, 5845.0], [67.0, 5845.0], [67.1, 5847.0], [67.2, 5847.0], [67.3, 5847.0], [67.4, 5847.0], [67.5, 5848.0], [67.6, 5848.0], [67.7, 5849.0], [67.8, 5852.0], [67.9, 5854.0], [68.0, 5861.0], [68.1, 5861.0], [68.2, 5862.0], [68.3, 5862.0], [68.4, 5863.0], [68.5, 5864.0], [68.6, 5865.0], [68.7, 5865.0], [68.8, 5867.0], [68.9, 5867.0], [69.0, 5870.0], [69.1, 5870.0], [69.2, 5875.0], [69.3, 5875.0], [69.4, 5875.0], [69.5, 5876.0], [69.6, 5876.0], [69.7, 5876.0], [69.8, 5876.0], [69.9, 5878.0], [70.0, 5878.0], [70.1, 5879.0], [70.2, 5881.0], [70.3, 5883.0], [70.4, 5883.0], [70.5, 5884.0], [70.6, 5884.0], [70.7, 5885.0], [70.8, 5885.0], [70.9, 5885.0], [71.0, 5886.0], [71.1, 5886.0], [71.2, 5893.0], [71.3, 5903.0], [71.4, 5907.0], [71.5, 5907.0], [71.6, 5908.0], [71.7, 5908.0], [71.8, 5910.0], [71.9, 5910.0], [72.0, 5910.0], [72.1, 5911.0], [72.2, 5912.0], [72.3, 5912.0], [72.4, 5913.0], [72.5, 5913.0], [72.6, 5914.0], [72.7, 5914.0], [72.8, 5914.0], [72.9, 5914.0], [73.0, 5915.0], [73.1, 5915.0], [73.2, 5915.0], [73.3, 5916.0], [73.4, 5916.0], [73.5, 5917.0], [73.6, 5917.0], [73.7, 5917.0], [73.8, 5918.0], [73.9, 5918.0], [74.0, 5919.0], [74.1, 5919.0], [74.2, 5919.0], [74.3, 5919.0], [74.4, 5919.0], [74.5, 5920.0], [74.6, 5920.0], [74.7, 5920.0], [74.8, 5920.0], [74.9, 5921.0], [75.0, 5921.0], [75.1, 5921.0], [75.2, 5922.0], [75.3, 5923.0], [75.4, 5923.0], [75.5, 5924.0], [75.6, 5925.0], [75.7, 5925.0], [75.8, 5925.0], [75.9, 5926.0], [76.0, 5926.0], [76.1, 5927.0], [76.2, 5927.0], [76.3, 5927.0], [76.4, 5927.0], [76.5, 5928.0], [76.6, 5928.0], [76.7, 5928.0], [76.8, 5928.0], [76.9, 5928.0], [77.0, 5929.0], [77.1, 5929.0], [77.2, 5929.0], [77.3, 5929.0], [77.4, 5930.0], [77.5, 5930.0], [77.6, 5930.0], [77.7, 5930.0], [77.8, 5931.0], [77.9, 5932.0], [78.0, 5932.0], [78.1, 5933.0], [78.2, 5933.0], [78.3, 5933.0], [78.4, 5933.0], [78.5, 5934.0], [78.6, 5934.0], [78.7, 5934.0], [78.8, 5934.0], [78.9, 5935.0], [79.0, 5937.0], [79.1, 5937.0], [79.2, 5939.0], [79.3, 5939.0], [79.4, 5940.0], [79.5, 5941.0], [79.6, 5944.0], [79.7, 5950.0], [79.8, 5950.0], [79.9, 5951.0], [80.0, 5951.0], [80.1, 5952.0], [80.2, 5952.0], [80.3, 5952.0], [80.4, 5952.0], [80.5, 5955.0], [80.6, 5959.0], [80.7, 5974.0], [80.8, 5977.0], [80.9, 5977.0], [81.0, 5981.0], [81.1, 5982.0], [81.2, 5989.0], [81.3, 5990.0], [81.4, 5991.0], [81.5, 5994.0], [81.6, 5996.0], [81.7, 5998.0], [81.8, 6002.0], [81.9, 6005.0], [82.0, 6006.0], [82.1, 6006.0], [82.2, 6009.0], [82.3, 6009.0], [82.4, 6010.0], [82.5, 6011.0], [82.6, 6012.0], [82.7, 6019.0], [82.8, 6023.0], [82.9, 6023.0], [83.0, 6024.0], [83.1, 6028.0], [83.2, 6045.0], [83.3, 6061.0], [83.4, 6063.0], [83.5, 6064.0], [83.6, 6065.0], [83.7, 6065.0], [83.8, 6065.0], [83.9, 6066.0], [84.0, 6068.0], [84.1, 6069.0], [84.2, 6078.0], [84.3, 6086.0], [84.4, 6088.0], [84.5, 6089.0], [84.6, 6097.0], [84.7, 6098.0], [84.8, 6101.0], [84.9, 6101.0], [85.0, 6102.0], [85.1, 6104.0], [85.2, 6107.0], [85.3, 6107.0], [85.4, 6108.0], [85.5, 6108.0], [85.6, 6108.0], [85.7, 6112.0], [85.8, 6113.0], [85.9, 6114.0], [86.0, 6115.0], [86.1, 6117.0], [86.2, 6117.0], [86.3, 6119.0], [86.4, 6123.0], [86.5, 6123.0], [86.6, 6125.0], [86.7, 6125.0], [86.8, 6126.0], [86.9, 6134.0], [87.0, 6134.0], [87.1, 6139.0], [87.2, 6140.0], [87.3, 6154.0], [87.4, 6172.0], [87.5, 6179.0], [87.6, 6199.0], [87.7, 6252.0], [87.8, 6464.0], [87.9, 6480.0], [88.0, 6674.0], [88.1, 6849.0], [88.2, 7104.0], [88.3, 7399.0], [88.4, 7592.0], [88.5, 7629.0], [88.6, 7757.0], [88.7, 8083.0], [88.8, 8126.0], [88.9, 8245.0], [89.0, 8406.0], [89.1, 8696.0], [89.2, 8771.0], [89.3, 8856.0], [89.4, 9016.0], [89.5, 9340.0], [89.6, 9418.0], [89.7, 9502.0], [89.8, 9668.0], [89.9, 9828.0], [90.0, 10218.0], [90.1, 10406.0], [90.2, 10413.0], [90.3, 10769.0], [90.4, 10819.0], [90.5, 10947.0], [90.6, 11125.0], [90.7, 11299.0], [90.8, 11650.0], [90.9, 11788.0], [91.0, 11826.0], [91.1, 12003.0], [91.2, 12176.0], [91.3, 12355.0], [91.4, 12717.0], [91.5, 12935.0], [91.6, 12955.0], [91.7, 13097.0], [91.8, 13290.0], [91.9, 13440.0], [92.0, 13650.0], [92.1, 13831.0], [92.2, 14011.0], [92.3, 14421.0], [92.4, 14472.0], [92.5, 14789.0], [92.6, 14836.0], [92.7, 14937.0], [92.8, 15306.0], [92.9, 15380.0], [93.0, 15519.0], [93.1, 15701.0], [93.2, 15839.0], [93.3, 16021.0], [93.4, 16209.0], [93.5, 16437.0], [93.6, 16763.0], [93.7, 16944.0], [93.8, 16990.0], [93.9, 17160.0], [94.0, 17342.0], [94.1, 17523.0], [94.2, 17888.0], [94.3, 18037.0], [94.4, 18396.0], [94.5, 18454.0], [94.6, 18575.0], [94.7, 18636.0], [94.8, 18998.0], [94.9, 19136.0], [95.0, 19180.0], [95.1, 19656.0], [95.2, 19791.0], [95.3, 20013.0], [95.4, 20197.0], [95.5, 20271.0], [95.6, 20563.0], [95.7, 20878.0], [95.8, 20952.0], [95.9, 21034.0], [96.0, 21324.0], [96.1, 21468.0], [96.2, 21506.0], [96.3, 21794.0], [96.4, 22012.0], [96.5, 22510.0], [96.6, 22839.0], [96.7, 23013.0], [96.8, 23126.0], [96.9, 23226.0], [97.0, 23826.0], [97.1, 23859.0], [97.2, 23875.0], [97.3, 24037.0], [97.4, 24102.0], [97.5, 24238.0], [97.6, 24673.0], [97.7, 24674.0], [97.8, 25160.0], [97.9, 25169.0], [98.0, 25216.0], [98.1, 25417.0], [98.2, 25579.0], [98.3, 26144.0], [98.4, 26201.0], [98.5, 26267.0], [98.6, 26406.0], [98.7, 26744.0], [98.8, 27149.0], [98.9, 27157.0], [99.0, 27331.0], [99.1, 27421.0], [99.2, 27514.0], [99.3, 27702.0], [99.4, 28067.0], [99.5, 28189.0], [99.6, 28213.0], [99.7, 28277.0], [99.8, 29081.0], [99.9, 29268.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 400.0, "maxY": 349.0, "series": [{"data": [[400.0, 6.0], [500.0, 1.0], [800.0, 1.0], [900.0, 3.0], [1000.0, 4.0], [1100.0, 1.0], [1200.0, 1.0], [1300.0, 2.0], [1400.0, 3.0], [1600.0, 2.0], [1700.0, 1.0], [2000.0, 1.0], [2100.0, 1.0], [2200.0, 3.0], [2400.0, 2.0], [2600.0, 1.0], [2900.0, 1.0], [3000.0, 1.0], [3100.0, 2.0], [3200.0, 1.0], [3600.0, 1.0], [3700.0, 1.0], [3900.0, 3.0], [4000.0, 1.0], [4200.0, 1.0], [4600.0, 2.0], [4400.0, 1.0], [4800.0, 2.0], [5000.0, 349.0], [4900.0, 1.0], [5100.0, 10.0], [5300.0, 28.0], [5200.0, 11.0], [5400.0, 58.0], [5500.0, 59.0], [5600.0, 13.0], [5700.0, 49.0], [5800.0, 84.0], [5900.0, 105.0], [6000.0, 30.0], [6100.0, 30.0], [6200.0, 1.0], [6400.0, 2.0], [6600.0, 1.0], [6800.0, 1.0], [7100.0, 1.0], [7300.0, 1.0], [7600.0, 1.0], [7500.0, 1.0], [7700.0, 1.0], [8100.0, 1.0], [8000.0, 1.0], [8200.0, 1.0], [8400.0, 1.0], [8700.0, 1.0], [8600.0, 1.0], [8800.0, 1.0], [9000.0, 1.0], [9400.0, 1.0], [9300.0, 1.0], [9500.0, 1.0], [9600.0, 1.0], [9800.0, 1.0], [10200.0, 1.0], [10400.0, 2.0], [10700.0, 1.0], [10800.0, 1.0], [10900.0, 1.0], [11100.0, 1.0], [11200.0, 1.0], [11700.0, 1.0], [11600.0, 1.0], [11800.0, 1.0], [12000.0, 1.0], [12100.0, 1.0], [12300.0, 1.0], [12700.0, 1.0], [12900.0, 2.0], [13000.0, 1.0], [13200.0, 1.0], [13400.0, 1.0], [13600.0, 1.0], [13800.0, 1.0], [14000.0, 1.0], [14400.0, 2.0], [14800.0, 1.0], [14700.0, 1.0], [14900.0, 1.0], [15300.0, 2.0], [15500.0, 1.0], [15700.0, 1.0], [15800.0, 1.0], [16000.0, 1.0], [16200.0, 1.0], [16400.0, 1.0], [16900.0, 2.0], [16700.0, 1.0], [17100.0, 1.0], [17300.0, 1.0], [17500.0, 1.0], [18000.0, 1.0], [17800.0, 1.0], [18300.0, 1.0], [18400.0, 1.0], [18500.0, 1.0], [18600.0, 1.0], [19100.0, 2.0], [18900.0, 1.0], [19700.0, 1.0], [19600.0, 1.0], [20200.0, 1.0], [20000.0, 1.0], [20100.0, 1.0], [20800.0, 1.0], [20500.0, 1.0], [21000.0, 1.0], [20900.0, 1.0], [21400.0, 1.0], [21300.0, 1.0], [21500.0, 1.0], [21700.0, 1.0], [22000.0, 1.0], [22500.0, 1.0], [22800.0, 1.0], [23000.0, 1.0], [23200.0, 1.0], [23100.0, 1.0], [23800.0, 3.0], [24100.0, 1.0], [24000.0, 1.0], [24200.0, 1.0], [24600.0, 2.0], [25100.0, 2.0], [25200.0, 1.0], [25400.0, 1.0], [25500.0, 1.0], [26100.0, 1.0], [26400.0, 1.0], [26200.0, 2.0], [26700.0, 1.0], [27100.0, 2.0], [27400.0, 1.0], [27300.0, 1.0], [27500.0, 1.0], [27700.0, 1.0], [28200.0, 2.0], [28000.0, 1.0], [28100.0, 1.0], [29000.0, 1.0], [29200.0, 1.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 29200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 5.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 847.0, "series": [{"data": [[1.0, 5.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 847.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[2.0, 148.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 48.89655172413795, "minX": 1.525227E12, "maxY": 924.7250821467688, "series": [{"data": [[1.525227E12, 924.7250821467688], [1.52522706E12, 48.89655172413795]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52522706E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 993.3333333333333, "minX": 6.0, "maxY": 29268.0, "series": [{"data": [[6.0, 29268.0], [7.0, 29081.0], [8.0, 28213.0], [9.0, 28189.0], [10.0, 28067.0], [11.0, 28277.0], [12.0, 27702.0], [13.0, 27514.0], [14.0, 27331.0], [15.0, 27149.0], [16.0, 27421.0], [17.0, 26950.5], [18.0, 26267.0], [20.0, 26303.5], [22.0, 26144.0], [23.0, 25160.0], [24.0, 25579.0], [25.0, 25417.0], [26.0, 25216.0], [27.0, 25169.0], [28.0, 24674.0], [29.0, 24238.0], [30.0, 24673.0], [31.0, 24037.0], [32.0, 23980.5], [35.0, 23126.0], [34.0, 23850.5], [37.0, 23013.0], [36.0, 23226.0], [39.0, 22510.0], [38.0, 22839.0], [41.0, 21794.0], [40.0, 22012.0], [43.0, 21506.0], [45.0, 21468.0], [44.0, 21324.0], [47.0, 21034.0], [46.0, 20952.0], [49.0, 20878.0], [48.0, 20563.0], [51.0, 20013.0], [50.0, 20197.0], [53.0, 19656.0], [52.0, 20271.0], [55.0, 19180.0], [54.0, 19791.0], [57.0, 19136.0], [56.0, 18998.0], [59.0, 18454.0], [58.0, 18636.0], [61.0, 18396.0], [60.0, 18575.0], [63.0, 18037.0], [62.0, 17888.0], [67.0, 16944.0], [66.0, 17160.0], [65.0, 17342.0], [64.0, 17523.0], [71.0, 16209.0], [70.0, 16437.0], [69.0, 16990.0], [68.0, 16763.0], [75.0, 15519.0], [74.0, 15701.0], [73.0, 15839.0], [72.0, 16021.0], [79.0, 14789.0], [78.0, 14937.0], [77.0, 15380.0], [76.0, 15306.0], [83.0, 14011.0], [82.0, 14472.0], [81.0, 14421.0], [80.0, 14836.0], [87.0, 13290.0], [86.0, 13440.0], [85.0, 13650.0], [84.0, 13831.0], [91.0, 12836.0], [90.0, 12935.0], [89.0, 13097.0], [95.0, 11826.0], [94.0, 12089.5], [92.0, 12355.0], [99.0, 11212.0], [97.0, 11788.0], [96.0, 11650.0], [102.0, 10819.0], [101.0, 10769.0], [100.0, 10947.0], [107.0, 9828.0], [106.0, 10413.0], [104.0, 10312.0], [111.0, 9418.0], [110.0, 9340.0], [109.0, 9502.0], [108.0, 9668.0], [115.0, 8771.0], [114.0, 8696.0], [113.0, 8856.0], [112.0, 9016.0], [119.0, 7757.0], [118.0, 8104.5], [117.0, 8245.0], [116.0, 8406.0], [122.0, 7366.5], [121.0, 7399.0], [120.0, 7592.0], [124.0, 6849.0], [200.0, 6674.0], [434.0, 6480.0], [807.0, 6252.0], [956.0, 5049.894409937889], [959.0, 4931.0], [949.0, 5883.0], [948.0, 6464.0], [958.0, 5044.36170212766], [957.0, 5021.95], [955.0, 5242.074074074076], [954.0, 5391.847133757966], [953.0, 5806.43076923077], [952.0, 5842.182795698923], [951.0, 6048.636363636363], [950.0, 6049.999999999998], [977.0, 2610.0], [987.0, 2406.0], [983.0, 2105.0], [982.0, 2266.0], [980.0, 2335.0], [975.0, 3101.0], [973.0, 3030.0], [972.0, 3274.0], [969.0, 3919.0], [968.0, 3602.0], [967.0, 3785.0], [965.0, 3928.0], [964.0, 4043.5], [963.0, 4453.0], [962.0, 4707.333333333333], [961.0, 4610.0], [960.0, 5036.0], [1000.0, 993.3333333333333], [998.0, 1900.0]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[848.5280000000001, 6725.387999999992]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1000.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 6262.45, "minX": 1.525227E12, "maxY": 39131.38333333333, "series": [{"data": [[1.525227E12, 39131.38333333333], [1.52522706E12, 20329.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.525227E12, 6262.45], [1.52522706E12, 8252.55]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52522706E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 5399.878422782029, "minX": 1.525227E12, "maxY": 20635.620689655185, "series": [{"data": [[1.525227E12, 5399.878422782029], [1.52522706E12, 20635.620689655185]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52522706E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 471.41182913472073, "minX": 1.525227E12, "maxY": 20635.563218390813, "series": [{"data": [[1.525227E12, 471.41182913472073], [1.52522706E12, 20635.563218390813]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52522706E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 923.8735632183907, "minX": 1.525227E12, "maxY": 4937.4381161007705, "series": [{"data": [[1.525227E12, 4937.4381161007705], [1.52522706E12, 923.8735632183907]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52522706E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 907.0, "minX": 1.525227E12, "maxY": 29268.0, "series": [{"data": [[1.525227E12, 12176.0], [1.52522706E12, 29268.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.525227E12, 907.0], [1.52522706E12, 12355.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.525227E12, 11177.2], [1.52522706E12, 26240.6]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.525227E12, 12176.0], [1.52522706E12, 29167.02]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.525227E12, 11812.7], [1.52522706E12, 27570.399999999998]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52522706E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 5403.0, "minX": 1.0, "maxY": 20563.0, "series": [{"data": [[1.0, 20563.0], [15.0, 6577.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[15.0, 5403.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 15.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 0.0, "minX": 1.0, "maxY": 20563.0, "series": [{"data": [[1.0, 20563.0], [15.0, 6577.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[15.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 15.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.525227E12, "maxY": 16.666666666666668, "series": [{"data": [[1.525227E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.525227E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.43333333333333335, "minX": 1.525227E12, "maxY": 13.683333333333334, "series": [{"data": [[1.525227E12, 1.1], [1.52522706E12, 1.45]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.525227E12, 13.683333333333334]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.conn.ConnectTimeoutException", "isController": false}, {"data": [[1.525227E12, 0.43333333333333335]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52522706E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 1.1, "minX": 1.525227E12, "maxY": 14.116666666666667, "series": [{"data": [[1.525227E12, 1.1], [1.52522706E12, 1.45]], "isOverall": false, "label": "inference-success", "isController": false}, {"data": [[1.525227E12, 14.116666666666667]], "isOverall": false, "label": "inference-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52522706E12, "title": "Transactions Per Second"}},
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
