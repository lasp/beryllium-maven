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
