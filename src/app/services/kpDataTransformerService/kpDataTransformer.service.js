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
