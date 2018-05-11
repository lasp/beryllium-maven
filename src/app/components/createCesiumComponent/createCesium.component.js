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
