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
