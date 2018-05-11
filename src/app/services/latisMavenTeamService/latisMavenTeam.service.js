(function() {

/**
 *
 * latisMavenTeam service
 *
 * Provides a common access point for requesting data
 * from the latis-maven-team or latis-maven-public
 * server. Returns an instance of the Latis class
 * from the beryllium module.
 *
 * Most of the logic in this module is devoted to inspecting
 * the current environment and determining what the appropriate
 * root url should be.
 */
angular.module('beryllium-maven').service(
    'latisMavenTeam',
    [
        '$location',
        'requestCacher',
        'Latis',
        function( $location, requestCacher, Latis ) {

            var host = $location.host();
            var path = $location.path();

            var dataServer = 'https://lasp.colorado.edu';

			     var dataPath = PATH_PUBLIC;

            var DATA_ROOT = dataServer + dataPath;

            return new Latis( DATA_ROOT );
        }
    ]
);

var PATH_PUBLIC = '/maven/sdc/public/latis/dap/';

})();
