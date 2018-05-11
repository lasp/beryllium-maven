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
