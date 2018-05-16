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
        data: {"result": {"minY": 213.0, "minX": 0.0, "maxY": 30035.0, "series": [{"data": [[0.0, 213.0], [0.1, 213.0], [0.2, 326.0], [0.3, 326.0], [0.4, 540.0], [0.5, 668.0], [0.6, 668.0], [0.7, 863.0], [0.8, 863.0], [0.9, 877.0], [1.0, 991.0], [1.1, 991.0], [1.2, 1103.0], [1.3, 1103.0], [1.4, 1153.0], [1.5, 1208.0], [1.6, 1208.0], [1.7, 1309.0], [1.8, 1309.0], [1.9, 1431.0], [2.0, 1532.0], [2.1, 1532.0], [2.2, 1644.0], [2.3, 1644.0], [2.4, 1762.0], [2.5, 1862.0], [2.6, 1862.0], [2.7, 1964.0], [2.8, 1964.0], [2.9, 1992.0], [3.0, 2072.0], [3.1, 2072.0], [3.2, 2203.0], [3.3, 2203.0], [3.4, 2322.0], [3.5, 2431.0], [3.6, 2431.0], [3.7, 2548.0], [3.8, 2548.0], [3.9, 2650.0], [4.0, 2742.0], [4.1, 2742.0], [4.2, 2851.0], [4.3, 2851.0], [4.4, 2962.0], [4.5, 3063.0], [4.6, 3063.0], [4.7, 3201.0], [4.8, 3201.0], [4.9, 3313.0], [5.0, 3440.0], [5.1, 3440.0], [5.2, 3595.0], [5.3, 3595.0], [5.4, 3784.0], [5.5, 3784.0], [5.6, 3916.0], [5.7, 4335.0], [5.8, 4335.0], [5.9, 4491.0], [6.0, 4491.0], [6.1, 4635.0], [6.2, 4786.0], [6.3, 4786.0], [6.4, 4928.0], [6.5, 4928.0], [6.6, 5065.0], [6.7, 5230.0], [6.8, 5230.0], [6.9, 5350.0], [7.0, 5350.0], [7.1, 5459.0], [7.2, 5573.0], [7.3, 5573.0], [7.4, 5710.0], [7.5, 5710.0], [7.6, 5881.0], [7.7, 6048.0], [7.8, 6048.0], [7.9, 6193.0], [8.0, 6193.0], [8.1, 6323.0], [8.2, 6434.0], [8.3, 6434.0], [8.4, 6568.0], [8.5, 6568.0], [8.6, 6677.0], [8.7, 6786.0], [8.8, 6786.0], [8.9, 6905.0], [9.0, 6905.0], [9.1, 7047.0], [9.2, 7169.0], [9.3, 7169.0], [9.4, 7288.0], [9.5, 7404.0], [9.6, 7404.0], [9.7, 7515.0], [9.8, 7515.0], [9.9, 7621.0], [10.0, 7742.0], [10.1, 7742.0], [10.2, 7912.0], [10.3, 7912.0], [10.4, 8018.0], [10.5, 8126.0], [10.6, 8126.0], [10.7, 8244.0], [10.8, 8244.0], [10.9, 8358.0], [11.0, 8463.0], [11.1, 8463.0], [11.2, 8589.0], [11.3, 8589.0], [11.4, 8707.0], [11.5, 8827.0], [11.6, 8827.0], [11.7, 8927.0], [11.8, 8927.0], [11.9, 9047.0], [12.0, 9163.0], [12.1, 9163.0], [12.2, 9279.0], [12.3, 9279.0], [12.4, 9380.0], [12.5, 9510.0], [12.6, 9510.0], [12.7, 9630.0], [12.8, 9630.0], [12.9, 9738.0], [13.0, 9864.0], [13.1, 9864.0], [13.2, 9988.0], [13.3, 9988.0], [13.4, 10104.0], [13.5, 10207.0], [13.6, 10207.0], [13.7, 10333.0], [13.8, 10333.0], [13.9, 10451.0], [14.0, 10575.0], [14.1, 10575.0], [14.2, 10685.0], [14.3, 10685.0], [14.4, 10800.0], [14.5, 10926.0], [14.6, 10926.0], [14.7, 11069.0], [14.8, 11069.0], [14.9, 11181.0], [15.0, 11303.0], [15.1, 11303.0], [15.2, 11424.0], [15.3, 11424.0], [15.4, 11532.0], [15.5, 11657.0], [15.6, 11657.0], [15.7, 11779.0], [15.8, 11779.0], [15.9, 11901.0], [16.0, 12011.0], [16.1, 12011.0], [16.2, 12139.0], [16.3, 12139.0], [16.4, 12261.0], [16.5, 12381.0], [16.6, 12381.0], [16.7, 12499.0], [16.8, 12499.0], [16.9, 12642.0], [17.0, 12812.0], [17.1, 12812.0], [17.2, 12959.0], [17.3, 12959.0], [17.4, 13133.0], [17.5, 13299.0], [17.6, 13299.0], [17.7, 13429.0], [17.8, 13429.0], [17.9, 13575.0], [18.0, 13722.0], [18.1, 13722.0], [18.2, 13871.0], [18.3, 13871.0], [18.4, 13994.0], [18.5, 14107.0], [18.6, 14107.0], [18.7, 14227.0], [18.8, 14227.0], [18.9, 14356.0], [19.0, 14479.0], [19.1, 14479.0], [19.2, 14610.0], [19.3, 14610.0], [19.4, 14748.0], [19.5, 14882.0], [19.6, 14882.0], [19.7, 15018.0], [19.8, 15018.0], [19.9, 15136.0], [20.0, 15136.0], [20.1, 15265.0], [20.2, 15395.0], [20.3, 15395.0], [20.4, 15524.0], [20.5, 15524.0], [20.6, 15655.0], [20.7, 15774.0], [20.8, 15774.0], [20.9, 15894.0], [21.0, 15894.0], [21.1, 16021.0], [21.2, 16137.0], [21.3, 16137.0], [21.4, 16266.0], [21.5, 16266.0], [21.6, 16406.0], [21.7, 16541.0], [21.8, 16541.0], [21.9, 16666.0], [22.0, 16666.0], [22.1, 16778.0], [22.2, 16899.0], [22.3, 16899.0], [22.4, 17024.0], [22.5, 17024.0], [22.6, 17149.0], [22.7, 17260.0], [22.8, 17260.0], [22.9, 17381.0], [23.0, 17381.0], [23.1, 17511.0], [23.2, 17628.0], [23.3, 17628.0], [23.4, 17739.0], [23.5, 17739.0], [23.6, 17876.0], [23.7, 18053.0], [23.8, 18053.0], [23.9, 18183.0], [24.0, 18183.0], [24.1, 18304.0], [24.2, 18422.0], [24.3, 18422.0], [24.4, 18555.0], [24.5, 18555.0], [24.6, 18679.0], [24.7, 18800.0], [24.8, 18800.0], [24.9, 18938.0], [25.0, 18938.0], [25.1, 19118.0], [25.2, 19241.0], [25.3, 19241.0], [25.4, 19370.0], [25.5, 19370.0], [25.6, 19482.0], [25.7, 19603.0], [25.8, 19603.0], [25.9, 19725.0], [26.0, 19725.0], [26.1, 19849.0], [26.2, 19964.0], [26.3, 19964.0], [26.4, 20090.0], [26.5, 20090.0], [26.6, 20217.0], [26.7, 20331.0], [26.8, 20331.0], [26.9, 20449.0], [27.0, 20449.0], [27.1, 20579.0], [27.2, 20706.0], [27.3, 20706.0], [27.4, 20827.0], [27.5, 20827.0], [27.6, 20944.0], [27.7, 21082.0], [27.8, 21082.0], [27.9, 21290.0], [28.0, 21290.0], [28.1, 21557.0], [28.2, 21701.0], [28.3, 21701.0], [28.4, 21850.0], [28.5, 21850.0], [28.6, 22032.0], [28.7, 22197.0], [28.8, 22197.0], [28.9, 22324.0], [29.0, 22324.0], [29.1, 22436.0], [29.2, 22560.0], [29.3, 22560.0], [29.4, 22688.0], [29.5, 22688.0], [29.6, 22871.0], [29.7, 23009.0], [29.8, 23009.0], [29.9, 23170.0], [30.0, 23170.0], [30.1, 23320.0], [30.2, 23462.0], [30.3, 23462.0], [30.4, 23603.0], [30.5, 23603.0], [30.6, 23740.0], [30.7, 23868.0], [30.8, 23868.0], [30.9, 24015.0], [31.0, 24015.0], [31.1, 24173.0], [31.2, 24322.0], [31.3, 24322.0], [31.4, 24467.0], [31.5, 24467.0], [31.6, 24602.0], [31.7, 24753.0], [31.8, 24753.0], [31.9, 24961.0], [32.0, 24961.0], [32.1, 25113.0], [32.2, 25256.0], [32.3, 25256.0], [32.4, 25402.0], [32.5, 25402.0], [32.6, 25537.0], [32.7, 25660.0], [32.8, 25660.0], [32.9, 25800.0], [33.0, 25800.0], [33.1, 25930.0], [33.2, 26074.0], [33.3, 26074.0], [33.4, 26223.0], [33.5, 26223.0], [33.6, 26358.0], [33.7, 26540.0], [33.8, 26540.0], [33.9, 26568.0], [34.0, 26568.0], [34.1, 26574.0], [34.2, 26584.0], [34.3, 26584.0], [34.4, 26599.0], [34.5, 26599.0], [34.6, 26616.0], [34.7, 26630.0], [34.8, 26630.0], [34.9, 26661.0], [35.0, 26661.0], [35.1, 26704.0], [35.2, 26717.0], [35.3, 26717.0], [35.4, 26718.0], [35.5, 26718.0], [35.6, 26734.0], [35.7, 26740.0], [35.8, 26740.0], [35.9, 26753.0], [36.0, 26753.0], [36.1, 26760.0], [36.2, 26791.0], [36.3, 26791.0], [36.4, 26821.0], [36.5, 26821.0], [36.6, 26821.0], [36.7, 26825.0], [36.8, 26825.0], [36.9, 26833.0], [37.0, 26833.0], [37.1, 26854.0], [37.2, 26859.0], [37.3, 26859.0], [37.4, 26861.0], [37.5, 26861.0], [37.6, 26875.0], [37.7, 26883.0], [37.8, 26883.0], [37.9, 26901.0], [38.0, 26901.0], [38.1, 26907.0], [38.2, 26909.0], [38.3, 26909.0], [38.4, 26913.0], [38.5, 26920.0], [38.6, 26920.0], [38.7, 26921.0], [38.8, 26921.0], [38.9, 26930.0], [39.0, 26935.0], [39.1, 26935.0], [39.2, 26938.0], [39.3, 26938.0], [39.4, 26946.0], [39.5, 26947.0], [39.6, 26947.0], [39.7, 26950.0], [39.8, 26950.0], [39.9, 26951.0], [40.0, 26960.0], [40.1, 26960.0], [40.2, 26966.0], [40.3, 26966.0], [40.4, 26969.0], [40.5, 26970.0], [40.6, 26970.0], [40.7, 26978.0], [40.8, 26978.0], [40.9, 26980.0], [41.0, 26981.0], [41.1, 26981.0], [41.2, 26987.0], [41.3, 26987.0], [41.4, 26990.0], [41.5, 26993.0], [41.6, 26993.0], [41.7, 26997.0], [41.8, 26997.0], [41.9, 27004.0], [42.0, 27005.0], [42.1, 27005.0], [42.2, 27011.0], [42.3, 27011.0], [42.4, 27014.0], [42.5, 27016.0], [42.6, 27016.0], [42.7, 27016.0], [42.8, 27016.0], [42.9, 27018.0], [43.0, 27022.0], [43.1, 27022.0], [43.2, 27022.0], [43.3, 27022.0], [43.4, 27022.0], [43.5, 27024.0], [43.6, 27024.0], [43.7, 27024.0], [43.8, 27024.0], [43.9, 27025.0], [44.0, 27028.0], [44.1, 27028.0], [44.2, 27033.0], [44.3, 27033.0], [44.4, 27041.0], [44.5, 27043.0], [44.6, 27043.0], [44.7, 27044.0], [44.8, 27044.0], [44.9, 27047.0], [45.0, 27048.0], [45.1, 27048.0], [45.2, 27049.0], [45.3, 27049.0], [45.4, 27050.0], [45.5, 27050.0], [45.6, 27050.0], [45.7, 27051.0], [45.8, 27051.0], [45.9, 27053.0], [46.0, 27055.0], [46.1, 27055.0], [46.2, 27057.0], [46.3, 27057.0], [46.4, 27058.0], [46.5, 27063.0], [46.6, 27063.0], [46.7, 27070.0], [46.8, 27070.0], [46.9, 27070.0], [47.0, 27071.0], [47.1, 27071.0], [47.2, 27072.0], [47.3, 27072.0], [47.4, 27073.0], [47.5, 27073.0], [47.6, 27073.0], [47.7, 27078.0], [47.8, 27078.0], [47.9, 27079.0], [48.0, 27080.0], [48.1, 27080.0], [48.2, 27082.0], [48.3, 27082.0], [48.4, 27084.0], [48.5, 27085.0], [48.6, 27085.0], [48.7, 27087.0], [48.8, 27087.0], [48.9, 27087.0], [49.0, 27088.0], [49.1, 27088.0], [49.2, 27088.0], [49.3, 27088.0], [49.4, 27090.0], [49.5, 27090.0], [49.6, 27090.0], [49.7, 27093.0], [49.8, 27093.0], [49.9, 27097.0], [50.0, 27098.0], [50.1, 27098.0], [50.2, 27098.0], [50.3, 27098.0], [50.4, 27102.0], [50.5, 27102.0], [50.6, 27102.0], [50.7, 27105.0], [50.8, 27105.0], [50.9, 27106.0], [51.0, 27107.0], [51.1, 27107.0], [51.2, 27110.0], [51.3, 27110.0], [51.4, 27114.0], [51.5, 27121.0], [51.6, 27121.0], [51.7, 27122.0], [51.8, 27122.0], [51.9, 27122.0], [52.0, 27122.0], [52.1, 27122.0], [52.2, 27122.0], [52.3, 27122.0], [52.4, 27122.0], [52.5, 27123.0], [52.6, 27123.0], [52.7, 27125.0], [52.8, 27125.0], [52.9, 27129.0], [53.0, 27131.0], [53.1, 27131.0], [53.2, 27133.0], [53.3, 27133.0], [53.4, 27134.0], [53.5, 27135.0], [53.6, 27135.0], [53.7, 27135.0], [53.8, 27135.0], [53.9, 27136.0], [54.0, 27136.0], [54.1, 27136.0], [54.2, 27137.0], [54.3, 27137.0], [54.4, 27141.0], [54.5, 27142.0], [54.6, 27142.0], [54.7, 27144.0], [54.8, 27144.0], [54.9, 27148.0], [55.0, 27148.0], [55.1, 27148.0], [55.2, 27152.0], [55.3, 27152.0], [55.4, 27153.0], [55.5, 27153.0], [55.6, 27153.0], [55.7, 27155.0], [55.8, 27155.0], [55.9, 27178.0], [56.0, 27289.0], [56.1, 27289.0], [56.2, 27408.0], [56.3, 27408.0], [56.4, 27530.0], [56.5, 27648.0], [56.6, 27648.0], [56.7, 27751.0], [56.8, 27751.0], [56.9, 27774.0], [57.0, 27941.0], [57.1, 27941.0], [57.2, 28057.0], [57.3, 28057.0], [57.4, 28065.0], [57.5, 28137.0], [57.6, 28137.0], [57.7, 28193.0], [57.8, 28193.0], [57.9, 28258.0], [58.0, 28262.0], [58.1, 28262.0], [58.2, 28307.0], [58.3, 28307.0], [58.4, 28312.0], [58.5, 28351.0], [58.6, 28351.0], [58.7, 28365.0], [58.8, 28365.0], [58.9, 28418.0], [59.0, 28419.0], [59.1, 28419.0], [59.2, 28458.0], [59.3, 28458.0], [59.4, 28483.0], [59.5, 28546.0], [59.6, 28546.0], [59.7, 28623.0], [59.8, 28623.0], [59.9, 28669.0], [60.0, 28676.0], [60.1, 28676.0], [60.2, 28755.0], [60.3, 28755.0], [60.4, 28792.0], [60.5, 28793.0], [60.6, 28793.0], [60.7, 28820.0], [60.8, 28820.0], [60.9, 28829.0], [61.0, 28917.0], [61.1, 28917.0], [61.2, 28928.0], [61.3, 28928.0], [61.4, 28948.0], [61.5, 29006.0], [61.6, 29006.0], [61.7, 29009.0], [61.8, 29009.0], [61.9, 29044.0], [62.0, 29103.0], [62.1, 29103.0], [62.2, 29176.0], [62.3, 29176.0], [62.4, 29180.0], [62.5, 29260.0], [62.6, 29260.0], [62.7, 29304.0], [62.8, 29304.0], [62.9, 29335.0], [63.0, 29439.0], [63.1, 29439.0], [63.2, 29462.0], [63.3, 29462.0], [63.4, 29505.0], [63.5, 29536.0], [63.6, 29536.0], [63.7, 29546.0], [63.8, 29546.0], [63.9, 29547.0], [64.0, 29550.0], [64.1, 29550.0], [64.2, 29576.0], [64.3, 29576.0], [64.4, 29606.0], [64.5, 29612.0], [64.6, 29612.0], [64.7, 29630.0], [64.8, 29630.0], [64.9, 29681.0], [65.0, 29693.0], [65.1, 29693.0], [65.2, 29707.0], [65.3, 29707.0], [65.4, 29763.0], [65.5, 29781.0], [65.6, 29781.0], [65.7, 29781.0], [65.8, 29781.0], [65.9, 29793.0], [66.0, 29850.0], [66.1, 29850.0], [66.2, 29852.0], [66.3, 29852.0], [66.4, 29882.0], [66.5, 29894.0], [66.6, 29894.0], [66.7, 29957.0], [66.8, 29957.0], [66.9, 30001.0], [67.0, 30002.0], [67.1, 30002.0], [67.2, 30002.0], [67.3, 30002.0], [67.4, 30002.0], [67.5, 30002.0], [67.6, 30002.0], [67.7, 30002.0], [67.8, 30002.0], [67.9, 30002.0], [68.0, 30002.0], [68.1, 30002.0], [68.2, 30002.0], [68.3, 30002.0], [68.4, 30002.0], [68.5, 30002.0], [68.6, 30002.0], [68.7, 30002.0], [68.8, 30002.0], [68.9, 30002.0], [69.0, 30002.0], [69.1, 30002.0], [69.2, 30002.0], [69.3, 30002.0], [69.4, 30002.0], [69.5, 30002.0], [69.6, 30002.0], [69.7, 30002.0], [69.8, 30002.0], [69.9, 30002.0], [70.0, 30002.0], [70.1, 30002.0], [70.2, 30002.0], [70.3, 30002.0], [70.4, 30002.0], [70.5, 30002.0], [70.6, 30002.0], [70.7, 30002.0], [70.8, 30002.0], [70.9, 30002.0], [71.0, 30002.0], [71.1, 30002.0], [71.2, 30002.0], [71.3, 30002.0], [71.4, 30002.0], [71.5, 30002.0], [71.6, 30002.0], [71.7, 30002.0], [71.8, 30002.0], [71.9, 30002.0], [72.0, 30002.0], [72.1, 30002.0], [72.2, 30002.0], [72.3, 30002.0], [72.4, 30002.0], [72.5, 30002.0], [72.6, 30002.0], [72.7, 30003.0], [72.8, 30003.0], [72.9, 30003.0], [73.0, 30003.0], [73.1, 30003.0], [73.2, 30003.0], [73.3, 30003.0], [73.4, 30003.0], [73.5, 30003.0], [73.6, 30003.0], [73.7, 30003.0], [73.8, 30003.0], [73.9, 30003.0], [74.0, 30003.0], [74.1, 30003.0], [74.2, 30003.0], [74.3, 30003.0], [74.4, 30003.0], [74.5, 30003.0], [74.6, 30003.0], [74.7, 30003.0], [74.8, 30003.0], [74.9, 30003.0], [75.0, 30003.0], [75.1, 30003.0], [75.2, 30003.0], [75.3, 30003.0], [75.4, 30003.0], [75.5, 30003.0], [75.6, 30003.0], [75.7, 30003.0], [75.8, 30003.0], [75.9, 30003.0], [76.0, 30003.0], [76.1, 30003.0], [76.2, 30003.0], [76.3, 30003.0], [76.4, 30003.0], [76.5, 30003.0], [76.6, 30003.0], [76.7, 30003.0], [76.8, 30003.0], [76.9, 30003.0], [77.0, 30003.0], [77.1, 30003.0], [77.2, 30003.0], [77.3, 30003.0], [77.4, 30003.0], [77.5, 30003.0], [77.6, 30003.0], [77.7, 30003.0], [77.8, 30003.0], [77.9, 30003.0], [78.0, 30003.0], [78.1, 30003.0], [78.2, 30003.0], [78.3, 30003.0], [78.4, 30003.0], [78.5, 30003.0], [78.6, 30003.0], [78.7, 30003.0], [78.8, 30003.0], [78.9, 30004.0], [79.0, 30004.0], [79.1, 30004.0], [79.2, 30004.0], [79.3, 30004.0], [79.4, 30004.0], [79.5, 30004.0], [79.6, 30004.0], [79.7, 30004.0], [79.8, 30004.0], [79.9, 30004.0], [80.0, 30004.0], [80.1, 30004.0], [80.2, 30004.0], [80.3, 30004.0], [80.4, 30004.0], [80.5, 30004.0], [80.6, 30004.0], [80.7, 30004.0], [80.8, 30004.0], [80.9, 30004.0], [81.0, 30004.0], [81.1, 30004.0], [81.2, 30004.0], [81.3, 30004.0], [81.4, 30004.0], [81.5, 30004.0], [81.6, 30004.0], [81.7, 30004.0], [81.8, 30004.0], [81.9, 30004.0], [82.0, 30004.0], [82.1, 30004.0], [82.2, 30004.0], [82.3, 30004.0], [82.4, 30004.0], [82.5, 30004.0], [82.6, 30004.0], [82.7, 30004.0], [82.8, 30004.0], [82.9, 30004.0], [83.0, 30004.0], [83.1, 30004.0], [83.2, 30004.0], [83.3, 30004.0], [83.4, 30004.0], [83.5, 30004.0], [83.6, 30004.0], [83.7, 30004.0], [83.8, 30004.0], [83.9, 30004.0], [84.0, 30004.0], [84.1, 30004.0], [84.2, 30004.0], [84.3, 30004.0], [84.4, 30004.0], [84.5, 30004.0], [84.6, 30004.0], [84.7, 30004.0], [84.8, 30004.0], [84.9, 30004.0], [85.0, 30004.0], [85.1, 30004.0], [85.2, 30004.0], [85.3, 30004.0], [85.4, 30004.0], [85.5, 30004.0], [85.6, 30004.0], [85.7, 30005.0], [85.8, 30005.0], [85.9, 30005.0], [86.0, 30005.0], [86.1, 30005.0], [86.2, 30005.0], [86.3, 30005.0], [86.4, 30005.0], [86.5, 30005.0], [86.6, 30005.0], [86.7, 30005.0], [86.8, 30005.0], [86.9, 30005.0], [87.0, 30005.0], [87.1, 30005.0], [87.2, 30005.0], [87.3, 30005.0], [87.4, 30005.0], [87.5, 30005.0], [87.6, 30005.0], [87.7, 30005.0], [87.8, 30005.0], [87.9, 30005.0], [88.0, 30005.0], [88.1, 30005.0], [88.2, 30005.0], [88.3, 30005.0], [88.4, 30005.0], [88.5, 30005.0], [88.6, 30005.0], [88.7, 30005.0], [88.8, 30005.0], [88.9, 30005.0], [89.0, 30005.0], [89.1, 30005.0], [89.2, 30005.0], [89.3, 30005.0], [89.4, 30005.0], [89.5, 30005.0], [89.6, 30005.0], [89.7, 30005.0], [89.8, 30005.0], [89.9, 30005.0], [90.0, 30005.0], [90.1, 30005.0], [90.2, 30005.0], [90.3, 30005.0], [90.4, 30005.0], [90.5, 30005.0], [90.6, 30005.0], [90.7, 30005.0], [90.8, 30005.0], [90.9, 30005.0], [91.0, 30005.0], [91.1, 30005.0], [91.2, 30005.0], [91.3, 30005.0], [91.4, 30005.0], [91.5, 30005.0], [91.6, 30005.0], [91.7, 30006.0], [91.8, 30006.0], [91.9, 30006.0], [92.0, 30006.0], [92.1, 30006.0], [92.2, 30006.0], [92.3, 30006.0], [92.4, 30006.0], [92.5, 30006.0], [92.6, 30006.0], [92.7, 30006.0], [92.8, 30006.0], [92.9, 30006.0], [93.0, 30006.0], [93.1, 30006.0], [93.2, 30006.0], [93.3, 30006.0], [93.4, 30006.0], [93.5, 30006.0], [93.6, 30006.0], [93.7, 30006.0], [93.8, 30006.0], [93.9, 30006.0], [94.0, 30006.0], [94.1, 30006.0], [94.2, 30006.0], [94.3, 30006.0], [94.4, 30006.0], [94.5, 30006.0], [94.6, 30006.0], [94.7, 30006.0], [94.8, 30006.0], [94.9, 30006.0], [95.0, 30007.0], [95.1, 30007.0], [95.2, 30007.0], [95.3, 30007.0], [95.4, 30007.0], [95.5, 30007.0], [95.6, 30007.0], [95.7, 30007.0], [95.8, 30007.0], [95.9, 30007.0], [96.0, 30007.0], [96.1, 30007.0], [96.2, 30007.0], [96.3, 30007.0], [96.4, 30007.0], [96.5, 30007.0], [96.6, 30007.0], [96.7, 30007.0], [96.8, 30007.0], [96.9, 30007.0], [97.0, 30007.0], [97.1, 30007.0], [97.2, 30007.0], [97.3, 30007.0], [97.4, 30007.0], [97.5, 30007.0], [97.6, 30007.0], [97.7, 30007.0], [97.8, 30007.0], [97.9, 30007.0], [98.0, 30007.0], [98.1, 30007.0], [98.2, 30007.0], [98.3, 30007.0], [98.4, 30007.0], [98.5, 30007.0], [98.6, 30007.0], [98.7, 30007.0], [98.8, 30007.0], [98.9, 30007.0], [99.0, 30007.0], [99.1, 30007.0], [99.2, 30007.0], [99.3, 30007.0], [99.4, 30008.0], [99.5, 30008.0], [99.6, 30008.0], [99.7, 30008.0], [99.8, 30008.0], [99.9, 30035.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 200.0, "maxY": 199.0, "series": [{"data": [[200.0, 1.0], [300.0, 1.0], [500.0, 1.0], [600.0, 1.0], [800.0, 2.0], [900.0, 1.0], [1100.0, 2.0], [1200.0, 1.0], [1300.0, 1.0], [1400.0, 1.0], [1500.0, 1.0], [1600.0, 1.0], [1700.0, 1.0], [1800.0, 1.0], [1900.0, 2.0], [2000.0, 1.0], [2200.0, 1.0], [2300.0, 1.0], [2400.0, 1.0], [2500.0, 1.0], [2600.0, 1.0], [2700.0, 1.0], [2800.0, 1.0], [2900.0, 1.0], [3000.0, 1.0], [3200.0, 1.0], [3300.0, 1.0], [3400.0, 1.0], [3500.0, 1.0], [3700.0, 1.0], [3900.0, 1.0], [4300.0, 1.0], [4400.0, 1.0], [4600.0, 1.0], [4700.0, 1.0], [4900.0, 1.0], [5000.0, 1.0], [5200.0, 1.0], [5300.0, 1.0], [5400.0, 1.0], [5500.0, 1.0], [5700.0, 1.0], [5800.0, 1.0], [6000.0, 1.0], [6100.0, 1.0], [6300.0, 1.0], [6400.0, 1.0], [6500.0, 1.0], [6600.0, 1.0], [6700.0, 1.0], [6900.0, 1.0], [7000.0, 1.0], [7100.0, 1.0], [7200.0, 1.0], [7400.0, 1.0], [7500.0, 1.0], [7600.0, 1.0], [7700.0, 1.0], [7900.0, 1.0], [8000.0, 1.0], [8100.0, 1.0], [8200.0, 1.0], [8300.0, 1.0], [8400.0, 1.0], [8500.0, 1.0], [8700.0, 1.0], [8800.0, 1.0], [8900.0, 1.0], [9000.0, 1.0], [9100.0, 1.0], [9200.0, 1.0], [9300.0, 1.0], [9500.0, 1.0], [9600.0, 1.0], [9700.0, 1.0], [9800.0, 1.0], [9900.0, 1.0], [10100.0, 1.0], [10200.0, 1.0], [10300.0, 1.0], [10400.0, 1.0], [10500.0, 1.0], [10600.0, 1.0], [10800.0, 1.0], [10900.0, 1.0], [11000.0, 1.0], [11100.0, 1.0], [11300.0, 1.0], [11400.0, 1.0], [11500.0, 1.0], [11600.0, 1.0], [11700.0, 1.0], [11900.0, 1.0], [12000.0, 1.0], [12100.0, 1.0], [12200.0, 1.0], [12300.0, 1.0], [12400.0, 1.0], [12600.0, 1.0], [12800.0, 1.0], [12900.0, 1.0], [13100.0, 1.0], [13200.0, 1.0], [13400.0, 1.0], [13500.0, 1.0], [13700.0, 1.0], [13800.0, 1.0], [13900.0, 1.0], [14100.0, 1.0], [14200.0, 1.0], [14300.0, 1.0], [14400.0, 1.0], [14600.0, 1.0], [14700.0, 1.0], [14800.0, 1.0], [15000.0, 1.0], [15100.0, 1.0], [15200.0, 1.0], [15300.0, 1.0], [15500.0, 1.0], [15600.0, 1.0], [15700.0, 1.0], [15800.0, 1.0], [16000.0, 1.0], [16100.0, 1.0], [16200.0, 1.0], [16400.0, 1.0], [16600.0, 1.0], [16800.0, 1.0], [17000.0, 1.0], [17200.0, 1.0], [17600.0, 1.0], [17800.0, 1.0], [18000.0, 1.0], [18400.0, 1.0], [18600.0, 1.0], [18800.0, 1.0], [19200.0, 1.0], [19400.0, 1.0], [19600.0, 1.0], [19800.0, 1.0], [20000.0, 1.0], [20200.0, 1.0], [20400.0, 1.0], [20800.0, 1.0], [21000.0, 1.0], [21200.0, 1.0], [21800.0, 1.0], [22000.0, 1.0], [22400.0, 1.0], [22600.0, 1.0], [22800.0, 1.0], [23000.0, 1.0], [23400.0, 1.0], [23600.0, 1.0], [23800.0, 1.0], [24000.0, 1.0], [24400.0, 1.0], [24600.0, 1.0], [25200.0, 1.0], [25400.0, 1.0], [25600.0, 1.0], [25800.0, 1.0], [26000.0, 1.0], [26200.0, 1.0], [26600.0, 3.0], [27000.0, 51.0], [27200.0, 1.0], [27400.0, 1.0], [27600.0, 1.0], [26800.0, 9.0], [28000.0, 2.0], [28400.0, 4.0], [28600.0, 3.0], [28200.0, 2.0], [29000.0, 3.0], [29400.0, 2.0], [29600.0, 5.0], [29200.0, 1.0], [28800.0, 2.0], [29800.0, 4.0], [30000.0, 199.0], [16500.0, 1.0], [16700.0, 1.0], [17100.0, 1.0], [17300.0, 1.0], [17500.0, 1.0], [17700.0, 1.0], [18100.0, 1.0], [18300.0, 1.0], [18500.0, 1.0], [18900.0, 1.0], [19100.0, 1.0], [19300.0, 1.0], [19700.0, 1.0], [19900.0, 1.0], [20300.0, 1.0], [20500.0, 1.0], [20700.0, 1.0], [20900.0, 1.0], [21500.0, 1.0], [21700.0, 1.0], [22100.0, 1.0], [22300.0, 1.0], [22500.0, 1.0], [23100.0, 1.0], [23300.0, 1.0], [23700.0, 1.0], [24100.0, 1.0], [24300.0, 1.0], [24700.0, 1.0], [24900.0, 1.0], [25100.0, 1.0], [25500.0, 1.0], [25900.0, 1.0], [26300.0, 1.0], [26500.0, 5.0], [26700.0, 8.0], [26900.0, 24.0], [27100.0, 34.0], [27500.0, 1.0], [27700.0, 2.0], [27900.0, 1.0], [28100.0, 2.0], [28300.0, 4.0], [28500.0, 1.0], [28700.0, 3.0], [28900.0, 3.0], [29100.0, 3.0], [29300.0, 2.0], [29500.0, 6.0], [29700.0, 5.0], [29900.0, 1.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 30000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 2.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 389.0, "series": [{"data": [[1.0, 10.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 199.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 2.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 389.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 118.93103448275858, "minX": 1.52643834E12, "maxY": 189.27464788732394, "series": [{"data": [[1.52643834E12, 118.93103448275858], [1.5264384E12, 189.27464788732394]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5264384E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 10385.666666666666, "minX": 1.0, "maxY": 30035.0, "series": [{"data": [[2.0, 30006.0], [3.0, 30004.0], [4.0, 30003.0], [5.0, 30007.0], [6.0, 15164.5], [7.0, 30003.0], [8.0, 15336.5], [9.0, 30005.0], [10.0, 15433.0], [11.0, 30003.0], [12.0, 15439.5], [13.0, 28365.0], [14.0, 15498.0], [15.0, 30008.0], [16.0, 10771.666666666666], [17.0, 30004.0], [18.0, 14883.5], [19.0, 15717.5], [20.0, 28057.0], [21.0, 15769.5], [22.0, 10385.666666666666], [23.0, 15934.0], [24.0, 30004.0], [25.0, 15984.0], [26.0, 10966.0], [27.0, 30004.0], [28.0, 16162.5], [29.0, 16021.5], [30.0, 16277.0], [31.0, 16326.5], [33.0, 16217.5], [32.0, 30004.0], [34.0, 16428.0], [35.0, 16483.5], [36.0, 15773.0], [37.0, 12172.333333333334], [39.0, 16723.0], [38.0, 30006.0], [40.0, 15928.5], [41.0, 30007.0], [42.0, 16893.5], [43.0, 16959.5], [45.0, 30002.0], [44.0, 30006.0], [46.0, 16236.0], [47.0, 30003.0], [48.0, 12820.333333333334], [49.0, 30002.0], [51.0, 17394.5], [50.0, 28928.0], [53.0, 16620.0], [52.0, 30005.0], [55.0, 17534.0], [54.0, 30004.0], [56.0, 17616.0], [57.0, 17179.5], [59.0, 17730.5], [58.0, 30002.0], [60.0, 17788.5], [61.0, 17858.5], [63.0, 17943.5], [62.0, 30005.0], [64.0, 17153.0], [66.0, 17474.0], [67.0, 17337.0], [65.0, 30006.0], [68.0, 18218.5], [70.0, 18285.0], [71.0, 17547.5], [69.0, 29536.0], [72.0, 18396.0], [73.0, 18455.5], [74.0, 18326.5], [75.0, 30005.0], [76.0, 18586.0], [77.0, 18040.5], [78.0, 18704.0], [79.0, 18654.0], [80.0, 18814.0], [81.0, 18205.5], [83.0, 18958.5], [82.0, 29462.0], [84.0, 19011.0], [85.0, 19065.5], [86.0, 17392.0], [87.0, 19180.5], [88.0, 19005.0], [91.0, 15767.666666666668], [90.0, 28829.0], [89.0, 30007.0], [92.0, 18823.5], [93.0, 19467.0], [94.0, 19527.0], [95.0, 26574.0], [96.0, 17873.5], [97.0, 19142.5], [98.0, 19691.0], [99.0, 18054.5], [100.0, 19816.5], [101.0, 19871.0], [103.0, 18240.0], [102.0, 30003.0], [104.0, 19624.0], [105.0, 20053.0], [106.0, 20104.5], [107.0, 19640.5], [109.0, 20229.0], [110.0, 20290.5], [111.0, 20346.0], [108.0, 26630.0], [112.0, 20402.0], [113.0, 20466.5], [115.0, 18865.0], [114.0, 30004.0], [116.0, 20592.5], [117.0, 20652.5], [118.0, 20714.0], [119.0, 20518.5], [121.0, 20830.0], [122.0, 20441.0], [123.0, 19302.5], [120.0, 30002.0], [124.0, 19364.0], [125.0, 21070.5], [127.0, 21132.5], [126.0, 26718.0], [128.0, 21192.0], [129.0, 20837.5], [130.0, 21323.5], [132.0, 21407.0], [134.0, 18698.0], [135.0, 26753.0], [133.0, 26740.0], [131.0, 26734.0], [137.0, 21531.0], [138.0, 21717.0], [139.0, 21789.5], [141.0, 21863.0], [143.0, 21939.0], [142.0, 29546.0], [140.0, 29550.0], [136.0, 30002.0], [144.0, 20392.5], [145.0, 21868.5], [146.0, 22115.0], [148.0, 20588.5], [149.0, 22241.5], [150.0, 20717.5], [151.0, 29681.0], [147.0, 26821.0], [152.0, 22376.0], [153.0, 20857.5], [154.0, 22399.5], [155.0, 20995.0], [157.0, 22523.0], [158.0, 21127.0], [159.0, 21192.5], [156.0, 30003.0], [161.0, 22752.5], [162.0, 22890.5], [163.0, 22950.5], [164.0, 21448.0], [165.0, 21510.0], [167.0, 23080.0], [166.0, 30004.0], [160.0, 30005.0], [168.0, 23204.5], [169.0, 23211.5], [171.0, 21783.5], [172.0, 23391.0], [173.0, 21904.0], [174.0, 23490.5], [175.0, 30002.0], [170.0, 30005.0], [176.0, 22031.0], [177.0, 22090.0], [178.0, 23692.5], [179.0, 22216.0], [180.0, 23816.5], [182.0, 22334.5], [183.0, 22405.5], [181.0, 30005.0], [185.0, 24028.5], [186.0, 22560.5], [187.0, 22674.0], [188.0, 24212.0], [190.0, 24280.0], [191.0, 24341.5], [189.0, 26950.0], [184.0, 30006.0], [192.0, 22873.5], [194.0, 22944.5], [195.0, 24560.5], [197.0, 23105.5], [198.0, 24687.0], [199.0, 24744.5], [196.0, 30007.0], [193.0, 30005.0], [200.0, 24803.0], [201.0, 23359.0], [203.0, 24926.5], [204.0, 23490.0], [205.0, 25049.0], [206.0, 23615.5], [207.0, 25169.0], [202.0, 27005.0], [209.0, 25227.0], [210.0, 23801.5], [211.0, 25355.0], [212.0, 23926.0], [214.0, 25474.5], [215.0, 24066.5], [213.0, 30002.0], [208.0, 27022.0], [217.0, 24171.5], [219.0, 24313.5], [220.0, 25851.5], [222.0, 24464.5], [223.0, 26019.0], [221.0, 30002.0], [218.0, 30002.0], [216.0, 30007.0], [226.0, 24842.0], [228.0, 24761.5], [229.0, 26281.0], [231.0, 24887.5], [230.0, 27088.0], [227.0, 27085.0], [225.0, 27082.0], [224.0, 27080.0], [232.0, 24984.0], [234.0, 26506.5], [235.0, 25131.5], [237.0, 26662.5], [238.0, 25282.0], [239.0, 30005.0], [236.0, 30003.0], [233.0, 27105.0], [240.0, 25355.0], [241.0, 26873.0], [242.0, 26934.5], [244.0, 17429.666666666668], [245.0, 27089.0], [247.0, 25722.0], [246.0, 30006.0], [243.0, 30005.0], [248.0, 25794.5], [250.0, 25492.333333333332], [252.0, 27482.5], [253.0, 26117.5], [255.0, 26190.5], [254.0, 30008.0], [251.0, 30004.0], [249.0, 30007.0], [258.0, 26337.0], [256.0, 27704.0], [257.0, 27134.0], [259.0, 27832.5], [260.0, 27901.5], [261.0, 27135.0], [262.0, 27966.0], [263.0, 28038.0], [265.0, 26679.5], [266.0, 26749.5], [267.0, 30035.0], [268.0, 26858.0], [270.0, 26939.666666666668], [269.0, 30004.0], [271.0, 30006.0], [264.0, 27136.0], [274.0, 27165.5], [272.0, 28531.0], [273.0, 30007.0], [275.0, 27222.0], [284.0, 28193.0], [286.0, 28515.25], [285.0, 28092.333333333332], [287.0, 28561.0], [276.0, 28188.0], [277.0, 28577.5], [278.0, 27337.0], [279.0, 27648.0], [280.0, 14883.0], [282.0, 27941.0], [283.0, 28065.0], [289.0, 28375.75], [288.0, 27924.777777777777], [290.0, 28398.272727272728], [291.0, 27855.5], [292.0, 25670.111111111113], [293.0, 28008.375], [294.0, 28786.692307692312], [295.0, 28549.272727272728], [296.0, 30005.0], [297.0, 27872.57142857143], [1.0, 30003.0]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[168.875, 23440.671666666687]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 297.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 16654.35, "minX": 1.52643834E12, "maxY": 51282.0, "series": [{"data": [[1.52643834E12, 40785.6], [1.5264384E12, 51282.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52643834E12, 16654.35], [1.5264384E12, 21723.5]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5264384E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 11491.890804597706, "minX": 1.52643834E12, "maxY": 28321.15962441317, "series": [{"data": [[1.52643834E12, 11491.890804597706], [1.5264384E12, 28321.15962441317]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5264384E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 11491.718390804603, "minX": 1.52643834E12, "maxY": 14304.941314553978, "series": [{"data": [[1.52643834E12, 11491.718390804603], [1.5264384E12, 14304.941314553978]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5264384E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 1.2981220657276993, "minX": 1.52643834E12, "maxY": 2.7816091954022983, "series": [{"data": [[1.52643834E12, 2.7816091954022983], [1.5264384E12, 1.2981220657276993]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5264384E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 213.0, "minX": 1.52643834E12, "maxY": 29957.0, "series": [{"data": [[1.52643834E12, 22871.0], [1.5264384E12, 29957.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52643834E12, 326.0], [1.5264384E12, 213.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52643834E12, 20390.0], [1.5264384E12, 28739.2]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52643834E12, 22733.75], [1.5264384E12, 29851.96]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52643834E12, 21738.25], [1.5264384E12, 29532.899999999998]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5264384E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 11363.5, "minX": 2.0, "maxY": 30004.0, "series": [{"data": [[2.0, 11363.5], [7.0, 27079.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[7.0, 30004.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 7.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 0.0, "minX": 2.0, "maxY": 27079.0, "series": [{"data": [[2.0, 11363.5], [7.0, 27079.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[7.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 7.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 3.283333333333333, "minX": 1.52643834E12, "maxY": 6.716666666666667, "series": [{"data": [[1.52643834E12, 6.716666666666667], [1.5264384E12, 3.283333333333333]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5264384E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 2.9, "minX": 1.52643834E12, "maxY": 3.783333333333333, "series": [{"data": [[1.52643834E12, 2.9], [1.5264384E12, 3.783333333333333]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.5264384E12, 3.316666666666667]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketTimeoutException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5264384E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 2.9, "minX": 1.52643834E12, "maxY": 3.783333333333333, "series": [{"data": [[1.52643834E12, 2.9], [1.5264384E12, 3.783333333333333]], "isOverall": false, "label": "inference-success", "isController": false}, {"data": [[1.5264384E12, 3.316666666666667]], "isOverall": false, "label": "inference-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5264384E12, "title": "Transactions Per Second"}},
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
