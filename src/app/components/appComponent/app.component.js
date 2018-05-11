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
