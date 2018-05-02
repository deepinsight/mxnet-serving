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
        data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 1355.0, "series": [{"data": [[0.0, 0.0], [0.1, 0.0], [0.2, 0.0], [0.3, 0.0], [0.4, 0.0], [0.5, 0.0], [0.6, 1.0], [0.7, 1.0], [0.8, 1.0], [0.9, 1.0], [1.0, 1.0], [1.1, 1.0], [1.2, 1.0], [1.3, 1.0], [1.4, 1.0], [1.5, 10.0], [1.6, 13.0], [1.7, 13.0], [1.8, 14.0], [1.9, 14.0], [2.0, 16.0], [2.1, 17.0], [2.2, 17.0], [2.3, 17.0], [2.4, 18.0], [2.5, 18.0], [2.6, 19.0], [2.7, 20.0], [2.8, 20.0], [2.9, 21.0], [3.0, 22.0], [3.1, 23.0], [3.2, 25.0], [3.3, 25.0], [3.4, 26.0], [3.5, 26.0], [3.6, 29.0], [3.7, 29.0], [3.8, 29.0], [3.9, 30.0], [4.0, 30.0], [4.1, 33.0], [4.2, 35.0], [4.3, 36.0], [4.4, 36.0], [4.5, 36.0], [4.6, 37.0], [4.7, 37.0], [4.8, 38.0], [4.9, 39.0], [5.0, 40.0], [5.1, 41.0], [5.2, 42.0], [5.3, 43.0], [5.4, 44.0], [5.5, 44.0], [5.6, 45.0], [5.7, 46.0], [5.8, 47.0], [5.9, 48.0], [6.0, 48.0], [6.1, 49.0], [6.2, 49.0], [6.3, 51.0], [6.4, 52.0], [6.5, 52.0], [6.6, 55.0], [6.7, 55.0], [6.8, 55.0], [6.9, 56.0], [7.0, 59.0], [7.1, 60.0], [7.2, 60.0], [7.3, 60.0], [7.4, 63.0], [7.5, 65.0], [7.6, 68.0], [7.7, 68.0], [7.8, 70.0], [7.9, 71.0], [8.0, 71.0], [8.1, 72.0], [8.2, 73.0], [8.3, 73.0], [8.4, 74.0], [8.5, 80.0], [8.6, 80.0], [8.7, 81.0], [8.8, 81.0], [8.9, 82.0], [9.0, 83.0], [9.1, 84.0], [9.2, 84.0], [9.3, 85.0], [9.4, 85.0], [9.5, 86.0], [9.6, 86.0], [9.7, 86.0], [9.8, 86.0], [9.9, 86.0], [10.0, 87.0], [10.1, 87.0], [10.2, 87.0], [10.3, 89.0], [10.4, 89.0], [10.5, 89.0], [10.6, 91.0], [10.7, 91.0], [10.8, 92.0], [10.9, 92.0], [11.0, 92.0], [11.1, 92.0], [11.2, 93.0], [11.3, 93.0], [11.4, 93.0], [11.5, 96.0], [11.6, 96.0], [11.7, 96.0], [11.8, 96.0], [11.9, 96.0], [12.0, 96.0], [12.1, 97.0], [12.2, 97.0], [12.3, 98.0], [12.4, 98.0], [12.5, 98.0], [12.6, 98.0], [12.7, 100.0], [12.8, 100.0], [12.9, 100.0], [13.0, 101.0], [13.1, 101.0], [13.2, 101.0], [13.3, 102.0], [13.4, 103.0], [13.5, 104.0], [13.6, 105.0], [13.7, 105.0], [13.8, 105.0], [13.9, 107.0], [14.0, 107.0], [14.1, 109.0], [14.2, 109.0], [14.3, 111.0], [14.4, 112.0], [14.5, 112.0], [14.6, 112.0], [14.7, 113.0], [14.8, 113.0], [14.9, 114.0], [15.0, 115.0], [15.1, 116.0], [15.2, 116.0], [15.3, 116.0], [15.4, 117.0], [15.5, 118.0], [15.6, 118.0], [15.7, 119.0], [15.8, 120.0], [15.9, 120.0], [16.0, 120.0], [16.1, 121.0], [16.2, 121.0], [16.3, 121.0], [16.4, 121.0], [16.5, 122.0], [16.6, 122.0], [16.7, 124.0], [16.8, 124.0], [16.9, 127.0], [17.0, 127.0], [17.1, 127.0], [17.2, 128.0], [17.3, 128.0], [17.4, 130.0], [17.5, 130.0], [17.6, 131.0], [17.7, 134.0], [17.8, 134.0], [17.9, 136.0], [18.0, 136.0], [18.1, 137.0], [18.2, 137.0], [18.3, 138.0], [18.4, 139.0], [18.5, 139.0], [18.6, 139.0], [18.7, 139.0], [18.8, 140.0], [18.9, 141.0], [19.0, 141.0], [19.1, 142.0], [19.2, 142.0], [19.3, 143.0], [19.4, 143.0], [19.5, 143.0], [19.6, 146.0], [19.7, 146.0], [19.8, 146.0], [19.9, 147.0], [20.0, 148.0], [20.1, 148.0], [20.2, 148.0], [20.3, 149.0], [20.4, 151.0], [20.5, 151.0], [20.6, 152.0], [20.7, 152.0], [20.8, 152.0], [20.9, 153.0], [21.0, 153.0], [21.1, 153.0], [21.2, 153.0], [21.3, 154.0], [21.4, 154.0], [21.5, 155.0], [21.6, 156.0], [21.7, 156.0], [21.8, 156.0], [21.9, 157.0], [22.0, 159.0], [22.1, 160.0], [22.2, 160.0], [22.3, 161.0], [22.4, 161.0], [22.5, 161.0], [22.6, 161.0], [22.7, 161.0], [22.8, 162.0], [22.9, 162.0], [23.0, 163.0], [23.1, 164.0], [23.2, 164.0], [23.3, 165.0], [23.4, 165.0], [23.5, 165.0], [23.6, 165.0], [23.7, 165.0], [23.8, 167.0], [23.9, 167.0], [24.0, 167.0], [24.1, 168.0], [24.2, 170.0], [24.3, 170.0], [24.4, 171.0], [24.5, 172.0], [24.6, 172.0], [24.7, 175.0], [24.8, 175.0], [24.9, 176.0], [25.0, 176.0], [25.1, 176.0], [25.2, 176.0], [25.3, 177.0], [25.4, 179.0], [25.5, 179.0], [25.6, 180.0], [25.7, 180.0], [25.8, 181.0], [25.9, 182.0], [26.0, 183.0], [26.1, 184.0], [26.2, 184.0], [26.3, 185.0], [26.4, 185.0], [26.5, 185.0], [26.6, 187.0], [26.7, 187.0], [26.8, 187.0], [26.9, 187.0], [27.0, 188.0], [27.1, 189.0], [27.2, 189.0], [27.3, 190.0], [27.4, 190.0], [27.5, 191.0], [27.6, 192.0], [27.7, 192.0], [27.8, 193.0], [27.9, 193.0], [28.0, 193.0], [28.1, 193.0], [28.2, 194.0], [28.3, 194.0], [28.4, 194.0], [28.5, 195.0], [28.6, 197.0], [28.7, 197.0], [28.8, 198.0], [28.9, 199.0], [29.0, 199.0], [29.1, 200.0], [29.2, 200.0], [29.3, 200.0], [29.4, 200.0], [29.5, 201.0], [29.6, 202.0], [29.7, 203.0], [29.8, 203.0], [29.9, 204.0], [30.0, 205.0], [30.1, 207.0], [30.2, 208.0], [30.3, 209.0], [30.4, 209.0], [30.5, 210.0], [30.6, 210.0], [30.7, 210.0], [30.8, 211.0], [30.9, 211.0], [31.0, 212.0], [31.1, 213.0], [31.2, 213.0], [31.3, 213.0], [31.4, 213.0], [31.5, 213.0], [31.6, 214.0], [31.7, 214.0], [31.8, 214.0], [31.9, 214.0], [32.0, 215.0], [32.1, 216.0], [32.2, 216.0], [32.3, 216.0], [32.4, 217.0], [32.5, 217.0], [32.6, 218.0], [32.7, 220.0], [32.8, 220.0], [32.9, 221.0], [33.0, 221.0], [33.1, 223.0], [33.2, 223.0], [33.3, 224.0], [33.4, 224.0], [33.5, 225.0], [33.6, 225.0], [33.7, 227.0], [33.8, 228.0], [33.9, 228.0], [34.0, 229.0], [34.1, 229.0], [34.2, 230.0], [34.3, 231.0], [34.4, 231.0], [34.5, 232.0], [34.6, 232.0], [34.7, 232.0], [34.8, 232.0], [34.9, 232.0], [35.0, 232.0], [35.1, 232.0], [35.2, 233.0], [35.3, 233.0], [35.4, 233.0], [35.5, 233.0], [35.6, 233.0], [35.7, 233.0], [35.8, 234.0], [35.9, 234.0], [36.0, 234.0], [36.1, 234.0], [36.2, 234.0], [36.3, 234.0], [36.4, 234.0], [36.5, 235.0], [36.6, 235.0], [36.7, 235.0], [36.8, 235.0], [36.9, 235.0], [37.0, 235.0], [37.1, 235.0], [37.2, 235.0], [37.3, 236.0], [37.4, 236.0], [37.5, 236.0], [37.6, 236.0], [37.7, 236.0], [37.8, 237.0], [37.9, 237.0], [38.0, 237.0], [38.1, 237.0], [38.2, 237.0], [38.3, 238.0], [38.4, 238.0], [38.5, 238.0], [38.6, 238.0], [38.7, 238.0], [38.8, 238.0], [38.9, 238.0], [39.0, 238.0], [39.1, 238.0], [39.2, 238.0], [39.3, 238.0], [39.4, 239.0], [39.5, 239.0], [39.6, 240.0], [39.7, 240.0], [39.8, 240.0], [39.9, 240.0], [40.0, 240.0], [40.1, 240.0], [40.2, 240.0], [40.3, 241.0], [40.4, 241.0], [40.5, 241.0], [40.6, 242.0], [40.7, 242.0], [40.8, 242.0], [40.9, 243.0], [41.0, 244.0], [41.1, 244.0], [41.2, 244.0], [41.3, 244.0], [41.4, 244.0], [41.5, 245.0], [41.6, 245.0], [41.7, 245.0], [41.8, 245.0], [41.9, 245.0], [42.0, 246.0], [42.1, 247.0], [42.2, 247.0], [42.3, 247.0], [42.4, 248.0], [42.5, 248.0], [42.6, 248.0], [42.7, 248.0], [42.8, 249.0], [42.9, 249.0], [43.0, 249.0], [43.1, 250.0], [43.2, 250.0], [43.3, 250.0], [43.4, 251.0], [43.5, 251.0], [43.6, 254.0], [43.7, 254.0], [43.8, 254.0], [43.9, 256.0], [44.0, 256.0], [44.1, 258.0], [44.2, 258.0], [44.3, 259.0], [44.4, 261.0], [44.5, 261.0], [44.6, 261.0], [44.7, 262.0], [44.8, 262.0], [44.9, 263.0], [45.0, 265.0], [45.1, 265.0], [45.2, 266.0], [45.3, 267.0], [45.4, 268.0], [45.5, 268.0], [45.6, 268.0], [45.7, 269.0], [45.8, 270.0], [45.9, 270.0], [46.0, 270.0], [46.1, 271.0], [46.2, 272.0], [46.3, 272.0], [46.4, 273.0], [46.5, 274.0], [46.6, 274.0], [46.7, 274.0], [46.8, 276.0], [46.9, 276.0], [47.0, 276.0], [47.1, 278.0], [47.2, 279.0], [47.3, 282.0], [47.4, 283.0], [47.5, 286.0], [47.6, 288.0], [47.7, 289.0], [47.8, 289.0], [47.9, 289.0], [48.0, 290.0], [48.1, 290.0], [48.2, 290.0], [48.3, 291.0], [48.4, 292.0], [48.5, 292.0], [48.6, 292.0], [48.7, 293.0], [48.8, 294.0], [48.9, 295.0], [49.0, 296.0], [49.1, 296.0], [49.2, 297.0], [49.3, 299.0], [49.4, 300.0], [49.5, 300.0], [49.6, 300.0], [49.7, 301.0], [49.8, 302.0], [49.9, 303.0], [50.0, 303.0], [50.1, 307.0], [50.2, 307.0], [50.3, 308.0], [50.4, 309.0], [50.5, 310.0], [50.6, 311.0], [50.7, 311.0], [50.8, 311.0], [50.9, 311.0], [51.0, 312.0], [51.1, 312.0], [51.2, 313.0], [51.3, 314.0], [51.4, 315.0], [51.5, 317.0], [51.6, 317.0], [51.7, 318.0], [51.8, 320.0], [51.9, 322.0], [52.0, 322.0], [52.1, 323.0], [52.2, 324.0], [52.3, 326.0], [52.4, 327.0], [52.5, 328.0], [52.6, 330.0], [52.7, 331.0], [52.8, 332.0], [52.9, 332.0], [53.0, 333.0], [53.1, 334.0], [53.2, 335.0], [53.3, 337.0], [53.4, 337.0], [53.5, 338.0], [53.6, 338.0], [53.7, 340.0], [53.8, 343.0], [53.9, 344.0], [54.0, 344.0], [54.1, 346.0], [54.2, 346.0], [54.3, 347.0], [54.4, 349.0], [54.5, 352.0], [54.6, 352.0], [54.7, 352.0], [54.8, 354.0], [54.9, 355.0], [55.0, 355.0], [55.1, 356.0], [55.2, 357.0], [55.3, 358.0], [55.4, 362.0], [55.5, 363.0], [55.6, 365.0], [55.7, 366.0], [55.8, 367.0], [55.9, 368.0], [56.0, 368.0], [56.1, 369.0], [56.2, 369.0], [56.3, 369.0], [56.4, 373.0], [56.5, 374.0], [56.6, 374.0], [56.7, 376.0], [56.8, 376.0], [56.9, 377.0], [57.0, 379.0], [57.1, 381.0], [57.2, 381.0], [57.3, 382.0], [57.4, 383.0], [57.5, 383.0], [57.6, 384.0], [57.7, 385.0], [57.8, 388.0], [57.9, 388.0], [58.0, 391.0], [58.1, 393.0], [58.2, 393.0], [58.3, 394.0], [58.4, 395.0], [58.5, 396.0], [58.6, 398.0], [58.7, 400.0], [58.8, 403.0], [58.9, 403.0], [59.0, 406.0], [59.1, 406.0], [59.2, 407.0], [59.3, 409.0], [59.4, 409.0], [59.5, 411.0], [59.6, 414.0], [59.7, 416.0], [59.8, 418.0], [59.9, 419.0], [60.0, 419.0], [60.1, 420.0], [60.2, 420.0], [60.3, 421.0], [60.4, 421.0], [60.5, 421.0], [60.6, 422.0], [60.7, 423.0], [60.8, 424.0], [60.9, 428.0], [61.0, 429.0], [61.1, 430.0], [61.2, 431.0], [61.3, 432.0], [61.4, 433.0], [61.5, 436.0], [61.6, 438.0], [61.7, 438.0], [61.8, 442.0], [61.9, 443.0], [62.0, 443.0], [62.1, 446.0], [62.2, 447.0], [62.3, 448.0], [62.4, 451.0], [62.5, 455.0], [62.6, 457.0], [62.7, 457.0], [62.8, 457.0], [62.9, 457.0], [63.0, 460.0], [63.1, 464.0], [63.2, 466.0], [63.3, 467.0], [63.4, 467.0], [63.5, 468.0], [63.6, 471.0], [63.7, 472.0], [63.8, 474.0], [63.9, 474.0], [64.0, 477.0], [64.1, 477.0], [64.2, 478.0], [64.3, 479.0], [64.4, 480.0], [64.5, 484.0], [64.6, 486.0], [64.7, 488.0], [64.8, 490.0], [64.9, 491.0], [65.0, 492.0], [65.1, 493.0], [65.2, 496.0], [65.3, 497.0], [65.4, 498.0], [65.5, 498.0], [65.6, 501.0], [65.7, 502.0], [65.8, 506.0], [65.9, 507.0], [66.0, 508.0], [66.1, 509.0], [66.2, 509.0], [66.3, 510.0], [66.4, 511.0], [66.5, 511.0], [66.6, 513.0], [66.7, 513.0], [66.8, 514.0], [66.9, 515.0], [67.0, 516.0], [67.1, 516.0], [67.2, 516.0], [67.3, 517.0], [67.4, 518.0], [67.5, 521.0], [67.6, 521.0], [67.7, 522.0], [67.8, 524.0], [67.9, 526.0], [68.0, 527.0], [68.1, 528.0], [68.2, 528.0], [68.3, 532.0], [68.4, 533.0], [68.5, 533.0], [68.6, 534.0], [68.7, 537.0], [68.8, 538.0], [68.9, 538.0], [69.0, 538.0], [69.1, 545.0], [69.2, 546.0], [69.3, 547.0], [69.4, 547.0], [69.5, 547.0], [69.6, 549.0], [69.7, 550.0], [69.8, 551.0], [69.9, 556.0], [70.0, 557.0], [70.1, 557.0], [70.2, 557.0], [70.3, 562.0], [70.4, 566.0], [70.5, 567.0], [70.6, 567.0], [70.7, 568.0], [70.8, 575.0], [70.9, 575.0], [71.0, 576.0], [71.1, 577.0], [71.2, 577.0], [71.3, 578.0], [71.4, 583.0], [71.5, 585.0], [71.6, 585.0], [71.7, 588.0], [71.8, 588.0], [71.9, 589.0], [72.0, 590.0], [72.1, 595.0], [72.2, 595.0], [72.3, 597.0], [72.4, 599.0], [72.5, 602.0], [72.6, 602.0], [72.7, 605.0], [72.8, 606.0], [72.9, 607.0], [73.0, 609.0], [73.1, 611.0], [73.2, 614.0], [73.3, 615.0], [73.4, 616.0], [73.5, 617.0], [73.6, 618.0], [73.7, 620.0], [73.8, 626.0], [73.9, 627.0], [74.0, 628.0], [74.1, 628.0], [74.2, 629.0], [74.3, 629.0], [74.4, 636.0], [74.5, 638.0], [74.6, 638.0], [74.7, 639.0], [74.8, 640.0], [74.9, 643.0], [75.0, 643.0], [75.1, 646.0], [75.2, 648.0], [75.3, 648.0], [75.4, 649.0], [75.5, 649.0], [75.6, 655.0], [75.7, 655.0], [75.8, 656.0], [75.9, 657.0], [76.0, 659.0], [76.1, 659.0], [76.2, 659.0], [76.3, 660.0], [76.4, 660.0], [76.5, 663.0], [76.6, 666.0], [76.7, 667.0], [76.8, 669.0], [76.9, 669.0], [77.0, 670.0], [77.1, 670.0], [77.2, 673.0], [77.3, 675.0], [77.4, 677.0], [77.5, 677.0], [77.6, 678.0], [77.7, 678.0], [77.8, 681.0], [77.9, 683.0], [78.0, 683.0], [78.1, 689.0], [78.2, 689.0], [78.3, 692.0], [78.4, 694.0], [78.5, 694.0], [78.6, 695.0], [78.7, 698.0], [78.8, 699.0], [78.9, 703.0], [79.0, 705.0], [79.1, 709.0], [79.2, 709.0], [79.3, 709.0], [79.4, 709.0], [79.5, 714.0], [79.6, 716.0], [79.7, 719.0], [79.8, 720.0], [79.9, 722.0], [80.0, 724.0], [80.1, 726.0], [80.2, 729.0], [80.3, 730.0], [80.4, 735.0], [80.5, 736.0], [80.6, 736.0], [80.7, 739.0], [80.8, 741.0], [80.9, 745.0], [81.0, 746.0], [81.1, 747.0], [81.2, 749.0], [81.3, 749.0], [81.4, 750.0], [81.5, 756.0], [81.6, 758.0], [81.7, 760.0], [81.8, 760.0], [81.9, 761.0], [82.0, 762.0], [82.1, 767.0], [82.2, 767.0], [82.3, 767.0], [82.4, 770.0], [82.5, 770.0], [82.6, 771.0], [82.7, 776.0], [82.8, 779.0], [82.9, 780.0], [83.0, 781.0], [83.1, 781.0], [83.2, 789.0], [83.3, 790.0], [83.4, 790.0], [83.5, 791.0], [83.6, 791.0], [83.7, 792.0], [83.8, 798.0], [83.9, 801.0], [84.0, 802.0], [84.1, 802.0], [84.2, 803.0], [84.3, 805.0], [84.4, 808.0], [84.5, 811.0], [84.6, 812.0], [84.7, 812.0], [84.8, 815.0], [84.9, 817.0], [85.0, 819.0], [85.1, 822.0], [85.2, 822.0], [85.3, 825.0], [85.4, 829.0], [85.5, 829.0], [85.6, 830.0], [85.7, 832.0], [85.8, 833.0], [85.9, 835.0], [86.0, 840.0], [86.1, 841.0], [86.2, 842.0], [86.3, 843.0], [86.4, 844.0], [86.5, 846.0], [86.6, 850.0], [86.7, 854.0], [86.8, 854.0], [86.9, 856.0], [87.0, 857.0], [87.1, 858.0], [87.2, 861.0], [87.3, 863.0], [87.4, 864.0], [87.5, 866.0], [87.6, 870.0], [87.7, 871.0], [87.8, 871.0], [87.9, 871.0], [88.0, 875.0], [88.1, 877.0], [88.2, 881.0], [88.3, 883.0], [88.4, 884.0], [88.5, 889.0], [88.6, 891.0], [88.7, 894.0], [88.8, 894.0], [88.9, 897.0], [89.0, 900.0], [89.1, 901.0], [89.2, 903.0], [89.3, 903.0], [89.4, 909.0], [89.5, 910.0], [89.6, 914.0], [89.7, 914.0], [89.8, 914.0], [89.9, 916.0], [90.0, 919.0], [90.1, 923.0], [90.2, 924.0], [90.3, 926.0], [90.4, 934.0], [90.5, 935.0], [90.6, 935.0], [90.7, 938.0], [90.8, 942.0], [90.9, 944.0], [91.0, 945.0], [91.1, 945.0], [91.2, 950.0], [91.3, 955.0], [91.4, 956.0], [91.5, 957.0], [91.6, 960.0], [91.7, 966.0], [91.8, 967.0], [91.9, 968.0], [92.0, 972.0], [92.1, 977.0], [92.2, 977.0], [92.3, 978.0], [92.4, 983.0], [92.5, 986.0], [92.6, 987.0], [92.7, 988.0], [92.8, 989.0], [92.9, 994.0], [93.0, 996.0], [93.1, 1001.0], [93.2, 1005.0], [93.3, 1006.0], [93.4, 1008.0], [93.5, 1009.0], [93.6, 1012.0], [93.7, 1015.0], [93.8, 1016.0], [93.9, 1019.0], [94.0, 1021.0], [94.1, 1025.0], [94.2, 1030.0], [94.3, 1030.0], [94.4, 1031.0], [94.5, 1036.0], [94.6, 1042.0], [94.7, 1042.0], [94.8, 1045.0], [94.9, 1046.0], [95.0, 1053.0], [95.1, 1054.0], [95.2, 1057.0], [95.3, 1059.0], [95.4, 1064.0], [95.5, 1067.0], [95.6, 1072.0], [95.7, 1075.0], [95.8, 1075.0], [95.9, 1077.0], [96.0, 1079.0], [96.1, 1085.0], [96.2, 1086.0], [96.3, 1086.0], [96.4, 1087.0], [96.5, 1096.0], [96.6, 1096.0], [96.7, 1105.0], [96.8, 1109.0], [96.9, 1116.0], [97.0, 1125.0], [97.1, 1128.0], [97.2, 1131.0], [97.3, 1135.0], [97.4, 1139.0], [97.5, 1144.0], [97.6, 1146.0], [97.7, 1153.0], [97.8, 1156.0], [97.9, 1167.0], [98.0, 1176.0], [98.1, 1186.0], [98.2, 1195.0], [98.3, 1198.0], [98.4, 1205.0], [98.5, 1212.0], [98.6, 1214.0], [98.7, 1224.0], [98.8, 1228.0], [98.9, 1231.0], [99.0, 1233.0], [99.1, 1258.0], [99.2, 1266.0], [99.3, 1285.0], [99.4, 1301.0], [99.5, 1308.0], [99.6, 1310.0], [99.7, 1335.0], [99.8, 1335.0], [99.9, 1355.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 6.0, "minX": 0.0, "maxY": 202.0, "series": [{"data": [[0.0, 127.0], [600.0, 64.0], [700.0, 50.0], [200.0, 202.0], [800.0, 51.0], [900.0, 41.0], [1000.0, 36.0], [1100.0, 17.0], [300.0, 93.0], [1200.0, 10.0], [1300.0, 6.0], [100.0, 164.0], [400.0, 69.0], [500.0, 70.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 150.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 505.0, "series": [{"data": [[1.0, 345.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 150.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 505.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 719.962999999999, "minX": 1.52523198E12, "maxY": 719.962999999999, "series": [{"data": [[1.52523198E12, 719.962999999999]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52523198E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 0.0, "minX": 313.0, "maxY": 1310.0, "series": [{"data": [[314.0, 157.28571428571428], [319.0, 188.5], [317.0, 230.0], [316.0, 156.45454545454547], [313.0, 225.25], [315.0, 197.5], [334.0, 240.0], [335.0, 107.0], [332.0, 200.6], [321.0, 146.14285714285714], [322.0, 186.66666666666666], [330.0, 176.5], [331.0, 100.0], [329.0, 161.26666666666665], [328.0, 227.5], [326.0, 152.75], [324.0, 216.8], [327.0, 197.0], [347.0, 203.33333333333334], [336.0, 176.0], [349.0, 212.0], [351.0, 450.75], [345.0, 193.0], [337.0, 241.0], [344.0, 214.33333333333334], [342.0, 240.0], [343.0, 166.6], [358.0, 161.75], [359.0, 132.5], [360.0, 194.2], [362.0, 247.0], [361.0, 240.0], [363.0, 1195.0], [355.0, 1205.0], [369.0, 245.0], [372.0, 210.00000000000003], [373.0, 232.0], [375.0, 251.0], [374.0, 1186.0], [377.0, 17.0], [383.0, 126.4], [378.0, 131.11111111111111], [379.0, 414.75], [380.0, 126.0], [370.0, 177.0], [382.0, 169.0], [386.0, 507.0], [387.0, 163.0], [389.0, 262.0], [392.0, 29.5], [395.0, 27.5], [394.0, 1156.0], [412.0, 25.5], [400.0, 114.33333333333333], [405.0, 215.0], [406.0, 43.0], [408.0, 29.0], [410.0, 47.0], [413.0, 272.0], [407.0, 1135.0], [401.0, 1146.0], [416.0, 574.0], [418.0, 172.0], [424.0, 34.5], [425.0, 14.0], [426.0, 103.5], [430.0, 35.0], [431.0, 185.5], [429.0, 1116.0], [436.0, 56.0], [437.0, 39.0], [438.0, 708.0], [439.0, 21.0], [443.0, 17.0], [444.0, 199.0], [446.0, 1096.0], [448.0, 70.0], [451.0, 172.5], [452.0, 38.0], [453.0, 29.0], [455.0, 30.0], [456.0, 93.0], [457.0, 216.0], [463.0, 199.0], [454.0, 1087.0], [464.0, 84.0], [466.0, 388.3333333333333], [469.0, 125.0], [475.0, 181.5], [477.0, 581.5], [478.0, 63.0], [479.0, 48.0], [481.0, 173.66666666666669], [486.0, 358.0], [488.0, 89.0], [490.0, 91.5], [491.0, 60.0], [493.0, 230.0], [494.0, 1046.0], [487.0, 1057.0], [496.0, 539.0], [499.0, 187.5], [503.0, 104.0], [505.0, 487.0], [507.0, 141.0], [510.0, 55.0], [511.0, 382.0], [501.0, 1025.0], [514.0, 560.0], [517.0, 122.0], [519.0, 996.0], [538.0, 81.0], [542.0, 967.0], [528.0, 986.0], [520.0, 241.5], [521.0, 156.0], [523.0, 266.0], [524.0, 68.0], [529.0, 127.0], [533.0, 545.0], [534.0, 126.0], [535.0, 320.3333333333333], [548.0, 421.0], [546.0, 211.5], [545.0, 141.0], [547.0, 153.0], [551.0, 92.0], [569.0, 671.0], [570.0, 148.0], [571.0, 149.5], [572.0, 197.0], [575.0, 383.0], [558.0, 284.5], [554.0, 945.0], [552.0, 957.0], [559.0, 156.33333333333334], [560.0, 176.0], [562.0, 651.5], [564.0, 105.0], [576.0, 515.0], [583.0, 345.5], [584.0, 179.5], [585.0, 199.0], [586.0, 289.0], [588.0, 903.0], [591.0, 329.6], [590.0, 278.0], [603.0, 401.8], [604.0, 302.0], [596.0, 894.0], [611.0, 523.5], [608.0, 215.0], [622.0, 919.0], [613.0, 347.5], [615.0, 192.0], [617.0, 339.6666666666667], [618.0, 171.0], [619.0, 366.14285714285717], [620.0, 863.0], [621.0, 84.0], [632.0, 214.0], [635.0, 900.0], [639.0, 270.0], [631.0, 876.5], [625.0, 854.0], [636.0, 959.5], [666.0, 515.0], [643.0, 421.0], [640.0, 294.0], [641.0, 891.0], [644.0, 131.0], [647.0, 822.0], [653.0, 197.0], [652.0, 881.0], [648.0, 1075.0], [654.0, 506.0], [657.0, 86.0], [658.0, 271.0], [663.0, 296.0], [659.0, 938.0], [667.0, 189.5], [668.0, 708.0], [702.0, 211.0], [678.0, 363.8], [675.0, 228.0], [673.0, 927.0], [679.0, 200.5], [696.0, 1021.0], [699.0, 924.25], [697.0, 939.5], [681.0, 419.0], [684.0, 1042.0], [686.0, 791.0], [689.0, 242.0], [690.0, 586.5], [691.0, 411.4285714285714], [693.0, 514.0], [694.0, 840.0], [703.0, 101.0], [717.0, 588.0], [706.0, 458.0], [713.0, 346.0], [712.0, 949.0], [714.0, 136.5], [715.0, 525.0], [716.0, 1012.5], [718.0, 25.0], [719.0, 884.4], [705.0, 819.0], [720.0, 249.0], [734.0, 263.0], [733.0, 785.3333333333334], [735.0, 490.0], [728.0, 236.0], [711.0, 736.0], [708.0, 898.0], [707.0, 915.5], [732.0, 159.5], [721.0, 612.5], [724.0, 525.5], [726.0, 545.0], [727.0, 529.5], [742.0, 167.0], [738.0, 406.0], [737.0, 1016.0], [741.0, 861.6666666666666], [743.0, 48.0], [745.0, 394.0], [746.0, 694.5], [748.0, 637.0], [751.0, 80.0], [749.0, 720.0], [755.0, 507.83333333333337], [758.0, 511.0], [759.0, 639.0], [761.0, 350.5], [763.0, 592.1666666666666], [767.0, 71.0], [752.0, 649.0], [771.0, 276.0], [770.0, 604.6666666666666], [772.0, 640.0], [773.0, 738.0], [774.0, 364.0], [775.0, 303.0], [792.0, 73.0], [793.0, 120.0], [795.0, 139.0], [798.0, 301.0], [797.0, 657.0], [776.0, 105.0], [778.0, 82.0], [783.0, 159.0], [782.0, 769.75], [779.0, 1310.0], [787.0, 674.8], [790.0, 93.0], [789.0, 599.0], [788.0, 938.0], [791.0, 572.5], [804.0, 94.5], [800.0, 819.6666666666667], [805.0, 328.0], [807.0, 142.5], [810.0, 313.0], [808.0, 926.0], [812.0, 588.0], [813.0, 443.0], [814.0, 660.0], [815.0, 96.0], [817.0, 116.0], [830.0, 151.5], [831.0, 352.0], [825.0, 643.0], [824.0, 648.0], [827.0, 107.0], [818.0, 340.0], [819.0, 162.0], [820.0, 148.0], [821.0, 568.5], [822.0, 455.0], [835.0, 466.0], [833.0, 246.0], [832.0, 943.0], [834.0, 914.0], [838.0, 709.0], [856.0, 602.0], [858.0, 181.0], [859.0, 490.0], [861.0, 788.0], [840.0, 118.0], [842.0, 229.0], [845.0, 491.0], [844.0, 803.0], [847.0, 324.0], [849.0, 694.0], [852.0, 130.0], [853.0, 312.0], [870.0, 216.33333333333334], [866.0, 142.0], [865.0, 210.0], [869.0, 162.0], [868.0, 653.0], [871.0, 502.0], [888.0, 731.0], [892.0, 165.0], [894.0, 263.0], [895.0, 324.5], [873.0, 726.5], [876.0, 220.0], [880.0, 153.0], [882.0, 214.25], [883.0, 521.0], [885.0, 758.0], [884.0, 557.0], [898.0, 649.0], [899.0, 566.0], [901.0, 617.0], [920.0, 550.0], [922.0, 644.3333333333334], [927.0, 655.0], [917.0, 606.0], [913.0, 1301.0], [905.0, 176.0], [906.0, 330.66666666666663], [907.0, 387.6666666666667], [910.0, 666.3333333333334], [911.0, 268.0], [918.0, 199.5], [919.0, 262.3333333333333], [933.0, 449.5], [930.0, 321.5], [929.0, 200.0], [943.0, 647.0], [931.0, 247.0], [941.0, 432.0], [942.0, 213.0], [944.0, 502.75], [959.0, 521.0], [957.0, 274.0], [958.0, 418.5], [955.0, 300.0], [956.0, 829.0], [952.0, 442.0], [953.0, 223.0], [945.0, 696.0], [947.0, 406.5], [946.0, 595.0], [949.0, 864.0], [974.0, 360.5], [962.0, 179.0], [963.0, 451.0], [965.0, 234.0], [964.0, 636.0], [984.0, 575.0], [966.0, 854.0], [985.0, 362.0], [986.0, 522.3333333333333], [987.0, 454.0], [988.0, 182.0], [989.0, 0.0], [990.0, 1.0], [991.0, 857.0], [968.0, 577.5], [970.0, 602.0], [972.0, 288.0], [971.0, 420.0], [975.0, 190.0], [960.0, 1017.0], [961.0, 585.0], [977.0, 244.0], [980.0, 536.5], [983.0, 511.0], [994.0, 113.33333333333334], [992.0, 0.5], [995.0, 1.0], [996.0, 296.0], [997.0, 1.0], [998.0, 313.5], [999.0, 155.5], [1000.0, 545.0551181102363], [993.0, 842.0]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[719.9639999999999, 420.34799999999973]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1000.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 94769.61666666667, "minX": 1.52523198E12, "maxY": 156127.0, "series": [{"data": [[1.52523198E12, 156127.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52523198E12, 94769.61666666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52523198E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 420.34799999999973, "minX": 1.52523198E12, "maxY": 420.34799999999973, "series": [{"data": [[1.52523198E12, 420.34799999999973]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52523198E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 419.8359999999998, "minX": 1.52523198E12, "maxY": 419.8359999999998, "series": [{"data": [[1.52523198E12, 419.8359999999998]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52523198E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 25.288999999999962, "minX": 1.52523198E12, "maxY": 25.288999999999962, "series": [{"data": [[1.52523198E12, 25.288999999999962]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52523198E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 13.0, "minX": 1.52523198E12, "maxY": 1355.0, "series": [{"data": [[1.52523198E12, 1355.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52523198E12, 13.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52523198E12, 956.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52523198E12, 1261.92]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52523198E12, 1075.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52523198E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 180.0, "minX": 16.0, "maxY": 383.5, "series": [{"data": [[16.0, 383.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[16.0, 180.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 167.0, "minX": 16.0, "maxY": 383.5, "series": [{"data": [[16.0, 383.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[16.0, 167.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.52523198E12, "maxY": 16.666666666666668, "series": [{"data": [[1.52523198E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52523198E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 2.5, "minX": 1.52523198E12, "maxY": 14.166666666666666, "series": [{"data": [[1.52523198E12, 14.166666666666666]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52523198E12, 2.5]], "isOverall": false, "label": "502", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52523198E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 2.5, "minX": 1.52523198E12, "maxY": 14.166666666666666, "series": [{"data": [[1.52523198E12, 14.166666666666666]], "isOverall": false, "label": "inference-success", "isController": false}, {"data": [[1.52523198E12, 2.5]], "isOverall": false, "label": "inference-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52523198E12, "title": "Transactions Per Second"}},
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
