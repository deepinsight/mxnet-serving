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
        data: {"result": {"minY": 397.0, "minX": 0.0, "maxY": 11629.0, "series": [{"data": [[0.0, 397.0], [0.1, 397.0], [0.2, 397.0], [0.3, 397.0], [0.4, 397.0], [0.5, 397.0], [0.6, 397.0], [0.7, 397.0], [0.8, 397.0], [0.9, 397.0], [1.0, 611.0], [1.1, 611.0], [1.2, 611.0], [1.3, 611.0], [1.4, 611.0], [1.5, 611.0], [1.6, 611.0], [1.7, 611.0], [1.8, 611.0], [1.9, 611.0], [2.0, 734.0], [2.1, 734.0], [2.2, 734.0], [2.3, 734.0], [2.4, 734.0], [2.5, 734.0], [2.6, 734.0], [2.7, 734.0], [2.8, 734.0], [2.9, 734.0], [3.0, 847.0], [3.1, 847.0], [3.2, 847.0], [3.3, 847.0], [3.4, 847.0], [3.5, 847.0], [3.6, 847.0], [3.7, 847.0], [3.8, 847.0], [3.9, 847.0], [4.0, 956.0], [4.1, 956.0], [4.2, 956.0], [4.3, 956.0], [4.4, 956.0], [4.5, 956.0], [4.6, 956.0], [4.7, 956.0], [4.8, 956.0], [4.9, 956.0], [5.0, 1064.0], [5.1, 1064.0], [5.2, 1064.0], [5.3, 1064.0], [5.4, 1064.0], [5.5, 1064.0], [5.6, 1064.0], [5.7, 1064.0], [5.8, 1064.0], [5.9, 1064.0], [6.0, 1183.0], [6.1, 1183.0], [6.2, 1183.0], [6.3, 1183.0], [6.4, 1183.0], [6.5, 1183.0], [6.6, 1183.0], [6.7, 1183.0], [6.8, 1183.0], [6.9, 1183.0], [7.0, 1292.0], [7.1, 1292.0], [7.2, 1292.0], [7.3, 1292.0], [7.4, 1292.0], [7.5, 1292.0], [7.6, 1292.0], [7.7, 1292.0], [7.8, 1292.0], [7.9, 1292.0], [8.0, 1398.0], [8.1, 1398.0], [8.2, 1398.0], [8.3, 1398.0], [8.4, 1398.0], [8.5, 1398.0], [8.6, 1398.0], [8.7, 1398.0], [8.8, 1398.0], [8.9, 1398.0], [9.0, 1510.0], [9.1, 1510.0], [9.2, 1510.0], [9.3, 1510.0], [9.4, 1510.0], [9.5, 1510.0], [9.6, 1510.0], [9.7, 1510.0], [9.8, 1510.0], [9.9, 1510.0], [10.0, 1620.0], [10.1, 1620.0], [10.2, 1620.0], [10.3, 1620.0], [10.4, 1620.0], [10.5, 1620.0], [10.6, 1620.0], [10.7, 1620.0], [10.8, 1620.0], [10.9, 1620.0], [11.0, 1728.0], [11.1, 1728.0], [11.2, 1728.0], [11.3, 1728.0], [11.4, 1728.0], [11.5, 1728.0], [11.6, 1728.0], [11.7, 1728.0], [11.8, 1728.0], [11.9, 1728.0], [12.0, 1840.0], [12.1, 1840.0], [12.2, 1840.0], [12.3, 1840.0], [12.4, 1840.0], [12.5, 1840.0], [12.6, 1840.0], [12.7, 1840.0], [12.8, 1840.0], [12.9, 1840.0], [13.0, 1949.0], [13.1, 1949.0], [13.2, 1949.0], [13.3, 1949.0], [13.4, 1949.0], [13.5, 1949.0], [13.6, 1949.0], [13.7, 1949.0], [13.8, 1949.0], [13.9, 1949.0], [14.0, 2055.0], [14.1, 2055.0], [14.2, 2055.0], [14.3, 2055.0], [14.4, 2055.0], [14.5, 2055.0], [14.6, 2055.0], [14.7, 2055.0], [14.8, 2055.0], [14.9, 2055.0], [15.0, 2226.0], [15.1, 2226.0], [15.2, 2226.0], [15.3, 2226.0], [15.4, 2226.0], [15.5, 2226.0], [15.6, 2226.0], [15.7, 2226.0], [15.8, 2226.0], [15.9, 2226.0], [16.0, 2339.0], [16.1, 2339.0], [16.2, 2339.0], [16.3, 2339.0], [16.4, 2339.0], [16.5, 2339.0], [16.6, 2339.0], [16.7, 2339.0], [16.8, 2339.0], [16.9, 2339.0], [17.0, 2449.0], [17.1, 2449.0], [17.2, 2449.0], [17.3, 2449.0], [17.4, 2449.0], [17.5, 2449.0], [17.6, 2449.0], [17.7, 2449.0], [17.8, 2449.0], [17.9, 2449.0], [18.0, 2568.0], [18.1, 2568.0], [18.2, 2568.0], [18.3, 2568.0], [18.4, 2568.0], [18.5, 2568.0], [18.6, 2568.0], [18.7, 2568.0], [18.8, 2568.0], [18.9, 2568.0], [19.0, 2674.0], [19.1, 2674.0], [19.2, 2674.0], [19.3, 2674.0], [19.4, 2674.0], [19.5, 2674.0], [19.6, 2674.0], [19.7, 2674.0], [19.8, 2674.0], [19.9, 2674.0], [20.0, 2784.0], [20.1, 2784.0], [20.2, 2784.0], [20.3, 2784.0], [20.4, 2784.0], [20.5, 2784.0], [20.6, 2784.0], [20.7, 2784.0], [20.8, 2784.0], [20.9, 2784.0], [21.0, 2891.0], [21.1, 2891.0], [21.2, 2891.0], [21.3, 2891.0], [21.4, 2891.0], [21.5, 2891.0], [21.6, 2891.0], [21.7, 2891.0], [21.8, 2891.0], [21.9, 2891.0], [22.0, 3001.0], [22.1, 3001.0], [22.2, 3001.0], [22.3, 3001.0], [22.4, 3001.0], [22.5, 3001.0], [22.6, 3001.0], [22.7, 3001.0], [22.8, 3001.0], [22.9, 3001.0], [23.0, 3109.0], [23.1, 3109.0], [23.2, 3109.0], [23.3, 3109.0], [23.4, 3109.0], [23.5, 3109.0], [23.6, 3109.0], [23.7, 3109.0], [23.8, 3109.0], [23.9, 3109.0], [24.0, 3220.0], [24.1, 3220.0], [24.2, 3220.0], [24.3, 3220.0], [24.4, 3220.0], [24.5, 3220.0], [24.6, 3220.0], [24.7, 3220.0], [24.8, 3220.0], [24.9, 3220.0], [25.0, 3342.0], [25.1, 3342.0], [25.2, 3342.0], [25.3, 3342.0], [25.4, 3342.0], [25.5, 3342.0], [25.6, 3342.0], [25.7, 3342.0], [25.8, 3342.0], [25.9, 3342.0], [26.0, 3449.0], [26.1, 3449.0], [26.2, 3449.0], [26.3, 3449.0], [26.4, 3449.0], [26.5, 3449.0], [26.6, 3449.0], [26.7, 3449.0], [26.8, 3449.0], [26.9, 3449.0], [27.0, 3555.0], [27.1, 3555.0], [27.2, 3555.0], [27.3, 3555.0], [27.4, 3555.0], [27.5, 3555.0], [27.6, 3555.0], [27.7, 3555.0], [27.8, 3555.0], [27.9, 3555.0], [28.0, 3674.0], [28.1, 3674.0], [28.2, 3674.0], [28.3, 3674.0], [28.4, 3674.0], [28.5, 3674.0], [28.6, 3674.0], [28.7, 3674.0], [28.8, 3674.0], [28.9, 3674.0], [29.0, 3784.0], [29.1, 3784.0], [29.2, 3784.0], [29.3, 3784.0], [29.4, 3784.0], [29.5, 3784.0], [29.6, 3784.0], [29.7, 3784.0], [29.8, 3784.0], [29.9, 3784.0], [30.0, 3918.0], [30.1, 3918.0], [30.2, 3918.0], [30.3, 3918.0], [30.4, 3918.0], [30.5, 3918.0], [30.6, 3918.0], [30.7, 3918.0], [30.8, 3918.0], [30.9, 3918.0], [31.0, 4025.0], [31.1, 4025.0], [31.2, 4025.0], [31.3, 4025.0], [31.4, 4025.0], [31.5, 4025.0], [31.6, 4025.0], [31.7, 4025.0], [31.8, 4025.0], [31.9, 4025.0], [32.0, 4130.0], [32.1, 4130.0], [32.2, 4130.0], [32.3, 4130.0], [32.4, 4130.0], [32.5, 4130.0], [32.6, 4130.0], [32.7, 4130.0], [32.8, 4130.0], [32.9, 4130.0], [33.0, 4239.0], [33.1, 4239.0], [33.2, 4239.0], [33.3, 4239.0], [33.4, 4239.0], [33.5, 4239.0], [33.6, 4239.0], [33.7, 4239.0], [33.8, 4239.0], [33.9, 4239.0], [34.0, 4349.0], [34.1, 4349.0], [34.2, 4349.0], [34.3, 4349.0], [34.4, 4349.0], [34.5, 4349.0], [34.6, 4349.0], [34.7, 4349.0], [34.8, 4349.0], [34.9, 4349.0], [35.0, 4459.0], [35.1, 4459.0], [35.2, 4459.0], [35.3, 4459.0], [35.4, 4459.0], [35.5, 4459.0], [35.6, 4459.0], [35.7, 4459.0], [35.8, 4459.0], [35.9, 4459.0], [36.0, 4567.0], [36.1, 4567.0], [36.2, 4567.0], [36.3, 4567.0], [36.4, 4567.0], [36.5, 4567.0], [36.6, 4567.0], [36.7, 4567.0], [36.8, 4567.0], [36.9, 4567.0], [37.0, 4676.0], [37.1, 4676.0], [37.2, 4676.0], [37.3, 4676.0], [37.4, 4676.0], [37.5, 4676.0], [37.6, 4676.0], [37.7, 4676.0], [37.8, 4676.0], [37.9, 4676.0], [38.0, 4820.0], [38.1, 4820.0], [38.2, 4820.0], [38.3, 4820.0], [38.4, 4820.0], [38.5, 4820.0], [38.6, 4820.0], [38.7, 4820.0], [38.8, 4820.0], [38.9, 4820.0], [39.0, 4928.0], [39.1, 4928.0], [39.2, 4928.0], [39.3, 4928.0], [39.4, 4928.0], [39.5, 4928.0], [39.6, 4928.0], [39.7, 4928.0], [39.8, 4928.0], [39.9, 4928.0], [40.0, 5035.0], [40.1, 5035.0], [40.2, 5035.0], [40.3, 5035.0], [40.4, 5035.0], [40.5, 5035.0], [40.6, 5035.0], [40.7, 5035.0], [40.8, 5035.0], [40.9, 5035.0], [41.0, 5147.0], [41.1, 5147.0], [41.2, 5147.0], [41.3, 5147.0], [41.4, 5147.0], [41.5, 5147.0], [41.6, 5147.0], [41.7, 5147.0], [41.8, 5147.0], [41.9, 5147.0], [42.0, 5255.0], [42.1, 5255.0], [42.2, 5255.0], [42.3, 5255.0], [42.4, 5255.0], [42.5, 5255.0], [42.6, 5255.0], [42.7, 5255.0], [42.8, 5255.0], [42.9, 5255.0], [43.0, 5363.0], [43.1, 5363.0], [43.2, 5363.0], [43.3, 5363.0], [43.4, 5363.0], [43.5, 5363.0], [43.6, 5363.0], [43.7, 5363.0], [43.8, 5363.0], [43.9, 5363.0], [44.0, 5469.0], [44.1, 5469.0], [44.2, 5469.0], [44.3, 5469.0], [44.4, 5469.0], [44.5, 5469.0], [44.6, 5469.0], [44.7, 5469.0], [44.8, 5469.0], [44.9, 5469.0], [45.0, 5576.0], [45.1, 5576.0], [45.2, 5576.0], [45.3, 5576.0], [45.4, 5576.0], [45.5, 5576.0], [45.6, 5576.0], [45.7, 5576.0], [45.8, 5576.0], [45.9, 5576.0], [46.0, 5688.0], [46.1, 5688.0], [46.2, 5688.0], [46.3, 5688.0], [46.4, 5688.0], [46.5, 5688.0], [46.6, 5688.0], [46.7, 5688.0], [46.8, 5688.0], [46.9, 5688.0], [47.0, 5799.0], [47.1, 5799.0], [47.2, 5799.0], [47.3, 5799.0], [47.4, 5799.0], [47.5, 5799.0], [47.6, 5799.0], [47.7, 5799.0], [47.8, 5799.0], [47.9, 5799.0], [48.0, 5910.0], [48.1, 5910.0], [48.2, 5910.0], [48.3, 5910.0], [48.4, 5910.0], [48.5, 5910.0], [48.6, 5910.0], [48.7, 5910.0], [48.8, 5910.0], [48.9, 5910.0], [49.0, 6019.0], [49.1, 6019.0], [49.2, 6019.0], [49.3, 6019.0], [49.4, 6019.0], [49.5, 6019.0], [49.6, 6019.0], [49.7, 6019.0], [49.8, 6019.0], [49.9, 6019.0], [50.0, 6125.0], [50.1, 6125.0], [50.2, 6125.0], [50.3, 6125.0], [50.4, 6125.0], [50.5, 6125.0], [50.6, 6125.0], [50.7, 6125.0], [50.8, 6125.0], [50.9, 6125.0], [51.0, 6233.0], [51.1, 6233.0], [51.2, 6233.0], [51.3, 6233.0], [51.4, 6233.0], [51.5, 6233.0], [51.6, 6233.0], [51.7, 6233.0], [51.8, 6233.0], [51.9, 6233.0], [52.0, 6340.0], [52.1, 6340.0], [52.2, 6340.0], [52.3, 6340.0], [52.4, 6340.0], [52.5, 6340.0], [52.6, 6340.0], [52.7, 6340.0], [52.8, 6340.0], [52.9, 6340.0], [53.0, 6443.0], [53.1, 6443.0], [53.2, 6443.0], [53.3, 6443.0], [53.4, 6443.0], [53.5, 6443.0], [53.6, 6443.0], [53.7, 6443.0], [53.8, 6443.0], [53.9, 6443.0], [54.0, 6555.0], [54.1, 6555.0], [54.2, 6555.0], [54.3, 6555.0], [54.4, 6555.0], [54.5, 6555.0], [54.6, 6555.0], [54.7, 6555.0], [54.8, 6555.0], [54.9, 6555.0], [55.0, 6664.0], [55.1, 6664.0], [55.2, 6664.0], [55.3, 6664.0], [55.4, 6664.0], [55.5, 6664.0], [55.6, 6664.0], [55.7, 6664.0], [55.8, 6664.0], [55.9, 6664.0], [56.0, 6776.0], [56.1, 6776.0], [56.2, 6776.0], [56.3, 6776.0], [56.4, 6776.0], [56.5, 6776.0], [56.6, 6776.0], [56.7, 6776.0], [56.8, 6776.0], [56.9, 6776.0], [57.0, 6889.0], [57.1, 6889.0], [57.2, 6889.0], [57.3, 6889.0], [57.4, 6889.0], [57.5, 6889.0], [57.6, 6889.0], [57.7, 6889.0], [57.8, 6889.0], [57.9, 6889.0], [58.0, 7013.0], [58.1, 7013.0], [58.2, 7013.0], [58.3, 7013.0], [58.4, 7013.0], [58.5, 7013.0], [58.6, 7013.0], [58.7, 7013.0], [58.8, 7013.0], [58.9, 7013.0], [59.0, 7120.0], [59.1, 7120.0], [59.2, 7120.0], [59.3, 7120.0], [59.4, 7120.0], [59.5, 7120.0], [59.6, 7120.0], [59.7, 7120.0], [59.8, 7120.0], [59.9, 7120.0], [60.0, 7233.0], [60.1, 7233.0], [60.2, 7233.0], [60.3, 7233.0], [60.4, 7233.0], [60.5, 7233.0], [60.6, 7233.0], [60.7, 7233.0], [60.8, 7233.0], [60.9, 7233.0], [61.0, 7345.0], [61.1, 7345.0], [61.2, 7345.0], [61.3, 7345.0], [61.4, 7345.0], [61.5, 7345.0], [61.6, 7345.0], [61.7, 7345.0], [61.8, 7345.0], [61.9, 7345.0], [62.0, 7457.0], [62.1, 7457.0], [62.2, 7457.0], [62.3, 7457.0], [62.4, 7457.0], [62.5, 7457.0], [62.6, 7457.0], [62.7, 7457.0], [62.8, 7457.0], [62.9, 7457.0], [63.0, 7569.0], [63.1, 7569.0], [63.2, 7569.0], [63.3, 7569.0], [63.4, 7569.0], [63.5, 7569.0], [63.6, 7569.0], [63.7, 7569.0], [63.8, 7569.0], [63.9, 7569.0], [64.0, 7686.0], [64.1, 7686.0], [64.2, 7686.0], [64.3, 7686.0], [64.4, 7686.0], [64.5, 7686.0], [64.6, 7686.0], [64.7, 7686.0], [64.8, 7686.0], [64.9, 7686.0], [65.0, 7798.0], [65.1, 7798.0], [65.2, 7798.0], [65.3, 7798.0], [65.4, 7798.0], [65.5, 7798.0], [65.6, 7798.0], [65.7, 7798.0], [65.8, 7798.0], [65.9, 7798.0], [66.0, 7909.0], [66.1, 7909.0], [66.2, 7909.0], [66.3, 7909.0], [66.4, 7909.0], [66.5, 7909.0], [66.6, 7909.0], [66.7, 7909.0], [66.8, 7909.0], [66.9, 7909.0], [67.0, 8022.0], [67.1, 8022.0], [67.2, 8022.0], [67.3, 8022.0], [67.4, 8022.0], [67.5, 8022.0], [67.6, 8022.0], [67.7, 8022.0], [67.8, 8022.0], [67.9, 8022.0], [68.0, 8125.0], [68.1, 8125.0], [68.2, 8125.0], [68.3, 8125.0], [68.4, 8125.0], [68.5, 8125.0], [68.6, 8125.0], [68.7, 8125.0], [68.8, 8125.0], [68.9, 8125.0], [69.0, 8236.0], [69.1, 8236.0], [69.2, 8236.0], [69.3, 8236.0], [69.4, 8236.0], [69.5, 8236.0], [69.6, 8236.0], [69.7, 8236.0], [69.8, 8236.0], [69.9, 8236.0], [70.0, 8347.0], [70.1, 8347.0], [70.2, 8347.0], [70.3, 8347.0], [70.4, 8347.0], [70.5, 8347.0], [70.6, 8347.0], [70.7, 8347.0], [70.8, 8347.0], [70.9, 8347.0], [71.0, 8454.0], [71.1, 8454.0], [71.2, 8454.0], [71.3, 8454.0], [71.4, 8454.0], [71.5, 8454.0], [71.6, 8454.0], [71.7, 8454.0], [71.8, 8454.0], [71.9, 8454.0], [72.0, 8566.0], [72.1, 8566.0], [72.2, 8566.0], [72.3, 8566.0], [72.4, 8566.0], [72.5, 8566.0], [72.6, 8566.0], [72.7, 8566.0], [72.8, 8566.0], [72.9, 8566.0], [73.0, 8674.0], [73.1, 8674.0], [73.2, 8674.0], [73.3, 8674.0], [73.4, 8674.0], [73.5, 8674.0], [73.6, 8674.0], [73.7, 8674.0], [73.8, 8674.0], [73.9, 8674.0], [74.0, 8795.0], [74.1, 8795.0], [74.2, 8795.0], [74.3, 8795.0], [74.4, 8795.0], [74.5, 8795.0], [74.6, 8795.0], [74.7, 8795.0], [74.8, 8795.0], [74.9, 8795.0], [75.0, 8919.0], [75.1, 8919.0], [75.2, 8919.0], [75.3, 8919.0], [75.4, 8919.0], [75.5, 8919.0], [75.6, 8919.0], [75.7, 8919.0], [75.8, 8919.0], [75.9, 8919.0], [76.0, 9031.0], [76.1, 9031.0], [76.2, 9031.0], [76.3, 9031.0], [76.4, 9031.0], [76.5, 9031.0], [76.6, 9031.0], [76.7, 9031.0], [76.8, 9031.0], [76.9, 9031.0], [77.0, 9142.0], [77.1, 9142.0], [77.2, 9142.0], [77.3, 9142.0], [77.4, 9142.0], [77.5, 9142.0], [77.6, 9142.0], [77.7, 9142.0], [77.8, 9142.0], [77.9, 9142.0], [78.0, 9249.0], [78.1, 9249.0], [78.2, 9249.0], [78.3, 9249.0], [78.4, 9249.0], [78.5, 9249.0], [78.6, 9249.0], [78.7, 9249.0], [78.8, 9249.0], [78.9, 9249.0], [79.0, 9360.0], [79.1, 9360.0], [79.2, 9360.0], [79.3, 9360.0], [79.4, 9360.0], [79.5, 9360.0], [79.6, 9360.0], [79.7, 9360.0], [79.8, 9360.0], [79.9, 9360.0], [80.0, 9462.0], [80.1, 9462.0], [80.2, 9462.0], [80.3, 9462.0], [80.4, 9462.0], [80.5, 9462.0], [80.6, 9462.0], [80.7, 9462.0], [80.8, 9462.0], [80.9, 9462.0], [81.0, 9575.0], [81.1, 9575.0], [81.2, 9575.0], [81.3, 9575.0], [81.4, 9575.0], [81.5, 9575.0], [81.6, 9575.0], [81.7, 9575.0], [81.8, 9575.0], [81.9, 9575.0], [82.0, 9686.0], [82.1, 9686.0], [82.2, 9686.0], [82.3, 9686.0], [82.4, 9686.0], [82.5, 9686.0], [82.6, 9686.0], [82.7, 9686.0], [82.8, 9686.0], [82.9, 9686.0], [83.0, 9789.0], [83.1, 9789.0], [83.2, 9789.0], [83.3, 9789.0], [83.4, 9789.0], [83.5, 9789.0], [83.6, 9789.0], [83.7, 9789.0], [83.8, 9789.0], [83.9, 9789.0], [84.0, 9902.0], [84.1, 9902.0], [84.2, 9902.0], [84.3, 9902.0], [84.4, 9902.0], [84.5, 9902.0], [84.6, 9902.0], [84.7, 9902.0], [84.8, 9902.0], [84.9, 9902.0], [85.0, 10013.0], [85.1, 10013.0], [85.2, 10013.0], [85.3, 10013.0], [85.4, 10013.0], [85.5, 10013.0], [85.6, 10013.0], [85.7, 10013.0], [85.8, 10013.0], [85.9, 10013.0], [86.0, 10146.0], [86.1, 10146.0], [86.2, 10146.0], [86.3, 10146.0], [86.4, 10146.0], [86.5, 10146.0], [86.6, 10146.0], [86.7, 10146.0], [86.8, 10146.0], [86.9, 10146.0], [87.0, 10258.0], [87.1, 10258.0], [87.2, 10258.0], [87.3, 10258.0], [87.4, 10258.0], [87.5, 10258.0], [87.6, 10258.0], [87.7, 10258.0], [87.8, 10258.0], [87.9, 10258.0], [88.0, 10370.0], [88.1, 10370.0], [88.2, 10370.0], [88.3, 10370.0], [88.4, 10370.0], [88.5, 10370.0], [88.6, 10370.0], [88.7, 10370.0], [88.8, 10370.0], [88.9, 10370.0], [89.0, 10494.0], [89.1, 10494.0], [89.2, 10494.0], [89.3, 10494.0], [89.4, 10494.0], [89.5, 10494.0], [89.6, 10494.0], [89.7, 10494.0], [89.8, 10494.0], [89.9, 10494.0], [90.0, 10611.0], [90.1, 10611.0], [90.2, 10611.0], [90.3, 10611.0], [90.4, 10611.0], [90.5, 10611.0], [90.6, 10611.0], [90.7, 10611.0], [90.8, 10611.0], [90.9, 10611.0], [91.0, 10731.0], [91.1, 10731.0], [91.2, 10731.0], [91.3, 10731.0], [91.4, 10731.0], [91.5, 10731.0], [91.6, 10731.0], [91.7, 10731.0], [91.8, 10731.0], [91.9, 10731.0], [92.0, 10849.0], [92.1, 10849.0], [92.2, 10849.0], [92.3, 10849.0], [92.4, 10849.0], [92.5, 10849.0], [92.6, 10849.0], [92.7, 10849.0], [92.8, 10849.0], [92.9, 10849.0], [93.0, 10961.0], [93.1, 10961.0], [93.2, 10961.0], [93.3, 10961.0], [93.4, 10961.0], [93.5, 10961.0], [93.6, 10961.0], [93.7, 10961.0], [93.8, 10961.0], [93.9, 10961.0], [94.0, 11071.0], [94.1, 11071.0], [94.2, 11071.0], [94.3, 11071.0], [94.4, 11071.0], [94.5, 11071.0], [94.6, 11071.0], [94.7, 11071.0], [94.8, 11071.0], [94.9, 11071.0], [95.0, 11186.0], [95.1, 11186.0], [95.2, 11186.0], [95.3, 11186.0], [95.4, 11186.0], [95.5, 11186.0], [95.6, 11186.0], [95.7, 11186.0], [95.8, 11186.0], [95.9, 11186.0], [96.0, 11298.0], [96.1, 11298.0], [96.2, 11298.0], [96.3, 11298.0], [96.4, 11298.0], [96.5, 11298.0], [96.6, 11298.0], [96.7, 11298.0], [96.8, 11298.0], [96.9, 11298.0], [97.0, 11398.0], [97.1, 11398.0], [97.2, 11398.0], [97.3, 11398.0], [97.4, 11398.0], [97.5, 11398.0], [97.6, 11398.0], [97.7, 11398.0], [97.8, 11398.0], [97.9, 11398.0], [98.0, 11515.0], [98.1, 11515.0], [98.2, 11515.0], [98.3, 11515.0], [98.4, 11515.0], [98.5, 11515.0], [98.6, 11515.0], [98.7, 11515.0], [98.8, 11515.0], [98.9, 11515.0], [99.0, 11629.0], [99.1, 11629.0], [99.2, 11629.0], [99.3, 11629.0], [99.4, 11629.0], [99.5, 11629.0], [99.6, 11629.0], [99.7, 11629.0], [99.8, 11629.0], [99.9, 11629.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 300.0, "maxY": 1.0, "series": [{"data": [[300.0, 1.0], [600.0, 1.0], [700.0, 1.0], [800.0, 1.0], [900.0, 1.0], [1000.0, 1.0], [1100.0, 1.0], [1200.0, 1.0], [1300.0, 1.0], [1500.0, 1.0], [1600.0, 1.0], [1700.0, 1.0], [1800.0, 1.0], [1900.0, 1.0], [2000.0, 1.0], [2200.0, 1.0], [2300.0, 1.0], [2400.0, 1.0], [2500.0, 1.0], [2600.0, 1.0], [2700.0, 1.0], [2800.0, 1.0], [3000.0, 1.0], [3100.0, 1.0], [3200.0, 1.0], [3300.0, 1.0], [3400.0, 1.0], [3500.0, 1.0], [3600.0, 1.0], [3700.0, 1.0], [3900.0, 1.0], [4000.0, 1.0], [4100.0, 1.0], [4200.0, 1.0], [4300.0, 1.0], [4400.0, 1.0], [4500.0, 1.0], [4600.0, 1.0], [4800.0, 1.0], [4900.0, 1.0], [5000.0, 1.0], [5100.0, 1.0], [5200.0, 1.0], [5300.0, 1.0], [5400.0, 1.0], [5500.0, 1.0], [5600.0, 1.0], [5700.0, 1.0], [5900.0, 1.0], [6000.0, 1.0], [6100.0, 1.0], [6200.0, 1.0], [6300.0, 1.0], [6400.0, 1.0], [6500.0, 1.0], [6600.0, 1.0], [6700.0, 1.0], [6800.0, 1.0], [7000.0, 1.0], [7100.0, 1.0], [7200.0, 1.0], [7300.0, 1.0], [7400.0, 1.0], [7500.0, 1.0], [7600.0, 1.0], [7700.0, 1.0], [7900.0, 1.0], [8000.0, 1.0], [8100.0, 1.0], [8200.0, 1.0], [8300.0, 1.0], [8400.0, 1.0], [8500.0, 1.0], [8600.0, 1.0], [8700.0, 1.0], [8900.0, 1.0], [9000.0, 1.0], [9100.0, 1.0], [9200.0, 1.0], [9300.0, 1.0], [9400.0, 1.0], [9500.0, 1.0], [9600.0, 1.0], [9700.0, 1.0], [9900.0, 1.0], [10000.0, 1.0], [10100.0, 1.0], [10200.0, 1.0], [10300.0, 1.0], [10400.0, 1.0], [10600.0, 1.0], [10700.0, 1.0], [10800.0, 1.0], [10900.0, 1.0], [11000.0, 1.0], [11100.0, 1.0], [11200.0, 1.0], [11300.0, 1.0], [11500.0, 1.0], [11600.0, 1.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 11600.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 91.0, "series": [{"data": [[1.0, 8.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 91.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 33.39000000000002, "minX": 1.52205342E12, "maxY": 33.39000000000002, "series": [{"data": [[1.52205342E12, 33.39000000000002]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52205342E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 1728.0, "minX": 5.0, "maxY": 11515.0, "series": [{"data": [[5.0, 6013.0], [6.0, 11515.0], [8.0, 7769.0], [10.0, 7663.666666666667], [11.0, 10961.0], [12.0, 5848.0], [14.0, 7432.666666666667], [15.0, 10494.0], [16.0, 4205.666666666666], [17.0, 10258.0], [18.0, 4278.666666666666], [20.0, 5761.5], [21.0, 5761.0], [22.0, 9737.5], [23.0, 1728.0], [24.0, 5706.5], [25.0, 9360.0], [26.0, 5652.0], [27.0, 5684.0], [28.0, 5685.0], [29.0, 5684.0], [30.0, 2568.0], [31.0, 5734.5], [33.0, 5673.75], [32.0, 8674.0], [35.0, 5618.5], [34.0, 8347.0], [36.0, 5617.0], [37.0, 3220.0], [38.0, 6424.333333333333], [39.0, 5623.5], [41.0, 5562.0], [40.0, 7686.0], [42.0, 5565.5], [43.0, 3784.0], [44.0, 5631.5], [45.0, 5629.0], [46.0, 6087.666666666667], [47.0, 5564.0], [49.0, 4349.0], [48.0, 6776.0], [50.0, 5561.5], [51.0, 5855.0], [52.0, 4676.0], [53.0, 6286.5], [54.0, 5472.5], [55.0, 4928.0], [56.0, 5400.333333333333], [57.0, 5582.5], [59.0, 5542.333333333333], [58.0, 5799.0], [60.0, 5469.0]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[33.39000000000002, 6066.4000000000015]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 60.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 9487.45, "minX": 1.52205342E12, "maxY": 23345.0, "series": [{"data": [[1.52205342E12, 23345.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52205342E12, 9487.45]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52205342E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 6066.4000000000015, "minX": 1.52205342E12, "maxY": 6066.4000000000015, "series": [{"data": [[1.52205342E12, 6066.4000000000015]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52205342E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 6066.209999999999, "minX": 1.52205342E12, "maxY": 6066.209999999999, "series": [{"data": [[1.52205342E12, 6066.209999999999]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52205342E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 2.4100000000000006, "minX": 1.52205342E12, "maxY": 2.4100000000000006, "series": [{"data": [[1.52205342E12, 2.4100000000000006]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52205342E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 397.0, "minX": 1.52205342E12, "maxY": 11629.0, "series": [{"data": [[1.52205342E12, 11629.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52205342E12, 397.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52205342E12, 10599.300000000001]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52205342E12, 11627.859999999999]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52205342E12, 11180.249999999998]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52205342E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 6072.0, "minX": 1.0, "maxY": 6072.0, "series": [{"data": [[1.0, 6072.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 6071.5, "minX": 1.0, "maxY": 6071.5, "series": [{"data": [[1.0, 6071.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 1.6666666666666667, "minX": 1.52205342E12, "maxY": 1.6666666666666667, "series": [{"data": [[1.52205342E12, 1.6666666666666667]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52205342E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 1.6666666666666667, "minX": 1.52205342E12, "maxY": 1.6666666666666667, "series": [{"data": [[1.52205342E12, 1.6666666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52205342E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 1.6666666666666667, "minX": 1.52205342E12, "maxY": 1.6666666666666667, "series": [{"data": [[1.52205342E12, 1.6666666666666667]], "isOverall": false, "label": "inference-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52205342E12, "title": "Transactions Per Second"}},
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
