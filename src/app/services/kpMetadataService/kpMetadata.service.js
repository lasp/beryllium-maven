(function() {

/**
 * kpMetadata service
 *
 * Requests metadata from the server about the parameters available
 * in the KP dataset.
 */
angular
.module("beryllium-maven")
.service("kpMetadata", [
    "latisMavenTeam",
    function( latisMavenTeamService ) {

        return { getMetadata: getMetadata };

        function getMetadata() {
            return latisMavenTeamService.get(
                "in_situ_kp_query_parameters",
                "jsond",
                [],
                ["kp_column_name!=Quality", "kp_column_name!=Precision"]
            )
            .then(function( data ) {
                return data.data.map(function( row ) {
                    var result = {};
                    data.parameters.forEach(function( paramName, index ) {
                        result[paramName] = row[index];
                    });
                    return result;
                });
            });
        }
    }
]);

})();
