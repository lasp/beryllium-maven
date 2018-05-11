(function() {

/**
* mgitmMetadata service
*
* Requests metadata from the server about the parameters available
* in the M-GITM dataset. This is a rough work around since no
* mgitm_query_parameters file exists on the server. I just retrieve the
* first sample of data and then extract the metadata.
*/
angular
.module("beryllium-maven")
.service("mgitmMetadata", [
    "latisMavenTeam",
    function( latisMavenTeamService ) {

        return { getMetadata: getMetadata };

        function getMetadata() {
            return latisMavenTeamService.get(
                "mgitm",
                "jsond",
                [],
                ["first()"]
            )
            .then(function( data ) {
                return data.metadata
            });
        }
    }
]);

})();