(function() {

/**
 * kpDataProvider service
 *
 * Service returns an instance of KpDataProvider, which is a subclass
 * of AbstractDataProvider. See AbstractDataProvider for more details.
 *
 * Provides data from the server via the latisMavenTeam service.
 *
 * Provides the following methods in addition to the usual ones from
 * AbstractDataProvider:
 *
 * KpDataProvider.prototype.xyzTriple( baseName ): returns the array
 *         [ baseName+'_x', baseName+'_y', baseName+'_z' ]
 *         which is a pattern of parameter names that comes up a lot in
 *         this dataset
 *
 * KpDataProvider.prototype.getKpMatrix3Params( root ): returns an
 *         array of parameter names of the pattern
 *         [ root+'_1_1', root+'_1_2', root+'_1_3', root+'_2_1', etc]
 *         which is another pattern that comes up a lot in this dataset
 *         (i.e. 9 parameters that together form a 3x3 matrix)
 *
 * Also worth noting: the makeRequest method will tell Cesium to
 * side-load the ICRF parameters that it needs to compute ICRF
 * transformations for the requested time frame. The promise returned
 * by makeRequest will not resolve until both the ICRF data and the
 * requested data are both available.
 */
angular.module('beryllium-maven')
.service( 'kpDataProvider', [
    'latisMavenTeam',
    'AbstractDataProvider',
    '$q',
    'RequirementsManager',
    function( latisMavenTeamService, AbstractDataProvider, $q, RequirementsManager ) {

        var KpDataProvider = AbstractDataProvider.createSubclass(function() {
            AbstractDataProvider.apply( this );

            this.requirementsManager = new RequirementsManager();
        });

        KpDataProvider.prototype.makeRequest = function( ) {

            var requirements = this.requirementsManager.gatherRequirements();

            var selection = requirements.concatAll( "selection" );
            var timeframe = requirements.findFirst( "timeframe" );

            var param1d = requirements.findFirst( "selectedParam1d");
            var param3d = requirements.findFirst( "selectedParam3d");

            var startTime = timeframe.start;
            var endTime = timeframe.end;

            var julianStart = Cesium.JulianDate.fromDate( startTime );
            var julianEnd = Cesium.JulianDate.fromDate( endTime );

            var filters = [
                'time>=' + startTime.toISOString(),
                'time<=' + endTime.toISOString()
            ];

            // Start the actual request
            var dataRequest = latisMavenTeamService.get( 'in_situ_kp', 'jsond', selection, filters );

            var param1DRequest = null;
            if (param1d && param1d != "none") {
                filters = [
                    'time>=' + startTime.toISOString(),
                    'time<=' + endTime.toISOString()
                ];
                param1d = ['timetag'].concat( param1d );
                param1DRequest = latisMavenTeamService.get( 'in_situ_kp', 'jsond', param1d, filters);
            }

            var param3DRequest = null;
            if (param3d && param3d != "none") {
                 filters = [
                    'time>=' + startTime.toISOString(),
                    'time<=' + endTime.toISOString()
                ];
                param3d = ['timetag'].concat( param3d );
                param3DRequest = latisMavenTeamService.get( 'in_situ_kp', 'jsond', param3d, filters);
            }

            // Tell Cesium to preload ICRF transform data
            // for the appropriate time frame.
            //
            // Note: icrfRequest is a Cesium promise, not compatible
            // with angular ($q) promises
            var icrfRequest = Cesium.Transforms.preloadIcrfFixed(
                new Cesium.TimeInterval({
                    start: julianStart,
                    end: julianEnd
                })
            );

            // This is a hacky but reliable way to tell whether or not the
            // ICRF data has finished loading. In theory you should be able
            // to use Cesium.when( icrfRequest, success, failure ) to wait
            // for the ICRF data to load, however I've had a lot of issues
            // where that didn't work as advertised. So, I've created my own
            // polling loop to test whether the data I need is available.
            // I created another promise object that will not resolve until
            // the polling loop succeeds, and it will be combined with the
            // data request promise below.
            var icrfPromise = $q(function( resolve, reject ) {

                var toInertial = new Cesium.Matrix3();
                var startTime = new Date().getTime();
                var maxElapsedSec = 10;
                var pollInterval = 50;

                var testIcrfLoaded = function() {
                    var now = Date.now();
                    var elapsedSec = (now - startTime) / 1000;

                    if( elapsedSec > maxElapsedSec ) {
                        var msg = "Failed to load ICRF data";
                        console.error( msg );
                        reject( msg );
                        return;
                    }

                    if(Cesium.defined(
                        Cesium.Transforms.computeFixedToIcrfMatrix( julianStart, toInertial )
                    ))
                    {
                        resolve();
                    }
                    else {
                        setTimeout(
                            function() {
                                try {
                                    testIcrfLoaded();
                                }
                                catch( e ) { console.error(e); }
                            },
                            pollInterval
                        );
                    }
                };

                try {
                    testIcrfLoaded();
                }
                catch( e ) { console.error(e); }
            });

            // Listeners won't really need to see the ICRF data, but
            // we shouldn't call ourselves 'done' until that's finished
            // loading too.
            var combinedPromise = $q.all({
                dataRequest: dataRequest,
                param1D: param1DRequest,
                param3D: param3DRequest,
                icrfPromise: icrfPromise
            }).then(function( results ) {

                // Combine the separate requests back into one data block, since
                // that's what the rest of the code is expecting
                var param;
                var paramIndex;
                var paramLength;
                var dataIndex;
                var dataLength;
                var elt;
                if ( results.param1D ) {
                   param = Object.keys(results.param1D.metadata)[1];
                   // Make sure metadata and parameters list is updated
                   results.dataRequest.metadata[param] = results.param1D.metadata[param];
                   results.dataRequest.parameters.push(param);
                   paramIndex = 0;
                   paramLength = results.param1D.data.length;
                   dataLength = results.dataRequest.data.length;
                   for ( dataIndex = 0; dataIndex < dataLength; dataIndex++ ) {
                       // If the timestamps match
                       elt = results.dataRequest.data[dataIndex];
                       if ( paramIndex < paramLength && elt[0] == results.param1D.data[paramIndex][0] ) {
                            elt.push(results.param1D.data[paramIndex][1]);
                            paramIndex += 1;
                       }
                       // Since we have "columned" data, need to put something
                       // there or we'll have inconsistent rows
                       else elt.push(null);
                   }
                }

                if ( results.param3D ) {
                    param = Object.keys(results.param3D.metadata)
                    for ( paramIndex = 1; paramIndex < 4; paramIndex++ ) {
                        var paramID = param[paramIndex];
                        //Whiskers have 3 parameters to them, so make sure we have them all
                        //in the metadata/params list
                        results.dataRequest.metadata[paramID] = results.param3D.metadata[paramID];
                        results.dataRequest.parameters.push(paramID);
                    }
                    paramLength = results.param3D.data.length;
                    paramIndex = 0;
                    dataLength = results.dataRequest.data.length;
                    for ( dataIndex = 0; dataIndex < dataLength; dataIndex++ ) {
                        elt = results.dataRequest.data[dataIndex];
                        // If the timestamps match
                        if ( paramIndex < paramLength && elt[0] == results.param3D.data[paramIndex][0] ) {
                            results.dataRequest.data[dataIndex] = elt.concat( results.param3D.data[paramIndex].slice(1, 4) );
                            paramIndex += 1;
                        }
                        else {
                            //Since we have "columned" data, need to have something in
                            //those columns
                            elt.push(null, null, null);
                        }
                    }
                }

                return results.dataRequest; // only show listeners the data from dataRequest
            });

            // If the dataRequest is abortable, make this promise abortable as well.
            // The dataRequest may not be abortable if the requested data is already
            // cached.
            if( dataRequest.abort ||
                (param1DRequest && param1DRequest.abort) ||
                (param3DRequest && param3DRequest.abort)){
                combinedPromise.abort = function() {
                    dataRequest.abort();
                    if (param1DRequest) { param1DRequest.abort(); }
                    if (param3DRequest) { param3DRequest.abort(); }
                }
            }

            return combinedPromise;
        };

        // Public helper function:
        // Generate parameter triples that follow
        // the [a_x,a_y,a_z] pattern
        KpDataProvider.prototype.xyzTriple = function( baseName ) {
            return [
                baseName + '_x',
                baseName + '_y',
                baseName + '_z'
            ];
        };

        // Public helper function
        // Compute the names of the parameters for a 3x3
        // matrix as returned by our latis server
        //
        // E.g. getKpMatrix3Params('foo') returns
        // ['foo_1_1', 'foo_1_2', 'foo_1_3', 'foo_2_1', etc]
        KpDataProvider.prototype.getKpMatrix3Params = function( root ) {
            var result = [];
            for( var row=1; row<4; row++ ) {
                for( var col=1; col<4; col++ ) {
                    result.push( [root, row, col].join('_') );
                }
            }
            return result;
        }

        return new KpDataProvider();
    }
]);

})();
