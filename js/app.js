(function() {

angular.module('beryllium-maven', [ 'beryllium' ]);

})();

(function() {

/**
 * Main Controller for the beryllium-maven application.
 */
angular
.module("beryllium-maven")
.controller("MainController", [
    'webGl',
    function( webGl ) {
        var ctrl = this;
        this.webGlAvailable = webGl.isWebGlAvailable();
    }
]);

})();

(function() {

angular
.module("beryllium-maven")
.component("app", {
    templateUrl: "components/appComponent/app.component.html",
    controller: [
        "$scope",
        "availableDates",
        "layers",
        "maven3dConstants",
        "kpDataTransformer",
        "kpMetadata",
        "mgitmDataProvider",
        "mgitmMetadata",
        AppController
    ]
});

function AppController(
    $scope, availableDates, layers, constants, kpDataTransformer,
    kpMetadata, mgitmDataProvider, mgitmMetadata
) {

    var vm = this;

    // availableDates: min/max dates for the entire dataset
    // displayDates: min/max dates currently being shown by the <date-range-picker>
    // requestedDates: When the user hits the Reload button in the <date-range-picker>
    //        the requested dates will be copied to this object. The <spacecraft-entities>
    //        component watches this object for changes and loads new data when changes
    //        are detected.
    vm.availableDates = { start: null, end: null };
    vm.displayDates = { start: null, end: null };
    vm.requestedDates = { start: null, end: null };

    // Variables and default values for the M-GITM shell
    vm.mgitmSolarLongitude = 0;
    vm.mgitmSolarFlux = 130;
    vm.mgitmParameter = "none";
    vm.mgitmAltitude = 98.75;
    vm.mgitmAltitudes = mgitmDataProvider.distinctAltitudes.values; // Available values for the dropdown
    vm.mgitmLatitudes = mgitmDataProvider.distinctLatitudes.values; // Available values for the dropdown
    vm.mgitmLatitude = vm.mgitmLatitudes[0];
    vm.mgitmLongitudes = mgitmDataProvider.distinctLongitudes.values; // Available values for the dropdown
    vm.mgitmLongitude = vm.mgitmLongitudes[0];

    // Initial values for the dropdowns in the sidebar
    vm.selectedReferenceFrame = "inertial";
    vm.selectedParam1d = "none";
    vm.selectedParam3d = "none";

    // Initial values for the checkboxes in the sidebar
    vm.showSubsolarPoint = true;
    vm.showGroundTrack = true;

    // Populate params1d from constants.ORBIT_COLOR_PARAMS and the
    // kpMetadata.getMetadata() service.
    vm.params1d = [];
    kpMetadata.getMetadata().then(function( metadata ) {

        var metadataLookup = {};
        metadata.forEach(function( metadatum ) {
            metadataLookup[ metadatum.query_parameter ] = metadatum;
        });

        vm.params1d = constants.ORBIT_COLOR_PARAMETERS.map(function( paramId ) {
            var metadatum = metadataLookup[ paramId ];
            return {
                id: paramId,
                value: paramId,
                display: metadatum.kp_column_name,
                units: metadatum.units
            }
        });
    });

    kpDataTransformer.dataReady.addEventListener(function( properties ) {

        var meanDate = Cesium.JulianDate.fromDate(
            new Date(
                (properties.dataStartDate.getTime() + properties.dataEndDate.getTime()) / 2
            )
        );

        // TODO - might need to turn this Date into a JulianDate?
        var meanSolarLongitude = properties.solarLongitude.getValue( meanDate );

        // round to nearest MGITM solar longitude value (multiples of 90)
        if( meanSolarLongitude >= 315 || meanSolarLongitude < 45 ) {
            vm.mgitmSolarLongitude = 0;
        }
        else if( meanSolarLongitude >= 45 && meanSolarLongitude < 135 ) {
            vm.mgitmSolarLongitude = 90;
        }
        else if( meanSolarLongitude >= 135 && meanSolarLongitude < 225 ) {
            vm.mgitmSolarLongitude = 180;
        }
        else if( meanSolarLongitude >= 225 && meanSolarLongitude < 315 ) {
            vm.mgitmSolarLongitude = 270;
        }
        else {
            throw new Error("Programmer Error: this should be impossible");
        }
    });

    // Populate params3d from constants.ORBIT_WHISKER_PARAMETERS and the
    // kpMetadata.getMetadata() service.
    vm.params3d = [];
    kpMetadata.getMetadata().then(function( metadata ) {

        var metadataLookup = {};
        metadata.forEach(function( metadatum ) {
            metadataLookup[ metadatum.query_parameter ] = metadatum;
        });

        vm.params3d = Object.keys( constants.ORBIT_WHISKER_PARAMETERS ).map(function( displayText ) {
            // The general paramId is calculated by slicing off the '_x' from the first xyz paramId
            // For example, "mag_magnetic_field_mso_x" will become "mag_magnetic_field_mso"
            // This works since all xyz triples share the same base name, their only difference
            // being a different "_x", "_y", or "_z" suffix.
            var paramId = constants.ORBIT_WHISKER_PARAMETERS[displayText][0].slice(0, -2);
            var metadatum = metadataLookup[ paramId + "_x"];
            return {
                id: paramId,
                value: displayText,
                display: displayText,
                units: metadatum.units // Assumes units are the same for each xyz triple of a parameter
            }
        });
    });

    // Populate paramsMgitm from constants.MGITM_PARAMETERS and the
    // mgitmMetadata.getMetadata() service.
    vm.paramsMgitm = [];
    mgitmMetadata.getMetadata().then(function( metadata ) {
        vm.paramsMgitm = constants.MGITM_PARAMETERS.map(function( paramId ) {
            var metadatum = metadata[ paramId ];
            return {
                id: paramId,
                value: paramId,
                display: metadatum.long_name,
                units: metadatum.units
            }
        });
    });

    // This will be populated by the <cesium> component via setCesiumViewer once
    // the viewer is available.
    vm.cesiumViewer = null;

    // Start this whole kit-and-kaboodle off by requesting the available dates for this
    // data from the server. Once that's done, <create-cesium> will notice the change to
    // the properties and will create the Cesium viewer.
    availableDates.getAvailableDateRange().then(function( availableDates ) {

        var start = availableDates.first;
        var end = availableDates.last;

        vm.availableDates = {
            start: start,
            end: end
        };

        // The initial values of displayDates should be the most recent 24 hrs of data.
        // The last available date will have hh:mm:ss of 23:59:59 so we can calculate
        // the appropriate start date by just setting hh:mm:ss to 00:00:00
        vm.displayDates = {
            start: new Date(Date.UTC(
                end.getUTCFullYear(),
                end.getMonth(),
                end.getDate(),
                0, 0, 0, 0
            )),
            end: end
        };

        // Normally <spacecraft-entities> watches this for date range changes from the
        // <date-range-picker>, but we can hijack it to send the initial date values
        // as well
        vm.requestedDates = {
            start: vm.displayDates.start,
            end: vm.displayDates.end
        };
    });

    // Callback from the <date-range-picker>, when the user hits Reload
    vm.onDateRangeChanged = function( start ) {
        vm.requestedDates = {
            start: new Date(Date.UTC(
                start.getUTCFullYear(),
                start.getUTCMonth(),
                start.getUTCDate(),
                0, 0, 0, 0
            )),
            end: new Date(Date.UTC(
                start.getUTCFullYear(),
                start.getUTCMonth(),
                start.getUTCDate(),
                23, 59, 59, 999
            ))
        };
    };

    // Callback from the <cesium> component, when the Cesium.Viewer is ready
    vm.setCesiumViewer = function( cesiumViewer ) {
        vm.cesiumViewer = cesiumViewer;
    };

    // Callback from the <cesium> component; when the Cesium.Clock instance changes
    // it's start/end dates, update the dates in the <date-range-picker>
    // The +1 is necessary to keep the date from jumping back one day after the
    // request is done. Why is this necessary? The world may never know.
    vm.setDisplayDates = function( timeframe ) {
        vm.displayDates = angular.copy( timeframe );
    };

    // Toggle the visibility of the highstock plots pane. Retains the previous width before the
    // highstock pane was hidden. Note that this toggles the vm.plotPaneOpen variable as well.
    vm.togglePaneWidths = function() {
        vm.plotPaneOpen = !vm.plotPaneOpen;
        var cesiumContainer = angular.element(document.querySelector('#cesium-container'));
        var highstockContainer = angular.element(document.querySelector('#highstock-container'));
        if(vm.plotPaneOpen) { // Show highstock plots pane
            cesiumContainer.css('width', vm.cesiumPaneWidth);
            highstockContainer.css('width', vm.highstockPaneWidth);
        } else { // Hide highstock plots pane
            vm.cesiumPaneWidth = cesiumContainer.css('width'); // retain current cesium pane width
            vm.highstockPaneWidth = highstockContainer.css('width'); // retain current highstock pane width
            cesiumContainer.css('width', '100%');
            highstockContainer.css('width', '0%');
        }
    }

}

})();

(function() {

/**
 * <create-cesium> component
 *
 * This component must live inside the <cesium>
 * component. It calls cesium.makeViewer(...)
 * once all the necessary data has loaded. This
 * component does not add any entities to the
 * Cesium viewer.
 *
 * This component also does a fair amount of
 * configuration on the Cesium viewer, in order
 * to make it look like Mars instead of Earth.
 */
angular
.module("beryllium-maven")
.component("createCesium", {
    template: "",
    require: {
        cesium: "^^cesium"
    },
    bindings: {
        initialDates: '<'
    },
    controller: [
        'availableDates',
        'maven3dConstants',
        'layers',
        createCesiumController
    ]
});

// Note: the 'require'-ed controllers will not be available
// in the constructor, you'll have to wait until $onInit
function createCesiumController( availableDates, constants, layers ) {
    var vm = this;

    // Test whether initialDates has a value at the time that this
    // component is created. If not, this value will be set to
    // true later, once they have been received.
    var initialDatesReceived =
        vm.initialDates &&
        vm.initialDates.start &&
        vm.initialDates.end;

    // If we have initialDates, use them to initialize the
    // Cesium viewer.
    if( initialDatesReceived ) {
        initCesium( vm.initialDates );
    }

    vm.$onChanges = function( changesObj ) {

        // If we didn't receive initialDates at creation time,
        // and this is the first time we've received them, then
        // initialize the Cesium viewer and set
        // initialDatesReceived to true.
        if(
            !initialDatesReceived &&
            changesObj.initialDates &&
            changesObj.initialDates.currentValue &&
            changesObj.initialDates.currentValue.start &&
            changesObj.initialDates.currentValue.end
        )
        {
            initCesium( changesObj.initialDates.currentValue );
            initialDatesReceived = true;
        }
    }

    // Initialize the Cesium viewer and configure it to look like Mars
    function initCesium( timeframe ) {
        var viewer = vm.cesium.makeViewer(
            timeframe.start,
            timeframe.end,
            function( config ) {
                return angular.extend(
                    {},
                    config,
                    {
                        mapProjection: new Cesium.GeographicProjection( constants.MARSIAU2000 ),

                        geocoder: false,
                        homeButton: false,
                        sceneModePicker: false,
                        navigationHelpButton: false,
                        infoBox: false,

                        imageryProviderViewModels: layers.imageryViewModels,
                        selectedImageryProviderViewModel: layers.get( 'Viking' ),

                        terrainProviderViewModels: layers.terrainViewModels,
                        selectedTerrainProviderViewModel: layers.getTerrain( 'MARSIAU2000' )
                    }
                );
            }
        );

        // Delete the default Sun and Moon entities. The Moon doesn't
        // apply to Mars, and the Sun's position seems to be hardcoded
        // based on it's position above Earth at the current clock time
        // (We'll create our own Sun in <sun-entities>)
        viewer.scene.sun.destroy();
        viewer.scene.sun = undefined;
        viewer.scene.moon.destroy();
        viewer.scene.moon = undefined;

        // Change the color of the atmosphere to match that of Mars
        viewer.scene.skyAtmosphere.hueShift = 0.47;

        // Viewer clock settings
        viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
        viewer.clock.multiplier = 1000;

        // This fixes a rendering bug where a black 'square' surrounds the
        // planet and prevents the orbit from rendering inside the square.
        viewer.scene.globe.depthTestAgainstTerrain = true;

        // Make sure that the view frustum is large enough to accomodate the
        // Sun entity we're creating in <sun-entities>
        viewer.camera.frustum.far = constants.MAX_MARS_SUN_DISTANCE_METERS;

        // Fly the camera to some default starting location that shows the
        // whole planet. Right now we're using:
        //
        // latitude: 0
        // longitude: 0
        // height: 25,000 km
        //
        // There's nothing special about this location, it's just an arbitrary
        // spot that contains everything we need inside the viewport.
        var heightMeters = 25000 * 1000;
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(0, 0, heightMeters, constants.MARSIAU2000 )
        });

        //This fixes a bug where, upon the double-click of a page element, the
        //camera zooms to inside the planet. This same bug would occur using an
        //infobox that came up on a single click, and that infobox was removed
        //in the initialization of the Cesium viewer above.
        viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    }


}

})();

(function() {

    angular
        .module("beryllium-maven")
        .component("highstockPane", {
            templateUrl: "components/highstockPaneComponent/highstockPane.component.html",
            bindings: {
                timeframe: "<",
                selectedParam1d: "<",
                selectedParam3d: "<",
                selectedParamMgitm: "<",
                solarFlux: "<",
                solarLongitude: "<",
                altitude: "<",
                latitude: "<",
                longitude: "<"
            },
            controller: [
                "$scope",
                "$window",
                "$interval",
                "latis",
                "latisMavenTeam",
                "maven3dConstants",
                highstockPaneController
            ],
            controllerAs: '$pane'
        });

    function highstockPaneController( $scope, $window, $interval, latis, latisMavenTeamService, constants ) {
        var vm = this;
        var timeFilters, mgitmFilters = null;
        var paramPlotIds = {
            "1d": [0],
            "3d": [1, 2, 3],
            "mgitm": [4, 5]
        };
        vm.plots = [];

        // So it doesn't have to create a new latis object
        // every time latisMavenTeamService is called
        var latisObj = latisMavenTeamService;

        latis.setBase(latisObj.latisBaseUrl);

        vm.$onChanges = function( changes ) {
            // Timeframe changed
            if ( changes.hasOwnProperty('timeframe') ) {
                // Takes a bit for timeframe to be set
                if(vm.timeframe.start && vm.timeframe.end) {
                    timeFilters = [
                        'time>=' + vm.timeframe.start.toISOString(),
                        'time<=' + vm.timeframe.end.toISOString()
                    ];

                    vm.timeRange = {
                        total: {start: vm.timeframe.start, end: vm.timeframe.end},
                        visible: {start: null, end: null}
                    };

                    // Update the time range for all plots
                    for (var i = 0; i < vm.plots.length; i++) {
                        // Only update if it's a time based dataset
                        if (typeof vm.plots[i].timeRange !== "undefined") {
                            vm.plots[i].plotObj.setTimeRange(vm.timeRange);
                        }
                    }
                }
            }

            // Selected 1d param changed
            if ( changes.hasOwnProperty('selectedParam1d') ) {
                update1d(changes);
            }

            // Selected 3d param changed
            if ( changes.hasOwnProperty('selectedParam3d') ) {
                update3d(changes);
            }

            // Relevant M-GITM param changed
            if ( changes.hasOwnProperty('selectedParamMgitm') || changes.hasOwnProperty('solarFlux') ||
                changes.hasOwnProperty('solarLongitude') || changes.hasOwnProperty('altitude') ||
                changes.hasOwnProperty('latitude') || changes.hasOwnProperty('longitude') ) {
                updateMgitm(changes);
            }
        };

        // Update 1d plot
        function update1d( changes ) {
            var param = '1d';
            if (vm.selectedParam1d === "none") { // remove 1d plot
                removePlots(paramPlotIds[param]);
            } else {
                if (vm.timeframe.start && vm.timeframe.end) { // add 1d plot
                    var dataset1d = ['timetag'].concat( vm.selectedParam1d );
                    var url1d = latisObj.getUrlExtension('in_situ_kp', 'jsond', dataset1d, []);
                    var plotObj = createPlotObj(url1d, vm.selectedParam1d, '1D', ['x', 'y'], paramPlotIds[param][0], vm.timeRange, vm.menuOptions);

                    if (changes['selectedParam1d'].previousValue === "none") {
                        vm.plots.splice(vm.plots.length, 0, plotObj);
                    } else {
                        replacePlots([plotObj]);
                    }
                }
            }
        }

        // Update 3d plots
        function update3d( changes ) {
            var param = '3d';
            if (vm.selectedParam3d === "none") { // remove 3d plots
                removePlots(paramPlotIds[param]);
            } else {
                if (vm.timeframe.start && vm.timeframe.end) { // add 3d plots
                    var dataset3d = ['timetag'].concat(constants.ORBIT_WHISKER_PARAMETERS[vm.selectedParam3d]);
                    var url3d = latisObj.getUrlExtension('in_situ_kp', 'jsond', dataset3d, []);
                    var xPlotObj = createPlotObj(url3d, dataset3d[1], '3D', ['x', 'y', null, null], paramPlotIds[param][0], vm.timeRange, vm.menuOptions); // x
                    var yPlotObj = createPlotObj(url3d, dataset3d[2], '3D', ['x', null, 'y', null], paramPlotIds[param][1], vm.timeRange, vm.menuOptions); // y
                    var zPlotObj = createPlotObj(url3d, dataset3d[3], '3D', ['x', null, null, 'y'], paramPlotIds[param][2], vm.timeRange, vm.menuOptions); // z

                    if (changes['selectedParam3d'].previousValue === "none") {
                        vm.plots.splice(vm.plots.length, 0, xPlotObj, yPlotObj, zPlotObj);
                    } else {
                        replacePlots([xPlotObj, yPlotObj, zPlotObj]);
                    }
                }
            }
        }

        // Update M-GITM plots
        function updateMgitm( changes ) {
            var param = 'mgitm';
            if (vm.selectedParamMgitm === "none") { // remove m-gitm plots
                removePlots(paramPlotIds[param]);
            } else { // add m-gitm plots
                var mgitmMenuOptions = angular.copy(vm.menuOptions); // copy menuOptions
                mgitmMenuOptions.timeLabels.format = 'raw'; // Use lat. and long. instead of time
                mgitmFilters = [
                    "solar_flux=" + vm.solarFlux,
                    "solar_longitude=" + vm.solarLongitude,
                    "altitude=" + vm.altitude
                ];

                // Latitude
                var urlMgitmLatitude = latisObj.getUrlExtension('mgitm',
                    'jsond',
                    ['Latitude'].concat(vm.selectedParamMgitm),
                    mgitmFilters.concat("Longitude=" + vm.longitude));
                var latitudeName = vm.selectedParamMgitm + " vs Latitude where Longitude = " + vm.longitude;
                var latPlotObj = createPlotObj(urlMgitmLatitude, latitudeName, 'M-GITM', ['x', 'y'], paramPlotIds[param][0], undefined, mgitmMenuOptions);

                // Longitude
                var urlMgitmLongitude = latisObj.getUrlExtension('mgitm',
                    'jsond',
                    ['Longitude'].concat(vm.selectedParamMgitm),
                    mgitmFilters.concat("Latitude=" + vm.latitude));
                var longitudeName = vm.selectedParamMgitm + " vs Longitude where Latitude = " + vm.latitude;
                var longPlotObj = createPlotObj(urlMgitmLongitude, longitudeName, 'M-GITM', ['x', 'y'], paramPlotIds[param][1], undefined, mgitmMenuOptions);

                if (changes.hasOwnProperty('selectedParamMgitm') && changes['selectedParamMgitm'].previousValue === "none") {
                    vm.plots.splice(vm.plots.length, 0, latPlotObj, longPlotObj);
                } else {
                    replacePlots([latPlotObj, longPlotObj]);
                }
            }
        }

        // Create a plot object with the given data
        function createPlotObj( accessURL, name, desc, indexes, plotId, timeRange, menuOptions) {
            var dataObj = [{
                accessURL: accessURL,
                desc: desc,
                indexes: indexes,
                name: name,
                plotId: plotId
            }];

            return {"datasets": dataObj, "timeRange": timeRange, "menuOptions": menuOptions};
        }

        // Return the plotIndex and datasetIndex of the plot with the given plotId
        function getPlotIndex( plotId ) {
            for (var i = 0; i < vm.plots.length; i++) {
                for (var j = 0; j < vm.plots[i].datasets.length; j++) {
                    if (vm.plots[i].datasets[j].plotId === plotId) {
                        return { "plotIndex": i, "datasetIndex": j };
                    }
                }
            }
            return {}
        }

        // Remove plots with the given plot IDs from the plots object
        function removePlots( plotIds ) {
            for (var i = vm.plots.length - 1; i >= 0; i--) {
                for (var j = vm.plots[i].datasets.length - 1; j >= 0; j--) {
                    if (plotIds.indexOf(vm.plots[i].datasets[j].plotId) !== - 1) {
                        if (vm.plots[i].datasets.length > 1) {
                            vm.plots[i].datasets.splice(j, 1);
                        } else {
                            vm.plots[i].plotObj.removePlot();
                        }
                    }
                }
            }
        }

        // Replace plots with their updated plots from the given plotObjs array
        function replacePlots( plotObjs ) {
            for (var i = 0; i < plotObjs.length; i++) {
                var indices = getPlotIndex(plotObjs[i].datasets[0].plotId);
                vm.plots[indices.plotIndex].datasets.splice(indices.datasetIndex, 1, plotObjs[i].datasets[0]);
            }
        }

        // Default menu options
        vm.menuOptions = {
            dataDisplay: {
                dataGrouping: false,
                gaps: {
                    enabled: true,
                    threshold: 3
                },
                filter: {
                    minmax: {
                        enabled: false,
                        min: null,
                        max: null
                    },
                    delta: {
                        enabled: false,
                        value: null
                    }
                },
                seriesDisplayMode: 'lines',
                showMinMax: true
            },
            menuDisabled: false,
            timeLabels: {
                format: 'auto',
                momentTimeFormat: 'YYYY-MM-DD',
                timezone: 'Zulu'
            },
            view: {
                legend: true,
                limits: false,
                limitViolationFlags: true,
                navigator: true
            },
            yAxis: {
                scaling: {
                    type: 'auto',
                    low: null,
                    high: null
                }
            },
            zoomMode: 'x'
        };

        /* Code related to plot auto-scrolling */

        // when the user starts to drag a plot to reorder it, listen to mouse events and watch the position of the mouse
        // so we can scroll when the user drags close to the top or bottom of the window
        var dragScrollInterval, dragScrollSpeed, dragElement;
        vm.onPlotDragStart = function( item, part, index, helper ) {
            dragElement = helper.element[0];
            // react when the user moves the cursor near the top or bottom of the main container.
            // Scroll up/down if the cursor is close enough to the edge.
            // The scroll speed is determined by how close the mouse is to the edge
            dragScrollSpeed = 0;
            $window.addEventListener( 'mousemove', onDragMouseMove );
            // set an interval to scroll 10 times/sec
            dragScrollInterval = $interval( function() {
                document.querySelector('#highstock-container').scrollTop += dragScrollSpeed;
            }, 10 );
        };

        // Remove drag scroll listeners when the element is released from dragging
        vm.onPlotDragStop = function() {
            $window.removeEventListener( 'mousemove', onDragMouseMove );
            $interval.cancel( dragScrollInterval );
        };

        // When the mouse is moved, determine what the scroll speed/direction should be
        function onDragMouseMove( e ) {
            var mainRect = document.querySelector('#highstock-container').getBoundingClientRect();
            var plotRect = dragElement.getBoundingClientRect();
            var yTop = mainRect.y || mainRect.top;
            var plotTop = plotRect.y || plotRect.top;

            var edgeThreshold = 50, // how close does the mouse need to be from the edge before it starts scrolling?
                maxScrollSpeed = 50,
                minScrollSpeed = 0,
                percentOfMaxScroll;
            if ( e.clientY < yTop + edgeThreshold ) {
                // percent is negative because we want to scroll up (adding a negative value to scrollTop)
                percentOfMaxScroll = -Math.min( 1, (yTop + edgeThreshold - e.clientY) / edgeThreshold );
            }
            // instead of watching for the user to move the mouse close to the bottom of the window, see where the
            // mouse cursor is relative to the top of the plot. A dragged plot can't disappear below the bottom of the window,
            // so when the user tries to drag a plot downward, the cursor will be far below the top of the plot
            else if ( e.clientY > plotTop + edgeThreshold ) {
                percentOfMaxScroll = Math.min( 1, (e.clientY - plotTop - edgeThreshold) / edgeThreshold );
            } else {
                percentOfMaxScroll = 0;
            }

            dragScrollSpeed = minScrollSpeed + percentOfMaxScroll * (maxScrollSpeed - minScrollSpeed);
        }
    }

})();

(function() {

angular
.module("beryllium-maven")
.component("legend", {
    templateUrl: "components/legendComponent/legend.component.html",
    require: { cesium: "^^cesium" },
    bindings: {
        "showSubsolarPoint": "=",
        "showGroundTrack": "=",
        "selectedParam1d": "<",
        "selectedParam3d": "<",
        "selectedParamMgitm": "<",
        "params1d": "<",
        "params3d": "<",
        "paramsMgitm": "<"
    },
    controller: [
        "$scope",
        "kpDataTransformer",
        "mgitmDataTransformer",
        "berylliumColors",
        legendController
    ]
});

function legendController( $scope, kpDataTransformer, mgitmDataTransformer, berylliumColors ) {
    var vm = this;

    // Sets variables of data provided by the kpDataTransformer
    var kpProperties;
    kpDataTransformer.dataReady.addEventListener(function( _properties ) {
        kpProperties = _properties;
        vm.orbitPathColormap = kpProperties.orbitPathColormap;
        vm.whiskerColormap = kpProperties.whiskerColormap;
        vm.minOrbitColorParam = kpProperties.minOrbitColorParam;
        vm.maxOrbitColorParam = kpProperties.maxOrbitColorParam;
        vm.minWhiskerMagnitude = kpProperties.minWhiskerMagnitude;
        vm.maxWhiskerMagnitude = kpProperties.maxWhiskerMagnitude;
    });

    // Sets variables of data provided by the mgitmDataTransformer
    var mgitmProperties;
    mgitmDataTransformer.dataReady.addEventListener(function( _properties ) {
        mgitmProperties = _properties;
        vm.mgitmColormap = mgitmProperties.mgitmColormap;
        vm.minMgitm = mgitmProperties.minMgitm;
        vm.maxMgitm = mgitmProperties.maxMgitm;
    });

    //////////* Variables dealing with background gradient styles *//////////

    // Creates a computed variable for the orbit path gradient css
    Object.defineProperty(vm, 'orbitPathGradient', {
        get: function() { return berylliumColors.colorMapToCSSBackground(vm.orbitPathColormap) }
    });

    // Creates a computed variable for the whisker gradient css
    Object.defineProperty(vm, 'whiskerGradient', {
        get: function() { return berylliumColors.colorMapToCSSBackground(vm.whiskerColormap) }
    });

    // Creates a computed variable for the mgitm gradient css
    Object.defineProperty(vm, 'mgitmGradient', {
        get: function() { return berylliumColors.colorMapToCSSBackground(vm.mgitmColormap) }
    });

    //////////* Variables and functions dealing with parameter units *//////////

    // Creates a computed variable for the 1d units
    Object.defineProperty(vm, 'selectedParam1dUnits', {
        get: function() { return getParamUnits(vm.params1d, vm.selectedParam1d) }
    });

    // Creates a computed variable for the 3d units
    Object.defineProperty(vm, 'selectedParam3dUnits', {
        get: function() { return getParamUnits(vm.params3d, vm.selectedParam3d) }
    });

    // Creates a computed variable for the mgitm units
    Object.defineProperty(vm, 'selectedParamMgitmUnits', {
        get: function() { return getParamUnits(vm.paramsMgitm, vm.selectedParamMgitm) }
    });

    // Computes the units of the given parameter
    // Returns 'No Data' if it does not exist in the given parameters object array
    function getParamUnits(params, selectedParam) {
        var param = params.find(function(param) { return param.value === selectedParam; });
        return param ? param.units : "No Data";
    }

    //////////* Variables and functions dealing with parameter display names *//////////

    // Creates a computed variable for the 1d parameter display name
    Object.defineProperty(vm, 'selectedParam1dDisplay', {
        get: function() { return getParamDisplay(vm.params1d, vm.selectedParam1d) }
    });

    // Creates a computed variable for the 3d parameter display name
    Object.defineProperty(vm, 'selectedParam3dDisplay', {
        get: function() { return getParamDisplay(vm.params3d, vm.selectedParam3d) }
    });

    // Creates a computed variable for the mgitm parameter display name
    Object.defineProperty(vm, 'selectedParamMgitmDisplay', {
        get: function() { return getParamDisplay(vm.paramsMgitm, vm.selectedParamMgitm) }
    });

    // Computes the display name of the given parameter
    // Returns 'none' if it does not exist in the given parameters object array
    function getParamDisplay(params, selectedParam) {
        var param = params.find(function(param) { return param.value === selectedParam; });
        return param ? param.display : "none";
    }
}

})();

(function() {

// Angular component for the M-GITM shell display inside
// the Cesium component
angular
.module("beryllium-maven")
.component( "mgitmShell", {
    template: "",
    require: {
        cesium: "^^cesium"
    },
    bindings: {
        "solarFlux": "<",
        "solarLongitude": "<",
        "altitude": "<",
        "parameter": "<"
    },
    controller: [
        "maven3dConstants",
        "mgitmDataTransformer",
        "CallbackPositionProperty",
        mgitmShellController
    ]
});

function mgitmShellController( constants, mgitmDataTransformer, CallbackPositionProperty ) {
    var vm = this;
    var dataTransformer = mgitmDataTransformer;
    var properties, shell, subsolarPoint, secondRotationAxis;

    // This can be set to true to display various utilities that help
    // debug the alignment of the M-GITM shell. E.g., it displays lines
    // on the edges of the M-GITM image, so that you can see where the
    // image edges wind up when "wrapped" around the spherical shell.
    // There is also a blue line that shows the axis of rotation of
    // the second alignment rotation that we do, since that axis is
    // manually calculated and easy to mess up (it should be on the
    // equator, 90degrees east of the subsolar point)
    var DEBUG = false;

    // We'll render the M-GITM data to a <canvas> element so that we can
    // have pixel-level control over what Cesium displays on the sphere
    // entity.
    var canvas = document.createElement("canvas");
    if( DEBUG ) {
        // Draw the canvas in the upper left corner, so we can see what it
        // actually looks like before it's wrapped around the shell
        canvas.style.cssText = "position:fixed;top:0;left:0;outline:1px solid red;z-index:99;";
        document.body.appendChild( canvas );
    }
    var ctx = canvas.getContext("2d");

    // Provide the dataTransformer with various requirements, when requested
    dataTransformer.requirementsManager.addRequirementsProvider(function() {
        return {
            parameter: vm.parameter,
            displayType: "shell",
            solarFlux: vm.solarFlux,
            solarLongitude: vm.solarLongitude,
            altitude: vm.altitude
        }
    });

    // On the off chance that we have enough information to request data
    // right at startup, notify the dataTransformer that our requirements
    // have changed (from "nothing", to "something"). However, as of this
    // writing this will never execute because the starting value for
    // "parameter" will be "none" (it's hardcoded in the main controller)
    if( vm.parameter !== "none" ) {
        dataTransformer.requestReload();
    }

    // When we receive new properties from the dataTransformer, save them off
    // and, if everything else is ready, draw them to the viewer. Generally speaking
    // the viewer will always be ready (once it becomes ready it will stay ready
    // indefinitely), but this logic is necessary to prevent a race condition
    // during initial startup where we can't guarantee that the viewer will be
    // ready before the data arrives.
    var dataIsReady = false;
    dataTransformer.dataReady.addEventListener(function( _properties ) {
        properties = _properties;
        dataIsReady = true;
        if( viewerIsReady ) {
            drawEntities();
        }
    });

    // First, wait for "^^cesium" to be ready, and then wait for the Cesium Viewer
    // to be ready. Once they are, set viewerIsReady and, if we've already received
    // data from the dataTransformer, render the data to the Viewer.
    var viewerIsReady = false;
    vm.$onInit = function() {
        vm.cesium.onViewerReady(function( viewer ) {
            viewerIsReady = true;
            if( dataIsReady ) {
                drawEntities();
            }
        });
    }

    // Currently, all of our bindings are backend parameters that change what data
    // we need to have loaded, so whenever we see a change we should load new data.
    // The only exception is if "parameter" is "none", which effectively turns this
    // component off.
    vm.$onChanges = function( changesObj ) {
        dataIsReady = false;
        deleteEntities();
        if( vm.parameter !== "none" ) {
            dataTransformer.requestReload();
        }
    };

    // Draw the entities for this component to the Cesium Viewer. In order for
    // this method to be successfull, both the Cesium Viewer and the data from
    // the DataTransformer must be ready. The entities drawn by this method
    // may be deleted from the Viewer by calling deleteEntities().
    function drawEntities() {

        deleteEntities();

        // Determine the width and height by inspecting the data. If there
        // is no data, set width=0 and height=0 (should never happen, but
        // better safe than sorry)
        var height = properties.pixelArray.length;
        var width = properties.pixelArray.length === 0
            ? 0
            : properties.pixelArray[0].length;

        if( width === 0 || height === 0 ) {
            // Cesium will just throw an error if we try to continue, so we
            // may as well just return.
            console.error("No M-GITM " + vm.parameter + " data received from the server");
            return;
        }

        // Set canvas dimensions
        canvas.width = width;
        canvas.height = height;

        // Get an imagedata object from the canvas to populate its pixels.
        // According to some StackOverflow article I read somewhere, this
        // is the fastest way to do that.
        var imgDataObj = ctx.createImageData(width, height);
        var imgData = imgDataObj.data;

        // Populate the imagedata array pixel-by-pixel from properties.pixelArray
        properties.pixelArray.forEach(function( row, rowIndex ) {
            row.forEach(function( color, colIndex ) {
                var baseIndex = (rowIndex * width + colIndex) * 4;

                imgData[ baseIndex + 0 ] = color.red * 255;
                imgData[ baseIndex + 1 ] = color.green * 255;
                imgData[ baseIndex + 2 ] = color.blue * 255;
                imgData[ baseIndex + 3 ] = 127.5; // alpha=127.5: 50% opacity
            });
        });

        // If we're debugging, draw some calibration lines around the edges
        // of the image, overwriting the data we just drew to the canvas.
        // This is useful for making sure the edges of the canvas are where
        // you think they are on the shell.
        if( !DEBUG ) {
            ctx.putImageData( imgDataObj, 0, 0 );
        }
        else {
            drawCalibrationLines( ctx );
        }

        // The data is all at the same altitude, but the altitude is "distance
        // above the surface of Mars" and not "distance from the center of Mars"
        // which is what Cesium needs.
        var radius = properties.altitudeMeters + constants.MARS_RADIUS_METERS;

        // A lot of the magic numbers here were found through careful tinkering
        // to make the shell face in the correct direction. For example:
        //
        // * position: should be [0,0,0], but Cesium throws some sort of error
        //        if that happens. Using a tiny 1m offset on the z-axis causes it
        //        to orient in the direction we want.
        // * orientation: Orientation is set dynamically to account for rotation
        //        of the planet. Interestingly though, when I was setting it manually
        //        I noticed that an orientation of 0deg aligns the image differently
        //        than specifying no rotation. The boundaries
        //        of our image are lat: [-90,90], lng: [0, 365] and a 0deg rotation
        //        about the z-axis appears to line us up like that.
        shell = vm.cesium.viewer.entities.add({
            position: new Cesium.Cartesian3( 0, 0, 1 ),
            orientation: properties.orientation,
            ellipsoid: {
                radii: new Cesium.Cartesian3( radius, radius, radius ),
                fill: false,
                material: new Cesium.ImageMaterialProperty({
                    image: canvas,
                    transparent: true
                })
            },
            availability: vm.cesium.defaultAvailability()
        });

        // Shows the ellipsoid only when the user chooses to show parameter data.
        // This prevents the weird Angular 1.6 bug where the ellipsoid is shown
        // as a gray outer layer at load time.
        if( vm.parameter !== "none" ) {
            shell.ellipsoid.fill = true;
        }

        // If we're debugging this component, display it's subsolar point using a
        // crosshairs icon. If the rotations we're applying are correct it should
        // appear directly underneath the KP data's subsolar point.
        if( DEBUG ) {
            var scratchCartesian3 = new Cesium.Cartesian3();
            var rotationMatrixScratch = new Cesium.Matrix4();
            var scaleIdentity = new Cesium.Cartesian3(1, 1, 1);

            subsolarPoint = vm.cesium.viewer.entities.add({
                id: "mgitmSubsolarPoint",
                availability: vm.cesium.defaultAvailability(),
                position: new CallbackPositionProperty(
                    function( time ) {

                        // Compute the M-GITM subsolar point by getting the KP subsolar point
                        // and applying the same rotation that we're using for the shell data.
                        var kpSubsolarPoint = properties.subsolarPoint.getValue( time );
                        var rotation = properties.orientation.getValue( time );

                        var rotationMatrixScratch = Cesium.Matrix4.fromTranslationQuaternionRotationScale(
                            Cesium.Cartesian3.ZERO,
                            rotation,
                            scaleIdentity,
                            rotationMatrixScratch
                        );

                        scratchCartesian3 = Cesium.Matrix4.multiplyByPoint(
                            rotationMatrixScratch,
                            kpSubsolarPoint,
                            scratchCartesian3
                        );

                        return scratchCartesian3;
                    },
                    false
                ),
                billboard: {
                    image: "img/Crosshairs.png",
                    scale: 0.2,
                    eyeOffset: new Cesium.Cartesian3(0.0, 0.0, -1e6)
                }
            });
        }

        // If we're debugging the display of this component, show the second rotation axis
        // as a blue line that's roughly the same size as the <debug-axis> lines. We don't
        // typically need to debug the first rotation axis because it's just the z-axis.
        // However, the second axis is computed on the fly to cause the subsolar point to
        // rotate exactly north/south, so it's worth checking.
        if( DEBUG ) {
            secondRotationAxis = vm.cesium.viewer.entities.add({
                id: "secondRotationAxis",
                polyline: {
                    followSurface: false,
                    positions: new Cesium.PositionPropertyArray([
                        new Cesium.ConstantPositionProperty( Cesium.Cartesian3.ZERO ),
                        properties.secondRotationAxis
                    ]),
                    material: Cesium.Color.AQUAMARINE,
                    width: 3
                }
            });
        }
    }

    // Clean up any entities we may have created, including debugging entities
    function deleteEntities() {
        vm.cesium.deleteEntity( shell );
        if( subsolarPoint ) { vm.cesium.deleteEntity( subsolarPoint ); }
        if( secondRotationAxis ) { vm.cesium.deleteEntity( secondRotationAxis ); }
    }

    // Utility function for debugging image alignment on the shell.
    //
    // Given a reference to the Canvas' Context2D, draw lines around
    // the borders of the canvas so that we can see where they appear
    // on the globe. Often useful with the <debug-axis> component
    // from the beryllium library. Draws the following:
    //
    // background: blue
    // left edge: 1px solid red
    // right edge: 1px solid green
    // top edge: 3px solid white
    // bottom edge: 3px solid yellow
    //
    // Should appear as the following:
    // * red+green strip down the prime meridian (north pole to
    //        south pole along latitude=0). Red should be just east
    //        of the prime meridian, green should be just west of it.
    // * white circle at the north pole
    // * yellow circle at the south pole
    function drawCalibrationLines( ctx ) {

        var width = ctx.canvas.width;
        var height = ctx.canvas.height;

        ctx.fillStyle = "blue";
        ctx.fillRect( 0, 0, width, height );

        ctx.fillStyle = "red";
        ctx.fillRect( 0, 0, 1, height );

        ctx.fillStyle = "green";
        ctx.fillRect( width-1, 0, 1, height );

        ctx.fillStyle = "white";
        ctx.fillRect( 0, 0, width, 3 );

        ctx.fillStyle = "yellow";
        ctx.fillRect( 0, height-3, width, 3 );
    }
}

})();

(function() {

var GROUND_TRACK_COLOR = Cesium.Color.BLACK.withAlpha( 0.50 );

/**
 * <spacecraft-entities> component
 *
 * This component must live inside the <cesium>
 * component. It adds a handful of entities to the Cesium
 * viewer to represent the spacecraft. It can optionally
 * add color to the orbit path and whiskers around it, based
 * on the selectedParam1d and selectedParam3d bindings. The
 * spacecraft's ground track can be enabled/disabled via the
 * showGroundTrack binding.
 *
 * This component watches for changes on the timeframe object
 * and, when detected, will request new data from its
 * DataTransformer object. Once new data is received, it will
 * update the Cesium time via vm.cesium.setCesiumDates.
 */
angular
.module("beryllium-maven")
.component("spacecraftEntities", {
    template: "",
    require: {
        cesium: "^^cesium"
    },
    bindings: {
        timeframe: "<",
        selectedParam1d: "<",
        selectedParam3d: "<",
        showGroundTrack: "<"
    },
    controller: [
        "kpDataTransformer",
        "maven3dConstants",
        "berylliumColors",
        spacecraftController
    ]
});

function spacecraftController( kpDataTransformer, constants, berylliumColors ) {
    var vm = this;
    vm.dataTransformer = kpDataTransformer;

    vm.$onChanges = function( changesObj ) {

        // If timeframe, selectedParam1d or selectedParam3d changes,
        // that means we'll have to load new data. The only exception
        // is if we don't have valid timeframe values yet - in that
        // case we'll have to wait and make the request later when
        // they become available.
        if(
            (
                changesObj.timeframe ||
                changesObj.selectedParam1d ||
                changesObj.selectedParam3d
            ) &&
            (
                vm.timeframe.start &&
                vm.timeframe.end
            )
        )
        {
            deleteEntities();
            vm.dataTransformer.requestReload();
        }

        // If showGroundTrack changes, we can just toggle that via
        // a few Cesium switches. If groundTrackEntity does not
        // exit yet, just ignore this (it will be populated from
        // vm.showGroundTrack when it is eventually instantiated)
        if( changesObj.showGroundTrack && groundTrackEntity ) {
            var newVal = changesObj.showGroundTrack.currentValue;
            groundTrackEntity.point.show = newVal;
            groundTrackEntity.path.show = newVal;
            groundTrackEntity.polyline.show = newVal;
        }
    };

    // vm.cesium won't be available until $onInit
    vm.$onInit = function() {
        // Register to be notified when the viewer is ready
        vm.cesium.onViewerReady( onViewerReady );

        // When the reference frame changes, request new data. The raw data itself
        // won't change (i.e. we don't need to make another server request), but
        // the DataTransformer will have to re-generate the Properties from the
        // raw data, and we'll have to re-create our Entities from the Properites.
        // Currently, we rely on the fact that the DataProvider uses the
        // requestCacherService to avoid duplicate requests. If anything fails
        // with that request caching (e.g. browser doesn't support sessionStorage
        // or sessionStorage is already full) then duplicate requests will be
        // made
        vm.cesium.onReferenceFrameChange(function() {
            deleteEntities();
            vm.dataTransformer.requestReload();
        });
    };

    // The DataProvider needs to know a few things in order to be able to
    // request the appropriate data. Since this component knows many of
    // those things, we'll register to be a requirementsProvider whenver
    // a new request is being made.
    vm.dataTransformer.requirementsManager.addRequirementsProvider(function() {
        return {
            isInertial: vm.cesium.referenceFrame === "inertial",
            timeframe: vm.timeframe,
            selectedParam1d: vm.selectedParam1d,
            selectedParam3d: vm.selectedParam3d
        }
    });

    // Closure-scoped variables containing the Entities we create
    var orbitEntity,
        orbitPathPrimitive,
        groundTrackEntity,
        orbitWhiskersPrimitiveCollection;

    // When we get new Properties from the DataTransformer, re-create our Entities
    vm.dataTransformer.dataReady.addEventListener(function( properties ) {
        deleteEntities();
        var viewer = vm.cesium.viewer;

        // Update the Cesium Clock (and, indirectly, the start/end dates in the sidebar)
        // once we know what dates were actually returned from the server.
        vm.cesium.setCesiumDates({
            start: properties.dataStartDate,
            end: properties.dataEndDate
        });

        // Entity representing the spacecraft itself
        orbitEntity = viewer.entities.add({
            id: "orbitEntity",
            availability: vm.cesium.defaultAvailability(),
            position: properties.orbitPosition,
            orientation: properties.spacecraftOrientation,
            model: {
                uri: "models/maven_reduced.glb",
                minimumPixelSize: 100.0
            }
        });

        // Polyline representing the orbit path. Uses the same
        // data as the orbitEntity for the most part (also adds orbitColorsArray)
        //
        // I think we used a Primitive instead of an Entity here so that
        // we could color each segment of the polyline individually? Don't
        // remember for sure though.
        orbitPathPrimitive = viewer.scene.primitives.add(
            new Cesium.Primitive({
                geometryInstances: new Cesium.GeometryInstance({
                    geometry: new Cesium.PolylineGeometry({
                        positions: properties.orbitPositionArray,
                        width: 5.0,
                        vertexFormat : Cesium.PolylineColorAppearance.VERTEX_FORMAT,
                        colors: properties.orbitColorsArray,
                        ellipsoid: constants.MARSIAU2000,
                        followSurface: false
                    })
                }),
                appearance: new Cesium.PolylineColorAppearance()
            })
        );

        // Entity representing the points on the surface of the planet that the
        // spacecraft travels directly over.
        //
        // point: the point that is directly under the spacecraft at the current
        //        moment
        // path: the path which point will/did travel
        // polyline: a line segment from point to the spacecraft. It is essentially
        //        the spacecraft's nadir vector
        groundTrackEntity = viewer.entities.add({
            id: "groundTrackEntity",
            availability: vm.cesium.defaultAvailability(),
            position: properties.groundTrackPosition,
            point: {
                color: GROUND_TRACK_COLOR,
                pixelSize: 8,
                show: vm.showGroundTrack
            },
            path: {
                material: GROUND_TRACK_COLOR,
                width: 3,
                resolution: 600,
                show: vm.showGroundTrack
            },
            polyline: {
                followSurface: false,
                positions: new Cesium.PositionPropertyArray([
                    new Cesium.ReferenceProperty.fromString(
                        viewer.entities,
                        "orbitEntity#position"
                    ),
                    new Cesium.ReferenceProperty.fromString(
                        viewer.entities,
                        "groundTrackEntity#position"
                    )
                ]),
                material: berylliumColors.MISSING_VALUE_COLOR.withAlpha( 0.5 ),
                width: 3,
                show: vm.showGroundTrack
            }
        });

        // PrimitiveCollection of polylines representing the orbit whiskers, if
        // available.
        if( properties.whiskersPolylines ) {
            orbitWhiskersPrimitiveCollection = new Cesium.PrimitiveCollection();
            properties.whiskersPolylines.forEach(function( polylineGeometryConfig ) {
                orbitWhiskersPrimitiveCollection.add( new Cesium.Primitive({
                    geometryInstances: new Cesium.GeometryInstance({
                        geometry: new Cesium.PolylineGeometry( polylineGeometryConfig )
                    }),
                    appearance: new Cesium.PolylineColorAppearance()
                }));
            })
            orbitWhiskersPrimitiveCollection = viewer.scene.primitives.add(
                orbitWhiskersPrimitiveCollection
            );
        }
    });

    // When the viewer is ready, register to listen for onTick events
    function onViewerReady( viewer ) {
        viewer.clock.onTick.addEventListener( onTick );
    }

    // Scratch matrix for onTick
    var toInertial = new Cesium.Matrix3();

    // Will be called once per tick of the Cesium Clock instance. Is responsible for applying
    // various transforms to make the Inertial frame of reference look right (e.g. rotate the
    // orbitPathPrimitive and orbitWhiskersPrimitiveCollection in such a way that they look like
    // they aren't moving in an inertial frame of reference)
    function onTick( clock ) {
        if( !orbitEntity ) { return; }

        if( vm.cesium.referenceFrame === "inertial" ) {
            if(!Cesium.defined(Cesium.Transforms.computeIcrfToFixedMatrix(clock.currentTime, toInertial))) {
                Cesium.Matrix3.IDENTITY.clone(toInertial);
            }

            // Generate a matrix that represents the current geo-to-inertial rotation
            var toInertialModelMatrix = Cesium.Matrix4.fromRotationTranslation(
                toInertial,
                Cesium.Cartesian3.ZERO,
                new Cesium.Matrix4()
            );

            // Apply rotation to orbitPathPrimitive
            toInertialModelMatrix.clone( orbitPathPrimitive.modelMatrix );

            // If relevant, apply the rotation to each whisker in the orbitWhiskersPrimitiveCollection
            if( orbitWhiskersPrimitiveCollection ) {
                var len = orbitWhiskersPrimitiveCollection.length;
                // use for-loop instead of functional methods for speed: this
                // will be a relatively long loop that gets called a lot.
                for( var i=0; i<len; i++ ) {
                    var whiskerPrimitive = orbitWhiskersPrimitiveCollection.get(i);
                    toInertialModelMatrix.clone( whiskerPrimitive.modelMatrix );
                }
            }
        }
    }

    // Utility function to clean up all of our entities/primitives at once.
    // This will have to be updated if we ever add more entities/primitives.
    function deleteEntities() {
        vm.cesium.deleteEntity( orbitEntity );
        vm.cesium.deleteEntity( orbitPathPrimitive );
        vm.cesium.deleteEntity( groundTrackEntity );
        vm.cesium.deleteEntity( orbitWhiskersPrimitiveCollection );
    }
}

})();

(function() {

angular
.module("beryllium-maven")
.component("realtimeHud", {
    templateUrl: "components/realtimeHudComponent/realtimeHud.component.html",
    require: { cesium: "^^cesium" },
    bindings: {},
    controller: [
        "$scope",
        "maven3dConstants",
        "kpDataTransformer",
        realtimeHudController
    ]
});

function realtimeHudController( $scope, constants, kpDataTransformer ) {
    var vm = this;
    var dataTransformer = kpDataTransformer;

    // Keep labels and values in synchronized arrays.
    // Pros: can update the values easily every tick
    //        without changing the labels
    // Cons: synchronized arrays are easy to f*** up.
    //        You have to manually keep them in the same
    //        order.
    vm.labels = [
        "Elevation",
        "Latitude",
        "Longitude",
        "Solar Zenith Angle",
        "Solar Longitude (L<sub>S</sub>)"
    ];
    vm.values = [];

    // Whenever we get new properties from the DataTransformer, save them
    // off so the onTick function can access them.
    var properties;
    dataTransformer.dataReady.addEventListener(function( _properties ) {
        properties = _properties;
    });

    vm.$onInit = function() {
        vm.cesium.onViewerReady( onViewerReady );
    };

    function onViewerReady( viewer ) {
        viewer.clock.onTick.addEventListener( onTick );
    }

    // Code that should be executed once per clock tick
    function onTick( clock ) {
        if( !properties ) {
            return;
        }
        render( clock );
    }

    // Render (or re-render) the directive using the properties object
    // to populate the vm.values array.
    function render( clock ) {
        var cartesianPosition = properties.orbitPosition.getValue( clock.currentTime );
        var cartographicPosition = Cesium.Cartographic.fromCartesian(
            cartesianPosition,
            constants.MARSIAU2000
        );
        var solarZenithAngle = properties.solarZenithAngle.getValue( clock.currentTime );
        var solarLongitude = properties.solarLongitude.getValue( clock.currentTime );

        var heightKm = (cartographicPosition.height / 1000).toFixed(1);
        var latDeg = Cesium.Math.toDegrees( cartographicPosition.latitude ).toFixed(1);
        var lngDeg = Cesium.Math.toDegrees( cartographicPosition.longitude ).toFixed(1);
        var zenAngleDeg = solarZenithAngle.toFixed(1);
        var solarLongitudeDeg = solarLongitude.toFixed(1);

        var degreeSymbol = '\xB0';

        var elevationStr = heightKm + 'km';
        var latStr = latDeg + degreeSymbol;
        var lngStr = lngDeg + degreeSymbol;
        var zenithAngleStr = zenAngleDeg + degreeSymbol;
        var solarLongitudeStr = solarLongitudeDeg + degreeSymbol;

        // NOTE: order in this array must match order in the labels array
        vm.values = [
            elevationStr,
            latStr,
            lngStr,
            zenithAngleStr,
            solarLongitudeStr
        ];

        // Make sure the component actually notices the changes we've made
        $scope.$apply();
    }
}

})();

(function() {

/**
 * <sun-entities> component
 *
 * This component must live inside the <cesium>
 * component. It adds a handful of entities to the Cesium
 * viewer to represent the Sun and associated phenomena
 * (e.g. the subsolar point and the shadow on the night side)
 *
 * The subsolar point can be hidden/shown via the showSubsolarPoint
 * binding.
 */
angular
.module("beryllium-maven")
.component("sunEntities", {
    template: "",
    require: {
        cesium: "^^cesium"
    },
    bindings: {
        showSubsolarPoint: "<"
    },
    controller: [
        "kpDataTransformer",
        "maven3dConstants",
        sunEntitiesController
    ]
});

function sunEntitiesController( kpDataTransformer, constants ) {
    var vm = this;
    vm.dataTransformer = kpDataTransformer;

    // When showSubsolarPoint changes, show/hide the appropriate things
    // Note: if subSolarTrackEntity doesn't exist, do nothing. When it
    // is eventually instantiated it will use the value from vm.showSubSolarPoint
    // and so it will do the right thing at that point in time.
    vm.$onChanges = function( changesObj ) {
        if( changesObj.showSubsolarPoint && subSolarTrackEntity ) {
            subSolarTrackEntity.billboard.show = changesObj.showSubsolarPoint.currentValue;
        }
    };

    // Closure scoped variables that contain Entities and/or Primitives
    var subSolarTrackEntity,
        nightsideCenterTrackEntity,
        solarTrackEntity;

    vm.dataTransformer.dataReady.addEventListener(function( properties ) {
        deleteEntities();

        // Show a Sun icon at the sub-solar point
        subSolarTrackEntity = vm.cesium.viewer.entities.add({
            id: "subSolarTrackEntity",
            availability: vm.cesium.defaultAvailability(),
            position: properties.subSolarTrackPosition,
            billboard: {
                image: "img/Sun.png",
                scale: 0.2,
                // passes over projected orbit shadow but under actual orbit
                eyeOffset: new Cesium.Cartesian3(0.0, 0.0, -1e6),
                show: vm.showSubsolarPoint
            }
        });

        // Shadow on the night side of the planet
        nightsideCenterTrackEntity = vm.cesium.viewer.entities.add({
            id: "nightsideCenterTrackEntity",
            availability: vm.cesium.defaultAvailability(),
            position: properties.subSolarTrackPosition,
            ellipse: {
                //NOTE: what this actually tracks is still the subsolar position
                //however, because Cesium (for whatever reason) fills up the
                //opposite side of an ellipsoid if the ellipse is >= 50%
                //this is a bit of a hack to get the night side to an
                //accurate side/size
                semiMajorAxis: 0.5 * constants.MARS_CIRCUMFERENCE_METERS,
                semiMinorAxis: 0.5 * constants.MARS_CIRCUMFERENCE_METERS,
                material: Cesium.Color.BLACK.withAlpha(0.5),
                height: -constants.EARTH_MARS_RADII_DIFFERENCE_METERS + 150000,
                //additional 150000m is to keep the graphic above ground and not clipping into the terrain since
                //cesium doesnt want to play with our terrainProvider
                granularity: Cesium.Math.RADIANS_PER_DEGREE * 0.33
                // happy compromise between speed of sim and clipping coverage
            }
        });

        // Show the Sun itself at the appropriate point (note that the default Sun
        // that comes with Cesium was deleted in <create-cesium> because it was in
        // the wrong place for Mars)
        solarTrackEntity = vm.cesium.viewer.entities.add({
            id: "solarTrackEntity",
            availability: vm.cesium.defaultAvailability(),
            position: properties.solarTrackPosition,
            billboard: {
                image: "img/testSun.png",
                scale: 5.0
            }
        });
    });

    // Helper function to delete all of our Entities/Properties at once
    function deleteEntities() {
        vm.cesium.deleteEntity( subSolarTrackEntity );
        vm.cesium.deleteEntity( nightsideCenterTrackEntity );
        vm.cesium.deleteEntity( solarTrackEntity );
    }
}

})();

(function() {

/**
 * availableDates service
 *
 * Service that looks up the available date range for the entire
 * application.
 *
 * getAvailableDateRange: requests the overall available date range from the
 *         server. Returns a promise that resolves to { first: Date, last: Date }
 *
 * onDatesAvailable: set up a listener so that things besides the original
 *         requester can also listen for when these dates become available.
 *         Returns a promise that resolves to the same object as getAvailableDateRange
 */
angular.module('beryllium-maven').service(
    'availableDates',
    [
        '$q',
        'latisMavenTeam',
        'momentStrict',
        function( $q, latisMavenTeam, momentStrict ) {

            var availableDates = null;
            var datesAvailableListeners = [];

            return {
                getAvailableDateRange: getAvailableDateRange,
                onDatesAvailable: onDatesAvailable
            };

            // Requests the overall available date range from the
            // server. Returns a promise that resolves to { first: Date, last: Date }
            function getAvailableDateRange() {
                // Make two individual requests via queryDate and then combine them
                // into a single result.
                return (
                    $q.all([
                        queryDate('first'),
                        queryDate('last')
                    ])
                    .then( function( results ) {
                        availableDates = {
                            first: results[0],
                            last: results[1]
                        };

                        datesAvailableListeners.forEach(function( listener ) {
                            listener( availableDates );
                        });

                        return availableDates;
                    })
                );
            }

            // Helper function; query a single date, either "first" or "last" which will
            // be the first or last available dates in the entire dataset.
            function queryDate( which ) {
                return latisMavenTeam.get( 'in_situ_kp_data', 'txt', ['timetag'], [ which+'()' ] ).then(
                    function( response ) {
                        var data = String( response ).trim() + 'Z';
                        return momentStrict(data).toDate();
                    },
                    function( response ) {
                        console.warn("Error querying " + which + " available date: " + response);
                        throw response;
                    }
                )
            }

            // Register a listener to the onDatesAvailable event. If availableDates
            // is already available, listener will be called with that value after
            // a 0-length timeout (for consistency). Otherwise, listener will be
            // called with availableDates whenever they become available.
            function onDatesAvailable( listener ) {
                if( availableDates === null ) {
                    datesAvailableListeners.push( listener );
                }
                else {
                    setTimeout(
                        function() { listener(availableDates); },
                        0
                    );
                }
            }
        }
    ]
);

})();

(function() {

/**
 * kpDataProvider service
 *
 * Service returns an instance of KpDataProvider, which is a subclass
 * of AbstractDataProvider. See AbstractDataProvider for more details.
 *
 * Provides data from the server via the latisMavenTeam service.
 *
 * Provides the following methods in addition to the usual ones from
 * AbstractDataProvider:
 *
 * KpDataProvider.prototype.xyzTriple( baseName ): returns the array
 *         [ baseName+'_x', baseName+'_y', baseName+'_z' ]
 *         which is a pattern of parameter names that comes up a lot in
 *         this dataset
 *
 * KpDataProvider.prototype.getKpMatrix3Params( root ): returns an
 *         array of parameter names of the pattern
 *         [ root+'_1_1', root+'_1_2', root+'_1_3', root+'_2_1', etc]
 *         which is another pattern that comes up a lot in this dataset
 *         (i.e. 9 parameters that together form a 3x3 matrix)
 *
 * Also worth noting: the makeRequest method will tell Cesium to
 * side-load the ICRF parameters that it needs to compute ICRF
 * transformations for the requested time frame. The promise returned
 * by makeRequest will not resolve until both the ICRF data and the
 * requested data are both available.
 */
angular.module('beryllium-maven')
.service( 'kpDataProvider', [
    'latisMavenTeam',
    'AbstractDataProvider',
    '$q',
    'RequirementsManager',
    function( latisMavenTeamService, AbstractDataProvider, $q, RequirementsManager ) {

        var KpDataProvider = AbstractDataProvider.createSubclass(function() {
            AbstractDataProvider.apply( this );

            this.requirementsManager = new RequirementsManager();
        });

        KpDataProvider.prototype.makeRequest = function( ) {

            var requirements = this.requirementsManager.gatherRequirements();

            var selection = requirements.concatAll( "selection" );
            var timeframe = requirements.findFirst( "timeframe" );

            var param1d = requirements.findFirst( "selectedParam1d");
            var param3d = requirements.findFirst( "selectedParam3d");

            var startTime = timeframe.start;
            var endTime = timeframe.end;

            var julianStart = Cesium.JulianDate.fromDate( startTime );
            var julianEnd = Cesium.JulianDate.fromDate( endTime );

            var filters = [
                'time>=' + startTime.toISOString(),
                'time<=' + endTime.toISOString()
            ];

            // Start the actual request
            var dataRequest = latisMavenTeamService.get( 'in_situ_kp', 'jsond', selection, filters );

            var param1DRequest = null;
            if (param1d && param1d != "none") {
                filters = [
                    'time>=' + startTime.toISOString(),
                    'time<=' + endTime.toISOString()
                ];
                param1d = ['timetag'].concat( param1d );
                param1DRequest = latisMavenTeamService.get( 'in_situ_kp', 'jsond', param1d, filters);
            }

            var param3DRequest = null;
            if (param3d && param3d != "none") {
                 filters = [
                    'time>=' + startTime.toISOString(),
                    'time<=' + endTime.toISOString()
                ];
                param3d = ['timetag'].concat( param3d );
                param3DRequest = latisMavenTeamService.get( 'in_situ_kp', 'jsond', param3d, filters);
            }

            // Tell Cesium to preload ICRF transform data
            // for the appropriate time frame.
            //
            // Note: icrfRequest is a Cesium promise, not compatible
            // with angular ($q) promises
            var icrfRequest = Cesium.Transforms.preloadIcrfFixed(
                new Cesium.TimeInterval({
                    start: julianStart,
                    end: julianEnd
                })
            );

            // This is a hacky but reliable way to tell whether or not the
            // ICRF data has finished loading. In theory you should be able
            // to use Cesium.when( icrfRequest, success, failure ) to wait
            // for the ICRF data to load, however I've had a lot of issues
            // where that didn't work as advertised. So, I've created my own
            // polling loop to test whether the data I need is available.
            // I created another promise object that will not resolve until
            // the polling loop succeeds, and it will be combined with the
            // data request promise below.
            var icrfPromise = $q(function( resolve, reject ) {

                var toInertial = new Cesium.Matrix3();
                var startTime = new Date().getTime();
                var maxElapsedSec = 10;
                var pollInterval = 50;

                var testIcrfLoaded = function() {
                    var now = Date.now();
                    var elapsedSec = (now - startTime) / 1000;

                    if( elapsedSec > maxElapsedSec ) {
                        var msg = "Failed to load ICRF data";
                        console.error( msg );
                        reject( msg );
                        return;
                    }

                    if(Cesium.defined(
                        Cesium.Transforms.computeFixedToIcrfMatrix( julianStart, toInertial )
                    ))
                    {
                        resolve();
                    }
                    else {
                        setTimeout(
                            function() {
                                try {
                                    testIcrfLoaded();
                                }
                                catch( e ) { console.error(e); }
                            },
                            pollInterval
                        );
                    }
                };

                try {
                    testIcrfLoaded();
                }
                catch( e ) { console.error(e); }
            });

            // Listeners won't really need to see the ICRF data, but
            // we shouldn't call ourselves 'done' until that's finished
            // loading too.
            var combinedPromise = $q.all({
                dataRequest: dataRequest,
                param1D: param1DRequest,
                param3D: param3DRequest,
                icrfPromise: icrfPromise
            }).then(function( results ) {

                // Combine the separate requests back into one data block, since
                // that's what the rest of the code is expecting
                var param;
                var paramIndex;
                var paramLength;
                var dataIndex;
                var dataLength;
                var elt;
                if ( results.param1D ) {
                   param = Object.keys(results.param1D.metadata)[1];
                   // Make sure metadata and parameters list is updated
                   results.dataRequest.metadata[param] = results.param1D.metadata[param];
                   results.dataRequest.parameters.push(param);
                   paramIndex = 0;
                   paramLength = results.param1D.data.length;
                   dataLength = results.dataRequest.data.length;
                   for ( dataIndex = 0; dataIndex < dataLength; dataIndex++ ) {
                       // If the timestamps match
                       elt = results.dataRequest.data[dataIndex];
                       if ( paramIndex < paramLength && elt[0] == results.param1D.data[paramIndex][0] ) {
                            elt.push(results.param1D.data[paramIndex][1]);
                            paramIndex += 1;
                       }
                       // Since we have "columned" data, need to put something
                       // there or we'll have inconsistent rows
                       else elt.push(null);
                   }
                }

                if ( results.param3D ) {
                    param = Object.keys(results.param3D.metadata)
                    for ( paramIndex = 1; paramIndex < 4; paramIndex++ ) {
                        var paramID = param[paramIndex];
                        //Whiskers have 3 parameters to them, so make sure we have them all
                        //in the metadata/params list
                        results.dataRequest.metadata[paramID] = results.param3D.metadata[paramID];
                        results.dataRequest.parameters.push(paramID);
                    }
                    paramLength = results.param3D.data.length;
                    paramIndex = 0;
                    dataLength = results.dataRequest.data.length;
                    for ( dataIndex = 0; dataIndex < dataLength; dataIndex++ ) {
                        elt = results.dataRequest.data[dataIndex];
                        // If the timestamps match
                        if ( paramIndex < paramLength && elt[0] == results.param3D.data[paramIndex][0] ) {
                            results.dataRequest.data[dataIndex] = elt.concat( results.param3D.data[paramIndex].slice(1, 4) );
                            paramIndex += 1;
                        }
                        else {
                            //Since we have "columned" data, need to have something in
                            //those columns
                            elt.push(null, null, null);
                        }
                    }
                }

                return results.dataRequest; // only show listeners the data from dataRequest
            });

            // If the dataRequest is abortable, make this promise abortable as well.
            // The dataRequest may not be abortable if the requested data is already
            // cached.
            if( dataRequest.abort ||
                (param1DRequest && param1DRequest.abort) ||
                (param3DRequest && param3DRequest.abort)){
                combinedPromise.abort = function() {
                    dataRequest.abort();
                    if (param1DRequest) { param1DRequest.abort(); }
                    if (param3DRequest) { param3DRequest.abort(); }
                }
            }

            return combinedPromise;
        };

        // Public helper function:
        // Generate parameter triples that follow
        // the [a_x,a_y,a_z] pattern
        KpDataProvider.prototype.xyzTriple = function( baseName ) {
            return [
                baseName + '_x',
                baseName + '_y',
                baseName + '_z'
            ];
        };

        // Public helper function
        // Compute the names of the parameters for a 3x3
        // matrix as returned by our latis server
        //
        // E.g. getKpMatrix3Params('foo') returns
        // ['foo_1_1', 'foo_1_2', 'foo_1_3', 'foo_2_1', etc]
        KpDataProvider.prototype.getKpMatrix3Params = function( root ) {
            var result = [];
            for( var row=1; row<4; row++ ) {
                for( var col=1; col<4; col++ ) {
                    result.push( [root, row, col].join('_') );
                }
            }
            return result;
        }

        return new KpDataProvider();
    }
]);

})();

(function() {

angular
.module("beryllium-maven")
.service("kpDataPrettifier", [
    "kpParams",
    "maven3dConstants",
    "AbstractDataTransformer",
    "kpDataProvider",
    "RequirementsManager",
    function(
        kpParams, constants, AbstractDataTransformer, kpDataProvider,
        RequirementsManager
    ) {

        // just some shorthand
        var params = kpParams.parameters;

        var KpDataPrettifier = AbstractDataTransformer.createSubclass(function() {
            AbstractDataTransformer.call( this, kpDataProvider );
            var transformer = this;

            transformer.requirementsManager = new RequirementsManager();

            kpDataProvider.requirementsManager.addRequirementsProvider(function() {
                var requirements = transformer.requirementsManager.gatherRequirements();

                // Save off selectedParam1d and selectedParam3d for our own use later
                transformer.selectedParam1d = requirements.findFirst( "selectedParam1d" );
                transformer.selectedParam3d = requirements.findFirst( "selectedParam3d" );

                var param1D = requirements.findFirst("selectedParam1d");
                var param3D = requirements.findFirst("selectedParam3d");
                param3D = constants.ORBIT_WHISKER_PARAMETERS[param3D];
                // Proxy selection and timeframe up the stack for kpDataProvider to use.
                return {
                    selection: requirements.findFirst( "selection" ),
                    timeframe: requirements.findFirst( "timeframe" ),
                    selectedParam1d: param1D,
                    selectedParam3d: param3D
                };
            });
        });

        KpDataPrettifier.prototype.transformData = function( data ) {
            var transformer = this;
            var selectedParam1d = transformer.selectedParam1d;
            var selectedParam3d = transformer.selectedParam3d;

            // Faster to get indices once, at the beginning (as opposed to
            // performing these lookups in every iteration of the coming loop)
            var latIndex = data.parameters.indexOf('spice_spacecraft_geo_latitude');
            var lngIndex = data.parameters.indexOf('spice_spacecraft_geo_longitude');
            var altIndex = data.parameters.indexOf('spice_spacecraft_altitude_w_r_t_ellipsoid');
            var subsolarLatIndex = data.parameters.indexOf('spice_subsolar_point_geo_latitude');
            var subsolarLngIndex = data.parameters.indexOf('spice_subsolar_point_geo_longitude');
            var marsSunDistIndex = data.parameters.indexOf('spice_mars_sun_distance');
            var solarZenAngleIndex = data.parameters.indexOf('spice_spacecraft_solar_zenith_angle');
            var solarLngIndex = data.parameters.indexOf('spice_mars_season_ls');

            // Get groups of indicies for related parameters
            var spacecraftAttitudeIndices = getIndices( params.spacecraftAttitude );
            var spacecraftToMsoIndices = getIndices( params.spacecraftToMsoMatrix );
            var geoToMsoIndices = getIndices( params.iauToMsoMatrix );

            if( selectedParam1d !== "none" ) {
                var orbitColorParamIndex = data.parameters.indexOf( selectedParam1d );
            }
            if( selectedParam3d !== "none" ) {
                var orbitWhiskerParamIds = constants.ORBIT_WHISKER_PARAMETERS[selectedParam3d];
                var orbitWhiskersIndices = getIndices( orbitWhiskerParamIds );

                // if any were not found, mark them all as not found
                // (this should never happen)
                if( orbitWhiskersIndices.indexOf(-1) > -1 ) {
                    console.error('A whisker parameter was not found (This should be impossible...?)');
                }
            }

            // Now that we've looked up all of the parameter (column) indices that we'll
            // need, do the actual data transformation
            return data.data.map(function( row ) {

                var result = {
                    timestamp: row[0],
                    latitude: row[latIndex],
                    longitude: row[lngIndex],
                    height: row[altIndex] * 1000, // transform to meters (this app always tries to work in meters)
                    subLatitude: row[subsolarLatIndex],
                    subLongitude: row[subsolarLngIndex],
                    marsSunDistance: row[marsSunDistIndex] * constants.METERS_IN_AU, // transform to meters
                    zenithAngle: row[solarZenAngleIndex],
                    solarLongitude: row[solarLngIndex],

                    spacecraftAttitude: extractCartesian3FromRow(spacecraftAttitudeIndices, row),

                    geoToMso: extractMatrix3FromRow(geoToMsoIndices, row),
                    spacecraftToMso: extractMatrix3FromRow(spacecraftToMsoIndices, row)
                };

                // Note: since this is a rotation-only matrix,
                // the transpose is a faster way to compute
                // the inverse, which is what we really want.
                result.msoToGeo = Cesium.Matrix3.transpose(result.geoToMso, new Cesium.Matrix3());

                result.spacecraftToGeo = Cesium.Matrix3.multiply(
                    result.msoToGeo,
                    result.spacecraftToMso,
                    new Cesium.Matrix3()
                );

                if( selectedParam1d !== "none" && orbitColorParamIndex > -1 ) {
                    result.orbitColorParam = row[orbitColorParamIndex];
                }

                if( selectedParam3d !== "none" && orbitWhiskersIndices[0] > -1 ) {
                    var orbitWhiskersMso = extractCartesian3FromRow( orbitWhiskersIndices, row );

                    result.orbitWhiskersGeo = (typeof orbitWhiskersMso === "undefined")
                        ? undefined
                        : Cesium.Matrix3.multiplyByVector(
                            result.msoToGeo,
                            orbitWhiskersMso,
                            new Cesium.Cartesian3()
                        );
                }
                return result;
            });

            // For each element in params, find the index of
            // that item in data.parameters. Return all indices in
            // an array according to their order in params.
            // If any element of params is not found, all
            // indices will be -1.
            function getIndices(params) {
                var result = params.map(function(param) {
                    return data.parameters.indexOf(param);
                });
                if( result.indexOf(-1) > -1 ) {
                    // If we don't find one of the params, pretend
                    // like we didn't find any of them.
                    result = params.map(function(param) { return -1; });
                }
                return result;
            }
        };

        return new KpDataPrettifier();
    }
]);

// Return false if any argument is undefined, NaN,
// or null, else true.
function isValid() {
    for( var i=0; i<arguments.length; i++ ) {
        var arg = arguments[i];
        if(
            typeof arg === 'undefined' ||
            isNaN(arg) ||
            arg === null
        )
        {
            return false;
        }
    }
    return true;
}

// Given an ordered set of indices representing the
// location of parameters for a 3x3 matrix, return
// a Cesium.Matrix3 created by pulling those indices
// from the passed row.
function extractMatrix3FromRow(indices, row) {
    if( indices[0] === -1 ) {
        return undefined;
    }
    return Cesium.Matrix3.fromRowMajorArray(
        indices.map(function(index) {
            return row[index];
        })
    );
}

// Given an ordered set of indices representing the
// location of parameters for a 3d vector, return
// a Cesium.Cartesian3 created by pulling those indices
// from the passed row.
function extractCartesian3FromRow(indices, row) {
    if( indices[0] === -1 ) {
        return undefined;
    }

    var x = row[indices[0]];
    var y = row[indices[1]];
    var z = row[indices[2]];
    if( !isValid( x,y,z ) ) {
        return undefined;
    }

    return new Cesium.Cartesian3( x,y,z );
}

})();

(function() {

angular
.module("beryllium-maven")
.service("kpDataTransformer", [
    'AbstractDataTransformer',
    'maven3dConstants',
    'kpParams',
    'kpDataPrettifier',
    'RequirementsManager',
    'berylliumColors',
    function(
        AbstractDataTransformer, constants, kpParams, kpDataPrettifier,
        RequirementsManager, berylliumColors
    ) {

        // Copy in some constants from kpParams
        var DEFAULT_ORBIT_COLOR = kpParams.DEFAULT_ORBIT_COLOR;
        var ORBIT_PATH_FILTER_AMOUNT = kpParams.ORBIT_PATH_FILTER_AMOUNT;
        var ORBIT_WHISKERS_FILTER_AMOUNT = kpParams.ORBIT_WHISKERS_FILTER_AMOUNT;
        var THRESHOLD_HEIGHT_METERS = kpParams.THRESHOLD_HEIGHT_METERS;
        var WHISKER_MAX_LENGTH = kpParams.WHISKER_MAX_LENGTH;

        var KpDataTransformer = AbstractDataTransformer.createSubclass(function() {
            AbstractDataTransformer.call( this, kpDataPrettifier );
            var transformer = this;

            transformer.requirementsManager = new RequirementsManager();

            kpDataPrettifier.requirementsManager.addRequirementsProvider(function() {
                // Ask all registered requirementsProviders for their current
                // requirements.
                var requirements = transformer.requirementsManager.gatherRequirements();

                // Save the requirements values on 'this' for use later in transformData
                transformer.isInertial = requirements.findFirst( "isInertial" );

                // Start with baseSelection as our selection and add parameters
                // for selectedParam1d and selectedParam3d, if relevant.
                var selectedParam1d = requirements.findFirst( "selectedParam1d" );
                var selectedParam3d = requirements.findFirst( "selectedParam3d" );
                var selection = [].concat( kpParams.parameters.baseSelection );

                // Pass our summarized requirements up the chain to kpDataPrettifier
                return {
                    selection: selection,
                    timeframe: requirements.findFirst( "timeframe" ),
                    selectedParam1d: selectedParam1d,
                    selectedParam3d: selectedParam3d
                }
            })
        });

        KpDataTransformer.prototype.transformData = function( data ) {
            var transformer = this;
            var isInertial = transformer.isInertial;

            var doOrbitColor = data.length > 0 && data[0].hasOwnProperty("orbitColorParam");
            if( doOrbitColor ) {
                // 1. Search through the available color values to
                //        find the min and max values
                // 2. Create an interpolateColor function that
                //        accepts a value between min and max
                //        and returns an appropriate color
                var orbitPathColormap = berylliumColors.DEFAULT;
                var minMax = findMinMax( data.map(function(datum) { return datum.orbitColorParam; }) );
                var minOrbitColorParam = minMax.min;
                var maxOrbitColorParam = minMax.max;
                var interpolateColor = function(val) {
                    return berylliumColors.interpolate(val, minOrbitColorParam, maxOrbitColorParam, orbitPathColormap);
                }
            }

            var doOrbitWhiskers = data.length > 0 && data[0].hasOwnProperty("orbitWhiskersGeo");
            if( doOrbitWhiskers ) {
                // 1. Search through all of the available whiskers to find
                //        the min and max magnitude
                // 2. Create functions interpolateWhiskerLength and
                //        interpolateWhiskerColor to control how whiskers
                //        are rendered
                var whiskerColormap = berylliumColors.DEFAULT;
                var minMax = findMinMax(
                    data
                        .map(function( datum ) { return datum.orbitWhiskersGeo; })
                        .filter(function( orbitWhiskersGeo ) { return typeof orbitWhiskersGeo !== 'undefined'; })
                        .map(function( orbitWhiskersGeo ) { return Cesium.Cartesian3.magnitude( orbitWhiskersGeo ); })
                );
                var minWhiskerMagnitude = minMax.min;
                var maxWhiskerMagnitude = minMax.max;
                var interpolateWhiskerLength = function( magnitude, whiskerVector, result ) {
                    if( magnitude === 0 ) {
                        return Cesium.Cartesian3.clone( whiskerVector, result );
                    }
                    else {
                        // interpolate to range 0-1
                        var interpolatedMagnitude =
                            (magnitude - minWhiskerMagnitude) /
                            (maxWhiskerMagnitude - minWhiskerMagnitude);

                        // scale to range 0-WHISKER_MAX_LENGTH
                        interpolatedMagnitude *= WHISKER_MAX_LENGTH;

                        // set result so that it is whiskerVector scaled
                        // to have length interpolatedMagnitude
                        return Cesium.Cartesian3.multiplyByScalar( whiskerVector, interpolatedMagnitude/magnitude, result );
                    }
                }
                var interpolateWhiskerColor = function(magnitude) {
                    return berylliumColors.interpolate( magnitude, minWhiskerMagnitude, maxWhiskerMagnitude, whiskerColormap );
                }
            }

            // If we're in an inertial frame, orbitPosition has to be instantiated
            // differently. We'll also need to populate orbitPositionsArray and
            // orbitColors for orbitPathPrimitive, since Primitives are initialized
            // differently than Entities
            var orbitPosition = isInertial
                ? new Cesium.SampledPositionProperty(Cesium.ReferenceFrame.INERTIAL)
                : new Cesium.SampledPositionProperty();
            var orbitPositionArray = [];
            var orbitColors = [];

            // Various properties to be populated with data
            var groundTrackPosition = new Cesium.SampledPositionProperty();
            var subSolarTrackPosition = new Cesium.SampledPositionProperty();
            var nightsideCenterTrackPosition = new Cesium.SampledPositionProperty();
            var solarTrackPosition = new Cesium.SampledPositionProperty();
            var solarZenithAngle = new Cesium.SampledProperty(Number);
            var solarLongitude = new Cesium.SampledProperty(Number);
            var spacecraftOrientation = new Cesium.SampledProperty(Cesium.Quaternion);

            if( doOrbitColor ) {
                var orbitColorProperty = new Cesium.SampledProperty(Number);
            }

            if( doOrbitWhiskers ) {
                var whiskersPolylines = [];
            }

            if( isInertial ) {
                // just a scratch matrix for later
                var toInertial = new Cesium.Matrix3();
            }

            // Just some counters so we can output some basic
            // stats to the console.
            var orbitPathVertexCount = 0;
            var orbitWhiskerCount = 0;
            var ltThresholdCount = 0;
            var gtThresholdCount = 0;

            // The index of the current whisker, including
            // ones that we've filtered out (but not whiskers
            // that were missing from the data)
            var orbitWhiskerIndex = 0;

            // Iterate over the data, pull out the items we need, and
            // use those to populate the arrays and Properties that
            // our Primitives and Entities will need later.
            data.forEach(function( datum, index ) {

                // Note: we have to be sure to include the last datum
                // so that our data spans the entire time range. If we
                // don't, the Property will return undefined for values
                // outside of its min/max time range, which will cause
                // errors in the renderer.
                var isLastDatum = index === data.length - 1;
                var applyOrbitFilter =
                    index % ORBIT_PATH_FILTER_AMOUNT === 0 ||
                    isLastDatum;
                var applyWhiskerFilter = orbitWhiskerIndex % ORBIT_WHISKERS_FILTER_AMOUNT === 0;

                // Note: we should only worry about THRESHOLD_HEIGHT_METERS if
                // we're rendering colors onto the orbit line. You can't
                // really tell that we're downsampling just by looking at
                // the shape of the line, but you can easily tell once
                // we add color data to it.
                var isBelowThresholdHeight = doOrbitColor && datum.height < THRESHOLD_HEIGHT_METERS;
                if( isBelowThresholdHeight ) {
                    ltThresholdCount++;
                }
                else {
                    gtThresholdCount++;
                }

                var julianDate = Cesium.JulianDate.fromDate(
                    new Date( datum.timestamp )
                );

                var orbitPos = Cesium.Cartesian3.fromDegrees(
                    datum.longitude,
                    datum.latitude,
                    datum.height,
                    constants.MARSIAU2000
                );

                // Make our own copy of orbitWhiskersGeo
                var orbitWhiskersGeo = undefined;
                if( datum.orbitWhiskersGeo ) {
                    orbitWhiskersGeo = datum.orbitWhiskersGeo.clone(new Cesium.Cartesian3());
                }

                if( isInertial ) {
                    // If we're in an inertial frame of reference, attempt to
                    // transform orbitPos to that frame. This may fail if
                    // Cesium has not loaded the necessary ICRF data yet
                    if(Cesium.defined(
                        Cesium.Transforms.computeFixedToIcrfMatrix( julianDate, toInertial )
                    ))
                    {
                        Cesium.Matrix3.multiplyByVector(toInertial, orbitPos, orbitPos);

                        if( doOrbitWhiskers && orbitWhiskersGeo ) {
                            Cesium.Matrix3.multiplyByVector(toInertial, orbitWhiskersGeo, orbitWhiskersGeo);
                        }
                    }
                    else {
                        // This should never happen anymore, because we preload the ICRF data
                        // at the same time as we load the KP data. The KP data's promise
                        // should not resolve until the Icrf data has also loaded, which means
                        // we should be guaranteed to have the Icrf data by the time we get
                        // here. Still, better safe than sorry.
                        console.error("Failed to compute Icrf matrix, using IDENTITY");
                    }
                }

                var sunPos = Cesium.Cartesian3.fromDegrees(
                    datum.subLongitude,
                    datum.subLatitude,
                    datum.marsSunDistance
                );

                var groundPos = constants.MARSIAU2000.cartographicToCartesian(
                    Cesium.Cartographic.fromDegrees(
                        datum.longitude,
                        datum.latitude,
                        10 // some minimal height to keep this point off the ground
                    )
                );

                var subSolarGroundPos = constants.MARSIAU2000.cartographicToCartesian(
                    Cesium.Cartographic.fromDegrees(
                        datum.subLongitude,
                        datum.subLatitude,
                        11 // some minimal height to keep this point off the ground
                    )
                );

                var spacecraftOrient = Cesium.Quaternion.fromRotationMatrix(datum.spacecraftToGeo);
                Cesium.Quaternion.multiply(spacecraftOrient, constants.MODEL_AXIS_CORRECTION, spacecraftOrient);

                solarZenithAngle.addSample( julianDate, datum.zenithAngle );
                solarLongitude.addSample( julianDate, datum.solarLongitude );
                subSolarTrackPosition.addSample( julianDate, subSolarGroundPos);
                solarTrackPosition.addSample( julianDate, sunPos);
                spacecraftOrientation.addSample( julianDate, spacecraftOrient);

                // Polylines cause a lot of CPU strain (apparently) so only
                // add samples if our filter allows it, or if we're below
                // THRESHOLD_HEIGHT_METERS
                if( applyOrbitFilter || isBelowThresholdHeight ) {
                    orbitPathVertexCount++;

                    orbitPosition.addSample( julianDate, orbitPos );
                    orbitPositionArray.push( orbitPos );

                    if( doOrbitColor ) {
                        var colorVal = datum.orbitColorParam;
                        if( colorVal === null ) { colorVal = Number.NaN; }
                        orbitColors.push(
                            interpolateColor( colorVal )
                        );
                    }
                    else {
                        orbitColors.push(DEFAULT_ORBIT_COLOR);
                    }
                }

                // The ground track looks fine without a ton of resolution,
                // so we only need to respect the orbit filter and not
                // the THRESHOLD_HEIGHT_METERS
                if( applyOrbitFilter ) {
                    groundTrackPosition.addSample( julianDate, groundPos );
                }

                // If appropriate, create a whisker (polyline) at the appropriate
                // position
                if(
                    doOrbitWhiskers &&
                    typeof orbitWhiskersGeo !== 'undefined' &&
                    Cesium.Cartesian3.magnitude(orbitWhiskersGeo) > 0
                ) {
                    // We need to be sure to update this variable, even if
                    // we skip this particular whisker. Otherwise we'll get
                    // stuck in a rut where we indefinitely skip all whiskers
                    orbitWhiskerIndex++;

                    if( applyWhiskerFilter ) {
                        orbitWhiskerCount++;

                        var magnitude = Cesium.Cartesian3.magnitude( orbitWhiskersGeo );

                        var endPoint = new Cesium.Cartesian3();
                        interpolateWhiskerLength( magnitude, orbitWhiskersGeo, endPoint );
                        Cesium.Cartesian3.add(orbitPos, endPoint, endPoint);

                        var color = interpolateWhiskerColor(magnitude).withAlpha(0.25);

                        whiskersPolylines.push({
                            positions: [
                                orbitPos,
                                endPoint
                            ],
                            colors: [
                                color,
                                color
                            ],
                            width: 1,
                            followSurface: false,
                            ellipsoid: constants.MARSIAU2000
                        });
                    }
                }
            });

            // console.log("Orbit path vertex count: " + orbitPathVertexCount);
            // console.log("<" + (THRESHOLD_HEIGHT_METERS/1000) + "km: " + ltThresholdCount);
            // console.log(">" + (THRESHOLD_HEIGHT_METERS/1000) + "km: " + gtThresholdCount);
            // console.log("Orbit whisker count: " + orbitWhiskerCount);

            var result = {
                orbitPosition: orbitPosition,
                orbitPositionArray: orbitPositionArray,
                orbitColorsArray: orbitColors,
                groundTrackPosition: groundTrackPosition,
                subSolarTrackPosition: subSolarTrackPosition,
                nightsideCenterTrackPosition: nightsideCenterTrackPosition,
                solarTrackPosition: solarTrackPosition,
                solarZenithAngle: solarZenithAngle,
                solarLongitude: solarLongitude,
                spacecraftOrientation: spacecraftOrientation
            };

            if (doOrbitColor) {
                result.orbitPathColormap = orbitPathColormap;
                result.minOrbitColorParam = minOrbitColorParam;
                result.maxOrbitColorParam = maxOrbitColorParam;
            }

            if( doOrbitWhiskers ) {
                result.whiskerColormap = whiskerColormap;
                result.whiskersPolylines = whiskersPolylines;
                result.minWhiskerMagnitude = minWhiskerMagnitude;
                result.maxWhiskerMagnitude = maxWhiskerMagnitude;
            }

            // Add dates to the result that represent the actual date range
            // we received from the server.
            result.dataStartDate = new Date( data[0].timestamp );
            result.dataEndDate = new Date( data[data.length-1].timestamp );

            return result;
        };

        return new KpDataTransformer();

    }
]);

// Find the min and max values of the passed array in
// a single pass. Return an object of the form
// { min: Number, max: Number }
//
// Some filtering is done to remove undefined, null,
// and NaN values. If no values are left after the
// filtering, the returned value is { min: NaN, max: NaN }
function findMinMax(array) {
    var initial = {
        min: Number.MAX_VALUE,
        max: -Number.MAX_VALUE
    };

    var minMax = array.reduce(
        function( prev, cur ) {
            if( typeof cur !== 'number' || isNaN(cur) ) {
                return prev;
            }
            return {
                min: Math.min( prev.min, cur ),
                max: Math.max( prev.max, cur )
            }
        },
        initial
    );

    return (minMax === initial
        ? { min: Number.NaN, max: Number.NaN }
        : minMax
    );
}

})();

(function() {

/**
 * kpParams service
 *
 * Similar to the constants service, this service provides access to
 * sundry constant values that are useful to the kpDataTransformer
 * service.
 */
angular
.module("beryllium-maven")
.service("kpParams", [
    "kpDataProvider",
    "berylliumColors",
    function( kpDataProvider, berylliumColors ) {

        // The default color to use for the orbit path
        var DEFAULT_ORBIT_COLOR = berylliumColors.MISSING_VALUE_COLOR;

        // Include all samples below THRESHOLD_HEIGHT_METERS,
        // regardless of ORBIT_PATH_FILTER_AMOUNT
        // (does not apply to whiskers)
        //
        // Note that 500km is a value taken from the
        // KP data files themselves - it is the
        // elevation at which the sampling cadence
        // changes from 4sec (below) to 8sec (above)
        var THRESHOLD_HEIGHT_METERS = 500000;

        // The longest whisker we show will be this long.
        // All other whiskers will have a length somewhere
        // between this value and 0.
        var WHISKER_MAX_LENGTH = 10000000; // unit = meters

        // Various groups of parameters that need to be requested with
        // every request
        var SPACECRAFT_TO_MSO_MATRIX_PARAMS = kpDataProvider.getKpMatrix3Params('spice_rotation_matrix_maven_spacecraft_maven_mso');
        var IAU_TO_MSO_MATRIX_PARAMS = kpDataProvider.getKpMatrix3Params('spice_rotation_matrix_iau_mars_maven_mso');
        var SPACECRAFT_ATTITUDE = kpDataProvider.xyzTriple('spice_spacecraft_attitude_geo');

        // These are some of the parameters that need to be requested with every
        // request. They will be combined with various other groups of parameters
        // (vectors, matrices, etc) to form baseSelection, which is the complete
        // set of always-required parameters.
        var manualSelection = [
            'timetag',
            'spice_spacecraft_local_time',
            'spice_spacecraft_geo_latitude',
            'spice_spacecraft_geo_longitude',
            'spice_spacecraft_altitude_w_r_t_ellipsoid',
            'spice_subsolar_point_geo_latitude',
            'spice_subsolar_point_geo_longitude',
            'spice_mars_sun_distance',
            'spice_spacecraft_solar_zenith_angle',
            'spice_mars_season_ls'
        ];

        return {

            // The default color to use for the orbit path
            DEFAULT_ORBIT_COLOR: DEFAULT_ORBIT_COLOR,

            // Filter our samples so that only
            // one-in-AMOUNT is actually displayed
            ORBIT_PATH_FILTER_AMOUNT: 30,
            ORBIT_WHISKERS_FILTER_AMOUNT: 10,

            THRESHOLD_HEIGHT_METERS: THRESHOLD_HEIGHT_METERS,
            WHISKER_MAX_LENGTH: WHISKER_MAX_LENGTH,

            parameters: {
                manual: manualSelection,
                spacecraftAttitude: SPACECRAFT_ATTITUDE,
                spacecraftToMsoMatrix: SPACECRAFT_TO_MSO_MATRIX_PARAMS,
                iauToMsoMatrix: IAU_TO_MSO_MATRIX_PARAMS,

                // Always request these parameters. If Consumer requirements dictate,
                // we can add more parameters to these on a per-request basis,
                // but these must always be present.
                baseSelection: [].concat(
                    manualSelection,
                    SPACECRAFT_ATTITUDE,
                    SPACECRAFT_TO_MSO_MATRIX_PARAMS,
                    IAU_TO_MSO_MATRIX_PARAMS
                )
            }
        };
    }
]);

})();

(function() {

/**
 * kpMetadata service
 *
 * Requests metadata from the server about the parameters available
 * in the KP dataset.
 */
angular
.module("beryllium-maven")
.service("kpMetadata", [
    "latisMavenTeam",
    function( latisMavenTeamService ) {

        return { getMetadata: getMetadata };

        function getMetadata() {
            return latisMavenTeamService.get(
                "in_situ_kp_query_parameters",
                "jsond",
                [],
                ["kp_column_name!=Quality", "kp_column_name!=Precision"]
            )
            .then(function( data ) {
                return data.data.map(function( row ) {
                    var result = {};
                    data.parameters.forEach(function( paramName, index ) {
                        result[paramName] = row[index];
                    });
                    return result;
                });
            });
        }
    }
]);

})();

(function() {

/**
 *
 * latisMavenTeam service
 *
 * Provides a common access point for requesting data
 * from the latis-maven-team or latis-maven-public
 * server. Returns an instance of the Latis class
 * from the beryllium module.
 *
 * Most of the logic in this module is devoted to inspecting
 * the current environment and determining what the appropriate
 * root url should be.
 */
angular.module('beryllium-maven').service(
    'latisMavenTeam',
    [
        '$location',
        'requestCacher',
        'Latis',
        function( $location, requestCacher, Latis ) {

            var host = $location.host();
            var path = $location.path();

            var dataServer = 'https://lasp.colorado.edu';

			     var dataPath = PATH_PUBLIC;

            var DATA_ROOT = dataServer + dataPath;

            return new Latis( DATA_ROOT );
        }
    ]
);

var PATH_PUBLIC = '/maven/sdc/public/latis/dap/';

})();

(function() {

/**
 * layers service
 *
 * Create several Mars-specific imagery layers and
 * terrain layers for Cesium to use.
 *
 * imageryViewModels: array of ProviderViewModel instances. Available
 *         instances are "Viking", "MOLA", and "MOLA-SR".
 * terrainViewModels: array of ProviderViewModel instances. Available
 *         instances are "MARSIAU2000"
 * get( key ): returns an instance of imageryViewModels by name
 * getTerrain( key ): returns an instance of terrainViewModels by name
 */
angular
.module('beryllium-maven')
.service('layers', [
    'maven3dConstants',
    function( constants ) {

        var IMAGERY_SERVER ='https://lasp.colorado.edu/media/projects/tms_trees/';

        var imageryViewModels = [

            new Cesium.ProviderViewModel({
                name: 'Viking',
                iconUrl: 'img/VikingThumb.png',
                tooltip: 'Viking true-ish color (http://www.mars.asu.edu/data/mdim_color/)',
                creationFunction: function() {
                    return Cesium.createTileMapServiceImageryProvider({
                        url: IMAGERY_SERVER + 'mars-viking',
                        fileExtension: 'png',
                        minimumLevel: 0,
                        maximumLevel: 5,
                        flipXY: true
                    });
                }
            }),

            new Cesium.ProviderViewModel({
                name: 'MOLA',
                iconUrl: 'img/MolaThumb.png',
                tooltip: 'MOLA Color Height Map (http://www.mars.asu.edu/data/mdim_color/)',
                creationFunction: function() {
                    return Cesium.createTileMapServiceImageryProvider({
                        url: IMAGERY_SERVER + 'mars-mola',
                        fileExtension: 'png',
                        minimumLevel: 0,
                        maximumLevel: 7,
                        flipXY: true
                    });
                }
            }),

            new Cesium.ProviderViewModel({
                name: 'MOLA-SR',
                iconUrl: 'img/MolaSrThumb.png',
                tooltip: 'MOLA Shaded Relief Map (http://www.mars.asu.edu/data/molasr/)',
                creationFunction: function() {
                    return Cesium.createTileMapServiceImageryProvider({
                        url: IMAGERY_SERVER + 'mars-mola-sr',
                        fileExtension: 'png',
                        minimumLevel: 0,
                        maximumLevel: 5,
                        flipXY: true
                    });
                }
            })
        ];

        var terrainViewModels = [
            new Cesium.ProviderViewModel({
                name: "MARSIAU2000",
                tooltip: "Mars IAU 2000",
                iconUrl: "img/Ellipsoid.png",
                creationFunction: function() {
                    return new Cesium.EllipsoidTerrainProvider({ ellipsoid: constants.MARSIAU2000 });
                }
            })
        ];

        var layerLookup = {};
        imageryViewModels.forEach( function( viewModel ) {
            layerLookup[viewModel.name] = viewModel;
        });

        var terrainLookup = {};
        terrainViewModels.forEach( function( viewModel ) {
            terrainLookup[viewModel.name] = viewModel;
        });

        return {
            imageryViewModels: imageryViewModels,
            terrainViewModels: terrainViewModels,
            get: function( key ) {
                return layerLookup[key];
            },
            getTerrain: function( key ) {
                return terrainLookup[key];
            }
        }


    }
]);

})();

(function() {

/**
 * maven 3d constants service
 *
 * Simple service that provides access to some constant values
 * that are useful in various places around the app. This is a general
 * holding area for "magic numbers", "magic strings" and other constant
 * values, especially ones that are used in multiple locations.
 */
angular.module('beryllium-maven').service(
    'maven3dConstants',
    [
        function() {

            function xyzTriple(baseName) {
                return [
                    baseName + '_x',
                    baseName + '_y',
                    baseName + '_z'
                ];
            }

            // These are axis-correction rotations to account for the fact
            // that our model's x/y/z axis do not match our data's x/y/z
            // axis
            var axisCorrection1 = Cesium.Quaternion.fromAxisAngle(
                new Cesium.Cartesian3(1, 0, 0),
                Cesium.Math.toRadians(-90)
            );
            var axisCorrection2 = Cesium.Quaternion.fromAxisAngle(
                new Cesium.Cartesian3(0, 0, 1),
                Cesium.Math.toRadians(90)
            );
            var axisCorrection = Cesium.Quaternion.multiply(axisCorrection2, axisCorrection1, new Cesium.Quaternion());

            return {

                TIME_FORMAT: 'YYYY-MM-DD HH:mm:ss',

                EARTH_RADIUS_METERS: 6371000,
                MARS_RADIUS_METERS:  3396000,
                MARS_CIRCUMFERENCE_METERS: 21330000,
                EARTH_MARS_RADII_DIFFERENCE_METERS: 2975000,

                MAX_MARS_SUN_DISTANCE_METERS: 2.5e11,

                METERS_IN_AU: 1.4960e11,

                MARSIAU2000: new Cesium.Ellipsoid(3396000.0, 3396000.0, 3396000.0),

                ORBIT_COLOR_PARAMETERS: [
                    'ngims_ar_density',
                    'ngims_co2_density',
                    'ngims_co_density',
                    'ngims_he_density'
                ],

                ORBIT_WHISKER_PARAMETERS: {
                    'Magnetic Field': xyzTriple('mag_magnetic_field_mso'),
                    'SWIA H+ Flow Velocity': xyzTriple('swia_hplus_flow_velocity_mso'),
                    'STATIC O2+ Flow Velocity': xyzTriple('static_o2plus_flow_velocity_mso'),
                    'STATIC H+ Characteristic Direction': xyzTriple('static_hplus_characteristic_direction_mso'),
                    'STATIC Dominant Pickup Ion Characteristic Direction': xyzTriple('static_dominant_pickup_ion_characteristic_direction_mso')
                },

                MGITM_PARAMETERS: [
                    "o2plus",
                    "oplus",
                    "co2plus",
                    "n_e",
                    "co2",
                    "co",
                    "n2",
                    "o2",
                    "o",
                    "Zonal_vel",
                    "Merid_vel",
                    "Vert_vel",
                    "Temp_tn",
                    "Temp_ti",
                    "Temp_te"
                ],

                MODEL_AXIS_CORRECTION: axisCorrection
            };
        }
    ]
);

})();

(function() {

// DataTransformer for various M-GITM components. Extracts data from
// the mgitmDataProvider and uses the kpDataTransformer to align itself
angular
.module("beryllium-maven")
.service("mgitmDataTransformer", [
    "AbstractDataTransformer",
    "mgitmDataProvider",
    "berylliumColors",
    "kpDataTransformer",
    "maven3dConstants",
    "CallbackPositionProperty",
    "RequirementsManager",
    function(
        AbstractDataTransformer, mgitmDataProvider, berylliumColors,
        kpDataTransformer, constants, CallbackPositionProperty,
        RequirementsManager
    ) {

        // We'll need the subsolar point location in order to compute the
        // correct rotation for our data (need to align our data's subsolar
        // point to the current subsolar point).
        //
        // Note: at the moment both kpDataTransformer and mgitmDataTransformer
        // are singletons, so we don't have to worry about sharing this property
        // between instances of mgitmDataTransformer.
        var subSolarTrackPosition;

        var MgitmDataTransformer = AbstractDataTransformer.createSubclass(function() {
            AbstractDataTransformer.call( this, mgitmDataProvider );

            var transformer = this;
            transformer.requirementsManager = new RequirementsManager();

            mgitmDataProvider.requirementsManager.addRequirementsProvider(function() {
                var requirements = transformer.requirementsManager.gatherRequirements();

                // Save this off for use in transformData
                transformer.requirements = {
                    parameter: requirements.findFirst("parameter"),
                    displayType: requirements.findFirst("displayType"),
                    solarFlux: requirements.findFirst("solarFlux"),
                    solarLongitude: requirements.findFirst("solarLongitude"),
                    altitude: requirements.findFirst("altitude")
                };

                return transformer.requirements;
            });

            kpDataTransformer.dataReady.addEventListener(function( properties ) {
                subSolarTrackPosition = properties.subSolarTrackPosition;

                // Our properties will have to be recalculated, so pretend like we
                // just got new data from the mgitmDataProvider in order to trigger
                // that process.
                if( this.cachedData ) {
                    this.onDataLoaded( this.cachedData );
                }
            });
        });

        MgitmDataTransformer.prototype.transformData = function( data ) {

            var dataTransformer = this;

            // Cache the data. This is used to spoof a "dataLoaded" event
            // later, when the KP subsolar point changes and we need to
            // recompute these properties.
            dataTransformer.cachedData = data;

            // Hack: if no data is returned, the response will (apparently)
            // not have a parameters property. This hack allows us to continue
            // "normally" and create empty properties/arrays/etc instead of
            // just failing here. Components that depend on these properties
            // can decide for themselves whether to display an empty dataset
            // or just error out.
            var parameters = data.parameters || [];

            // Data comes in indexed rows, so figure out the indexes for every
            // column we need
            var latColumnIndex = parameters.indexOf("Latitude");
            var lngColumnIndex = parameters.indexOf("Longitude")
            var dataColumnIndex = parameters.indexOf( dataTransformer.requirements.parameter );

            // Get sorted arrays of all distinct lats and lngs
            var distinctLats = getDistinctColumnVals( latColumnIndex );
            var distinctLngs = getDistinctColumnVals( lngColumnIndex );

            // bugfix: distinctLats needs to be in reverse order because positive
            // longitudes are at the top end of the planet (north pole) and that's
            // where the first elements will wind up.
            distinctLats.reverse();

            // Map each lat/lng value to its index in distinctLats/distinctLngs
            var latIndexLookup = makeIndexLookup( distinctLats );
            var lngIndexLookup = makeIndexLookup( distinctLngs );

            // Find the min/max of this dataset, and use that to create a
            // function that maps number values to color values with
            // interpolation
            var mgitmColormap = berylliumColors.DEFAULT;
            var dataMin = Number.MAX_VALUE
            var dataMax = -Number.MAX_VALUE;
            data.data.forEach(function( row ) {
                var datum = row[ dataColumnIndex ];
                if( datum < dataMin ) { dataMin = datum; }
                if( datum > dataMax ) { dataMax = datum; }
            });
            var interpolateColorFn = function( value ) {
                return berylliumColors.interpolate( value, dataMin, dataMax, mgitmColormap );
            };

            // initialize 2D array of undefined's to be populated later
            var pixelArray = distinctLats.map(function( lats ) {
                return distinctLngs.map(function( lngs ) {
                    return undefined;
                });
            });

            // Populate pixelArray with Color instances. Theoretically, this should
            // populate every cell of that 2D array.
            data.data.forEach(function( row ) {

                var lat = row[ latColumnIndex ];
                var lng = row[ lngColumnIndex ];
                var datum = row[ dataColumnIndex ];

                var latIndex = latIndexLookup[ lat ];
                var lngIndex = lngIndexLookup[ lng ];

                pixelArray[latIndex][lngIndex] = interpolateColorFn( datum );
            });

            var subsolarLatLng = mgitmDataProvider.getMgitmSubsolarPoint(
                dataTransformer.requirements.solarLongitude
            );

            // Scratch variables for computeCurrentRotation
            var scratch_kpSubsolarPoint = new Cesium.Cartesian3();
            var scratch_kpCartographic = new Cesium.Cartographic();
            var scratch_rotation1 = new Cesium.Quaternion();
            var scratch_rotation2 = new Cesium.Quaternion();
            var scratch_rotationAxis1 = new Cesium.Cartesian3();

            // Scratch variables for computeSecondRotationAxis
            var scratch_kpSubsolarPoint2 = new Cesium.Cartesian3();

            // This property computes the axis for the second rotation for
            // the mgitm-alignment rotation. The second rotation rotates
            // mgitm's subsolar point north or south to match KP's subsolar
            // point. As such, the rotation axis needs to be perpendicular
            // to the longitudinal plane that the KP subsolar point sits in.
            // The easiest way to compute this axis is to compute
            // rotationAxis = zAxis-cross-kpSubsolar
            //
            // This computation exists as its own property so that it can
            // be debugged more easily; there is some code in the
            // <mgitm-shell> component that will display the rotation axis
            // if DEBUG==true. It uses this property to do so.
            //
            // The length of this vector is theoretically not important, but
            // to allow the DEBUG display to show it more easily, we make
            // the length 2x Mars' radius.
            var secondRotationAxis = new CallbackPositionProperty( computeSecondRotationAxis , false );

            return {
                pixelArray: pixelArray,
                altitudeMeters: dataTransformer.requirements.altitude * 1000, // convert km to m
                orientation: new Cesium.CallbackProperty( computeCurrentRotation, false ),
                secondRotationAxis: secondRotationAxis,
                subsolarPoint: new Cesium.ConstantPositionProperty(
                    constants.MARSIAU2000.cartographicToCartesian(
                        Cesium.Cartographic.fromDegrees(
                            subsolarLatLng.lng,
                            subsolarLatLng.lat,
                            10
                        )
                    )
                ),
                minMgitm: dataMin,
                maxMgitm: dataMax,
                mgitmColormap: mgitmColormap
            };

            // see: secondRotationAxis property
            function computeSecondRotationAxis( time, result ) {
                result = result || new Cesium.Cartesian3();

                if( !subSolarTrackPosition ) {
                    return Cesium.Cartesian3.clone(
                        Cesium.Cartesian3.UNIT_Z,
                        result
                    )
                }

                var scratch_kpSubsolarPoint2 = subSolarTrackPosition.getValue(
                    time,
                    scratch_kpSubsolarPoint2
                );

                result = Cesium.Cartesian3.cross(
                    Cesium.Cartesian3.UNIT_Z,
                    scratch_kpSubsolarPoint2,
                    result
                );

                // Make the length 2x Mars' radius, so that the DEBUG display
                // can display it more easily.
                result = Cesium.Cartesian3.normalize( result, result );
                result.x = result.x * constants.MARS_RADIUS_METERS * 2;
                result.y = result.y * constants.MARS_RADIUS_METERS * 2;
                result.z = result.z * constants.MARS_RADIUS_METERS * 2;

                return result;
            }

            // Given the current time, compute the appropriate rotation to line up
            // the dataset's subsolar point with the current subsolar point (as
            // defined by the subSolarTrackPosition property from the kpDataTransformer)
            function computeCurrentRotation( time, result ) {

                result = result || new Cesium.Quaternion();

                // If the KP's subsolar position hasn't been loaded yet, then we can't
                // do anything. Return a dummy Quaternion so that nothing breaks - this
                // issue should resolve itself when the KP data finishes loading.
                if( !subSolarTrackPosition ) {
                    return Cesium.Quaternion.clone(
                        Cesium.Quaternion.IDENTITY,
                        result
                    );
                }

                var latlng = mgitmDataProvider.getMgitmSubsolarPoint(
                    dataTransformer.requirements.solarLongitude
                );
                var mgitmLat = latlng.lat;
                var mgitmLng = latlng.lng;

                scratch_kpSubsolarPoint = subSolarTrackPosition.getValue( time, scratch_kpSubsolarPoint );
                scratch_kpCartographic = Cesium.Cartographic.fromCartesian(
                    scratch_kpSubsolarPoint,
                    constants.MARSIAU2000,
                    scratch_kpCartographic
                );
                var kpLat = Cesium.Math.toDegrees( scratch_kpCartographic.latitude );
                var kpLng = Cesium.Math.toDegrees( scratch_kpCartographic.longitude );

                // First rotate mgitm so that its subsolar point is on the same
                // longitude line as KP's subsolar point (east-west)
                scratch_rotation1 = Cesium.Quaternion.fromAxisAngle(
                    new Cesium.Cartesian3( 0, 0, 1 ),
                    Cesium.Math.toRadians( kpLng - mgitmLng ),
                    scratch_rotation1
                );

                // Second, rotate mgitm so that its subsolar point is on the same
                // latitude as KP's subsolar point (north-south). The rotation
                // axis should be perpendicular to the longitudinal plane that
                // both points now share.
                //
                // The rotation axis is roughly Z-cross-kpSubsolarPoint, but get
                // it from the secondRotationAxis property, since that's been
                // well-tested.
                scratch_rotation2 = Cesium.Quaternion.fromAxisAngle(
                    secondRotationAxis.getValue( time, scratch_rotationAxis1 ),
                    Cesium.Math.toRadians( mgitmLat - kpLat ),
                    scratch_rotation2
                );

                return Cesium.Quaternion.multiply(
                    scratch_rotation2,
                    scratch_rotation1,
                    result
                );
            }

            // Given a column index, iterate through that column in
            // data.data and find all distinct values. Return those values
            // as an array, sorted numerically.
            function getDistinctColumnVals( columnIndex ) {
                var distinctValsObj = {};
                data.data.forEach(function( row ) {
                    var val = row[columnIndex];
                    distinctValsObj[val] = val;
                });

                var distinctVals = Object.keys( distinctValsObj ).map(function( key ) {
                    return distinctValsObj[key];
                });
                distinctVals.sort(function( a, b ) { return a-b; });

                return distinctVals;
            }

        };

        // The value of this service should be a new instance of MgitmDataTransformer
        return new MgitmDataTransformer();
    }
]);

// Given an array of distinct values, return an object that
// maps each distinct value (stringified, because all object keys are
// automatically stringified) to its index in the
// passed array. Essentially the returned object is a lookup for:
// {
//     "value": distinctVals.indexOf( value )
// }
function makeIndexLookup( distinctVals ) {
    var indexLookup = {};
    distinctVals.forEach(function( val, index ) {
        indexLookup[val] = index;
    });
    return indexLookup;
};

})();

(function() {

// DataProvider for M-GITM DataTransformers and Components
angular
.module("beryllium-maven")
.service( "mgitmDataProvider", [
    "latisMavenTeam",
    "AbstractDataProvider",
    "$http",
    "RequirementsManager",
    function( latisMavenTeam, AbstractDataProvider, $http, RequirementsManager ) {

        var MgitmDataProvider = AbstractDataProvider.createSubclass(function() {
            AbstractDataProvider.call( this );

            this.requirementsManager = new RequirementsManager();
        });

        MgitmDataProvider.prototype.makeRequest = function() {

            var requirements = this.requirementsManager.gatherRequirements();

            var parameter = requirements.findFirst( "parameter" ); // e.g. "o2plus"
            var displayType = requirements.findFirst( "displayType" ); // "shell", "plane"
            var solarFlux = requirements.findFirst( "solarFlux" );
            var solarLongitude = requirements.findFirst( "solarLongitude" );

            var filters = [
                "solar_flux=" + solarFlux,
                "solar_longitude=" + solarLongitude
            ];
            var selection;

            if( displayType === "shell" ) {
                var altitude = requirements.findFirst( "altitude" );
                filters.push( "altitude=" + altitude );
                selection = [
                    "Latitude",
                    "Longitude",
                    parameter
                ];
            }
            else if( displayType === "plane" ) {
                throw new Error( "TODO: 'displayType=plane' not implemented");
                // Check plane type: equatorial, prime meridian or terminator
            }
            else {
                throw new Error( "Programmer Error: unrecognized displayType '" + displayType + "'" );
            }

            return latisMavenTeam.get("mgitm", "jsond", selection, filters );
        };

        // These ranges were empirically collected from the available data.
        // They can be used to populate input widgets (e.g. dropdowns) in
        // the UI.
        MgitmDataProvider.prototype.distinctAltitudes = range(98.75, 251.25, 2.5); // units = km
        MgitmDataProvider.prototype.distinctLatitudes = range(-87.5, 87.5, 5.0); // units = deg
        MgitmDataProvider.prototype.distinctLongitudes = range(2.5, 357.5, 5.0); // units = deg

        // 0 = spring equinox
        // 90 = summer solstice
        // 180 = autumn equinox
        // 270 = winter solstice
        // (in the northern hemisphere)
        MgitmDataProvider.prototype.distinctSolarLongitudes = [ 0, 90, 180, 270 ];

        // Units = "Solar Flux Units" https://en.wikipedia.org/wiki/Solar_flux_unit
        // Measured at 10.7cm wavelength
        MgitmDataProvider.prototype.distinctSolarFluxes = [ 70, 130, 200 ];

        MgitmDataProvider.prototype.getMgitmSubsolarPoint = getMgitmSubsolarPoint;

        return new MgitmDataProvider();
    }
]);

// Create a "range object" from min/max/step values. The returned object
// records the min/max/step in eponymous properties, and stores the array
// of computed values in the "values" property.
function range(min, max, step) {
    var values = [];
    var x = min;
    while( x<=max ) {
        values.push(x);
        x += step;
    }
    return {
        min: min,
        max: max,
        step: step,
        values: values
    };
}

// In order to interpret the MGITM data correctly, we need to rotate it so that
// the current subsolar point aligns with the subsolar point at the time that
// the model was generated for. Getting the MGITM subsolar point is a nontrivial
// task requiring data that isn't directly available from the dataset. The
// dataset authors addressed this by including the necessary information in the
// comments of the .dat versions of the NetCDF files. Since we don't use the
// .dat files (we use .nc files which are binary) and you can't
// easily/programmatically get data from the comment section
// anyway, I've manually copied that information to this function so we can
// use it.
//
// Fortunately, only 4 dates were used for generating these datasets, and they
// correspond to the 4 LS values
// (see: MgitmDataProvider.prototype.distinctSolarLongitudes), so
// this function can be a simple lookup function.
//
// The subsolar_latitude is actually very easy to "compute" from the
// solar_longitude because our dates are equinoxes/solstices. The equinoxes
// have a subsolar_latitude of 0, and the solstice values are +/- the axial tilt
// of the planet (for Mars this is 25.19 degrees)
//
// The subsolar_longitude, however, is essentially random from our perspective
// and has to be looked up.
//
// brpu2352@macl2857 /maven/data/mod/umich/mgitm $ grep subsolar_longitude *.dat
// MGITM_LS000_F070_150901.dat:#  subsolar_longitude: +26.40 E
// MGITM_LS000_F130_150901.dat:#  subsolar_longitude: +26.40 E
// MGITM_LS000_F200_150901.dat:#  subsolar_longitude: +26.40 E
// MGITM_LS090_F070_150812.dat:#  subsolar_longitude: +11.75 E
// MGITM_LS090_F130_150811.dat:#  subsolar_longitude: +11.75 E
// MGITM_LS090_F200_150813.dat:#  subsolar_longitude: +11.75 E
// MGITM_LS180_F070_150615.dat:#  subsolar_longitude: +26.4 E
// MGITM_LS180_F130_150615.dat:#  subsolar_longitude: +26.4 E
// MGITM_LS180_F200_150615.dat:#  subsolar_longitude: +26.4 E
// MGITM_LS270_F070_150615.dat:#  subsolar_longitude: +8.06 E
// MGITM_LS270_F130_150519.dat:#  subsolar_longitude: +8.06 E
// MGITM_LS270_F200_150615.dat:#  subsolar_longitude: +8.06 E
function getMgitmSubsolarPoint( solarLongitude ) {
    var lat, lng;
    if( solarLongitude === 0 ) {
        // MGITM Results on 2002-04-17 at 20:00:00 UT.
        lat = 0;
        lng = 26.4;
    }
    else if( solarLongitude === 90 ) {
        // MGITM Results on 2002-11-01 at 02:00:00 UT.
        lat = 25.19;
        lng = 11.75;
    }
    else if( solarLongitude === 180 ) {
        // MGITM Results on 2003-05-06 at 02:00:00 UT.
        lat = 0;
        lng = 26.4;
    }
    else if( solarLongitude === 270 ) {
        // MGITM Results on 2003-09-30 at 00:00:00 UT.
        lat = -25.19;
        lng = 8.06;
    }
    else {
        throw new Error( "Programmer Error: unexpected solarLongitude: " + solarLongitude );
    }

    return {
        lat: lat,
        lng: lng
    };
}

})();

(function() {

/**
* mgitmMetadata service
*
* Requests metadata from the server about the parameters available
* in the M-GITM dataset. This is a rough work around since no
* mgitm_query_parameters file exists on the server. I just retrieve the
* first sample of data and then extract the metadata.
*/
angular
.module("beryllium-maven")
.service("mgitmMetadata", [
    "latisMavenTeam",
    function( latisMavenTeamService ) {

        return { getMetadata: getMetadata };

        function getMetadata() {
            return latisMavenTeamService.get(
                "mgitm",
                "jsond",
                [],
                ["first()"]
            )
            .then(function( data ) {
                return data.metadata
            });
        }
    }
]);

})();
angular.module('beryllium-maven').run(['$templateCache', function($templateCache) {$templateCache.put('components/appComponent/app.component.html','<cesium flex="" on-cesium-viewer-available="$ctrl.setCesiumViewer( viewer )" on-cesium-dates-changed="$ctrl.setDisplayDates( timeframe )" reference-frame="$ctrl.selectedReferenceFrame"><create-cesium initial-dates="$ctrl.displayDates"></create-cesium><side-nav-content><section class="datepicker-parent" collapse-container=""><md-toolbar><h3 class="md-toolbar-tools" layout="row">Date Range <span flex=""></span><collapse-trigger></collapse-trigger></h3></md-toolbar><collapse-target class="datepicker-parent"><md-content class="datepicker-parent" layout="column" layout-padding=""><single-date-picker available-min-date="$ctrl.availableDates.start" available-max-date="$ctrl.availableDates.end" date="$ctrl.displayDates.start" on-change="$ctrl.onDateRangeChanged(start)"></single-date-picker></md-content></collapse-target></section><section collapse-container=""><md-toolbar><h3 class="md-toolbar-tools">Maven In-Situ Data <span flex=""></span><collapse-trigger></collapse-trigger></h3></md-toolbar><collapse-target><md-content layout="column" layout-padding=""><md-input-container><label>Reference frame</label><md-select ng-model="$ctrl.selectedReferenceFrame"><md-option value="planetary">Planetary</md-option><md-option value="inertial">Inertial</md-option></md-select></md-input-container><md-input-container><label>Orbit Path Color (1D Parameters)</label><md-select ng-model="$ctrl.selectedParam1d"><md-option value="none" selected="">None</md-option><md-option ng-repeat="param in $ctrl.params1d" ng-value="param.value">{{param.display}}</md-option></md-select></md-input-container><md-input-container><label>Orbit Path \'Whiskers\' (3D Parameters)</label><md-select ng-model="$ctrl.selectedParam3d"><md-option value="none" selected="">None</md-option><md-option ng-repeat="param in $ctrl.params3d" ng-value="param.display">{{param.display}}</md-option></md-select></md-input-container><p class="disclaimer"><small>Note: Not every parameter will have data available for a given time range. This could mean that data was not collected at that time, or that the data is still being processed and will be released at a later date. The MAG data in particular has a processing delay due to the timing of calibration maneuvers.</small></p></md-content></collapse-target></section><section collapse-container=""><md-toolbar><h3 class="md-toolbar-tools">M-GITM <span flex=""></span><collapse-trigger></collapse-trigger></h3></md-toolbar><collapse-target><md-content layout="column" layout-padding=""><div><label>Modelled L<sub>S</sub>:</label> {{$ctrl.mgitmSolarLongitude}}&deg;</div><md-input-container><label>Solar Flux (10.7cm)</label><md-select ng-model="$ctrl.mgitmSolarFlux"><md-option value="70">Min (70 s.f.u.)</md-option><md-option value="130">Mean (130 s.f.u.)</md-option><md-option value="200">Max (200 s.f.u.)</md-option></md-select></md-input-container><md-input-container><label>Parameter</label><md-select ng-model="$ctrl.mgitmParameter"><md-option value="none" selected="">None</md-option><md-option ng-repeat="param in $ctrl.paramsMgitm" ng-value="param.value">{{param.display}}</md-option></md-select></md-input-container><md-input-container><label>Altitude</label><md-select ng-model="$ctrl.mgitmAltitude"><md-option ng-repeat="altitude in $ctrl.mgitmAltitudes" value="{{altitude}}">{{altitude}} km</md-option></md-select></md-input-container><md-input-container><label>Latitude (used for plotting longitude)</label><md-select ng-model="$ctrl.mgitmLatitude"><md-option ng-repeat="latitude in $ctrl.mgitmLatitudes" value="{{latitude}}">{{latitude}}</md-option></md-select></md-input-container><md-input-container><label>Longitude (used for plotting latitude)</label><md-select ng-model="$ctrl.mgitmLongitude"><md-option ng-repeat="longitude in $ctrl.mgitmLongitudes" value="{{longitude}}">{{longitude}}</md-option></md-select></md-input-container></md-content></collapse-target></section></side-nav-content><realtime-hud></realtime-hud><spacecraft-entities timeframe="$ctrl.requestedDates" show-ground-track="$ctrl.showGroundTrack" selected-param-1d="$ctrl.selectedParam1d" selected-param-3d="$ctrl.selectedParam3d"></spacecraft-entities><sun-entities show-subsolar-point="$ctrl.showSubsolarPoint"></sun-entities><mgitm-shell solar-flux="$ctrl.mgitmSolarFlux" solar-longitude="$ctrl.mgitmSolarLongitude" altitude="$ctrl.mgitmAltitude" parameter="$ctrl.mgitmParameter"></mgitm-shell><legend-content><legend show-subsolar-point="$ctrl.showSubsolarPoint" show-ground-track="$ctrl.showGroundTrack" selected-param-1d="$ctrl.selectedParam1d" selected-param-3d="$ctrl.selectedParam3d" selected-param-mgitm="$ctrl.mgitmParameter" params-1d="$ctrl.params1d" params-3d="$ctrl.params3d" params-mgitm="$ctrl.paramsMgitm"></legend></legend-content><highstock-pane-content><highstock-pane timeframe="$ctrl.requestedDates" selected-param-1d="$ctrl.selectedParam1d" selected-param-3d="$ctrl.selectedParam3d" selected-param-mgitm="$ctrl.mgitmParameter" solar-flux="$ctrl.mgitmSolarFlux" solar-longitude="$ctrl.mgitmSolarLongitude" altitude="$ctrl.mgitmAltitude" latitude="$ctrl.mgitmLatitude" longitude="$ctrl.mgitmLongitude"></highstock-pane></highstock-pane-content></cesium>');
$templateCache.put('components/highstockPaneComponent/highstockPane.component.html','<p id="instructions" ng-show="$pane.plots.length === 0"><span class="pointer">&#128072;</span> Add a plot using the controls to the left<br><span class="subtitle">Select a parameter to begin</span></p><div sv-root="" sv-part="$pane.plots" ng-if="$pane.plots.length > 0" sv-on-start="$pane.onPlotDragStart($item, $part, $index, $helper)" sv-on-stop="$pane.onPlotDragStop()"><div ng-repeat="plot in $pane.plots" sv-element="" class="plot"><div draw-plot="" plot-list="$pane.plots" menu-options="plot.menuOptions" datasets="plot.datasets" time-range="plot.timeRange" plot-obj="plot.plotObj"></div></div></div>');
$templateCache.put('components/legendComponent/legend.component.html','<ul><li><sub-solar-point><label><md-checkbox class="md-primary" ng-model="$ctrl.showSubsolarPoint">Sub-solar point <img class="legend-icon" src="img/Sun.png"></md-checkbox></label></sub-solar-point></li><li><ground-tracking><label><md-checkbox class="md-primary" ng-model="$ctrl.showGroundTrack">Ground tracking <img class="legend-icon" src="img/Track.png"></md-checkbox></label></ground-tracking></li><li ng-if="$ctrl.selectedParam1d !== \'none\'"><hr><p class="data-title">{{$ctrl.selectedParam1dDisplay ? $ctrl.selectedParam1dDisplay + \' (\' + $ctrl.selectedParam1dUnits + \')\' : "No Data"}}</p><p class="min-max">{{($ctrl.minOrbitColorParam || $ctrl.minOrbitColorParam === 0) ? $ctrl.minOrbitColorParam : "No Data" | numLen:6:2}}</p><div class="gradient-rect" ng-style="$ctrl.orbitPathGradient"></div><p class="min-max">{{($ctrl.maxOrbitColorParam || $ctrl.maxOrbitColorParam === 0) ? $ctrl.maxOrbitColorParam : "No Data" | numLen:6:2}}</p></li><li ng-if="$ctrl.selectedParam3d !== \'none\'"><hr><p class="data-title">{{$ctrl.selectedParam3dDisplay ? $ctrl.selectedParam3dDisplay + \' (\' + $ctrl.selectedParam3dUnits + \')\' : "No Data"}}</p><p class="min-max">{{($ctrl.minWhiskerMagnitude || $ctrl.minWhiskerMagnitude === 0) ? $ctrl.minWhiskerMagnitude : "No Data" | numLen:6:2}}</p><div class="gradient-rect" ng-style="$ctrl.whiskerGradient"><div class="gradient-triangle-cover"></div></div><p class="min-max">{{($ctrl.maxWhiskerMagnitude || $ctrl.maxWhiskerMagnitude === 0) ? $ctrl.maxWhiskerMagnitude : "No Data" | numLen:6:2}}</p></li><li ng-if="$ctrl.selectedParamMgitm !== \'none\'"><hr><p class="data-title">{{$ctrl.selectedParamMgitmDisplay ? $ctrl.selectedParamMgitmDisplay + \' (\' + $ctrl.selectedParamMgitmUnits + \')\' : "No Data"}}</p><p class="min-max">{{($ctrl.minMgitm || $ctrl.minMgitm === 0) ? $ctrl.minMgitm : "No Data" | numLen:6:2}}</p><div class="gradient-rect" ng-style="$ctrl.mgitmGradient"></div><p class="min-max">{{($ctrl.maxMgitm || $ctrl.maxMgitm === 0) ? $ctrl.maxMgitm : "No Data" | numLen:6:2}}</p></li></ul>');
$templateCache.put('components/realtimeHudComponent/realtimeHud.component.html','<table><tbody><tr ng-repeat="label in $ctrl.labels"><th ng-bind-html="label"></th><td ng-bind-html="$ctrl.values[$index]"></td></tr></tbody></table>');}]);