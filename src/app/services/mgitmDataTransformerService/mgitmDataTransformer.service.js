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
