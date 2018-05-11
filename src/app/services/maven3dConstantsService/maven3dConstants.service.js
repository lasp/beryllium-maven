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
