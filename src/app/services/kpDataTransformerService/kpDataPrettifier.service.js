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
