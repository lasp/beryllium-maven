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
